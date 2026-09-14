import { getWizardById } from "@/app/actions/wizard";
import WizardEditorClient from "./WizardEditorClient";
import { notFound } from "next/navigation";
import type { RecommendCategory } from "@/lib/wizardRecommendation";
import { listCatalogCategories, listCatalogProducts } from "@/lib/erpnextCatalog";


export default async function WizardEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const [wizard, erpCategories, productResult] = await Promise.all([
    isNew ? Promise.resolve(null) : getWizardById(id),
    listCatalogCategories(),
    listCatalogProducts({ take: 100 }),
  ]);
  const recommendationCategories: RecommendCategory[] = erpCategories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    displayOrder: category.displayOrder,
    isRequired: category.isRequired,
    products: productResult.products
      .filter((product) => product.categoryId === category.id)
      .sort((left, right) => right.recommendPriority - left.recommendPriority || left.price - right.price)
      .map((product) => ({
        id: product.id,
        name: `${product.brand} ${product.model}`.trim(),
        brand: product.brand,
        model: product.model,
        erpnextItemCode: product.erpnextItemCode,
        price: product.price,
        imageUrl: product.imageUrl,
        description: product.description,
        categoryId: product.categoryId,
        metadata: product.metadata,
        useInRecommendation: product.useInRecommendation,
        recommendTier: product.recommendTier,
        recommendPriority: product.recommendPriority,
      })),
  }));

  if (!isNew && !wizard) {
    notFound();
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <WizardEditorClient
        initialData={wizard}
        recommendationCategories={recommendationCategories}
      />
    </div>
  );
}
