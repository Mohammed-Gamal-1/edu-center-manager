export type CenterStatePayload = {
  students: unknown[];
  teachers: unknown[];
  pricing: unknown[];
  sessions: unknown[];
  bookings: unknown[];
  expenses: unknown[];
  debtPayments?: unknown[];
  audit: unknown[];
  subjectCatalog: Record<string, unknown>;
  rooms: string[];
  savedAt: string;
};

export const emptyCenterState: CenterStatePayload = {
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

export function isCenterStatePayload(value: unknown): value is CenterStatePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const arrayKeys = ["students", "teachers", "pricing", "sessions", "bookings", "expenses", "audit"];
  if (!arrayKeys.every((key) => Array.isArray(payload[key]))) return false;
  if (payload.debtPayments !== undefined && !Array.isArray(payload.debtPayments)) return false;
  if (!Array.isArray(payload.rooms) || payload.rooms.length > 100 || !payload.rooms.every((room) => typeof room === "string" && room.trim().length > 0 && room.length <= 100)) return false;
  if (!payload.subjectCatalog || typeof payload.subjectCatalog !== "object" || Array.isArray(payload.subjectCatalog)) return false;
  if (typeof payload.savedAt !== "string" || Number.isNaN(Date.parse(payload.savedAt))) return false;
  return true;
}

export function findActiveStudentStateConflict(state: CenterStatePayload) {
  const activeByStudent = new Map<string, { sessionId: string; subject: string }>();
  for (const rawSession of state.sessions) {
    if (!rawSession || typeof rawSession !== "object" || Array.isArray(rawSession)) continue;
    const session = rawSession as Record<string, unknown>;
    if (session.status !== "active" || !Array.isArray(session.studentIds)) continue;
    const sessionId = String(session.id ?? "");
    const subject = typeof session.subject === "string" ? session.subject : "حصة أخرى";
    for (const rawStudentId of new Set(session.studentIds.map(String))) {
      const existing = activeByStudent.get(rawStudentId);
      if (existing && existing.sessionId !== sessionId) {
        return { studentId: rawStudentId, firstSession: existing, secondSession: { sessionId, subject } };
      }
      activeByStudent.set(rawStudentId, { sessionId, subject });
    }
  }
  return null;
}
