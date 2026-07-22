import { authenticateAdmin, createSessionToken, sessionCookie } from "../../../../lib/server-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || username.length > 80 || password.length < 8 || password.length > 256) {
    return Response.json({ ok: false, error: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }
  let account;
  try {
    account = await authenticateAdmin(username, password);
  } catch {
    return Response.json({ ok: false, error: "تعذر التحقق من بيانات الإدارة", code: "AUTH_VERIFY_FAILED" }, { status: 503 });
  }
  if (!account) return Response.json({ ok: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
  try {
    const token = await createSessionToken(account);
    return Response.json({ ok: true, username: account.username }, { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "تعذر إنشاء جلسة الإدارة الآمنة", code: "SESSION_CREATE_FAILED" }, { status: 503 });
  }
}
