"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import ProgressiveImage from "@/components/ui/progressive-image";
import { generatePublicProductName } from "@/lib/productUtils";
import type { RecommendProduct } from "@/lib/wizardRecommendation";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const excludedKeys = new Set(["id", "price", "imageurl", "image_url", "description", "createdat", "updatedat", "isactive", "isavailable", "categoryid", "physicalwidth", "physicallength", "wattagecapacity", "stock"]);
const formatSpecKey = (key: string) => key.split(/[_\-\s]+/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

export default function ProductDetailModal({ product, onClose }: { product: RecommendProduct; onClose: () => void }) {
  const t = useTranslations("WizardSummary");
  const locale = useLocale();
  const price = new Intl.NumberFormat(locale === "en" ? "en-US" : "th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(product.price);
  const specifications = Object.entries(product.metadata ?? {}).filter(([key, value]) => !excludedKeys.has(key.toLowerCase()) && value !== null && value !== undefined && String(value).trim() !== "");
  const productName = generatePublicProductName(product);

  return (
    <Dialog
      isOpen
      onClose={onClose}
      size="md"
      tone="light"
      ariaLabel={productName}
      closeLabel={t("modal.closeAria")}
      className="bg-white"
    >
      <DialogContent>
        <DialogHeader className="border-b-2 border-black bg-[#F0EEE9]">
          <DialogTitle className="pr-2 text-xl">{productName}</DialogTitle>
          <DialogDescription>
            {(product.erpnextItemCode || product.id) ? `SKU: ${product.erpnextItemCode || product.id} · ` : ""}
            <span className="font-bold text-[#0F172A]">{price}</span>
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6 bg-white">
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border-2 border-black bg-[#F0EEE9]">
            <ProgressiveImage
              src={product.imageUrl?.trim() || "/images/placeholder.png"}
              alt={product.name}
              fill
              sizes="(min-width: 640px) 32rem, calc(100vw - 4rem)"
              className="object-cover"
            />
          </div>

          {product.description ? (
            <p className="text-sm leading-6 text-slate-600">{product.description}</p>
          ) : null}

          {specifications.length > 0 ? (
            <section aria-labelledby="product-specifications-title">
              <h4 id="product-specifications-title" className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-slate-600">
                {t("modal.technicalSpecs")}
              </h4>
              <dl className="divide-y divide-slate-200 border-y border-slate-200">
                {specifications.map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4 py-3 text-sm">
                    <dt className="break-words text-slate-500">{formatSpecKey(key)}</dt>
                    <dd className="break-words text-right font-semibold text-slate-800">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <Button asChild size="lg" className="wizard-ui-primary min-h-11 w-full">
            <Link href={`/${locale}/catalog/${product.id}`}>{t("modal.viewCatalog")}</Link>
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
