"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import CartLeadCaptureModal from "@/components/CartLeadCaptureModal";
import ProgressiveImage from "@/components/ui/progressive-image";
import {
  AlertTriangle,
  FileText,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
} from "@/components/ui/icons";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/useCartStore";
import { useCurrencyStore } from "@/store/useCurrencyStore";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

type AvailabilityStatus = Record<string, "ACTIVE" | "ARCHIVED">;

interface CartAvailabilityResponse {
  success: boolean;
  products?: Array<{ id: string; status: "ACTIVE" | "ARCHIVED" }>;
  missingIds?: string[];
}

export default function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const t = useTranslations("CartDrawer");
  const activeCurrency = useCurrencyStore((state) => state.currency);
  const { items, updateQuantity, removeItem, getTotalPrice } = useCartStore();
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] =
    useState<AvailabilityStatus>({});
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const cartIds = useMemo(() => items.map((item) => item.product.id), [items]);
  const staleIds = useMemo(
    () =>
      items
        .filter(
          (item) =>
            missingIds.includes(item.product.id) ||
            availabilityStatus[item.product.id] === "ARCHIVED",
        )
        .map((item) => item.product.id),
    [availabilityStatus, items, missingIds],
  );
  const hasStaleItems = staleIds.length > 0;
  const total = getTotalPrice();
  void activeCurrency;

  useEffect(() => {
    if (!isOpen || cartIds.length === 0) return;

    const controller = new AbortController();

    const checkAvailability = async () => {
      try {
        const response = await fetch("/api/catalog/cart-availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: cartIds }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to verify cart items");
        }

        const data: CartAvailabilityResponse = await response.json();
        if (!data.success) {
          throw new Error("Unable to verify cart items");
        }

        const nextStatus = Object.fromEntries(
          (data.products ?? []).map((product) => [
            product.id,
            product.status,
          ]),
        ) as AvailabilityStatus;

        setAvailabilityStatus(nextStatus);
        setMissingIds(data.missingIds ?? []);
      } catch (error) {
        if (!controller.signal.aborted) console.error(error);
      }
    };

    void checkAvailability();
    return () => controller.abort();
  }, [cartIds, isOpen]);

  const handleRemoveUnavailable = () => {
    staleIds.forEach((productId) => removeItem(productId));
    if (staleIds.length > 0) {
      toast.success(t("toast.removedUnavailable"));
    }
  };

  return (
    <>
      <Sheet
        isOpen={isOpen}
        onClose={onClose}
        tone="light"
        ariaLabel={t("header.title")}
      >
        <SheetContent className="bg-[#F0EEE9] text-[#1C1C1A]">
          <SheetHeader className="sd-safe-pt-cart-header border-b border-[#8E8B83]/15 bg-[#F0EEE9] px-4 pb-4 sm:px-6 sm:pb-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#DCE8F5] text-[#4F7FA8]">
                <ShoppingCart className="size-5" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-base font-bold text-[#1C1C1A]">
                  {t("header.title")}
                </SheetTitle>
                <SheetDescription className="mt-0.5 text-xs font-medium text-[#4E4B44]">
                  {t("header.selectedCount", { count: items.length })}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <SheetBody className="space-y-4 overscroll-contain bg-[#F0EEE9] px-4 py-5 sm:px-6">
            {items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center space-y-3 py-16 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-[#DCE8F5] text-[#4F7FA8]">
                  <ShoppingCart className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#1C1C1A]">
                    {t("empty.title")}
                  </p>
                  <p className="mt-1 text-xs font-medium leading-5 text-[#4E4B44]">
                    {t("empty.description")}
                  </p>
                </div>
              </div>
            ) : (
              <>
                {hasStaleItems ? (
                  <div className="space-y-3 rounded-[20px] border border-amber-300 bg-amber-50 p-4 shadow-xs">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900">
                        <AlertTriangle className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-amber-950">
                          {t("unavailable.title")}
                        </p>
                        <p className="mt-0.5 text-xs font-medium leading-5 text-amber-900/80">
                          {t("unavailable.description")}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveUnavailable}
                      className="inline-flex min-h-9 items-center gap-2 rounded-full border border-amber-300 bg-[#F0EEE9] px-3.5 py-1.5 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100/60 active:scale-95"
                    >
                      <Trash2 className="size-3.5" />
                      {t("unavailable.deleteAction")}
                    </button>
                  </div>
                ) : null}

                {items.map((item) => {
                  const productStatus = availabilityStatus[item.product.id];
                  const isMissing = missingIds.includes(item.product.id);
                  const isArchived = productStatus === "ARCHIVED";
                  const isUnavailable = isMissing || isArchived;

                  return (
                    <div
                      key={item.product.id}
                      className="flex items-start gap-3 rounded-[24px] border border-[#8E8B83]/15 bg-[#E6E3DC] p-3.5 shadow-xs transition-all hover:shadow-md sm:gap-4 sm:p-4"
                    >
                      {item.product.imageUrl?.trim() ? (
                        <div className="relative size-16 shrink-0 overflow-hidden rounded-[16px] border border-[#8E8B83]/15 bg-[#F0EEE9]">
                          <ProgressiveImage
                            src={item.product.imageUrl}
                            alt={item.product.name}
                            fill
                            sizes="64px"
                            className="object-contain p-1.5"
                          />
                        </div>
                      ) : (
                        <div className="flex size-16 shrink-0 items-center justify-center rounded-[16px] bg-[#DCE8F5]/40 px-1 text-center text-[10px] font-bold text-[#4E4B44]">
                          {t("item.noImage")}
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#4F7FA8]">
                            {item.product.category?.name ||
                              t("item.defaultCategory")}
                          </p>
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="truncate text-xs font-bold text-[#1C1C1A]">
                              {item.product.name}
                            </h4>
                            {isUnavailable ? (
                              <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-bold text-rose-700">
                                {isArchived
                                  ? t("item.archived")
                                  : t("item.deleted")}
                              </span>
                            ) : null}
                          </div>
                          {item.product.erpnextItemCode ? (
                            <p className="font-mono text-[10px] text-[#4E4B44]">
                              SKU: {item.product.erpnextItemCode}
                            </p>
                          ) : null}
                          {item.product.isBundle &&
                          item.product.bundleItems ? (
                            <div className="mt-2 space-y-1 rounded-xl border border-[#8E8B83]/10 bg-[#F0EEE9] p-2.5 text-[10px] text-[#4E4B44]">
                              <p className="border-b border-[#8E8B83]/10 pb-1 text-[9px] font-bold uppercase tracking-wider text-[#4F7FA8]">
                                {t("item.setIncludes")}
                              </p>
                              {item.product.bundleItems.map((bundleItem) => (
                                <div
                                  key={bundleItem.productId}
                                  className="flex justify-between gap-2"
                                >
                                  <span className="truncate text-[#1C1C1A]">
                                    {bundleItem.name}
                                  </span>
                                  <span className="shrink-0 font-mono font-bold text-[#4F7FA8]">
                                    x{bundleItem.quantity}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-1">
                          <div className="space-y-0.5">
                            <p className="font-mono text-xs font-bold text-[#1C1C1A]">
                              {formatPrice(item.product.price)}
                            </p>
                            {isUnavailable ? (
                              <p className="text-[10px] font-medium text-rose-600">
                                {t("item.removeUnavailableHint")}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1 rounded-full border border-[#8E8B83]/20 bg-[#F7F6F3] p-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(
                                  item.product.id,
                                  item.quantity - 1,
                                )
                              }
                              data-analytics-event="cart_updated"
                              data-analytics-change-type="decrease"
                              className="flex size-7 items-center justify-center rounded-full bg-[#F0EEE9] text-[#1C1C1A] shadow-xs transition-colors hover:bg-[#A5C2DE]/10 hover:text-[#3E6685] active:scale-95"
                              aria-label={t(
                                "item.decreaseQuantityAriaLabel",
                              )}
                            >
                              <Minus className="size-3" />
                            </button>
                            <span className="w-6 text-center font-mono text-xs font-bold text-[#1C1C1A]">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(
                                  item.product.id,
                                  item.quantity + 1,
                                )
                              }
                              data-analytics-event="cart_updated"
                              data-analytics-change-type="increase"
                              className="flex size-7 items-center justify-center rounded-full bg-[#F0EEE9] text-[#1C1C1A] shadow-xs transition-colors hover:bg-[#A5C2DE]/10 hover:text-[#3E6685] active:scale-95"
                              aria-label={t(
                                "item.increaseQuantityAriaLabel",
                              )}
                            >
                              <Plus className="size-3" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(item.product.id)}
                        data-analytics-event="cart_updated"
                        data-analytics-change-type="remove"
                        className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#4E4B44] transition-colors hover:bg-rose-50 hover:text-rose-600 active:scale-95"
                        aria-label={t("item.removeAriaLabel")}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </SheetBody>

          {items.length > 0 ? (
            <SheetFooter className="sd-safe-pb-cart-footer block space-y-4 border-t border-[#8E8B83]/15 bg-[#E6E3DC] px-4 pt-4 sm:px-6 sm:pt-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#4E4B44]">
                    {t("footer.total")}
                  </p>
                  <p className="text-[10px] font-medium text-[#4E4B44]">
                    {t("footer.estimated")}
                  </p>
                </div>
                <p className="font-mono text-xl font-bold text-[#1C1C1A]">
                  {formatPrice(total)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsLeadModalOpen(true)}
                data-analytics-event="checkout_started"
                data-analytics-checkout-type="cart_drawer"
                data-analytics-item-count={items.length}
                className="group flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-5 py-3 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:bg-[#A5C2DE]/90 hover:shadow-md active:scale-95"
              >
                <FileText className="size-4" />
                <span>{t("footer.requestQuote")}</span>
              </button>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>

      <CartLeadCaptureModal
        isOpen={isOpen && isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        items={items}
        totalPrice={total}
      />
    </>
  );
}
