"use server";

import { createClient } from "@/utils/supabase/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { mapUserToQuotationProfileDefaults } from "@/lib/profileDefaults";

export async function getQuotationProfileDefaults() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: true,
      defaults: {
        fullLegalName: "",
        contactPhoneNumber: "",
        email: "",
        primaryAddress: "",
      },
    };
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: {
      email: true,
      name: true,
      phoneNumber: true,
      lastEstimateDraft: true,
    },
  });

  return {
    success: true,
    defaults: mapUserToQuotationProfileDefaults({
      email: dbUser?.email || user.email || "",
      name: dbUser?.name || user.user_metadata?.full_name || user.user_metadata?.name || "",
      phoneNumber: dbUser?.phoneNumber || user.phone || "",
      lastEstimateDraft: dbUser?.lastEstimateDraft,
    }),
  };
}
