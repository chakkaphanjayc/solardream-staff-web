"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { FiArrowUpRight } from "react-icons/fi";

import { isPortfolioProject, type PortfolioProjectListItem, type ProjectCaseStudy } from "@/types/portfolio";

import styles from "./solar-editorial-home.module.css";

const ProjectDetailModal = dynamic(
  () => import("@/components/agency/sections/ProjectDetailModal"),
  { ssr: false },
);

export type EditorialProjectsLabels = Readonly<{
  viewProject: string;
  viewAll: string;
  imageAlt: string;
  systemSize: string;
  location: string;
  completed: string;
  dialog: Readonly<{
    close: string;
    error: string;
  }>;
}>;

type EditorialProjectsProps = Readonly<{
  locale: string;
  projects: readonly PortfolioProjectListItem[];
  labels: EditorialProjectsLabels;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getImageAlt(template: string, title: string) {
  return template.includes("{title}") ? template.replace("{title}", title) : `${template}: ${title}`;
}

function ProjectImage({ project, alt }: Readonly<{ project: PortfolioProjectListItem; alt: string }>) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !project.heroImage.trim()) {
    return (
      <span className={styles.projectMediaFallback} role="img" aria-label={alt}>
        <span aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className={styles.projectMedia}>
      <Image
        src={project.heroImage}
        alt={alt}
        fill
        sizes="(max-width: 767px) 90vw, 44vw"
        className={styles.coverImage}
        onError={() => setHasError(true)}
      />
    </span>
  );
}

export default function EditorialProjects({ locale, projects, labels }: EditorialProjectsProps) {
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
      const projectData = isRecord(payload) ? payload.project : null;

      if (!response.ok || !isPortfolioProject(projectData)) {
        setLoadError(labels.dialog.error);
        return;
      }

      setSelectedProject(projectData);
    } catch {
      setLoadError(labels.dialog.error);
    } finally {
      setLoadingProjectId(null);
    }
  };

  return (
    <>
      <div className={styles.projectGrid} aria-label={labels.viewAll}>
        {projects.map((project, index) => {
          const imageAlt = getImageAlt(labels.imageAlt, project.title);
          const isLoading = loadingProjectId === project.id;
          const projectLocation = project.location.trim() || project.province.trim();
          const completedYear = project.completionYear.trim();

          return (
            <article className={styles.project} key={project.id}>
              <button
                className={styles.projectButton}
                type="button"
                onClick={() => void handleSelect(project)}
                disabled={loadingProjectId !== null}
                aria-busy={isLoading}
                aria-label={`${labels.viewProject}: ${project.title}`}
              >
                <ProjectImage project={project} alt={imageAlt} />
                <span className={styles.projectCopy}>
                  <span className={styles.projectTopline}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {completedYear ? <span>{completedYear}</span> : null}
                  </span>
                  <span className={styles.projectTitle}>{project.title}</span>
                  <span className={styles.projectDetails}>
                    <span className={styles.projectDetail}>
                      <span className={styles.projectDetailLabel}>{labels.systemSize}</span>
                      <span>{project.solarSizeKw} kW</span>
                    </span>
                    {projectLocation ? (
                      <span className={styles.projectDetail}>
                        <span className={styles.projectDetailLabel}>{labels.location}</span>
                        <span>{projectLocation}</span>
                      </span>
                    ) : null}
                    {completedYear ? (
                      <span className={styles.projectDetail}>
                        <span className={styles.projectDetailLabel}>{labels.completed}</span>
                        <span>{completedYear}</span>
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.projectOpen}>
                    <span>{isLoading ? `${labels.viewProject}…` : labels.viewProject}</span>
                    <FiArrowUpRight aria-hidden="true" />
                  </span>
                </span>
              </button>
            </article>
          );
        })}
      </div>

      {loadError ? <p className={styles.projectError} role="status" aria-live="polite">{loadError}</p> : null}

      <Link className={styles.textLink} href={`/${locale}/works`}>
        {labels.viewAll} <FiArrowUpRight aria-hidden="true" className={styles.arrow} />
      </Link>

      {selectedProject ? (
        <ProjectDetailModal
          project={selectedProject}
          locale={locale}
          onClose={() => setSelectedProject(null)}
        />
      ) : null}
    </>
  );
}
