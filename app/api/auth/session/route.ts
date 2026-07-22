import { sessionFromRequest } from "../../../../lib/server-auth";

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  return Response.json({ authenticated: Boolean(session), username: session?.username ?? null }, { headers: { "Cache-Control": "no-store" } });
}
