import { connection } from "next/server";
import { Layers } from "@/components/ui/icons";
import { db } from "@/db";
import { GsapPulse, GsapReveal } from "@/components/ui/GsapMotion";
import BlueprintGrid from "./BlueprintGrid";

async function loadAdminBuildDashboard() {
  try {
    // 1. Fetch Blueprints
    const blueprintsList = await db.query.blueprints.findMany({
      orderBy: (blueprints, { asc }) => asc(blueprints.createdAt),
      with: {
        categories: {
          with: {
            products: true
          }
        }
      }
    });

    const blueprints = blueprintsList.map(bp => ({
      ...bp,
      categories: bp.categories.map(cat => ({
        ...cat,
        _count: {
          products: cat.products.length
        }
      }))
    }));

    // Reads must remain side-effect free. Seed/repair operations belong in an
    // explicit migration or an authenticated admin action, never in a page
    // render that can be retried or run concurrently.
    const blueprintsWithStats = blueprints.map(bp => {
      const stepsCount = bp.categories.length;
      const componentsCount = bp.categories.reduce((acc, cat) => acc + cat._count.products, 0);
      return {
        id: bp.id,
        name: bp.name,
        slug: bp.slug,
        description: bp.description,
        isActive: bp.isActive,
        stepsCount,
        componentsCount
      };
    });

    return { blueprintsWithStats };
  } catch (error: unknown) {
    console.error("AdminBuildDashboardPage load error:", error);
    return { error: true as const };
  }
}

export default async function AdminBuildDashboardPage() {
  await connection();
  const result = await loadAdminBuildDashboard();

  if ("error" in result) {
    return (
      <div className="space-y-6 text-center py-20 border border-[#1E293B] bg-[#0F172A] rounded-[2.5rem] shadow-none">
        <GsapPulse className="mx-auto" scale={1.08}>
          <Layers className="h-12 w-12 text-[#B7D1EA]" />
        </GsapPulse>
        <h2 className="text-lg font-black text-gray-100 uppercase tracking-wider">Database Synchronization Spike</h2>
        <p className="text-xs text-gray-400 max-w-sm mx-auto font-semibold leading-relaxed">
          The PostgreSQL database pool is experiencing dynamic DNS spikes. Let&apos;s retry in a brief moment.
        </p>
      </div>
    );
  }

  return (
    <GsapReveal className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-4xl font-black tracking-tight text-gray-100 flex items-center gap-3 font-sans">
          Configurator <span className="text-[#B7D1EA]">Blueprints</span>
        </h1>
        <p className="text-gray-400 text-xs mt-1 uppercase font-black tracking-widest">
          Manage multiple independent configurators and branch steps using step tree networks.
        </p>
      </div>

      {/* Blueprints Grid */}
      <BlueprintGrid initialBlueprints={result.blueprintsWithStats} />
    </GsapReveal>
  );
}
