"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import SignatureCanvas from "react-signature-canvas";
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  FileSignature,
  LocateFixed,
  Lock,
  RotateCcw,
  Send,
  SkipForward,
  TextCursorInput,
  Upload,
  X,
} from "@/components/ui/icons";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { skipWorkflowStage, submitStageForm, uploadWorkflowEvidence } from "@/app/actions/workflows";
import type { WorkflowFormField } from "@/lib/workflow-types";
import { GsapSpinner } from "@/components/ui/GsapMotion";

type Stage = {
  id: string;
  stageName: string;
  stepOrder: number;
  formSchema: unknown;
};

type Submission = {
  id: string;
  stageId: string;
  reviewStatus: string;
  rejectionReason: string | null;
  submittedAt: string | Date;
};

type WorkflowData = {
  id: string;
  status: string;
  currentStageId: string | null;
  template: {
    name: string;
    stages: Stage[];
  };
  formSubmissions: Submission[];
};

type TicketData = {
  id: string;
  quotation: {
    user: {
      name: string | null;
      email: string;
    };
  };
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

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

export default function WorkflowExecutionClient({
  ticket,
  workflow,
}: {
  ticket: TicketData;
  workflow: WorkflowData;
}) {
  const t = useTranslations("InstallerWorkflow");
  const router = useRouter();
  const signatureRefs = useRef<Record<string, SignatureCanvas | null>>({});
  const [isPending, startTransition] = useTransition();
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isValid },
  } = useForm<Record<string, unknown>>({
    mode: "onChange",
    defaultValues: {},
  });
  const formValues = useWatch({ control });

  const stages = [...workflow.template.stages].sort(
    (a, b) => a.stepOrder - b.stepOrder,
  );
  const currentStageIndex = stages.findIndex(
    (stage) => stage.id === workflow.currentStageId,
  );
  const currentStage = currentStageIndex >= 0 ? stages[currentStageIndex] : null;
  const fields = parseFields(currentStage?.formSchema);
  const completedStageIds = new Set(
    workflow.formSubmissions
      .filter((submission) => submission.reviewStatus !== "REJECTED")
      .map((submission) => submission.stageId),
  );
  const latestRejected = currentStage
    ? workflow.formSubmissions.find(
        (submission) =>
          submission.stageId === currentStage.id &&
          submission.reviewStatus === "REJECTED",
      )
    : undefined;

  const uploadEvidence = async (fieldId: string, file: File) => {
    if (!currentStage) {
      toast.error(t("noActiveStage"));
      return;
    }

    setUploadingField(fieldId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadWorkflowEvidence(
        workflow.id,
        currentStage.id,
        fieldId,
        "photo",
        formData,
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      setValue(fieldId, result.url, { shouldValidate: true, shouldDirty: true });
      toast.success(t("photoUploaded"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("photoUploadFailed"));
    } finally {
      setUploadingField(null);
    }
  };

  const saveSignature = async (fieldId: string) => {
    if (!currentStage) {
      toast.error(t("noActiveStage"));
      return;
    }

    const canvas = signatureRefs.current[fieldId];
    if (!canvas || canvas.isEmpty()) {
      toast.error(t("addSignature"));
      return;
    }

    setUploadingField(fieldId);
    try {
      const blob = await dataUrlToBlob(canvas.toDataURL("image/png"));
      const formData = new FormData();
      formData.append("file", blob, "signature.png");
      const result = await uploadWorkflowEvidence(
        workflow.id,
        currentStage.id,
        fieldId,
        "signature",
        formData,
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      setValue(fieldId, result.url, { shouldValidate: true, shouldDirty: true });
      toast.success(t("signatureSaved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("signatureUploadFailed"));
    } finally {
      setUploadingField(null);
    }
  };

  const requestLocation = () =>
    new Promise<string>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error(t("geoUnsupported")));
        return;
      }

      setGpsStatus(t("capturingLocation"));
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = `${position.coords.latitude.toFixed(7)},${position.coords.longitude.toFixed(7)}`;
          setGpsStatus(`GPS captured: ${location}`);
          resolve(location);
        },
        () => {
          setGpsStatus(null);
          reject(new Error(t("allowLocation")));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });

  const onSubmit = (data: Record<string, unknown>) => {
    if (!currentStage) return;

    startTransition(async () => {
      try {
        const location = await requestLocation();
        const result = await submitStageForm(
          workflow.id,
          currentStage.id,
          data,
          location,
        );
        if (!result.success || !("completed" in result)) {
          toast.error(result.error || t("submitFailed"));
          return;
        }
        toast.success(result.completed ? t("workflowCompleted") : t("stageSubmitted"));
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("gpsFailed"));
      }
    });
  };

  const handleSkip = () => {
    if (!currentStage || skipReason.trim().length < 5) return;

    startTransition(async () => {
      let location: string | undefined;
      try {
        location = await requestLocation();
      } catch {
        setGpsStatus(t("gpsUnavailable"));
      }

      const result = await skipWorkflowStage(
        workflow.id,
        currentStage.id,
        skipReason,
        location,
      );
      if (!result.success || !("completed" in result)) {
        toast.error(result.error || t("skipFailed"));
        return;
      }

      toast.success(
        result.completed
          ? t("skippedCompleted")
          : t("skippedRecorded"),
      );
      setShowSkipDialog(false);
      setSkipReason("");
      router.refresh();
    });
  };

  return (
    <main className="min-h-dvh bg-[#F0EEE9] px-4 pb-24 pt-4 text-slate-950">
      <div className="mx-auto max-w-xl">
        <header className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-[#F0EEE9]/95 px-4 pb-4 pt-2 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/installer"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7FA8CC]"
              aria-label="Back to installer jobs"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-slate-600">
                {workflow.template.name}
              </p>
              <h1 className="truncate text-lg font-bold">
                {ticket.quotation.user.name || ticket.quotation.user.email}
              </h1>
            </div>
            <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700">
              {workflow.status === "COMPLETED"
                ? "Complete"
                : `${currentStageIndex + 1}/${stages.length}`}
            </span>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-[#6F9CC2] transition-[width] duration-200"
              style={{
                width: `${
                  workflow.status === "COMPLETED"
                    ? 100
                    : Math.max(8, ((currentStageIndex + 1) / stages.length) * 100)
                }%`,
              }}
            />
          </div>
        </header>

        <ol className="mt-5 flex gap-2 overflow-x-auto pb-2">
          {stages.map((stage, index) => {
            const completed = completedStageIds.has(stage.id);
            const current = stage.id === workflow.currentStageId;
            const locked = !completed && !current;
            return (
              <li
                key={stage.id}
                className={`flex min-w-[150px] items-center gap-2 rounded-lg border px-3 py-2.5 ${
                  current
                    ? "border-[#7FA8CC] bg-[#E6F0F8]"
                    : completed
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200 bg-white/50"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    completed
                      ? "bg-emerald-600 text-white"
                      : current
                        ? "bg-[#6F9CC2] text-white"
                        : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {completed ? (
                    <Check className="h-4 w-4" />
                  ) : locked ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <span className="text-xs font-black">{index + 1}</span>
                  )}
                </span>
                <span className="line-clamp-2 text-xs font-bold leading-4 text-slate-800">
                  {stage.stageName}
                </span>
              </li>
            );
          })}
        </ol>

        {workflow.status === "COMPLETED" || !currentStage ? (
          <section className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <h2 className="mt-3 text-lg font-bold text-emerald-950">
              Installation workflow complete
            </h2>
            <p className="mt-2 text-sm leading-6 text-emerald-800">
              All required stages have been submitted with timestamp and GPS evidence.
            </p>
          </section>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-5">
            <div className="border-b border-slate-300 pb-4">
              <p className="text-sm font-bold text-[#436A8C]">
                Step {currentStageIndex + 1} of {stages.length}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">
                {currentStage.stageName}
              </h2>
            </div>

            {latestRejected?.rejectionReason && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-bold text-red-800">Correction requested</p>
                <p className="mt-1 text-sm leading-6 text-red-700">
                  {latestRejected.rejectionReason}
                </p>
              </div>
            )}

            <div className="mt-5 space-y-5">
              {fields.map((field) => {
                const requiredRule = field.isRequired
                  ? { required: `${field.label} is required.` }
                  : undefined;
                const value = formValues[field.id];

                if (field.type === "CHECKBOX") {
                  return (
                    <label
                      key={field.id}
                      className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border border-slate-300 bg-white p-4"
                    >
                      <input
                        type="checkbox"
                        {...register(field.id, {
                          validate: field.isRequired
                            ? (checked) => checked === true || `${field.label} is required.`
                            : undefined,
                        })}
                        className="mt-0.5 h-6 w-6 shrink-0 rounded border-slate-400 text-[#5F88AD] focus:ring-[#7FA8CC]"
                      />
                      <span>
                        <span className="block text-base font-bold text-slate-900">
                          {field.label}
                          {field.isRequired && <span className="ml-1 text-red-600">*</span>}
                        </span>
                        {errors[field.id] && (
                          <span className="mt-1 block text-xs font-semibold text-red-600">
                            {String(errors[field.id]?.message)}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                }

                if (field.type === "TEXT_INPUT") {
                  return (
                    <label key={field.id} className="block">
                      <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
                        <TextCursorInput className="h-4 w-4 text-[#5F88AD]" />
                        {field.label}
                        {field.isRequired && <span className="text-red-600">*</span>}
                      </span>
                      <input
                        {...register(field.id, requiredRule)}
                        className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none focus:border-[#7FA8CC] focus:ring-2 focus:ring-[#B7D1EA]"
                      />
                      {errors[field.id] && (
                        <span className="mt-1.5 block text-xs font-semibold text-red-600">
                          {String(errors[field.id]?.message)}
                        </span>
                      )}
                    </label>
                  );
                }

                if (field.type === "PHOTO_UPLOAD") {
                  return (
                    <Controller
                      key={field.id}
                      name={field.id}
                      control={control}
                      rules={requiredRule}
                      render={() => (
                        <div>
                          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
                            <Camera className="h-4 w-4 text-[#5F88AD]" />
                            {field.label}
                            {field.isRequired && <span className="text-red-600">*</span>}
                          </p>
                          {typeof value === "string" && value ? (
                            <div className="overflow-hidden rounded-lg border border-emerald-300 bg-white">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={value}
                                alt={field.label}
                                className="aspect-[4/3] w-full object-cover"
                              />
                              <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 border-t border-slate-200 text-sm font-bold text-slate-700">
                                <RotateCcw className="h-4 w-4" />
                                Retake photo
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="sr-only"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) void uploadEvidence(field.id, file);
                                  }}
                                />
                              </label>
                            </div>
                          ) : (
                            <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#8FB4D3] bg-[#EAF2F8] px-4 text-center transition active:bg-[#DCEAF4]">
	                              {uploadingField === field.id ? (
	                                <GsapSpinner className="h-8 w-8 text-[#436A8C]" />
	                              ) : (
                                <Camera className="h-9 w-9 text-[#436A8C]" />
                              )}
                              <span className="mt-3 text-base font-bold text-slate-900">
                                Open camera
                              </span>
                              <span className="mt-1 text-xs text-slate-600">
                                Capture clear ISO evidence
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="sr-only"
                                disabled={uploadingField === field.id}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file) void uploadEvidence(field.id, file);
                                }}
                              />
                            </label>
                          )}
                          {errors[field.id] && (
                            <span className="mt-1.5 block text-xs font-semibold text-red-600">
                              {String(errors[field.id]?.message)}
                            </span>
                          )}
                        </div>
                      )}
                    />
                  );
                }

                return (
                  <Controller
                    key={field.id}
                    name={field.id}
                    control={control}
                    rules={requiredRule}
                    render={() => (
                      <div>
                        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
                          <FileSignature className="h-4 w-4 text-[#5F88AD]" />
                          {field.label}
                          {field.isRequired && <span className="text-red-600">*</span>}
                        </p>
                        {typeof value === "string" && value ? (
                          <div className="rounded-lg border border-emerald-300 bg-white p-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={value} alt={field.label} className="h-32 w-full object-contain" />
                            <div className="mt-2 flex items-center justify-center gap-2 text-sm font-bold text-emerald-700">
                              <CheckCircle2 className="h-4 w-4" />
                              Signature saved
                            </div>
                          </div>
                        ) : (
                          <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
                            <SignatureCanvas
                              ref={(instance) => {
                                signatureRefs.current[field.id] = instance;
                              }}
                              canvasProps={{
                                className: "h-44 w-full touch-none bg-white",
                              }}
                              penColor="#0F172A"
                            />
                            <div className="flex border-t border-slate-200">
                              <button
                                type="button"
                                onClick={() => signatureRefs.current[field.id]?.clear()}
                                className="flex min-h-11 flex-1 items-center justify-center gap-2 text-sm font-bold text-slate-700"
                              >
                                <RotateCcw className="h-4 w-4" />
                                Clear
                              </button>
                              <button
                                type="button"
                                onClick={() => void saveSignature(field.id)}
                                disabled={uploadingField === field.id}
                                className="flex min-h-11 flex-1 items-center justify-center gap-2 border-l border-slate-200 bg-[#EAF2F8] text-sm font-bold text-[#315979]"
                              >
	                                {uploadingField === field.id ? (
	                                  <GsapSpinner className="h-4 w-4" />
	                                ) : (
                                  <Upload className="h-4 w-4" />
                                )}
                                Save signature
                              </button>
                            </div>
                          </div>
                        )}
                        {errors[field.id] && (
                          <span className="mt-1.5 block text-xs font-semibold text-red-600">
                            {String(errors[field.id]?.message)}
                          </span>
                        )}
                      </div>
                    )}
                  />
                );
              })}
            </div>

            <div className="mt-6 rounded-lg border border-slate-300 bg-white p-4">
              <div className="flex items-start gap-3">
                <LocateFixed className="mt-0.5 h-5 w-5 shrink-0 text-[#5F88AD]" />
                <div>
                  <p className="text-sm font-bold text-slate-900">GPS evidence required</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Your location is captured only when you submit this stage.
                  </p>
                  {gpsStatus && (
                    <p className="mt-2 text-xs font-semibold text-[#315979]">{gpsStatus}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <button
                type="submit"
                disabled={!isValid || isPending || uploadingField !== null}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-base font-bold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-400"
              >
	                {isPending ? (
	                  <GsapSpinner className="h-5 w-5" />
	                ) : (
                  <Send className="h-5 w-5" />
                )}
                บันทึกและดำเนินการต่อ
              </button>
              <button
                type="button"
                onClick={() => setShowSkipDialog(true)}
                disabled={isPending || uploadingField !== null}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-amber-400 bg-white px-5 text-sm font-bold text-amber-800 transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 disabled:opacity-50"
              >
                <SkipForward className="h-5 w-5" />
                ข้ามขั้นตอนนี้
              </button>
            </div>
          </form>
        )}
      </div>

      {showSkipDialog && currentStage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="skip-stage-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-4 backdrop-blur-sm sm:items-center"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="skip-stage-title" className="text-lg font-bold text-slate-950">
                  ระบุเหตุผลการข้ามขั้นตอน
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  เหตุผลนี้จะถูกบันทึกเป็น ISO deviation สำหรับขั้นตอน {currentStage.stageName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSkipDialog(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                aria-label="Close skip dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="mt-5 block">
              <span className="mb-1.5 block text-sm font-bold text-slate-800">
                เหตุผลการข้ามขั้นตอน
              </span>
              <textarea
                value={skipReason}
                onChange={(event) => setSkipReason(event.target.value)}
                rows={5}
                autoFocus
                placeholder="อธิบายเหตุผลและสภาพหน้างานที่ทำให้ไม่สามารถดำเนินขั้นตอนนี้ได้"
                className="w-full resize-y rounded-lg border border-slate-300 bg-[#F8F7F3] px-3.5 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-500 focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              />
              <span className="mt-1.5 block text-xs text-slate-600">
                ต้องระบุอย่างน้อย 5 ตัวอักษร
              </span>
            </label>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowSkipDialog(false)}
                className="min-h-11 rounded-full border border-slate-300 px-5 text-sm font-bold text-slate-700"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={isPending || skipReason.trim().length < 5}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-amber-600 px-5 text-sm font-bold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
              >
	                {isPending ? (
	                  <GsapSpinner className="h-4 w-4" />
	                ) : (
                  <SkipForward className="h-4 w-4" />
                )}
                ยืนยันการข้ามขั้นตอน
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
