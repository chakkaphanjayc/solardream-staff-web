"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, PackagePlus, RefreshCw, Search, Trash2 } from "@/components/ui/icons";

export type ErpnextItemMaster = {
  id: string;
  itemCode: string;
  itemName: string;
  rate: number;
  cost: number | null;
  stockQty: number;
};

export type ProposalBoqLine = {
  itemCode: string;
  itemName: string;
  qty: number;
  rate: number;
  amount: number;
};

export type BoqLine = {
  id: string;
  itemCode: string;
  itemName: string;
  source: "BUNDLE" | "ADDON";
  qty: number;
  rate: number;
  cost: number | null;
  stockQty: number;
};

export type BoqBuilderProps = {
  proposalId?: string;
  leadId?: string;
  customerName?: string;
  currency?: string;
  initialBundleCode?: string | null;
  initialLines?: Array<{
    id?: string;
    itemCode: string;
    itemName: string;
    source?: "BUNDLE" | "ADDON";
    qty: number;
    rate: number;
  }>;
  amendedFrom?: string;
  onCreated: (quotationId: string, grandTotal?: number) => void;
};

type FeedbackKind = "loading" | "success" | "error";
type BundleOption = { itemCode: string; label: string };

const BUNDLE_CACHE_KEY = "solardream:erpnext:product-bundles:v1";

function money(amount: number, currency = "THB") {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function quantity(amount: number) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(amount);
}

export default function BoqBuilder({
  proposalId,
  leadId,
  customerName,
  currency = "THB",
  initialBundleCode,
  initialLines,
  amendedFrom,
  onCreated,
}: BoqBuilderProps) {
  const [bundleCode, setBundleCode] = useState<string>(() => initialBundleCode ?? "");
  const [bundles, setBundles] = useState<BundleOption[]>([]);
  const [selectedBundle, setSelectedBundle] = useState<BundleOption | null>(null);
  const [lines, setLines] = useState<BoqLine[]>(() => (initialLines ?? []).map((l, i) => ({
    id: l.id ?? `${l.itemCode}-${i}`,
    itemCode: l.itemCode,
    itemName: l.itemName,
    source: l.source ?? "BUNDLE",
    qty: l.qty,
    rate: l.rate,
    cost: null,
    stockQty: 0,
  })));
  const [matches, setMatches] = useState<ErpnextItemMaster[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [busy, setBusy] = useState<"bundle-list" | "bundle" | "search" | "create" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>("success");
  const [template, setTemplate] = useState<string | null>(null);

  const totals = lines.reduce((sum, line) => sum + line.qty * line.rate, 0);

  const loadAvailableBundles = async (forceRefresh: boolean) => {
    setBusy("bundle-list");
    setFeedbackKind("loading");
    setMessage(forceRefresh ? "Refreshing Product Bundles from ERPNext…" : "Loading Product Bundles from ERPNext…");
    try {
      const response = await fetch(`/api/admin/boq/bundles${forceRefresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      const payload = await response.json() as { bundles?: BundleOption[]; error?: string };
      if (!response.ok || !payload.bundles) throw new Error(payload.error || "Unable to load Product Bundles.");
      setBundles(payload.bundles);
      window.sessionStorage.setItem(BUNDLE_CACHE_KEY, JSON.stringify(payload.bundles));
      setFeedbackKind("success");
      setMessage(`Loaded ${payload.bundles.length} ${payload.bundles.length === 1 ? "Product Bundle" : "Product Bundles"} from ERPNext.`);
    } catch (error) {
      setFeedbackKind("error");
      setMessage(error instanceof Error ? error.message : "Unable to load Product Bundles.");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    const cachedBundles = window.sessionStorage.getItem(BUNDLE_CACHE_KEY);
    if (cachedBundles) {
      try {
        const parsed = JSON.parse(cachedBundles) as unknown;
        if (Array.isArray(parsed) && parsed.every((bundle) => bundle && typeof bundle === "object" && "itemCode" in bundle && "label" in bundle)) {
          setBundles(parsed as BundleOption[]);
          return;
        }
      } catch {
        window.sessionStorage.removeItem(BUNDLE_CACHE_KEY);
      }
    }
    void loadAvailableBundles(false);
  }, []);

  const loadBundle = async (bundle: BundleOption) => {
    const nextBundleCode = bundle.itemCode;
    if (!nextBundleCode) return;
    setBundleCode(nextBundleCode);
    setBusy("bundle");
    setFeedbackKind("loading");
    setMessage(`Loading BOQ lines for ${nextBundleCode}…`);
    try {
      const response = await fetch(`/api/erpnext/bundles?itemCode=${encodeURIComponent(nextBundleCode)}`);
      const payload = await response.json() as { templateItemCode?: string; lines?: Array<{ itemCode: string; itemName: string; qty: number; rate: number; cost: number | null; stockQty: number }>; error?: string };
      if (!response.ok || !payload.lines) throw new Error(payload.error || "Unable to load product bundle lines.");
      setTemplate(payload.templateItemCode ?? nextBundleCode);
      setLines(payload.lines.map((item) => ({
        id: `${item.itemCode}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        itemCode: item.itemCode,
        itemName: item.itemName,
        source: "BUNDLE",
        qty: item.qty,
        rate: item.rate,
        cost: item.cost,
        stockQty: item.stockQty,
      })));
      setSelectedBundle({ itemCode: payload.templateItemCode ?? nextBundleCode, label: bundle.label });
      setFeedbackKind("success");
      setMessage(`Loaded and locked ${payload.lines.length} BOQ ${payload.lines.length === 1 ? "line" : "lines"} from ${bundle.label}.`);
    } catch (error) {
      setFeedbackKind("error");
      setMessage(error instanceof Error ? error.message : "Unable to load product bundle.");
    } finally {
      setBusy(null);
    }
  };

  const changeBundle = () => {
    setSelectedBundle(null);
    setTemplate(null);
    setBundleCode("");
    setLines([]);
    setMatches([]);
    setItemQuery("");
    setFeedbackKind("success");
    setMessage("Choose a new Product Bundle. The previous BOQ lines were cleared.");
  };

  const searchItems = async () => {
    if (!itemQuery.trim()) return;
    setBusy("search");
    setMessage(null);
    try {
      const response = await fetch(`/api/erpnext/items?query=${encodeURIComponent(itemQuery.trim())}`);
      const payload = await response.json() as { items?: ErpnextItemMaster[]; error?: string };
      if (!response.ok || !payload.items) throw new Error(payload.error || "Unable to search ERPNext item master.");
      setMatches(payload.items);
      setFeedbackKind("success");
      setMessage(payload.items.length ? `Found ${payload.items.length} matching ${payload.items.length === 1 ? "item" : "items"}.` : "No ERPNext items match that search.");
    } catch (error) {
      setFeedbackKind("error");
      setMessage(error instanceof Error ? error.message : "Unable to search items.");
    } finally {
      setBusy(null);
    }
  };

  const updateLine = (id: string, field: "qty" | "rate", value: string) => {
    const parsed = Number.parseFloat(value);
    const nextValue = Number.isNaN(parsed) ? 0 : parsed;
    setLines((current) => current.map((line) => line.id === id ? { ...line, [field]: nextValue } : line));
  };

  const createQuotation = async () => {
    if (lines.length === 0) return;
    setBusy("create");
    setMessage(null);
    try {
      const response = await fetch("/api/quotation/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          customerName,
          proposalId,
          bundleItemCode: template ?? bundleCode,
          amendedFrom,
          lines: lines.map((line) => ({
            itemCode: line.itemCode,
            itemName: line.itemName,
            qty: line.qty,
            rate: line.rate,
            amount: line.qty * line.rate,
          })),
        }),
      });
      const payload = await response.json() as { quotationId?: string; error?: string };
      if (!response.ok || !payload.quotationId) throw new Error(payload.error || "ERPNext quotation could not be created.");
      onCreated(payload.quotationId, totals);
    } catch (error) {
      setFeedbackKind("error");
      setMessage(error instanceof Error ? error.message : "ERPNext quotation could not be created.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-[#0F172A] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-lg font-black text-white">Custom BOQ Builder</h3>
          <p className="mt-1 text-sm text-slate-400">Load a Product Bundle, then quote its flattened materials and labour lines.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadAvailableBundles(true)}
          disabled={busy !== null}
          aria-busy={busy === "bundle-list"}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          <RefreshCw className={busy === "bundle-list" ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {busy === "bundle-list" ? "Refreshing bundles…" : "Refresh bundles"}
        </button>
      </div>

      {amendedFrom ? (
        <p className="sticky top-3 z-10 mt-4 rounded-xl border border-[#B7D1EA] bg-[#B7D1EA]/20 px-3 py-2 text-sm font-bold text-white">
          Drafting Revision (Based on {amendedFrom})
        </p>
      ) : null}

      {message ? (
        <p
          className={`mt-4 rounded-xl border px-3 py-2 text-sm font-semibold ${
            feedbackKind === "loading"
              ? "border-[#B7D1EA]/50 bg-[#B7D1EA]/10 text-[#D7E8F8]"
              : feedbackKind === "success"
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                : "border-amber-400/60 bg-amber-50 text-amber-800"
          }`}
          role={feedbackKind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}

      <div className="mt-5 space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-300">Base packages</p>
            <span className="text-xs text-slate-500">{bundles.length} available</span>
          </div>
          {selectedBundle ? (
            <div className="flex flex-col gap-3 rounded-xl border border-[#B7D1EA]/50 bg-[#B7D1EA]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-white">{selectedBundle.label}</p>
                <p className="mt-1 font-mono text-xs text-[#D7E8F8]">{selectedBundle.itemCode}</p>
              </div>
              <button type="button" onClick={changeBundle} disabled={busy !== null} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-[#B7D1EA]/60 px-4 text-xs font-black text-[#D7E8F8] transition hover:bg-[#B7D1EA]/15 hover:text-white disabled:opacity-60">Change bundle</button>
            </div>
          ) : bundles.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {bundles.map((bundle) => (
                <button
                  key={bundle.itemCode}
                  type="button"
                  onClick={() => void loadBundle(bundle)}
                  disabled={busy !== null}
                  aria-busy={busy === "bundle" && bundleCode === bundle.itemCode}
                  className="min-h-11 rounded-xl border border-slate-700 bg-[#0B1121] p-3 text-left text-sm font-bold text-slate-300 transition hover:border-[#B7D1EA] hover:bg-[#B7D1EA]/10 hover:text-white disabled:opacity-60"
                >
                  {bundle.label}
                  <span className="mt-1 block font-mono text-xs font-medium text-slate-500">{bundle.itemCode}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-700 px-4 py-5 text-sm text-slate-400">No Product Bundles are available. Refresh to fetch them from ERPNext.</p>
          )}
        </div>

        {template || lines.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[940px] w-full text-left text-sm">
                <thead className="border-b border-slate-700 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="p-2">Item</th>
                    <th className="p-2">Source</th>
                    <th className="p-2">Qty</th>
                    <th className="p-2">Rate</th>
                    <th className="p-2 text-right">Cost</th>
                    <th className="p-2 text-right">Stock left</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const remainingStock = line.stockQty - line.qty;
                    const isInsufficientStock = remainingStock < 0;
                    return (
                    <tr key={line.id} className="border-b border-slate-800">
                      <td className="p-2">
                        <p className="font-bold text-white">{line.itemName}</p>
                        <p className="font-mono text-xs text-slate-500">{line.itemCode}</p>
                      </td>
                      <td className="p-2 text-xs font-bold text-slate-400">{line.source === "ADDON" ? "Add-on" : "Bundle"}</td>
                      <td className="p-2">
                        <input
                          aria-label={`Quantity for ${line.itemName}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.qty}
                          onChange={(event) => updateLine(line.id, "qty", event.target.value)}
                          className="min-h-10 w-24 rounded-lg border border-slate-700 bg-[#0B1121] px-2 text-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          aria-label={`Rate for ${line.itemName}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.rate}
                          onChange={(event) => updateLine(line.id, "rate", event.target.value)}
                          className="min-h-10 w-28 rounded-lg border border-slate-700 bg-[#0B1121] px-2 text-white"
                        />
                      </td>
                      <td className="p-2 text-right font-mono text-xs font-bold text-slate-300">
                        {line.cost === null ? "—" : money(line.cost, currency)}
                      </td>
                      <td className={`p-2 text-right font-mono text-xs font-bold ${isInsufficientStock ? "text-rose-300" : "text-emerald-300"}`}>
                        <p>{isInsufficientStock ? `${quantity(Math.abs(remainingStock))} short` : `${quantity(remainingStock)} left`}</p>
                        <p className="mt-0.5 text-[10px] font-medium text-slate-500">{quantity(line.stockQty)} available</p>
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-white">{money(line.qty * line.rate, currency)}</td>
                      <td className="p-2 text-right">
                        <button
                          type="button"
                          onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}
                          className="min-h-10 rounded-lg px-2 text-rose-300 hover:bg-rose-500/10"
                          aria-label={`Delete ${line.itemName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-slate-700 bg-[#0B1121] p-4">
              <p className="mb-3 text-sm font-bold text-white">Add a product</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={itemQuery}
                  onChange={(event) => setItemQuery(event.target.value)}
                  placeholder="Search ERPNext Item Master"
                  className="min-h-11 flex-1 rounded-lg border border-slate-700 bg-[#0F172A] px-3 text-white"
                />
                <button
                  type="button"
                  onClick={() => void searchItems()}
                  disabled={busy !== null}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 text-sm font-bold text-white"
                >
                  <Search className="h-4 w-4" />
                  Search items
                </button>
              </div>
              {matches.length > 0 ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {matches.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setLines((current) => [
                          ...current,
                          { id: `${item.id}-${Date.now()}`, itemCode: item.itemCode, itemName: item.itemName, source: "ADDON", qty: 1, rate: item.rate, cost: item.cost, stockQty: item.stockQty },
                        ]);
                        setMatches([]);
                        setItemQuery("");
                        setFeedbackKind("success");
                        setMessage(`${item.itemName} was added to the BOQ.`);
                      }}
                      className="flex items-center justify-between rounded-lg border border-slate-700 p-3 text-left hover:bg-slate-800"
                    >
                      <span>
                        <span className="block font-bold text-white">{item.itemName}</span>
                        <span className="font-mono text-xs text-slate-400">{item.itemCode}</span>
                      </span>
                      <PackagePlus className="h-4 w-4 text-[#B7D1EA]" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="sticky bottom-3 flex flex-col gap-3 rounded-xl bg-[#B7D1EA] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold text-[#2C486A]">Grand total</p>
                <p className="text-2xl font-black text-[#0F172A]">{money(totals, currency)}</p>
              </div>
              <button
                type="button"
                onClick={() => void createQuotation()}
                disabled={busy === "create" || lines.length === 0}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#0F172A] px-5 text-sm font-black text-white shadow-md transition-all hover:bg-slate-900 active:scale-95 disabled:bg-slate-900/80 disabled:text-slate-400 disabled:opacity-75 cursor-pointer disabled:cursor-not-allowed"
              >
                {busy === "create" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <PackagePlus className="h-4 w-4 text-white" />
                )}
                <span className="text-white">
                  {amendedFrom ? "Generate Revised Quotation" : "Create ERP Quotation"}
                </span>
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
