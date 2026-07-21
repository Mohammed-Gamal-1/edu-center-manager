import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import writeXlsxFile from "write-excel-file/node";
import { buildAnalyticsWorkbook } from "../lib/analytics-excel.ts";

const sample = {
  periodLabel: "اليوم",
  filters: { teacher: "كل المدرسين", subject: "كل المواد", stage: "كل المراحل", grade: "كل الصفوف" },
  summary: [["إجمالي الإيرادات", 250, "ج.م"], ["إجمالي الحضور", 3, "حضور"]],
  sessions: [["2026-07-22", "أ/ اختبار", "المرحلة الإعدادية", "الصف الأول", "الرياضيات", "قاعة 1", 3, 300, 50, 250, 180, 70, 0.28]],
  teachers: [[1, "أ/ اختبار", 1, 1, 3, 350]],
  subjects: [["الرياضيات", 350]],
  stages: [["الإعدادية", 350]],
  monthly: [["يوليو ٢٠٢٦", 1, 1, 3, 350, 180, 20, 150, 150 / 350]],
  bookings: [["2026-07-22", "201001", "أ/ اختبار", "المرحلة الإعدادية — الصف الأول", "الرياضيات", 100]],
  expenses: [["2026-07-22", "أدوات ومستلزمات", "أقلام", 20]],
  debtPayments: [["2026-07-22", "201001", "1", 15]],
};

test("creates a valid multi-sheet Excel analytics workbook", async () => {
  const workbook = buildAnalyticsWorkbook(sample);
  assert.deepEqual(workbook.options.sheets, ["الملخص", "الحصص", "المدرسون", "المواد والمراحل", "التحليل الشهري", "الحجوزات", "الحركة المالية"]);
  assert.match(workbook.options.fileName, /^احصائيات-سنتر-التفوق-.+\.xlsx$/);

  const directory = await mkdtemp(join(tmpdir(), "center-analytics-"));
  const filePath = join(directory, "analytics.xlsx");
  try {
    const options = { ...workbook.options };
    delete options.fileName;
    await writeXlsxFile(workbook.data, { ...options, filePath });
    const bytes = await readFile(filePath);
    assert.equal(bytes.subarray(0, 2).toString(), "PK");
    assert.ok(bytes.length > 5_000);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
