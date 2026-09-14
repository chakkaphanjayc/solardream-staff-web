"use server";

import { revalidatePath } from "next/cache";
import { asc, desc, ilike, or } from "drizzle-orm";
import { checkAdmin } from "@/app/actions/auth";
import { db } from "@/db";
import { lineUserGroupOverrides, users } from "@/db/schema";
import {
  deleteLineUserGroupOverride,
  deleteLineUserGroupRule,
  ensureDefaultLineUserGroupRules,
  getLineUserGroupRules,
  resolveLineUserGroupForUser,
  upsertLineUserGroupOverride,
  upsertLineUserGroupRule,
  type LineUserGroupCondition,
} from "@/lib/lineUserGroups";
import {
  normalizeRichMenuProfileType,
  type RichMenuProfileType,
} from "@/lib/richMenuSchedulerTypes";

export type LineUserGroupRuleInput = {
  id?: string;
  name: string;
  targetGroup: RichMenuProfileType;
  priority: number;
  condition: LineUserGroupCondition;
  isActive: boolean;
};

export type LineUserGroupOverrideInput = {
  userId: string;
  targetGroup: RichMenuProfileType;
  reason?: string | null;
};

export type LineUserGroupUserPreview = {
  id: string;
  email: string;
  name: string | null;
  fullName: string;
  role: string;
  department: string;
  isActive: boolean;
  lineUserId: string | null;
  override: {
    id: string;
    targetGroup: RichMenuProfileType;
    reason: string | null;
  } | null;
  resolvedGroup: RichMenuProfileType;
  resolvedReason: string;
  resolvedSource: "override" | "rule" | "fallback";
  hasPurchased: boolean;
  hasLineLink: boolean;
};

function revalidateLineUserGroupPages() {
  revalidatePath("/admin/settings/user-groups");
  revalidatePath("/th/admin/settings/user-groups");
  revalidatePath("/en/admin/settings/user-groups");
  revalidatePath("/admin/settings/line/user-groups");
  revalidatePath("/th/admin/settings/line/user-groups");
  revalidatePath("/en/admin/settings/line/user-groups");
}

function normalizeRuleInput(input: LineUserGroupRuleInput) {
  const targetGroup = normalizeRichMenuProfileType(input.targetGroup);
  const name = input.name.trim();

  if (!name) throw new Error("Rule name is required.");
  if (!targetGroup) throw new Error("Target group is invalid.");
  if (!Number.isFinite(input.priority)) throw new Error("Priority is invalid.");

  return {
    id: input.id?.trim() || undefined,
    name,
    targetGroup,
    priority: Math.trunc(input.priority),
    condition: input.condition,
    isActive: Boolean(input.isActive),
  };
}

export async function seedDefaultLineUserGroupRulesAction() {
  await checkAdmin();
  const rules = await ensureDefaultLineUserGroupRules();
  revalidateLineUserGroupPages();
  return { success: true, rules };
}

export async function getLineUserGroupAdminStateAction(query = "") {
  await checkAdmin();
  await ensureDefaultLineUserGroupRules();

  const cleanQuery = query.trim();
  const [rules, overrideRows, userRows] = await Promise.all([
    getLineUserGroupRules(),
    db.query.lineUserGroupOverrides.findMany({
      orderBy: [desc(lineUserGroupOverrides.updatedAt)],
    }),
    db.query.users.findMany({
      columns: {
        id: true,
        email: true,
        name: true,
        fullName: true,
        role: true,
        department: true,
        isActive: true,
        lineUserId: true,
      },
      where: cleanQuery
        ? or(
            ilike(users.email, `%${cleanQuery}%`),
            ilike(users.name, `%${cleanQuery}%`),
            ilike(users.fullName, `%${cleanQuery}%`),
          )
        : undefined,
      orderBy: [desc(users.updatedAt), asc(users.email)],
      limit: 100,
    }),
  ]);

  const overrideByUserId = new Map(overrideRows.map((override) => [override.userId, override]));
  const userPreviews: LineUserGroupUserPreview[] = [];

  for (const user of userRows) {
    const resolved = await resolveLineUserGroupForUser(user.id);
    if (!resolved) continue;
    const override = overrideByUserId.get(user.id) ?? null;
    userPreviews.push({
      ...user,
      override: override
        ? {
            id: override.id,
            targetGroup: override.targetGroup,
            reason: override.reason,
          }
        : null,
      resolvedGroup: resolved.group,
      resolvedReason: resolved.reason,
      resolvedSource: resolved.source,
      hasPurchased: resolved.hasPurchased,
      hasLineLink: resolved.hasLineLink,
    });
  }

  return {
    success: true,
    rules,
    overrides: overrideRows,
    users: userPreviews,
  };
}

export async function saveLineUserGroupRuleAction(input: LineUserGroupRuleInput) {
  await checkAdmin();
  const rule = await upsertLineUserGroupRule(normalizeRuleInput(input));
  revalidateLineUserGroupPages();
  return { success: true, rule };
}

export async function deleteLineUserGroupRuleAction(ruleId: string) {
  await checkAdmin();
  const cleanRuleId = ruleId.trim();
  if (!cleanRuleId) return { success: false, error: "Rule id is required." };
  await deleteLineUserGroupRule(cleanRuleId);
  revalidateLineUserGroupPages();
  return { success: true };
}

export async function saveLineUserGroupOverrideAction(input: LineUserGroupOverrideInput) {
  const admin = await checkAdmin();
  const userId = input.userId.trim();
  const targetGroup = normalizeRichMenuProfileType(input.targetGroup);
  if (!userId) return { success: false, error: "User id is required." };
  if (!targetGroup) return { success: false, error: "Target group is invalid." };

  const override = await upsertLineUserGroupOverride({
    userId,
    targetGroup,
    reason: input.reason,
    assignedBy: admin.id,
  });
  revalidateLineUserGroupPages();
  return { success: true, override };
}

export async function deleteLineUserGroupOverrideAction(userId: string) {
  await checkAdmin();
  const cleanUserId = userId.trim();
  if (!cleanUserId) return { success: false, error: "User id is required." };
  await deleteLineUserGroupOverride(cleanUserId);
  revalidateLineUserGroupPages();
  return { success: true };
}

export async function resolveLineUserGroupAction(userId: string) {
  await checkAdmin();
  const cleanUserId = userId.trim();
  if (!cleanUserId) return { success: false, error: "User id is required." };
  const resolved = await resolveLineUserGroupForUser(cleanUserId);
  if (!resolved) return { success: false, error: "User not found." };
  return { success: true, resolved };
}
