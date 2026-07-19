import assert from "node:assert/strict";
import test from "node:test";
import {
  getSessionFinancials,
  outstandingForAttendance,
  outstandingForStudent,
  paidDuringSession,
} from "../lib/center-finance.ts";

const partialSession = {
  id: "11",
  status: "ended",
  studentIds: ["100", "101"],
  studentPrice: 100,
  teacherFee: 70,
  studentPayments: { "100": 60, "101": 100 },
};

test("defaults an unrecorded attendance to fully paid", () => {
  assert.equal(paidDuringSession({ ...partialSession, studentPayments: undefined }, "100"), 100);
});

test("shortage reduces center cash but never teacher compensation", () => {
  assert.deepEqual(getSessionFinancials(partialSession), {
    fullTotal: 200,
    shortages: 40,
    collected: 160,
    teacherDue: 140,
    centerNet: 20,
  });
});

test("later debt payments clear only the old attendance balance", () => {
  const payments = [{ id: "1", sessionId: "11", studentId: "100", amount: 25, date: "2026-07-19" }];
  assert.equal(outstandingForAttendance(partialSession, "100", payments), 15);
  assert.equal(outstandingForStudent([partialSession], payments, "100"), 15);
  assert.equal(getSessionFinancials(partialSession).teacherDue, 140);
});

test("active lessons do not become collectible old debt before ending", () => {
  assert.equal(outstandingForStudent([{ ...partialSession, status: "active" }], [], "100"), 0);
});

