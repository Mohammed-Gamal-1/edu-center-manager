import { authenticateAdmin, createSessionToken, sessionCookie } from "../../../../lib/server-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { username?: unknown; password?: unknown };
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || username.length > 80 || password.length < 8 || password.length > 256) {
      return Response.json({ ok: false, error: "بيانات الدخول غير صحيحة" }, { status: 401 });
    }
    const account = await authenticateAdmin(username, password);
    if (!account) return Response.json({ ok: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
    const token = await createSessionToken(account);
    return Response.json({ ok: true, username: account.username }, { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "قاعدة البيانات غير جاهزة. طبّق مخطط Supabase أولاً." }, { status: 503 });
  }
}
