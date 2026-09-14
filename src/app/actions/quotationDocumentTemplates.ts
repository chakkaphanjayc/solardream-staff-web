"use server";

import { revalidatePath } from "next/cache";

import { requireStaff } from "@/lib/auth-guard";
import {
  parseQuotationDocumentTemplateCatalog,
  QUOTATION_DOCUMENT_TEMPLATE_SETTING_KEY,
  type QuotationDocumentTemplateCatalog,
} from "@/lib/quotationDocumentTemplates";
import { createAdminClient } from "@/utils/supabase/server";

export async function getQuotationDocumentTemplateCatalog(): Promise<QuotationDocumentTemplateCatalog> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", QUOTATION_DOCUMENT_TEMPLATE_SETTING_KEY)
    .maybeSingle();

  return parseQuotationDocumentTemplateCatalog(data?.value);
}

export async function saveQuotationDocumentTemplateCatalog(
  catalog: QuotationDocumentTemplateCatalog,
): Promise<{ success: boolean; catalog?: QuotationDocumentTemplateCatalog; error?: string }> {
  try {
    await requireStaff();
    const normalizedCatalog = parseQuotationDocumentTemplateCatalog(catalog);
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("system_settings")
      .upsert({
        key: QUOTATION_DOCUMENT_TEMPLATE_SETTING_KEY,
        value: JSON.stringify(normalizedCatalog),
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });

    if (error) throw error;
    revalidatePath("/admin/crm");
    revalidatePath("/th/admin/crm", "layout");
    revalidatePath("/en/admin/crm", "layout");
    return { success: true, catalog: normalizedCatalog };
  } catch (error) {
    console.error("[saveQuotationDocumentTemplateCatalog]", error);
    return { success: false, error: "Failed to save document templates." };
  }
}
