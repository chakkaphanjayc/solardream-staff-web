"use client";

import { useId, useRef, useState, useTransition, type DragEvent } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { uploadPortfolioShowcaseImage } from "@/app/actions/portfolioShowcase";
import {
  FileImage,
  Link2,
  LoaderCircle,
  Pencil,
  Trash2,
  UploadCloud,
  X,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const MAX_PORTFOLIO_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ShowcaseCoverUploaderProps = Readonly<{
  projectId: string;
  value: string;
  alt: string;
  onChange: (value: string) => void;
  onClear?: () => void;
}>;

export default function ShowcaseCoverUploader({
  projectId,
  value,
  alt,
  onChange,
  onClear,
}: ShowcaseCoverUploaderProps) {
  const t = useTranslations("AdminShowcaseSettings");
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const [isUrlEditing, setIsUrlEditing] = useState(false);
  const [urlInput, setUrlInput] = useState(value);
  const [previewError, setPreviewError] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  const handleFile = (file: File | undefined) => {
    if (!file || isPending) return;

    if (!ACCEPTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
      toast.error(t("imageUploadTypeError"));
      return;
    }

    if (file.size > MAX_PORTFOLIO_IMAGE_BYTES) {
      toast.error(t("imageUploadSizeError"));
      return;
    }

    setPreviewError(false);
    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      try {
        const result = await uploadPortfolioShowcaseImage(projectId, formData);
        if (!result.success) {
          toast.error(result.error);
          return;
        }

        onChange(result.url);
        setUrlInput(result.url);
        setDimensions({ width: result.width, height: result.height });
        toast.success(t("imageUploaded"));
      } catch (uploadError: unknown) {
        const message = uploadError instanceof Error ? uploadError.message : t("imageUploadError");
        toast.error(message);
      }
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files[0]);
  };

  const handleSaveUrl = () => {
    if (!urlInput.trim()) {
      onClear?.();
      setIsUrlEditing(false);
      return;
    }
    onChange(urlInput.trim());
    setIsUrlEditing(false);
    setPreviewError(false);
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        id={`${inputId}-file`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={isPending}
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {value && !previewError ? (
        <div className="group relative overflow-hidden rounded-xl border border-[#30363d] bg-[#010409]">
          {/* Main Visual Image Card */}
          <div className="relative aspect-[16/9] max-h-72 w-full overflow-hidden bg-[#0d1117]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={alt || t("coverPhoto")}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              loading="lazy"
              decoding="async"
              onError={() => setPreviewError(true)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0d1117]/80 via-transparent to-[#0d1117]/60" />

            {/* Top Left Badge */}
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-[#0d1117]/90 px-2.5 py-1 text-xs font-bold text-[#58a6ff] backdrop-blur-sm border border-[#30363d]">
              <span>{t("coverPhoto")}</span>
              {dimensions ? (
                <span className="font-normal text-[#8b949e]">({dimensions.width}×{dimensions.height})</span>
              ) : null}
            </div>

            {/* Top Right Quick Actions */}
            <div className="absolute right-3 top-3 flex items-center gap-1.5 opacity-90 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#30363d] bg-[#0d1117]/90 px-2.5 text-xs font-semibold text-[#f0f6fc] backdrop-blur-sm transition-colors hover:border-[#58a6ff] hover:bg-[#21262d] hover:text-[#58a6ff]"
              >
                {isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
                <span>{t("replaceCover")}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsUrlEditing(!isUrlEditing)}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-[#30363d] bg-[#0d1117]/90 text-[#8b949e] backdrop-blur-sm transition-colors hover:border-[#58a6ff] hover:bg-[#21262d] hover:text-[#58a6ff]"
                title={t("addFromUrl")}
              >
                <Pencil className="size-3.5" />
              </button>

              {onClear ? (
                <button
                  type="button"
                  onClick={onClear}
                  disabled={isPending}
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-[#30363d] bg-[#0d1117]/90 text-[#8b949e] backdrop-blur-sm transition-colors hover:border-[#f85149] hover:bg-[#f85149]/20 hover:text-[#ff7b72]"
                  title={t("imageRemove")}
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Collapsible URL Editor */}
          {isUrlEditing ? (
            <div className="border-t border-[#30363d] bg-[#161b22] p-3">
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                  placeholder="https://..."
                  className="admin-showcase-input text-xs"
                />
                <button
                  type="button"
                  onClick={handleSaveUrl}
                  className="rounded-lg bg-[#238636] px-3 text-xs font-bold text-white hover:bg-[#2ea043]"
                >
                  {t("saveChanges")}
                </button>
                <button
                  type="button"
                  onClick={() => setIsUrlEditing(false)}
                  className="rounded-lg border border-[#30363d] px-2.5 text-xs text-[#8b949e] hover:bg-[#21262d]"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        /* Empty / Dropzone State */
        <div
          className={cn(
            "relative flex min-h-44 flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all",
            isDragging || isPending
              ? "border-[#58a6ff] bg-[#58a6ff]/10"
              : "border-[#30363d] bg-[#0d1117] hover:border-[#58a6ff]/60 hover:bg-[#161b22]/50"
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
            <span className="flex size-12 items-center justify-center rounded-xl border border-[#58a6ff]/30 bg-[#58a6ff]/10 text-[#58a6ff]">
              {isPending ? (
                <LoaderCircle className="size-6 animate-spin" />
              ) : (
                <UploadCloud className="size-6" />
              )}
            </span>
            <div className="text-sm font-bold text-[#f0f6fc]">
              {isPending ? t("imageUploading") : t("coverPhoto")}
            </div>
            <p className="text-xs text-[#8b949e]">
              {t("imageDropHint")}
            </p>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-[#238636] px-3.5 text-xs font-bold text-white transition-colors hover:bg-[#2ea043] disabled:opacity-60 shadow-sm"
              >
                <UploadCloud className="size-3.5" />
                {t("imageChooseButton")}
              </button>

              <button
                type="button"
                onClick={() => setIsUrlEditing(!isUrlEditing)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#30363d] bg-[#21262d] px-3 text-xs font-semibold text-[#c9d1d9] transition-colors hover:border-[#58a6ff] hover:text-[#58a6ff]"
              >
                <Link2 className="size-3.5" />
                {t("addFromUrl")}
              </button>
            </div>

            {isUrlEditing ? (
              <div className="mt-3 flex w-full max-w-md gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                  placeholder="https://..."
                  className="admin-showcase-input text-xs"
                />
                <button
                  type="button"
                  onClick={handleSaveUrl}
                  className="shrink-0 rounded-lg bg-[#238636] px-3 text-xs font-bold text-white hover:bg-[#2ea043]"
                >
                  OK
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
