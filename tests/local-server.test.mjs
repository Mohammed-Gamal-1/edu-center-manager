import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDatabaseBackup, openCenterDatabase } from "../local-server/database.mjs";

const validState = (suffix = "1") => ({
  students: [{ id: `student-${suffix}`, name: "طالب اختبار" }],
  teachers: [],
  pricing: [],
  sessions: [],
  bookings: [],
  expenses: [],
  debtPayments: [],
  audit: [],
  subjectCatalog: {
    "المرحلة الابتدائية": ["اللغة العربية"],
    "المرحلة الإعدادية": ["الرياضيات"],
    "المرحلة الثانوية": ["الفيزياء"],
  },
  rooms: ["قاعة 1"],
  savedAt: new Date().toISOString(),
});

test("SQLite keeps version history, rejects stale writes, and creates restorable backups", async (context) => {
  const dataDir = await mkdtemp(join(tmpdir(), "center-sqlite-test-"));
  const store = openCenterDatabase({ dataDir });
  context.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  assert.equal(store.getState().version, 0);
  store.configureAdmin("admin", "1234");
  assert.equal(store.verifyAdminPin("9999"), null);
  assert.equal(store.verifyAdminPin("1234")?.username, "admin");

  const recoveryCode = store.generateRecoveryCode();
  assert.match(recoveryCode, /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){4}$/);
  assert.equal(store.recoverAdmin(recoveryCode, "4321").username, "admin");
  assert.equal(store.verifyAdminPin("4321")?.username, "admin");

  const first = store.saveState(validState("first"), 0, "test-device", "test-save");
  assert.equal(first.ok, true);
  assert.equal(first.version, 1);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS count FROM center_state_history").get().count, 1);

  const stale = store.saveState(validState("stale"), 0, "other-device", "stale-save");
  assert.equal(stale.ok, false);
  assert.equal(stale.kind, "version");
  assert.equal(store.getState().state.students[0].id, "student-first");

  const duplicate = validState("duplicate");
  duplicate.students.push({ ...duplicate.students[0] });
  const rejected = store.saveState(duplicate, 1, "test-device", "invalid-save");
  assert.equal(rejected.ok, false);
  assert.equal(rejected.kind, "validation");
  assert.equal(store.getState().version, 1);

  const backupResult = await createDatabaseBackup(store, "integration-test");
  assert.equal(existsSync(backupResult.path), true);
  const backupStore = openCenterDatabase({ databasePath: backupResult.path, dataDir: join(dataDir, "backup-open") });
  try {
    assert.equal(backupStore.getState().state.students[0].id, "student-first");
    assert.equal(backupStore.getState().version, 1);
  } finally {
    backupStore.close();
  }
});

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`local server exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${url}/api/system/health`);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("local server did not become ready");
}

test("LAN server authenticates locally and persists shared SQLite state", async (context) => {
  const dataDir = await mkdtemp(join(tmpdir(), "center-server-test-"));
  const port = 31_000 + Math.floor(Math.random() * 5_000);
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["local-server/server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      CENTER_HOST: "127.0.0.1",
      CENTER_PORT: String(port),
      CENTER_DATA_DIR: dataDir,
      LOCAL_ADMIN_USERNAME: "admin",
      LOCAL_ADMIN_PIN: "1234",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  child.stdout.on("data", (chunk) => { diagnostics += chunk; });
  child.stderr.on("data", (chunk) => { diagnostics += chunk; });
  context.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 3000))]);
    }
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  try {
    await waitForServer(url, child);
    const health = await (await fetch(`${url}/api/system/health`)).json();
    assert.equal(health.database, "SQLite");

    const receptionResponse = await fetch(`${url}/api/auth/reception`, { method: "POST" });
    assert.equal(receptionResponse.status, 200);
    const receptionCookie = receptionResponse.headers.get("set-cookie").split(";", 1)[0];

    const initial = await (await fetch(`${url}/api/state`, { headers: { cookie: receptionCookie } })).json();
    assert.equal(initial.version, 0);
    const state = validState("api");
    const saved = await fetch(`${url}/api/state`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: receptionCookie },
      body: JSON.stringify({ state, baseVersion: 0 }),
    });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).version, 1);

    const stale = await fetch(`${url}/api/state`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: receptionCookie },
      body: JSON.stringify({ state: validState("other-device"), baseVersion: 0 }),
    });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).reason, "version");

    const loginResponse = await fetch(`${url}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "1234" }),
    });
    assert.equal(loginResponse.status, 200);
    const adminCookie = loginResponse.headers.get("set-cookie").split(";", 1)[0];
    const backupResponse = await fetch(`${url}/api/local/backup`, { method: "POST", headers: { cookie: adminCookie } });
    assert.equal(backupResponse.status, 200);
    assert.equal((await backupResponse.json()).ok, true);
    assert.equal(readdirSync(join(dataDir, "backups")).some((name) => name.endsWith(".sqlite")), true);
  } catch (error) {
    assert.fail(`${error instanceof Error ? error.stack : error}\nLocal server output:\n${diagnostics}`);
  }
});
