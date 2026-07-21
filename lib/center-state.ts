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
        return {
          studentId: rawStudentId,
          firstSession: existing,
          secondSession: { sessionId, subject },
        };
      }
      activeByStudent.set(rawStudentId, { sessionId, subject });
    }
  }
  return null;
}

export type CenterStateBusinessConflict = {
  kind: "duplicate-id" | "duplicate-price" | "duplicate-room" | "room-schedule" | "room-active";
  message: string;
};

export function findCenterStateBusinessConflict(state: CenterStatePayload): CenterStateBusinessConflict | null {
  for (const collectionName of ["students", "teachers", "pricing", "sessions", "bookings", "expenses", "debtPayments", "audit"] as const) {
    const collection = collectionName === "debtPayments" ? (state.debtPayments ?? []) : state[collectionName];
    const ids = new Set<string>();
    for (const rawItem of collection) {
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) continue;
      const id = String((rawItem as Record<string, unknown>).id ?? "");
      if (!id) continue;
      if (ids.has(id))
        return {
          kind: "duplicate-id",
          message: `يوجد رقم مكرر داخل بيانات ${collectionName}: ${id}`,
        };
      ids.add(id);
    }
  }

  const normalizedRooms = new Set<string>();
  for (const room of state.rooms) {
    const normalized = room.trim().toLocaleLowerCase("ar");
    if (normalizedRooms.has(normalized)) return { kind: "duplicate-room", message: `اسم القاعة مكرر: ${room}` };
    normalizedRooms.add(normalized);
  }

  const priceKeys = new Set<string>();
  for (const rawRule of state.pricing) {
    if (!rawRule || typeof rawRule !== "object" || Array.isArray(rawRule)) continue;
    const rule = rawRule as Record<string, unknown>;
    const key = [rule.stage, rule.grade, rule.subject]
      .map((value) =>
        String(value ?? "")
          .trim()
          .toLocaleLowerCase("ar"),
      )
      .join("\u0000");
    if (priceKeys.has(key))
      return {
        kind: "duplicate-price",
        message: "يوجد أكثر من سعر لنفس المرحلة والصف والمادة",
      };
    priceKeys.add(key);
  }

  const activeRooms = new Map<string, string>();
  const scheduledRooms = new Map<string, string>();
  for (const rawSession of state.sessions) {
    if (!rawSession || typeof rawSession !== "object" || Array.isArray(rawSession)) continue;
    const session = rawSession as Record<string, unknown>;
    const id = String(session.id ?? "");
    const room = String(session.room ?? "")
      .trim()
      .toLocaleLowerCase("ar");
    const status = String(session.status ?? "");
    if (!room || status === "ended") continue;
    if (status === "active") {
      const existing = activeRooms.get(room);
      if (existing && existing !== id)
        return {
          kind: "room-active",
          message: `لا يمكن تشغيل حصتين في القاعة ${String(session.room ?? "")} في نفس الوقت`,
        };
      activeRooms.set(room, id);
    }
    const scheduleKey = `${room}\u0000${String(session.date ?? "")}\u0000${String(session.scheduledTime ?? "")}`;
    const existing = scheduledRooms.get(scheduleKey);
    if (existing && existing !== id)
      return {
        kind: "room-schedule",
        message: `القاعة ${String(session.room ?? "")} محجوزة بالفعل في نفس التاريخ والوقت`,
      };
    scheduledRooms.set(scheduleKey, id);
  }
  return null;
}
