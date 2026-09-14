import { z } from "zod";

export const automationMatchModeSchema = z.enum(["exact", "contains", "startsWith", "regex"]);
export const lineConversationStatusSchema = z.enum(["UNASSIGNED", "OPEN", "RESOLVED", "CLOSED"]);

export const lineAutomationTriggerSchema = z.object({
  type: z.enum(["follow", "message", "postback", "accountLink", "event", "schedule"]),
  field: z.string().trim().max(80).default("text"),
  value: z.string().trim().max(300),
  match: automationMatchModeSchema.default("exact"),
});

export const lineAutomationConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tag"), tag: z.string().trim().min(1).max(80), operator: z.enum(["has", "missing"]).default("has") }),
  z.object({ type: z.literal("field"), field: z.string().trim().min(1).max(80), value: z.string().max(300), match: automationMatchModeSchema.default("exact") }),
  z.object({ type: z.literal("businessHours"), isOpen: z.boolean() }),
  z.object({ type: z.literal("takeover"), isTakenOver: z.boolean() }),
  z.object({ type: z.literal("accountLinked"), isLinked: z.boolean() }),
  z.object({ type: z.literal("conversationStatus"), status: lineConversationStatusSchema }),
  z.object({ type: z.literal("event"), field: z.string().trim().min(1).max(80), value: z.string().max(300), match: automationMatchModeSchema.default("exact") }),
]);

export const lineAutomationActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sendText"), text: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal("sendContent"), contentId: z.string().uuid() }),
  z.object({ type: z.literal("addTag"), tag: z.string().trim().min(1).max(80) }),
  z.object({ type: z.literal("removeTag"), tag: z.string().trim().min(1).max(80) }),
  z.object({ type: z.literal("assignStaff"), staffId: z.string().trim().min(1).max(200) }),
  z.object({ type: z.literal("invokeDify"), integrationId: z.string().uuid() }),
  z.object({ type: z.literal("handoff"), reason: z.string().trim().min(1).max(300) }),
  z.object({ type: z.literal("setAutomation"), enabled: z.boolean() }),
  z.object({ type: z.literal("notify"), channel: z.literal("inbox"), message: z.string().trim().min(1).max(1000) }),
  z.object({ type: z.literal("setRichMenu"), richMenuId: z.string().trim().min(1).max(200) }),
]);

export const lineAutomationRuleConfigSchema = z.object({
  schemaVersion: z.literal(1),
  trigger: lineAutomationTriggerSchema,
  conditionMode: z.enum(["all", "any"]).default("all"),
  conditions: z.array(lineAutomationConditionSchema).max(20).default([]),
  actions: z.array(lineAutomationActionSchema).min(1).max(20),
});

export type LineAutomationTrigger = z.infer<typeof lineAutomationTriggerSchema>;
export type LineAutomationCondition = z.infer<typeof lineAutomationConditionSchema>;
export type LineAutomationAction = z.infer<typeof lineAutomationActionSchema>;
export type LineAutomationRuleConfig = z.infer<typeof lineAutomationRuleConfigSchema>;

export type LineAutomationRule = LineAutomationRuleConfig & {
  id: string;
  name: string;
  priority: number;
  stopProcessing: boolean;
  cooldownSeconds: number;
  enabled: boolean;
  lastExecutedAt: string | null;
};

export type LineAutomationContext = {
  eventType: "follow" | "message" | "postback" | "accountLink" | "event" | "schedule";
  text: string;
  postbackData?: string | null;
  tags: readonly string[];
  fields: Readonly<Record<string, string | number | boolean | null | undefined>>;
  eventFields?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  isBusinessHours: boolean;
  humanTakeover: boolean;
  accountLinked: boolean;
  conversationStatus: z.infer<typeof lineConversationStatusSchema>;
  now?: Date;
};

export type AutomationMatchReason = {
  ruleId: string;
  matched: boolean;
  reasons: string[];
};

export type AutomationEvaluation = {
  matchedRules: string[];
  actions: Array<{ ruleId: string; action: LineAutomationAction }>;
  reasons: AutomationMatchReason[];
  stopped: boolean;
};

function normalized(value: string | number | boolean | null | undefined) {
  return value === null || value === undefined ? "" : String(value).trim().toLocaleLowerCase();
}

export function isSafeAutomationRegex(pattern: string) {
  if (pattern.length === 0 || pattern.length > 128) return false;
  if (/\\\d/.test(pattern)) return false;
  if (/\([^)]*[+*][^)]*\)[+*]/.test(pattern)) return false;
  try {
    // Compile once during validation and again during evaluation only after this guard.
    void new RegExp(pattern, "iu");
    return true;
  } catch {
    return false;
  }
}

function matches(value: string, expected: string, mode: z.infer<typeof automationMatchModeSchema>) {
  const left = normalized(value);
  const right = normalized(expected);
  if (mode === "exact") return left === right;
  if (mode === "contains") return left.includes(right);
  if (mode === "startsWith") return left.startsWith(right);
  if (!isSafeAutomationRegex(expected)) return false;
  return new RegExp(expected, "iu").test(value);
}

function getTriggerValue(context: LineAutomationContext, trigger: LineAutomationTrigger) {
  if (trigger.field === "postbackData") return context.postbackData ?? "";
  if (trigger.field === "eventType") return context.eventType;
  const eventValue = context.eventFields?.[trigger.field];
  if (eventValue !== undefined) return eventValue === null ? "" : String(eventValue);
  const fieldValue = context.fields[trigger.field];
  if (fieldValue !== undefined) return fieldValue === null ? "" : String(fieldValue);
  return context.text;
}

function evaluateCondition(condition: LineAutomationCondition, context: LineAutomationContext) {
  if (condition.type === "tag") {
    const hasTag = context.tags.some((tag) => normalized(tag) === normalized(condition.tag));
    return condition.operator === "has" ? hasTag : !hasTag;
  }
  if (condition.type === "businessHours") return context.isBusinessHours === condition.isOpen;
  if (condition.type === "takeover") return context.humanTakeover === condition.isTakenOver;
  if (condition.type === "accountLinked") return context.accountLinked === condition.isLinked;
  if (condition.type === "conversationStatus") return context.conversationStatus === condition.status;
  const source = condition.type === "event" ? context.eventFields ?? {} : context.fields;
  const sourceValue = source[condition.field];
  return matches(typeof sourceValue === "string" ? sourceValue : String(sourceValue ?? ""), condition.value, condition.match);
}

function isOnCooldown(rule: LineAutomationRule, now: Date) {
  if (!rule.lastExecutedAt || rule.cooldownSeconds <= 0) return false;
  const last = new Date(rule.lastExecutedAt);
  return Number.isFinite(last.getTime()) && now.getTime() - last.getTime() < rule.cooldownSeconds * 1000;
}

export function evaluateAutomationRules(
  rules: readonly LineAutomationRule[],
  context: LineAutomationContext,
): AutomationEvaluation {
  const now = context.now ?? new Date();
  const orderedRules = [...rules].filter((rule) => rule.enabled).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  const result: AutomationEvaluation = { matchedRules: [], actions: [], reasons: [], stopped: false };

  for (const rule of orderedRules) {
    const reasons: string[] = [];
    const triggerMatched = rule.trigger.type === context.eventType && matches(getTriggerValue(context, rule.trigger), rule.trigger.value, rule.trigger.match);
    if (!triggerMatched) reasons.push("Trigger did not match.");
    if (triggerMatched && isOnCooldown(rule, now)) reasons.push("Rule is in cooldown.");

    const conditionResults = triggerMatched && !isOnCooldown(rule, now)
      ? rule.conditions.map((condition) => ({ condition, matched: evaluateCondition(condition, context) }))
      : [];
    const conditionsMatched = rule.conditions.length === 0 || (rule.conditionMode === "any"
      ? conditionResults.some((entry) => entry.matched)
      : conditionResults.every((entry) => entry.matched));
    const failedCondition = conditionResults.find((entry) => !entry.matched)?.condition;
    if (!conditionsMatched) reasons.push(`${rule.conditionMode === "any" ? "Any" : "All"} conditions did not match${failedCondition ? ` (${failedCondition.type}).` : "."}`);

    const matched = triggerMatched && !isOnCooldown(rule, now) && conditionsMatched;
    if (matched) {
      result.matchedRules.push(rule.id);
      for (const action of rule.actions) {
        if (result.actions.length >= 20) break;
        const signature = `${action.type}:${JSON.stringify(action)}`;
        if (!result.actions.some((entry) => `${entry.action.type}:${JSON.stringify(entry.action)}` === signature)) {
          result.actions.push({ ruleId: rule.id, action });
        }
      }
      if (rule.stopProcessing) {
        result.stopped = true;
        result.reasons.push({ ruleId: rule.id, matched: true, reasons: ["Rule matched and stopped further processing."] });
        break;
      }
      reasons.push("Rule matched.");
    }
    result.reasons.push({ ruleId: rule.id, matched, reasons });
  }

  return result;
}

export const DEFAULT_LINE_AUTOMATION_RULE: LineAutomationRuleConfig = {
  schemaVersion: 1,
  trigger: { type: "message", field: "text", value: "", match: "contains" },
  conditionMode: "all",
  conditions: [{ type: "takeover", isTakenOver: false }],
  actions: [{ type: "sendText", text: "Thanks for your message. A SolarDream team member will follow up shortly." }],
};
