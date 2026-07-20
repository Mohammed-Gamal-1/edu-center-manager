import assert from "node:assert/strict";
import test from "node:test";
import { findActiveStudentConflict, hasMatchingBooking, nextStudentIdForStage } from "../lib/center-rules.ts";

test("student IDs start from the configured six-digit range for each stage", () => {
  assert.equal(nextStudentIdForStage([], "المرحلة الابتدائية"), "101001");
  assert.equal(nextStudentIdForStage([], "المرحلة الإعدادية"), "201001");
  assert.equal(nextStudentIdForStage([], "المرحلة الثانوية"), "301001");
});

test("student IDs increment only inside their own stage range", () => {
  assert.equal(nextStudentIdForStage(["101001", "101003", "201099", "100"], "المرحلة الابتدائية"), "101004");
  assert.equal(nextStudentIdForStage(["101999", "201001", "201002"], "المرحلة الإعدادية"), "201003");
});

test("finds a student already attending another active lesson", () => {
  const sessions = [
    { id: "1", status: "active", studentIds: ["101001"] },
    { id: "2", status: "scheduled", studentIds: ["101001"] },
  ];
  assert.equal(findActiveStudentConflict(sessions, "2", "101001")?.id, "1");
  assert.equal(findActiveStudentConflict(sessions, "1", "101001"), undefined);
});

test("booking match requires the same student, teacher, stage, grade and subject", () => {
  const bookings = [{ studentId: "101001", teacherId: "7", stage: "المرحلة الابتدائية", grade: "الصف الأول", subject: "اللغة العربية", active: true }];
  const lesson = { teacherId: "7", stage: "المرحلة الابتدائية", grade: "الصف الأول", subject: "اللغة العربية" };
  assert.equal(hasMatchingBooking(bookings, lesson, "101001"), true);
  assert.equal(hasMatchingBooking(bookings, { ...lesson, teacherId: "8" }, "101001"), false);
  assert.equal(hasMatchingBooking(bookings, { ...lesson, subject: "الرياضيات" }, "101001"), false);
});
