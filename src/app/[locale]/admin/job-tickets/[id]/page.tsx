import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth-guard";
import { getJobTicketById } from "@/app/actions/tickets";
import JobTicketDetailClient from "./JobTicketDetailClient";
import { db } from "@/db";
import { installedAssets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listCatalogProducts } from "@/lib/erpnextCatalog";


type JobTicketDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export default async function JobTicketDetailPage({ params }: JobTicketDetailPageProps) {
  await requireStaff();

  const { id } = await params;
  const result = await getJobTicketById(id);

  if (!result.success || !result.ticket) {
    notFound();
  }

  const [{ products: catalogProducts }, projectAssets] = await Promise.all([
    listCatalogProducts({ sort: "newest", take: 100 }),
    db.query.installedAssets.findMany({
      where: eq(installedAssets.proposalId, result.ticket.quotationId),
      orderBy: (asset, { desc }) => [desc(asset.installedDate)],
    }),
  ]);
  const catalogProductOptions = catalogProducts.map((product) => ({
    id: product.id,
    name: `${product.brand} ${product.model}`.trim(),
    brand: product.brand,
    model: product.model,
  }));

  return (
    <JobTicketDetailClient
      ticket={{
        ...result.ticket,
        quotation: {
          ...result.ticket.quotation,
          configurationData: asRecord(result.ticket.quotation.configurationData),
        },
      }}
      catalogProducts={catalogProductOptions}
      initialInstalledAssets={projectAssets}
    />
  );
}
