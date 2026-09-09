export const NO_PHONE_SENTINEL = "00000000000";
export const CENTER_CHANNEL_URL = "https://whatsapp.com/channel/0029VbDCHP55fM5XCPuito3J";

export type WhatsAppPhoneClassification =
  | { status: "valid"; localPhone: string; whatsappPhone: string }
  | { status: "missing" }
  | { status: "invalid" };

export type TeacherSessionMessageInput = {
  teacherName: string;
  subject: string;
  grade: string;
  attendanceCount: number;
  teacherDue: number;
};

export type WhatsAppShareResolution =
  | { status: "ready"; localPhone: string; url: string }
  | { status: "skipped" }
  | { status: "needs-correction" };

export function classifyWhatsAppPhone(phone: string): WhatsAppPhoneClassification {
  if (phone === NO_PHONE_SENTINEL) return { status: "missing" };
  if (!/^01[0125]\d{8}$/.test(phone)) return { status: "invalid" };

  return {
    status: "valid",
    localPhone: phone,
    whatsappPhone: `20${phone.slice(1)}`,
  };
}

export function buildTeacherSessionMessage(input: TeacherSessionMessageInput) {
  const teacherName = input.teacherName.replace(/^(?:أ|ا)\/\s*/u, "").trim();
  const attendanceCount = Math.max(0, Math.trunc(input.attendanceCount));
  const teacherDue = Math.max(0, Number.isFinite(input.teacherDue) ? input.teacherDue : 0);

  return [
    `أهلاً أ/ ${teacherName} 🌷`,
    "",
    "تفاصيل حصة حضرتك اليوم:",
    `📚 ${input.subject} – ${input.grade}`,
    `👥 الحضور: ${attendanceCount} طالب`,
    `💰 المبلغ: ${teacherDue} جنيه`,
    "",
    "شكرًا لحضرتك، وبالتوفيق دائمًا ❤️",
    "📍 سنتر التفوق التعليمي",
  ].join("\n");
}

export function buildStudentChannelMessage() {
  return [
    "📢 أهلاً بيك في سنتر التفوق التعليمي ❤️",
    "علشان يوصلك مواعيد الحصص وأي تنبيهات أو تغييرات أول بأول، انضم للقناة من هنا 👇",
    `🔗 ${CENTER_CHANNEL_URL}`,
    "✅ فعل الإشعارات علشان ميفوتكش أي جديد.",
    "📍 سنتر التفوق التعليمي – نزلة البرشا",
  ].join("\n");
}

export function buildWhatsAppWebUrl(phone: string, message: string) {
  const classification = classifyWhatsAppPhone(phone);
  if (classification.status !== "valid") return null;

  const params = new URLSearchParams({
    phone: classification.whatsappPhone,
    text: message,
  });
  return `https://web.whatsapp.com/send?${params.toString()}`;
}

export function resolveWhatsAppShare(phone: string, message: string): WhatsAppShareResolution {
  const classification = classifyWhatsAppPhone(phone);
  if (classification.status === "missing") return { status: "skipped" };
  if (classification.status === "invalid") return { status: "needs-correction" };

  return {
    status: "ready",
    localPhone: classification.localPhone,
    url: buildWhatsAppWebUrl(classification.localPhone, message)!,
  };
}
