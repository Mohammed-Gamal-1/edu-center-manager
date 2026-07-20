import assert from "node:assert/strict";
import test from "node:test";
import { emptyCenterState, findActiveStudentStateConflict } from "../lib/center-state.ts";

const session = (id: string, status: string, studentIds: string[]) => ({ id, status, subject: `subject-${id}`, studentIds });

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
