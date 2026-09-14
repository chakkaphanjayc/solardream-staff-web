"use server";

import { requireAdmin } from "@/lib/auth-guard";
import {
  loadFeatureFlags,
  seedFeatureFlagsForAdmin,
  updateFeatureFlagRecord,
} from "@/lib/featureFlags";

export type { FeatureFlagItem } from "@/lib/featureFlags";
import type { FeatureFlagItem } from "@/lib/featureFlags";

export async function seedFeatureFlags(): Promise<FeatureFlagItem[]> {
  await requireAdmin();
  try {
    return await seedFeatureFlagsForAdmin();
  } catch (error: unknown) {
    console.error("[Feature flags] Failed to seed feature flags:", error);
    return [];
  }
}

export async function getFeatureFlags(): Promise<FeatureFlagItem[]> {
  await requireAdmin();
  return loadFeatureFlags();
}

export async function updateFeatureFlag(
  key: string,
  isActive: boolean,
): Promise<FeatureFlagItem | null> {
  await requireAdmin();
  return updateFeatureFlagRecord(key, isActive);
}
