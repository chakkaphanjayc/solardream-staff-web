"use client";

import { useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { X } from "@/components/ui/icons";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { trackProductEvent } from "@/lib/productAnalytics";
import { cn } from "@/lib/utils";
import TrackRequestFlow, {
  type TrackRequestSurface,
} from "./TrackRequestFlow";

type TrackRequestModalProps = Readonly<{
  trigger: ReactNode;
  surface?: Exclude<TrackRequestSurface, "page">;
  className?: string;
}>;

/**
 * Compatibility wrapper for embedded entry points.
 *
 * The canonical tracking experience lives on /track. Existing home and
 * services CTAs can still open this wrapper without maintaining a second
 * request/progress implementation.
 */
export default function TrackRequestModal({
  trigger,
  surface = "home",
  className,
}: TrackRequestModalProps) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [flowKey, setFlowKey] = useState(0);
  const isThai = locale !== "en";
  const closeLabel = isThai ? "ปิดหน้าต่างติดตาม" : "Close tracking dialog";

  const openModal = () => {
    setOpen(true);
    void trackProductEvent("support_started", {
      surface,
      entry_point: "tracking_modal",
    });
  };

  const closeModal = () => {
    setOpen(false);
    setFlowKey((value) => value + 1);
  };

  return (
    <>
      <span className={className} onClick={openModal}>
        {trigger}
      </span>
      <Dialog
        isOpen={open}
        onClose={closeModal}
        size="sm"
        tone="light"
        ariaLabel={isThai ? "ติดตามคำขอของคุณ" : "Track your request"}
        closeLabel={closeLabel}
        dismissible
        className={cn(
          "overflow-hidden rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] text-[#2E2C27] shadow-2xl backdrop-blur-2xl",
          surface === "services" && "max-w-lg",
        )}
      >
        <DialogContent>
          <DialogBody className="relative p-0 text-[#2E2C27] sm:p-0">
            <button
              type="button"
              onClick={closeModal}
              aria-label={closeLabel}
              className="absolute right-3.5 top-3.5 z-10 grid size-10 place-items-center rounded-full border border-[#CBC7BE] bg-[#F0EEE9]/85 text-[#4E4B44] shadow-sm transition-[background-color,transform] duration-200 hover:bg-[#E6E3DC] hover:text-[#2E2C27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] active:scale-95"
            >
              <X aria-hidden="true" className="size-5 stroke-[2.5]" />
            </button>
            <TrackRequestFlow
              key={flowKey}
              surface={surface}
              presentation="dialog"
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
