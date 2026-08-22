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

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((keyName) => [keyName, canonicalize(value[keyName])]));
  return value;
};
const digest = (value) => createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
const collections = ["students", "teachers", "pricing", "sessions", "bookings", "expenses", "debtPayments", "audit"];
const countItems = (state) => Object.fromEntries(collections.map((keyName) => [keyName, Array.isArray(state[keyName]) ? state[keyName].length : 0]));
const collectionDifference = (localItems, cloudItems) => {
  const localById = new Map(localItems.filter((item) => item && typeof item === "object" && item.id !== undefined).map((item) => [String(item.id), item]));
  const cloudById = new Map(cloudItems.filter((item) => item && typeof item === "object" && item.id !== undefined).map((item) => [String(item.id), item]));
  return {
    localOnly: [...localById.keys()].filter((id) => !cloudById.has(id)).length,
    cloudOnly: [...cloudById.keys()].filter((id) => !localById.has(id)).length,
    changed: [...localById.keys()].filter((id) => cloudById.has(id) && digest(localById.get(id)) !== digest(cloudById.get(id))).length,
  };
};
const store = openCenterDatabase();
try {
  const local = store.getState();
  const localCounts = countItems(local.state);
  const cloudCounts = countItems(cloud.data);
  const differences = Object.fromEntries(collections.map((keyName) => [keyName, collectionDifference(local.state[keyName] ?? [], cloud.data[keyName] ?? [])]));
  const exactStateMatch = digest(cloud.data) === digest(local.state);
  console.log(JSON.stringify({
    cloudVersion: cloud.version,
    localVersion: local.version,
    sourceUpdatedAt: cloud.updated_at,
    localUpdatedAt: local.updatedAt,
    localCounts,
    cloudCounts,
    differences,
    roomsMatch: digest(local.state.rooms) === digest(cloud.data.rooms),
    subjectCatalogMatch: digest(local.state.subjectCatalog) === digest(cloud.data.subjectCatalog),
    exactStateMatch,
    historyRows: store.db.prepare("SELECT COUNT(*) AS count FROM center_state_history").get().count,
  }, null, 2));
  if (!exactStateMatch) process.exitCode = 2;
} finally {
  store.close();
}
