import { createSessionToken, primaryAdminAccount, sessionCookie } from "../../../../lib/server-auth";

export async function POST() {
  try {
    const account = await primaryAdminAccount();
    const username = account?.username ?? "admin";
    const token = await createSessionToken({ id: "reception", username }, "reception");
    return Response.json({ ok: true, username }, { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "تعذر فتح جلسة الريسبشن" }, { status: 503 });
  }
}
