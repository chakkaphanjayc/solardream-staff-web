"use server";

import {
  deleteLineUserGroupOverrideAction,
  deleteLineUserGroupRuleAction,
  getLineUserGroupAdminStateAction,
  resolveLineUserGroupAction,
  saveLineUserGroupOverrideAction,
  saveLineUserGroupRuleAction,
  seedDefaultLineUserGroupRulesAction,
  type LineUserGroupOverrideInput,
  type LineUserGroupRuleInput,
  type LineUserGroupUserPreview,
} from "@/app/actions/settings/lineUserGroups";

export type UserGroupRuleInput = LineUserGroupRuleInput;
export type UserGroupOverrideInput = LineUserGroupOverrideInput;
export type UserGroupUserPreview = LineUserGroupUserPreview;

export async function seedDefaultUserGroupRulesAction() {
  return seedDefaultLineUserGroupRulesAction();
}

export async function getUserGroupAdminStateAction(query = "") {
  return getLineUserGroupAdminStateAction(query);
}

export async function saveUserGroupRuleAction(input: UserGroupRuleInput) {
  return saveLineUserGroupRuleAction(input);
}

export async function deleteUserGroupRuleAction(ruleId: string) {
  return deleteLineUserGroupRuleAction(ruleId);
}

export async function saveUserGroupOverrideAction(input: UserGroupOverrideInput) {
  return saveLineUserGroupOverrideAction(input);
}

export async function deleteUserGroupOverrideAction(userId: string) {
  return deleteLineUserGroupOverrideAction(userId);
}

export async function resolveUserGroupAction(userId: string) {
  return resolveLineUserGroupAction(userId);
}
