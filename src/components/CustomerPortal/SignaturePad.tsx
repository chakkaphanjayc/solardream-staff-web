"use client";

import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { CheckCircle2, RotateCcw } from "@/components/ui/icons";
import { useTranslations } from "next-intl";

type SignaturePadProps = {
  onConfirm: (signatureDataUrl: string) => void | Promise<void>;
  disabled?: boolean;
  isSubmitting?: boolean;
};

const SIGNATURE_CANVAS_HEIGHT = 176;

export default function SignaturePad({ onConfirm, disabled = false, isSubmitting = false }: SignaturePadProps) {
  const t = useTranslations("SignaturePad");
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasWidthRef = useRef(320);
  const signaturePadRef = useRef<SignatureCanvas | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(320);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = Math.max(1, Math.floor((entry?.contentRect.width ?? 320) - 16));
      if (canvasWidthRef.current === nextWidth) return;
      canvasWidthRef.current = nextWidth;
      signaturePadRef.current?.clear();
      setHasSignature(false);
      setCanvasWidth(nextWidth);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const clearSignature = () => {
    signaturePadRef.current?.clear();
    setHasSignature(false);
  };

  const confirmSignature = async () => {
    const signaturePad = signaturePadRef.current;
    if (!signaturePad || signaturePad.isEmpty()) return;
    await onConfirm(signaturePad.toDataURL("image/png"));
  };

  return (
    <div className="space-y-3">
      <div ref={canvasContainerRef} className="overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2">
        <SignatureCanvas
          ref={signaturePadRef}
          penColor="#0F172A"
          minWidth={2}
          maxWidth={4.5}
          velocityFilterWeight={0.7}
          onBegin={() => setHasSignature(true)}
          onEnd={() => setHasSignature(!signaturePadRef.current?.isEmpty())}
          canvasProps={{
            width: canvasWidth,
            height: SIGNATURE_CANVAS_HEIGHT,
            className: "block h-44 w-full touch-none rounded-lg bg-white",
            "aria-label": t("drawingArea"),
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={clearSignature}
          disabled={disabled || !hasSignature}
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <RotateCcw className="h-4 w-4" />
          {t("clear")}
        </button>
        <button
          type="button"
          onClick={() => void confirmSignature()}
          disabled={disabled || !hasSignature}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0F172A] px-5 text-xs font-black text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4 text-[#B7D1EA]" />
          {isSubmitting ? t("signing") : t("confirm")}
        </button>
      </div>
    </div>
  );
}
