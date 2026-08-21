import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { createDatabaseBackup, openCenterDatabase } from "./database.mjs";

const HOST = process.env.CENTER_HOST || "0.0.0.0";
const PORT = Number(process.env.CENTER_PORT || 3000);
const CLIENT_DIR = resolve(process.env.CENTER_CLIENT_DIR || join(process.cwd(), "dist", "client"));
const WORKER_PATH = resolve(process.env.CENTER_WORKER_PATH || join(process.cwd(), "dist", "server", "index.js"));
const SESSION_COOKIE = "center_local_session";
const SESSION_SECONDS = 60 * 60 * 12;
const MAX_BODY_BYTES = 8_000_000;

const store = openCenterDatabase();
if (!store.getAdmin() && process.env.LOCAL_ADMIN_PIN) {
  store.configureAdmin(process.env.LOCAL_ADMIN_USERNAME || "admin", process.env.LOCAL_ADMIN_PIN);
}
if (!store.getConfig("session_secret")) store.setConfig("session_secret", randomBytes(48).toString("base64url"));

const jsonResponse = (response, status, payload, headers = {}) => {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(body);
};

const readBody = (request) => new Promise((resolveBody, reject) => {
  const chunks = [];
  let size = 0;
  request.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      reject(Object.assign(new Error("payload-too-large"), { status: 413 }));
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on("end", () => resolveBody(Buffer.concat(chunks)));
  request.on("error", reject);
});

const requestJson = async (request) => {
  const body = await readBody(request);
  try {
    return JSON.parse(body.toString("utf8") || "null");
  } catch {
    throw Object.assign(new Error("invalid-json"), { status: 400 });
  }
};

const cookies = (request) => Object.fromEntries(
  String(request.headers.cookie || "")
    .split(";")
    .map((part) => part.trim().split("="))
    .filter(([key]) => key)
    .map(([key, ...value]) => [key, decodeURIComponent(value.join("="))]),
);

const sessionSecret = () => store.getConfig("session_secret");
const sign = (payload) => createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
const createSession = (role, username) => {
  const payload = Buffer.from(JSON.stringify({ role, username, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString("base64url");
  return payload + "." + sign(payload);
};
const verifySession = (request) => {
  const token = cookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.exp > Math.floor(Date.now() / 1000) && ["reception", "admin"].includes(session.role) ? session : null;
  } catch {
    return null;
  }
};
const sessionCookie = (token) => `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

const requireSession = (request, response, role = null) => {
  const session = verifySession(request);
  if (!session) {
    jsonResponse(response, 401, { ok: false, error: "الجلسة منتهية" });
    return null;
  }
  if (role && session.role !== role) {
    jsonResponse(response, 403, { ok: false, error: "هذه العملية متاحة لمدير السنتر فقط" });
    return null;
  }
  return session;
};

async function handleApi(request, response, url) {
  const path = url.pathname;

  if (path === "/api/auth/reception" && request.method === "POST") {
    const username = store.getAdmin()?.username ?? store.getConfig("migrated_admin_username") ?? "admin";
    const token = createSession("reception", String(username));
    jsonResponse(response, 200, { ok: true, username }, { "Set-Cookie": sessionCookie(token) });
    return true;
  }
  if (path === "/api/auth/login" && request.method === "POST") {
    const body = await requestJson(request);
    const pin = String(body?.password ?? "");
    if (!store.getAdmin()) {
      jsonResponse(response, 503, { ok: false, error: "حساب الإدارة المحلي غير مُعد. شغّل npm run local:setup أولاً" });
      return true;
    }
    const account = store.verifyAdminPin(pin);
    if (!account) {
      jsonResponse(response, 401, { ok: false, error: "PIN الإدارة غير صحيح" });
      return true;
    }
    jsonResponse(response, 200, { ok: true, username: account.username }, { "Set-Cookie": sessionCookie(createSession("admin", account.username)) });
    return true;
  }
  if (path === "/api/auth/logout" && request.method === "POST") {
    jsonResponse(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
    return true;
  }
  if (path === "/api/auth/session" && request.method === "GET") {
    const session = verifySession(request);
    jsonResponse(response, session ? 200 : 401, session ? { ok: true, ...session } : { ok: false });
    return true;
  }
  if (path === "/api/auth/credentials" && request.method === "PUT") {
    const session = requireSession(request, response, "admin");
    if (!session) return true;
    const body = await requestJson(request);
    try {
      const result = store.updateAdmin(String(body?.username ?? ""), body?.password ? String(body.password) : undefined);
      jsonResponse(response, 200, { ok: true, username: result.username });
    } catch (error) {
      jsonResponse(response, 400, { ok: false, error: error instanceof Error ? error.message : "تعذر تحديث بيانات الإدارة" });
    }
    return true;
  }
  if (path === "/api/auth/recovery-code" && request.method === "POST") {
    const session = requireSession(request, response, "admin");
    if (!session) return true;
    try {
      jsonResponse(response, 200, { ok: true, recoveryCode: store.generateRecoveryCode() });
    } catch (error) {
      jsonResponse(response, 400, { ok: false, error: error instanceof Error ? error.message : "تعذر إنشاء كود الاسترداد" });
    }
    return true;
  }
  if (path === "/api/auth/recover" && request.method === "POST") {
    const body = await requestJson(request);
    try {
      const result = store.recoverAdmin(String(body?.recoveryCode ?? ""), String(body?.password ?? ""));
      jsonResponse(response, 200, { ok: true, username: result.username }, { "Set-Cookie": sessionCookie(createSession("admin", result.username)) });
    } catch (error) {
      jsonResponse(response, 401, { ok: false, error: error instanceof Error ? error.message : "تعذر استرداد PIN الإدارة" });
    }
    return true;
  }

  if (path === "/api/state" && request.method === "GET") {
    const session = requireSession(request, response);
    if (!session) return true;
    jsonResponse(response, 200, { ok: true, ...store.getState(), database: "sqlite" });
    return true;
  }
  if (path === "/api/state" && request.method === "PUT") {
    const session = requireSession(request, response);
    if (!session) return true;
    const body = await requestJson(request);
    if (!body || typeof body.baseVersion !== "number" || !body.state) {
      jsonResponse(response, 400, { ok: false, error: "صيغة البيانات غير صحيحة" });
      return true;
    }
    const saved = store.saveState(body.state, body.baseVersion, session.username, "application-save");
    if (!saved.ok) {
      jsonResponse(response, 409, {
        ok: false,
        conflict: true,
        reason: saved.kind,
        error: saved.error,
        state: saved.state,
        version: saved.version,
      });
      return true;
    }
    jsonResponse(response, 200, { ok: true, version: saved.version, updatedAt: saved.updatedAt });
    return true;
  }
  if (path === "/api/system/health" && request.method === "GET") {
    const state = store.getState();
    jsonResponse(response, 200, {
      ok: true,
      mode: "local-server",
      database: "SQLite",
      version: state.version,
      databaseId: store.databaseIdentity(),
    });
    return true;
  }
  if (path === "/api/local/backup" && request.method === "POST") {
    const session = requireSession(request, response, "admin");
    if (!session) return true;
    const result = await createDatabaseBackup(store, "manual");
    jsonResponse(response, 200, { ok: true, filename: result.filename });
    return true;
  }
  if (path === "/api/local/export" && request.method === "GET") {
    const session = requireSession(request, response, "admin");
    if (!session) return true;
    const state = store.getState();
    jsonResponse(response, 200, {
      format: "eltafawoq-local-server-backup-v1",
      exportedAt: new Date().toISOString(),
      version: state.version,
      state: state.state,
    }, { "Content-Disposition": `attachment; filename="eltafawoq-backup-${new Date().toISOString().slice(0, 10)}.json"` });
    return true;
  }
  return false;
}

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
};

const staticPath = (pathname) => {
  const decoded = decodeURIComponent(pathname);
  const relative = normalize(decoded).replace(/^([/\\])+/, "");
  const target = resolve(CLIENT_DIR, relative);
  return target === CLIENT_DIR || target.startsWith(CLIENT_DIR + sep) ? target : null;
};

function staticResponse(url) {
  const target = staticPath(new URL(url).pathname);
  if (!target || !existsSync(target) || !statSync(target).isFile()) return null;
  const bytes = statSync(target).size;
  return new Response(Readable.toWeb(createReadStream(target)), {
    status: 200,
    headers: {
      "Content-Type": MIME[extname(target).toLowerCase()] || "application/octet-stream",
      "Content-Length": String(bytes),
      "Cache-Control": target.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
    },
  });
}

function sendWebResponse(nodeResponse, webResponse) {
  const headers = {};
  for (const [key, value] of webResponse.headers) headers[key] = value;
  const setCookies = webResponse.headers.getSetCookie?.();
  if (setCookies?.length) headers["set-cookie"] = setCookies;
  nodeResponse.writeHead(webResponse.status, headers);
  if (!webResponse.body) {
    nodeResponse.end();
    return;
  }
  Readable.fromWeb(webResponse.body).pipe(nodeResponse);
}

if (!existsSync(WORKER_PATH) || !existsSync(CLIENT_DIR)) {
  console.error("Local build is missing. Run: npm run build");
  store.close();
  process.exit(1);
}

const { default: worker } = await import(new URL("file:///" + WORKER_PATH.replace(/\\/g, "/")).href + "?local=" + Date.now());
const assetsBinding = {
  fetch: async (input) => staticResponse(typeof input === "string" ? input : input.url) ?? new Response("Not found", { status: 404 }),
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || `localhost:${PORT}`}`);
    if (url.pathname.startsWith("/api/") && await handleApi(request, response, url)) return;
    const staticFile = staticResponse(url.href);
    if (staticFile) {
      sendWebResponse(response, staticFile);
      return;
    }
    const body = ["GET", "HEAD"].includes(request.method || "GET") ? undefined : await readBody(request);
    const webRequest = new Request(url, {
      method: request.method,
      headers: request.headers,
      body,
      ...(body ? { duplex: "half" } : {}),
    });
    const webResponse = await worker.fetch(webRequest, { ASSETS: assetsBinding }, { waitUntil() {}, passThroughOnException() {} });
    sendWebResponse(response, webResponse);
  } catch (error) {
    console.error("Request failed:", error instanceof Error ? error.message : error);
    if (!response.headersSent) jsonResponse(response, error?.status || 500, { ok: false, error: "تعذر تنفيذ الطلب على السيرفر المحلي" });
    else response.end();
  }
});

async function dailyBackup() {
  const today = new Date().toISOString().slice(0, 10);
  if (store.getConfig("last_daily_backup") === today) return;
  await createDatabaseBackup(store, "daily");
  store.setConfig("last_daily_backup", today);
}

await dailyBackup();
const backupTimer = setInterval(() => void dailyBackup().catch((error) => console.error("Automatic backup failed:", error.message)), 60 * 60 * 1000);
backupTimer.unref();

server.listen(PORT, HOST, () => {
  console.log(`Center local server: http://localhost:${PORT}`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) console.log(`LAN access: http://${address.address}:${PORT}`);
    }
  }
  console.log(`SQLite: ${store.paths.databasePath}`);
  if (!store.getAdmin()) console.log("Admin is not configured. Run: npm run local:setup");
});

const shutdown = () => {
  clearInterval(backupTimer);
  server.close(() => {
    store.close();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
