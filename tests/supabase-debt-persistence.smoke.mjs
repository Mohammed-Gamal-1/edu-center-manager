import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const envText = await readFile(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) => line && !line.trimStart().startsWith("#") && line.includes("=")).map((line) => {
  const separator = line.indexOf("=");
  return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
}));

const baseUrl = `${env.SUPABASE_URL}/rest/v1`;
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}/${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const [original] = await request("center_state?id=eq.1&select=id,data,version");
assert.ok(original, "center_state row must exist");
const testVersion = Number(original.version) + 1;
const testSnapshot = {
  students: [{ id: "100", name: "طالب اختبار الحفظ", phone: "01000000100", stage: "المرحلة الإعدادية", grade: "الصف الأول", active: true }],
  teachers: [{ id: "99001", name: "أ/ مدرس اختبار الحفظ", phone: "01000099001", assignments: [{ stage: "المرحلة الإعدادية", grade: "الصف الأول", subject: "الرياضيات" }], active: true }],
  pricing: [{ id: "99001", stage: "المرحلة الإعدادية", grade: "الصف الأول", subject: "الرياضيات", studentPrice: 100, teacherFee: 70 }],
  sessions: [{ id: "99001", teacherId: "99001", stage: "المرحلة الإعدادية", grade: "الصف الأول", subject: "الرياضيات", room: "قاعة 1", date: "2026-07-19", scheduledTime: "17:00", status: "ended", startedAt: "17:00", endedAt: "18:00", studentIds: ["100"], studentPrice: 100, teacherFee: 70, studentPayments: { "100": 60 } }],
  bookings: [],
  expenses: [],
  debtPayments: [{ id: "99001", studentId: "100", sessionId: "99001", amount: 25, date: "2026-07-19", note: "اختبار سداد منفصل" }],
  audit: [],
  subjectCatalog: { "المرحلة الابتدائية": ["الرياضيات"], "المرحلة الإعدادية": ["الرياضيات"], "المرحلة الثانوية": ["الرياضيات"] },
  rooms: ["قاعة 1", "قاعة 2", "قاعة 3", "قاعة 4", "قاعة 5"],
  savedAt: new Date().toISOString(),
};

let testWritten = false;
try {
  const saved = await request(`center_state?id=eq.1&version=eq.${original.version}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data: testSnapshot, version: testVersion }) });
  assert.equal(saved.length, 1, "test snapshot must be written once");
  testWritten = true;

  const [student] = await request("students?id=eq.100&select=id,full_name");
  const [lesson] = await request("lesson_sessions?id=eq.99001&select=id,student_price_snapshot,teacher_fee_snapshot,status");
  const [attendance] = await request("session_attendance?session_id=eq.99001&student_id=eq.100&select=paid_cash");
  const [settlement] = await request("student_debt_payments?id=eq.99001&select=student_id,session_id,amount,paid_at");
  const [financial] = await request("session_financial_summary?id=eq.99001&select=gross_value,collected_cash,shortages,teacher_due,center_net_profit");

  assert.equal(Number(student.id), 100);
  assert.equal(Number(lesson.student_price_snapshot), 100);
  assert.equal(Number(lesson.teacher_fee_snapshot), 70);
  assert.equal(Number(attendance.paid_cash), 60);
  assert.equal(Number(settlement.amount), 25);
  assert.deepEqual({
    gross: Number(financial.gross_value),
    collected: Number(financial.collected_cash),
    shortages: Number(financial.shortages),
    teacherDue: Number(financial.teacher_due),
    centerNet: Number(financial.center_net_profit),
  }, { gross: 100, collected: 60, shortages: 40, teacherDue: 70, centerNet: -10 });

  console.log(JSON.stringify({ studentId: Number(student.id), attendancePaid: Number(attendance.paid_cash), debtSettlement: Number(settlement.amount), financials: financial, passed: true }));
} finally {
  if (testWritten) {
    const restored = await request(`center_state?id=eq.1&version=eq.${testVersion}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data: original.data, version: original.version }) });
    assert.equal(restored.length, 1, "original center state must be restored");
  }
}

const [restoredState] = await request("center_state?id=eq.1&select=data,version");
assert.equal(Number(restoredState.version), Number(original.version));
assert.deepEqual(restoredState.data, original.data);
console.log(JSON.stringify({ originalSnapshotRestored: true, originalVersion: Number(original.version) }));
