import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getDbUser } from "@/app/actions/auth";
import AdjustBomClient from "./AdjustBomClient";
import { listCatalogProducts } from "@/lib/erpnextCatalog";

interface PageProps {
  params: Promise<{ id: string; locale: string }>;
}


export default async function AdjustBomPage({ params }: PageProps) {
  const { id, locale } = await params;
  
  // 1. Authorization Guard
  const dbUser = await getDbUser();
  if (!dbUser || !["ADMIN", "SUPER_ADMIN", "MANAGER", "STAFF"].includes(dbUser.role)) {
    redirect(`/${locale}/login`);
  }

  // 2. Fetch proposal detail
  const proposal = await db.query.proposals.findFirst({
    where: eq(proposals.id, id),
    with: {
      user: {
        columns: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!proposal) {
    notFound();
  }

  // 3. Fetch active catalog products for selection
  const { products: availableProducts } = await listCatalogProducts({ sort: "newest", take: 100 });
  const productOptions = availableProducts.map((product) => ({
    id: product.id,
    name: `${product.brand} ${product.model}`.trim(),
    brand: product.brand,
    model: product.model,
    price: product.price,
  }));

  return (
    <div className="min-h-dvh bg-transparent text-gray-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <AdjustBomClient
          proposal={proposal}
          availableProducts={productOptions}
          locale={locale}
        />
      </div>
    </div>
  );
}
