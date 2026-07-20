export const STUDENT_STAGE_ID_STARTS: Record<string, number> = {
  "المرحلة الابتدائية": 101001,
  "المرحلة الإعدادية": 201001,
  "المرحلة الثانوية": 301001,
};

export function nextStudentIdForStage(studentIds: string[], stage: string) {
  const start = STUDENT_STAGE_ID_STARTS[stage];
  if (!start) throw new Error("Unknown education stage");
  const prefixFloor = Math.floor(start / 10_000) * 10_000;
  const prefixCeiling = prefixFloor + 9_999;
  const highest = studentIds
    .map(Number)
    .filter((id) => Number.isInteger(id) && id >= start && id <= prefixCeiling)
    .reduce((maximum, id) => Math.max(maximum, id), start - 1);
  if (highest >= prefixCeiling) throw new Error("Stage student ID range is full");
  return String(highest + 1);
}

export type StudentConflictSession = {
  id: string;
  status: string;
  studentIds: string[];
};

export function findActiveStudentConflict<T extends StudentConflictSession>(sessions: T[], currentSessionId: string, studentId: string) {
  return sessions.find((session) => session.id !== currentSessionId && session.status === "active" && session.studentIds.includes(studentId));
}

export type BookingMatch = {
  studentId: string;
  teacherId: string;
  stage: string;
  grade: string;
  subject: string;
  active: boolean;
};

export function hasMatchingBooking(bookings: BookingMatch[], lesson: Omit<BookingMatch, "studentId" | "active">, studentId: string) {
  return bookings.some((booking) => booking.active
    && booking.studentId === studentId
    && booking.teacherId === lesson.teacherId
    && booking.stage === lesson.stage
    && booking.grade === lesson.grade
    && booking.subject === lesson.subject);
}
