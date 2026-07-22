import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const envText = await readFile(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) => line && !line.trimStart().startsWith("#") && line.includes("=")).map((line) => {
  const separator = line.indexOf("=");
  return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
}));

const secret = env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(env.SUPABASE_URL && secret, "Supabase URL and service role key are required");
const baseUrl = `${env.SUPABASE_URL}/rest/v1`;
const headers = secret.startsWith("sb_secret_")
  ? { apikey: secret }
  : { apikey: secret, Authorization: `Bearer ${secret}` };

async function request(path) {
  const response = await fetch(`${baseUrl}/${path}`, { headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function ids(rows) {
  return rows.map((row) => String(row.id)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

function snapshotIds(rows) {
  const values = rows.map((row) => String(row.id));
  assert.equal(new Set(values).size, values.length, "snapshot IDs must be unique");
  return values.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

const [stateRows, students, teachers, sessions, bookings, expenses, debtPayments, attendance, rooms, prices] = await Promise.all([
  request("center_state?id=eq.1&select=data,version,updated_at"),
  request("students?select=id"),
  request("teachers?select=id"),
  request("lesson_sessions?select=id,status"),
  request("advance_bookings?select=id"),
  request("center_expenses?select=id"),
  request("student_debt_payments?select=id"),
  request("session_attendance?select=session_id,student_id"),
  request("rooms?active=eq.true&select=name"),
  request("price_rules?active=eq.true&select=id"),
]);

assert.equal(stateRows.length, 1, "one authoritative center_state row must exist");
const state = stateRows[0].data;
const comparisons = [
  ["students", snapshotIds(state.students), ids(students)],
  ["teachers", snapshotIds(state.teachers), ids(teachers)],
  ["sessions", snapshotIds(state.sessions), ids(sessions)],
  ["bookings", snapshotIds(state.bookings), ids(bookings)],
  ["expenses", snapshotIds(state.expenses), ids(expenses)],
  ["debtPayments", snapshotIds(state.debtPayments ?? []), ids(debtPayments)],
];
for (const [label, expected, actual] of comparisons) assert.deepEqual(actual, expected, `${label} relational IDs must match the authoritative snapshot`);

const expectedAttendance = state.sessions.flatMap((session) => session.studentIds.map((studentId) => `${session.id}:${studentId}`)).sort();
const actualAttendance = attendance.map((row) => `${row.session_id}:${row.student_id}`).sort();
assert.deepEqual(actualAttendance, expectedAttendance, "attendance rows must match every saved session attendee");
assert.deepEqual(rooms.map((room) => room.name).sort(), [...state.rooms].sort(), "active rooms must match the snapshot");
assert.equal(prices.length, state.pricing.length, "active price rule count must match the snapshot");

const activeStudentSessions = new Map();
for (const session of state.sessions.filter((item) => item.status === "active")) {
  for (const studentId of session.studentIds) {
    const current = activeStudentSessions.get(String(studentId)) ?? [];
    current.push(String(session.id));
    activeStudentSessions.set(String(studentId), current);
  }
}
const activeConflicts = [...activeStudentSessions.entries()].filter(([, sessionIds]) => sessionIds.length > 1);
assert.deepEqual(activeConflicts, [], "no student may be registered in more than one active session");

console.log(JSON.stringify({
  passed: true,
  version: Number(stateRows[0].version),
  updatedAt: stateRows[0].updated_at,
  counts: {
    students: students.length,
    teachers: teachers.length,
    sessions: sessions.length,
    attendance: attendance.length,
    bookings: bookings.length,
    expenses: expenses.length,
    debtPayments: debtPayments.length,
    rooms: rooms.length,
    prices: prices.length,
  },
}));
