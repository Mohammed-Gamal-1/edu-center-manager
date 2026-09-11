import { isSupabaseConfigured, supabaseQuery } from "../../../../lib/supabase-rest";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: true, mode: "demo", database: "Supabase PostgreSQL awaiting credentials" });
  }

  try {
    await supabaseQuery<{ id: string }>("rooms", { select: "id", limit: 1 });
    return Response.json({ ok: true, mode: "cloud", database: "Supabase PostgreSQL connected" });
  } catch {
    return Response.json({ ok: false, mode: "cloud", database: "Supabase connection failed" }, { status: 503 });
  }
}
