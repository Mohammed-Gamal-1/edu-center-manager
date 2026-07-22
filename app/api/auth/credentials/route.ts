import { createSessionToken, sessionCookie, sessionFromRequest, updateAdminCredentials } from "../../../../lib/server-auth";

export async function PUT(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return Response.json({ ok: false, error: "الجلسة منتهية" }, { status: 401 });
  try {
    const body = await request.json() as { username?: unknown; password?: unknown };
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (username.length < 3 || username.length > 80 || (password && (password.length < 8 || password.length > 256))) {
      return Response.json({ ok: false, error: "اسم المستخدم 3 أحرف على الأقل، وكلمة المرور 8 أحرف على الأقل" }, { status: 400 });
    }
    const updated = await updateAdminCredentials(session.id, username, password || undefined);
    if (!updated) return Response.json({ ok: false, error: "تعذر تحديث الحساب" }, { status: 404 });
    const token = await createSessionToken(updated);
    return Response.json({ ok: true, username: updated.username }, { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "اسم المستخدم مستخدم بالفعل أو تعذر الحفظ" }, { status: 409 });
  }
}
