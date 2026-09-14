"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Images,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "@/types/portfolio";

type VisxImageLightboxProps = Readonly<{
  images: readonly GalleryItem[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}>;

export default function VisxImageLightbox({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  title,
}: VisxImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imageErrorUrl, setImageErrorUrl] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const resetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
  }, []);

  // Sync initial index when opened
  useEffect(() => {
    if (!isOpen) return;

    const nextIndex = Math.max(0, Math.min(initialIndex, images.length - 1));
    const animationFrame = window.requestAnimationFrame(() => {
      setCurrentIndex(nextIndex);
      resetZoom();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isOpen, initialIndex, images.length, resetZoom]);

  // Reset transform whenever active image index changes
  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(resetZoom);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [currentIndex, resetZoom]);

  const currentImage = images[currentIndex];
  const imageError = currentImage?.url === imageErrorUrl;

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Put keyboard focus inside the lightbox and return it to the opener on close.
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const animationFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (previouslyFocusedRef.current?.isConnected) {
        previouslyFocusedRef.current.focus();
      }
      previouslyFocusedRef.current = null;
    };
  }, [isOpen]);

  const handlePrev = useCallback(() => {
    if (images.length < 2) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    if (images.length < 2) return;
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlePrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNext();
      } else if (event.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const focusableElements = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;

        if (event.shiftKey && activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleNext, handlePrev, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const activeThumbnail = thumbnailRefs.current[currentIndex];
    if (!activeThumbnail) return;

    activeThumbnail.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [currentIndex, isOpen]);

  // Clamp position within bounds based on exact rendered image dimensions
  const clampPosition = useCallback((newX: number, newY: number, targetScale: number) => {
    if (targetScale <= 1 || !imgRef.current) {
      return { x: 0, y: 0 };
    }
    const img = imgRef.current;
    const rect = img.getBoundingClientRect();
    const currentScale = scale > 0 ? scale : 1;
    const baseWidth = rect.width / currentScale;
    const baseHeight = rect.height / currentScale;

    const maxPanX = Math.max(0, (baseWidth * (targetScale - 1)) / 2);
    const maxPanY = Math.max(0, (baseHeight * (targetScale - 1)) / 2);

    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, newX)),
      y: Math.max(-maxPanY, Math.min(maxPanY, newY)),
    };
  }, [scale]);

  // Attach non-passive wheel event listener for smooth cursor-anchored zooming
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isOpen) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.25 : 0.8;

      setScale((prevScale) => {
        const nextScale = Math.max(1, Math.min(5, Math.round(prevScale * zoomFactor * 100) / 100));
        if (nextScale === 1) {
          setPosition({ x: 0, y: 0 });
          return 1;
        }

        // Calculate cursor offset relative to container center
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - (rect.left + rect.width / 2);
        const mouseY = e.clientY - (rect.top + rect.height / 2);

        const ratio = nextScale / prevScale;
        setPosition((prevPos) => {
          const targetX = mouseX - (mouseX - prevPos.x) * ratio;
          const targetY = mouseY - (mouseY - prevPos.y) * ratio;
          return clampPosition(targetX, targetY, nextScale);
        });

        return nextScale;
      });
    };

    container.addEventListener("wheel", handleWheelNative, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheelNative);
    };
  }, [isOpen, clampPosition]);

  const handleZoomIn = () => {
    setScale((prev) => {
      const next = Math.min(5, Math.round((prev + 0.5) * 10) / 10);
      setPosition((p) => clampPosition(p.x, p.y, next));
      return next;
    });
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(1, Math.round((prev - 0.5) * 10) / 10);
      if (next === 1) {
        setPosition({ x: 0, y: 0 });
      } else {
        setPosition((p) => clampPosition(p.x, p.y, next));
      }
      return next;
    });
  };

  const handleDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (scale > 1) {
      resetZoom();
    } else {
      const container = containerRef.current;
      const nextScale = 2.5;
      if (container) {
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - (rect.left + rect.width / 2);
        const mouseY = e.clientY - (rect.top + rect.height / 2);

        const ratio = nextScale / 1;
        const targetX = mouseX - mouseX * ratio;
        const targetY = mouseY - mouseY * ratio;
        setScale(nextScale);
        setPosition(clampPosition(targetX, targetY, nextScale));
      } else {
        setScale(nextScale);
      }
    }
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging || scale <= 1) return;
    e.preventDefault();
    const rawX = e.clientX - dragStartRef.current.x;
    const rawY = e.clientY - dragStartRef.current.y;
    setPosition(clampPosition(rawX, rawY, scale));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (scale <= 1) {
      setPosition({ x: 0, y: 0 });
    }
  };

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      if (scale > 1) {
        setIsDragging(true);
        dragStartRef.current = {
          x: e.touches[0].clientX - position.x,
          y: e.touches[0].clientY - position.y,
        };
      } else {
        touchStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          time: e.timeStamp,
        };
      }
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (isDragging && scale > 1 && e.touches.length === 1) {
      const rawX = e.touches[0].clientX - dragStartRef.current.x;
      const rawY = e.touches[0].clientY - dragStartRef.current.y;
      setPosition(clampPosition(rawX, rawY, scale));
    }
  };

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    setIsDragging(false);
    if (scale <= 1 && touchStartRef.current) {
      const touchEnd = e.changedTouches[0];
      if (!touchEnd) {
        touchStartRef.current = null;
        return;
      }
      const deltaX = touchEnd.clientX - touchStartRef.current.x;
      const deltaY = touchEnd.clientY - touchStartRef.current.y;
      const deltaTime = e.timeStamp - touchStartRef.current.time;

      if (deltaTime < 400 && Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        if (deltaX > 0) {
          handlePrev();
        } else {
          handleNext();
        }
      }
      touchStartRef.current = null;
    }
  };

  if (!isOpen || !currentImage) return null;

  const currentScalePercent = Math.round(scale * 100);
  const isZoomedIn = scale > 1.05;

  return (
    <AnimatePresence>
      <motion.div
        ref={dialogRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: [0.19, 1, 0.22, 1] }}
        className="fixed inset-0 z-[3000] flex min-h-0 flex-col select-none bg-[#000000]/95 backdrop-blur-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-lightbox-title"
        tabIndex={-1}
      >
        {/* Top Control Header Bar */}
        <header className="sd-safe-pt-3-add relative z-30 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#2E2C27]/95 px-3 pb-3 text-white backdrop-blur-xl sm:gap-3 sm:px-6 sm:py-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#CBC7BE] bg-[#DCE8F5] text-[#2E2C27] sm:h-10 sm:w-10">
              <Images className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="image-lightbox-title" className="truncate text-sm font-bold text-white sm:text-base">
                {currentImage.caption || title || "Project Gallery"}
              </h2>
              <div className="truncate text-[11px] font-medium text-[#CBC7BE] sm:text-xs">
                {title ? `${title} · ` : ""}Photo {currentIndex + 1} of {images.length}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden rounded-full border border-[#A5C2DE]/30 bg-[#381E72] px-3 py-1 font-mono text-xs font-semibold text-[#A5C2DE] sm:inline-flex">
              {currentIndex + 1} / {images.length}
            </span>

            <button
              type="button"
              ref={closeButtonRef}
              onClick={onClose}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-all duration-200 hover:bg-white/20 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#B7D1EA]"
              aria-label="Close image viewer"
            >
              <X className="h-5 w-5 stroke-[2.5]" />
            </button>
          </div>
        </header>

        {/* Main Centered Zoom & Pan Canvas Area */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
          <div
            ref={containerRef}
            className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden p-2 touch-none select-none sm:p-6"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {imageError ? (
              <div className="flex h-full w-full max-w-2xl flex-col items-center justify-center gap-3 rounded-[24px] border border-[#CBC7BE] bg-[#2E2C27] p-6 text-center text-white shadow-xl">
                <Images className="h-10 w-10 text-[#A5C2DE]" aria-hidden="true" />
                <p className="text-sm font-bold">ไม่สามารถโหลดรูปนี้ได้</p>
                <p className="text-xs font-medium text-[#CBC7BE]">ลองเลือกภาพอื่นจากแถบด้านล่าง</p>
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                ref={imgRef}
                src={currentImage.url}
                alt={currentImage.caption || title || "Project image"}
                style={{
                  transform: `translate3d(${position.x}px, ${position.y}px, 0px) scale(${scale})`,
                  transformOrigin: "center center",
                  transition: isDragging ? "none" : "transform 0.2s cubic-bezier(0.19, 1, 0.22, 1)",
                }}
                className={cn(
                  "pointer-events-auto block max-h-full max-w-full rounded-2xl border border-white/20 bg-black object-contain shadow-2xl select-none",
                  scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
                )}
                onError={() => setImageErrorUrl(currentImage.url)}
                loading="eager"
                decoding="async"
              />
            )}
          </div>

          {/* Left / Right Floating Navigation Arrows */}
          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrev();
                }}
                className="absolute left-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-[#2E2C27]/80 text-white shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-[#A5C2DE] active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#B7D1EA] sm:left-8 sm:h-12 sm:w-12"
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-6 w-6 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                className="absolute right-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-[#2E2C27]/80 text-white shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-[#A5C2DE] active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#B7D1EA] sm:right-8 sm:h-12 sm:w-12"
                aria-label="Next photo"
              >
                <ChevronRight className="h-6 w-6 stroke-[2.5]" />
              </button>
            </>
          ) : null}

          {/* Floating Zoom Control Pill Toolbar */}
          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/20 bg-[#2E2C27]/90 p-1.5 text-white shadow-xl backdrop-blur-md sm:bottom-5 sm:gap-1.5 sm:p-2">
            <button
              type="button"
              onClick={handleZoomOut}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-[#A5C2DE] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
              title="Zoom Out"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4 stroke-[2.5]" />
            </button>

            <span className="min-w-12 px-1 text-center font-mono text-xs font-bold text-white sm:min-w-14">
              {currentScalePercent}%
            </span>

            <button
              type="button"
              onClick={handleZoomIn}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-[#A5C2DE] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
              title="Zoom In"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4 stroke-[2.5]" />
            </button>

            <div className="mx-0.5 h-4 w-px bg-white/20" aria-hidden="true" />

            <button
              type="button"
              onClick={resetZoom}
              disabled={!isZoomedIn}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-[#A5C2DE] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
              title="Reset Zoom (100%)"
              aria-label="Reset zoom"
            >
              <RotateCcw className="h-4 w-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Bottom Thumbnail Strip Carousel */}
        {images.length > 1 ? (
          <footer className="sd-safe-pb-2-5-add relative z-30 shrink-0 border-t border-white/10 bg-[#2E2C27]/95 px-2 pt-2.5 backdrop-blur-xl sm:px-4 sm:py-3">
            <div className="mx-auto flex max-w-6xl items-center justify-start gap-2 overflow-x-auto overscroll-x-contain px-1 py-0.5 scrollbar-none sm:justify-center sm:gap-2.5">
              {images.map((image, index) => {
                const isActive = index === currentIndex;
                return (
                  <button
                    key={`${image.url}-${index}`}
                    type="button"
                    ref={(node) => {
                      thumbnailRefs.current[index] = node;
                    }}
                    onClick={() => setCurrentIndex(index)}
                    className={cn(
                      "relative h-12 w-16 shrink-0 cursor-pointer overflow-hidden rounded-xl transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#B7D1EA] sm:h-14 sm:w-20",
                      isActive
                        ? "scale-105 border-2 border-[#A5C2DE] shadow-lg"
                        : "border border-white/20 opacity-50 hover:opacity-100"
                    )}
                    aria-label={`View photo ${index + 1}`}
                    aria-current={isActive ? "true" : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt={image.caption || `Thumbnail ${index + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </button>
                );
              })}
            </div>
          </footer>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}
