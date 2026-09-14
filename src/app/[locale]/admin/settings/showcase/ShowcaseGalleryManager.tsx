"use client";

import { useId, useRef, useState, useTransition, type DragEvent } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { uploadPortfolioShowcaseImage } from "@/app/actions/portfolioShowcase";
import {
  FileImage,
  Images,
  Link2,
  LoaderCircle,
  Plus,
  Star,
  Trash2,
  UploadCloud,
  X,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "@/types/portfolio";

const MAX_PORTFOLIO_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_GALLERY_PHOTOS = 48;

type ShowcaseGalleryManagerProps = Readonly<{
  projectId: string;
  images: readonly GalleryItem[];
  heroImage: string;
  onChange: (images: GalleryItem[]) => void;
  onSetAsCover?: (url: string) => void;
}>;

export default function ShowcaseGalleryManager({
  projectId,
  images,
  heroImage,
  onChange,
  onSetAsCover,
}: ShowcaseGalleryManagerProps) {
  const t = useTranslations("AdminShowcaseSettings");
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newCaption, setNewCaption] = useState("");

  const handleFiles = (fileList: FileList | File[] | null | undefined) => {
    if (!fileList || fileList.length === 0 || isPending) return;

    const filesArray = Array.from(fileList);
    const validFiles: File[] = [];

    for (const file of filesArray) {
      if (!ACCEPTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
        toast.error(`${file.name}: ${t("imageUploadTypeError")}`);
        continue;
      }
      if (file.size > MAX_PORTFOLIO_IMAGE_BYTES) {
        toast.error(`${file.name}: ${t("imageUploadSizeError")}`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    const remainingSlots = MAX_GALLERY_PHOTOS - images.length;
    const filesToUpload = validFiles.slice(0, remainingSlots);

    if (validFiles.length > remainingSlots) {
      toast.warning(`Added first ${remainingSlots} photos (max ${MAX_GALLERY_PHOTOS} photos reached).`);
    }

    startTransition(async () => {
      setUploadProgress({ current: 0, total: filesToUpload.length });
      const uploadedItems: GalleryItem[] = [];

      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        setUploadProgress({ current: i + 1, total: filesToUpload.length });

        const formData = new FormData();
        formData.set("file", file);

        try {
          const result = await uploadPortfolioShowcaseImage(projectId, formData);
          if (result.success) {
            uploadedItems.push({
              url: result.url,
              caption: file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
            });
          } else {
            toast.error(`${file.name}: ${result.error}`);
          }
        } catch {
          toast.error(`${file.name}: ${t("imageUploadError")}`);
        }
      }

      if (uploadedItems.length > 0) {
        onChange([...images, ...uploadedItems]);
        toast.success(t("photosUploaded", { count: uploadedItems.length }));
      }
      setUploadProgress(null);
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  const updateCaption = (index: number, caption: string) => {
    const next = images.map((item, idx) => (idx === index ? { ...item, caption } : item));
    onChange(next);
  };

  const removePhoto = (index: number) => {
    const next = images.filter((_, idx) => idx !== index);
    onChange(next);
  };

  const handleAddUrl = () => {
    if (!newUrl.trim()) return;
    if (images.length >= MAX_GALLERY_PHOTOS) {
      toast.error(`Maximum ${MAX_GALLERY_PHOTOS} gallery photos reached.`);
      return;
    }

    onChange([
      ...images,
      {
        url: newUrl.trim(),
        caption: newCaption.trim() || "Installation gallery photo",
      },
    ]);
    setNewUrl("");
    setNewCaption("");
    setIsUrlModalOpen(false);
    toast.success(t("imageUploaded"));
  };

  return (
    <div className="space-y-4">
      {/* Hidden Multi-file input */}
      <input
        ref={fileInputRef}
        id={`${inputId}-files`}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={isPending}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {/* Top Banner Multi-upload dropzone */}
      <div
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition-all",
          isDragging || isPending
            ? "border-[#58a6ff] bg-[#58a6ff]/10"
            : "border-[#30363d] bg-[#0d1117] hover:border-[#58a6ff]/60 hover:bg-[#161b22]/40"
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setIsDragging(false);
        }}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center gap-2">
          {uploadProgress ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <LoaderCircle className="size-6 animate-spin text-[#58a6ff]" />
              <span className="text-xs font-bold text-[#f0f6fc]">
                {t("uploadingCount", { current: uploadProgress.current, total: uploadProgress.total })}
              </span>
              <div className="h-1.5 w-48 overflow-hidden rounded-full bg-[#21262d]">
                <div
                  className="h-full bg-[#58a6ff] transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-lg border border-[#58a6ff]/30 bg-[#58a6ff]/10 text-[#58a6ff]">
                  <UploadCloud className="size-4" />
                </span>
                <span className="text-xs font-bold text-[#f0f6fc]">
                  {t("dropMultipleHint")}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isPending || images.length >= MAX_GALLERY_PHOTOS}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-[#238636] px-3.5 text-xs font-bold text-white transition-colors hover:bg-[#2ea043] disabled:opacity-50 shadow-sm"
                >
                  <Plus className="size-3.5" />
                  {t("uploadMultiple")}
                </button>

                <button
                  type="button"
                  onClick={() => setIsUrlModalOpen(!isUrlModalOpen)}
                  disabled={isPending || images.length >= MAX_GALLERY_PHOTOS}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#30363d] bg-[#21262d] px-3 text-xs font-semibold text-[#c9d1d9] transition-colors hover:border-[#58a6ff] hover:text-[#58a6ff]"
                >
                  <Link2 className="size-3.5" />
                  {t("addFromUrl")}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Add from URL Box */}
        {isUrlModalOpen ? (
          <div className="mt-3 flex w-full max-w-lg flex-col gap-2 rounded-lg border border-[#30363d] bg-[#161b22] p-3 text-left">
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="admin-showcase-input text-xs"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={newCaption}
                onChange={(e) => setNewCaption(e.target.value)}
                placeholder={t("captionPlaceholder")}
                className="admin-showcase-input text-xs flex-1"
              />
              <button
                type="button"
                onClick={handleAddUrl}
                className="rounded-lg bg-[#238636] px-3.5 text-xs font-bold text-white hover:bg-[#2ea043]"
              >
                {t("addPhotoToGallery")}
              </button>
              <button
                type="button"
                onClick={() => setIsUrlModalOpen(false)}
                className="rounded-lg border border-[#30363d] px-2.5 text-xs text-[#8b949e] hover:bg-[#21262d]"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Visual Photos Grid */}
      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((image, index) => {
            const isHero = image.url === heroImage;
            return (
              <div
                key={`${image.url}-${index}`}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-[#30363d] bg-[#0d1117] shadow-sm transition-all hover:border-[#58a6ff]/50"
              >
                {/* Thumbnail */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#010409]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.caption || `Gallery ${index + 1}`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0d1117]/80 via-transparent to-[#0d1117]/60" />

                  {/* Top Left Index / Cover Badge */}
                  <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-[#0d1117]/90 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#8b949e] backdrop-blur-sm border border-[#30363d]">
                    <span>#{index + 1}</span>
                    {isHero ? (
                      <span className="text-[#3fb950] font-sans text-[9px] font-bold uppercase">Cover</span>
                    ) : null}
                  </div>

                  {/* Top Right Actions */}
                  <div className="absolute right-1.5 top-1.5 flex items-center gap-1 opacity-90 transition-opacity group-hover:opacity-100">
                    {onSetAsCover && !isHero ? (
                      <button
                        type="button"
                        onClick={() => onSetAsCover(image.url)}
                        className="inline-flex size-6 items-center justify-center rounded-md border border-[#30363d] bg-[#0d1117]/90 text-[#8b949e] backdrop-blur-sm transition-colors hover:border-[#e3b341] hover:bg-[#e3b341]/20 hover:text-[#e3b341]"
                        title={t("setAsCover")}
                      >
                        <Star className="size-3" />
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="inline-flex size-6 items-center justify-center rounded-md border border-[#30363d] bg-[#0d1117]/90 text-[#8b949e] backdrop-blur-sm transition-colors hover:border-[#f85149] hover:bg-[#f85149]/20 hover:text-[#ff7b72]"
                      title={t("removeImage", { index: index + 1 })}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>

                {/* Caption Input */}
                <div className="p-2">
                  <input
                    value={image.caption}
                    onChange={(event) => updateCaption(index, event.target.value)}
                    placeholder={t("captionPlaceholder")}
                    className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-[#c9d1d9] placeholder:text-[#6e7681] hover:border-[#30363d] focus:border-[#58a6ff] focus:bg-[#161b22] focus:outline-none"
                  />
                </div>
              </div>
            );
          })}

          {/* Quick Add More Card at end of grid */}
          {images.length < MAX_GALLERY_PHOTOS ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
              className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#30363d] bg-[#0d1117]/50 text-[#8b949e] transition-all hover:border-[#58a6ff] hover:bg-[#58a6ff]/5 hover:text-[#58a6ff]"
            >
              <Plus className="size-5" />
              <span className="text-xs font-semibold">{t("addImage")}</span>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-6 text-center text-xs text-[#8b949e]">
          {t("noGalleryPhotos")}
        </div>
      )}
    </div>
  );
}
