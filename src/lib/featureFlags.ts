import "server-only";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { featureFlags } from "@/db/schema";

export type FeatureFlagItem = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const OPS_V2_FEATURE_FLAGS = [
  "OPS_V2_PROJECTS",
  "OPS_V2_PROJECT_WORKSPACE",
  "OPS_V2_SCHEDULING",
  "OPS_V2_FIELD",
  "OPS_V2_ASSETS",
  "OPS_V2_WARRANTY",
  "OPS_V2_AFTER_SALES",
  "OPS_V2_CUSTOMER_PORTAL",
] as const;

export type OpsV2FeatureFlag = (typeof OPS_V2_FEATURE_FLAGS)[number];

const DEFAULT_FLAGS = [
  {
    key: "wizard_module",
    name: "Wizard Engine",
    description: "Interactive Solar Sizing & Proposal Wizard module",
    isActive: true,
  },
  {
    key: "build_configurator",
    name: "Build Configurator",
    description: "Custom Solar Rooftop & System Configurator",
    isActive: true,
  },
  {
    key: "services_module",
    name: "Solar Services",
    description: "Professional Solar Cleaning, Inspection & Maintenance Services",
    isActive: true,
  },
  {
    key: "quotation_dispatch",
    name: "Signature Dispatch",
    description: "Digital Quotation & E-Signature Dispatch portal",
    isActive: true,
  },
  {
    key: "store_commerce",
    name: "Store & Commerce",
    description: "Solar Equipment & Accessories Storefront",
    isActive: true,
  },
  ...OPS_V2_FEATURE_FLAGS.map((key) => ({
    key,
    name: key.replace("OPS_V2_", "").replaceAll("_", " "),
    description: "Incremental Operations V2 rollout switch for "
      + key.replace("OPS_V2_", "").toLowerCase().replaceAll("_", " ")
      + ".",
    isActive: false,
  })),
] as const;

const FEATURE_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/;

function fallbackFlags(): FeatureFlagItem[] {
  const now = new Date();
  return DEFAULT_FLAGS.map((flag) => ({
    id: flag.key,
    key: flag.key,
    name: flag.name,
    description: flag.description,
    isActive: flag.isActive,
    createdAt: now,
    updatedAt: now,
  }));
}

function normalizeFeatureKey(key: string) {
  const normalized = key.trim();
  if (!FEATURE_KEY_PATTERN.test(normalized)) {
    throw new Error("Feature flag key contains unsupported characters or is too long.");
  }
  return normalized;
}

function revalidateFeatureFlagSurfaces() {
  revalidatePath("/", "layout");
  for (const locale of ["en", "th"] as const) {
    revalidatePath(`/${locale}/admin/settings/feature-toggles`);
    revalidatePath(`/${locale}/admin/settings/data`);
  }
}

async function seedFeatureFlagRows(): Promise<FeatureFlagItem[]> {
  await db
    .insert(featureFlags)
    .values([...DEFAULT_FLAGS])
    .onConflictDoNothing({ target: featureFlags.key });

  return db
    .select()
    .from(featureFlags)
    .orderBy(asc(featureFlags.key));
}

export async function loadFeatureFlags(): Promise<FeatureFlagItem[]> {
  try {
    const flags = await db
      .select()
      .from(featureFlags)
      .orderBy(asc(featureFlags.key));

    // Reads stay side-effect free. Run `db:migrate:feature-flags` before
    // production traffic and use the explicit admin seed action when needed.
    return flags.length > 0 ? flags : fallbackFlags();
  } catch (error: unknown) {
    console.error("[Feature flags] Failed to load feature flags:", error);
    return fallbackFlags();
  }
}

export async function isOpsV2FeatureEnabled(key: OpsV2FeatureFlag): Promise<boolean> {
  const flags = await loadFeatureFlags();
  return flags.find((flag) => flag.key === key)?.isActive ?? false;
}

export async function seedFeatureFlagsForAdmin(): Promise<FeatureFlagItem[]> {
  return seedFeatureFlagRows();
}

export async function updateFeatureFlagRecord(
  key: string,
  isActive: boolean,
): Promise<FeatureFlagItem | null> {
  const normalizedKey = normalizeFeatureKey(key);
  const [existing] = await db
    .update(featureFlags)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(featureFlags.key, normalizedKey))
    .returning();

  if (!existing) {
    const defaultInfo = DEFAULT_FLAGS.find((flag) => flag.key === normalizedKey);
    const [created] = await db
      .insert(featureFlags)
      .values({
        key: normalizedKey,
        name: defaultInfo?.name ?? normalizedKey,
        description: defaultInfo?.description ?? `Feature toggle for ${normalizedKey}`,
        isActive,
      })
      .onConflictDoNothing({ target: featureFlags.key })
      .returning();

    if (created) {
      revalidateFeatureFlagSurfaces();
      return created;
    }

    const [racedRecord] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, normalizedKey))
      .limit(1);
    if (!racedRecord) return null;

    const [racedUpdate] = await db
      .update(featureFlags)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(featureFlags.key, normalizedKey))
      .returning();
    revalidateFeatureFlagSurfaces();
    return racedUpdate ?? racedRecord;
  }

  revalidateFeatureFlagSurfaces();
  return existing;
}
