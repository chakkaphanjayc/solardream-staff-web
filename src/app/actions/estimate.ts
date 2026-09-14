"use server";

import { createClient } from "@/utils/supabase/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const MAX_DRAFT_DEPTH = 6;
const MAX_ARRAY_LENGTH = 80;
const MAX_OBJECT_KEYS = 80;
const MAX_STRING_LENGTH = 2_000;

function sanitizeEstimateDraft(value: unknown, depth = 0): JsonValue {
  if (depth > MAX_DRAFT_DEPTH) return null;
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeEstimateDraft(item, depth + 1));
  }
  if (typeof value === "object") {
    const output: { [key: string]: JsonValue } = {};
    for (const [rawKey, rawValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      const key = rawKey.trim().slice(0, 120);
      if (!key || key === "__proto__" || key === "constructor" || key === "prototype") continue;
      output[key] = sanitizeEstimateDraft(rawValue, depth + 1);
    }
    return output;
  }
  return null;
}

export async function saveEstimateDraft(draftData: unknown) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  try {
    await db.update(users)
      .set({
        lastEstimateDraft: sanitizeEstimateDraft(draftData),
      })
      .where(eq(users.id, user.id));
    return { success: true };
  } catch (err: unknown) {
    console.error("Failed to save estimate draft:", err);
    return { error: "Failed to save draft" };
  }
}

export async function getEstimateDraft() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { draft: null };
  }

  try {
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { lastEstimateDraft: true },
    });
    return { draft: dbUser?.lastEstimateDraft || null };
  } catch (err: unknown) {
    console.error("Failed to fetch estimate draft:", err);
    return { draft: null };
  }
}
