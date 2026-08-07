import assert from "node:assert/strict";
import test from "node:test";
import { emptyCenterState, findActiveStudentStateConflict, findCenterStateBusinessConflict, findSubjectCatalogDeletionConflict, findSubjectUsageConflict, removedSubjectCatalogEntries, type CenterStatePayload } from "../lib/center-state.ts";

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

const session = (id: string, status: string, studentIds: string[]) => ({
  id,
  status,
  subject: `subject-${id}`,
  studentIds,
});

test("rejects the same student in two active sessions", () => {
  const conflict = findActiveStudentStateConflict({
    ...emptyCenterState,
    sessions: [session("1", "active", ["101001"]), session("2", "active", ["101001"])],
  });
  assert.equal(conflict?.studentId, "101001");
  assert.equal(conflict?.firstSession.sessionId, "1");
  assert.equal(conflict?.secondSession.sessionId, "2");
});

test("allows the same student when only one session is active", () => {
  const conflict = findActiveStudentStateConflict({
    ...emptyCenterState,
    sessions: [session("1", "active", ["101001"]), session("2", "scheduled", ["101001"])],
  });
  assert.equal(conflict, null);
});

test("rejects two active sessions in the same room", () => {
  const conflict = findCenterStateBusinessConflict({
    ...emptyCenterState,
    sessions: [
      {
        ...session("1", "active", []),
        room: "قاعة 1",
        date: "2026-07-22",
        scheduledTime: "17:00",
      },
      {
        ...session("2", "active", []),
        room: "قاعة 1",
        date: "2026-07-22",
        scheduledTime: "18:00",
      },
    ],
  });
  assert.equal(conflict?.kind, "room-active");
});

test("rejects two non-ended sessions scheduled in the same room and time", () => {
  const conflict = findCenterStateBusinessConflict({
    ...emptyCenterState,
    sessions: [
      {
        ...session("1", "scheduled", []),
        room: "قاعة 2",
        date: "2026-07-22",
        scheduledTime: "17:00",
      },
      {
        ...session("2", "postponed", []),
        room: "قاعة 2",
        date: "2026-07-22",
        scheduledTime: "17:00",
      },
    ],
  });
  assert.equal(conflict?.kind, "room-schedule");
});

test("rejects duplicate price rules for the same teacher, stage, grade and subject", () => {
  const rule = {
    id: "1",
    teacherId: "7",
    stage: "المرحلة الإعدادية",
    grade: "الصف الأول",
    subject: "الرياضيات",
    studentPrice: 100,
    teacherFee: 70,
  };
  const conflict = findCenterStateBusinessConflict({
    ...emptyCenterState,
    teachers: [{ id: "7", assignments: [{ stage: rule.stage, grade: rule.grade, subject: rule.subject }] }],
    pricing: [rule, { ...rule, id: "2" }],
  });
  assert.equal(conflict?.kind, "duplicate-price");
});

test("allows different teachers to have different prices for the same assignment", () => {
  const base = {
    stage: "المرحلة الإعدادية",
    grade: "الصف الأول",
    subject: "الرياضيات",
    studentPrice: 100,
    teacherFee: 70,
  };
  const conflict = findCenterStateBusinessConflict({
    ...emptyCenterState,
    teachers: [
      { id: "7", assignments: [{ stage: base.stage, grade: base.grade, subject: base.subject }] },
      { id: "8", assignments: [{ stage: base.stage, grade: base.grade, subject: base.subject }] },
    ],
    pricing: [
      { id: "1", teacherId: "7", ...base },
      { id: "2", teacherId: "8", ...base, studentPrice: 120, teacherFee: 80 },
    ],
  });
  assert.equal(conflict, null);
});

test("rejects duplicate bulk-booking rows for the same student and teacher assignment", () => {
  const booking = { id: "1", studentId: "101001", teacherId: "7", stage: "المرحلة الإعدادية", grade: "الصف الأول", subject: "الرياضيات", bookingFee: 15 };
  const conflict = findCenterStateBusinessConflict({
    ...emptyCenterState,
    bookings: [booking, { ...booking, id: "2", bookingFee: 20 }],
  });
  assert.equal(conflict?.kind, "duplicate-booking");
});

test("detects only subjects removed from their matching stage", () => {
  const nextState = {
    ...emptyCenterState,
    subjectCatalog: {
      ...emptyCenterState.subjectCatalog,
      "المرحلة الإعدادية": ["اللغة العربية", "الرياضيات", "العلوم", "الدراسات الاجتماعية"],
    },
  };
  assert.deepEqual(removedSubjectCatalogEntries(emptyCenterState, nextState), [
    { stage: "المرحلة الإعدادية", subject: "اللغة الإنجليزية" },
  ]);
});

test("allows deleting an unused subject while preserving other catalog entries", () => {
  const preparatorySubjects = emptyCenterState.subjectCatalog["المرحلة الإعدادية"];
  if (!isStringArray(preparatorySubjects)) assert.fail("Expected the preparatory subject catalog to contain strings");
  const nextState: CenterStatePayload = {
    ...emptyCenterState,
    subjectCatalog: {
      ...emptyCenterState.subjectCatalog,
      "المرحلة الإعدادية": preparatorySubjects.filter((subject) => subject !== "العلوم"),
    },
  };
  assert.equal(findSubjectCatalogDeletionConflict(emptyCenterState, nextState), null);
  assert.equal((nextState.subjectCatalog["المرحلة الابتدائية"] as string[]).includes("العلوم"), true);
});

test("blocks deleting the final subject in a stage", () => {
  const currentState = {
    ...emptyCenterState,
    subjectCatalog: { ...emptyCenterState.subjectCatalog, "المرحلة الإعدادية": ["العلوم"] },
  };
  const nextState = {
    ...currentState,
    subjectCatalog: { ...currentState.subjectCatalog, "المرحلة الإعدادية": [] },
  };
  assert.equal(findSubjectCatalogDeletionConflict(currentState, nextState)?.kind, "last-subject");
});

test("blocks deleting a subject assigned to a teacher", () => {
  const conflict = findSubjectUsageConflict(
    {
      teachers: [{ id: "7", name: "أ/ أحمد", assignments: [{ stage: "المرحلة الإعدادية", grade: "الصف الأول", subject: "العلوم" }] }],
      pricing: [],
      bookings: [],
      sessions: [],
    },
    "المرحلة الإعدادية",
    "العلوم",
  );
  assert.equal(conflict?.kind, "teacher-assignment");
});

test("blocks deleting a subject with a price, active booking, or open session", () => {
  const stage = "المرحلة الإعدادية";
  const subject = "العلوم";
  const base = { teachers: [], pricing: [], bookings: [], sessions: [] };
  assert.equal(findSubjectUsageConflict({ ...base, pricing: [{ stage, subject }] }, stage, subject)?.kind, "price-rule");
  assert.equal(findSubjectUsageConflict({ ...base, bookings: [{ stage, subject, active: true }] }, stage, subject)?.kind, "active-booking");
  assert.equal(findSubjectUsageConflict({ ...base, sessions: [{ stage, subject, status: "scheduled" }] }, stage, subject)?.kind, "open-session");
});

test("keeps ended sessions and archived bookings as history without blocking catalog removal", () => {
  const stage = "المرحلة الإعدادية";
  const subject = "العلوم";
  const conflict = findSubjectUsageConflict(
    {
      teachers: [],
      pricing: [],
      bookings: [{ stage, subject, active: false }],
      sessions: [{ stage, subject, status: "ended" }],
    },
    stage,
    subject,
  );
  assert.equal(conflict, null);
});
