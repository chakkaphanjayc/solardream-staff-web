"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileCheck2, FileUp, MapPin, Send, UploadCloud, UserRound } from "@/components/ui/icons";
import { gsap } from "gsap";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import { DocumentOnboardingSchema } from "@/schemas/analytics-crm";
import type { ClientDocumentAttachment, ClientDocumentRequest } from "@/types/proposals";
import { readJsonResponse } from "@/lib/readJsonResponse";

type UploadResponse = {
  success: boolean;
  error?: string;
  documentRequest?: ClientDocumentRequest;
  attachment?: ClientDocumentAttachment;
};

type InfoFields = Record<string, string>;
type UploadTask = {
  id: string;
  fileName: string;
  status: "uploading" | "complete" | "error";
  error?: string;
};

type DocumentRequestUploadGridProps = {
  proposalId: string;
  magicTokenSlug?: string | null;
  initialRequests: ClientDocumentRequest[];
  onRequestsChange?: (requests: ClientDocumentRequest[]) => void;
  variant?: "grid" | "compact";
};

function getRequiredPendingCount(requests: ClientDocumentRequest[]) {
  return requests.filter((request) => request.isRequired && request.status === "PENDING").length;
}

function getRequestTypeLabel(type: ClientDocumentRequest["requestType"]) {
  if (type === "LOCATION") return "GPS";
  if (type === "CONTACT_INFO") return "Contact";
  return "File";
}

function getRequestMetadataFields(value: unknown): InfoFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const metadata = value as Record<string, unknown>;
  const fields = metadata.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return {};

  return Object.entries(fields).reduce<InfoFields>((acc, [key, fieldValue]) => {
    if (typeof fieldValue === "string") {
      acc[key] = fieldValue;
    }
    return acc;
  }, {});
}

export function DocumentRequestUploadGrid({
  proposalId,
  magicTokenSlug,
  initialRequests,
  onRequestsChange,
  variant = "grid",
}: DocumentRequestUploadGridProps) {
  const t = useTranslations("DocumentRequestUploadGrid");
  const [requests, setRequests] = useState(initialRequests);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [infoForms, setInfoForms] = useState<Record<string, InfoFields>>(() =>
    Object.fromEntries(initialRequests.map((request) => [
      request.id,
      getRequestMetadataFields(request.metadata),
    ])),
  );
  const [uploadTasks, setUploadTasks] = useState<Record<string, UploadTask[]>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const gridRef = useRef<HTMLDivElement | null>(null);
  const pendingRequired = useMemo(() => getRequiredPendingCount(requests), [requests]);
  const prioritizedRequests = useMemo(() => [...requests].sort((left, right) => {
    const leftIsPendingRequired = left.isRequired && left.status === "PENDING";
    const rightIsPendingRequired = right.isRequired && right.status === "PENDING";
    if (leftIsPendingRequired !== rightIsPendingRequired) return leftIsPendingRequired ? -1 : 1;
    if (left.isRequired !== right.isRequired) return left.isRequired ? -1 : 1;
    return left.createdAt.localeCompare(right.createdAt);
  }), [requests]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const cards = gsap.utils.toArray<HTMLElement>("[data-document-request-card]", grid);
    if (!cards.length) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const context = gsap.context(() => {
      gsap.fromTo(
        cards,
        {
          autoAlpha: 0,
          y: prefersReducedMotion ? 0 : 15,
        },
        {
          autoAlpha: 1,
          y: 0,
          duration: prefersReducedMotion ? 0.08 : 0.3,
          stagger: prefersReducedMotion ? 0 : 0.05,
          ease: "power2.out",
        },
      );
    }, grid);

    return () => context.revert();
  }, [requests.length]);

  useEffect(() => {
    onRequestsChange?.(requests);
  }, [onRequestsChange, requests]);

  if (requests.length === 0) return null;

  const updateRequest = (updatedRequest: ClientDocumentRequest, attachment?: ClientDocumentAttachment) => {
    setRequests((current) => current.map((request) => {
      if (request.id !== updatedRequest.id) return request;
      const attachments = attachment
        ? [...(request.attachments || []), attachment]
        : request.attachments || updatedRequest.attachments;
      return { ...updatedRequest, attachments };
    }));
  };

  const setUploadTask = (requestId: string, task: UploadTask) => {
    setUploadTasks((current) => ({
      ...current,
      [requestId]: [...(current[requestId] || []).filter((item) => item.id !== task.id), task],
    }));
  };

  const uploadDocument = async (request: ClientDocumentRequest, file: File) => {
    const taskId = `${file.name}-${file.lastModified}-${crypto.randomUUID()}`;
    const parsed = DocumentOnboardingSchema.safeParse({
      proposalId,
      documentRequestId: request.id,
      magicTokenSlug,
      requestType: request.requestType,
      file,
    });

    if (!parsed.success) {
      const error = parsed.error.issues[0]?.message || "ไฟล์ไม่ถูกต้อง";
      setUploadTask(request.id, { id: taskId, fileName: file.name, status: "error", error });
      return;
    }

    setUploadTask(request.id, { id: taskId, fileName: file.name, status: "uploading" });
    const formData = new FormData();
    formData.set("proposal_id", proposalId);
    formData.set("document_request_id", request.id);
    if (magicTokenSlug) formData.set("magic_token_slug", magicTokenSlug);
    formData.set("file", file);

    try {
      const response = await fetch("/api/proposals/document-request-upload", {
        method: "POST",
        body: formData,
      });
      const payload = await readJsonResponse<UploadResponse>(response);
      if (!response.ok || !payload?.success || !payload.documentRequest) {
        throw new Error(payload?.error || "Upload failed");
      }
      updateRequest(payload.documentRequest, payload.attachment);
      setUploadTask(request.id, { id: taskId, fileName: file.name, status: "complete" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถอัปโหลดเอกสารได้";
      setUploadTask(request.id, { id: taskId, fileName: file.name, status: "error", error: message });
    }
  };

  const uploadDocuments = async (request: ClientDocumentRequest, files: File[]) => {
    for (const file of files) {
      await uploadDocument(request, file);
    }
    const input = inputRefs.current[request.id];
    if (input) input.value = "";
  };

  const updateInfoField = (requestId: string, key: string, value: string) => {
    setInfoForms((current) => ({
      ...current,
      [requestId]: {
        ...(current[requestId] || {}),
        [key]: value,
      },
    }));
  };

  const submitInfoRequest = (request: ClientDocumentRequest) => {
    const parsed = DocumentOnboardingSchema.safeParse({
      proposalId,
      documentRequestId: request.id,
      magicTokenSlug,
      requestType: request.requestType,
      fields: infoForms[request.id] || {},
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง");
      return;
    }

    setActiveRequestId(request.id);
    void (async () => {
      try {
        const response = await fetch("/api/proposals/document-request-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposalId,
            documentRequestId: request.id,
            magicTokenSlug,
            fields: infoForms[request.id] || {},
          }),
        });
        const payload = await readJsonResponse<UploadResponse>(response);

        if (!response.ok || !payload?.success || !payload.documentRequest) {
          throw new Error(payload?.error || "Save failed");
        }

        updateRequest(payload.documentRequest);
        toast.success(`บันทึก ${request.documentName} เรียบร้อยแล้ว`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "ไม่สามารถบันทึกข้อมูลได้");
      } finally {
        setActiveRequestId(null);
      }
    })();
  };

  return (
    <section className={cn(
      "relative z-0",
      variant === "grid"
        ? "overflow-hidden rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] p-4 shadow-sm md:p-6"
        : "space-y-3",
    )}>
      {/* Header Section */}
      {variant === "grid" ? (
        <div className="relative z-10 flex flex-col gap-3 rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC] p-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#4F7FA8]">
              {t("eyebrow")}
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-[-0.02em] text-[#2E2C27] sm:text-2xl">
              {t("title")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#4E4B44]">
              {t("description")}
            </p>
          </div>
          <div className={cn(
            "inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold shrink-0",
            pendingRequired > 0
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-[#CBC7BE] bg-[#DCE8F5] text-[#2E2C27]",
          )}>
            {pendingRequired > 0 ? t("requiredPending", { count: pendingRequired }) : t("readyToSign")}
          </div>
        </div>
      ) : null}

      {/* Responsive Grid Architecture */}
      <div ref={gridRef} className={cn(
        "relative z-10",
        variant === "grid"
          ? "mt-6 grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3"
          : "space-y-3",
      )}>
        {prioritizedRequests.map((request) => {
          const requestUploadTasks = uploadTasks[request.id] || [];
          const isUploading = requestUploadTasks.some((task) => task.status === "uploading");
          const uploadingCount = requestUploadTasks.filter((task) => task.status === "uploading").length;
          const isSavingInfo = activeRequestId === request.id;
          const isDone = request.status === "UPLOADED" || request.status === "APPROVED";
          const isInfoRequest = request.requestType === "LOCATION" || request.requestType === "CONTACT_INFO";
          const Icon = request.requestType === "LOCATION"
            ? MapPin
            : request.requestType === "CONTACT_INFO"
              ? UserRound
              : isDone
                ? FileCheck2
                : FileUp;

          return (
            <article
              key={request.id}
              data-document-request-card
              className={cn(
                "group relative z-10 flex flex-col rounded-[24px] border border-[#F7F6F3] bg-[#E6E3DC] p-5 shadow-sm transition-all duration-200 hover:shadow-md",
                variant === "grid" ? "h-full" : "p-4",
                isDone && "opacity-85 hover:opacity-100",
              )}
            >
              {/* Row 1: Top Icon (left) + Badges (right) */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors",
                  isDone
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-[#DCE8F5] text-[#4F7FA8]",
                )}>
                  <Icon className="h-5 w-5" />
                </div>

                {/* Badge Group */}
                <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                  <span className={cn(
                    "text-xs font-bold px-2.5 py-0.5 rounded-full border transition-colors",
                    request.isRequired
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-[#CBC7BE] bg-[#F0EEE9] text-[#4E4B44]",
                  )}>
                    {request.isRequired ? t("required") : t("optional")}
                  </span>
                  <span className={cn(
                    "text-xs font-bold px-2.5 py-0.5 rounded-full border transition-colors",
                    isDone
                      ? "bg-emerald-100 text-emerald-900 border-emerald-200"
                      : "bg-[#DCE8F5] text-[#2E2C27] border-[#CBC7BE]",
                  )}>
                    {isDone ? t("uploaded") : t("pending")}
                  </span>
                </div>
              </div>

              {/* Row 2: Document Title & Type (Full Card Width) */}
              <div className="w-full space-y-1">
                <h3 className="text-sm font-bold text-[#2E2C27] leading-snug break-words" title={request.documentName}>
                  {request.documentName}
                </h3>
                <p className="text-xs font-semibold text-[#4E4B44]">
                  {getRequestTypeLabel(request.requestType)}
                </p>
              </div>

              {/* Description Hint */}
              {request.descriptionHint ? (
                <p className="mt-3 break-words text-xs font-medium leading-relaxed text-[#4E4B44]">
                  {request.descriptionHint}
                </p>
              ) : null}

              {/* Flexible Form / Input Area */}
              <div className="mt-4 my-2 flex-1 flex flex-col justify-end">
                {isInfoRequest ? (
                  request.requestType === "LOCATION" ? (
                    <div className="space-y-3">
                      <input
                        value={infoForms[request.id]?.location || ""}
                        onChange={(event) => updateInfoField(request.id, "location", event.target.value)}
                        placeholder="Google Maps link หรือพิกัด GPS"
                        className="w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] px-3.5 py-2.5 text-sm font-semibold text-[#2E2C27] outline-none transition placeholder:text-[#4E4B44] focus:border-[#7CA8D0] focus:bg-[#F0EEE9]"
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <input
                        value={infoForms[request.id]?.name || ""}
                        onChange={(event) => updateInfoField(request.id, "name", event.target.value)}
                        placeholder="ชื่อผู้ติดต่อ"
                        className="w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] px-3.5 py-2.5 text-sm font-semibold text-[#2E2C27] outline-none transition placeholder:text-[#4E4B44] focus:border-[#7CA8D0] focus:bg-[#F0EEE9]"
                      />
                      <input
                        value={infoForms[request.id]?.phone || ""}
                        onChange={(event) => updateInfoField(request.id, "phone", event.target.value)}
                        placeholder="เบอร์โทรศัพท์"
                        className="w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] px-3.5 py-2.5 text-sm font-semibold text-[#2E2C27] outline-none transition placeholder:text-[#4E4B44] focus:border-[#7CA8D0] focus:bg-[#F0EEE9]"
                      />
                      <input
                        value={infoForms[request.id]?.lineId || ""}
                        onChange={(event) => updateInfoField(request.id, "lineId", event.target.value)}
                        placeholder="Line ID"
                        className="w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] px-3.5 py-2.5 text-sm font-semibold text-[#2E2C27] outline-none transition placeholder:text-[#4E4B44] focus:border-[#7CA8D0] focus:bg-[#F0EEE9]"
                      />
                    </div>
                  )
                ) : null}
              </div>

              {/* Action Button Anchoring */}
              <div className="mt-auto pt-4 flex flex-col gap-2 w-full">
                {isInfoRequest ? (
                  <button
                    type="button"
                    onClick={() => submitInfoRequest(request)}
                    disabled={isSavingInfo}
                    className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#B7D1EA] py-3 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#A5C2DE] active:scale-95 disabled:opacity-50"
                  >
                    {isSavingInfo ? <GsapSpinner className="h-4 w-4 text-white" /> : <Send className="h-4 w-4" />}
                    <span>{isDone ? "บันทึกข้อมูลใหม่" : "บันทึกข้อมูล"}</span>
                  </button>
                ) : (
                  <>
                    <input
                      ref={(node) => {
                        inputRefs.current[request.id] = node;
                      }}
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif"
                      className="hidden"
                      onChange={(event) => {
                        const files = Array.from(event.currentTarget.files || []);
                        void uploadDocuments(request, files);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => inputRefs.current[request.id]?.click()}
                      disabled={isUploading}
                      className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#B7D1EA] py-3 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#A5C2DE] active:scale-95 disabled:opacity-50"
                    >
                      {isUploading ? <GsapSpinner className="h-4 w-4 text-white" /> : <UploadCloud className="h-4 w-4" />}
                      <span>{isUploading ? `Uploading ${uploadingCount} file${uploadingCount === 1 ? "" : "s"}…` : isDone ? "เพิ่มไฟล์" : "อัปโหลดเอกสาร"}</span>
                    </button>
                    {request.fileUrl ? (
                      <a
                        href={request.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-center text-xs font-semibold text-[#4E4B44] underline underline-offset-4 transition hover:text-[#2E2C27] pt-1"
                      >
                        เปิดไฟล์ที่อัปโหลดแล้ว
                      </a>
                    ) : null}
                    {requestUploadTasks.length > 0 ? (
                      <ul className="mt-2 space-y-1.5 rounded-[16px] border border-[#F7F6F3] bg-[#F0EEE9] p-3 shadow-sm" aria-live="polite">
                        {requestUploadTasks.map((task) => (
                          <li key={task.id} className={cn(
                            "flex items-center gap-2 text-[11px] font-semibold",
                            task.status === "error" ? "text-rose-700" : task.status === "complete" ? "text-emerald-700" : "text-[#4E4B44]",
                          )}>
                            {task.status === "uploading" ? <GsapSpinner className="h-3.5 w-3.5 text-[#4F7FA8]" /> : task.status === "complete" ? <FileCheck2 className="h-3.5 w-3.5" /> : <FileUp className="h-3.5 w-3.5" />}
                            <span className="min-w-0 flex-1 truncate">{task.fileName}</span>
                            <span>{task.status === "uploading" ? "Uploading" : task.status === "complete" ? "Uploaded" : task.error || "Failed"}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {request.attachments && request.attachments.length > 1 ? (
                      <p className="pt-1 text-center text-[11px] font-medium text-[#4E4B44]">{request.attachments.length} files uploaded</p>
                    ) : null}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function hasPendingRequiredDocuments(requests: ClientDocumentRequest[]) {
  return getRequiredPendingCount(requests) > 0;
}
