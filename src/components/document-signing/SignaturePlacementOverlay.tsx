"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Check, RotateCcw, Signature } from "@/components/ui/icons";

import type { SignaturePlacement } from "@/types/documentSigning";

const SIGNATURE_BOX_WIDTH = 280;
const SIGNATURE_BOX_HEIGHT = 180;
const SIGNATURE_HEADER_HEIGHT = 32;
const SIGNATURE_FOOTER_HEIGHT = 36;

type PageSize = {
  width: number;
  height: number;
};

type SignaturePlacementOverlayProps = {
  pageNumber: number;
  pageSize: PageSize;
  disabled?: boolean;
  onConfirm: (placement: SignaturePlacement) => void | Promise<void>;
};

type Point = {
  x: number;
  y: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function SignaturePlacementOverlay({
  pageNumber,
  pageSize,
  disabled = false,
  onConfirm,
}: SignaturePlacementOverlayProps) {
  const signatureRef = useRef<SignatureCanvas | null>(null);
  const dragOriginRef = useRef<{ pointer: Point; position: Point } | null>(null);
  const [position, setPosition] = useState<Point>({ x: 0.1, y: 0.7 });
  const [hasSignature, setHasSignature] = useState(false);

  const boxWidth = Math.min(SIGNATURE_BOX_WIDTH, Math.max(180, pageSize.width * 0.72));
  const boxHeight = boxWidth * (SIGNATURE_BOX_HEIGHT / SIGNATURE_BOX_WIDTH);
  const maxX = Math.max(0, 1 - boxWidth / pageSize.width);
  const maxY = Math.max(0, 1 - boxHeight / pageSize.height);
  const constrainedPosition = {
    x: clamp(position.x, 0, maxX),
    y: clamp(position.y, 0, maxY),
  };

  function clearSignature(): void {
    signatureRef.current?.clear();
    setHasSignature(false);
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (disabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOriginRef.current = {
      pointer: { x: event.clientX, y: event.clientY },
      position: constrainedPosition,
    };
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    const origin = dragOriginRef.current;
    if (!origin) return;

    setPosition({
      x: clamp(origin.position.x + (event.clientX - origin.pointer.x) / pageSize.width, 0, maxX),
      y: clamp(origin.position.y + (event.clientY - origin.pointer.y) / pageSize.height, 0, maxY),
    });
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (dragOriginRef.current) event.currentTarget.releasePointerCapture(event.pointerId);
    dragOriginRef.current = null;
  }

  async function confirmSignature(): Promise<void> {
    const signature = signatureRef.current;
    if (!signature || signature.isEmpty() || disabled) return;

    await onConfirm({
      signatureBase64: signature.toDataURL("image/png"),
      pageNumber,
      x: constrainedPosition.x,
      y: constrainedPosition.y + SIGNATURE_HEADER_HEIGHT / pageSize.height,
      width: boxWidth / pageSize.width,
      height: (boxHeight - SIGNATURE_HEADER_HEIGHT - SIGNATURE_FOOTER_HEIGHT) / pageSize.height,
    });
  }

  return (
    <section
      aria-label="Signature placement"
      className="absolute z-10 overflow-hidden rounded-xl border border-[#0F172A]/20 bg-[#F5F2EB] shadow-[0_4px_8px_rgba(15,23,42,0.16)]"
      style={{
        left: `${constrainedPosition.x * 100}%`,
        top: `${constrainedPosition.y * 100}%`,
        width: boxWidth,
        height: boxHeight,
      }}
    >
      <div
        aria-label="Drag to position signature"
        className="flex h-8 touch-none cursor-grab items-center gap-2 bg-[#0F172A] px-3 text-[10px] font-bold tracking-[0.08em] text-[#F5F2EB] active:cursor-grabbing"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <Signature className="h-3.5 w-3.5 text-[#B7D1EA]" aria-hidden="true" />
        Drag to position
      </div>
      <SignatureCanvas
        ref={signatureRef}
        penColor="#0F172A"
        minWidth={1.5}
        maxWidth={3.5}
        velocityFilterWeight={0.7}
        onBegin={() => setHasSignature(true)}
        onEnd={() => setHasSignature(!signatureRef.current?.isEmpty())}
        canvasProps={{
          width: SIGNATURE_BOX_WIDTH,
          height: SIGNATURE_BOX_HEIGHT - SIGNATURE_HEADER_HEIGHT - SIGNATURE_FOOTER_HEIGHT,
          "aria-label": "Draw your signature",
          className: "block touch-none bg-white",
          style: {
            width: boxWidth,
            height: boxHeight - SIGNATURE_HEADER_HEIGHT - SIGNATURE_FOOTER_HEIGHT,
          },
        }}
      />
      <div className="flex h-9 items-center justify-between border-t border-slate-200 bg-[#F5F2EB] px-2">
        <button
          type="button"
          onClick={clearSignature}
          disabled={disabled || !hasSignature}
          className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-[10px] font-bold text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Clear
        </button>
        <button
          type="button"
          onClick={() => void confirmSignature()}
          disabled={disabled || !hasSignature}
          className="inline-flex min-h-8 items-center gap-1 rounded-full bg-[#B7D1EA] px-3 text-[10px] font-bold text-[#0F172A] transition hover:bg-[#a5c2de] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Check className="h-3 w-3" aria-hidden="true" />
          Confirm
        </button>
      </div>
    </section>
  );
}
