import "server-only";
import { createProposalRevision } from "@/lib/proposal-revisions";
import type { ResolvedCommercials } from "./catalog-dtos";
export async function recordResolvedProposalRevision(input: {
  proposalId: string;
  commercials: ResolvedCommercials;
  configuration: Record<string, unknown>;
  terms?: Record<string, unknown>;
  payment?: Record<string, unknown>;
  createdByUserId?: string | null;
  creationSource: string;
}) {
  const c = input.commercials;
  return createProposalRevision({
    proposalId: input.proposalId,
    createdByUserId: input.createdByUserId,
    creationSource: input.creationSource,
    snapshots: {
      pricing: {
        catalogVersionId: c.catalogVersion.id,
        priceListCode: c.priceList.code,
        currency: c.total.currency,
        taxRuleCode: c.taxPolicy?.code ?? null,
        subtotalMinor: c.subtotal.minorUnits,
        discountMinor: c.discount.minorUnits,
        taxMinor: c.tax.minorUnits,
        totalMinor: c.total.minorUnits,
        lines: c.lines,
      },
      configuration: input.configuration,
      terms: input.terms ?? {},
      payment: input.payment ?? {},
    },
    items: c.lines.map((line, index) => ({
      lineNumber: index + 1,
      itemCode: line.itemId,
      pricing: line,
      configuration: {},
    })),
    commercial: {
      catalogVersionId: c.catalogVersion.id,
      priceListCode: c.priceList.code,
      currency: c.total.currency,
      taxRuleCode: c.taxPolicy?.code ?? null,
      subtotalMinor: c.subtotal.minorUnits,
      discountMinor: c.discount.minorUnits,
      taxMinor: c.tax.minorUnits,
      totalMinor: c.total.minorUnits,
    },
  });
}
