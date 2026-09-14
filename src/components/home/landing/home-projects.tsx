"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { FiArrowUpRight, FiImage, FiLoader, FiMapPin } from "react-icons/fi";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { isPortfolioProject, type PortfolioProjectListItem, type ProjectCaseStudy } from "@/types/portfolio";
import styles from "./home-landing.module.css";

const ProjectDetailModal = dynamic(
  () => import("@/components/agency/sections/ProjectDetailModal"),
  { ssr: false },
);

type HomeProjectsProps = Readonly<{
  locale: string;
  initialProjects: readonly PortfolioProjectListItem[];
}>;

type ProjectCategoryKey = "residential" | "villa" | "commercial" | "industrial" | "agricultural" | "other";

function categoryKey(category: string): ProjectCategoryKey {
  const normalized = category.toLowerCase();
  if (normalized === "villa") return "villa";
  if (normalized === "commercial") return "commercial";
  if (normalized === "industrial") return "industrial";
  if (normalized === "agricultural") return "agricultural";
  if (normalized === "other") return "other";
  return "residential";
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US").format(value);
}

function ProjectImage({ project, imageUnavailable, photoLabel }: Readonly<{ project: PortfolioProjectListItem; imageUnavailable: string; photoLabel: string }>) {
  const [hasError, setHasError] = useState(false);
  const source = project.heroImage.trim();

  if (!source || hasError) {
    return (
      <div className={styles.projectImage} role="img" aria-label={imageUnavailable}>
        <div className={styles.projectImageFallback}><FiImage aria-hidden="true" /></div>
      </div>
    );
  }

  return (
    <div className={styles.projectImage}>
      <Image
        src={source}
        alt={project.title}
        fill
        sizes="(max-width: 520px) 86vw, (max-width: 820px) 70vw, 465px"
        onError={() => setHasError(true)}
      />
      <div className={styles.projectMeta} aria-hidden="true">
        <span className={styles.projectBadge}>{project.solarSizeKw} kWp</span>
        <span className={styles.projectBadge}>{project.galleryImageCount} {photoLabel}</span>
      </div>
    </div>
  );
}

export function HomeProjects({ locale, initialProjects }: HomeProjectsProps) {
  const t = useTranslations("HomeLanding");
  const [selectedProject, setSelectedProject] = useState<ProjectCaseStudy | null>(null);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const totalPhotos = initialProjects.reduce((total, project) => total + project.galleryImageCount, 0);

  const openProject = async (project: PortfolioProjectListItem) => {
    if (loadingProjectId) return;
    setLoadingProjectId(project.id);
    setLoadError(null);
    try {
      const response = await fetch(`/api/portfolio?projectId=${encodeURIComponent(project.id)}`, { cache: "no-store" });
      const payload: unknown = await response.json();
      const projectData = typeof payload === "object" && payload !== null && "project" in payload
        ? payload.project
        : null;
      if (!response.ok || !isPortfolioProject(projectData)) {
        setLoadError(t("projects.error"));
        return;
      }
      setSelectedProject(projectData);
    } catch {
      setLoadError(t("projects.error"));
    } finally {
      setLoadingProjectId(null);
    }
  };

  return (
    <section id="projects" className={`${styles.section} ${styles.projectsSection}`} aria-labelledby="projects-title">
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>{t("projects.eyebrow")}</p>
            <h2 id="projects-title" className={styles.sectionTitle}>{t("projects.title")}</h2>
          </div>
          <p className={styles.sectionDescription}>{t("projects.description")}</p>
        </div>

        {initialProjects.length > 0 ? (
          <div className={styles.projectsRail} aria-label={t("projects.title")}>
            {initialProjects.map((project, index) => (
              <Card key={project.id} className={styles.projectCard}>
                <ProjectImage project={project} imageUnavailable={t("projects.imageUnavailable")} photoLabel={t("projects.photos")} />
                <div className={styles.projectBody}>
                  <div className={styles.projectBodyTop}>
                    <span>{t(`projects.${categoryKey(project.category)}`)}</span>
                    <span>{project.completionYear}</span>
                  </div>
                  <h3 className={styles.projectTitle}>{project.title}</h3>
                  <p className={styles.projectLocation}>
                    <FiMapPin aria-hidden="true" /> {[project.location, project.province].filter(Boolean).join(" · ")}
                  </p>
                  <p className={styles.projectResult}>
                    <span>{t("projects.estimatedSaving")}</span>
                    <strong>฿{formatNumber(project.monthlySavingsThb, locale)} / {t("projects.month")}</strong>
                  </p>
                  <button
                    type="button"
                    className={styles.projectAction}
                    onClick={() => void openProject(project)}
                    disabled={loadingProjectId !== null}
                    aria-label={`${t("projects.viewStory")}: ${project.title}`}
                  >
                    {loadingProjectId === project.id ? <FiLoader className="animate-spin" aria-hidden="true" /> : <FiArrowUpRight aria-hidden="true" />}
                    {loadingProjectId === project.id ? t("projects.opening") : t("projects.viewStory")}
                  </button>
                  <span className="sr-only">{index + 1} / {initialProjects.length}</span>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className={styles.projectEmpty}>{t("projects.empty")}</p>
        )}

        {loadError ? <p className={styles.projectMessage} role="status" aria-live="polite">{loadError}</p> : null}

        <div className={styles.projectControls}>
          <span className="text-xs font-bold text-[#4E4B44]">{totalPhotos} {t("projects.photos")}</span>
          <Link href={`/${locale}/works`} className={styles.projectLink}>
            {t("projects.viewAll")} <FiArrowUpRight aria-hidden="true" />
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
