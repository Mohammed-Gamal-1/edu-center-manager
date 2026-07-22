import { sessionFromRequest } from "../../../../lib/server-auth";
import { supabaseRpc } from "../../../../lib/supabase-rest";

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const characters = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]);
  return Array.from({ length: 5 }, (_, index) => characters.slice(index * 4, index * 4 + 4).join("")).join("-");
}

export async function POST(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return Response.json({ ok: false, error: "الجلسة منتهية" }, { status: 401 });
  try {
    const recoveryCode = createRecoveryCode();
    const updated = await supabaseRpc<{ id: string }>("set_admin_recovery_code", { p_admin_id: session.id, p_recovery_code: recoveryCode });
    if (!updated.length) return Response.json({ ok: false, error: "تعذر إنشاء كود الاسترداد" }, { status: 400 });
    return Response.json({ ok: true, recoveryCode }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "تعذر إنشاء كود الاسترداد" }, { status: 503 });
  }
}
