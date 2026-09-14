"use server";

import { getAnalyticsConfig } from "@/app/actions/systemSettings";

export async function getClientConfig() {
  return getAnalyticsConfig();
}
