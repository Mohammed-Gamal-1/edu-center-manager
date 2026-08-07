import assert from "node:assert/strict";
import test from "node:test";
import { mergeCenterSnapshots, sameCenterSnapshotContent, type MergeableCenterSnapshot } from "../lib/center-sync.ts";

const snapshot = (overrides: Partial<MergeableCenterSnapshot> = {}): MergeableCenterSnapshot => ({
  students: [{ id: "1", name: "أحمد" }],
  teachers: [{ id: "7", name: "محمد" }],
  pricing: [],
  sessions: [],
  bookings: [],
  expenses: [],
  debtPayments: [],
  audit: [],
  subjectCatalog: { "المرحلة الإعدادية": ["الرياضيات"] },
  rooms: ["قاعة 1"],
  savedAt: "2026-08-07T00:00:00.000Z",
  ...overrides,
});

test("ignores savedAt when comparing snapshot content", () => {
  assert.equal(sameCenterSnapshotContent(snapshot(), snapshot({ savedAt: "2026-08-07T01:00:00.000Z" })), true);
});

test("ignores object property insertion order when comparing snapshot content", () => {
  const left = snapshot({ students: [{ id: "1", name: "أحمد", phone: "0100" }] });
  const right = snapshot({ students: [{ phone: "0100", name: "أحمد", id: "1" }] });
  assert.equal(sameCenterSnapshotContent(left, right), true);
});

test("automatically merges changes made to different records", () => {
  const base = snapshot({ students: [{ id: "1", name: "أحمد" }, { id: "2", name: "منى" }] });
  const local = snapshot({ students: [{ id: "1", name: "أحمد محلي" }, { id: "2", name: "منى" }] });
  const cloud = snapshot({ students: [{ id: "1", name: "أحمد" }, { id: "2", name: "منى سحابي" }] });
  const merged = mergeCenterSnapshots(base, local, cloud);
  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.state.students, [{ id: "1", name: "أحمد محلي" }, { id: "2", name: "منى سحابي" }]);
});

test("reports a conflict when the same record changes locally and in cloud", () => {
  const base = snapshot();
  const local = snapshot({ students: [{ id: "1", name: "أحمد محلي" }] });
  const cloud = snapshot({ students: [{ id: "1", name: "أحمد سحابي" }] });
  const merged = mergeCenterSnapshots(base, local, cloud);
  assert.deepEqual(merged.conflicts, [{ path: "students.1", reason: "same-record-changed" }]);
  assert.deepEqual(merged.state.students, local.students, "the recoverable draft keeps the local value until the user decides");
});

test("preserves cloud additions while applying a local deletion", () => {
  const base = snapshot({ students: [{ id: "1", name: "أحمد" }, { id: "2", name: "منى" }] });
  const local = snapshot({ students: [{ id: "1", name: "أحمد" }] });
  const cloud = snapshot({ students: [{ id: "1", name: "أحمد" }, { id: "2", name: "منى" }, { id: "3", name: "علي" }] });
  const merged = mergeCenterSnapshots(base, local, cloud);
  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.state.students, [{ id: "1", name: "أحمد" }, { id: "3", name: "علي" }]);
});

test("reports conflicting catalog edits without discarding the local catalog", () => {
  const base = snapshot();
  const local = snapshot({ subjectCatalog: { "المرحلة الإعدادية": ["الرياضيات", "العلوم"] } });
  const cloud = snapshot({ subjectCatalog: { "المرحلة الإعدادية": ["الرياضيات", "اللغة العربية"] } });
  const merged = mergeCenterSnapshots(base, local, cloud);
  assert.deepEqual(merged.conflicts, [{ path: "subjectCatalog.المرحلة الإعدادية", reason: "same-setting-changed" }]);
  assert.deepEqual(merged.state.subjectCatalog, local.subjectCatalog);
});

test("automatically merges catalog edits made to different stages", () => {
  const base = snapshot({ subjectCatalog: { "المرحلة الإعدادية": ["الرياضيات"], "المرحلة الثانوية": ["الفيزياء"] } });
  const local = snapshot({ subjectCatalog: { "المرحلة الإعدادية": ["الرياضيات", "العلوم"], "المرحلة الثانوية": ["الفيزياء"] } });
  const cloud = snapshot({ subjectCatalog: { "المرحلة الإعدادية": ["الرياضيات"], "المرحلة الثانوية": ["الفيزياء", "الكيمياء"] } });
  const merged = mergeCenterSnapshots(base, local, cloud);
  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.state.subjectCatalog, {
    "المرحلة الإعدادية": ["الرياضيات", "العلوم"],
    "المرحلة الثانوية": ["الفيزياء", "الكيمياء"],
  });
});
