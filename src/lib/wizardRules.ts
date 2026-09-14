export const scoringTargetTypes = ["BRAND", "CATEGORY"] as const;
export type ScoringTargetType = (typeof scoringTargetTypes)[number];

export type WizardScoringImpact = {
  targetType: ScoringTargetType;
  target: string;
  weight: number;
};

export const wizardConditionOperators = ["==", "!=", "<=", ">=", "<", ">"] as const;
export type WizardConditionOperator = (typeof wizardConditionOperators)[number];

export type WizardRuleCondition = {
  stateKey: string;
  operator: WizardConditionOperator;
  value: string | number | boolean;
};

export const wizardActionTypes = [
  "BOOST_BRAND",
  "BOOST_CATEGORY",
  "REQUIRE_PRODUCT",
] as const;
export type WizardActionType = (typeof wizardActionTypes)[number];

export type WizardRuleAction = {
  actionType: WizardActionType;
  target: string;
  weight: number;
};

export type WizardRecommendationRule = {
  id: string;
  wizardId: string;
  ruleName: string;
  conditions: WizardRuleCondition[];
  actions: WizardRuleAction[];
  isActive: boolean;
};

export type WizardOptionScoringMap = Record<string, Record<string, WizardScoringImpact[]>>;

function comparable(value: unknown) {
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value ?? "").trim();
  const numeric = Number(text);
  return text !== "" && Number.isFinite(numeric) ? numeric : text.toLowerCase();
}

export function matchesWizardCondition(
  condition: WizardRuleCondition,
  answers: Record<string, unknown>,
) {
  const actual = comparable(answers[condition.stateKey]);
  const expected = comparable(condition.value);

  switch (condition.operator) {
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case "<=":
      return Number(actual) <= Number(expected);
    case ">=":
      return Number(actual) >= Number(expected);
    case "<":
      return Number(actual) < Number(expected);
    case ">":
      return Number(actual) > Number(expected);
  }
}

export function getMatchedWizardActions(
  rules: WizardRecommendationRule[],
  answers: Record<string, unknown>,
) {
  return rules
    .filter((rule) => rule.isActive)
    .filter((rule) => rule.conditions.every((condition) => matchesWizardCondition(condition, answers)))
    .flatMap((rule) => rule.actions);
}

export function getSelectedScoringImpacts(
  scoringMap: WizardOptionScoringMap,
  answers: Record<string, unknown>,
) {
  return Object.entries(answers).flatMap(([stateKey, answer]) => {
    const optionMap = scoringMap[stateKey];
    if (!optionMap) return [];
    return optionMap[String(answer)] || [];
  });
}
