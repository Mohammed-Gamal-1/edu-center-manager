import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateDebtPayment,
  getSessionFinancials,
  normalizeAttendancePaymentTotal,
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

test("manual attendance payment cannot exceed lesson price without old debt", () => {
  assert.equal(normalizeAttendancePaymentTotal(50, 25, 0), 25);
  assert.equal(normalizeAttendancePaymentTotal(100, 25, 15), 40);
  assert.equal(normalizeAttendancePaymentTotal(-5, 25, 0), 0);
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

test("active lesson shortages appear immediately in the student's debt", () => {
  assert.equal(outstandingForStudent([{ ...partialSession, status: "active" }], [], "100"), 40);
});

test("a combined payment clears old lesson debts from oldest to newest", () => {
  const sessions = [
    { ...partialSession, id: "12", date: "2026-07-18", studentPayments: { "100": 80, "101": 100 } },
    { ...partialSession, id: "11", date: "2026-07-17" },
  ];
  const allocations = allocateDebtPayment(sessions, [], "100", 60);
  assert.deepEqual(allocations, [
    { sessionId: "11", amount: 40 },
    { sessionId: "12", amount: 20 },
  ]);
  const payments = allocations.map((allocation, index) => ({
    id: String(index + 1),
    studentId: "100",
    sessionId: allocation.sessionId,
    amount: allocation.amount,
    date: "2026-07-19",
  }));
  assert.equal(outstandingForStudent(sessions, payments, "100"), 0);
});

test("debt allocation never applies more than the student owes", () => {
  assert.deepEqual(allocateDebtPayment([partialSession], [], "100", 100), [{ sessionId: "11", amount: 40 }]);
});
