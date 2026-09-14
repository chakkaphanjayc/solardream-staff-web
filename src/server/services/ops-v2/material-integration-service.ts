import "server-only";

import { erpNextGateway } from "@/server/services/integrations/erpnext-gateway";
import { hasOpsCapability, OpsDomainError } from "@/lib/opsV2State";
import type { OpsActor } from "@/types/ops-v2";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export async function lookupErpnextMaterial(actor: OpsActor, itemCode: string) {
  if (!hasOpsCapability(actor, "material.read")) {
    throw new OpsDomainError("FORBIDDEN", "Material access is not permitted.");
  }
  const code = text(itemCode);
  if (!code || code.length > 140) {
    throw new OpsDomainError("INVALID_INPUT", "A valid ERPNext item code is required.");
  }
  const item = await erpNextGateway.getItem(code);
  if (!item) return { sourceOfTruth: "ERPNext" as const, item: null, stock: [] };
  const resolvedCode = text(item.item_code) || code;
  const stock = await erpNextGateway.getStock({ itemCode: resolvedCode });
  return {
    sourceOfTruth: "ERPNext" as const,
    item: {
      providerId: text(item.name) || resolvedCode,
      itemCode: resolvedCode,
      itemName: text(item.item_name) || resolvedCode,
      itemGroup: text(item.item_group) || null,
      brand: text(item.brand) || null,
      stockUom: text(item.stock_uom) || null,
      disabled: item.disabled === true || item.disabled === 1 || item.disabled === "1",
    },
    stock,
  };
}
