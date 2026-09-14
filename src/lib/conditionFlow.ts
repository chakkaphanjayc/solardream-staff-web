export type ConditionMode = "BUILDER" | "JSON";
export type MatchMode = "all" | "any";
export type ConditionFieldType = "text" | "boolean" | "enum";

export type ConditionFieldOption<TField extends string = string> = {
  value: TField;
  label: string;
  type: ConditionFieldType;
  values?: string[];
};

export type ConditionOperator =
  | "exists"
  | "not_exists"
  | "equals"
  | "not_equals"
  | "in"
  | "contains"
  | "not_contains";

export type ConditionOperatorOption = {
  value: ConditionOperator;
  label: string;
  needsValue: boolean;
};

export type ConditionRow<TField extends string = string> = {
  id: string;
  field: TField;
  operator: ConditionOperator;
  value: string;
};

export type FlowCondition<TField extends string = string> =
  | { all: FlowCondition<TField>[] }
  | { any: FlowCondition<TField>[] }
  | {
      field: TField;
      operator: ConditionOperator;
      value?: unknown;
    };

export const DEFAULT_CONDITION_OPERATORS: ConditionOperatorOption[] = [
  { value: "exists", label: "exists", needsValue: false },
  { value: "not_exists", label: "does not exist", needsValue: false },
  { value: "equals", label: "is", needsValue: true },
  { value: "not_equals", label: "is not", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "not_contains", label: "does not contain", needsValue: true },
  { value: "in", label: "is one of", needsValue: true },
];

export function createConditionRow<TField extends string>(
  defaultField: TField,
  overrides: Partial<ConditionRow<TField>> = {},
): ConditionRow<TField> {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `condition-${Date.now()}-${Math.random()}`,
    field: defaultField,
    operator: "equals",
    value: "true",
    ...overrides,
  };
}

export function formatCondition(condition: unknown) {
  return JSON.stringify(condition, null, 2);
}

export function parseConditionJson<TCondition>(value: string): TCondition {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Condition must be a JSON object.");
  }
  return parsed as TCondition;
}

export function getFieldOption<TField extends string>(
  fieldOptions: ConditionFieldOption<TField>[],
  field: TField,
) {
  return fieldOptions.find((option) => option.value === field) ?? fieldOptions[0];
}

export function operatorNeedsValue(
  operatorOptions: ConditionOperatorOption[],
  operator: ConditionOperator,
) {
  return operatorOptions.find((option) => option.value === operator)?.needsValue ?? true;
}

function parseRowValue<TField extends string>(
  row: ConditionRow<TField>,
  fieldOptions: ConditionFieldOption<TField>[],
  operatorOptions: ConditionOperatorOption[],
): unknown {
  if (!operatorNeedsValue(operatorOptions, row.operator)) return undefined;
  const field = getFieldOption(fieldOptions, row.field);
  if (row.operator === "in") {
    return row.value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (field.type === "boolean" ? item === "true" : item));
  }
  if (field.type === "boolean") return row.value === "true";
  return row.value;
}

export function rowsToCondition<TCondition, TField extends string = string>(
  rows: ConditionRow<TField>[],
  matchMode: MatchMode,
  fieldOptions: ConditionFieldOption<TField>[],
  operatorOptions: ConditionOperatorOption[],
): TCondition {
  const fieldConditions = rows.map((row) => {
    const condition: Record<string, unknown> = {
      field: row.field,
      operator: row.operator,
    };
    if (operatorNeedsValue(operatorOptions, row.operator)) {
      condition.value = parseRowValue(row, fieldOptions, operatorOptions);
    }
    return condition as FlowCondition<TField>;
  });

  if (fieldConditions.length === 1) return fieldConditions[0] as TCondition;
  return { [matchMode]: fieldConditions } as TCondition;
}

function isFieldCondition<TField extends string>(
  value: unknown,
  fieldOptions: ConditionFieldOption<TField>[],
  operatorOptions: ConditionOperatorOption[],
): value is {
  field: TField;
  operator: ConditionOperator;
  value?: unknown;
} {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.field === "string" &&
    fieldOptions.some((field) => field.value === record.field) &&
    typeof record.operator === "string" &&
    operatorOptions.some((operator) => operator.value === record.operator)
  );
}

function stringifyRowValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  return String(value);
}

export function conditionToRows<TField extends string>(
  condition: unknown,
  fieldOptions: ConditionFieldOption<TField>[],
  operatorOptions: ConditionOperatorOption[],
): {
  mode: ConditionMode;
  matchMode: MatchMode;
  rows: ConditionRow<TField>[];
} {
  const defaultField = fieldOptions[0].value;

  if (isFieldCondition(condition, fieldOptions, operatorOptions)) {
    return {
      mode: "BUILDER",
      matchMode: "all",
      rows: [
        createConditionRow(defaultField, {
          field: condition.field,
          operator: condition.operator,
          value: stringifyRowValue(condition.value),
        }),
      ],
    };
  }

  if (condition && typeof condition === "object") {
    const record = condition as Record<string, unknown>;
    const key = Array.isArray(record.all) ? "all" : Array.isArray(record.any) ? "any" : null;
    if (key) {
      const sourceRows = record[key] as unknown[];
      const rows = sourceRows
        .filter((item) => isFieldCondition(item, fieldOptions, operatorOptions))
        .map((item) =>
          createConditionRow(defaultField, {
            field: item.field,
            operator: item.operator,
            value: stringifyRowValue(item.value),
          }),
        );
      if (rows.length === sourceRows.length && rows.length > 0) {
        return { mode: "BUILDER", matchMode: key, rows };
      }
    }
  }

  return { mode: "JSON", matchMode: "all", rows: [createConditionRow(defaultField)] };
}
