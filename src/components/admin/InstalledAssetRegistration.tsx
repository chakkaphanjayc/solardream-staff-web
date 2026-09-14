"use client";

import { useMemo, useState, useTransition } from "react";
import { Calendar, CheckCircle2, PackageSearch, Search, ShieldCheck } from "@/components/ui/icons";
import { toast } from "sonner";
import { registerInstalledAsset } from "@/app/actions/afterSales";
import { GsapSpinner } from "@/components/ui/GsapMotion";

type CatalogProduct = {
  id: string;
  name: string;
  brand: string;
  model: string;
};

type InstalledAsset = {
  id: string;
  proposalId: string;
  customerId: string;
  productName: string;
  serialNumber: string;
  installedDate: Date | string;
  warrantyExpiryDate: Date | string;
};

type InstalledAssetRegistrationProps = {
  proposalId: string;
  products: CatalogProduct[];
  initialAssets: InstalledAsset[];
};

function productLabel(product: CatalogProduct) {
  return product.name.trim() || `${product.brand} ${product.model}`.trim();
}

function addYears(dateValue: string, years: number) {
  if (!dateValue || !Number.isFinite(years)) return "";
  const date = new Date(`${dateValue}T12:00:00`);
  date.setFullYear(date.getFullYear() + years);
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function InstalledAssetRegistration({
  proposalId,
  products,
  initialAssets,
}: InstalledAssetRegistrationProps) {
  const [query, setQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [installedDate, setInstalledDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [warrantyYears, setWarrantyYears] = useState("10");
  const [assets, setAssets] = useState(initialAssets);
  const [isPending, startTransition] = useTransition();

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products.slice(0, 8);
    return products
      .filter((product) =>
        [product.name, product.brand, product.model]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, 8);
  }, [products, query]);

  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const expiryPreview = addYears(installedDate, Number(warrantyYears));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await registerInstalledAsset({
        proposalId,
        productId: selectedProductId,
        serialNumber,
        installedDate,
        warrantyYears,
      });

      if (!result.success || !result.asset) {
        toast.error(result.error || "Failed to register installed product.");
        return;
      }

      setAssets((current) => [result.asset, ...current]);
      setSerialNumber("");
      setSelectedProductId("");
      setQuery("");
      toast.success("Installed product registered.");
    });
  };

  return (
    <section className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-5 shadow-none sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-100">
            <ShieldCheck className="h-5 w-5 text-[#2C486A]" />
            Fulfillment &amp; Warranty
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Register installed equipment and activate customer warranty visibility.
          </p>
        </div>
        <span className="w-fit rounded-full bg-[#0B1121] px-3 py-1 text-xs font-bold text-gray-400">
          {assets.length} registered
        </span>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="relative space-y-2 lg:col-span-2">
          <label htmlFor="asset-product-search" className="text-xs font-bold text-gray-300">
            Search from Catalog
          </label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              id="asset-product-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedProductId("");
              }}
              placeholder="Search product name, brand, or model"
              autoComplete="off"
              className="min-h-11 w-full rounded-xl border border-[#1E293B] bg-[#0F172A] py-2.5 pl-10 pr-4 text-sm font-semibold text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/40"
            />
          </div>

          {!selectedProduct && query && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[#1E293B] bg-[#0F172A] p-1 shadow-none">
              {filteredProducts.length ? (
                filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => {
                      setSelectedProductId(product.id);
                      setQuery(productLabel(product));
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[#0B1121] focus:bg-[#0B1121] focus:outline-none"
                  >
                    <PackageSearch className="h-4 w-4 shrink-0 text-gray-500" />
                    <span>
                      <span className="block text-sm font-bold text-gray-100">
                        {productLabel(product)}
                      </span>
                      <span className="block text-xs text-gray-400">
                        {product.brand} · {product.model}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-4 text-sm text-gray-400">No catalog products found.</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="asset-serial-number" className="text-xs font-bold text-gray-300">
            Serial Number
          </label>
          <input
            id="asset-serial-number"
            value={serialNumber}
            onChange={(event) => setSerialNumber(event.target.value)}
            placeholder="e.g. INV-TH-2026-00192"
            className="min-h-11 w-full rounded-xl border border-[#1E293B] px-3.5 py-2.5 text-sm font-semibold text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/40"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="asset-installation-date" className="text-xs font-bold text-gray-300">
            Installation Date
          </label>
          <input
            id="asset-installation-date"
            type="date"
            value={installedDate}
            onChange={(event) => setInstalledDate(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-[#1E293B] px-3.5 py-2.5 text-sm font-semibold text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/40"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="asset-warranty-years" className="text-xs font-bold text-gray-300">
            Warranty Years
          </label>
          <input
            id="asset-warranty-years"
            type="number"
            min="1"
            max="30"
            value={warrantyYears}
            onChange={(event) => setWarrantyYears(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-[#1E293B] px-3.5 py-2.5 text-sm font-semibold text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/40"
          />
        </div>

        <div className="flex min-h-11 items-center gap-3 rounded-xl bg-[#0B1121] px-3.5 py-2.5">
          <Calendar className="h-4 w-4 text-gray-500" />
          <div>
            <p className="text-[11px] font-bold text-gray-400">Warranty Expiry</p>
            <p className="text-sm font-bold text-gray-100">{expiryPreview || "Select valid dates"}</p>
          </div>
        </div>

        <button
          type="submit"
          disabled={
            isPending ||
            !selectedProductId ||
            !serialNumber.trim() ||
            !installedDate ||
            !warrantyYears
          }
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#2C486A] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#203650] focus:outline-none focus:ring-2 focus:ring-[#2C486A]/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 lg:col-span-2"
        >
          {isPending ? (
            <GsapSpinner className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Register Installed Product
        </button>
      </form>

      {assets.length > 0 && (
        <div className="mt-6 border-t border-[#1E293B] pt-5">
          <h3 className="text-sm font-bold text-gray-100">Registered Products</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {assets.map((asset) => (
              <article key={asset.id} className="rounded-xl border border-[#1E293B] bg-[#0B1121] p-4">
                <p className="text-sm font-bold text-gray-100">{asset.productName}</p>
                <p className="mt-1 font-mono text-xs font-semibold text-gray-400">
                  S/N {asset.serialNumber}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-gray-400">Installed</p>
                    <p className="font-bold text-gray-300">
                      {new Date(asset.installedDate).toLocaleDateString("th-TH")}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Warranty expires</p>
                    <p className="font-bold text-gray-300">
                      {new Date(asset.warrantyExpiryDate).toLocaleDateString("th-TH")}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
