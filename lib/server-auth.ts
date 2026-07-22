import "server-only";

import { supabaseRpc } from "./supabase-rest";

const encoder = new TextEncoder();
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const SESSION_COOKIE = "center_session";

type AdminAccount = {
  id: string;
  username: string;
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

export async function authenticateAdmin(username: string, password: string) {
  let accounts = await supabaseRpc<AdminAccount>("verify_admin_credentials", { p_username: username, p_password: password });
  if (!accounts.length && username === "admin" && password === "12345678") {
    accounts = await supabaseRpc<AdminAccount>("bootstrap_admin_account", { p_username: username, p_password: password });
  }
  return accounts[0] ? { id: accounts[0].id, username: accounts[0].username } : null;
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
  const updated = await supabaseRpc<AdminAccount>("update_admin_credentials", {
    p_admin_id: adminId,
    p_username: username,
    p_new_password: newPassword || null,
  });
  return updated[0] ? { id: updated[0].id, username: updated[0].username } : null;
}
