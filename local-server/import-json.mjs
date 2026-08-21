import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabaseBackup, openCenterDatabase } from "./database.mjs";
import { isCenterStatePayload } from "./state-contract.mjs";

const args = process.argv.slice(2);
const source = args.find((value) => !value.startsWith("--"));
if (!source) {
  console.error("الاستخدام: npm run local:import -- path-to-backup.json [--replace]");
  process.exit(1);
}

const raw = JSON.parse(await readFile(resolve(source), "utf8"));

function findStateCandidates(root) {
  const candidates = [];
  const visited = new Set();
  const visit = (value, path, depth, inheritedVersion = null) => {
    if (depth > 12 || value === null || value === undefined) return;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return;
      try { visit(JSON.parse(trimmed), `${path}<json>`, depth + 1, inheritedVersion); } catch { /* not embedded JSON */ }
      return;
    }
    if (typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    const version = Number.isFinite(Number(value.baseVersion ?? value.version)) ? Number(value.baseVersion ?? value.version) : inheritedVersion;
    if (isCenterStatePayload(value)) {
      candidates.push({ path, state: value, version, savedAt: Date.parse(value.savedAt) || 0 });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1, version));
      return;
    }
    for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key, depth + 1, version);
  };
  visit(root, "root", 0);
  return candidates.sort((a, b) => b.savedAt - a.savedAt || (b.version ?? -1) - (a.version ?? -1));
}

const candidates = findStateCandidates(raw);
if (!candidates.length) throw new Error("ملف JSON لا يحتوي على نسخة صالحة من بيانات السنتر");
const selected = candidates[0];
const state = selected.state;

console.log(`تم العثور على ${candidates.length} نسخة صالحة.`);
for (const [index, candidate] of candidates.slice(0, 8).entries()) {
  console.log(`${index + 1}. ${candidate.path} | savedAt=${candidate.state.savedAt} | baseVersion=${candidate.version ?? "غير معروف"} | students=${candidate.state.students.length} | sessions=${candidate.state.sessions.length}`);
}
console.log(`النسخة المختارة: ${selected.path}`);
if (args.includes("--inspect")) {
  console.log("فحص فقط: لم يتم تعديل SQLite.");
  process.exit(0);
}

const hasOperationalData = (value) => ["students", "teachers", "pricing", "sessions", "bookings", "expenses", "debtPayments", "audit"]
  .some((key) => Array.isArray(value[key]) && value[key].length > 0);

const store = openCenterDatabase();
try {
  const current = store.getState();
  if (hasOperationalData(current.state) && !args.includes("--replace")) {
    throw new Error("قاعدة SQLite تحتوي بيانات بالفعل. أعد الأمر مع --replace بعد مراجعة الملف؛ النسخة الحالية ستُحفظ قبل الاستبدال.");
  }
  await createDatabaseBackup(store, "before-json-import");
  const saved = store.replaceState(state, "migration", "json-import");
  if (!saved.ok) throw new Error(saved.error || "تعذر استيراد البيانات");
  console.log(`تم استيراد البيانات إلى SQLite. الإصدار المحلي: ${saved.version}`);
  console.log(`الطلاب: ${state.students.length} | الحصص: ${state.sessions.length} | الحجوزات: ${state.bookings.length}`);
} finally {
  store.close();
}
