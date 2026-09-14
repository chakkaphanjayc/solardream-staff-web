import { and, asc, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  lineUserGroupOverrides,
  lineUserGroupRules,
  users,
} from "@/db/schema";
import {
  getRichMenuProfileLabel,
  type RichMenuProfileType,
} from "@/lib/richMenuSchedulerTypes";

export type UserGroupType = RichMenuProfileType;

export type LineUserGroupCondition =
  | {
      all: LineUserGroupCondition[];
    }
  | {
      any: LineUserGroupCondition[];
    }
  | {
      field:
        | "id"
        | "email"
        | "name"
        | "fullName"
        | "phoneNumber"
        | "utm_source"
        | "utm_medium"
        | "utm_campaign"
        | "role"
        | "department"
        | "isActive"
        | "erpnextCustomerId"
        | "lineUserId"
        | "lineLinkNonce"
        | "hasLineLink"
        | "hasPurchased";
      operator:
        | "exists"
        | "not_exists"
        | "equals"
        | "not_equals"
        | "in"
        | "contains"
        | "not_contains";
      value?: unknown;
    };

export type LineUserGroupRuleRecord = typeof lineUserGroupRules.$inferSelect;
export type LineUserGroupOverrideRecord = typeof lineUserGroupOverrides.$inferSelect;
export type UserGroupCondition = LineUserGroupCondition;
export type UserGroupRuleRecord = LineUserGroupRuleRecord;
export type UserGroupOverrideRecord = LineUserGroupOverrideRecord;

export type LineUserGroupUserContext = {
  id: string;
  email: string;
  name: string | null;
  fullName: string;
  phoneNumber: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  role: string;
  department: string;
  isActive: boolean;
  erpnextCustomerId: string | null;
  lineUserId: string | null;
  lineLinkNonce: string | null;
  hasLineLink: boolean;
  hasPurchased: boolean;
};
export type UserGroupUserContext = LineUserGroupUserContext;

export type ResolvedLineUserGroup = {
  group: RichMenuProfileType;
  reason: string;
  source: "override" | "rule" | "fallback";
  ruleId?: string;
  ruleName?: string;
  hasLineLink: boolean;
  hasPurchased: boolean;
};
export type ResolvedUserGroup = ResolvedLineUserGroup;

const PURCHASED_PROPOSAL_STATUSES = [
  "SIGNED",
  "SIGNED_WAITING_VERIFY",
  "CONFIRMED",
  "VERIFIED_IN_PROGRESS",
  "FULLY_PAID",
  "COMPLETED",
  "WON",
];

const PURCHASED_PAYMENT_STATUSES = ["DEPOSIT_PAID", "FULLY_PAID"] as const;

export const DEFAULT_LINE_USER_GROUP_RULES: Array<{
  name: string;
  targetGroup: RichMenuProfileType;
  priority: number;
  condition: LineUserGroupCondition;
}> = [
  {
    name: "Client: bought customer",
    targetGroup: "CLIENT",
    priority: 10,
    condition: {
      field: "hasPurchased",
      operator: "equals",
      value: true,
    },
  },
  {
    name: "Member: linked LINE, no purchase",
    targetGroup: "MEMBER",
    priority: 20,
    condition: {
      all: [
        { field: "hasLineLink", operator: "equals", value: true },
        { field: "hasPurchased", operator: "equals", value: false },
      ],
    },
  },
];
export const DEFAULT_USER_GROUP_RULES = DEFAULT_LINE_USER_GROUP_RULES;

function isConditionRecord(value: unknown): value is LineUserGroupCondition {
  return typeof value === "object" && value !== null;
}

function getConditionFieldValue(context: LineUserGroupUserContext, field: string) {
  switch (field) {
    case "id":
      return context.id;
    case "email":
      return context.email;
    case "name":
      return context.name;
    case "fullName":
      return context.fullName;
    case "phoneNumber":
      return context.phoneNumber;
    case "utm_source":
      return context.utm_source;
    case "utm_medium":
      return context.utm_medium;
    case "utm_campaign":
      return context.utm_campaign;
    case "lineUserId":
      return context.lineUserId;
    case "lineLinkNonce":
      return context.lineLinkNonce;
    case "hasLineLink":
      return context.hasLineLink;
    case "hasPurchased":
      return context.hasPurchased;
    case "role":
      return context.role;
    case "department":
      return context.department;
    case "isActive":
      return context.isActive;
    case "erpnextCustomerId":
      return context.erpnextCustomerId;
    default:
      return undefined;
  }
}

export function evaluateLineUserGroupCondition(
  condition: unknown,
  context: LineUserGroupUserContext,
): boolean {
  if (!isConditionRecord(condition)) return false;

  if ("all" in condition && Array.isArray(condition.all)) {
    return condition.all.every((child) => evaluateLineUserGroupCondition(child, context));
  }

  if ("any" in condition && Array.isArray(condition.any)) {
    return condition.any.some((child) => evaluateLineUserGroupCondition(child, context));
  }

  if (!("field" in condition) || !("operator" in condition)) return false;

  const value = getConditionFieldValue(context, String(condition.field));

  switch (condition.operator) {
    case "exists":
      return value !== null && value !== undefined && value !== "";
    case "not_exists":
      return value === null || value === undefined || value === "";
    case "equals":
      return value === condition.value;
    case "not_equals":
      return value !== condition.value;
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(value);
    case "contains":
      return String(value ?? "").toLowerCase().includes(String(condition.value ?? "").toLowerCase());
    case "not_contains":
      return !String(value ?? "").toLowerCase().includes(String(condition.value ?? "").toLowerCase());
    default:
      return false;
  }
}
export const evaluateUserGroupCondition = evaluateLineUserGroupCondition;

export async function getUserPurchaseState(userId: string): Promise<boolean> {
  const purchasedProposal = await db.query.proposals.findFirst({
    columns: {
      id: true,
    },
    where: (table) =>
      and(
        eq(table.userId, userId),
        or(
          inArray(table.status, PURCHASED_PROPOSAL_STATUSES),
          inArray(table.paymentStatus, PURCHASED_PAYMENT_STATUSES),
          isNotNull(table.paidAt),
        ),
      ),
  });

  return Boolean(purchasedProposal);
}

export async function getLineUserGroupContext(
  userId: string,
): Promise<LineUserGroupUserContext | null> {
  const user = await db.query.users.findFirst({
    columns: {
      id: true,
      email: true,
      name: true,
      fullName: true,
      phoneNumber: true,
      utm_source: true,
      utm_medium: true,
      utm_campaign: true,
      role: true,
      department: true,
      isActive: true,
      erpnextCustomerId: true,
      lineUserId: true,
      lineLinkNonce: true,
    },
    where: eq(users.id, userId),
  });

  if (!user) return null;

  return {
    ...user,
    hasLineLink: Boolean(user.lineUserId),
    hasPurchased: await getUserPurchaseState(user.id),
  };
}
export const getUserGroupContext = getLineUserGroupContext;

export async function getLineUserGroupRules() {
  return db.query.lineUserGroupRules.findMany({
    orderBy: [asc(lineUserGroupRules.priority), desc(lineUserGroupRules.createdAt)],
  });
}
export const getUserGroupRules = getLineUserGroupRules;

export async function getActiveLineUserGroupRules() {
  return db.query.lineUserGroupRules.findMany({
    where: eq(lineUserGroupRules.isActive, true),
    orderBy: [asc(lineUserGroupRules.priority), desc(lineUserGroupRules.createdAt)],
  });
}
export const getActiveUserGroupRules = getActiveLineUserGroupRules;

export async function ensureDefaultLineUserGroupRules() {
  const createdOrUpdated = [];

  for (const rule of DEFAULT_LINE_USER_GROUP_RULES) {
    const [record] = await db
      .insert(lineUserGroupRules)
      .values({
        name: rule.name,
        targetGroup: rule.targetGroup,
        priority: rule.priority,
        condition: rule.condition as unknown as Record<string, unknown>,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: lineUserGroupRules.name,
        set: {
          targetGroup: rule.targetGroup,
          priority: rule.priority,
          condition: rule.condition as unknown as Record<string, unknown>,
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!record) throw new Error(`Default LINE user-group rule could not be saved: ${rule.name}`);
    createdOrUpdated.push(record);
  }

  return createdOrUpdated;
}
export const ensureDefaultUserGroupRules = ensureDefaultLineUserGroupRules;

export async function resolveLineUserGroupForUser(
  userId: string,
): Promise<ResolvedLineUserGroup | null> {
  const context = await getLineUserGroupContext(userId);
  if (!context) return null;

  const override = await db.query.lineUserGroupOverrides.findFirst({
    where: eq(lineUserGroupOverrides.userId, userId),
  });

  if (override) {
    return {
      group: override.targetGroup,
      reason: override.reason || `Manual override to ${getRichMenuProfileLabel(override.targetGroup)}`,
      source: "override",
      hasLineLink: Boolean(context.lineUserId),
      hasPurchased: context.hasPurchased,
    };
  }

  const rules = await getActiveLineUserGroupRules();
  const matchedRule = rules.find((rule) =>
    evaluateLineUserGroupCondition(rule.condition, context),
  );

  if (matchedRule) {
    return {
      group: matchedRule.targetGroup,
      reason: matchedRule.name,
      source: "rule",
      ruleId: matchedRule.id,
      ruleName: matchedRule.name,
      hasLineLink: Boolean(context.lineUserId),
      hasPurchased: context.hasPurchased,
    };
  }

  return {
    group: "GUEST",
    reason: "No active rule matched",
    source: "fallback",
    hasLineLink: Boolean(context.lineUserId),
    hasPurchased: context.hasPurchased,
  };
}
export const resolveUserGroupForUser = resolveLineUserGroupForUser;

export async function resolveLineUserIdsForGroup(group: RichMenuProfileType) {
  if (group === "GUEST") return [];

  const lineLinkedUsers = await db.query.users.findMany({
    columns: {
      id: true,
      lineUserId: true,
    },
    where: (table, { and, eq, isNotNull }) =>
      and(eq(table.isActive, true), isNotNull(table.lineUserId)),
  });

  const resolved = await Promise.all(
    lineLinkedUsers.map(async (user) => {
      const result = await resolveLineUserGroupForUser(user.id);
      return result?.group === group ? user.lineUserId : null;
    }),
  );

  return resolved.filter((lineUserId): lineUserId is string => Boolean(lineUserId));
}

export async function upsertLineUserGroupRule(input: {
  id?: string;
  name: string;
  targetGroup: RichMenuProfileType;
  priority: number;
  condition: LineUserGroupCondition;
  isActive: boolean;
}) {
  if (input.id) {
    const [rule] = await db
      .update(lineUserGroupRules)
      .set({
        name: input.name,
        targetGroup: input.targetGroup,
        priority: input.priority,
        condition: input.condition as unknown as Record<string, unknown>,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(eq(lineUserGroupRules.id, input.id))
      .returning();
    if (!rule) throw new Error("LINE user-group rule no longer exists.");
    return rule;
  }

  const [rule] = await db
    .insert(lineUserGroupRules)
    .values({
      name: input.name,
      targetGroup: input.targetGroup,
      priority: input.priority,
      condition: input.condition as unknown as Record<string, unknown>,
      isActive: input.isActive,
    })
    .returning();
  if (!rule) throw new Error("LINE user-group rule could not be created.");

  return rule;
}
export const upsertUserGroupRule = upsertLineUserGroupRule;

export async function deleteLineUserGroupRule(ruleId: string) {
  const [deleted] = await db.delete(lineUserGroupRules).where(eq(lineUserGroupRules.id, ruleId)).returning({ id: lineUserGroupRules.id });
  if (!deleted) throw new Error("LINE user-group rule no longer exists.");
}
export const deleteUserGroupRule = deleteLineUserGroupRule;

export async function upsertLineUserGroupOverride(input: {
  userId: string;
  targetGroup: RichMenuProfileType;
  reason?: string | null;
  assignedBy?: string | null;
}) {
  const [override] = await db
    .insert(lineUserGroupOverrides)
    .values({
      userId: input.userId,
      targetGroup: input.targetGroup,
      reason: input.reason?.trim() || null,
      assignedBy: input.assignedBy || null,
    })
    .onConflictDoUpdate({
      target: lineUserGroupOverrides.userId,
      set: {
        targetGroup: input.targetGroup,
        reason: input.reason?.trim() || null,
        assignedBy: input.assignedBy || null,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!override) throw new Error("LINE user-group override could not be saved.");

  return override;
}
export const upsertUserGroupOverride = upsertLineUserGroupOverride;

export async function deleteLineUserGroupOverride(userId: string) {
  const [deleted] = await db.delete(lineUserGroupOverrides).where(eq(lineUserGroupOverrides.userId, userId)).returning({ id: lineUserGroupOverrides.id });
  if (!deleted) throw new Error("LINE user-group override no longer exists.");
}
export const deleteUserGroupOverride = deleteLineUserGroupOverride;
