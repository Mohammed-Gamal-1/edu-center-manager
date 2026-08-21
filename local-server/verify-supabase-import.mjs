import { createHash } from "node:crypto";
import { openCenterDatabase } from "./database.mjs";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY مطلوبان للتحقق من النسخة المحلية");

const response = await fetch(`${url}/rest/v1/center_state?id=eq.1&select=data,version,updated_at`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!response.ok) throw new Error(`تعذر قراءة حالة Supabase: ${response.status}`);
const [cloud] = await response.json();
if (!cloud?.data) throw new Error("حالة Supabase غير موجودة");

const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const collections = ["students", "teachers", "pricing", "sessions", "bookings", "expenses", "debtPayments", "audit"];
const store = openCenterDatabase();
try {
  const local = store.getState();
  const summary = Object.fromEntries(collections.map((keyName) => [keyName, Array.isArray(local.state[keyName]) ? local.state[keyName].length : 0]));
  const exactStateMatch = digest(cloud.data) === digest(local.state);
  console.log(JSON.stringify({
    cloudVersion: cloud.version,
    localVersion: local.version,
    sourceUpdatedAt: cloud.updated_at,
    localUpdatedAt: local.updatedAt,
    counts: summary,
    exactStateMatch,
    historyRows: store.db.prepare("SELECT COUNT(*) AS count FROM center_state_history").get().count,
  }, null, 2));
  if (!exactStateMatch) process.exitCode = 2;
} finally {
  store.close();
}
