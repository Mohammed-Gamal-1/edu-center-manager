import assert from "node:assert/strict";
import test from "node:test";
import { removeLegacyOfflineShell } from "../lib/service-worker-cleanup.ts";

test("unregisters legacy service workers and removes only the old offline cache", async () => {
  const calls: string[] = [];
  const registrations = [
    { unregister: async () => { calls.push("registration-1"); return true; } },
    { unregister: async () => { calls.push("registration-2"); return true; } },
  ];
  const cacheStorage = {
    delete: async (name: string) => {
      calls.push(`cache:${name}`);
      return true;
    },
  };

  await removeLegacyOfflineShell(registrations, cacheStorage);

  assert.deepEqual(calls, ["registration-1", "registration-2", "cache:eltafawoq-local-shell-v1"]);
});
