"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSignature,
  MapPin,
  ShieldCheck,
  UserRound,
  X,
  XCircle,
} from "@/components/ui/icons";
import { toast } from "sonner";

import { reviewStageSubmission } from "@/app/actions/workflows";
import type { WorkflowFormField } from "@/lib/workflow-types";
import { GsapSpinner } from "@/components/ui/GsapMotion";

type Person = {
  id: string;
  name: string | null;
  fullName: string;
  email: string;
};

type Submission = {
  id: string;
  stageId: string;
  formData: unknown;
  gpsLocation: string | null;
  reviewStatus: string;
  rejectionReason: string | null;
  submittedAt: string | Date;
  reviewedAt: string | Date | null;
  isSkipped: boolean;
  skipReason: string | null;
  submitter: Person | null;
  reviewer: Person | null;
};

type Stage = {
  id: string;
  stageName: string;
  stepOrder: number;
  formSchema: unknown;
};

type WorkflowData = {
  id: string;
  status: string;
  startedAt: string | Date;
  completedAt: string | Date | null;
  currentStageId: string | null;
  template: {
    name: string;
    stages: Stage[];
  };
  formSubmissions: Submission[];
};

type TicketData = {
  id: string;
  status: string;
  quotation: {
    user: Person;
  };
  workflows: WorkflowData[];
};

function parseFields(value: unknown): WorkflowFormField[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (field): field is WorkflowFormField =>
      Boolean(
        field &&
          typeof field === "object" &&
          "id" in field &&
          "label" in field &&
          "type" in field &&
          "isRequired" in field,
      ),
  );
}

function formatDate(value: string | Date | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function personName(person: Person | null) {
  return person?.fullName || person?.name || person?.email || "Unknown user";
}

function getFormValue(formData: unknown, fieldId: string) {
  if (!formData || typeof formData !== "object" || Array.isArray(formData)) {
    return undefined;
  }
  return (formData as Record<string, unknown>)[fieldId];
}

export default function WorkflowAuditClient({ ticket }: { ticket: TicketData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [rejectSubmissionId, setRejectSubmissionId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const workflow = ticket.workflows[0];

  const stages = useMemo(
    () =>
      workflow
        ? [...workflow.template.stages].sort((a, b) => a.stepOrder - b.stepOrder)
        : [],
    [workflow],
  );

  const submissionsByStage = useMemo(() => {
    const grouped = new Map<string, Submission[]>();
    for (const submission of workflow?.formSubmissions || []) {
      const list = grouped.get(submission.stageId) || [];
      list.push(submission);
      grouped.set(submission.stageId, list);
    }
    return grouped;
  }, [workflow]);

  const review = (submissionId: string, decision: "APPROVED" | "REJECTED") => {
    startTransition(async () => {
      try {
        const result = await reviewStageSubmission(
          submissionId,
          decision,
          decision === "REJECTED" ? rejectionReason : undefined,
        );
        if (!result.success) {
          toast.error(result.error || "Could not save review.");
          return;
        }
        toast.success(decision === "APPROVED" ? "Stage approved." : "Stage returned to installer.");
        setRejectSubmissionId(null);
        setRejectionReason("");
        router.refresh();
      } catch (error) {
        console.error("Workflow stage review error:", error);
        toast.error("Could not save review. Please try again.");
      }
    });
  };

  if (!workflow) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-[#1E293B] bg-[#0F172A] p-8 text-center">
        <ShieldCheck className="mx-auto h-9 w-9 text-gray-500" />
        <h1 className="mt-3 text-lg font-bold text-gray-100">No workflow assigned</h1>
        <p className="mt-2 text-sm text-gray-400">
          Assign a workflow template before reviewing ISO evidence.
        </p>
      </div>
    );
  }

  const completedCount = stages.filter((stage) =>
    (submissionsByStage.get(stage.id) || []).some(
      (submission) => submission.reviewStatus !== "REJECTED",
    ),
  ).length;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="border-b border-[#1E293B] pb-5">
        <Link
          href={`/admin/job-tickets/${ticket.id}`}
          className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-bold text-gray-300 transition hover:bg-[#0B1121] focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]"
        >
          <ArrowLeft className="h-4 w-4" />
          Job ticket
        </Link>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#436A8C]">
              <ShieldCheck className="h-4 w-4" />
              ISO evidence review
            </div>
            <h1 className="mt-2 text-2xl font-bold text-gray-100">
              {workflow.template.name}
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              {personName(ticket.quotation.user)} · Ticket {ticket.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-[#1E293B] bg-[#0F172A] px-3 py-1.5 text-xs font-bold text-gray-300">
              {completedCount}/{stages.length} submitted
            </span>
            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                workflow.status === "COMPLETED"
                  ? "border-emerald-200 bg-emerald-500/10 text-emerald-700"
                  : "border-blue-200 bg-blue-500/10 text-blue-700"
              }`}
            >
              {workflow.status.replaceAll("_", " ")}
            </span>
          </div>
        </div>
      </header>

      <div className="mt-6">
        {stages.map((stage, stageIndex) => {
          const submissions = submissionsByStage.get(stage.id) || [];
          const fields = parseFields(stage.formSchema);
          const current = workflow.currentStageId === stage.id;
          const latest = submissions[0];

          return (
            <section
              key={stage.id}
              className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-3 pb-7"
            >
              {stageIndex < stages.length - 1 && (
                <div className="absolute bottom-0 left-[17px] top-9 w-px bg-slate-300" />
              )}
              <div
                className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 ${
                  latest?.isSkipped && latest.reviewStatus !== "APPROVED"
                    ? "border-amber-500 bg-amber-500/10 text-amber-700"
                    : latest?.reviewStatus === "APPROVED"
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : latest?.reviewStatus === "REJECTED"
                      ? "border-red-500 bg-red-500/10 text-red-600"
                      : latest
                        ? "border-amber-500 bg-amber-500/10 text-amber-700"
                        : current
                          ? "border-[#6F9CC2] bg-[#E6F0F8] text-[#315979]"
                          : "border-[#1E293B] bg-[#0F172A] text-gray-400"
                }`}
              >
                {latest?.reviewStatus === "APPROVED" ? (
                  <Check className="h-4 w-4" />
                ) : latest?.isSkipped ? (
                  <span className="text-[10px] font-black">DEV</span>
                ) : latest?.reviewStatus === "REJECTED" ? (
                  <X className="h-4 w-4" />
                ) : (
                  <span className="text-xs font-black">{stageIndex + 1}</span>
                )}
              </div>

              <div
                className={`min-w-0 overflow-hidden rounded-xl border ${
                  latest?.isSkipped
                    ? "border-amber-300 bg-amber-500/10"
                    : "border-[#1E293B] bg-[#0F172A]"
                }`}
              >
                <div className="flex flex-col gap-2 border-b border-[#1E293B] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-bold text-gray-100">
                      {stage.stageName}
                    </h2>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {submissions.length
                        ? `${submissions.length} submission${submissions.length > 1 ? "s" : ""}`
                        : current
                          ? "Waiting for installer submission"
                          : "Not reached"}
                    </p>
                  </div>
                  {latest && (
                    <span
                      className={`w-fit rounded-full border px-2.5 py-1 text-xs font-bold ${
                        latest.isSkipped && latest.reviewStatus !== "APPROVED"
                          ? "border-amber-300 bg-amber-100 text-amber-800"
                          : latest.reviewStatus === "APPROVED"
                          ? "border-emerald-200 bg-emerald-500/10 text-emerald-700"
                          : latest.reviewStatus === "REJECTED"
                            ? "border-red-200 bg-red-500/10 text-red-700"
                            : "border-amber-200 bg-amber-500/10 text-amber-700"
                      }`}
                    >
                      {latest.isSkipped && latest.reviewStatus !== "APPROVED"
                        ? "DEVIATION PENDING"
                        : latest.reviewStatus}
                    </span>
                  )}
                </div>

                {submissions.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-400">
                    No evidence has been submitted for this stage.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {submissions.map((submission, submissionIndex) => (
                      <article key={submission.id} className="p-4">
                        {submissionIndex > 0 && (
                          <p className="mb-3 text-xs font-bold text-gray-400">
                            Previous submission
                          </p>
                        )}
                        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-400">
                          <span className="inline-flex items-center gap-1.5">
                            <UserRound className="h-3.5 w-3.5" />
                            {personName(submission.submitter)}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 className="h-3.5 w-3.5" />
                            {formatDate(submission.submittedAt)}
                          </span>
                          {submission.gpsLocation && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(submission.gpsLocation)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 font-bold text-[#315979] hover:underline"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                              {submission.gpsLocation}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>

                        {submission.isSkipped && (
                          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-100 p-4">
                            <p className="text-sm font-bold text-amber-900">
                              ขั้นตอนนี้ถูกข้าม (ISO Deviation)
                            </p>
                            <p className="mt-2 text-sm leading-6 text-amber-900">
                              {submission.skipReason || "No skip reason recorded."}
                            </p>
                          </div>
                        )}

                        {!submission.isSkipped && (
                        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                          {fields.map((field) => {
                            const value = getFormValue(submission.formData, field.id);
                            const isMedia =
                              field.type === "PHOTO_UPLOAD" ||
                              field.type === "SIGNATURE";
                            return (
                              <div
                                key={field.id}
                                className={`rounded-lg bg-[#0B1121] p-3 ${
                                  isMedia ? "sm:col-span-2" : ""
                                }`}
                              >
                                <dt className="flex items-center gap-2 text-xs font-bold text-gray-400">
                                  {field.type === "PHOTO_UPLOAD" && <Camera className="h-3.5 w-3.5" />}
                                  {field.type === "SIGNATURE" && <FileSignature className="h-3.5 w-3.5" />}
                                  {field.label}
                                </dt>
                                <dd className="mt-2 text-sm font-semibold text-gray-100">
                                  {isMedia && typeof value === "string" ? (
                                    <button
                                      type="button"
                                      onClick={() => setLightboxUrl(value)}
                                      className="group relative block max-w-xs overflow-hidden rounded-lg border border-[#1E293B] bg-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#7FA8CC]"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={value}
                                        alt={field.label}
                                        className={`w-full object-contain ${
                                          field.type === "SIGNATURE" ? "h-32" : "aspect-[4/3]"
                                        }`}
                                      />
                                      <span className="absolute bottom-2 right-2 rounded-full bg-slate-950/80 px-2.5 py-1 text-[11px] font-bold text-white">
                                        View
                                      </span>
                                    </button>
                                  ) : field.type === "CHECKBOX" ? (
                                    <span className="inline-flex items-center gap-2 text-emerald-700">
                                      {value === true ? (
                                        <>
                                          <CheckCircle2 className="h-4 w-4" />
                                          Confirmed
                                        </>
                                      ) : (
                                        "Not confirmed"
                                      )}
                                    </span>
                                  ) : (
                                    String(value ?? "No response")
                                  )}
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                        )}

                        {submission.rejectionReason && (
                          <div className="mt-4 rounded-lg border border-red-200 bg-red-500/10 p-3">
                            <p className="text-xs font-bold text-red-800">Rejection reason</p>
                            <p className="mt-1 text-sm text-red-700">
                              {submission.rejectionReason}
                            </p>
                          </div>
                        )}

                        {submission.reviewedAt && (
                          <p className="mt-3 text-xs text-gray-400">
                            Reviewed by {personName(submission.reviewer)} on{" "}
                            {formatDate(submission.reviewedAt)}
                          </p>
                        )}

                        {submission.reviewStatus === "PENDING" && submissionIndex === 0 && (
                          <div className="mt-4 flex flex-col gap-2 border-t border-[#1E293B] pt-4 sm:flex-row sm:justify-end">
                            {!submission.isSkipped && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectSubmissionId(submission.id);
                                  setRejectionReason("");
                                }}
                                disabled={isPending}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-red-300 bg-[#0F172A] px-4 text-sm font-bold text-red-700 transition hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-60"
                              >
                                <XCircle className="h-4 w-4" />
                                Reject stage
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => review(submission.id, "APPROVED")}
                              disabled={isPending}
                              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold text-white transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 ${
                                submission.isSkipped
                                  ? "bg-amber-600 hover:bg-amber-700 focus:ring-amber-300"
                                  : "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-300"
                              }`}
                            >
	                              {isPending ? (
	                                <GsapSpinner className="h-4 w-4" />
	                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              {submission.isSkipped ? "Acknowledge deviation" : "Approve stage"}
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Evidence preview"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#0F172A] text-gray-100"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Workflow evidence"
            className="max-h-[88vh] max-w-full rounded-lg bg-[#0F172A] object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}

      {rejectSubmissionId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg rounded-xl bg-[#0F172A] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="reject-title" className="text-lg font-bold text-gray-100">
                  Reject stage submission
                </h2>
                <p className="mt-1 text-sm leading-6 text-gray-400">
                  The installer will return to this stage and receive your correction note.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejectSubmissionId(null)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-[#0B1121]"
                aria-label="Close reject dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="mt-5 block">
              <span className="mb-1.5 block text-sm font-bold text-gray-100">
                Reason for rejection
              </span>
              <textarea
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                rows={5}
                autoFocus
                placeholder="Describe what must be corrected or photographed again."
                className="w-full resize-y rounded-lg border border-[#1E293B] bg-[#0B1121] px-3.5 py-3 text-sm text-gray-100 outline-none placeholder:text-gray-400 focus:border-red-400 focus:ring-2 focus:ring-red-200"
              />
            </label>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setRejectSubmissionId(null)}
                className="min-h-11 rounded-full border border-[#1E293B] px-5 text-sm font-bold text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => review(rejectSubmissionId, "REJECTED")}
                disabled={isPending || rejectionReason.trim().length < 3}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              >
	                {isPending && <GsapSpinner className="h-4 w-4" />}
                Reject and return stage
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
