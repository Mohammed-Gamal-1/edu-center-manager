import assert from "node:assert/strict";
import test from "node:test";
import { bookingFeeForSelection, findTeacherPriceRule, linkLegacyPriceRulesToTeachers } from "../lib/center-pricing.ts";

const assignment = { stage: "المرحلة الإعدادية", grade: "الصف الأول", subject: "الرياضيات" };

test("links every legacy price to all current teachers of the same assignment", () => {
  const linked = linkLegacyPriceRulesToTeachers(
    [{ id: "4", ...assignment, studentPrice: 100, teacherFee: 70 }],
    [
      { id: "8", assignments: [assignment] },
      { id: "3", assignments: [assignment] },
      { id: "9", assignments: [{ ...assignment, subject: "العلوم" }] },
      { id: "10", active: false, assignments: [assignment] },
    ],
  );

  assert.deepEqual(linked.map((rule) => rule.teacherId), ["3", "8"]);
  assert.equal(new Set(linked.map((rule) => rule.id)).size, 2);
  assert.ok(linked.every((rule) => rule.studentPrice === 100 && rule.teacherFee === 70));
});

test("preserves different prices for teachers teaching the same subject and grade", () => {
  const pricing = [
    { id: "1", teacherId: "3", ...assignment, studentPrice: 100, teacherFee: 70 },
    { id: "2", teacherId: "8", ...assignment, studentPrice: 120, teacherFee: 85 },
  ];

  assert.equal(findTeacherPriceRule(pricing, "3", assignment)?.studentPrice, 100);
  assert.equal(findTeacherPriceRule(pricing, "8", assignment)?.studentPrice, 120);
});

test("bulk booking uses the common fee per subject and only overrides manual subjects", () => {
  assert.equal(bookingFeeForSelection(15, undefined), 15);
  assert.equal(bookingFeeForSelection(15, ""), 15);
  assert.equal(bookingFeeForSelection(15, "20"), 20);
});
