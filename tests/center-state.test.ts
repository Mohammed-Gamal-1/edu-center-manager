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

test("rejects duplicate price rules for the same stage, grade and subject", () => {
  const rule = {
    id: "1",
    stage: "المرحلة الإعدادية",
    grade: "الصف الأول",
    subject: "الرياضيات",
  };
  const conflict = findCenterStateBusinessConflict({
    ...emptyCenterState,
    pricing: [rule, { ...rule, id: "2" }],
  });
  assert.equal(conflict?.kind, "duplicate-price");
});
