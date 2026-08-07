import assert from "node:assert/strict";
import test from "node:test";
import { emptyCenterState, findActiveStudentStateConflict, findCenterStateBusinessConflict } from "../lib/center-state.ts";

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
