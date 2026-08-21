export async function GET() {
  return Response.json({
    ok: true,
    mode: "hosted-read-only-fallback",
    database: "شغّل Local Server للوصول إلى SQLite والكتابة",
    cloudWrites: false,
  });
}
