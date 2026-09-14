"use server";

import { z } from "zod";

import { getDbUser } from "@/app/actions/auth";
import { createServiceOrderForUser, getOwnedServiceOrder, listPublicServiceCatalog, ServiceCommerceError } from "@/lib/serviceCommerce";
import type { CreateServiceOrderInput } from "@/lib/serviceCommerceContracts";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";

export async function listPublicServiceCatalogAction() {
  try { return { success: true as const, offerings: await listPublicServiceCatalog() }; }
  catch (error) { console.error("[Service Catalog]", error); return { success: false as const, error: "Service catalog is temporarily unavailable." }; }
}

export async function createServiceOrderAction(input: CreateServiceOrderInput) {
  try {
    const user = await getDbUser();
    if (!user?.isActive) return { success: false as const, error: "Unauthorized." };
    const rate = await enforcePortalRateLimit({ namespace: "service-order-create", identity: user.id, limit: 8, windowSeconds: 600 });
    if (!rate.allowed) return { success: false as const, error: "Too many booking attempts. Please try again later." };
    return { success: true as const, ...(await createServiceOrderForUser(user.id, input)) };
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false as const, error: error.issues[0]?.message || "Invalid service order." };
    if (error instanceof ServiceCommerceError) {
      const messages: Record<ServiceCommerceError["code"], string> = {
        ACCOUNT_UNAVAILABLE: "An active customer account is required.",
        APPOINTMENT_INVALID: "Appointment date must be in the future.",
        OFFERING_UNAVAILABLE: "Service offering is unavailable.",
        ASSET_UNAVAILABLE: "The selected asset is unavailable.",
        AUTH_REQUIRED: "Sign in to use a registered SolarDream system.",
        LEGACY_FLOW_RETIRED: "This maintenance booking flow has been retired. Use the multi-service checkout.",
      };
      return { success: false as const, error: messages[error.code] };
    }
    console.error("[Service Order Create]", error);
    return { success: false as const, error: "Service order could not be created." };
  }
}

export async function getOwnedServiceOrderAction(orderId: string) {
  try {
    const user = await getDbUser();
    if (!user?.isActive) return { success: false as const, error: "Unauthorized." };
    const order = await getOwnedServiceOrder(user.id, orderId);
    return order ? { success: true as const, order } : { success: false as const, error: "Service order not found." };
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false as const, error: "Invalid service order ID." };
    console.error("[Service Order Read]", error);
    return { success: false as const, error: "Service order could not be loaded." };
  }
}
