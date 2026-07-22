export type FinancialSession = {
  id: string;
  date?: string;
  status: string;
  studentIds: string[];
  studentPrice: number;
  teacherFee: number;
  studentPayments?: Record<string, number>;
  outstandingShortage?: number;
};

export type DebtPaymentRecord = {
  id: string;
  studentId: string;
  sessionId: string;
  amount: number;
  date: string;
  note?: string;
};

export type SessionFinancials = {
  fullTotal: number;
  shortages: number;
  collected: number;
  teacherDue: number;
  centerNet: number;
};

export type DebtPaymentAllocation = {
  sessionId: string;
  amount: number;
};

export type AnalyticsProfitInput = {
  fullSessionValue: number;
  teacherDue: number;
  sessionShortages: number;
  debtRecovery: number;
  debtRecoveryAlreadyReflected?: number;
  bookingRevenue: number;
  expenseTotal: number;
  sessionCount: number;
};

export function calculateAnalyticsProfit(input: AnalyticsProfitInput) {
  const sessionNet = input.fullSessionValue - input.teacherDue - input.sessionShortages;
  const additiveDebtRecovery = Math.max(0, input.debtRecovery - (input.debtRecoveryAlreadyReflected ?? 0));
  const net = sessionNet + additiveDebtRecovery + input.bookingRevenue - input.expenseTotal;
  const averageRevenue = input.sessionCount > 0 ? sessionNet / input.sessionCount : 0;
  return { sessionNet, net, averageRevenue, additiveDebtRecovery };
}

export function normalizePaidAmount(value: unknown, fullPrice: number) {
  const safeFullPrice = Math.max(0, Number.isFinite(fullPrice) ? fullPrice : 0);
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return safeFullPrice;
  return Math.min(safeFullPrice, Math.max(0, numericValue));
}

export function normalizeAttendancePaymentTotal(value: unknown, lessonPrice: number, oldDebt: number) {
  const maximum = Math.max(0, lessonPrice) + Math.max(0, oldDebt);
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(maximum, Math.max(0, numericValue));
}

export function paidDuringSession(session: FinancialSession, studentId: string) {
  const recorded = session.studentPayments?.[studentId];
  return normalizePaidAmount(recorded === undefined ? session.studentPrice : recorded, session.studentPrice);
}

export function shortageForAttendance(session: FinancialSession, studentId: string) {
  return Math.max(0, session.studentPrice - paidDuringSession(session, studentId));
}

export function getSessionFinancials(session: FinancialSession): SessionFinancials {
  const fullTotal = session.studentIds.length * Math.max(0, session.studentPrice);
  const collected = session.studentIds.reduce((sum, studentId) => sum + paidDuringSession(session, studentId), 0);
  const shortagesAtAttendance = Math.max(0, fullTotal - collected);
  const shortages = session.outstandingShortage === undefined
    ? shortagesAtAttendance
    : Math.min(shortagesAtAttendance, Math.max(0, session.outstandingShortage));
  const teacherDue = session.studentIds.length * Math.max(0, session.teacherFee);
  return { fullTotal, shortages, collected, teacherDue, centerNet: collected - teacherDue };
}

export function settledForAttendance(payments: DebtPaymentRecord[], sessionId: string, studentId: string) {
  return payments
    .filter((payment) => payment.sessionId === sessionId && payment.studentId === studentId)
    .reduce((sum, payment) => sum + Math.max(0, payment.amount), 0);
}

export function outstandingForAttendance(session: FinancialSession, studentId: string, payments: DebtPaymentRecord[]) {
  return Math.max(0, shortageForAttendance(session, studentId) - settledForAttendance(payments, session.id, studentId));
}

export function outstandingForSession(session: FinancialSession, payments: DebtPaymentRecord[]) {
  return session.studentIds.reduce((sum, studentId) => sum + outstandingForAttendance(session, studentId, payments), 0);
}

export function outstandingForStudent(sessions: FinancialSession[], payments: DebtPaymentRecord[], studentId: string) {
  return sessions
    .filter((session) => session.studentIds.includes(studentId))
    .reduce((sum, session) => sum + outstandingForAttendance(session, studentId, payments), 0);
}

export function allocateDebtPayment(
  sessions: FinancialSession[],
  payments: DebtPaymentRecord[],
  studentId: string,
  amount: number,
): DebtPaymentAllocation[] {
  let remaining = Math.max(0, Number.isFinite(amount) ? amount : 0);
  if (!remaining) return [];

  const eligibleSessions = sessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session.studentIds.includes(studentId))
    .sort((left, right) => {
      const dateOrder = (left.session.date ?? "").localeCompare(right.session.date ?? "");
      return dateOrder || left.index - right.index;
    });

  const allocations: DebtPaymentAllocation[] = [];
  for (const { session } of eligibleSessions) {
    const outstanding = outstandingForAttendance(session, studentId, payments);
    const applied = Math.min(outstanding, remaining);
    if (applied > 0) allocations.push({ sessionId: session.id, amount: applied });
    remaining -= applied;
    if (remaining <= 0) break;
  }
  return allocations;
}
