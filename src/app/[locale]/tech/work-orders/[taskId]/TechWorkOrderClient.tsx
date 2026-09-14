"use client";

import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileCheck,
  HardHat,
  MapPin,
  Navigation,
  Phone,
  RotateCcw,
  ShieldCheck,
  Upload,
  User,
  Wrench,
  X,
} from "@/components/ui/icons";
import { toast } from "sonner";
import StatusBadge from "@/components/ui/StatusBadge";
import { uploadQcEvidenceToDriveAction, submitTaskHandoverAction } from "@/app/actions/deliveryTasks";
import type { DeliveryTask, DeliveryChecklistItem } from "@/types/delivery";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog";

interface TechWorkOrderClientProps {
  locale: string;
  initialTask: DeliveryTask;
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
  locale,
  initialTask,
}: TechWorkOrderClientProps) {
  const [task, setTask] = useState<DeliveryTask>(initialTask);
  const [checklist, setChecklist] = useState<DeliveryChecklistItem[]>(DEFAULT_CHECKLIST);
  const [uploadedPhotos, setUploadedPhotos] = useState<Record<string, string>>({});
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<string | null>(null);

  // E-Signature Modal State
  const [isHandoverModalOpen, setIsHandoverModalOpen] = useState(false);
  const sigCanvasRef = useRef<SignatureCanvas | null>(null);
  const [isSubmittingHandover, setIsSubmittingHandover] = useState(false);
  const [completedPdfUrl, setCompletedPdfUrl] = useState<string | null>(null);

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
      toast.error(result.error || "ไม่สามารถอัปโหลดรูปภาพได้");
      return;
    }

    setUploadedPhotos((prev) => ({ ...prev, [category]: result.driveUrl! }));
    toast.success(`อัปโหลดรูป QC (${category}) เข้า Google Drive สำเร็จ!`);
  };

  const clearSignature = () => {
    sigCanvasRef.current?.clear();
  };

  const handleConfirmHandover = async () => {
    if (sigCanvasRef.current?.isEmpty()) {
      toast.error("กรุณาให้ลูกค้าลงนามอิเล็กทรอนิกส์ก่อนส่งมอบงาน");
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
      toast.error(result.error || "ไม่สามารถส่งมอบงานได้");
      return;
    }

    setCompletedPdfUrl(result.pdfUrl);
    setTask((prev) => ({ ...prev, status: "COMPLETED" }));
    toast.success("ส่งมอบงานและสร้างใบรับรอง PDF สำเร็จแล้ว!");
  };

  const allRequiredCompleted = checklist.filter((c) => c.required).every((c) => c.completed);
  const mapsNavigationUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    task.installationAddress || "Bangkok"
  )}`;

  return (
    <div className="min-h-dvh bg-[#F0EEE9] p-4 md:p-6 text-slate-950 font-sans max-w-2xl mx-auto space-y-5 pb-12">
      {/* Mobile Work Order Navigation Header */}
      <div className="bg-[#0F172A] text-white rounded-2xl p-5 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase font-mono bg-[#0369a1] px-2.5 py-1 rounded-md text-white">
            {task.projectCode}
          </span>
          <StatusBadge tone={task.status === "COMPLETED" ? "success" : "info"} className="text-[10px]">
            {task.status}
          </StatusBadge>
        </div>

        <div>
          <h1 className="text-lg font-black tracking-tight">{task.title}</h1>
          <p className="mt-1 text-xs font-semibold text-slate-300">
            ผู้รับบริการ: {task.customerName} ({task.systemSizeKwp} kWp Solar System)
          </p>
        </div>

        {/* 1-Tap Google Maps Navigation & Phone Buttons */}
        <div className="pt-2 flex items-center gap-2">
          <a
            href={mapsNavigationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 px-3 text-xs font-black transition shadow-xs"
          >
            <Navigation className="h-4 w-4" />
            <span>นำทางด้วย Google Maps</span>
          </a>

          {task.customerPhone && (
            <a
              href={`tel:${task.customerPhone}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white p-2.5 text-xs font-bold transition"
            >
              <Phone className="h-4 w-4 text-[#B7D1EA]" />
              <span>โทรหาลูกค้า</span>
            </a>
          )}
        </div>
      </div>

      {/* Customer & Location Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2 text-xs">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">สถานที่ติดตั้ง / Site Address</p>
        <p className="font-black text-slate-900 leading-relaxed">{task.installationAddress}</p>
      </div>

      {/* Project Scope Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2 text-xs">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">รายการอุปกรณ์ (Project Scope)</p>
        <div className="grid grid-cols-2 gap-2 pt-1 font-bold text-slate-800">
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 block font-normal">แผงโซลาร์</span>
            <span>{task.panelCount} แผง (Tier-1 Mono)</span>
          </div>
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 block font-normal">อินเวอร์เตอร์</span>
            <span>{task.inverterModel}</span>
          </div>
        </div>
      </div>

      {/* Dynamic Quality Control Checklist */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-[#0369a1]" />
            <h3 className="text-sm font-black text-slate-950">รายการตรวจสอบงานติดตั้ง (QC Checklist)</h3>
          </div>
          <span className="text-xs font-mono font-bold text-slate-500">
            {checklist.filter((c) => c.completed).length} / {checklist.length}
          </span>
        </div>

        <div className="space-y-3">
          {checklist.map((item) => (
            <div
              key={item.id}
              onClick={() => toggleCheckitem(item.id)}
              className={`p-3.5 rounded-xl border transition cursor-pointer flex items-start gap-3 ${
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
                <p className="text-xs font-black">{item.label}</p>
                {item.evidenceRequired && (
                  <span className="inline-block text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                    * ต้องถ่ายรูป QC เข้า Google Drive
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* QC Photo Stream Component to Google Drive */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Camera className="h-5 w-5 text-[#0369a1]" />
          <h3 className="text-sm font-black text-slate-950">ถ่ายรูป QC เข้า Google Drive (Google Drive Stream)</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {["ROOF_MOUNTING", "INVERTER_WIRING", "COMBINER_BOX", "SAFETY_GROUNDING"].map((cat) => (
            <div key={cat} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-center">
              <span className="text-[11px] font-black text-slate-800 block truncate">{cat}</span>
              {uploadedPhotos[cat] ? (
                <a
                  href={uploadedPhotos[cat]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  ดูรูปใน Google Drive
                </a>
              ) : (
                <label className="inline-flex items-center justify-center gap-1.5 w-full bg-[#0F172A] hover:bg-[#0369a1] text-white py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{isUploadingPhoto === cat ? "อัปโหลด..." : "ถ่ายรูป/แนบ"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handlePhotoUpload(cat, f);
                    }}
                    className="hidden"
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
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white py-4 text-sm font-black transition shadow-lg disabled:opacity-50 cursor-pointer"
        >
          <ShieldCheck className="h-5 w-5" />
          <span>ส่งมอบงานและเซ็นรับรอง (Complete & Handover)</span>
        </button>
      ) : (
        <div className="p-4 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-950 text-center space-y-2">
          <p className="font-black text-sm flex items-center justify-center gap-1.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-700" />
            ส่งมอบงานและออกใบรับรองเรียบร้อยแล้ว
          </p>
          {completedPdfUrl && (
            <a
              href={completedPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-900 underline"
            >
              <FileCheck className="h-4 w-4 text-emerald-700" />
              ดูใบรับรองการส่งมอบงาน (Handover PDF)
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
                ลงนามรับรองการส่งมอบงาน (Customer E-Sign)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsHandoverModalOpen(false)}
              className="rounded-xl p-1 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </DialogHeader>

          <DialogBody className="p-6 space-y-4 text-xs">
            <div className="space-y-1">
              <p className="font-black text-slate-900">เรียนคุณ {task.customerName}</p>
              <p className="text-slate-600 font-medium leading-relaxed">
                กรุณาลงนามอิเล็กทรอนิกส์ในช่องด้านล่างเพื่อยืนยันว่าการติดตั้งระบบโซลาร์เซลล์ขนาด {task.systemSizeKwp} kWp เสร็จสมบูรณ์และผ่านการทดสอบความปลอดภัยแล้ว
              </p>
            </div>

            {/* Signature Pad */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">ลงลายมือชื่อบนหน้าจอ (Touch Signature):</span>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  ล้างลายเซ็น
                </button>
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden bg-slate-50">
                <SignatureCanvas
                  ref={sigCanvasRef}
                  penColor="#0F172A"
                  canvasProps={{
                    className: "w-full h-44 cursor-crosshair",
                  }}
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsHandoverModalOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmHandover}
                disabled={isSubmittingHandover}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2 font-black text-white transition cursor-pointer disabled:opacity-50"
              >
                {isSubmittingHandover ? "กำลังสร้าง PDF & ซิงค์..." : "ยืนยันและออกใบส่งมอบ PDF"}
              </button>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
