"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Images,
  MapPin,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { MangaCaption } from "@/components/features/home/MangaPanel";
import { MangaChapter } from "@/components/features/home/MangaChapter";
import ProjectDetailModal from "@/components/agency/sections/ProjectDetailModal";
import { isPortfolioProject, type PortfolioProjectListItem, type ProjectCaseStudy } from "@/types/portfolio";

const bentoContainerVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const bentoCardVariants: Variants = {
  hidden: { y: 50, opacity: 0, rotate: -2 },
  show: {
    y: 0,
    opacity: 1,
    rotate: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 22,
    },
  },
};

export default function PortfolioMangaSection({
  locale,
  initialProjects = [],
}: {
  locale: string;
  initialProjects?: readonly PortfolioProjectListItem[];
}) {
  const [projects] = useState<readonly PortfolioProjectListItem[]>(initialProjects);
  const [selectedProject, setSelectedProject] = useState<ProjectCaseStudy | null>(null);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const projectCache = useRef(new Map<string, ProjectCaseStudy>());

  const handlePrev = useCallback(() => {
    setActiveIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setActiveIndex((prev) => Math.min(projects.length - 1, prev + 1));
  }, [projects.length]);

  const handleSelect = useCallback(async (projectItem: PortfolioProjectListItem) => {
    const cached = projectCache.current.get(projectItem.id);
    if (cached) {
      setSelectedProject(cached);
      return;
    }

    if (loadingProjectId === projectItem.id) return;
    setLoadingProjectId(projectItem.id);

    try {
      const response = await fetch(`/api/portfolio?projectId=${encodeURIComponent(projectItem.id)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      const projectData = payload && typeof payload === "object" && "project" in payload ? payload.project : null;

      if (response.ok && isPortfolioProject(projectData)) {
        projectCache.current.set(projectItem.id, projectData);
        setSelectedProject(projectData);
      }
    } catch (error) {
      console.error("[PortfolioMangaSection] Failed to load project detail:", error);
    } finally {
      setLoadingProjectId(null);
    }
  }, [loadingProjectId]);

  const handleCloseModal = useCallback(() => {
    setSelectedProject(null);
  }, []);

  return (
    <MangaChapter
      chapter="works"
      chapterNumber={5}
      chapterTitle={locale === "th" ? "ผลงานการติดตั้งจริง" : "Real Installed Works"}
      variant="ink"
      className="py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header & Navigation Buttons */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <MangaCaption tone="blue" className="mb-3">
              <Images className="h-3.5 w-3.5 text-[#0F172A]" />
              <span>{locale === "th" ? "ผลงานจริงที่เชื่อถือได้" : "Verified Projects"}</span>
            </MangaCaption>
            <h2 className="text-balance text-[clamp(1.85rem,3.8vw,3.4rem)] font-black leading-tight tracking-tight text-white">
              {locale === "th" ? "ภาพงานติดตั้งจริง บนหลังคาบ้านลูกค้า" : "Real Installed Projects Across Thailand"}
            </h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300 sm:text-base">
              {locale === "th"
                ? "เราเก็บภาพถ่ายสถานที่จริงทุกขั้นตอน เพื่อความมั่นใจในมาตรฐานวิศวกรรมและความปลอดภัยสูงสุด"
                : "Authentic photographs from residential rooftop installations across Thailand."}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/${locale}/works`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-white bg-[#F59E0B] px-5 py-2 text-xs font-black text-[#0F172A] shadow-[3px_3px_0_#0F172A] transition-all hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#0F172A] cursor-pointer"
            >
              <span>{locale === "th" ? `ดูทั้งหมด (${projects.length})` : `View All (${projects.length})`}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            {projects.length > 1 ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={activeIndex === 0}
                  aria-label="Previous project"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white bg-white/10 text-white shadow-[2px_2px_0_#0F172A] transition hover:bg-white hover:text-[#0F172A] disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={activeIndex >= projects.length - 1}
                  aria-label="Next project"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white bg-white/10 text-white shadow-[2px_2px_0_#0F172A] transition hover:bg-white hover:text-[#0F172A] disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Real Projects Showcase Grid with whileInView scroll reveal */}
        {projects.length === 0 ? (
          <div className="mt-12 rounded-3xl border-2 border-white/20 bg-white/5 p-12 text-center">
            <Images className="mx-auto h-12 w-12 text-slate-400" />
            <h3 className="mt-4 text-lg font-bold text-white">
              {locale === "th" ? "กำลังอัปเดตผลงานการติดตั้งใหม่" : "Showcase projects updating"}
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              {locale === "th" ? "สามารถเยี่ยมชมแกลเลอรีภาพถ่ายทั้งหมดได้ที่หน้าผลงาน" : "Visit our works gallery for more case studies."}
            </p>
            <Link
              href={`/${locale}/works`}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-white bg-[#F59E0B] px-6 py-2.5 text-xs font-black text-[#0F172A]"
            >
              <span>{locale === "th" ? "ไปยังหน้าผลงานทั้งหมด" : "Go to Works Gallery"}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <motion.div
            variants={bentoContainerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-50px" }}
            className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {projects.slice(0, 6).map((project, index) => (
              <motion.div
                key={project.id}
                variants={bentoCardVariants}
                role="button"
                tabIndex={0}
                onClick={() => handleSelect(project)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelect(project);
                  }
                }}
                className={cn(
                  "group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-[#0F172A] bg-white text-[#0F172A] shadow-[4px_4px_0_#F59E0B] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[6px_6px_0_#B7D1EA]",
                  loadingProjectId === project.id && "pointer-events-none opacity-80"
                )}
              >
                {/* Photo Frame */}
                <div className="relative aspect-[16/10] w-full overflow-hidden border-b-[2.5px] border-[#0F172A] bg-slate-100">
                  <Image
                    src={project.heroImage || "/asset/home-manga/hero-solar-home-v2.webp"}
                    alt={project.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  />
                  
                  {/* Manga Location Tag */}
                  <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-xl border-2 border-[#0F172A] bg-white/95 px-2.5 py-1 text-[11px] font-black text-[#0F172A] shadow-[2px_2px_0_#0F172A] backdrop-blur-md">
                    <MapPin className="h-3 w-3 text-[#F59E0B]" />
                    <span>{project.location || "Thailand"}</span>
                  </div>

                  {/* System Capacity Badge */}
                  {project.solarSizeKw ? (
                    <div className="absolute right-3 top-3 z-10 rounded-xl border-2 border-[#0F172A] bg-[#B7D1EA] px-2.5 py-1 text-[11px] font-black text-[#0F172A] shadow-[2px_2px_0_#0F172A]">
                      {project.solarSizeKw} kWp
                    </div>
                  ) : null}
                </div>

                {/* Project Info Strip */}
                <div className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md border border-[#0F172A] bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-black uppercase text-[#0F172A]">
                      CASE #{String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500">
                      {project.completionYear ? `ปี ${project.completionYear}` : ""}
                    </span>
                  </div>

                  <h3 className="mt-2 line-clamp-1 text-base font-black text-[#0F172A] group-hover:text-[#0284c7] transition-colors">
                    {project.title}
                  </h3>
                  
                  <p className="mt-1 line-clamp-1 text-xs font-bold leading-relaxed text-slate-600">
                    {locale === "th" ? "ประหยัดค่าไฟ ~" : "Est. Savings ~"} <span className="text-emerald-700 font-black">฿{project.monthlySavingsThb.toLocaleString("th-TH")}/เดือน</span>
                  </p>

                  <div className="mt-4 flex items-center justify-between border-t-2 border-slate-100 pt-3 text-xs font-black text-[#0F172A]">
                    <span className="flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      <span>
                        {loadingProjectId === project.id
                          ? (locale === "th" ? "กำลังโหลด..." : "Loading...")
                          : (locale === "th" ? "ดูรายละเอียดเคส" : "View Case Study")}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-[#F59E0B]" />
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      TIER-1 VERIFIED
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

      </div>

      {/* Project Detail Modal */}
      {selectedProject ? (
        <ProjectDetailModal
          project={selectedProject}
          onClose={handleCloseModal}
          locale={locale}
        />
      ) : null}
    </MangaChapter>
  );
}

