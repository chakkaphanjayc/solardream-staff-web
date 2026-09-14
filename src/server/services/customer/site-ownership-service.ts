import "server-only";

import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { salesLegacyIdentityMappings } from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function salesCustomerIdForLegacyUser(tx: Transaction, userId: string) {
  const mapping = await tx.query.salesLegacyIdentityMappings.findFirst({
    where: eq(salesLegacyIdentityMappings.userId, userId), columns: { customerId: true },
  });
  return mapping?.customerId ?? null;
}
