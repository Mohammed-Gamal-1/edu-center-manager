import { emptyCenterState, isCenterStatePayload, normalizeCenterStatePricing } from "../../../lib/center-state";
import { sessionFromRequest } from "../../../lib/server-auth";
import { supabaseQuery } from "../../../lib/supabase-rest";

type StateRow = {
  id: number;
  data: unknown;
  version: number;
  updated_at: string;
};

const normalizedPersistedState = (value: unknown) => (isCenterStatePayload(value) ? normalizeCenterStatePricing(value) : value);

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return Response.json({ ok: false, error: "الجلسة منتهية" }, { status: 401 });
  try {
    const rows = await supabaseQuery<StateRow>("center_state", {
      select: "id,data,version,updated_at",
      id: "eq.1",
      limit: 1,
    });
    const row = rows[0];
    return Response.json(
      {
        ok: true,
        state: normalizedPersistedState(row?.data ?? emptyCenterState),
        version: row?.version ?? 0,
        updatedAt: row?.updated_at ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: false, error: "تعذر قراءة بيانات السنتر من Supabase" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return Response.json({ ok: false, error: "الجلسة منتهية" }, { status: 401 });
  void request;
  return Response.json(
    {
      ok: false,
      error: "تم إيقاف الكتابة السحابية. هذه النسخة تحفظ البيانات في قاعدة الجهاز فقط.",
      mode: "local-only",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
