import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminJson } from "@/lib/auth-guard";
import { loadFeatureFlags, updateFeatureFlagRecord } from "@/lib/featureFlags";

const patchSchema = z
  .object({
    key: z.string().trim().min(1).max(120),
    is_active: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.is_active !== undefined || value.isActive !== undefined, {
    message: "A boolean active state is required.",
  });

export async function GET() {
  try {
    const flags = await loadFeatureFlags();
    // Return key-value map as well as full list for max client flexibility
    const flagsMap = flags.reduce<Record<string, boolean>>((acc, item) => {
      acc[item.key] = item.isActive;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      flags: flagsMap,
      items: flags,
    });
  } catch (error) {
    console.error("GET /api/system/feature-flags error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch feature flags" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const access = await requireAdminJson();
  if (!access.ok) return access.response;

  try {
    const body: unknown = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid feature flag update." },
        { status: 400 },
      );
    }

    const activeState = parsed.data.is_active ?? parsed.data.isActive;
    const updated = await updateFeatureFlagRecord(parsed.data.key, activeState ?? false);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Feature flag could not be found or created." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      updated,
      key: updated.key,
      is_active: activeState,
    });
  } catch (error) {
    console.error("PATCH /api/system/feature-flags error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update feature flag" },
      { status: 500 }
    );
  }
}
