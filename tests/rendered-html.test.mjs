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
  assert.match(html, /يتم تجهيز قاعدة بيانات هذا الجهاز/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Codex is working/i);
});

test("connects the offline shell to the local SQLite server without enabling cloud writes", async () => {
  const [centerApp, stateRoute, localFirstStore, serviceWorker, registration, localServer, localDatabase, jsonImporter, supabaseImporter] = await Promise.all([
    readFile(new URL("../app/CenterApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/local-first-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/ServiceWorkerRegistration.tsx", import.meta.url), "utf8"),
    readFile(new URL("../local-server/server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../local-server/database.mjs", import.meta.url), "utf8"),
    readFile(new URL("../local-server/import-json.mjs", import.meta.url), "utf8"),
    readFile(new URL("../local-server/import-supabase.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(centerApp, /savePendingLocalSnapshot/);
  assert.match(centerApp, /mergeCenterSnapshots/);
  assert.match(centerApp, /method:\s*"PUT"[\s\S]{0,240}baseVersion/);
  assert.match(centerApp, /تعارض بين جهازين يحتاج مراجعة/);
  assert.match(centerApp, /قاعدة بيانات SQLite المحلية/);
  assert.match(centerApp, /تصدير نسخة JSON/);
  assert.match(centerApp, /إنشاء نسخة SQLite/);
  assert.match(localFirstStore, /indexedDB\.open/);
  assert.match(localFirstStore, /markLocalOperationConflict/);

  assert.match(stateRoute, /status:\s*410/);
  assert.match(stateRoute, /mode:\s*"local-only"/);
  assert.doesNotMatch(stateRoute, /supabaseUpdate|supabaseUpsert/);
  assert.match(serviceWorker, /CACHE_URLS/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(registration, /navigator\.serviceWorker\.ready/);

  assert.match(localServer, /\/api\/state/);
  assert.match(localServer, /\/api\/local\/backup/);
  assert.match(localServer, /CENTER_HOST \|\| "0\.0\.0\.0"/);
  assert.match(localDatabase, /CREATE TABLE IF NOT EXISTS center_state_history/);
  assert.match(localDatabase, /BEGIN IMMEDIATE/);
  assert.match(localDatabase, /PRAGMA synchronous = FULL/);
  assert.match(jsonImporter, /--inspect/);
  assert.match(jsonImporter, /before-json-import/);
  assert.doesNotMatch(supabaseImporter, /method:\s*"POST"|method:\s*"PUT"/i);

  assert.match(centerApp, /حذف مادة/);
  assert.match(centerApp, /تأكيد حذف المادة/);
  assert.match(centerApp, /findSubjectUsageConflict/);
  assert.match(centerApp, /حذف الحجز المسبق نهائيًا/);
  assert.match(centerApp, /حذف الحجز والبيانات المالية/);
  assert.match(centerApp, /removeBookingById/);
  assert.match(centerApp, /setStartTime\(new Date\(\)\.toTimeString\(\)\.slice\(0, 5\)\)/);
});
