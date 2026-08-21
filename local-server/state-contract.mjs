const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const emptyCenterState = {
  students: [],
  teachers: [],
  pricing: [],
  sessions: [],
  bookings: [],
  expenses: [],
  debtPayments: [],
  audit: [],
  subjectCatalog: {
    "المرحلة الابتدائية": ["اللغة العربية", "اللغة الإنجليزية", "الرياضيات", "العلوم", "الدراسات الاجتماعية"],
    "المرحلة الإعدادية": ["اللغة العربية", "اللغة الإنجليزية", "الرياضيات", "العلوم", "الدراسات الاجتماعية"],
    "المرحلة الثانوية": ["اللغة العربية", "اللغة الإنجليزية", "الرياضيات", "الفيزياء", "الكيمياء", "الأحياء", "التاريخ", "الجغرافيا"],
  },
  rooms: ["قاعة 1", "قاعة 2", "قاعة 3", "قاعة 4", "قاعة 5"],
  savedAt: new Date(0).toISOString(),
};

export function isCenterStatePayload(value) {
  if (!isRecord(value)) return false;
  const arrayKeys = ["students", "teachers", "pricing", "sessions", "bookings", "expenses", "audit"];
  if (!arrayKeys.every((key) => Array.isArray(value[key]))) return false;
  if (value.debtPayments !== undefined && !Array.isArray(value.debtPayments)) return false;
  if (!Array.isArray(value.rooms) || value.rooms.length > 100 || !value.rooms.every((room) => typeof room === "string" && room.trim() && room.length <= 100)) return false;
  if (!isRecord(value.subjectCatalog)) return false;
  if (typeof value.savedAt !== "string" || Number.isNaN(Date.parse(value.savedAt))) return false;
  return true;
}

const itemId = (value) => (isRecord(value) ? String(value.id ?? "") : "");
const assignmentKey = (value) => isRecord(value) ? [value.stage, value.grade, value.subject].map(String).join("\u0000") : "";

function duplicateIdConflict(state) {
  for (const collectionName of ["students", "teachers", "pricing", "sessions", "bookings", "expenses", "debtPayments", "audit"]) {
    const ids = new Set();
    for (const item of state[collectionName] ?? []) {
      const id = itemId(item);
      if (!id) continue;
      if (ids.has(id)) return `يوجد رقم مكرر داخل بيانات ${collectionName}: ${id}`;
      ids.add(id);
    }
  }
  return null;
}

function activeSessionConflict(state) {
  const activeStudents = new Map();
  const activeRooms = new Map();
  const scheduledRooms = new Map();
  for (const rawSession of state.sessions) {
    if (!isRecord(rawSession)) continue;
    const id = String(rawSession.id ?? "");
    const room = String(rawSession.room ?? "");
    if (rawSession.status === "active") {
      if (activeRooms.has(room)) return `القاعة ${room} مستخدمة في حصتين شغالتين`;
      activeRooms.set(room, id);
      for (const studentId of new Set((rawSession.studentIds ?? []).map(String))) {
        if (activeStudents.has(studentId)) return `الطالب ${studentId} مسجل في حصتين شغالتين`;
        activeStudents.set(studentId, id);
      }
    }
    if (!["ended", "cancelled"].includes(String(rawSession.status ?? ""))) {
      const scheduleKey = [rawSession.date, rawSession.scheduledTime, room].map(String).join("\u0000");
      if (scheduledRooms.has(scheduleKey)) return `يوجد أكثر من حصة في ${room} بنفس الموعد`;
      scheduledRooms.set(scheduleKey, id);
    }
  }
  return null;
}

function pricingConflict(state) {
  const teachers = new Map(state.teachers.filter(isRecord).map((teacher) => [String(teacher.id ?? ""), teacher]));
  const keys = new Set();
  for (const rule of state.pricing) {
    if (!isRecord(rule)) return "بيانات سعر الحصة غير صحيحة";
    const studentPrice = Number(rule.studentPrice);
    const teacherFee = Number(rule.teacherFee);
    if (!Number.isFinite(studentPrice) || !Number.isFinite(teacherFee) || studentPrice < 0 || teacherFee < 0 || teacherFee > studentPrice) {
      return "سعر الطالب وأجر المدرس غير صحيحين";
    }
    const teacherId = String(rule.teacherId ?? "");
    const key = teacherId + "\u0000" + assignmentKey(rule);
    if (keys.has(key)) return "يوجد سعر مكرر لنفس المدرس والصف والمادة";
    keys.add(key);
    const teacher = teacherId ? teachers.get(teacherId) : null;
    if (teacherId && (!teacher || !Array.isArray(teacher.assignments) || !teacher.assignments.some((assignment) => assignmentKey(assignment) === assignmentKey(rule)))) {
      return "قاعدة السعر يجب أن ترتبط بمادة مسجلة للمدرس نفسه";
    }
  }
  return null;
}

function bookingConflict(state) {
  const keys = new Set();
  for (const booking of state.bookings) {
    if (!isRecord(booking)) return "بيانات الحجز المسبق غير صحيحة";
    const fee = Number(booking.bookingFee);
    if (!Number.isFinite(fee) || fee < 0) return "قيمة الحجز المسبق يجب أن تكون رقماً لا يقل عن صفر";
    const key = [booking.studentId, booking.teacherId, booking.stage, booking.grade, booking.subject].map(String).join("\u0000");
    if (keys.has(key)) return "يوجد حجز مسبق مكرر لنفس الطالب والمدرس والمادة";
    keys.add(key);
  }
  return null;
}

function subjectDeletionConflict(currentState, nextState) {
  for (const [stage, currentSubjects] of Object.entries(currentState.subjectCatalog)) {
    if (!Array.isArray(currentSubjects)) continue;
    const nextSubjects = Array.isArray(nextState.subjectCatalog[stage]) ? nextState.subjectCatalog[stage] : [];
    if (currentSubjects.length && !nextSubjects.length) return `لا يمكن حذف آخر مادة في ${stage}`;
    for (const subject of currentSubjects.filter((item) => !nextSubjects.includes(item))) {
      const usedByTeacher = currentState.teachers.some((teacher) => isRecord(teacher) && Array.isArray(teacher.assignments) && teacher.assignments.some((assignment) => isRecord(assignment) && assignment.stage === stage && assignment.subject === subject));
      const usedByPrice = currentState.pricing.some((item) => isRecord(item) && item.stage === stage && item.subject === subject);
      const usedByBooking = currentState.bookings.some((item) => isRecord(item) && item.active !== false && item.stage === stage && item.subject === subject);
      const usedBySession = currentState.sessions.some((item) => isRecord(item) && !["ended", "cancelled"].includes(String(item.status ?? "")) && item.stage === stage && item.subject === subject);
      if (usedByTeacher || usedByPrice || usedByBooking || usedBySession) return `لا يمكن حذف ${subject} لأنها مستخدمة في بيانات حالية`;
    }
  }
  return null;
}

export function validateCenterState(nextState, currentState = null) {
  if (!isCenterStatePayload(nextState)) return "صيغة بيانات السنتر غير صحيحة";
  return (
    duplicateIdConflict(nextState) ||
    activeSessionConflict(nextState) ||
    pricingConflict(nextState) ||
    bookingConflict(nextState) ||
    (currentState ? subjectDeletionConflict(currentState, nextState) : null)
  );
}
