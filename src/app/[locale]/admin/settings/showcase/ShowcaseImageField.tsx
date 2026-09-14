"use client";

import { useId, useRef, useState, useTransition, type DragEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { uploadPortfolioShowcaseImage } from "@/app/actions/portfolioShowcase";
import { FileImage, LoaderCircle, UploadCloud, X } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const MAX_PORTFOLIO_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ShowcaseImageFieldProps = Readonly<{
  projectId: string;
  value: string;
  alt: string;
  required?: boolean;
  onChange: (value: string) => void;
  onClear?: () => void;
}>;

function PreviewState({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 bg-[#0d1117] p-6 text-center text-[#8b949e]">
      <FileImage className="size-7 text-[#58a6ff]" aria-hidden="true" />
      <span className="text-xs font-medium">{children}</span>
    </div>
  );
}

export default function ShowcaseImageField({
  projectId,
  value,
  alt,
  required = false,
  onChange,
  onClear,
}: ShowcaseImageFieldProps) {
  const t = useTranslations("AdminShowcaseSettings");
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  const handleFile = (file: File | undefined) => {
    if (!file || isPending) return;

    if (!ACCEPTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
      const message = t("imageUploadTypeError");
      setError(message);
      toast.error(message);
      return;
    }

    if (file.size > MAX_PORTFOLIO_IMAGE_BYTES) {
      const message = t("imageUploadSizeError");
      setError(message);
      toast.error(message);
      return;
    }

    setError("");
    setPreviewError(false);
    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      try {
        const result = await uploadPortfolioShowcaseImage(projectId, formData);
        if (!result.success) {
          setError(result.error);
          toast.error(result.error);
          return;
        }

        onChange(result.url);
        setUploadedFileName(result.fileName);
        setDimensions({ width: result.width, height: result.height });
        toast.success(t("imageUploaded"));
      } catch (uploadError: unknown) {
        const message = uploadError instanceof Error ? uploadError.message : t("imageUploadError");
        setError(message);
        toast.error(message);
      }
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files[0]);
  };

  const handleClear = () => {
    setError("");
    setPreviewError(false);
    setUploadedFileName("");
    setDimensions(null);
    onClear?.();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "rounded-md border border-dashed p-4 transition-colors",
          isPending || isDragging
            ? "border-[#58a6ff] bg-[#58a6ff]/10"
            : "border-[#30363d] bg-[#0d1117] hover:border-[#58a6ff]/70",
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
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-md border border-[#58a6ff]/40 bg-[#58a6ff]/10 text-[#79c0ff]">
            {isPending ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <UploadCloud className="size-5" aria-hidden="true" />}
          </span>
          <div className="text-sm font-semibold text-[#f0f6fc]">
            {isPending ? t("imageUploading") : value ? t("imageReplace") : t("imageChoose")}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
            className="inline-flex min-h-9 items-center justify-center rounded-md bg-[#238636] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#2ea043] disabled:cursor-wait disabled:opacity-60"
          >
            {isPending ? t("imageUploading") : t("imageChooseButton")}
          </button>
          <div className="text-[11px] text-[#8b949e]">{t("imageDropHint")}</div>
        </div>
      </div>

      <div>
        <label htmlFor={`${inputId}-url`} className="mb-1.5 block text-[11px] font-semibold text-[#8b949e]">
          {t("imageUrl")}
        </label>
        <input
          id={`${inputId}-url`}
          type="url"
          value={value}
          required={required}
          onChange={(event) => {
            setError("");
            setUploadedFileName("");
            setDimensions(null);
            onChange(event.target.value);
          }}
          placeholder="https://..."
          className="admin-showcase-input"
        />
        <div className="mt-1 text-[10px] leading-5 text-[#8b949e]">{t("imageUrlHint")}</div>
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-[#f85149]/40 bg-[#f85149]/10 px-3 py-2 text-xs font-medium text-[#ff7b72]">
          {error}
        </div>
      ) : null}

      {value ? (
        <div className="overflow-hidden rounded-md border border-[#30363d] bg-[#010409]">
          <div className="flex items-center justify-between gap-3 border-b border-[#30363d] px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <FileImage className="size-4 shrink-0 text-[#58a6ff]" aria-hidden="true" />
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-[#c9d1d9]">
                  {uploadedFileName || t("imageCurrent")}
                </div>
                <div className="text-[10px] text-[#8b949e]">
                  {dimensions ? t("imageDimensions", dimensions) : t("imageUrlSource")}
                </div>
              </div>
            </div>
            {onClear ? (
              <button
                type="button"
                onClick={handleClear}
                disabled={isPending}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-[#8b949e] transition-colors hover:border-[#f85149]/40 hover:bg-[#f85149]/10 hover:text-[#ff7b72] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t("imageRemove")}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <div className="relative aspect-[16/10] max-h-64 bg-[#0d1117]">
            {previewError ? (
              <PreviewState>{t("imagePreviewError")}</PreviewState>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={value}
                alt={alt}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                onError={() => setPreviewError(true)}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
