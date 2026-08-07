import { emptyCenterState, findActiveStudentStateConflict, findCenterStateBusinessConflict, findSubjectCatalogDeletionConflict, isCenterStatePayload, normalizeCenterStatePricing } from "../../../lib/center-state";
import { sessionFromRequest } from "../../../lib/server-auth";
import { supabaseInsert, supabaseQuery, supabaseUpdate } from "../../../lib/supabase-rest";

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
  try {
    const raw = await request.text();
    if (raw.length > 2_000_000) return Response.json({ ok: false, error: "حجم البيانات أكبر من الحد المسموح" }, { status: 413 });
    const body = JSON.parse(raw) as { state?: unknown; baseVersion?: unknown };
    if (!isCenterStatePayload(body.state) || typeof body.baseVersion !== "number" || body.baseVersion < 0) {
      return Response.json({ ok: false, error: "صيغة البيانات غير صحيحة" }, { status: 400 });
    }
    const currentRows = await supabaseQuery<StateRow>("center_state", {
      select: "id,data,version,updated_at",
      id: "eq.1",
      limit: 1,
    });
    const current = currentRows[0];
    const currentVersion = current?.version ?? 0;
    const nextState = normalizeCenterStatePricing(body.state);
    const currentState = normalizedPersistedState(current?.data ?? emptyCenterState);
    if (isCenterStatePayload(currentState)) {
      const subjectDeletionConflict = findSubjectCatalogDeletionConflict(currentState, nextState);
      if (subjectDeletionConflict) {
        return Response.json(
          {
            ok: false,
            error: subjectDeletionConflict.message,
            conflict: true,
            state: currentState,
            version: currentVersion,
          },
          { status: 409 },
        );
      }
    }
    const studentConflict = findActiveStudentStateConflict(nextState);
    if (studentConflict) {
      return Response.json(
        {
          ok: false,
          error: `الطالب ${studentConflict.studentId} مسجل بالفعل في حصة شغالة أخرى`,
          conflict: true,
          state: currentState,
          version: currentVersion,
        },
        { status: 409 },
      );
    }
    const businessConflict = findCenterStateBusinessConflict(nextState);
    if (businessConflict) {
      return Response.json(
        {
          ok: false,
          error: businessConflict.message,
          conflict: true,
          state: currentState,
          version: currentVersion,
        },
        { status: 409 },
      );
    }
    if (body.baseVersion !== currentVersion) {
      return Response.json(
        {
          ok: false,
          error: "تم تعديل البيانات من جهاز آخر",
          conflict: true,
          state: currentState,
          version: currentVersion,
        },
        { status: 409 },
      );
    }
    const nextVersion = currentVersion + 1;
    const payload = {
      id: 1,
      data: nextState,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    };
    let saved: StateRow[];
    if (current) {
      saved = await supabaseUpdate<StateRow>("center_state", { id: "eq.1", version: `eq.${currentVersion}` }, payload);
    } else {
      try {
        saved = await supabaseInsert<StateRow>("center_state", payload);
      } catch {
        saved = [];
      }
    }
    if (!saved.length) {
      const latestRows = await supabaseQuery<StateRow>("center_state", {
        select: "id,data,version,updated_at",
        id: "eq.1",
        limit: 1,
      });
      const latest = latestRows[0];
      return Response.json(
        {
          ok: false,
          error: "تم تعديل البيانات من جهاز آخر",
          conflict: true,
          state: normalizedPersistedState(latest?.data ?? emptyCenterState),
          version: latest?.version ?? 0,
        },
        { status: 409 },
      );
    }
    return Response.json(
      {
        ok: true,
        version: saved[0]?.version ?? nextVersion,
        updatedAt: saved[0]?.updated_at ?? new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: false, error: "تعذر حفظ البيانات في Supabase" }, { status: 503 });
  }
}
