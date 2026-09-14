"use server";

import { getDbUser } from "@/app/actions/auth";
import type { SolarAddonConfig } from "@/lib/solarAddonConfig";
import { listErpnextAddonConfigs } from "@/lib/erpnextCatalog";

export async function getAddonsCatalogAction(): Promise<{
  success: boolean;
  addons: SolarAddonConfig[];
  error?: string;
}> {
  try {
    return { success: true, addons: await listErpnextAddonConfigs() };
  } catch (error: unknown) {
    console.error("[getAddonsCatalogAction]", error);
    return {
      success: false,
      addons: [],
      error: "Failed to load ERPNext add-ons catalog.",
    };
  }
}

export async function updateAddonsCatalogAction(addons: SolarAddonConfig[]) {
  try {
    const dbUser = await getDbUser();
    if (!dbUser) return { success: false, error: "Unauthorized access." };
    void addons;
    return {
      success: false,
      error: "ERPNext owns add-on identity and pricing. Update the ERPNext Item master instead.",
      message: "ERPNext owns add-on identity and pricing.",
    };
  } catch (error: unknown) {
    console.error("[updateAddonsCatalogAction]", error);
    return {
      success: false,
      error: "Failed to update ERPNext add-ons catalog.",
      message: "ERPNext add-on update was not applied.",
    };
  }
}

export async function resetAddonsCatalogAction() {
  try {
    const dbUser = await getDbUser();
    if (!dbUser) return { success: false, error: "Unauthorized access." };
    return {
      success: false,
      error: "ERPNext owns add-on identity and pricing. There is no local catalog reset.",
      message: "ERPNext owns add-on identity and pricing.",
    };
  } catch (error: unknown) {
    console.error("[resetAddonsCatalogAction]", error);
    return {
      success: false,
      error: "Failed to reset ERPNext add-ons catalog.",
      message: "ERPNext add-on reset was not applied.",
    };
  }
}
