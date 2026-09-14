"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Maximize,
  Minimize2,
  RotateCcw,
  Trash2,
} from "@/components/ui/icons";

type Point = {
  x: number;
  y: number;
};

type Stroke = Point[];

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (
    orientation:
      | "any"
      | "natural"
      | "landscape"
      | "portrait"
      | "portrait-primary"
      | "portrait-secondary"
      | "landscape-primary"
      | "landscape-secondary",
  ) => Promise<void>;
  unlock?: () => void;
};

interface DigitalSignaturePadProps {
  onSign: (base64Png: string) => void;
  onClear?: () => void;
  label?: string;
  placeholder?: string;
  clearLabel?: string;
  required?: boolean;
}

const STROKE_COLOR = "#0F172A";
const STROKE_WIDTH = 3;

const FULLSCREEN_SAFE_AREA_STYLE: CSSProperties = {
  paddingTop: "max(0.75rem, env(safe-area-inset-top))",
  paddingRight: "max(0.75rem, env(safe-area-inset-right))",
  paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
  paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
};

export default function DigitalSignaturePad({
  onSign,
  onClear,
  label,
  placeholder,
  clearLabel,
  required = false,
}: DigitalSignaturePadProps) {
  const t = useTranslations("DigitalSignaturePad");
  const reactId = useId();
  const labelId = `signature-label-${reactId}`;
  const descriptionId = `signature-description-${reactId}`;
  const resolvedLabel = label ?? t("defaultLabel");
  const resolvedPlaceholder = placeholder ?? t("signInside");
  const resolvedClearLabel = clearLabel ?? t("actions.clear");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const isDrawingRef = useRef(false);
  const ownsFullscreenRef = useRef(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * devicePixelRatio);
    canvas.height = Math.round(rect.height * devicePixelRatio);
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    context.strokeStyle = STROKE_COLOR;
    context.lineWidth = STROKE_WIDTH;
    context.lineCap = "round";
    context.lineJoin = "round";

    const drawStroke = (stroke: Stroke) => {
      if (stroke.length === 0) return;

      context.beginPath();
      stroke.forEach((point, index) => {
        const x = point.x * rect.width;
        const y = point.y * rect.height;
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });
      context.stroke();
    };

    strokesRef.current.forEach(drawStroke);
    if (activeStrokeRef.current) {
      drawStroke(activeStrokeRef.current);
    }
  }, []);

  useEffect(() => {
    const observedFrame = frameRef.current;
    if (!observedFrame) return;

    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = new ResizeObserver(redrawCanvas);
    resizeObserverRef.current.observe(observedFrame);

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, [isExpanded, redrawCanvas]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  useEffect(() => {
    if (!isExpanded) return;

    let cancelled = false;
    const orientation = window.screen?.orientation as LockableScreenOrientation | undefined;

    const enterImmersiveMode = async () => {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          if (!cancelled) ownsFullscreenRef.current = true;
        }
        await orientation?.lock?.("landscape");
      } catch (error) {
        console.warn("Fullscreen signature mode is not supported on this device:", error);
      }
    };

    const handleFullscreenChange = () => {
      if (ownsFullscreenRef.current && !document.fullscreenElement) {
        ownsFullscreenRef.current = false;
        setIsExpanded(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    void enterImmersiveMode();

    return () => {
      cancelled = true;
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      try {
        orientation?.unlock?.();
      } catch {}

      if (ownsFullscreenRef.current && document.fullscreenElement && document.exitFullscreen) {
        ownsFullscreenRef.current = false;
        void document.exitFullscreen().catch(() => {});
      }
    };
  }, [isExpanded]);

  const getPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }, []);

  const exportSignature = useCallback(() => {
    const canvas = canvasRef.current;
    return canvas?.toDataURL("image/png") ?? "";
  }, []);

  const beginStroke = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.preventDefault();

      const point = getPoint(event);
      const canvas = canvasRef.current;
      if (!point || !canvas) return;

      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.setPointerCapture?.(event.pointerId);
      isDrawingRef.current = true;
      setHasSigned(true);

      const nextStroke: Stroke = [point];
      activeStrokeRef.current = nextStroke;
      redrawCanvas();

      const rect = canvas.getBoundingClientRect();
      context.beginPath();
      context.moveTo(point.x * rect.width, point.y * rect.height);
    },
    [getPoint, redrawCanvas],
  );

  const continueStroke = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      event.preventDefault();

      const point = getPoint(event);
      const canvas = canvasRef.current;
      const activeStroke = activeStrokeRef.current;
      if (!point || !canvas || !activeStroke) return;

      const context = canvas.getContext("2d");
      if (!context) return;

      const rect = canvas.getBoundingClientRect();
      const previousPoint = activeStroke[activeStroke.length - 1];
      activeStroke.push(point);

      context.beginPath();
      context.moveTo(previousPoint.x * rect.width, previousPoint.y * rect.height);
      context.lineTo(point.x * rect.width, point.y * rect.height);
      context.strokeStyle = STROKE_COLOR;
      context.lineWidth = STROKE_WIDTH;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();
    },
    [getPoint],
  );

  const endStroke = useCallback(
    (event?: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      event?.preventDefault();
      isDrawingRef.current = false;

      const canvas = canvasRef.current;
      const stroke = activeStrokeRef.current;
      if (canvas && stroke && stroke.length > 0) {
        strokesRef.current = [...strokesRef.current, stroke];
        onSign(exportSignature());
      }

      activeStrokeRef.current = null;
      if (
        canvas
        && event?.pointerId !== undefined
        && canvas.hasPointerCapture?.(event.pointerId)
      ) {
        canvas.releasePointerCapture(event.pointerId);
      }
    },
    [exportSignature, onSign],
  );

  const clear = useCallback(() => {
    strokesRef.current = [];
    activeStrokeRef.current = null;
    isDrawingRef.current = false;
    setHasSigned(false);
    onSign("");
    onClear?.();
    redrawCanvas();
  }, [onClear, onSign, redrawCanvas]);

  const canvas = (
    <>
      <canvas
        ref={canvasRef}
        onPointerDown={beginStroke}
        onPointerMove={continueStroke}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
        tabIndex={0}
        className="h-full w-full touch-none cursor-crosshair bg-white outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={t("canvasAriaLabel")}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
      />
      {!hasSigned ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-4">
          <p className="text-center text-sm font-medium text-slate-500">
            {resolvedPlaceholder}
          </p>
        </div>
      ) : null}
    </>
  );

  return (
    <div className="space-y-2">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <p id={labelId} className="text-sm font-semibold text-foreground">
          {resolvedLabel}
          {required ? <span className="ml-1 text-rose-600" aria-hidden="true">*</span> : null}
        </p>
        {hasSigned ? <Badge variant="success">{t("signed")}</Badge> : null}
      </div>

      {!isExpanded ? (
        <div
          ref={frameRef}
          className="relative h-[180px] overflow-hidden rounded-xl border border-input bg-white"
        >
          <div className="absolute right-3 top-3 flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => setIsExpanded(true)}
              aria-label={t("expandAriaLabel")}
              className="bg-white"
            >
              <Maximize aria-hidden="true" />
            </Button>
          </div>

          {canvas}

          <div className="absolute bottom-3 right-3">
            <Button type="button" variant="outline" onClick={clear} className="bg-white">
              <Trash2 aria-hidden="true" />
              {resolvedClearLabel}
            </Button>
          </div>
        </div>
      ) : null}

      <p id={descriptionId} className="text-xs leading-5 text-muted-foreground">
        {resolvedPlaceholder}
      </p>

      <Dialog
        isOpen={isExpanded}
        onClose={() => setIsExpanded(false)}
        size="full"
        tone="light"
        ariaLabel={resolvedLabel}
        closeLabel={t("actions.closeDone")}
        className="h-dvh max-h-none w-screen max-w-none rounded-none border-0 bg-white"
      >
        <DialogContent className="relative bg-white">
          <div className="flex min-h-0 flex-1 flex-col" style={FULLSCREEN_SAFE_AREA_STYLE}>
            <DialogHeader showClose={false} className="border-b border-border px-2 py-2 sm:px-3 sm:py-3">
              <div className="flex w-full items-center justify-between gap-3">
                <div className="min-w-0">
                  <DialogTitle className="truncate text-base">{resolvedLabel}</DialogTitle>
                  <DialogDescription className="mt-0 text-xs">
                    {t("landscapeMode")}
                  </DialogDescription>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clear}
                    aria-label={resolvedClearLabel}
                  >
                    <Trash2 aria-hidden="true" />
                    <span className="hidden sm:inline">{resolvedClearLabel}</span>
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    aria-label={t("actions.closeDone")}
                  >
                    <Minimize2 aria-hidden="true" />
                    <span className="hidden sm:inline">{t("actions.closeDone")}</span>
                  </Button>
                </div>
              </div>
            </DialogHeader>

            <div ref={frameRef} className="relative min-h-0 flex-1 overflow-hidden bg-white">
              {canvas}
            </div>
          </div>

          <div
            className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 p-6 text-center text-white landscape:hidden"
            style={FULLSCREEN_SAFE_AREA_STYLE}
          >
            <RotateCcw className="h-12 w-12 text-[#A5C2DE]" aria-hidden="true" />
            <h3 className="mt-4 max-w-md text-balance text-lg font-bold text-white">
              {t("rotate.title")}
            </h3>
            <p className="mt-2 max-w-md text-pretty text-sm leading-6 text-slate-300">
              {t("rotate.description")}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsExpanded(false)}
              className="mt-6"
            >
              {t("actions.cancel")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
