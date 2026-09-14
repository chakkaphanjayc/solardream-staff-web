"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, RefreshCw, Save, ShieldCheck } from "@/components/ui/icons";
import { toast } from "sonner";

import { saveSystemSetting, triggerCatalogSync } from "@/app/actions/systemSettings";
import { GsapSpinner } from "@/components/ui/GsapMotion";

interface CatalogSettingsClientProps {
  initialEndpoint: string;
  webhookEnabled?: boolean;
}

type CatalogCheckSummary = {
  itemCount: number;
  activeItemCount: number;
  categoryCount: number;
  brandCount: number;
  checkedAt: string;
};

export default function CatalogSettingsClient({ initialEndpoint }: CatalogSettingsClientProps) {
  const [endpoint, setEndpoint] = useState(initialEndpoint);
  const [isSaving, startSaving] = useTransition();
  const [isChecking, startChecking] = useTransition();
  const [check, setCheck] = useState<CatalogCheckSummary | null>(null);

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEndpoint = endpoint.trim().replace(/\/$/, "");
    if (!normalizedEndpoint) {
      toast.error("ERPNext site endpoint is required.");
      return;
    }

    startSaving(async () => {
      const result = await saveSystemSetting("erpnext_site_endpoint", normalizedEndpoint);
      if (!result.success) {
        toast.error(result.error || "Unable to save ERPNext endpoint.");
        return;
      }

      setEndpoint(normalizedEndpoint);
      toast.success("ERPNext connection metadata saved.");
    });
  };

  const handleCheck = () => {
    startChecking(async () => {
      try {
        const response = await triggerCatalogSync();
        if (!response.success) {
          toast.error(response.error || "Unable to read the ERPNext catalog.");
          return;
        }

        setCheck({
          itemCount: response.summary?.totalRowsFound ?? 0,
          activeItemCount: response.activeItemCount ?? response.summary?.totalRowsFound ?? 0,
          categoryCount: response.taxonomy?.categories.fetched ?? 0,
          brandCount: response.taxonomy?.brands.fetched ?? 0,
          checkedAt: new Date().toISOString(),
        });
        toast.success("ERPNext catalog availability checked.");
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Unable to read the ERPNext catalog.");
      }
    });
  };

  return (
    <div className="space-y-6 text-[#c9d1d9]">
      <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#238636]/15 text-[#3fb950]">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8b949e]">Catalog ownership</p>
              <h2 className="mt-1 text-xl font-semibold text-[#f0f6fc]">ERPNext is the product master</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8b949e]">
                Items, Item Groups, Brands, Item Prices, stock, and Product Bundles are read directly from ERPNext.
                This application does not stage, approve, archive, or write catalog records locally.
              </p>
            </div>
          </div>
          {endpoint ? (
            <a
              href={endpoint}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-[#30363d] px-3 py-2 text-xs font-semibold text-[#c9d1d9] transition-colors hover:border-[#58a6ff] hover:text-[#58a6ff]"
            >
              Open ERPNext
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
        </div>

        <form onSubmit={handleSave} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8b949e]">ERPNext site endpoint</span>
            <input
              type="url"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="https://your-site.frappe.cloud"
              className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2.5 text-sm text-[#f0f6fc] outline-none transition focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]"
            />
          </label>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2.5 text-sm font-semibold text-[#f0f6fc] transition-colors hover:border-[#58a6ff] hover:bg-[#30363d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            Save endpoint
          </button>
        </form>
        <p className="mt-3 text-xs leading-5 text-[#8b949e]">
          API credentials remain server-only. Configure them through the deployment environment or protected system settings.
        </p>
      </section>

      <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8b949e]">Read-only health check</p>
            <h2 className="mt-1 text-lg font-semibold text-[#f0f6fc]">Verify live master data</h2>
            <p className="mt-1 text-sm text-[#8b949e]">Confirm that the configured ERPNext connection can serve catalog data to the storefront and sales tools.</p>
          </div>
          <button
            type="button"
            onClick={handleCheck}
            disabled={isChecking}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#238636] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isChecking ? <GsapSpinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Check ERPNext now
          </button>
        </div>

        {check ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Items returned" value={check.itemCount} />
            <Metric label="Active items" value={check.activeItemCount} />
            <Metric label="Item Groups" value={check.categoryCount} />
            <Metric label="Brands" value={check.brandCount} />
          </div>
        ) : (
          <div className="mt-5 flex items-start gap-3 rounded-lg border border-dashed border-[#30363d] bg-[#0d1117] p-4 text-sm text-[#8b949e]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#3fb950]" aria-hidden="true" />
            Run a check after configuring the endpoint. The result is never copied into a local product table.
          </div>
        )}

        {check ? <p className="mt-4 text-xs text-[#8b949e]">Last checked {new Date(check.checkedAt).toLocaleString()}</p> : null}
      </section>

      <section className="rounded-xl border border-[#30363d] bg-[#0d1117] p-5">
        <p className="text-sm font-semibold text-[#f0f6fc]">Where catalog changes happen</p>
        <ol className="mt-3 grid gap-3 text-sm leading-6 text-[#8b949e] md:grid-cols-3">
          <li><span className="font-semibold text-[#c9d1d9]">1. ERPNext Item</span><br />Create or update the item, group, brand, image, and sales status.</li>
          <li><span className="font-semibold text-[#c9d1d9]">2. ERPNext Item Price</span><br />Maintain the active selling price list used by SolarDream.</li>
          <li><span className="font-semibold text-[#c9d1d9]">3. ERPNext stock</span><br />Inventory and availability are read from ERPNext Bin records.</li>
        </ol>
        <p className="mt-4 text-xs text-[#8b949e]">Use ERPNext permissions and workflows to control who can create, price, publish, or archive catalog items.</p>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8b949e]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-[#f0f6fc]">{value.toLocaleString()}</p>
    </div>
  );
}
