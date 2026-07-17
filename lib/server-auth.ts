import "server-only";

import { supabaseInsert, supabaseQuery, supabaseUpdate } from "./supabase-rest";

const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 310_000;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const SESSION_COOKIE = "center_session";

type AdminAccount = {
  id: string;
  username: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  active: boolean;
};

export type AdminSession = {
  id: string;
  username: string;
  exp: number;
};

function runtimeValue(key: "SESSION_SECRET") {
  const runtimeEnv = (globalThis as typeof globalThis & { __CENTER_RUNTIME_ENV?: Record<string, string | undefined> }).__CENTER_RUNTIME_ENV;
  return runtimeEnv?.[key] ?? process.env[key];
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new Error("Invalid password salt");
  return new Uint8Array(hex.match(/.{2}/g)?.map((value) => Number.parseInt(value, 16)) ?? []);
}

function base64UrlEncode(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return new Uint8Array(Array.from(binary, (character) => character.charCodeAt(0)));
}

async function derivePasswordHash(password: string, saltHex: string, iterations: number) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations }, material, 256);
  return bytesToHex(new Uint8Array(bits));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

export async function createPasswordRecord(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(24));
  const passwordSalt = bytesToHex(salt);
  return {
    password_hash: await derivePasswordHash(password, passwordSalt, PASSWORD_ITERATIONS),
    password_salt: passwordSalt,
    password_iterations: PASSWORD_ITERATIONS,
  };
}

export async function authenticateAdmin(username: string, password: string) {
  let accounts = await supabaseQuery<AdminAccount>("admin_accounts", {
    select: "id,username,password_hash,password_salt,password_iterations,active",
    username: `eq.${username}`,
    limit: 1,
  });

  // First-run bootstrap. The default is accepted only while the table has no account.
  if (!accounts.length) {
    const existing = await supabaseQuery<AdminAccount>("admin_accounts", { select: "id", limit: 1 });
    if (!existing.length && username === "admin" && password === "12345678") {
      const passwordRecord = await createPasswordRecord(password);
      accounts = await supabaseInsert<AdminAccount>("admin_accounts", { username, ...passwordRecord, active: true });
    }
  }

  const account = accounts[0];
  if (!account?.active) return null;
  const candidate = await derivePasswordHash(password, account.password_salt, account.password_iterations);
  if (!constantTimeEqual(candidate, account.password_hash)) return null;
  return { id: account.id, username: account.username };
}

async function sessionKey() {
  const secret = runtimeValue("SESSION_SECRET");
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is missing or too short");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSessionToken(account: { id: string; username: string }) {
  const payload: AdminSession = {
    id: account.id,
    username: account.username,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(), encoder.encode(encodedPayload));
  return `${encodedPayload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string | undefined): Promise<AdminSession | null> {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await sessionKey(), base64UrlDecode(signature), encoder.encode(payload));
    if (!valid) return null;
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as AdminSession;
    if (!parsed.id || !parsed.username || !parsed.exp || parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export async function sessionFromRequest(request: Request) {
  return verifySessionToken(cookieValue(request, SESSION_COOKIE));
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function updateAdminCredentials(adminId: string, username: string, newPassword?: string) {
  const payload: Record<string, string | number> = { username };
  if (newPassword) Object.assign(payload, await createPasswordRecord(newPassword));
  const updated = await supabaseUpdate<AdminAccount>("admin_accounts", { id: `eq.${adminId}` }, payload);
  return updated[0] ? { id: updated[0].id, username: updated[0].username } : null;
}
