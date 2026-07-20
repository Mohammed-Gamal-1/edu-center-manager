import { createSessionToken, sessionCookie } from "../../../../lib/server-auth";
import { supabaseRpc } from "../../../../lib/supabase-rest";

type RecoveredAccount = { id: string; username: string };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { username?: unknown; recoveryCode?: unknown; password?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const recoveryCode = typeof body?.recoveryCode === "string" ? body.recoveryCode.trim().toUpperCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (username.length < 3 || recoveryCode.length < 16 || !/^\d{4}$/.test(password)) {
    return Response.json({ ok: false, error: "بيانات الاسترداد غير صحيحة" }, { status: 400 });
  }
  try {
    const accounts = await supabaseRpc<RecoveredAccount>("recover_admin_password", { p_username: username, p_recovery_code: recoveryCode, p_new_password: password });
    const account = accounts[0];
    if (!account) return Response.json({ ok: false, error: "كود الاسترداد غير صحيح أو تم استخدامه من قبل" }, { status: 401 });
    const token = await createSessionToken(account);
    return Response.json({ ok: true, username: account.username }, { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "تعذر استرداد الحساب الآن" }, { status: 503 });
  }
}
