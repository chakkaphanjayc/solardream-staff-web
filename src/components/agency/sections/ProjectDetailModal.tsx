"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Images,
  Quote,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
  ZoomIn,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { GalleryItem, ProjectCaseStudy } from "@/types/portfolio";
import VisxImageLightbox from "@/components/ui/VisxImageLightbox";

type ProjectDetailModalProps = Readonly<{
  project: ProjectCaseStudy | null;
  locale: string;
  onClose: () => void;
}>;

type ShowcaseGalleryProps = Readonly<{
  project: ProjectCaseStudy;
  reduceMotion: boolean;
}>;

function subscribeToHydration() {
  return () => undefined;
}

function getClientHydrationSnapshot() {
  return true;
}

function getServerHydrationSnapshot() {
  return false;
}

function ImageWithFallback({
  src,
  alt,
  fill,
  width,
  height,
  priority,
  sizes,
  className,
  fallbackLabel,
}: Readonly<{
  src: string;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  priority?: boolean;
  sizes?: string;
  className?: string;
  fallbackLabel: string;
}>) {
  const [error, setError] = useState(false);

  if (error || !src) {
    return (
      <div
        role="img"
        aria-label={alt || fallbackLabel}
        className="flex h-full w-full flex-col items-center justify-center bg-slate-900 p-6 text-center text-slate-400"
      >
        <Images className="mb-2 h-8 w-8 text-[#B7D1EA]" aria-hidden="true" />
        <span className="text-sm font-semibold">{fallbackLabel}</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      width={width}
      height={height}
      priority={priority}
      sizes={sizes}
      className={className}
      onError={() => setError(true)}
    />
  );
}

function ShowcaseGallery({ project, reduceMotion }: ShowcaseGalleryProps) {
  const t = useTranslations("HomeEditorial.projects.dialog");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isGalleryHovered, setIsGalleryHovered] = useState(false);
  const [isAutoplayManuallyPaused, setIsAutoplayManuallyPaused] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const thumbnailRailRef = useRef<HTMLDivElement | null>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleTouchStart = (e: React.TouchEvent<HTMLButtonElement>) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: e.timeStamp,
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLButtonElement>) => {
    if (!touchStartRef.current) return;
    const touchEnd = e.changedTouches[0];
    if (!touchEnd) {
      touchStartRef.current = null;
      return;
    }
    const deltaX = touchEnd.clientX - touchStartRef.current.x;
    const deltaY = touchEnd.clientY - touchStartRef.current.y;
    const deltaTime = e.timeStamp - touchStartRef.current.time;

    if (deltaTime < 400 && Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      if (deltaX > 0) {
        changeImage(-1);
      } else {
        changeImage(1);
      }
    }
    touchStartRef.current = null;
  };

  const images = useMemo<GalleryItem[]>(
    () => (project.galleryImages.length ? project.galleryImages : [{ url: project.heroImage, caption: project.title }]),
    [project],
  );
  const activeImage = images[activeImageIndex] ?? images[0] ?? null;

  const changeImage = useCallback(
    (direction: -1 | 1) => {
      if (images.length < 2) return;

      setIsAutoplayManuallyPaused(true);
      setActiveImageIndex((current) => (current + direction + images.length) % images.length);
    },
    [images.length],
  );

  const selectImage = useCallback((index: number) => {
    if (index < 0 || index >= images.length) return;

    setIsAutoplayManuallyPaused(true);
    setActiveImageIndex(index);
  }, [images.length]);

  useEffect(() => {
    if (images.length < 2 || isGalleryHovered || isAutoplayManuallyPaused || lightboxIndex !== null) return;

    const interval = window.setInterval(() => {
      setActiveImageIndex((current) => (current + 1) % images.length);
    }, 4500);

    return () => window.clearInterval(interval);
  }, [images.length, isAutoplayManuallyPaused, isGalleryHovered, lightboxIndex]);

  useEffect(() => {
    if (images.length < 2 || lightboxIndex !== null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key === "ArrowLeft") changeImage(-1);
      if (event.key === "ArrowRight") changeImage(1);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [changeImage, images.length, lightboxIndex]);

  useEffect(() => {
    if (lightboxIndex !== null) return;

    const activeThumbnail = thumbnailRefs.current[activeImageIndex];
    if (!activeThumbnail || !thumbnailRailRef.current) return;

    activeThumbnail.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeImageIndex, lightboxIndex, reduceMotion]);

  return (
    <section className="rounded-[24px] border border-[#F7F6F3] bg-[#E6E3DC] p-3 sm:p-5 lg:p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2E2C27]">
          <Images className="h-4 w-4 text-[#4F7FA8]" />
          <span>{t("gallery")}</span>
        </h3>
        <div className="flex items-center gap-2" aria-live="polite">
          <span className="hidden sm:inline text-[11px] font-medium text-[#4E4B44]">
            {t("zoom")}
          </span>
          <span className="rounded-full border border-[#CBC7BE] bg-[#DCE8F5] px-3 py-1 text-[10px] font-bold text-[#2E2C27]">
            {activeImageIndex + 1} / {images.length} PHOTOS
          </span>
        </div>
      </div>

      {/* Main Visual Image Card with Zoom trigger & Touch Swipe */}
      <div
        className="group relative mt-4 aspect-[4/3] w-full select-none overflow-hidden rounded-2xl border border-[#F7F6F3] bg-slate-900 shadow-sm sm:aspect-[16/10] lg:aspect-[16/9]"
        onMouseEnter={() => setIsGalleryHovered(true)}
        onMouseLeave={() => setIsGalleryHovered(false)}
      >
        <button
          type="button"
          className="absolute inset-0 z-0 block h-full w-full cursor-zoom-in touch-pan-y focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#B7D1EA]"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={() => setLightboxIndex(activeImageIndex)}
          aria-label={t("openGallery")}
        >
          {activeImage ? (
            <ImageWithFallback
              src={activeImage.url}
              alt={activeImage.caption || project.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1200px) 75vw, 1000px"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              fallbackLabel={t("imageUnavailable")}
            />
          ) : null}
        </button>

        {/* Hover / Tap to Zoom badge */}
        <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-white/30 bg-black/60 px-3 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur-md transition-colors sm:px-3 sm:py-1">
          <ZoomIn className="size-3.5 text-white" />
          <span className="hidden sm:inline">{t("zoom")}</span>
          <span className="sm:hidden">{t("zoomShort")}</span>
        </div>

        {/* Left / Right Carousel Buttons */}
        {images.length > 1 ? (
          <div className="absolute inset-0 flex items-center justify-between p-3 pointer-events-none">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                changeImage(-1);
              }}
              className="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/60 text-white shadow-md transition-all duration-200 hover:bg-[#A5C2DE] active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#B7D1EA]"
              aria-label={t("previousImage")}
            >
              <ChevronLeft className="h-6 w-6 stroke-[2.5]" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                changeImage(1);
              }}
              className="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/60 text-white shadow-md transition-all duration-200 hover:bg-[#A5C2DE] active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#B7D1EA]"
              aria-label={t("nextImage")}
            >
              <ChevronRight className="h-6 w-6 stroke-[2.5]" />
            </button>
          </div>
        ) : null}
      </div>

      {/* Thumbnails Filmstrip */}
      {images.length > 1 ? (
        <div
          ref={thumbnailRailRef}
          className="mt-4 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-1 pb-2 scrollbar-none sm:gap-3"
          role="group"
          aria-label={t("selectGallery")}
        >
          {images.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              ref={(node) => {
                thumbnailRefs.current[index] = node;
              }}
              onClick={() => selectImage(index)}
              className={cn(
                "relative h-14 w-20 shrink-0 snap-start cursor-pointer overflow-hidden rounded-xl transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#B7D1EA] sm:h-16 sm:w-24",
                index === activeImageIndex
                  ? "scale-105 border-2 border-[#7CA8D0] bg-[#DCE8F5] opacity-100 shadow-md"
                  : "border border-[#CBC7BE] opacity-60 hover:opacity-100"
              )}
              aria-label={t("showGalleryImage", { index: index + 1 })}
              aria-current={index === activeImageIndex ? "true" : undefined}
            >
              <ImageWithFallback src={image.url} alt="" fill sizes="96px" className="object-cover" fallbackLabel={t("imageUnavailable")} />
            </button>
          ))}
        </div>
      ) : null}

      {/* Interactive Visx Zoom Lightbox Modal */}
      <VisxImageLightbox
        images={images}
        initialIndex={lightboxIndex ?? 0}
        isOpen={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
        title={project.title}
      />
    </section>
  );
}

function ProjectDetailModal({ project, locale, onClose }: ProjectDetailModalProps) {
  const t = useTranslations("HomeEditorial.projects.dialog");
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const reduceMotion = useReducedMotion() ?? false;
  const isOpen = project !== null;
  const modalScrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    modalScrollerRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [isOpen, project?.id]);

  useEffect(() => {
    if (!isOpen) return;

    const body = document.body;
    const documentElement = document.documentElement;
    const scrollY = window.scrollY;
    const previousPosition = body.style.position;
    const previousTop = body.style.top;
    const previousWidth = body.style.width;
    const previousScrollBehavior = documentElement.style.scrollBehavior;

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    return () => {
      body.style.overflow = "unset";
      body.style.position = previousPosition;
      body.style.top = previousTop;
      body.style.width = previousWidth;

      const restoreScrollPosition = () => {
        documentElement.style.scrollBehavior = "auto";
        documentElement.scrollTop = scrollY;
        body.scrollTop = scrollY;
        window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
        body.scrollTop = scrollY;
        documentElement.style.scrollBehavior = previousScrollBehavior;
      };

      restoreScrollPosition();
      window.requestAnimationFrame(restoreScrollPosition);
    };
  }, [isOpen]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {project ? (
        <motion.div
          key={project.id}
          aria-label={t("backdrop")}
          data-works-modal-backdrop
          data-solar-surface="atelier"
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-2 backdrop-blur-md sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
          onClick={onClose}
        >
          <motion.div
            aria-labelledby="project-modal-title"
            aria-modal="true"
            data-bagui="works-modal"
            data-solar-surface="atelier"
            className="solar-works-modal relative flex h-[94vh] w-[96vw] max-w-7xl flex-col overflow-hidden rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] font-sans text-[#2E2C27] shadow-2xl"
            initial={{ scale: reduceMotion ? 1 : 0.95, opacity: 0, y: reduceMotion ? 0 : 32 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: reduceMotion ? 1 : 0.96, opacity: 0, y: reduceMotion ? 0 : 24 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", damping: 25, stiffness: 300 }}
            onClick={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
            role="dialog"
          >
            {/* Modal Header */}
            <header className="solar-works-modal-header sticky top-0 z-30 flex shrink-0 items-center justify-between gap-3 border-b border-[#F7F6F3] bg-[#E6E3DC] px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#CBC7BE] bg-[#DCE8F5] text-xs font-bold text-[#2E2C27]">
                  SD
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-[#7CA8D0]/30 bg-[#DCE8F5] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#4F7FA8]">
                      {t("caseDossier")}
                    </span>
                    <span className="text-xs font-medium text-[#4E4B44]">{t("realInstallation")}</span>
                  </div>
                  <h2 id="project-modal-title" className="max-w-[min(65vw,560px)] truncate text-base sm:text-lg font-bold text-[#2E2C27]">
                    {project.title}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-4 py-2 text-xs font-semibold text-[#2E2C27] shadow-xs transition-all hover:bg-[#DCE8F5] active:scale-95"
                aria-label={t("close")}
              >
                <span>{t("close")}</span>
                <X className="h-4 w-4 stroke-[2.5]" />
              </button>
            </header>

            {/* Modal Body Container with Scroll */}
            <div ref={modalScrollerRef} className="flex-1 overflow-y-auto overscroll-contain">
              {/* Hero Image Banner */}
              <section className="solar-works-modal-hero relative h-[35vh] min-h-[260px] max-h-[460px] overflow-hidden border-b border-[#F7F6F3] bg-slate-950">
                <ImageWithFallback
                  src={project.heroImage}
                  alt={project.title}
                  fill
                  priority
                  sizes="100vw"
                  className="h-full w-full object-cover object-center"
                  fallbackLabel={t("imageUnavailable")}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#000000]/90 via-[#000000]/40 to-transparent" />

                <div className="absolute bottom-6 left-0 right-0 mx-auto max-w-6xl px-6 text-white sm:px-10">
                  <div className="mb-3 flex flex-wrap items-center gap-2.5 text-xs font-semibold">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-black/60 backdrop-blur-md px-3.5 py-1.5 text-white">
                      <MapPin className="h-4 w-4 text-[#A5C2DE]" />
                      {project.location}
                    </span>
                    <span className="rounded-full bg-[#B7D1EA] px-3.5 py-1.5 text-white">
                      {project.solarSizeKw} kWp System
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-black/60 backdrop-blur-md px-3.5 py-1.5 text-white">
                      <Calendar className="h-4 w-4 text-white" />
                      {t("year")} {project.completionYear}
                    </span>
                  </div>
                  <h1 className="max-w-4xl text-2xl font-bold leading-tight text-white sm:text-4xl">
                    {project.title}
                  </h1>
                </div>
              </section>

              {/* Internal Layout Grid */}
              <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8 sm:px-10 sm:py-10">
                {/* Photo Gallery */}
                <div>
                  <ShowcaseGallery project={project} reduceMotion={reduceMotion} />
                </div>

                {/* Case Details & Financial Impact Grid */}
                <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">

                  {/* Left Column: Case Overview & Stats */}
                  <div className="space-y-7">

                    {/* Summary Box */}
                    <section className="rounded-[24px] border border-[#F7F6F3] bg-[#E6E3DC] p-6 shadow-sm">
                      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#4F7FA8]">
                        <Sparkles className="h-4 w-4 text-[#4F7FA8]" />
                        <span>{t("summary")}</span>
                      </h3>
                      <p className="mt-4 text-sm font-normal leading-relaxed text-[#2E2C27] sm:text-base">
                        {project.summary}
                      </p>
                      <div className="mt-6 flex flex-wrap gap-2 border-t border-[#F7F6F3] pt-4">
                        {project.tags.map((tag, tagIndex) => (
                          <span key={`${tag}-${tagIndex}`} className="rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-3.5 py-1 text-xs font-medium text-[#2E2C27]">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </section>

                    {/* Financial Impact Cards (Cards: ค่าไฟเดิม, ค่าไฟหลังติด, ประหยัดเฉลี่ย) */}
                    {project.showFinancials !== false ? (
                      <section>
                          <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-[#4E4B44]">
                          {t("financialImpact")}
                        </h3>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          {/* Card 1: ค่าไฟเดิม */}
                          <div className="rounded-[20px] border border-[#F7F6F3] bg-[#F0EEE9] p-4 shadow-sm">
                            <span className="text-[11px] font-medium uppercase tracking-wider text-[#4E4B44]">{t("beforeBill")}</span>
                            <p className="mt-2 text-2xl font-bold text-[#B3261E] line-through">฿{project.beforeAfter.beforeBillThb.toLocaleString()}</p>
                          </div>

                          {/* Card 2: ค่าไฟหลังติด */}
                          <div className="rounded-[20px] border border-[#F7F6F3] bg-[#F0EEE9] p-4 shadow-sm">
                            <span className="text-[11px] font-medium uppercase tracking-wider text-[#4E4B44]">{t("afterBill")}</span>
                            <p className="mt-2 text-2xl font-bold text-emerald-700">฿{project.beforeAfter.afterBillThb.toLocaleString()}</p>
                          </div>

                          {/* Card 3: ประหยัดเฉลี่ย */}
                          <div className="rounded-[20px] border border-[#7CA8D0]/30 bg-[#DCE8F5] p-4 text-[#2E2C27] shadow-sm">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#4F7FA8]">{t("monthlySaving")}</span>
                            <p className="mt-2 text-3xl font-bold text-[#2E2C27]">฿{project.monthlySavingsThb.toLocaleString()}</p>
                          </div>
                        </div>
                      </section>
                    ) : null}

                    {/* System Hardware Specifications */}
                    <section className="rounded-[24px] border border-[#F7F6F3] bg-[#F0EEE9] p-6 shadow-sm">
                      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#4F7FA8]">
                        <ShieldCheck className="h-4 w-4 text-[#4F7FA8]" />
                        <span>{t("hardware")}</span>
                      </h3>
                      <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 text-xs font-medium sm:grid-cols-2">
                        <div className="flex items-center justify-between border-b border-[#F7F6F3] pb-3">
                          <span className="text-[#4E4B44]">{t("installedCapacity")}</span>
                          <span className="text-right font-bold text-[#2E2C27] text-sm">{project.solarSizeKw} kW</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-[#F7F6F3] pb-3">
                          <span className="text-[#4E4B44]">{t("panelCount")}</span>
                          <span className="text-right font-bold text-[#2E2C27] text-sm">{project.panelCount} แผง</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-[#F7F6F3] pb-3">
                          <span className="text-[#4E4B44]">{t("inverterArchitecture")}</span>
                          <span className="text-right font-bold text-[#2E2C27] text-sm">{project.inverterModel}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-[#F7F6F3] pb-3">
                          <span className="text-[#4E4B44]">{t("estimatedPayback")}</span>
                          <span className="text-right font-bold text-emerald-700 text-sm">~{project.beforeAfter.paybackYears} ปี</span>
                        </div>
                      </div>
                    </section>

                    {/* Customer Quote */}
                    {project.quote ? (
                      <section className="relative overflow-hidden rounded-[24px] bg-[#2E2C27] p-6 text-white shadow-md">
                        <Quote className="absolute right-4 top-4 h-14 w-14 text-white/10" />
                        <p className="relative z-10 text-base font-medium leading-relaxed text-white">“{project.quote.text}”</p>
                        <div className="relative z-10 mt-4 flex items-center gap-2 text-xs font-semibold text-[#A5C2DE]">
                          <CheckCircle2 className="h-4 w-4 text-[#A5C2DE]" />
                          <span>{project.quote.author} · {project.quote.role}</span>
                        </div>
                      </section>
                    ) : null}
                  </div>

                  {/* Right Column: Sticky Action Card */}
                  <aside>
                    <div className="sticky top-6 space-y-5 rounded-[24px] border border-[#F7F6F3] bg-[#E6E3DC] p-6 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#DCE8F5] text-[#4F7FA8]">
                          <Zap className="h-6 w-6" />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#4E4B44]">{t("solarSizing")}</span>
                          <h3 className="text-base font-bold text-[#2E2C27]">{t("interestedInSystem", { size: project.solarSizeKw })}</h3>
                        </div>
                      </div>

                      <p className="text-xs font-normal leading-relaxed text-[#4E4B44]">
                        {t("sidebarDescription")}
                      </p>

                      <div className="space-y-2.5 rounded-2xl border border-[#F7F6F3] bg-[#F0EEE9] p-4 text-xs font-medium">
                        <div className="flex items-center justify-between"><span className="text-[#4E4B44]">{t("recommendation")}</span><span className="font-bold text-[#2E2C27]">{project.solarSizeKw} kW</span></div>
                        <div className="flex items-center justify-between"><span className="text-[#4E4B44]">{t("panelWarranty")}</span><span className="font-bold text-emerald-700">25-30 {locale === "en" ? "years" : "ปี"}</span></div>
                        <div className="flex items-center justify-between"><span className="text-[#4E4B44]">{t("permitProcess")}</span><span className="font-bold text-[#2E2C27]">{t("fullService")}</span></div>
                      </div>

                      <Link
                        href={`/${locale}/build?kw=${project.solarSizeKw}`}
                        onClick={onClose}
                        className="group inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-6 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#A5C2DE] hover:shadow active:scale-95 cursor-pointer"
                      >
                        <span>{t("designThisCase")}</span>
                        <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1 stroke-[2.5]" />
                      </Link>
                    </div>
                  </aside>
                </div>
              </main>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export default memo(ProjectDetailModal);
