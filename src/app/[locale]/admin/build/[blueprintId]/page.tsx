import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Layers } from "@/components/ui/icons";
import { db } from "@/db";
import { GsapPulse, GsapReveal } from "@/components/ui/GsapMotion";
import BlueprintLocalizationEditor from "../BlueprintLocalizationEditor";
import CategoriesList from "../CategoriesList";

interface BlueprintDetailPageProps {
  params: Promise<{ blueprintId: string; locale: string }>;
}

async function loadBlueprintDetail(blueprintId: string) {
  try {
    // 1. Fetch Blueprints
    const blueprints = await db.query.blueprints.findMany({
      orderBy: (blueprints, { asc }) => asc(blueprints.createdAt)
    });

    const activeBlueprint = blueprints.find(bp => bp.id === blueprintId);
    if (!activeBlueprint) {
      return { notFound: true as const };
    }

    // 2. Fetch categories for this specific blueprint
    const categoriesList = await db.query.categories.findMany({
      where: (categories, { eq }) => eq(categories.blueprintId, blueprintId),
      orderBy: (categories, { asc }) => asc(categories.displayOrder),
      with: {
        products: true,
      }
    });

    const categories = categoriesList.map(cat => ({
      ...cat,
      _count: {
        products: cat.products.length
      }
    }));

    return { activeBlueprint, blueprints, categories };
  } catch (error: unknown) {
    console.error("BlueprintDetailPage load error:", error);
    return { error: true as const };
  }
}

export default async function BlueprintDetailPage({ params }: BlueprintDetailPageProps) {
  await connection();
  const { blueprintId } = await params;
  const result = await loadBlueprintDetail(blueprintId);

  if ("notFound" in result) {
    notFound();
  }

  if ("error" in result) {
    return (
      <div className="space-y-6 text-center py-20 border border-[#1E293B] bg-[#0F172A] rounded-[2.5rem] shadow-none">
        <GsapPulse className="mx-auto" scale={1.08}>
          <Layers className="h-12 w-12 text-[#B7D1EA]" />
        </GsapPulse>
        <h2 className="text-lg font-black text-gray-100 uppercase tracking-wider">Database Synchronization Spike</h2>
        <p className="text-xs text-gray-400 max-w-sm mx-auto font-semibold leading-relaxed">
          The PostgreSQL database pool is experiencing connection spikes. Please try reloading in a moment.
        </p>
      </div>
    );
  }

  return (
    <GsapReveal className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-4xl font-black tracking-tight text-gray-100 flex items-center gap-3 font-sans">
          Build <span className="text-[#B7D1EA]">Manager</span>
        </h1>
        <p className="text-gray-400 text-xs mt-1 uppercase font-black tracking-widest">
          Configure visual step categories and node relationships for {result.activeBlueprint.name}.
        </p>
      </div>

      <BlueprintLocalizationEditor blueprint={result.activeBlueprint} />

      {/* TreeView manager */}
      <CategoriesList
        initialCategories={result.categories}
        initialBlueprints={result.blueprints}
        selectedBlueprintId={blueprintId}
      />
    </GsapReveal>
  );
}
