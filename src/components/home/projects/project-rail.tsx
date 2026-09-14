"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  FiArrowRight,
  FiImage,
  FiLoader,
  FiMapPin,
} from "react-icons/fi";
import { isPortfolioProject, type PortfolioProjectListItem, type ProjectCaseStudy } from "@/types/portfolio";
import styles from "../solar-home.module.css";

// The detail view includes the gallery/lightbox path. Keep it out of the
// homepage's initial client graph and load it only after a project is opened.
const ProjectDetailModal = dynamic(
  () => import("@/components/agency/sections/ProjectDetailModal"),
  { ssr: false },
);

type ProjectRailProps = Readonly<{
  locale: string;
  initialProjects: readonly PortfolioProjectListItem[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getCategoryLabel(category: string, isThai: boolean) {
  const normalized = category.toLowerCase();
  if (normalized === "villa") return isThai ? "วิลล่า" : "Villa";
  if (normalized === "commercial") return isThai ? "เชิงพาณิชย์" : "Commercial";
  if (normalized === "industrial") return isThai ? "อุตสาหกรรม" : "Industrial";
  if (normalized === "agricultural") return isThai ? "เกษตรกรรม" : "Agricultural";
  return isThai ? "บ้านพักอาศัย" : "Residential";
}

function ProjectImage({ project, isThai }: Readonly<{ project: PortfolioProjectListItem; isThai: boolean }>) {
  const [hasError, setHasError] = useState(false);
  const source = project.heroImage || "/asset/home-manga/hero-solar-home-sunny.png";

  if (hasError) {
    return (
      <div className={styles.projectImage} role="img" aria-label={isThai ? "ไม่มีภาพโครงการ" : "Project image unavailable"}>
        <FiImage aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className={styles.projectImage}>
      <Image
        src={source}
        alt={project.title}
        fill
        sizes="(max-width: 704px) 82vw, 320px"
        onError={() => setHasError(true)}
      />
      <span className={styles.projectImageOverlay} aria-hidden="true" />
      <span className={styles.projectPhotoMeta}>
        <span>{getCategoryLabel(project.category, isThai)}</span>
        <span>{project.galleryImageCount || 1} {isThai ? "ภาพ" : "photos"}</span>
      </span>
    </div>
  );
}

export default function ProjectRail({ locale, initialProjects }: ProjectRailProps) {
  const isThai = locale === "th";
  const prefersReducedMotion = useReducedMotion();
  const [selectedProject, setSelectedProject] = useState<ProjectCaseStudy | null>(null);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleSelect = async (project: PortfolioProjectListItem) => {
    if (loadingProjectId) return;

    setLoadingProjectId(project.id);
    setLoadError(null);
    try {
      const response = await fetch(`/api/portfolio?projectId=${encodeURIComponent(project.id)}`, {
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      const projectData = isRecord(payload) && "project" in payload ? payload.project : null;

      if (!response.ok || !isPortfolioProject(projectData)) {
        setLoadError(isThai ? "เปิดรายละเอียดโครงการไม่ได้ในขณะนี้" : "Project details are unavailable right now.");
        return;
      }

      setSelectedProject(projectData);
    } catch {
      setLoadError(isThai ? "เปิดรายละเอียดโครงการไม่ได้ในขณะนี้" : "Project details are unavailable right now.");
    } finally {
      setLoadingProjectId(null);
    }
  };

  return (
    <section id="projects" className={`${styles.sectionShell} ${styles.projectSection}`} aria-labelledby="projects-title">
      <div className={styles.contentWidth}>
        <div className={styles.projectHeader}>
          <div>
            <p className={styles.sectionKicker}>{isThai ? "บ้านที่เลือกแสงแดดของตัวเอง" : "Homes with their own source"}</p>
            <h2 id="projects-title" className={styles.sectionTitle}>
              {isThai ? "ดูแสงแดดในบริบทของบ้านจริง" : "See solar at home, in real places."}
            </h2>
          </div>
          <p className={styles.sectionDescription}>
            {isThai
              ? "บ้านแต่ละหลังมีวิธีรับแสงและจังหวะการใช้ไฟไม่เหมือนกัน เราออกแบบให้เข้ากับสถานที่จริง"
              : "Every roof meets the sun differently. These installations show how the system belongs to the home around it."}
          </p>
        </div>

        {initialProjects.length > 0 ? (
          <div className={styles.projectRail} aria-label={isThai ? "ผลงานติดตั้งโซลาร์" : "Solar installation projects"}>
            {initialProjects.map((project, index) => (
              <motion.button
                suppressHydrationWarning
                type="button"
                key={project.id}
                className={styles.projectCard}
                onClick={() => void handleSelect(project)}
                whileHover={prefersReducedMotion ? undefined : { y: -4 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
                aria-label={isThai ? `ดูรายละเอียด ${project.title}` : `View details for ${project.title}`}
              >
                <ProjectImage project={project} isThai={isThai} />
                <span className={styles.projectContent}>
                  <span className={styles.projectTopline}>
                    <span className={styles.projectSize}>{project.solarSizeKw} kWp</span>
                    <span className={styles.projectYear}>{project.completionYear}</span>
                  </span>
                  <span className={styles.projectTitle}>{project.title}</span>
                  <span className={styles.projectDetails}>
                    <FiMapPin aria-hidden="true" />
                    <span>{project.location}</span>
                  </span>
                  <span className={styles.projectResult}>
                    {isThai ? "ประหยัดโดยประมาณ" : "Estimated saving"} ฿{project.monthlySavingsThb.toLocaleString(isThai ? "th-TH" : "en-US")}/{isThai ? "เดือน" : "mo"}
                  </span>
                  <span className={styles.projectArrow}>
                    {loadingProjectId === project.id ? <FiLoader className={styles.spin} aria-hidden="true" /> : <FiArrowRight aria-hidden="true" />}
                    {loadingProjectId === project.id ? (isThai ? "กำลังเปิด..." : "Opening...") : (isThai ? "ดูเรื่องราว" : "View story")}
                  </span>
                </span>
                <span className="sr-only">{index + 1} / {initialProjects.length}</span>
              </motion.button>
            ))}
          </div>
        ) : (
          <p className={styles.projectEmpty}>
            {isThai ? "กำลังเตรียมเรื่องราวจากโครงการของเรา" : "Project stories are being prepared."}
          </p>
        )}

        {loadError ? <p className={styles.projectError} role="status" aria-live="polite">{loadError}</p> : null}

        <div className={styles.projectRailFooter}>
          <Link href={`/${locale}/works`} className={styles.projectViewAll}>
            <span>{isThai ? "ดูผลงานทั้งหมด" : "View all projects"}</span>
            <FiArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>

      {selectedProject ? (
        <ProjectDetailModal
          project={selectedProject}
          locale={locale}
          onClose={() => setSelectedProject(null)}
        />
      ) : null}
    </section>
  );
}
