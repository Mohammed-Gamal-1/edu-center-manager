import { createDatabaseBackup, openCenterDatabase } from "./database.mjs";
import { isCenterStatePayload } from "./state-contract.mjs";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY مطلوبان للاستيراد لمرة واحدة");

const response = await fetch(`${url}/rest/v1/center_state?id=eq.1&select=data,version,updated_at`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!response.ok) throw new Error(`تعذر قراءة نسخة Supabase: ${response.status}`);
const rows = await response.json();
const row = rows[0];
if (!row || !isCenterStatePayload(row.data)) throw new Error("نسخة Supabase غير موجودة أو غير صالحة");

// Password hashes are deliberately not copied: the local server uses a
// separate authentication implementation and requires a new local PIN.
const adminResponse = await fetch(`${url}/rest/v1/admin_accounts?active=eq.true&select=username&order=created_at.asc&limit=1`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
const adminRows = adminResponse.ok ? await adminResponse.json() : [];
const migratedAdminUsername = typeof adminRows[0]?.username === "string" ? adminRows[0].username : null;

const args = process.argv.slice(2);
const store = openCenterDatabase();
try {
  const current = store.getState();
  const hasLocalData = ["students", "teachers", "sessions", "bookings", "expenses", "audit"]
    .some((keyName) => Array.isArray(current.state[keyName]) && current.state[keyName].length > 0);
  if (hasLocalData && !args.includes("--replace")) {
    throw new Error("قاعدة SQLite تحتوي بيانات. استخدم --replace فقط بعد التأكد؛ سيتم إنشاء نسخة احتياطية أولاً.");
  }
  await createDatabaseBackup(store, "before-supabase-import");
  const saved = store.replaceState(row.data, "migration", `supabase-import-v${row.version}`);
  if (!saved.ok) throw new Error(saved.error || "تعذر استيراد Supabase");
  store.setConfig("supabase_source_version", String(row.version));
  store.setConfig("supabase_imported_at", new Date().toISOString());
  if (migratedAdminUsername) store.setConfig("migrated_admin_username", migratedAdminUsername);
  console.log(`تم نسخ Supabase إلى SQLite دون تعديل Supabase. المصدر v${row.version} والمحلي v${saved.version}.`);
  if (migratedAdminUsername) console.log(`اسم حساب الإدارة المنقول: ${migratedAdminUsername}. عيّن PIN محليًا جديدًا قبل تشغيل الإدارة.`);
} finally {
  store.close();
}
