import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateDebtPayment,
  calculateAnalyticsProfit,
  getSessionFinancials,
  normalizeAttendancePaymentTotal,
  outstandingForAttendance,
  outstandingForSession,
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

test("debt settlement clears the current balance without rewriting the historical lesson shortage", () => {
  const partialPayment = [{ id: "1", sessionId: "11", studentId: "100", amount: 25, date: "2026-07-19" }];
  const fullPayment = [{ id: "2", sessionId: "11", studentId: "100", amount: 40, date: "2026-07-20" }];

  assert.equal(outstandingForSession(partialSession, []), 40);
  assert.equal(outstandingForSession(partialSession, partialPayment), 15);
  assert.equal(outstandingForSession(partialSession, fullPayment), 0);
  assert.equal(getSessionFinancials(partialSession).shortages, 40);
});

test("analytics counts a recovered shortage exactly once after it leaves the current shortage balance", () => {
  const beforePayment = calculateAnalyticsProfit({ fullSessionValue: 100, teacherDue: 70, sessionShortages: 40, debtRecovery: 0, bookingRevenue: 0, expenseTotal: 0, sessionCount: 1 });
  const afterPayment = calculateAnalyticsProfit({ fullSessionValue: 100, teacherDue: 70, sessionShortages: 0, debtRecovery: 40, debtRecoveryAlreadyReflected: 40, bookingRevenue: 0, expenseTotal: 0, sessionCount: 1 });

  assert.deepEqual(beforePayment, { sessionNet: -10, net: -10, averageRevenue: -10, additiveDebtRecovery: 0 });
  assert.deepEqual(afterPayment, { sessionNet: 30, net: 30, averageRevenue: 30, additiveDebtRecovery: 0 });
});

test("debt recovered from a lesson outside the selected period is added to period profit", () => {
  assert.deepEqual(
    calculateAnalyticsProfit({ fullSessionValue: 25, teacherDue: 20, sessionShortages: 0, debtRecovery: 40, debtRecoveryAlreadyReflected: 0, bookingRevenue: 0, expenseTotal: 0, sessionCount: 1 }),
    { sessionNet: 5, net: 45, averageRevenue: 5, additiveDebtRecovery: 40 },
  );
});

test("paid-in-full lesson dashboard shows no remaining debt and no duplicated recovery", () => {
  assert.deepEqual(
    calculateAnalyticsProfit({ fullSessionValue: 50, teacherDue: 10, sessionShortages: 0, debtRecovery: 40, debtRecoveryAlreadyReflected: 40, bookingRevenue: 100, expenseTotal: 200, sessionCount: 1 }),
    { sessionNet: 40, net: -60, averageRevenue: 40, additiveDebtRecovery: 0 },
  );
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
