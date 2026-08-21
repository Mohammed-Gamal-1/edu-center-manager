import { backup, DatabaseSync } from "node:sqlite";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { emptyCenterState, validateCenterState } from "./state-contract.mjs";

const PIN_ITERATIONS = 210_000;

const nowIso = () => new Date().toISOString();
const json = (value) => JSON.stringify(value);
const parseJson = (value) => JSON.parse(String(value));
const safeName = (value) => String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

export function resolveDataPaths(options = {}) {
  const dataDir = resolve(options.dataDir ?? process.env.CENTER_DATA_DIR ?? join(process.cwd(), "data"));
  const databasePath = resolve(options.databasePath ?? join(dataDir, "center.sqlite"));
  const backupDir = resolve(options.backupDir ?? join(dataDir, "backups"));
  return { dataDir, databasePath, backupDir };
}

function derivePin(pin, salt) {
  return pbkdf2Sync(pin, salt, PIN_ITERATIONS, 32, "sha256");
}

function createRecoveryCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(20);
  const value = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return value.match(/.{1,4}/g)?.join("-") ?? value;
}

export function openCenterDatabase(options = {}) {
  const paths = resolveDataPaths(options);
  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(paths.backupDir, { recursive: true });
  const db = new DatabaseSync(paths.databasePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = FULL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS center_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version >= 0),
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS center_state_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state_version INTEGER NOT NULL,
      data TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      actor TEXT NOT NULL,
      reason TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_center_state_history_saved_at
      ON center_state_history(saved_at DESC);
    CREATE TABLE IF NOT EXISTS admin_account (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL,
      pin_salt BLOB NOT NULL,
      pin_hash BLOB NOT NULL,
      recovery_salt BLOB,
      recovery_hash BLOB,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
  `);
  db.prepare("INSERT OR IGNORE INTO center_state (id, data, version, updated_at) VALUES (1, ?, 0, ?)").run(json(emptyCenterState), nowIso());
  db.exec("PRAGMA optimize");

  const getState = () => {
    const row = db.prepare("SELECT data, version, updated_at FROM center_state WHERE id = 1").get();
    return { state: parseJson(row.data), version: Number(row.version), updatedAt: String(row.updated_at) };
  };

  const getConfig = (key) => db.prepare("SELECT value FROM app_config WHERE key = ?").get(key)?.value ?? null;
  const setConfig = (key, value) => db.prepare(`
    INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), nowIso());

  const saveState = (state, baseVersion, actor = "reception", reason = "application-save", options = {}) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = getState();
      const validationError = validateCenterState(state, options.validateAgainstCurrent === false ? null : current.state);
      if (validationError) {
        db.exec("ROLLBACK");
        return { ok: false, kind: "validation", error: validationError, ...current };
      }
      if (Number(baseVersion) !== current.version) {
        db.exec("ROLLBACK");
        return { ok: false, kind: "version", error: "تم تعديل البيانات من جهاز آخر", ...current };
      }
      const nextVersion = current.version + 1;
      const savedAt = nowIso();
      db.prepare("INSERT INTO center_state_history (state_version, data, saved_at, actor, reason) VALUES (?, ?, ?, ?, ?)")
        .run(current.version, json(current.state), savedAt, actor, reason);
      db.prepare("UPDATE center_state SET data = ?, version = ?, updated_at = ? WHERE id = 1")
        .run(json(state), nextVersion, savedAt);
      db.exec("COMMIT");
      return { ok: true, state, version: nextVersion, updatedAt: savedAt };
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* transaction already closed */ }
      throw error;
    }
  };

  const replaceState = (state, actor = "migration", reason = "manual-import") => {
    const current = getState();
    const validationError = validateCenterState(state);
    if (validationError) throw new Error(validationError);
    return saveState(state, current.version, actor, reason, { validateAgainstCurrent: false });
  };

  const getAdmin = () => db.prepare("SELECT * FROM admin_account WHERE id = 1").get() ?? null;
  const configureAdmin = (username, pin) => {
    const normalizedUsername = String(username).trim();
    if (normalizedUsername.length < 3) throw new Error("اسم المستخدم يجب ألا يقل عن 3 أحرف");
    if (!/^\d{4}$/.test(String(pin))) throw new Error("PIN الإدارة يجب أن يتكون من 4 أرقام");
    const salt = randomBytes(16);
    const hash = derivePin(String(pin), salt);
    db.prepare(`
      INSERT INTO admin_account (id, username, pin_salt, pin_hash, updated_at)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET username = excluded.username, pin_salt = excluded.pin_salt,
        pin_hash = excluded.pin_hash, updated_at = excluded.updated_at
    `).run(normalizedUsername, salt, hash, nowIso());
    return { username: normalizedUsername };
  };

  const verifyAdminPin = (pin) => {
    const account = getAdmin();
    if (!account || !/^\d{4}$/.test(String(pin))) return null;
    const candidate = derivePin(String(pin), Buffer.from(account.pin_salt));
    const stored = Buffer.from(account.pin_hash);
    return candidate.length === stored.length && timingSafeEqual(candidate, stored)
      ? { id: "1", username: String(account.username) }
      : null;
  };

  const updateAdmin = (username, pin) => {
    const account = getAdmin();
    if (!account) throw new Error("يجب إعداد حساب الإدارة المحلي أولاً");
    const normalizedUsername = String(username).trim();
    if (normalizedUsername.length < 3) throw new Error("اسم المستخدم يجب ألا يقل عن 3 أحرف");
    if (pin) return configureAdmin(normalizedUsername, pin);
    db.prepare("UPDATE admin_account SET username = ?, updated_at = ? WHERE id = 1").run(normalizedUsername, nowIso());
    return { username: normalizedUsername };
  };

  const generateRecoveryCode = () => {
    const account = getAdmin();
    if (!account) throw new Error("يجب إعداد حساب الإدارة المحلي أولاً");
    const code = createRecoveryCode();
    const salt = randomBytes(16);
    const hash = derivePin(code, salt);
    db.prepare("UPDATE admin_account SET recovery_salt = ?, recovery_hash = ?, updated_at = ? WHERE id = 1")
      .run(salt, hash, nowIso());
    return code;
  };

  const recoverAdmin = (code, newPin) => {
    const account = getAdmin();
    if (!account?.recovery_salt || !account?.recovery_hash) throw new Error("لا يوجد كود استرداد محلي محفوظ");
    if (!/^\d{4}$/.test(String(newPin))) throw new Error("PIN الإدارة الجديد يجب أن يتكون من 4 أرقام");
    const candidate = derivePin(String(code).trim().toUpperCase(), Buffer.from(account.recovery_salt));
    const stored = Buffer.from(account.recovery_hash);
    if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) throw new Error("كود الاسترداد غير صحيح");
    return configureAdmin(String(account.username), String(newPin));
  };

  const databaseIdentity = () => createHash("sha256").update(paths.databasePath).digest("hex").slice(0, 16);

  return {
    db,
    paths,
    getState,
    saveState,
    replaceState,
    getConfig,
    setConfig,
    getAdmin,
    configureAdmin,
    verifyAdminPin,
    updateAdmin,
    generateRecoveryCode,
    recoverAdmin,
    databaseIdentity,
    close: () => db.close(),
  };
}

export async function createDatabaseBackup(store, reason = "manual") {
  mkdirSync(store.paths.backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `center-${stamp}-${safeName(reason) || "backup"}.sqlite`;
  const target = join(store.paths.backupDir, filename);
  await backup(store.db, target);
  return { filename: basename(target), path: target };
}
