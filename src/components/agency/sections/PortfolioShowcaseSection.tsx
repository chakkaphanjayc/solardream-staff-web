"use client";

import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Images,
  MapPin,
} from "@/components/ui/icons";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";

import { isPortfolioProject, type PortfolioProjectListItem, type ProjectCaseStudy } from "@/types/portfolio";
import { getProvinceLabel } from "@/lib/thaiProvinces";
import ProjectDetailModal from "./ProjectDetailModal";

type PortfolioShowcaseSectionProps = Readonly<{
  locale: string;
  initialProjects: readonly PortfolioProjectListItem[];
}>;

type CinematicProjectCardProps = Readonly<{
  project: PortfolioProjectListItem;
  index: number;
  total: number;
  progress: MotionValue<number>;
  isActive: boolean;
  isLoading: boolean;
  isMobile: boolean;
  onSelect: (project: PortfolioProjectListItem) => void;
  reduceMotion: boolean;
}>;

const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

const PROVINCE_LABELS: Record<ProjectCaseStudy["province"], string> = {
  chiangmai: "เชียงใหม่",
  bangkok: "กรุงเทพฯ",
  phuket: "ภูเก็ต",
  other: "ประเทศไทย",
};

function subscribeToMobileMedia(callback: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getMobileMediaSnapshot() {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function getMobileMediaServerSnapshot() {
  return false;
}

function ImageWithFallback({
  src,
  alt,
  fill,
  sizes,
  priority,
  className,
}: Readonly<{
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
  priority?: boolean;
  className?: string;
}>) {
  const [error, setError] = useState(false);

  if (error || !src) {
    return (
      <div
        role="img"
        aria-label={alt || "Installation image unavailable"}
        className="flex h-full w-full flex-col items-center justify-center bg-[#0F172A] p-6 text-center text-white/70"
      >
        <Images className="mb-2 h-8 w-8 text-[#B7D1EA]" aria-hidden="true" />
        <span className="text-xs font-semibold">Installation image unavailable</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      sizes={sizes}
      priority={priority}
      className={className}
      onError={() => setError(true)}
    />
  );
}

const CinematicProjectCard = memo(function CinematicProjectCard({
  project,
  index,
  total,
  progress,
  isActive,
  isLoading,
  isMobile,
  onSelect,
  reduceMotion,
}: CinematicProjectCardProps) {
  const isMobileOrStatic = isMobile || reduceMotion;
  
  const opacity = useTransform(
    progress,
    [index - 0.7, index - 0.25, index, index + 0.25, index + 0.7],
    isMobileOrStatic ? [1, 1, 1, 1, 1] : [0, 1, 1, 1, 0],
    { clamp: true }
  );
  const y = useTransform(
    progress,
    [index - 0.7, index, index + 0.7],
    isMobileOrStatic ? [0, 0, 0] : [36, 0, -36],
    { clamp: true }
  );
  const scale = useTransform(
    progress,
    [index - 0.7, index, index + 0.7],
    isMobileOrStatic ? [1, 1, 1] : [0.94, 1, 0.94],
    { clamp: true }
  );
  const imageScale = useTransform(
    progress,
    [index - 0.7, index, index + 0.7],
    isMobileOrStatic ? [1, 1, 1] : [1.06, 1, 1.04],
    { clamp: true }
  );

  return (
    <motion.article
      data-cinematic-showcase-card="true"
      data-cinematic-showcase-active={isActive ? "true" : "false"}
      aria-label={`${project.title}, โครงการที่ ${index + 1} จาก ${total}`}
      className={
        isMobile
          ? "relative flex min-h-[360px] h-[58vh] max-h-[480px] w-full items-center py-2"
          : "md:absolute md:inset-0 md:flex md:items-center md:justify-center w-full py-4 lg:py-6"
      }
      style={{
        opacity: isMobile ? 1 : opacity,
        y: isMobile ? 0 : y,
        scale: isMobile ? 1 : scale,
        pointerEvents: isMobile || isActive ? "auto" : "none",
        zIndex: isActive ? 10 : 1,
      }}
    >
      <div className="group relative h-full w-full max-h-[580px] overflow-hidden rounded-[28px] sm:rounded-[36px] border border-white/20 bg-slate-900 shadow-2xl transition-all duration-300 ease-expo hover:border-[#7CA8D0]/80">
        <motion.div className="absolute inset-0" style={{ scale: isMobile ? 1 : imageScale }}>
          <ImageWithFallback
            src={project.heroImage}
            alt={project.title}
            fill
            priority={index === 0}
            sizes="(max-width: 640px) 94vw, (max-width: 1024px) 88vw, 840px"
            className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-b from-[#000000]/60 via-transparent to-[#000000]/95" />
        <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-[#000000]/95 via-[#000000]/50 to-transparent" />

        {/* Top Badges */}
        <div className="absolute left-3 right-3 top-3 sm:left-6 sm:right-6 sm:top-6 flex items-start justify-between gap-2 z-10">
          <span className="inline-flex max-w-[65%] sm:max-w-[72%] items-center gap-1.5 rounded-full border border-white/20 bg-black/60 px-4 py-1.5 text-[11px] font-bold text-white shadow-sm backdrop-blur-md">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[#A5C2DE]" />
            <span className="truncate">{project.location}</span>
          </span>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/20 bg-[#B7D1EA] px-3.5 py-1.5 text-[11px] font-bold text-white shadow-sm sm:inline-flex">
              <Images className="h-3.5 w-3.5 text-white" />
              {project.galleryImageCount || 1}
            </span>
            <span className="rounded-full border border-white/20 bg-[#DCE8F5] px-4 py-1.5 text-[11px] font-bold text-[#2E2C27] shadow-sm">
              {project.solarSizeKw} kW
            </span>
          </div>
        </div>

        {/* Bottom Content Area */}
        <div className="absolute bottom-4 left-4 right-4 sm:bottom-7 sm:left-7 sm:right-7 text-white z-10">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#A5C2DE]">
            <span>Installed {project.completionYear}</span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#A5C2DE]" aria-hidden="true" />
            <span>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
          </div>
          <div className="mt-2 flex items-end justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-lg sm:text-2xl md:text-3xl font-bold leading-[1.15] tracking-[-0.025em] text-white">
                {project.title}
              </h3>
              <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm font-semibold text-white/90">
                <span>{getProvinceLabel(project.province, "th")}</span>
                {project.showFinancials !== false ? (
                  <>
                    <span className="text-white/40" aria-hidden="true">·</span>
                    <span className="text-[#A5C2DE] font-bold">ประหยัด ฿{project.monthlySavingsThb.toLocaleString()} /เดือน</span>
                  </>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelect(project)}
              disabled={isLoading}
              className="group/btn shrink-0 inline-flex items-center gap-2 rounded-full bg-[#B7D1EA] px-5 py-2.5 text-xs font-bold text-white shadow-lg transition-all duration-200 hover:bg-[#A5C2DE] active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <span>ดูรายละเอียด</span>
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>
    </motion.article>
  );
});

function PortfolioShowcaseSection({ locale, initialProjects }: PortfolioShowcaseSectionProps) {
  const projects = initialProjects;
  const [selectedProject, setSelectedProject] = useState<ProjectCaseStudy | null>(null);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const projectDetailsCache = useRef(new Map<string, ProjectCaseStudy>());
  const reduceMotion = useReducedMotion() ?? false;

  const handleProjectSelect = useCallback(async (project: PortfolioProjectListItem) => {
    const cachedProject = projectDetailsCache.current.get(project.id);
    if (cachedProject) {
      setSelectedProject(cachedProject);
      return;
    }

    if (loadingProjectId === project.id) return;
    setLoadingProjectId(project.id);

    try {
      const response = await fetch(`/api/portfolio?projectId=${encodeURIComponent(project.id)}`, { cache: "no-store" });
      const payload: unknown = await response.json();
      const payloadProject = payload !== null && typeof payload === "object" && "project" in payload
        ? payload.project
        : null;

      if (!response.ok || !isPortfolioProject(payloadProject)) {
        throw new Error("Installation project details could not be loaded.");
      }

      projectDetailsCache.current.set(project.id, payloadProject);
      setSelectedProject(payloadProject);
    } catch (error: unknown) {
      console.error("[PortfolioShowcaseSection] Failed to load project details:", error);
    } finally {
      setLoadingProjectId((current) => current === project.id ? null : current);
    }
  }, [loadingProjectId]);

  const handleModalClose = useCallback(() => {
    setSelectedProject(null);
  }, []);

  const isMobile = useSyncExternalStore(
    subscribeToMobileMedia,
    getMobileMediaSnapshot,
    getMobileMediaServerSnapshot,
  );

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const cardProgress = useTransform(scrollYProgress, [0, 1], [0, Math.max(0, projects.length - 1)]);
  const progressBar = useTransform(scrollYProgress, [0, 1], [0, 1]);

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (projects.length === 0) return;

    const nextIndex = Math.min(
      projects.length - 1,
      Math.max(0, Math.round(latest * Math.max(0, projects.length - 1))),
    );
    setActiveIndex((current) => (current === nextIndex ? current : nextIndex));
  });

  // Jump smoothly to a specific project card
  const jumpToProject = useCallback((targetIndex: number) => {
    const track = containerRef.current;
    if (!track || projects.length < 2) return;

    const currentScrollY = window.scrollY;
    const trackRect = track.getBoundingClientRect();
    const trackStart = currentScrollY + trackRect.top;
    const scrollSpan = track.offsetHeight - window.innerHeight;

    if (scrollSpan <= 0) return;

    const projectStep = scrollSpan / (projects.length - 1);
    const targetScrollY = trackStart + targetIndex * projectStep;

    window.scrollTo({
      top: targetScrollY,
      behavior: "smooth",
    });
  }, [projects.length]);

  const trackHeight = isMobile ? "auto" : `calc(100vh * ${Math.max(2, projects.length)})`;

  if (projects.length === 0) return null;

  return (
    <div className="relative w-full bg-[#0F172A]" data-cinematic-showcase="true">
      <div
        ref={containerRef}
        data-cinematic-showcase-track="true"
        style={{ height: trackHeight }}
        className="relative w-full"
      >
        <div className="mx-auto grid w-full max-w-[1440px] gap-6 px-4 md:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)] md:gap-8 md:px-8 lg:gap-12 lg:px-12">
          {/* Left Sticky Sidebar */}
          <aside
            data-cinematic-showcase-sticky="true"
            className="flex flex-col justify-center px-0 pt-16 pb-6 md:sticky md:top-0 md:h-screen md:py-0 z-20"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#A5C2DE]">
              Real installed proof
            </p>
            <h2 className="mt-3 max-w-xl text-balance text-[clamp(2rem,4.2vw,3.75rem)] font-black leading-[1.02] tracking-[-0.035em] text-white">
              Solar, already at home.
            </h2>
            <p className="mt-3 max-w-sm text-pretty text-xs font-medium leading-relaxed text-slate-300 sm:text-sm">
              เคสติดตั้งจริง เลื่อนดูทีละบ้าน พร้อมข้อมูลผลิตไฟจริง
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/15 shadow-sm">
                <span className="text-[#A5C2DE] font-black">{String(activeIndex + 1).padStart(2, "0")}</span>
                <span className="mx-1.5 text-slate-500">/</span>
                <span className="text-slate-300">{String(projects.length).padStart(2, "0")}</span>
              </span>
              <Link
                href={`/${locale}/works`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#B7D1EA] px-6 py-2.5 text-xs font-bold text-white shadow-lg transition-all hover:bg-[#A5C2DE] active:scale-95"
              >
                ดูทั้งหมด ({projects.length})
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Project Navigation Dots & Arrow Controls */}
            <div className="mt-8 max-w-sm rounded-[24px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md shadow-sm">
              <div className="flex items-center justify-between gap-4 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                <span>Current project</span>
                <span className="text-white font-bold">{projects[activeIndex]?.location}</span>
              </div>

              {/* Progress Bar */}
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((activeIndex / Math.max(1, projects.length - 1)) * 100)} aria-label="Showcase progress">
                <motion.div className="h-full origin-left rounded-full bg-[#A5C2DE]" style={{ scaleX: progressBar }} />
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {projects.map((p, idx) => (
                    <button
                      key={`dot-${p.id}`}
                      type="button"
                      onClick={() => jumpToProject(idx)}
                      aria-label={`Jump to project ${idx + 1}`}
                      className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                        activeIndex === idx ? "w-6 bg-[#A5C2DE]" : "w-2 bg-white/30 hover:bg-white/60"
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={activeIndex === 0}
                    onClick={() => jumpToProject(Math.max(0, activeIndex - 1))}
                    aria-label="Previous project"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={activeIndex === projects.length - 1}
                    onClick={() => jumpToProject(Math.min(projects.length - 1, activeIndex + 1))}
                    aria-label="Next project"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* Right Cards Showcase Stage (Sticky Viewport Stage on Desktop, Fluid on Mobile) */}
          <div
            data-cinematic-showcase-rail="true"
            className={
              isMobile
                ? "flex flex-col gap-6 pb-12"
                : "md:sticky md:top-0 md:h-screen md:flex md:items-center md:justify-center md:relative md:w-full min-w-0"
            }
          >
            {projects.map((project, index) => (
              <CinematicProjectCard
                key={project.id}
                project={project}
                index={index}
                total={projects.length}
                progress={cardProgress}
                isActive={activeIndex === index}
                isLoading={loadingProjectId === project.id}
                isMobile={isMobile}
                onSelect={handleProjectSelect}
                reduceMotion={reduceMotion}
              />
            ))}
          </div>
        </div>

        <ProjectDetailModal
          project={selectedProject}
          locale={locale}
          onClose={handleModalClose}
        />
      </div>
    </div>
  );
}

export default memo(PortfolioShowcaseSection);
