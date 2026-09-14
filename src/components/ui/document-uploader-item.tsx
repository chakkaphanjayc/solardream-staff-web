"use client";

import React, { useRef, useState, useTransition } from "react";
import {
  FileText,
  CheckCircle2,
  Trash2,
  Eye,
  Upload,
} from "@/components/ui/icons";
import { uploadProjectDocument, deleteProjectDocument } from "@/app/actions/tickets";
import { GsapSpinner } from "@/components/ui/GsapMotion";

interface ExistingDocument {
  id: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: Date | string;
}

interface DocumentUploaderItemProps {
  title: string;
  phase: number;
  department: string;
  documentGroup: string;
  jobTicketId: string;
  existingDocument?: ExistingDocument | null;
  onUploadSuccess?: () => void;
  onDeleteSuccess?: () => void;
}

export default function DocumentUploaderItem({
  title,
  phase,
  department,
  documentGroup,
  jobTicketId,
  existingDocument,
  onUploadSuccess,
  onDeleteSuccess,
}: DocumentUploaderItemProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("jobTicketId", jobTicketId);
    formData.append("phase", phase.toString());
    formData.append("department", department);
    formData.append("documentGroup", documentGroup);

    startTransition(async () => {
      const result = await uploadProjectDocument(formData);
      if (result.error) {
        setErrorMessage(result.error);
      } else {
        if (onUploadSuccess) onUploadSuccess();
      }
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDeleteClick = async () => {
    if (!existingDocument) return;
    setErrorMessage(null);

    startTransition(async () => {
      const result = await deleteProjectDocument(existingDocument.id);
      if (result.error) {
        setErrorMessage(result.error);
      } else {
        if (onDeleteSuccess) onDeleteSuccess();
      }
    });
  };

  const formattedDate = existingDocument
    ? new Date(existingDocument.uploadedAt).toLocaleDateString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="w-full space-y-2">
      {existingDocument ? (
        /* Uploaded State: Solid white card with subtle green checkmark */
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-black text-slate-400 uppercase tracking-wider">
                {title}
              </p>
              <h5 className="text-sm font-bold text-slate-800 truncate">
                {existingDocument.fileName}
              </h5>
              <p className="text-[10px] text-slate-400 font-bold">
                Uploaded: {formattedDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={existingDocument.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black bg-[#B7D1EA]/30 hover:bg-[#B7D1EA]/50 text-[#2C486A] transition-all border border-[#B7D1EA]/20"
            >
              <Eye className="w-4 h-4" />
              View Document
            </a>
            <button
              onClick={handleDeleteClick}
              disabled={isPending}
              className="inline-flex items-center justify-center p-2.5 rounded-xl text-xs font-black bg-rose-50 hover:bg-rose-100 text-rose-600 transition-all border border-rose-100 cursor-pointer disabled:opacity-50"
              title="Replace/Delete"
            >
              {isPending ? (
                <GsapSpinner className="w-4 h-4" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Empty State: Sleek, dashed-border dropzone */
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 hover:border-slate-350 rounded-2xl p-5 flex items-center justify-between gap-4 transition-all">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-400 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h5 className="text-sm font-bold text-slate-700 truncate">
                {title}
              </h5>
              <p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5 tracking-wider">
                Phase {phase} • {department} • {documentGroup}
              </p>
            </div>
          </div>

          <div>
            <button
              onClick={handleUploadClick}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black bg-[#B7D1EA] hover:bg-[#B7D1EA]/80 text-[#2C486A] transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isPending ? (
                <GsapSpinner className="w-4 h-4" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Upload File
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,image/png,image/jpeg,image/webp,image/heic,image/heif"
              className="hidden"
            />
          </div>
        </div>
      )}

      {errorMessage && (
        <p className="text-[11px] font-bold text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
