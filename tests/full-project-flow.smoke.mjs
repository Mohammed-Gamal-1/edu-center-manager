import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const envText = await readFile(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    }),
);

const siteUrl = process.env.CENTER_TEST_SITE_URL ?? "https://center-plus-management.jmika.chatgpt.site";
const supabaseUrl = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1`;
const secret = env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(env.SUPABASE_URL && secret, "Supabase configuration is required");
const supabaseHeaders = {
  apikey: secret,
  ...(!secret.startsWith("sb_secret_") ? { Authorization: `Bearer ${secret}` } : {}),
};

async function supabase(path) {
  const response = await fetch(`${supabaseUrl}/${path}`, {
    headers: { ...supabaseHeaders, Accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function site(path, options = {}, cookie = "") {
  const response = await fetch(`${siteUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

function nextNumericId(items, offset = 1) {
  return String(Math.max(0, ...items.map((item) => Number(item.id)).filter(Number.isFinite)) + offset);
}

function nextStudentId(items, stage) {
  const starts = {
    "المرحلة الابتدائية": 101001,
    "المرحلة الإعدادية": 201001,
    "المرحلة الثانوية": 301001,
  };
  const start = starts[stage];
  assert.ok(start, `Known student stage required, received ${stage}`);
  const ceiling = Math.floor(start / 10_000) * 10_000 + 9_999;
  const maximum = items
    .map((item) => Number(item.id))
    .filter((id) => id >= start && id <= ceiling)
    .reduce((max, id) => Math.max(max, id), start - 1);
  return String(maximum + 1);
}

const unauthenticatedState = await site("/api/state");
assert.equal(unauthenticatedState.response.status, 401, "state must reject requests without a secure session");

const reception = await site("/api/auth/reception", { method: "POST" });
assert.equal(reception.response.status, 200, "reception session must open");
const receptionCookie = reception.response.headers.get("set-cookie")?.split(";")[0] ?? "";
assert.ok(receptionCookie.includes("center_session="), "reception cookie must be created");

const invalidAdminPin = await site("/api/auth/login", { method: "POST", body: JSON.stringify({ password: "123" }) }, receptionCookie);
assert.equal(invalidAdminPin.response.status, 401, "admin PIN must be exactly four digits");
const backupAdmin = await site("/api/auth/login", { method: "POST", body: JSON.stringify({ password: "0000" }) }, receptionCookie);
assert.equal(backupAdmin.response.status, 200, "fixed backup admin PIN must work");
const adminCookie = backupAdmin.response.headers.get("set-cookie")?.split(";")[0] ?? "";
assert.ok(adminCookie.includes("center_session="), "admin cookie must be created");

const rejectedCredentialChange = await site(
  "/api/auth/credentials",
  {
    method: "PUT",
    body: JSON.stringify({ username: "admin", password: "12" }),
  },
  adminCookie,
);
assert.equal(rejectedCredentialChange.response.status, 400, "invalid credential changes must not be accepted");
const receptionCannotChangeCredentials = await site(
  "/api/auth/credentials",
  {
    method: "PUT",
    body: JSON.stringify({ username: "admin", password: "1111" }),
  },
  receptionCookie,
);
assert.equal(receptionCannotChangeCredentials.response.status, 401, "reception role must not change admin credentials");

const originalResult = await site("/api/state", { cache: "no-store" }, receptionCookie);
assert.equal(originalResult.response.status, 200, "cloud state must load");
let workingState = structuredClone(originalResult.body.state);
let version = Number(originalResult.body.version);
const suffix = String(Date.now()).slice(-7);
const testSubject = `مادة اختبار النظام ${suffix}`;
const stage = Object.keys(workingState.subjectCatalog).find((name) => Array.isArray(workingState.subjectCatalog[name])) ?? workingState.students[0]?.stage;
const grade = workingState.students.find((student) => student.stage === stage)?.grade ?? workingState.teachers.flatMap((teacher) => teacher.assignments).find((assignment) => assignment.stage === stage)?.grade;
const busyRooms = new Set(workingState.sessions.filter((session) => session.status === "active").map((session) => session.room));
const room = workingState.rooms.find((candidate) => !busyRooms.has(candidate));
assert.ok(stage && grade && room, "existing stage, grade and room are required for the isolated flow");

const ids = {
  student: nextStudentId(workingState.students, stage),
  teacher: nextNumericId(workingState.teachers, 1000),
  price: nextNumericId(workingState.pricing, 1000),
  booking: nextNumericId(workingState.bookings, 1000),
  session: nextNumericId(workingState.sessions, 1000),
  expense: nextNumericId(workingState.expenses, 1000),
  payment: nextNumericId(workingState.debtPayments ?? [], 1000),
  audit: String(Date.now()),
};

const testStudent = {
  id: ids.student,
  name: `طالب اختبار النظام ${suffix}`,
  phone: `010${suffix.padStart(8, "0")}`.slice(0, 11),
  stage,
  grade,
  active: true,
};
const testTeacher = {
  id: ids.teacher,
  name: `مدرس اختبار النظام ${suffix}`,
  phone: `011${suffix.padStart(8, "0")}`.slice(0, 11),
  assignments: [{ stage, grade, subject: testSubject }],
  active: true,
};
const testPrice = {
  id: ids.price,
  teacherId: ids.teacher,
  stage,
  grade,
  subject: testSubject,
  studentPrice: 100,
  teacherFee: 70,
};
const testBooking = {
  id: ids.booking,
  studentId: ids.student,
  teacherId: ids.teacher,
  stage,
  grade,
  subject: testSubject,
  bookingFee: 25,
  createdAt: "2099-12-31",
  active: true,
};
const testSession = {
  id: ids.session,
  teacherId: ids.teacher,
  stage,
  grade,
  subject: testSubject,
  room,
  date: "2099-12-31",
  scheduledTime: "23:57",
  status: "scheduled",
  studentIds: [ids.student],
  studentPrice: 100,
  teacherFee: 70,
  studentPayments: { [ids.student]: 60 },
};
const testExpense = {
  id: ids.expense,
  category: "أخرى",
  amount: 15,
  date: "2099-12-31",
  description: `مصروف اختبار النظام ${suffix}`,
};
const testAudit = {
  id: ids.audit,
  action: "اختبار دورة النظام",
  details: `بيانات اختبار معزولة ${suffix}`,
  time: "الآن",
  tone: "blue",
};

workingState.subjectCatalog = {
  ...workingState.subjectCatalog,
  [stage]: [...workingState.subjectCatalog[stage], testSubject],
};
workingState.students = [...workingState.students, testStudent];
workingState.teachers = [...workingState.teachers, testTeacher];
workingState.pricing = [...workingState.pricing, testPrice];
workingState.bookings = [...workingState.bookings, testBooking];
workingState.sessions = [testSession, ...workingState.sessions];
workingState.expenses = [testExpense, ...workingState.expenses];
workingState.audit = [testAudit, ...workingState.audit];
workingState.debtPayments = workingState.debtPayments ?? [];

let testWritten = false;
async function saveState(nextState, expectedStatus = 200, baseVersion = version) {
  nextState.savedAt = new Date().toISOString();
  const result = await site("/api/state", { method: "PUT", body: JSON.stringify({ state: nextState, baseVersion }) }, receptionCookie);
  assert.equal(result.response.status, expectedStatus, typeof result.body === "object" ? result.body?.error : String(result.body));
  if (expectedStatus === 200) {
    assert.equal(result.body.ok, true);
    version = Number(result.body.version);
  }
  return result;
}

try {
  const duplicatePriceState = structuredClone(workingState);
  duplicatePriceState.pricing = [{ ...testPrice, id: String(Number(ids.price) + 1) }, ...duplicatePriceState.pricing];
  const duplicatePriceResult = await saveState(duplicatePriceState, 409);
  assert.match(duplicatePriceResult.body.error, /سعر|المرحلة/, "duplicate pricing must be rejected before database synchronization");

  const roomScheduleConflict = structuredClone(workingState);
  roomScheduleConflict.sessions = [{ ...testSession, id: String(Number(ids.session) + 2), studentIds: [] }, ...roomScheduleConflict.sessions];
  const roomScheduleResult = await saveState(roomScheduleConflict, 409);
  assert.match(roomScheduleResult.body.error, /القاعة/, "same room/date/time scheduling must be rejected clearly");

  await saveState(workingState);
  testWritten = true;

  const [studentRow] = await supabase(`students?id=eq.${ids.student}&select=id,full_name,phone,active`);
  const [teacherRow] = await supabase(`teachers?id=eq.${ids.teacher}&select=id,full_name,phone,active`);
  const assignments = await supabase(`teacher_assignments?teacher_id=eq.${ids.teacher}&select=teacher_id,active`);
  const [subjectRow] = await supabase(`subjects?name=eq.${encodeURIComponent(testSubject)}&select=id,name,active`);
  const [priceRow] = await supabase(`price_rules?subject_id=eq.${subjectRow.id}&teacher_id=eq.${ids.teacher}&active=eq.true&select=id,teacher_id,student_price,teacher_fee_per_student`);
  const [bookingRow] = await supabase(`advance_bookings?id=eq.${ids.booking}&select=id,booking_fee,active`);
  const [sessionRow] = await supabase(`lesson_sessions?id=eq.${ids.session}&select=id,status,student_price_snapshot,teacher_fee_snapshot`);
  const [attendanceRow] = await supabase(`session_attendance?session_id=eq.${ids.session}&student_id=eq.${ids.student}&select=paid_cash`);
  const [expenseRow] = await supabase(`center_expenses?id=eq.${ids.expense}&select=id,amount,description`);
  const auditRows = await supabase(`audit_log?entity_type=eq.center_state&entity_id=eq.${ids.audit}&select=entity_id,action`);

  assert.equal(String(studentRow.id), ids.student);
  assert.equal(studentRow.full_name, testStudent.name);
  assert.equal(String(teacherRow.id), ids.teacher);
  assert.equal(assignments.length, 1);
  assert.equal(subjectRow.active, true);
  assert.equal(Number(priceRow.student_price), 100);
  assert.equal(String(priceRow.teacher_id), ids.teacher);
  assert.equal(Number(bookingRow.booking_fee), 25);
  assert.equal(sessionRow.status, "scheduled");
  assert.equal(Number(attendanceRow.paid_cash), 60);
  assert.equal(Number(expenseRow.amount), 15);
  assert.equal(auditRows.length, 1);

  const staleState = structuredClone(workingState);
  staleState.audit = [
    {
      ...testAudit,
      id: String(Number(ids.audit) + 1),
      details: "stale write must fail",
    },
    ...staleState.audit,
  ];
  const staleResult = await saveState(staleState, 409, version - 1);
  assert.equal(staleResult.body.conflict, true, "stale device writes must return a recoverable conflict");

  workingState.sessions = workingState.sessions.map((session) => (session.id === ids.session ? { ...session, status: "active", startedAt: "23:58" } : session));
  await saveState(workingState);
  assert.equal((await supabase(`lesson_sessions?id=eq.${ids.session}&select=status,started_at`))[0].status, "active");

  const activeRoomConflict = structuredClone(workingState);
  activeRoomConflict.sessions = [
    {
      ...testSession,
      id: String(Number(ids.session) + 3),
      status: "active",
      startedAt: "23:59",
      scheduledTime: "23:59",
      studentIds: [],
    },
    ...activeRoomConflict.sessions,
  ];
  const activeRoomResult = await saveState(activeRoomConflict, 409);
  assert.match(activeRoomResult.body.error, /القاعة/, "two active lessons in one room must be rejected clearly");

  const activeStudentConflict = structuredClone(workingState);
  activeStudentConflict.sessions = [
    {
      ...testSession,
      id: String(Number(ids.session) + 1),
      room: workingState.rooms[1] ?? room,
      status: "active",
      startedAt: "23:59",
    },
    ...activeStudentConflict.sessions,
  ];
  const conflictResult = await saveState(activeStudentConflict, 409);
  assert.equal(conflictResult.body.conflict, true, "one student cannot be stored in two active lessons");

  workingState.sessions = workingState.sessions.map((session) => (session.id === ids.session ? { ...session, status: "postponed" } : session));
  await saveState(workingState);
  assert.equal((await supabase(`lesson_sessions?id=eq.${ids.session}&select=status`))[0].status, "postponed");

  workingState.sessions = workingState.sessions.map((session) => (session.id === ids.session ? { ...session, status: "active", startedAt: "23:59" } : session));
  await saveState(workingState);
  workingState.sessions = workingState.sessions.map((session) => (session.id === ids.session ? { ...session, status: "ended", endedAt: "23:59" } : session));
  workingState.debtPayments = [
    {
      id: ids.payment,
      studentId: ids.student,
      sessionId: ids.session,
      amount: 40,
      date: "2099-12-31",
      note: "سداد كامل من اختبار النظام",
    },
    ...workingState.debtPayments,
  ];
  await saveState(workingState);

  const [endedRow] = await supabase(`lesson_sessions?id=eq.${ids.session}&select=status,ended_at`);
  const [debtRow] = await supabase(`student_debt_payments?id=eq.${ids.payment}&select=student_id,session_id,amount`);
  const [financialRow] = await supabase(`session_financial_summary?id=eq.${ids.session}&select=gross_value,collected_cash,shortages,teacher_due,center_net_profit`);
  assert.equal(endedRow.status, "ended");
  assert.equal(Number(debtRow.amount), 40);
  assert.deepEqual(
    {
      gross: Number(financialRow.gross_value),
      collected: Number(financialRow.collected_cash),
      shortageAtAttendance: Number(financialRow.shortages),
      teacherDue: Number(financialRow.teacher_due),
      centerNetAtAttendance: Number(financialRow.center_net_profit),
    },
    {
      gross: 100,
      collected: 60,
      shortageAtAttendance: 40,
      teacherDue: 70,
      centerNetAtAttendance: -10,
    },
  );
  const savedSession = workingState.sessions.find((session) => session.id === ids.session);
  const paidLater = workingState.debtPayments.filter((payment) => payment.sessionId === ids.session && payment.studentId === ids.student).reduce((sum, payment) => sum + payment.amount, 0);
  assert.equal(Math.max(0, savedSession.studentPrice - savedSession.studentPayments[ids.student] - paidLater), 0, "full debt settlement must clear the student's current outstanding balance");

  workingState.students = workingState.students.map((student) => (student.id === ids.student ? { ...student, active: false } : student));
  workingState.teachers = workingState.teachers.map((teacher) => (teacher.id === ids.teacher ? { ...teacher, active: false } : teacher));
  workingState.bookings = workingState.bookings.map((booking) => (booking.id === ids.booking ? { ...booking, active: false } : booking));
  await saveState(workingState);
  assert.equal((await supabase(`students?id=eq.${ids.student}&select=active`))[0].active, false);
  assert.equal((await supabase(`teachers?id=eq.${ids.teacher}&select=active`))[0].active, false);
  assert.equal((await supabase(`advance_bookings?id=eq.${ids.booking}&select=active`))[0].active, false);
  assert.equal((await supabase(`lesson_sessions?id=eq.${ids.session}&select=id`)).length, 1, "archiving entities must preserve historical lessons");

  workingState.teachers = workingState.teachers.map((teacher) => (teacher.id === ids.teacher ? { ...teacher, active: true } : teacher));
  await saveState(workingState);
  assert.equal((await supabase(`teachers?id=eq.${ids.teacher}&select=active`))[0].active, true, "archived teacher must be restorable");
} finally {
  if (testWritten) {
    const latestResult = await site("/api/state", { cache: "no-store" }, receptionCookie);
    assert.equal(latestResult.response.status, 200, "latest state must load for cleanup");
    const clean = structuredClone(latestResult.body.state);
    clean.students = clean.students.filter((item) => item.id !== ids.student);
    clean.teachers = clean.teachers.filter((item) => item.id !== ids.teacher);
    clean.pricing = clean.pricing.filter((item) => item.id !== ids.price);
    clean.bookings = clean.bookings.filter((item) => item.id !== ids.booking);
    clean.sessions = clean.sessions.filter((item) => item.id !== ids.session && item.id !== String(Number(ids.session) + 1));
    clean.expenses = clean.expenses.filter((item) => item.id !== ids.expense);
    clean.debtPayments = (clean.debtPayments ?? []).filter((item) => item.id !== ids.payment);
    clean.audit = clean.audit.filter((item) => ![ids.audit, String(Number(ids.audit) + 1)].includes(item.id));
    clean.subjectCatalog = {
      ...clean.subjectCatalog,
      [stage]: clean.subjectCatalog[stage].filter((subject) => subject !== testSubject),
    };
    version = Number(latestResult.body.version);
    await saveState(clean);
  }
}

for (const [table, id] of [
  ["students", ids.student],
  ["teachers", ids.teacher],
  ["advance_bookings", ids.booking],
  ["lesson_sessions", ids.session],
  ["center_expenses", ids.expense],
  ["student_debt_payments", ids.payment],
]) {
  assert.equal((await supabase(`${table}?id=eq.${id}&select=id`)).length, 0, `${table} test record must be removed after verification`);
}

console.log(
  JSON.stringify({
    passed: true,
    flows: ["authentication and role boundaries", "student, teacher, subject and price persistence", "advance booking revenue persistence", "lesson scheduled-active-postponed-active-ended lifecycle", "duplicate price, room schedule and active room protection", "partial attendance payment and later debt settlement", "expense and audit persistence", "archiving, historical preservation and teacher restoration", "stale-device conflict protection", "isolated test data cleanup"],
  }),
);
