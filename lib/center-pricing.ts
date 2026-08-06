export type AssignmentIdentity = {
  stage: string;
  grade: string;
  subject: string;
};

export type TeacherIdentity = {
  id: string;
  active?: boolean;
  assignments: AssignmentIdentity[];
};

export type PriceRuleIdentity = AssignmentIdentity & {
  id: string;
  teacherId?: string;
  studentPrice: number;
  teacherFee: number;
};

const assignmentMatches = (left: AssignmentIdentity, right: AssignmentIdentity) =>
  left.stage === right.stage && left.grade === right.grade && left.subject === right.subject;

const priceKey = (rule: Pick<PriceRuleIdentity, "teacherId" | "stage" | "grade" | "subject">) =>
  [rule.teacherId ?? "", rule.stage, rule.grade, rule.subject].join("\u0000");

/**
 * Expands the old stage/grade/subject-only price rules to every teacher who
 * currently owns that assignment. Already teacher-linked rules are preserved.
 */
export function linkLegacyPriceRulesToTeachers<T extends PriceRuleIdentity>(pricing: readonly T[], teachers: readonly TeacherIdentity[]): Array<T & { teacherId: string }> {
  const nextRules: Array<T & { teacherId: string }> = [];
  const existingKeys = new Set<string>();
  let nextNumericId = Math.max(0, ...pricing.map((rule) => Number(rule.id)).filter(Number.isFinite)) + 1;

  for (const rule of pricing) {
    if (!rule.teacherId) continue;
    const linkedRule = { ...rule, teacherId: String(rule.teacherId) };
    const key = priceKey(linkedRule);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    nextRules.push(linkedRule);
  }

  for (const rule of pricing) {
    if (rule.teacherId) continue;
    const matchingTeachers = teachers
      .filter((teacher) => teacher.active !== false && teacher.assignments.some((assignment) => assignmentMatches(assignment, rule)))
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id, "en", { numeric: true }));

    if (!matchingTeachers.length) {
      const unassignedRule = { ...rule, teacherId: "" };
      const key = priceKey(unassignedRule);
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        nextRules.push(unassignedRule);
      }
      continue;
    }

    matchingTeachers.forEach((teacher, index) => {
      const linkedRule = {
        ...rule,
        id: index === 0 ? rule.id : String(nextNumericId++),
        teacherId: teacher.id,
      };
      const key = priceKey(linkedRule);
      if (existingKeys.has(key)) return;
      existingKeys.add(key);
      nextRules.push(linkedRule);
    });
  }

  return nextRules;
}

export function findTeacherPriceRule<T extends PriceRuleIdentity>(pricing: readonly T[], teacherId: string, assignment?: AssignmentIdentity) {
  if (!assignment) return undefined;
  return (
    pricing.find((rule) => rule.teacherId === teacherId && assignmentMatches(rule, assignment)) ??
    pricing.find((rule) => !rule.teacherId && assignmentMatches(rule, assignment))
  );
}

export function bookingFeeForSelection(defaultFee: number, manualFee: string | number | undefined) {
  if (manualFee === undefined || manualFee === "") return defaultFee;
  return Number(manualFee);
}
