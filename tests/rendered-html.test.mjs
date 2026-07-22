import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the secure Arabic application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="ar" dir="rtl">/i);
  assert.match(html, /<title>سنتر التفوق \| نظام الإدارة<\/title>/i);
  assert.match(html, /جاري فتح نظام سنتر التفوق/);
  assert.match(html, /يتم التحقق من الجلسة الآمنة/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Codex is working/i);
});

test("keeps cloud persistence, offline recovery, and admin auth protections in place", async () => {
  const [centerApp, stateRoute, serverAuth, supabaseRest, migration, safetyMigration, authMigration, persistentRecoveryMigration, relationalSyncMigration] = await Promise.all([
    readFile(new URL("../app/CenterApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase-rest.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/001_initial_schema.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/002_state_safety.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/003_database_auth.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/004_persistent_recovery_code.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/005_sync_snapshot_to_relational.sql", import.meta.url), "utf8"),
  ]);

  assert.match(centerApp, /eltafawoq\.pending-state\.v2/);
  assert.match(centerApp, /eltafawoq\.cloud-cache\.v2/);
  assert.match(centerApp, /addEventListener\("online"/);
  assert.match(centerApp, /saveInFlightRef/);
  assert.match(centerApp, /setCloudConflict/);
  assert.match(centerApp, /setStartTime\(new Date\(\)\.toTimeString\(\)\.slice\(0, 5\)\)/);
  assert.match(centerApp, /type="time"[\s\S]{0,160}value=\{startTime\}[\s\S]{0,160}onInput=/);
  assert.match(centerApp, /type="date"[\s\S]{0,160}value=\{customDateFrom\}[\s\S]{0,160}onInput=/);
  assert.match(centerApp, /استخدام النسخة السحابية/);
  assert.match(centerApp, /حفظ نسخة هذا الجهاز/);
  assert.match(stateRoute, /baseVersion/);
  assert.match(stateRoute, /status:\s*409/);
  assert.match(stateRoute, /version:\s*`eq\.\$\{currentVersion\}`/);
  assert.match(serverAuth, /verify_admin_credentials/);
  assert.match(serverAuth, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(supabaseRest, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(supabaseRest, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(migration, /create table public\.center_state/i);
  assert.match(migration, /enable row level security/i);
  assert.doesNotMatch(migration, /\b(drop|truncate)\b/i);
  assert.match(safetyMigration, /create table if not exists public\.center_state_history/i);
  assert.match(safetyMigration, /before update on public\.center_state/i);
  assert.doesNotMatch(safetyMigration, /\b(drop|truncate|delete)\b/i);
  assert.match(authMigration, /extensions\.crypt\(p_password, account\.password_hash\)/i);
  assert.match(authMigration, /grant execute.+service_role/is);
  assert.match(authMigration, /recover_admin_password/i);
  assert.doesNotMatch(authMigration, /\b(drop|truncate|delete)\b/i);
  assert.match(persistentRecoveryMigration, /recover_admin_password/i);
  assert.match(persistentRecoveryMigration, /account\.recovery_hash\s*=\s*extensions\.crypt/i);
  assert.doesNotMatch(persistentRecoveryMigration, /recovery_hash\s*=\s*null/i);
  assert.doesNotMatch(persistentRecoveryMigration, /\b(drop|truncate|delete)\b/i);
  assert.match(relationalSyncMigration, /center_state_sync_relational/i);
  assert.match(relationalSyncMigration, /insert into public\.students/i);
  assert.match(relationalSyncMigration, /insert into public\.teachers/i);
  assert.match(relationalSyncMigration, /insert into public\.lesson_sessions/i);
  assert.match(relationalSyncMigration, /insert into public\.session_attendance/i);
  assert.match(relationalSyncMigration, /insert into public\.advance_bookings/i);
  assert.match(relationalSyncMigration, /insert into public\.center_expenses/i);
  assert.match(relationalSyncMigration, /update public\.rooms set active = false where true/i);
  assert.match(relationalSyncMigration, /update public\.subjects set active = false where true/i);
  assert.match(relationalSyncMigration, /delete from public\.teacher_assignments where true/i);
  assert.match(relationalSyncMigration, /delete from public\.session_attendance where true/i);
});
