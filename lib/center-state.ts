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
