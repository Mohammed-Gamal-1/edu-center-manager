import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStudentChannelMessage,
  buildTeacherSessionMessage,
  buildWhatsAppWebUrl,
  classifyWhatsAppPhone,
  resolveWhatsAppShare,
} from "../lib/whatsapp.ts";

test("accepts an eleven-digit Egyptian mobile with no spaces", () => {
  assert.deepEqual(classifyWhatsAppPhone("01012345678"), {
    status: "valid",
    localPhone: "01012345678",
    whatsappPhone: "201012345678",
  });
});

test("treats eleven zeroes as a request to skip WhatsApp", () => {
  assert.deepEqual(classifyWhatsAppPhone("00000000000"), { status: "missing" });
});

test("rejects phone values with spaces, a country code, or the wrong length", () => {
  assert.deepEqual(classifyWhatsAppPhone("010 12345678"), { status: "invalid" });
  assert.deepEqual(classifyWhatsAppPhone("+201012345678"), { status: "invalid" });
  assert.deepEqual(classifyWhatsAppPhone("010123"), { status: "invalid" });
  assert.deepEqual(classifyWhatsAppPhone("02345678901"), { status: "invalid" });
});

test("builds the teacher message with the session teacher due", () => {
  assert.equal(
    buildTeacherSessionMessage({
      teacherName: "أ/ أحمد محمد",
      subject: "الرياضيات",
      grade: "الصف الثالث الإعدادية",
      attendanceCount: 12,
      teacherDue: 840,
    }),
    [
      "أهلاً أ/ أحمد محمد 🌷",
      "",
      "تفاصيل حصة حضرتك اليوم:",
      "📚 الرياضيات – الصف الثالث الإعدادية",
      "👥 الحضور: 12 طالب",
      "💰 المبلغ: 840 جنيه",
      "",
      "شكرًا لحضرتك، وبالتوفيق دائمًا ❤️",
      "📍 سنتر التفوق التعليمي",
    ].join("\n"),
  );
});

test("builds the student channel invitation with a directly usable channel link", () => {
  assert.equal(
    buildStudentChannelMessage(),
    [
      "📢 أهلاً بيك في سنتر التفوق التعليمي ❤️",
      "علشان يوصلك مواعيد الحصص وأي تنبيهات أو تغييرات أول بأول، انضم للقناة من هنا 👇",
      "🔗 https://whatsapp.com/channel/0029VbDCHP55fM5XCPuito3J",
      "✅ فعل الإشعارات علشان ميفوتكش أي جديد.",
      "📍 سنتر التفوق التعليمي – نزلة البرشا",
    ].join("\n"),
  );
});

test("builds a WhatsApp Web URL with the normalized phone and encoded message", () => {
  const link = buildWhatsAppWebUrl("01012345678", "أهلاً يا أحمد ❤️");
  assert.ok(link);
  const url = new URL(link);

  assert.equal(url.origin, "https://web.whatsapp.com");
  assert.equal(url.pathname, "/send");
  assert.equal(url.searchParams.get("phone"), "201012345678");
  assert.equal(url.searchParams.get("text"), "أهلاً يا أحمد ❤️");
});

test("does not build a WhatsApp Web URL for an invalid phone", () => {
  assert.equal(buildWhatsAppWebUrl("not-a-phone", "رسالة"), null);
  assert.equal(buildWhatsAppWebUrl("00000000000", "رسالة"), null);
});

test("resolves a valid phone to a ready WhatsApp share action", () => {
  const result = resolveWhatsAppShare("01112345678", "رسالة جاهزة");
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.localPhone, "01112345678");
  assert.match(result.url, /^https:\/\/web\.whatsapp\.com\/send\?/);
});

test("resolves eleven zeroes to a skipped WhatsApp action", () => {
  assert.deepEqual(resolveWhatsAppShare("00000000000", "رسالة"), { status: "skipped" });
});

test("resolves every other malformed phone to a correction action", () => {
  assert.deepEqual(resolveWhatsAppShare("011 12345678", "رسالة"), { status: "needs-correction" });
});
