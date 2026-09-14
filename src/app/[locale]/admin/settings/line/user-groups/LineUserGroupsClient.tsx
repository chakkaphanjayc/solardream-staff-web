"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  CircleDashed,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserCog,
} from "@/components/ui/icons";
import { toast } from "sonner";
import ConditionFlowBuilder from "@/components/admin/ConditionFlowBuilder";
import {
  deleteUserGroupOverrideAction,
  deleteUserGroupRuleAction,
  getUserGroupAdminStateAction,
  saveUserGroupOverrideAction,
  saveUserGroupRuleAction,
  seedDefaultUserGroupRulesAction,
  type UserGroupRuleInput,
  type UserGroupUserPreview,
} from "@/app/actions/settings/userGroups";
import {
  getRichMenuProfileLabel,
  RICH_MENU_PROFILE_TYPES,
  type RichMenuProfileType,
} from "@/lib/richMenuSchedulerTypes";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import type {
  UserGroupCondition,
  UserGroupRuleRecord,
} from "@/lib/lineUserGroups";
import {
  conditionToRows,
  DEFAULT_CONDITION_OPERATORS,
  formatCondition,
  parseConditionJson,
  rowsToCondition,
  type ConditionFieldOption,
  type ConditionMode,
  type ConditionRow,
  type MatchMode,
} from "@/lib/conditionFlow";

type AdminState = Awaited<ReturnType<typeof getUserGroupAdminStateAction>>;

type RulePreset = "CLIENT_PURCHASED" | "MEMBER_LINKED_NO_PURCHASE" | "ROLE_INSTALLER" | "CUSTOM_JSON";
type ConditionField =
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

const FIELD_OPTIONS: ConditionFieldOption<ConditionField>[] = [
  { value: "hasPurchased", label: "Purchase status", type: "boolean" },
  { value: "hasLineLink", label: "LINE linked", type: "boolean" },
  { value: "lineUserId", label: "LINE linked user ID", type: "text" },
  { value: "email", label: "Email", type: "text" },
  { value: "name", label: "Name", type: "text" },
  { value: "fullName", label: "Full name", type: "text" },
  { value: "phoneNumber", label: "Phone number", type: "text" },
  { value: "role", label: "System role", type: "enum", values: ["USER", "STAFF", "ADMIN", "SUPER_ADMIN", "MANAGER", "INSTALLER", "CUSTOMER"] },
  { value: "department", label: "Department", type: "enum", values: ["SALES", "ACCOUNTING", "ENGINEERING", "WAREHOUSE", "PROJECT_TEAM", "NONE"] },
  { value: "isActive", label: "Account active", type: "boolean" },
  { value: "utm_source", label: "UTM source", type: "text" },
  { value: "utm_medium", label: "UTM medium", type: "text" },
  { value: "utm_campaign", label: "UTM campaign", type: "text" },
  { value: "erpnextCustomerId", label: "ERPNext customer ID", type: "text" },
  { value: "lineLinkNonce", label: "LINE link nonce", type: "text" },
  { value: "id", label: "User ID", type: "text" },
];

const OPERATOR_OPTIONS = DEFAULT_CONDITION_OPERATORS;

const GROUP_OPTIONS = RICH_MENU_PROFILE_TYPES.filter(
  (type) => type !== "MEMBER_RESIDENTIAL" && type !== "MEMBER_COMMERCIAL",
);

const PRESET_CONDITIONS: Record<Exclude<RulePreset, "CUSTOM_JSON">, UserGroupCondition> = {
  CLIENT_PURCHASED: {
    field: "hasPurchased",
    operator: "equals",
    value: true,
  },
  MEMBER_LINKED_NO_PURCHASE: {
    all: [
      { field: "hasLineLink", operator: "equals", value: true },
      { field: "hasPurchased", operator: "equals", value: false },
    ],
  },
  ROLE_INSTALLER: {
    field: "role",
    operator: "equals",
    value: "INSTALLER",
  },
};

const PRESET_LABELS: Record<RulePreset, string> = {
  CLIENT_PURCHASED: "Bought user",
  MEMBER_LINKED_NO_PURCHASE: "Linked LINE, no purchase",
  ROLE_INSTALLER: "Installer role",
  CUSTOM_JSON: "Custom JSON",
};

function defaultRuleInput(): UserGroupRuleInput {
  return {
    name: "New user group rule",
    targetGroup: "MEMBER",
    priority: 100,
    condition: PRESET_CONDITIONS.MEMBER_LINKED_NO_PURCHASE,
    isActive: true,
  };
}

function getGroupBadgeClasses(group: RichMenuProfileType) {
  switch (group) {
    case "CLIENT":
      return "border-emerald-200 bg-emerald-500/10 text-emerald-700";
    case "MEMBER":
      return "border-[#B7D1EA] bg-[#B7D1EA]/20 text-gray-300";
    case "SUB_CONTRACTOR":
      return "border-amber-200 bg-amber-500/10 text-amber-700";
    case "GUEST":
      return "border-[#1E293B] bg-[#0B1121] text-gray-400";
    default:
      return "border-[#1E293B] bg-[#0F172A] text-gray-400";
  }
}

function normalizeState(state: AdminState) {
  return {
    rules: state.success ? state.rules : [],
    users: state.success ? state.users : [],
  };
}

function actionError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function UserGroupsClient({
  initialState,
}: {
  initialState: AdminState;
}) {
  const normalized = normalizeState(initialState);
  const [rules, setRules] = useState<UserGroupRuleRecord[]>(normalized.rules);
  const [users, setUsers] = useState<UserGroupUserPreview[]>(normalized.users);
  const [query, setQuery] = useState("");
  const [editingRule, setEditingRule] = useState<UserGroupRuleInput>(() => defaultRuleInput());
  const [conditionText, setConditionText] = useState(() => formatCondition(defaultRuleInput().condition));
  const [conditionRows, setConditionRows] = useState<ConditionRow<ConditionField>[]>(() =>
    conditionToRows(defaultRuleInput().condition, FIELD_OPTIONS, OPERATOR_OPTIONS).rows,
  );
  const [conditionMode, setConditionMode] = useState<ConditionMode>("BUILDER");
  const [matchMode, setMatchMode] = useState<MatchMode>("all");
  const [preset, setPreset] = useState<RulePreset>("MEMBER_LINKED_NO_PURCHASE");
  const [isPending, startTransition] = useTransition();

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name)),
    [rules],
  );
  const selection = useAdminSelection(sortedRules.map((rule) => rule.id));

  const summary = useMemo(() => {
    return GROUP_OPTIONS.map((group) => ({
      group,
      count: users.filter((user) => user.resolvedGroup === group).length,
    }));
  }, [users]);

  const refreshState = (nextQuery = query) => {
    startTransition(async () => {
      try {
        const state = await getUserGroupAdminStateAction(nextQuery);
        if (!state.success) {
          toast.error("โหลดข้อมูลกลุ่มผู้ใช้ไม่สำเร็จ");
          return;
        }
        setRules(state.rules);
        setUsers(state.users);
      } catch (error) {
        toast.error(actionError(error, "โหลดข้อมูลกลุ่มผู้ใช้ไม่สำเร็จ"));
      }
    });
  };

  const handleSeedDefaults = () => {
    startTransition(async () => {
      try {
        const result = await seedDefaultUserGroupRulesAction();
        if (!result.success) {
          toast.error("สร้าง default rules ไม่สำเร็จ");
          return;
        }
        toast.success("Default rules พร้อมใช้งานแล้ว");
        refreshState();
      } catch (error) {
        toast.error(actionError(error, "สร้าง default rules ไม่สำเร็จ"));
      }
    });
  };

  const handlePresetChange = (nextPreset: RulePreset) => {
    setPreset(nextPreset);
    if (nextPreset === "CUSTOM_JSON") return;
    const nextCondition = PRESET_CONDITIONS[nextPreset];
    const parsedBuilder = conditionToRows(nextCondition, FIELD_OPTIONS, OPERATOR_OPTIONS);
    setConditionRows(parsedBuilder.rows);
    setMatchMode(parsedBuilder.matchMode);
    setConditionMode(parsedBuilder.mode);
    setConditionText(formatCondition(nextCondition));
    setEditingRule((prev) => ({ ...prev, condition: nextCondition }));
  };

  const handleEditRule = (rule: UserGroupRuleRecord) => {
    const parsedBuilder = conditionToRows(rule.condition, FIELD_OPTIONS, OPERATOR_OPTIONS);
    setPreset("CUSTOM_JSON");
    setConditionRows(parsedBuilder.rows);
    setMatchMode(parsedBuilder.matchMode);
    setConditionMode(parsedBuilder.mode);
    setEditingRule({
      id: rule.id,
      name: rule.name,
      targetGroup: rule.targetGroup,
      priority: rule.priority,
      condition: rule.condition as UserGroupCondition,
      isActive: rule.isActive,
    });
    setConditionText(formatCondition(rule.condition));
  };

  const handleNewRule = () => {
    const next = defaultRuleInput();
    const parsedBuilder = conditionToRows(next.condition, FIELD_OPTIONS, OPERATOR_OPTIONS);
    setPreset("MEMBER_LINKED_NO_PURCHASE");
    setEditingRule(next);
    setConditionRows(parsedBuilder.rows);
    setMatchMode(parsedBuilder.matchMode);
    setConditionMode(parsedBuilder.mode);
    setConditionText(formatCondition(next.condition));
  };

  const updateConditionRows = (
    updater: (rows: ConditionRow<ConditionField>[]) => ConditionRow<ConditionField>[],
  ) => {
    setConditionRows((prev) => {
      const nextRows = updater(prev);
      const nextCondition = rowsToCondition<UserGroupCondition>(
        nextRows,
        matchMode,
        FIELD_OPTIONS,
        OPERATOR_OPTIONS,
      );
      setConditionText(formatCondition(nextCondition));
      setEditingRule((current) => ({ ...current, condition: nextCondition }));
      return nextRows;
    });
  };

  const handleMatchModeChange = (nextMatchMode: MatchMode) => {
    setMatchMode(nextMatchMode);
    const nextCondition = rowsToCondition<UserGroupCondition>(
      conditionRows,
      nextMatchMode,
      FIELD_OPTIONS,
      OPERATOR_OPTIONS,
    );
    setConditionText(formatCondition(nextCondition));
    setEditingRule((current) => ({ ...current, condition: nextCondition }));
  };

  const handleSaveRule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        const condition =
          conditionMode === "BUILDER"
            ? rowsToCondition<UserGroupCondition>(
                conditionRows,
                matchMode,
                FIELD_OPTIONS,
                OPERATOR_OPTIONS,
              )
            : parseConditionJson<UserGroupCondition>(conditionText);
        const result = await saveUserGroupRuleAction({
          ...editingRule,
          condition,
        });
        if (!result.success) {
          toast.error("บันทึก rule ไม่สำเร็จ");
          return;
        }
        toast.success("บันทึก rule สำเร็จ");
        handleNewRule();
        refreshState();
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Condition JSON ไม่ถูกต้อง");
      }
    });
  };

  const handleDeleteRule = (ruleId: string) => {
    startTransition(async () => {
      try {
        const result = await deleteUserGroupRuleAction(ruleId);
        if (!result.success) {
          toast.error(result.error || "ลบ rule ไม่สำเร็จ");
          return;
        }
        toast.success("ลบ rule แล้ว");
        refreshState();
      } catch (error) {
        toast.error(actionError(error, "ลบ rule ไม่สำเร็จ"));
      }
    });
  };

  const handleBulkDeleteRules = () => {
    if (selection.selectedCount === 0) return;
    if (!window.confirm(`Delete ${selection.selectedCount} selected user-group rule(s)?`)) return;
    startTransition(async () => {
      const ids = selection.selectedIds;
      try {
        const settled = await Promise.allSettled(ids.map((id) => deleteUserGroupRuleAction(id)));
        const succeededIds = ids.filter((id, index) => {
          const result = settled[index];
          return result?.status === "fulfilled" && result.value.success;
        });
        const failedCount = ids.length - succeededIds.length;
        setRules((current) => current.filter((rule) => !succeededIds.includes(rule.id)));
        if (succeededIds.length > 0) selection.clear();
        if (failedCount > 0) toast.error(`${failedCount} rule(s) could not be deleted.`);
        else toast.success(`${succeededIds.length} user-group rule(s) deleted.`);
        if (succeededIds.length > 0) refreshState();
      } catch (error) {
        toast.error(actionError(error, "Some rules could not be deleted."));
      }
    });
  };

  const handleOverride = (user: UserGroupUserPreview, targetGroup: RichMenuProfileType) => {
    startTransition(async () => {
      try {
        const result = await saveUserGroupOverrideAction({
          userId: user.id,
          targetGroup,
          reason: `Assigned by staff from User Groups admin`,
        });
        if (!result.success) {
          toast.error(result.error || "บันทึก override ไม่สำเร็จ");
          return;
        }
        toast.success(`ตั้ง ${user.email} เป็น ${getRichMenuProfileLabel(targetGroup)} แล้ว`);
        refreshState();
      } catch (error) {
        toast.error(actionError(error, "บันทึก override ไม่สำเร็จ"));
      }
    });
  };

  const handleClearOverride = (user: UserGroupUserPreview) => {
    startTransition(async () => {
      try {
        const result = await deleteUserGroupOverrideAction(user.id);
        if (!result.success) {
          toast.error(result.error || "ลบ override ไม่สำเร็จ");
          return;
        }
        toast.success("ลบ override แล้ว");
        refreshState();
      } catch (error) {
        toast.error(actionError(error, "ลบ override ไม่สำเร็จ"));
      }
    });
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <div key={item.group} className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-5 shadow-none">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gray-500">
              {item.group}
            </p>
            <div className="mt-2 flex items-end justify-between gap-4">
              <h2 className="text-2xl font-black text-gray-100">{item.count}</h2>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${getGroupBadgeClasses(item.group)}`}>
                {getRichMenuProfileLabel(item.group)}
              </span>
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <section className="space-y-5 rounded-2xl border border-[#1E293B] bg-[#0F172A] p-6 shadow-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gray-400">
                Group Rules
              </p>
              <h2 className="mt-1.5 text-xl font-black text-gray-100">Condition Rules</h2>
              <p className="mt-1 text-sm leading-6 text-gray-400">
                Reusable groups are resolved by priority after manual overrides. Rich menu profiles, notifications, and campaigns can target the resolved group.
              </p>
            </div>
            <Settings2 className="h-5 w-5 shrink-0 text-[#B7D1EA]" />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSeedDefaults}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-xl border border-[#B7D1EA] bg-[#B7D1EA]/15 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-300 transition hover:bg-[#B7D1EA]/25 disabled:opacity-50"
            >
              <BadgeCheck className="h-3.5 w-3.5 text-[#B7D1EA]" />
              Seed Defaults
            </button>
            <button
              type="button"
              onClick={handleNewRule}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-400 transition hover:bg-[#0B1121] disabled:opacity-50"
            >
              <CircleDashed className="h-3.5 w-3.5" />
              New Rule
            </button>
          </div>

          <form onSubmit={handleSaveRule} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-gray-400">Rule Name</span>
              <input
                value={editingRule.name}
                onChange={(event) => setEditingRule((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] px-4 py-3 text-sm text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-gray-400">Target Group</span>
                <select
                  value={editingRule.targetGroup}
                  onChange={(event) =>
                    setEditingRule((prev) => ({
                      ...prev,
                      targetGroup: event.target.value as RichMenuProfileType,
                    }))
                  }
                  className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] px-4 py-3 text-sm text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10"
                >
                  {GROUP_OPTIONS.map((group) => (
                    <option key={group} value={group}>
                      {getRichMenuProfileLabel(group)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-gray-400">Priority</span>
                <input
                  type="number"
                  value={editingRule.priority}
                  onChange={(event) =>
                    setEditingRule((prev) => ({
                      ...prev,
                      priority: Number(event.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] px-4 py-3 text-sm text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10"
                />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-gray-400">Start From</span>
              <select
                value={preset}
                onChange={(event) => handlePresetChange(event.target.value as RulePreset)}
                className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] px-4 py-3 text-sm text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10"
              >
                {(Object.keys(PRESET_LABELS) as RulePreset[]).map((key) => (
                  <option key={key} value={key}>
                    {PRESET_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>

            <ConditionFlowBuilder
              mode={conditionMode}
              onModeChange={setConditionMode}
              matchMode={matchMode}
              onMatchModeChange={handleMatchModeChange}
              rows={conditionRows}
              onRowsChange={updateConditionRows}
              fieldOptions={FIELD_OPTIONS}
              operatorOptions={OPERATOR_OPTIONS}
              jsonValue={conditionText}
              onJsonValueChange={(value) => {
                setPreset("CUSTOM_JSON");
                setConditionText(value);
              }}
              title="Condition Flow"
              description="Build a reusable flow chart. Matching users continue to the target group action below."
            />

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={editingRule.isActive}
                onChange={(event) =>
                  setEditingRule((prev) => ({ ...prev, isActive: event.target.checked }))
                }
                className="h-4 w-4 rounded border-[#1E293B] text-[#B7D1EA] focus:ring-[#B7D1EA]"
              />
              <span className="text-sm font-bold text-gray-300">Rule active</span>
            </label>

            <button
              type="submit"
              disabled={isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#B7D1EA] px-5 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-[#99BFE3] disabled:opacity-50"
            >
              {isPending ? <GsapSpinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              Save Rule
            </button>
          </form>
        </section>

        <section className="space-y-5 rounded-2xl border border-[#1E293B] bg-[#0F172A] p-6 shadow-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gray-400">
                Active Rules
              </p>
              <h2 className="mt-1.5 text-xl font-black text-gray-100">Priority Stack</h2>
              <p className="mt-1 text-sm leading-6 text-gray-400">
                Lower priority numbers run first. The first matched rule assigns the user group.
              </p>
            </div>
            <ShieldCheck className="h-5 w-5 shrink-0 text-[#B7D1EA]" />
          </div>

          <div className="space-y-3">
            <AdminBulkActionBar
              selectedCount={selection.selectedCount}
              visibleCount={sortedRules.length}
              allVisibleSelected={selection.allVisibleSelected}
              someVisibleSelected={selection.someVisibleSelected}
              onToggleVisible={selection.toggleVisible}
              onClear={selection.clear}
              isPending={isPending}
              actions={[{
                id: "delete",
                label: "Delete",
                icon: Trash2,
                tone: "danger",
                onClick: handleBulkDeleteRules,
              }]}
            />
            {sortedRules.length === 0 ? (
              <div className="rounded-xl border border-[#1E293B] bg-[#0B1121] px-4 py-8 text-center text-xs font-bold text-gray-500">
                No rules yet. Seed defaults to start.
              </div>
            ) : (
              sortedRules.map((rule) => (
                <div key={rule.id} className="rounded-xl border border-[#1E293B] bg-[#0B1121] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="pt-1">
                        <AdminSelectionCheckbox
                          checked={selection.isSelected(rule.id)}
                          disabled={isPending}
                          label={`Select user-group rule ${rule.name}`}
                          onChange={() => selection.toggle(rule.id)}
                        />
                      </div>
                      <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[#1E293B] bg-[#0F172A] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-gray-400">
                          #{rule.priority}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${getGroupBadgeClasses(rule.targetGroup)}`}>
                          {getRichMenuProfileLabel(rule.targetGroup)}
                        </span>
                        {rule.isActive ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <CircleDashed className="h-4 w-4 text-gray-500" />
                        )}
                      </div>
                      <h3 className="mt-2 text-sm font-black text-gray-100">{rule.name}</h3>
                      <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-[#0F172A] p-3 font-mono text-[10px] leading-4 text-gray-400">
                        {formatCondition(rule.condition)}
                      </pre>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditRule(rule)}
                        className="rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-400 transition hover:bg-[#0B1121]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-600 transition hover:bg-rose-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="space-y-5 rounded-2xl border border-[#1E293B] bg-[#0F172A] p-6 shadow-none">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gray-400">
              User Preview
            </p>
            <h2 className="mt-1.5 text-xl font-black text-gray-100">Resolved Groups & Overrides</h2>
            <p className="mt-1 text-sm leading-6 text-gray-400">
              Manual overrides take priority over condition rules. LINE delivery still requires a linked LINE user ID.
            </p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              refreshState(query);
            }}
            className="flex w-full gap-2 lg:w-auto"
          >
            <div className="relative flex-1 lg:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search email or name"
                className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] py-2.5 pl-9 pr-3 text-sm text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10"
              />
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-xl border border-[#1E293B] bg-[#0F172A] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-gray-400 transition hover:bg-[#0B1121] disabled:opacity-50"
            >
              {isPending ? <GsapSpinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          </form>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#1E293B]">
          <table className="min-w-full divide-y divide-slate-200 text-left">
            <thead className="bg-[#0B1121]">
              <tr className="text-[10px] font-black uppercase tracking-[0.28em] text-gray-500">
                <th className="px-5 py-3.5">User</th>
                <th className="px-5 py-3.5">Resolved</th>
                <th className="px-5 py-3.5">Signals</th>
                <th className="px-5 py-3.5">Manual Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-[#0F172A]">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-xs font-bold uppercase tracking-widest text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="align-top transition-colors hover:bg-[#0B1121]/70">
                    <td className="px-5 py-4">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-gray-100">
                          {user.fullName || user.name || user.email}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">{user.email}</p>
                        <p className="mt-1 font-mono text-[10px] text-gray-500">
                          {user.role} / {user.department}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${getGroupBadgeClasses(user.resolvedGroup)}`}>
                        {getRichMenuProfileLabel(user.resolvedGroup)}
                      </span>
                      <p className="mt-2 text-xs leading-5 text-gray-400">{user.resolvedReason}</p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-gray-500">
                        {user.resolvedSource}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="space-y-1.5 text-xs text-gray-400">
                        <div className="flex items-center gap-2">
                          {user.hasLineLink ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <CircleDashed className="h-3.5 w-3.5 text-gray-500" />
                          )}
                          <span>{user.hasLineLink ? "LINE linked" : "No LINE link"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {user.hasPurchased ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <CircleDashed className="h-3.5 w-3.5 text-gray-500" />
                          )}
                          <span>{user.hasPurchased ? "Bought" : "No purchase"}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={user.override?.targetGroup ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (!value) {
                              handleClearOverride(user);
                              return;
                            }
                            handleOverride(user, value as RichMenuProfileType);
                          }}
                          disabled={isPending}
                          className="rounded-xl border border-[#1E293B] bg-[#0B1121] px-3 py-2 text-xs font-bold text-gray-300 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10 disabled:opacity-50"
                        >
                          <option value="">Auto</option>
                          {GROUP_OPTIONS.map((group) => (
                            <option key={group} value={group}>
                              {getRichMenuProfileLabel(group)}
                            </option>
                          ))}
                        </select>
                        {user.override && (
                          <button
                            type="button"
                            onClick={() => handleClearOverride(user)}
                            disabled={isPending}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-400 transition hover:bg-[#0B1121] disabled:opacity-50"
                          >
                            <UserCog className="h-3.5 w-3.5" />
                            Clear
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
