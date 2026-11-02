"use client";

import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import {
  Camera,
  CheckCircle2,
  ExternalLink,
  FileCheck,
  Navigation,
  Phone,
  RotateCcw,
  ShieldCheck,
  Upload,
  Wrench,
  X,
} from "@/components/ui/icons";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import StatusBadge from "@/components/ui/StatusBadge";
import Skeleton from "@/components/ui/skeleton";
import { uploadQcEvidenceToDriveAction, submitTaskHandoverAction } from "@/app/actions/deliveryTasks";
import type { DeliveryTask, DeliveryChecklistItem } from "@/types/delivery";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog";

interface TechWorkOrderClientProps {
  initialTask: DeliveryTask;
}

type SignaturePosition = { x: number; y: number };

export function TechWorkOrderLoading() {
  const t = useTranslations("TechWorkOrder");

  return (
    <div
      role="status"
      aria-busy="true"
      className="min-h-dvh bg-[#F0EEE9] p-4 md:p-6 text-slate-950 font-sans max-w-2xl mx-auto space-y-5 pb-12"
    >
      <span className="sr-only">{t("loadingWorkOrder")}</span>
      <div aria-hidden="true" className="space-y-5">
        <section className="rounded-2xl bg-[#0F172A] p-5 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-24 rounded-md bg-slate-700" />
            <Skeleton className="h-5 w-20 rounded-full bg-slate-700" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-5 w-3/4 bg-slate-700" />
            <Skeleton className="h-3 w-full max-w-sm bg-slate-700" />
          </div>
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-11 flex-1 bg-slate-700" />
            <Skeleton className="h-11 w-12 bg-slate-700" />
          </div>
        </section>

        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <Skeleton className="h-3 w-36" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={`checklist-${index}`} className="flex min-h-11 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <Skeleton className="h-5 w-5 shrink-0 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <Skeleton className="h-4 w-36" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={`photo-${index}`} className="h-24 rounded-xl" />
            ))}
          </div>
        </section>

        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
    </div>
  );
}

const DEFAULT_CHECKLIST: DeliveryChecklistItem[] = [
  {
    id: "item-1",
    taskId: "",
    itemCode: "ROOF_MOUNTING",
    label: "ตรวจสอบโครงสร้างหลังคา อุปกรณ์ยึดแผง (Roof Mounting & Clamping)",
    sequence: 1,
    required: true,
    evidenceRequired: true,
    allowsNa: false,
    completed: false,
  },
  {
    id: "item-2",
    taskId: "",
    itemCode: "INVERTER_WIRING",
    label: "เดินสายไฟ DC/AC และติดตั้งตู้คอนไบเนอร์ (Wiring & Combiner Box)",
    sequence: 2,
    required: true,
    evidenceRequired: true,
    allowsNa: false,
    completed: false,
  },
  {
    id: "item-3",
    taskId: "",
    itemCode: "SAFETY_GROUNDING",
    label: "ตรวจสอบระบบสายดินและกันฟ้าผ่า (Grounding & Surge Protection)",
    sequence: 3,
    required: true,
    evidenceRequired: true,
    allowsNa: false,
    completed: false,
  },
  {
    id: "item-4",
    taskId: "",
    itemCode: "COMMISSIONING_TEST",
    label: "ทดสอบการขนานไฟและทดลองเดินเครื่องอินเวอร์เตอร์ (Grid Sync Test)",
    sequence: 4,
    required: true,
    evidenceRequired: false,
    allowsNa: false,
    completed: false,
  },
  {
    id: "item-5",
    taskId: "",
    itemCode: "SITE_CLEANLINESS",
    label: "ทำความสะอาดพื้นที่และจัดเก็บอุปกรณ์ส่วนเกิน (Site Cleanliness)",
    sequence: 5,
    required: true,
    evidenceRequired: false,
    allowsNa: false,
    completed: false,
  },
];

export default function TechWorkOrderClient({
  initialTask,
}: TechWorkOrderClientProps) {
  const t = useTranslations("TechWorkOrder");
  const getStatusLabel = (status: string) => {
    switch (status) {
      case "OPEN": return t("statusOpen");
      case "SCHEDULED": return t("statusScheduled");
      case "IN_PROGRESS": return t("statusInProgress");
      case "HANDOVER_PENDING": return t("statusHandoverPending");
      case "COMPLETED": return t("statusCompleted");
      case "CANCELLED": return t("statusCancelled");
      default: return status;
    }
  };
  const getChecklistLabel = (item: DeliveryChecklistItem) => {
    switch (item.itemCode) {
      case "ROOF_MOUNTING": return t("checklist.roofMounting");
      case "INVERTER_WIRING": return t("checklist.inverterWiring");
      case "SAFETY_GROUNDING": return t("checklist.safetyGrounding");
      case "COMMISSIONING_TEST": return t("checklist.commissioningTest");
      case "SITE_CLEANLINESS": return t("checklist.siteCleanliness");
      default: return item.label;
    }
  };
  const getPhotoCategoryLabel = (category: string) => {
    switch (category) {
      case "ROOF_MOUNTING": return t("photoCategories.roofMounting");
      case "INVERTER_WIRING": return t("photoCategories.inverterWiring");
      case "COMBINER_BOX": return t("photoCategories.combinerBox");
      case "SAFETY_GROUNDING": return t("photoCategories.safetyGrounding");
      default: return category;
    }
  };
  const [task, setTask] = useState<DeliveryTask>(initialTask);
  const [checklist, setChecklist] = useState<DeliveryChecklistItem[]>(DEFAULT_CHECKLIST);
  const [uploadedPhotos, setUploadedPhotos] = useState<Record<string, string>>({});
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<string | null>(null);

  // E-Signature Modal State
  const [isHandoverModalOpen, setIsHandoverModalOpen] = useState(false);
  const sigCanvasRef = useRef<SignatureCanvas | null>(null);
  const keyboardCursorRef = useRef<SignaturePosition | null>(null);
  const keyboardStrokeActiveRef = useRef(false);
  const keyboardMoveAnnouncementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [keyboardCursor, setKeyboardCursor] = useState<SignaturePosition | null>(null);
  const [isKeyboardStrokeActive, setIsKeyboardStrokeActive] = useState(false);
  const [isSignatureCanvasFocused, setIsSignatureCanvasFocused] = useState(false);
  const [signatureKeyboardStatus, setSignatureKeyboardStatus] = useState("");
  const [isSubmittingHandover, setIsSubmittingHandover] = useState(false);
  const [completedPdfUrl, setCompletedPdfUrl] = useState<string | null>(null);
  const customerName = task.customerName.trim() || t("customerNameUnavailable");
  const installationAddress = task.installationAddress?.trim() || null;
  const customerPhone = task.customerPhone?.trim() || null;
  const systemSize = task.systemSizeKwp && task.systemSizeKwp > 0 ? task.systemSizeKwp : null;
  const systemSizeLabel = systemSize === null ? t("valueUnavailable") : `${systemSize} kWp`;
  const panelCountLabel = task.panelCount && task.panelCount > 0
    ? t("panelCount", { count: task.panelCount })
    : t("valueUnavailable");
  const inverterModel = task.inverterModel?.trim() || t("valueUnavailable");

  useEffect(() => () => {
    if (keyboardMoveAnnouncementTimerRef.current !== null) {
      clearTimeout(keyboardMoveAnnouncementTimerRef.current);
    }
  }, []);

  const toggleCheckitem = (itemId: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, completed: !item.completed } : item))
    );
  };

  const handlePhotoUpload = async (category: string, file: File) => {
    setIsUploadingPhoto(category);
    const formData = new FormData();
    formData.set("taskId", task.id);
    formData.set("category", category);
    formData.set("file", file);

    const result = await uploadQcEvidenceToDriveAction(formData);
    setIsUploadingPhoto(null);

    if (!result.success || !result.driveUrl) {
      toast.error(t("photoUploadFailed"));
      return;
    }

    setUploadedPhotos((prev) => ({ ...prev, [category]: result.driveUrl! }));
    toast.success(t("photoUploaded", { category: getPhotoCategoryLabel(category) }));
  };

  const dispatchSignatureMouseEvent = (
    type: "mousedown" | "mousemove" | "mouseup",
    position: SignaturePosition,
  ) => {
    const canvas = sigCanvasRef.current?.getCanvas();
    if (!canvas) return;

    const bounds = canvas.getBoundingClientRect();
    const mouseEvent = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: type === "mouseup" ? 0 : 1,
      clientX: bounds.left + position.x,
      clientY: bounds.top + position.y,
    });
    Object.defineProperty(mouseEvent, "which", { configurable: true, value: 1 });

    if (type === "mouseup") {
      document.dispatchEvent(mouseEvent);
    } else {
      canvas.dispatchEvent(mouseEvent);
    }
  };

  const cancelKeyboardMoveAnnouncement = () => {
    if (keyboardMoveAnnouncementTimerRef.current !== null) {
      clearTimeout(keyboardMoveAnnouncementTimerRef.current);
      keyboardMoveAnnouncementTimerRef.current = null;
    }
  };

  const finishKeyboardSignatureStroke = (announce = true) => {
    cancelKeyboardMoveAnnouncement();
    if (!keyboardStrokeActiveRef.current) return;

    if (keyboardCursorRef.current) {
      dispatchSignatureMouseEvent("mouseup", keyboardCursorRef.current);
    }
    keyboardStrokeActiveRef.current = false;
    setIsKeyboardStrokeActive(false);
    if (announce) setSignatureKeyboardStatus(t("keyboardSignaturePaused"));
  };

  const handleSignatureCanvasKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const canvas = sigCanvasRef.current?.getCanvas();
    if (!canvas) return;

    const bounds = canvas.getBoundingClientRect();
    const currentPosition = keyboardCursorRef.current ?? {
      x: Math.min(24, bounds.width / 2),
      y: bounds.height / 2,
    };

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (event.repeat) return;
      cancelKeyboardMoveAnnouncement();

      if (keyboardStrokeActiveRef.current) {
        finishKeyboardSignatureStroke();
      } else {
        keyboardCursorRef.current = currentPosition;
        setKeyboardCursor(currentPosition);
        dispatchSignatureMouseEvent("mousedown", currentPosition);
        keyboardStrokeActiveRef.current = true;
        setIsKeyboardStrokeActive(true);
        setSignatureKeyboardStatus(t("keyboardSignatureStarted"));
      }
      return;
    }

    if (event.key === "Escape") {
      if (keyboardStrokeActiveRef.current) {
        event.preventDefault();
        finishKeyboardSignatureStroke();
      }
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      clearSignature();
      return;
    }

    const step = event.shiftKey ? 12 : 6;
    const nextPosition = { ...currentPosition };
    if (event.key === "ArrowLeft") nextPosition.x = Math.max(0, currentPosition.x - step);
    else if (event.key === "ArrowRight") nextPosition.x = Math.min(bounds.width, currentPosition.x + step);
    else if (event.key === "ArrowUp") nextPosition.y = Math.max(0, currentPosition.y - step);
    else if (event.key === "ArrowDown") nextPosition.y = Math.min(bounds.height, currentPosition.y + step);
    else return;

    event.preventDefault();
    if (nextPosition.x === currentPosition.x && nextPosition.y === currentPosition.y) return;

    keyboardCursorRef.current = nextPosition;
    setKeyboardCursor(nextPosition);
    if (keyboardStrokeActiveRef.current) {
      dispatchSignatureMouseEvent("mousemove", nextPosition);
    }

    cancelKeyboardMoveAnnouncement();
    const direction = event.key === "ArrowLeft"
      ? t("directionLeft")
      : event.key === "ArrowRight"
        ? t("directionRight")
        : event.key === "ArrowUp"
          ? t("directionUp")
          : t("directionDown");
    keyboardMoveAnnouncementTimerRef.current = setTimeout(() => {
      setSignatureKeyboardStatus(t("keyboardPenMoved", {
        direction,
        x: Math.round(nextPosition.x),
        y: Math.round(nextPosition.y),
      }));
      keyboardMoveAnnouncementTimerRef.current = null;
    }, 350);
  };

  function clearSignature() {
    finishKeyboardSignatureStroke(false);
    sigCanvasRef.current?.clear();
    keyboardCursorRef.current = null;
    setKeyboardCursor(null);
    setSignatureKeyboardStatus(t("signatureCleared"));
  }

  const handleConfirmHandover = async () => {
    if (sigCanvasRef.current?.isEmpty()) {
      toast.error(t("signatureRequired"));
      return;
    }

    const signatureDataUrl = sigCanvasRef.current?.getTrimmedCanvas().toDataURL("image/png");
    if (!signatureDataUrl) return;

    setIsSubmittingHandover(true);
    const result = await submitTaskHandoverAction({
      taskId: task.id,
      customerSignatureBase64: signatureDataUrl,
      verifiedItems: checklist.filter((c) => c.completed).map((c) => c.label),
    });
    setIsSubmittingHandover(false);

    if (!result.success || !result.pdfUrl) {
      toast.error(t("handoverFailed"));
      return;
    }

    setCompletedPdfUrl(result.pdfUrl);
    setTask((prev) => ({ ...prev, status: "COMPLETED" }));
    toast.success(t("handoverSucceeded"));
  };

  const allRequiredCompleted = checklist.filter((c) => c.required).every((c) => c.completed);
  const mapsNavigationUrl = installationAddress
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(installationAddress)}`
    : null;

  return (
    <div className="min-h-dvh bg-[#F0EEE9] p-4 md:p-6 text-slate-950 font-sans max-w-2xl mx-auto space-y-5 pb-12">
      {/* Mobile Work Order Navigation Header */}
      <div className="bg-[#0F172A] text-white rounded-2xl p-5 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase font-mono bg-[#0369a1] px-2.5 py-1 rounded-md text-white">
            {task.projectCode}
          </span>
          <StatusBadge tone={task.status === "COMPLETED" ? "success" : "info"} className="text-[10px]">
            {getStatusLabel(task.status)}
          </StatusBadge>
        </div>

        <div>
          <h1 className="text-lg font-black tracking-tight">{task.title}</h1>
          <p className="mt-1 text-xs font-semibold text-slate-300">
            {systemSize === null
              ? t("customerSummary", { customerName })
              : t("customerSummaryWithSize", { customerName, systemSize: systemSizeLabel })}
          </p>
        </div>

        {/* 1-Tap Google Maps Navigation & Phone Buttons */}
        {(mapsNavigationUrl || customerPhone) ? <div className="pt-2 flex items-center gap-2">
          {mapsNavigationUrl ? <a
            href={mapsNavigationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 px-3 text-xs font-black transition shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0369a1] focus-visible:ring-offset-2"
          >
            <Navigation className="h-4 w-4" />
            <span>{t("navigateWithMaps")}</span>
          </a> : null}

          {customerPhone && (
            <a
              href={`tel:${customerPhone}`}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white p-2.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A]"
            >
              <Phone className="h-4 w-4 text-[#B7D1EA]" />
              <span>{t("callCustomer")}</span>
            </a>
          )}
        </div> : null}
      </div>

      {/* Customer & Location Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2 text-xs">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("siteAddress")}</p>
        <p className="font-black text-slate-900 leading-relaxed">{installationAddress || t("valueUnavailable")}</p>
      </div>

      {/* Project Scope Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2 text-xs">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("projectScope")}</p>
        <div className="grid grid-cols-2 gap-2 pt-1 font-bold text-slate-800">
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 block font-normal">{t("solarPanels")}</span>
            <span>{panelCountLabel}</span>
          </div>
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 block font-normal">{t("inverter")}</span>
            <span>{inverterModel}</span>
          </div>
        </div>
      </div>

      {/* Dynamic Quality Control Checklist */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-[#0369a1]" />
            <h3 className="text-sm font-black text-slate-950">{t("checklistTitle")}</h3>
          </div>
          <span className="text-xs font-mono font-bold text-slate-500">
            {checklist.filter((c) => c.completed).length} / {checklist.length}
          </span>
        </div>

        <div className="space-y-3">
          {checklist.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => toggleCheckitem(item.id)}
              aria-pressed={item.completed}
              className={`w-full min-h-11 p-3.5 rounded-xl border transition cursor-pointer flex items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0369a1] focus-visible:ring-offset-2 ${
                item.completed
                  ? "bg-emerald-50/70 border-emerald-300 text-emerald-950"
                  : "bg-slate-50 border-slate-200 text-slate-900 hover:bg-white"
              }`}
            >
              <div
                className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                  item.completed ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300 bg-white"
                }`}
              >
                {item.completed && <CheckCircle2 className="h-4 w-4" />}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-black">{getChecklistLabel(item)}</p>
                {item.evidenceRequired && (
                  <span className="inline-block text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                    * {t("photoRequired")}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* QC Photo Stream Component to Google Drive */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Camera className="h-5 w-5 text-[#0369a1]" />
          <h3 className="text-sm font-black text-slate-950">{t("photoSectionTitle")}</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {["ROOF_MOUNTING", "INVERTER_WIRING", "COMBINER_BOX", "SAFETY_GROUNDING"].map((cat) => (
            <div key={cat} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-center">
              <span className="text-[11px] font-black text-slate-800 block truncate">{getPhotoCategoryLabel(cat)}</span>
              {uploadedPhotos[cat] ? (
                <a
                  href={uploadedPhotos[cat]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-[10px] font-bold text-emerald-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0369a1] focus-visible:ring-offset-2"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t("viewPhotoInDrive")}
                </a>
              ) : (
                <label className="inline-flex min-h-11 items-center justify-center gap-1.5 w-full bg-[#0F172A] hover:bg-[#0369a1] text-white py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer focus-within:outline-none focus-within:ring-2 focus-within:ring-[#0369a1] focus-within:ring-offset-2">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{isUploadingPhoto === cat ? t("uploading") : t("attachPhoto")}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handlePhotoUpload(cat, f);
                    }}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Commissioning Handover CTA Button */}
      {task.status !== "COMPLETED" ? (
        <button
          type="button"
          onClick={() => setIsHandoverModalOpen(true)}
          disabled={!allRequiredCompleted}
          className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white py-4 text-sm font-black transition shadow-lg disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0369a1] focus-visible:ring-offset-2"
        >
          <ShieldCheck className="h-5 w-5" />
          <span>{t("completeAndHandover")}</span>
        </button>
      ) : (
        <div className="p-4 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-950 text-center space-y-2">
          <p className="font-black text-sm flex items-center justify-center gap-1.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-700" />
            {t("handoverCompleted")}
          </p>
          {completedPdfUrl && (
            <a
              href={completedPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 text-xs font-extrabold text-emerald-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0369a1] focus-visible:ring-offset-2"
            >
              <FileCheck className="h-4 w-4 text-emerald-700" />
              {t("viewHandoverPdf")}
            </a>
          )}
        </div>
      )}

      {/* Customer On-Site Touch E-Signature Modal */}
      <Dialog isOpen={isHandoverModalOpen} onClose={() => setIsHandoverModalOpen(false)} size="md">
        <DialogContent className="bg-white text-slate-950 max-w-lg border border-slate-200 shadow-2xl p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="border-b border-slate-100 bg-[#0F172A] px-6 py-4 flex flex-row items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#B7D1EA]" />
              <h2 className="text-base font-black">
                {t("handoverDialogTitle")}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsHandoverModalOpen(false)}
              aria-label={t("closeHandoverDialog")}
              className="min-h-11 min-w-11 rounded-xl p-1 text-slate-400 hover:text-white transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A]"
            >
              <X className="h-5 w-5" />
            </button>
          </DialogHeader>

          <DialogBody className="p-6 space-y-4 text-xs">
            <div className="space-y-1">
              <p className="font-black text-slate-900">{t("handoverGreeting", { customerName })}</p>
              <p className="text-slate-600 font-medium leading-relaxed">
                {task.systemSizeKwp && task.systemSizeKwp > 0
                  ? t("handoverInstructionsWithSize", { systemSize: systemSizeLabel })
                  : t("handoverInstructions")}
              </p>
            </div>

            {/* Signature Pad */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">{t("signaturePadLabel")}</span>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="inline-flex min-h-11 items-center gap-1 px-2 text-[11px] font-bold text-slate-500 hover:text-slate-900 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0369a1] focus-visible:ring-offset-2"
                >
                  <RotateCcw className="h-3 w-3" />
                  {t("clearSignature")}
                </button>
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden bg-slate-50">
                <p id="signature-keyboard-instructions" className="border-b border-slate-200 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
                  {t("signatureKeyboardInstructions")}
                </p>
                <div className="relative">
                  <SignatureCanvas
                    ref={sigCanvasRef}
                    penColor="#0F172A"
                    throttle={0}
                    canvasProps={{
                      tabIndex: 0,
                      role: "application",
                      className: "w-full h-44 cursor-crosshair focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0369a1]",
                      "aria-label": t("signaturePadLabel"),
                      "aria-describedby": "signature-keyboard-instructions",
                      onFocus: () => {
                        const canvas = sigCanvasRef.current?.getCanvas();
                        if (!canvas) return;
                        const bounds = canvas.getBoundingClientRect();
                        const nextPosition = keyboardCursorRef.current ?? {
                          x: Math.min(24, bounds.width / 2),
                          y: bounds.height / 2,
                        };
                        keyboardCursorRef.current = nextPosition;
                        setKeyboardCursor(nextPosition);
                        setIsSignatureCanvasFocused(true);
                      },
                      onBlur: () => {
                        setIsSignatureCanvasFocused(false);
                        finishKeyboardSignatureStroke();
                      },
                      onKeyDown: handleSignatureCanvasKeyDown,
                    }}
                  />
                  {isSignatureCanvasFocused && keyboardCursor ? (
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
                        isKeyboardStrokeActive ? "border-[#0369a1] bg-[#B7D1EA]/70" : "border-slate-500 bg-white/80"
                      }`}
                      style={{ left: keyboardCursor.x, top: keyboardCursor.y }}
                    />
                  ) : null}
                </div>
                <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                  {signatureKeyboardStatus}
                </span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsHandoverModalOpen(false)}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0369a1] focus-visible:ring-offset-2"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmHandover}
                disabled={isSubmittingHandover}
                className="min-h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2 font-black text-white transition cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0369a1] focus-visible:ring-offset-2"
              >
                {isSubmittingHandover ? t("creatingHandoverPdf") : t("confirmHandover")}
              </button>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
