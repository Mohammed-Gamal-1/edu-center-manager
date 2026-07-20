import { authenticateAdminPin, createSessionToken, sessionCookie } from "../../../../lib/server-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!/^\d{4}$/.test(password)) {
    return Response.json({ ok: false, error: "PIN الإدارة يجب أن يكون 4 أرقام" }, { status: 401 });
  }
  let account;
  try {
    account = await authenticateAdminPin(password);
  } catch {
    return Response.json({ ok: false, error: "تعذر التحقق من بيانات الإدارة", code: "AUTH_VERIFY_FAILED" }, { status: 503 });
  }
  if (!account) return Response.json({ ok: false, error: "PIN الإدارة غير صحيح" }, { status: 401 });
  try {
    const token = await createSessionToken(account);
    return Response.json({ ok: true, username: account.username }, { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "تعذر إنشاء جلسة الإدارة الآمنة", code: "SESSION_CREATE_FAILED" }, { status: 503 });
  }
}
