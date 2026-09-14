import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { systemSettingsKeyValue } from "@/db/schema";
import { isLocale, type Locale } from "@/i18n/locales";

export const RUNTIME_MESSAGE_OVERRIDES_KEY = "runtime_message_overrides";
export const RUNTIME_MESSAGES_CACHE_TAG = "runtime-message-overrides";

export type MessageValue = string | MessageTree | readonly MessageValue[];

export type MessageTree = {
  [key: string]: MessageValue;
};

export type MessageEntries = Record<string, string>;
export type RuntimeMessageOverrides = Partial<Record<Locale, MessageTree>>;

function isMessageTree(value: unknown): value is MessageTree {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeTree(value: unknown): MessageTree {
  if (!isMessageTree(value)) return {};

  const sanitized: MessageTree = {};
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") sanitized[key] = child;
    else if (isMessageTree(child)) {
      const nested = sanitizeTree(child);
      if (Object.keys(nested).length > 0) sanitized[key] = nested;
    }
  }
  return sanitized;
}

export function parseRuntimeMessageOverrides(value: unknown): RuntimeMessageOverrides {
  if (!isMessageTree(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([locale, tree]) =>
      isLocale(locale) ? [[locale, sanitizeTree(tree)]] : [],
    ),
  ) as RuntimeMessageOverrides;
}

export async function getRuntimeMessageOverrides(): Promise<RuntimeMessageOverrides> {
  "use cache";

  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag(RUNTIME_MESSAGES_CACHE_TAG);

  try {
    const row = await db.query.systemSettingsKeyValue.findFirst({
      where: eq(systemSettingsKeyValue.key, RUNTIME_MESSAGE_OVERRIDES_KEY),
      columns: { value: true },
    });

    if (!row?.value) return {};
    return parseRuntimeMessageOverrides(JSON.parse(row.value));
  } catch (error) {
    console.error("[Runtime messages] Failed to load overrides:", error);
    return {};
  }
}

export function mergeRuntimeMessageOverrides(
  messages: MessageTree,
  overrides: MessageTree | undefined,
): MessageTree {
  if (!overrides) return messages;

  return Object.fromEntries(
    Object.entries(messages).map(([key, value]) => {
      const override = overrides[key];
      if (typeof value === "string") {
        return [key, typeof override === "string" ? override : value];
      }
      return [key, isMessageTree(value)
        ? mergeRuntimeMessageOverrides(value, isMessageTree(override) ? override : undefined)
        : value];
    }),
  ) as MessageTree;
}

export async function getRuntimeMessages(locale: Locale, messages: MessageTree): Promise<MessageTree> {
  const overrides = await getRuntimeMessageOverrides();
  return mergeRuntimeMessageOverrides(messages, overrides[locale]);
}

export function flattenMessageEntries(messages: MessageTree, prefix = ""): MessageEntries {
  return Object.fromEntries(
    Object.entries(messages).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string") return [[path, value]];
      return isMessageTree(value) ? Object.entries(flattenMessageEntries(value, path)) : [];
    }),
  );
}

export function getMessageEntry(messages: MessageTree, path: string): string | undefined {
  const segments = path.split(".").filter(Boolean);
  let current: MessageValue = messages;

  for (const segment of segments) {
    if (!isMessageTree(current) || !(segment in current)) return undefined;
    current = current[segment];
  }

  return typeof current === "string" ? current : undefined;
}

export function setMessageEntry(messages: MessageTree, path: string, value: string | null): MessageTree {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) return messages;

  const next = structuredClone(messages);
  let current: MessageTree = next;

  for (const segment of segments.slice(0, -1)) {
    const child = current[segment];
    if (!isMessageTree(child)) current[segment] = {};
    current = current[segment] as MessageTree;
  }

  const last = segments[segments.length - 1];
  if (value === null) delete current[last];
  else current[last] = value;

  return next;
}
