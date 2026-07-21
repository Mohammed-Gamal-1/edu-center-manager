import type { Cell, CellObject, SheetData } from "write-excel-file/browser";

export type AnalyticsExcelExport = {
  periodLabel: string;
  filters: { teacher: string; subject: string; stage: string; grade: string };
  summary: Array<[string, number, string]>;
  sessions: Array<[string, string, string, string, string, string, number, number, number, number, number, number, number]>;
  teachers: Array<[number, string, number, number, number, number]>;
  subjects: Array<[string, number]>;
  stages: Array<[string, number]>;
  monthly: Array<[string, number, number, number, number, number, number, number, number]>;
  bookings: Array<[string, string, string, string, string, number]>;
  expenses: Array<[string, string, string, number]>;
  debtPayments: Array<[string, string, string, number]>;
};

const teal = "#087F67";
const darkTeal = "#16483E";
const paleTeal = "#E9F6F2";
const paleRed = "#FFF0ED";
const red = "#AD4F44";
const currencyFormat = '#,##0.00 "ج.م"';

function title(value: string, span: number): CellObject {
  return { value, type: String, span, fontSize: 18, fontWeight: "bold", textColor: "#FFFFFF", backgroundColor: darkTeal, align: "center", alignVertical: "center", height: 34 };
}

function section(value: string, span: number): CellObject {
  return { value, type: String, span, fontSize: 13, fontWeight: "bold", textColor: darkTeal, backgroundColor: paleTeal, align: "right", height: 26 };
}

function header(value: string): CellObject {
  return { value, type: String, fontWeight: "bold", textColor: "#FFFFFF", backgroundColor: teal, align: "center", alignVertical: "center", wrap: true, height: 28 };
}

function text(value: string): CellObject {
  return { value, type: String, align: "right", alignVertical: "center", wrap: true };
}

function number(value: number, format = "#,##0"): CellObject {
  return { value, type: Number, format, align: "center", alignVertical: "center" };
}

function currency(value: number, highlight = false): CellObject {
  return { value, type: Number, format: currencyFormat, align: "center", alignVertical: "center", ...(highlight ? { fontWeight: "bold" as const, textColor: value < 0 ? red : teal, backgroundColor: value < 0 ? paleRed : paleTeal } : {}) };
}

function blankRow(columns: number): Cell[] {
  return Array.from({ length: columns }, () => null);
}

export function buildAnalyticsWorkbook(data: AnalyticsExcelExport) {
  const generatedAt = new Intl.DateTimeFormat("ar-EG", { dateStyle: "full", timeStyle: "short" }).format(new Date());
  const filterRows: Array<[string, string]> = [
    ["الفترة", data.periodLabel],
    ["المدرس", data.filters.teacher],
    ["المادة", data.filters.subject],
    ["المرحلة", data.filters.stage],
    ["الصف", data.filters.grade],
    ["تاريخ إنشاء الملف", generatedAt],
  ];

  const summarySheet: SheetData = [
    [title("سنتر التفوق — تقرير الإحصائيات", 4)],
    ...filterRows.map(([label, value]) => [header(label), text(value), null, null]),
    blankRow(4),
    [section("المؤشرات الرئيسية", 4)],
    [header("المؤشر"), header("القيمة"), header("الوحدة"), header("ملاحظات")],
    ...data.summary.map(([label, value, unit]) => [text(label), unit === "ج.م" ? currency(value, label.includes("صافي")) : number(value, unit === "٪" ? "0.0" : "#,##0.0"), text(unit), text("")]),
  ];

  const sessionsSheet: SheetData = [
    [title("تفاصيل الحصص المطابقة", 13)],
    ["التاريخ", "المدرس", "المرحلة", "الصف", "المادة", "القاعة", "الحضور", "القيمة الكاملة", "النواقص", "المحصل", "مستحق المدرس", "صافي السنتر", "الهامش"].map(header),
    ...data.sessions.map((row) => row.map((value, index) => index <= 5 ? text(String(value)) : index === 6 ? number(Number(value)) : index === 12 ? number(Number(value), "0.0%") : currency(Number(value))) as Cell[]),
  ];

  const teachersSheet: SheetData = [
    [title("تحليل المدرسين", 6)],
    ["الترتيب", "المدرس", "الحصص", "الحجوزات", "الحضور", "إجمالي الإيرادات المرتبطة"].map(header),
    ...data.teachers.map((row) => [number(row[0]), text(row[1]), number(row[2]), number(row[3]), number(row[4]), currency(row[5], true)]),
  ];

  const comparisonsSheet: SheetData = [
    [title("مقارنة المواد والمراحل", 4)],
    [section("الإيراد حسب المادة", 4)],
    [header("المادة"), header("الإيراد"), null, null],
    ...data.subjects.map(([label, value]) => [text(label), currency(value), null, null]),
    blankRow(4),
    [section("الإيراد حسب المرحلة", 4)],
    [header("المرحلة"), header("الإيراد"), null, null],
    ...data.stages.map(([label, value]) => [text(label), currency(value), null, null]),
  ];

  const monthlySheet: SheetData = [
    [title("التحليل الشهري", 9)],
    ["الشهر", "الحصص", "الحجوزات", "الحضور", "إجمالي الدخل", "مستحق المدرسين", "المصروفات", "صافي السنتر", "الهامش"].map(header),
    ...data.monthly.map((row) => [text(row[0]), number(row[1]), number(row[2]), number(row[3]), currency(row[4]), currency(row[5]), currency(row[6]), currency(row[7], true), number(row[8], "0.0%")]),
  ];

  const bookingsSheet: SheetData = [
    [title("الحجوزات المسبقة ضمن الاختيار", 6)],
    ["التاريخ", "الطالب ID", "المدرس", "المرحلة والصف", "المادة", "قيمة الحجز"].map(header),
    ...data.bookings.map((row) => [text(row[0]), text(row[1]), text(row[2]), text(row[3]), text(row[4]), currency(row[5])]),
  ];

  const cashFlowSheet: SheetData = [
    [title("المصروفات وتحصيل المديونيات", 4)],
    [section("المصروفات", 4)],
    ["التاريخ", "الفئة", "الوصف", "القيمة"].map(header),
    ...data.expenses.map((row) => [text(row[0]), text(row[1]), text(row[2]), currency(row[3])]),
    blankRow(4),
    [section("تحصيل المديونيات", 4)],
    ["التاريخ", "الطالب ID", "الحصة ID", "المبلغ"].map(header),
    ...data.debtPayments.map((row) => [text(row[0]), text(row[1]), text(row[2]), currency(row[3])]),
  ];

  const safePeriod = data.periodLabel.replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "");
  return {
    data: [summarySheet, sessionsSheet, teachersSheet, comparisonsSheet, monthlySheet, bookingsSheet, cashFlowSheet],
    options: {
      sheets: ["الملخص", "الحصص", "المدرسون", "المواد والمراحل", "التحليل الشهري", "الحجوزات", "الحركة المالية"],
      columns: [
        [{ width: 30 }, { width: 25 }, { width: 15 }, { width: 34 }],
        [{ width: 14 }, { width: 24 }, { width: 22 }, { width: 18 }, { width: 20 }, { width: 14 }, { width: 12 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 13 }],
        [{ width: 12 }, { width: 26 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 24 }],
        [{ width: 28 }, { width: 22 }, { width: 14 }, { width: 14 }],
        [{ width: 20 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 20 }, { width: 20 }, { width: 18 }, { width: 20 }, { width: 14 }],
        [{ width: 15 }, { width: 16 }, { width: 25 }, { width: 26 }, { width: 22 }, { width: 18 }],
        [{ width: 16 }, { width: 20 }, { width: 34 }, { width: 18 }],
      ],
      fileName: `احصائيات-سنتر-التفوق-${safePeriod || "التقرير"}.xlsx`,
      rightToLeft: true,
      fontFamily: "Arial",
      fontSize: 11,
      stickyRowsCount: 2,
      showGridLines: false,
    },
  };
}

export async function downloadAnalyticsExcel(data: AnalyticsExcelExport) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const workbook = buildAnalyticsWorkbook(data);
  await writeXlsxFile(workbook.data, workbook.options);
}
