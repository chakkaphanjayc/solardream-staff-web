"use client";

import { useCartStore } from "@/store/useCartStore";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { Check, ShoppingBag, Percent, Gift } from "@/components/ui/icons";
import { isLocale, toIntlLocale } from "@/i18n/locales";
import AskInChatButton from "@/components/chat/AskInChatButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface BundleItem {
  id: string;
  productId: string;
  quantity: number;
  product: {
    id: string;
    brand: string;
    model: string;
    price: number;
    name: string;
  };
}

export interface Bundle {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  isActive: boolean;
  discountType: string;
  discountValue: number;
  promoText: string | null;
  labels: string[];
  validFrom: Date | string | null;
  validUntil: Date | string | null;
  items: BundleItem[];
}

interface ProductBundlesListProps {
  bundles: Bundle[];
}

export default function ProductBundlesList({ bundles }: ProductBundlesListProps) {
  const t = useTranslations("ProductBundlesList");
  const locale = useLocale();
  const intlLocale = toIntlLocale(isLocale(locale) ? locale : "th");
  const currencyFormatter = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  });
  const addItem = useCartStore((state) => state.addItem);

  if (!bundles || bundles.length === 0) return null;

  const handleAddBundleToCart = (bundle: Bundle) => {
    // Add the bundle itself as a cart item
    addItem({
      id: bundle.id,
      name: bundle.name,
      price: bundle.price,
      imageUrl: bundle.imageUrl || "/images/bundle-placeholder.jpg",
      description: bundle.description,
      category: { name: t("cartCategory") },
      isBundle: true,
      bundleItems: bundle.items.map((item) => ({
        productId: item.productId,
        name: item.product?.name || `${item.product?.brand} ${item.product?.model}` || t("fallbackComponent"),
        quantity: item.quantity,
      })),
    });

    toast.success(t("toast.added", { name: bundle.name }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#B7D1EA]/25 text-[#2E6A93]">
          <Gift className="w-5 h-5 stroke-[1.5]" />
        </div>
        <div>
          <h2 className="text-xl font-black uppercase tracking-wider text-slate-800 font-sans">
            {t("header.title")} <span className="text-[#2E6A93]">{t("header.titleAccent")}</span>
          </h2>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-700">
            {t("header.description")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {bundles.map((bundle) => {
          const originalSum = bundle.items.reduce(
            (sum, item) => sum + (item.product?.price || 0) * item.quantity,
            0
          );
          const savedAmount = originalSum - bundle.price;

          return (
            <Card
              key={bundle.id}
              tone="subtle"
              interactive
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-background p-6 lg:p-8"
            >
              {/* Promo Badge */}
              <Badge variant="dark" className="absolute right-6 top-6 z-10 border-0 text-[9px] tracking-widest">
                <Percent className="w-3 h-3 text-[#B7D1EA]" />
                <span>{t("saveAmount", { amount: currencyFormatter.format(Math.round(savedAmount)) })}</span>
              </Badge>

              <div className="space-y-4">
                <div className="space-y-2">
                  {/* Labels List */}
                  {bundle.labels && bundle.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {bundle.labels.map((l) => (
                        <Badge key={l} variant="primary" className="rounded-md px-2 py-0.5 text-[8px] tracking-wider">
                          {l}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <h3 className="text-lg font-black text-slate-850 font-sans group-hover:text-slate-900 transition-colors">
                    {bundle.name}
                  </h3>
                  
                  {bundle.promoText && (
                    <p className="text-xs font-extrabold uppercase tracking-wider text-[#2E6A93]">
                      ✨ {bundle.promoText}
                    </p>
                  )}

                  {bundle.description && (
                    <p className="mt-1 text-xs leading-relaxed text-slate-700">
                      {bundle.description}
                    </p>
                  )}

                  {bundle.validUntil && (
                    <p className="mt-1 font-mono text-[9px] text-slate-700">
                      {t("validUntil", { date: new Date(bundle.validUntil).toLocaleDateString(intlLocale) })}
                    </p>
                  )}
                </div>

                {/* Included items */}
                <div className="space-y-2 bg-white/40 p-4 rounded-2xl">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                    {t("includedTitle")}
                  </p>
                  <ul className="space-y-2.5">
                    {bundle.items.map((item) => (
                      <li key={item.id} className="flex items-start gap-2.5 text-xs text-slate-650">
                        <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#B7D1EA]/30 text-slate-700">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                        <div className="flex-1 flex justify-between gap-2">
                          <span className="font-semibold text-slate-750">
                            {item.product?.name || `${item.product?.brand} ${item.product?.model}`}
                          </span>
                            <span className="shrink-0 font-mono text-slate-700">
                              x{item.quantity}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Pricing & Checkout Area */}
              <div className="mt-6 pt-5 border-t border-slate-200/50 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-700">{t("specialPrice")}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-black text-slate-950 font-mono">
                      {currencyFormatter.format(bundle.price)}
                    </span>
                    <span className="font-mono text-xs text-slate-700 line-through">
                      {currencyFormatter.format(originalSum)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <AskInChatButton
                    variant="icon"
                    tooltip="สอบถามชุดสินค้านี้ (Ask about this)"
                    reference={{
                      type: "BUNDLE",
                      id: bundle.id,
                      title: bundle.name,
                      subtitle: currencyFormatter.format(bundle.price),
                    }}
                    className="rounded-xl"
                  />
                  <Button
                    type="button"
                    onClick={() => handleAddBundleToCart(bundle)}
                    variant="secondary"
                    size="sm"
                    className="rounded-xl bg-slate-900 px-5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    {t("orderBundle")}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
