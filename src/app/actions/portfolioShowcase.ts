"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath, revalidateTag } from "next/cache";

import { checkAdmin } from "@/app/actions/auth";
import { saveSystemSetting, saveSystemSettings } from "@/app/actions/systemSettings";
import { validateUploadFile } from "@/lib/fileValidation";
import { createAdminClient } from "@/utils/supabase/server";
import {
  getPortfolioProjectContentConfig,
  getPortfolioShowcaseConfig,
  normalizePortfolioShowcaseConfig,
  normalizePortfolioProjectContentConfig,
  PORTFOLIO_PROJECT_CONTENT_CACHE_TAG,
  PORTFOLIO_PROJECT_CONTENT_CONFIG_KEY,
  PORTFOLIO_SHOWCASE_CACHE_TAG,
  PORTFOLIO_SHOWCASE_CONFIG_KEY,
} from "@/lib/portfolioShowcase";
import type { PortfolioShowcaseConfig, ProjectCaseStudy } from "@/types/portfolio";

const PORTFOLIO_IMAGE_STORAGE_BUCKET = "proposals";
const MAX_PORTFOLIO_IMAGE_BYTES = 10 * 1024 * 1024;

export type PortfolioShowcaseImageUploadResult =
  | {
      success: true;
      url: string;
      fileName: string;
      width: number;
      height: number;
    }
  | {
      success: false;
      error: string;
    };

export async function savePortfolioShowcaseConfig(
  input: PortfolioShowcaseConfig,
): Promise<{ success: boolean; config?: PortfolioShowcaseConfig; error?: string }> {
  try {
    await checkAdmin();

    if (!input || typeof input !== "object" || !Array.isArray(input.items)) {
      return { success: false, error: "Invalid showcase configuration." };
    }

    const config = normalizePortfolioShowcaseConfig(input);
    const result = await saveSystemSetting(PORTFOLIO_SHOWCASE_CONFIG_KEY, JSON.stringify(config));
    if (!result.success) return result;

    revalidateTag(PORTFOLIO_SHOWCASE_CACHE_TAG, "max");
    revalidatePath("/", "layout");
    revalidatePath("/en");
    revalidatePath("/th");
    revalidatePath("/en/admin/settings/showcase");
    revalidatePath("/th/admin/settings/showcase");

    return { success: true, config };
  } catch (error) {
    console.error("[Portfolio Showcase Save] Failed to save configuration:", error);
    return {
      success: false,
      error: "Showcase configuration could not be saved.",
    };
  }
}

export async function savePortfolioProject(
  input: ProjectCaseStudy,
): Promise<{ success: boolean; project?: ProjectCaseStudy; error?: string }> {
  try {
    await checkAdmin();

    if (!input || typeof input !== "object" || typeof input.id !== "string") {
      return { success: false, error: "Invalid installation project." };
    }

    const normalizedId = input.id.trim();
    if (!normalizedId || !/^[a-zA-Z0-9_-]{2,80}$/.test(normalizedId)) {
      return { success: false, error: "Project ID must contain only alphanumeric characters, dashes, or underscores (2-80 characters)." };
    }

    const [currentContent, currentShowcase] = await Promise.all([
      getPortfolioProjectContentConfig(),
      getPortfolioShowcaseConfig(),
    ]);

    const isExisting = currentContent.projects.some((project) => project.id === normalizedId);
    const updatedProject: ProjectCaseStudy = { ...input, id: normalizedId };

    const nextProjects = isExisting
      ? currentContent.projects.map((project) => (project.id === normalizedId ? updatedProject : project))
      : [updatedProject, ...currentContent.projects];

    const nextRemovedIds = (currentContent.removedProjectIds ?? []).filter((id) => id !== normalizedId);

    const contentConfig = normalizePortfolioProjectContentConfig({
      version: 1,
      projects: nextProjects,
      removedProjectIds: nextRemovedIds,
    });

    const isFeaturedInInput = updatedProject.isFeatured === true;
    const existingShowcaseItem = currentShowcase.items.find((item) => item.projectId === normalizedId);
    const nextShowcaseItems = isExisting && existingShowcaseItem
      ? currentShowcase.items.map((item) => (
          item.projectId === normalizedId
            ? { ...item, isFeatured: updatedProject.isFeatured ?? item.isFeatured }
            : item
        ))
      : [
          {
            projectId: normalizedId,
            isFeatured: isFeaturedInInput,
            sortOrder: 0,
          },
          ...currentShowcase.items.map((item, idx) => ({ ...item, sortOrder: idx + 1 })),
        ];

    const showcaseConfig = normalizePortfolioShowcaseConfig({
      ...currentShowcase,
      items: nextShowcaseItems,
    });

    const result = await saveSystemSettings([
      { key: PORTFOLIO_PROJECT_CONTENT_CONFIG_KEY, value: JSON.stringify(contentConfig) },
      { key: PORTFOLIO_SHOWCASE_CONFIG_KEY, value: JSON.stringify(showcaseConfig) },
    ]);
    if (!result.success) return result;

    revalidateTag(PORTFOLIO_PROJECT_CONTENT_CACHE_TAG, "max");
    revalidateTag(PORTFOLIO_SHOWCASE_CACHE_TAG, "max");
    revalidatePath("/", "layout");
    revalidatePath("/en");
    revalidatePath("/th");
    revalidatePath("/en/works");
    revalidatePath("/th/works");
    revalidatePath("/en/admin/settings/showcase");
    revalidatePath("/th/admin/settings/showcase");

    return {
      success: true,
      project: contentConfig.projects.find((project) => project.id === normalizedId),
    };
  } catch (error) {
    console.error("[Portfolio Project Save] Failed to save installation project:", error);
    return {
      success: false,
      error: "Installation project could not be saved.",
    };
  }
}

export async function removePortfolioProject(
  projectId: string,
): Promise<{ success: boolean; projectId?: string; error?: string }> {
  try {
    await checkAdmin();

    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      return { success: false, error: "Invalid installation project." };
    }

    const [currentContent, currentShowcase] = await Promise.all([
      getPortfolioProjectContentConfig(),
      getPortfolioShowcaseConfig(),
    ]);
    if (!currentContent.projects.some((project) => project.id === normalizedProjectId)) {
      return { success: false, error: "Installation project was not found." };
    }

    const contentConfig = normalizePortfolioProjectContentConfig({
      version: 1,
      projects: currentContent.projects.filter((project) => project.id !== normalizedProjectId),
      removedProjectIds: [...(currentContent.removedProjectIds ?? []), normalizedProjectId],
    });
    const showcaseConfig = normalizePortfolioShowcaseConfig({
      ...currentShowcase,
      items: currentShowcase.items.filter((item) => item.projectId !== normalizedProjectId),
    });
    const result = await saveSystemSettings([
      { key: PORTFOLIO_PROJECT_CONTENT_CONFIG_KEY, value: JSON.stringify(contentConfig) },
      { key: PORTFOLIO_SHOWCASE_CONFIG_KEY, value: JSON.stringify(showcaseConfig) },
    ]);
    if (!result.success) return result;

    revalidateTag(PORTFOLIO_PROJECT_CONTENT_CACHE_TAG, "max");
    revalidateTag(PORTFOLIO_SHOWCASE_CACHE_TAG, "max");
    revalidatePath("/", "layout");
    revalidatePath("/en");
    revalidatePath("/th");
    revalidatePath("/en/works");
    revalidatePath("/th/works");
    revalidatePath("/en/admin/settings/showcase");
    revalidatePath("/th/admin/settings/showcase");

    return { success: true, projectId: normalizedProjectId };
  } catch (error) {
    console.error("[Portfolio Project Remove] Failed to remove installation project:", error);
    return {
      success: false,
      error: "Installation project could not be removed.",
    };
  }
}

export async function uploadPortfolioShowcaseImage(
  projectId: string,
  formData: FormData,
): Promise<PortfolioShowcaseImageUploadResult> {
  try {
    await checkAdmin();

    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId || !/^[a-zA-Z0-9_-]{1,80}$/.test(normalizedProjectId)) {
      return { success: false, error: "Invalid installation project identifier." };
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "Please choose an installation image." };
    }

    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: ["jpeg", "png", "webp"],
      fallbackName: "installation-image",
      maxBytes: MAX_PORTFOLIO_IMAGE_BYTES,
    });
    const bytes = Buffer.from(await file.arrayBuffer());
    const { default: sharp } = await import("sharp");
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height) {
      return { success: false, error: "The installation image dimensions could not be read." };
    }

    const storagePath = `portfolio-showcase/${normalizedProjectId}/${randomUUID()}.${validatedFile.extension}`;
    const storage = createAdminClient();
    const upload = await storage.storage.from(PORTFOLIO_IMAGE_STORAGE_BUCKET).upload(storagePath, bytes, {
      contentType: validatedFile.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (upload.error) {
      console.error("[Portfolio Showcase Image] Supabase upload failed:", upload.error);
      return { success: false, error: "The installation image could not be uploaded." };
    }

    const { data: publicUrlData } = storage.storage
      .from(PORTFOLIO_IMAGE_STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    return {
      success: true,
      url: publicUrlData.publicUrl,
      fileName: validatedFile.safeFileName,
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error: unknown) {
    console.error("[Portfolio Showcase Image] Upload failed:", error);
    return {
      success: false,
      error: "The installation image could not be uploaded.",
    };
  }
}
