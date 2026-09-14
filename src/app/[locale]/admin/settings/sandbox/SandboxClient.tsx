"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import generatePayload from "promptpay-qr";
import { 
  Search, 
  CreditCard, 
  ExternalLink, 
  Terminal, 
  Info,
  Clock,
  Zap,
  Activity,
  Cpu,
  QrCode,
  Upload,
  X,
  AlertCircle,
  FileCheck,
  FileCode,
  Smartphone,
  Coins,
  Building,
  Copy
} from "@/components/ui/icons";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { verifyTestSlip, uploadSandboxSlip } from "@/app/actions/testPayments";
import { 
  verifySlipPaymentAsAdmin 
} from "@/app/actions/payments";
import { cn } from "@/lib/utils";
import { GsapReveal, GsapSpinner } from "@/components/ui/GsapMotion";
import EsignatureSandboxTab from "./EsignatureSandboxTab";

function isObjectUrl(value: string | null): value is string {
  return Boolean(value?.startsWith("blob:"));
}

// Helpers
const formatPrice = (value: number | string) => {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(Number(value));
};

interface Milestone {
  id: string;
  orderId: string;
  milestoneOrder: number;
  milestoneName: string;
  percentage: string;
  amount: string;
  status: "PENDING" | "ACTIVE" | "PAID" | "OVERDUE";
  dueDate: Date | null;
  paidAt: Date | null;
}

interface Order {
  id: string;
  status: string;
  systemSizeKwp: number;
  panelCount: number;
  totalPrice: number;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
  paymentMilestones: Milestone[];
}

interface SandboxClientProps {
  initialOrders: Order[];
  envStatus: Record<string, boolean>;
  paymentSettings: {
    promptpayId: string;
    promptpayLimit: number;
    bankName: string;
    bankAccountName: string;
    bankAccountNumber: string;
  };
}

type VerificationResult = {
  success?: boolean;
  error?: string;
  data?: unknown;
  [key: string]: unknown;
};

export default function SandboxClient({ initialOrders, envStatus, paymentSettings }: SandboxClientProps) {
  const t = useTranslations("AdminSandbox");
  const [isPending, startTransition] = useTransition();

  // Navigation states
  const [activeTab, setActiveTab] = useState<"payments" | "utilities" | "esignature">("payments");
  const [searchQuery, setSearchQuery] = useState("");

  // PromptPay QR Generator States
  const [promptpayID, setPromptpayID] = useState(
    paymentSettings?.promptpayId || "0812345678"
  );
  const [customAmount, setCustomAmount] = useState("2700.00");
  const [expiryMinutes, setExpiryMinutes] = useState<number>(15);
  const [qrGeneratedAt, setQrGeneratedAt] = useState<Date>(new Date());
  const [timeLeft, setTimeLeft] = useState<number>(15 * 60);
  const [qrExpired, setQrExpired] = useState<boolean>(false);

  // Selection states
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // File Upload states
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);

  // Diagnostic states
  const [utilityProcessing, setUtilityProcessing] = useState<string | null>(null);

  // Generate native PromptPay QR string using standard promptpay-qr library
  const qrPayload = useMemo(() => {
    const normalizedID = promptpayID.replace(/[\s-]/g, "");
    if (!normalizedID) return "";
    try {
      return generatePayload(normalizedID, { amount: Number(customAmount) || 0 });
    } catch (err) {
      console.error("Failed to generate PromptPay payload", err);
      return "";
    }
  }, [promptpayID, customAmount]);

  // Filter orders by search query
  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return initialOrders;

    return initialOrders.filter((order) => {
      const name = (order.user.name || "").toLowerCase();
      const email = order.user.email.toLowerCase();
      const orderId = order.id.toLowerCase();
      return name.includes(query) || email.includes(query) || orderId.includes(query);
    });
  }, [initialOrders, searchQuery]);

  // Handle milestone selection
  const resetQrTimer = (minutes = expiryMinutes) => {
    setQrGeneratedAt(new Date());
    setTimeLeft(minutes * 60);
    setQrExpired(false);
  };

  const handleSelectMilestone = (order: Order, milestone: Milestone) => {
    setSelectedOrder(order);
    setSelectedMilestone(milestone);
    setCustomAmount(Number(milestone.amount).toFixed(2));
    setVerificationResult(null);
    resetQrTimer();
    toast.info(`Selected Milestone ${milestone.milestoneOrder} for Order #${order.id.slice(0, 8).toUpperCase()}`);
  };

  const handleClearMilestoneSelection = () => {
    setSelectedMilestone(null);
    setSelectedOrder(null);
    setVerificationResult(null);
    resetQrTimer();
  };

  // Countdown effect
  useEffect(() => {
    if (qrExpired) return;

    const interval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - qrGeneratedAt.getTime()) / 1000);
      const remaining = expiryMinutes * 60 - elapsedSeconds;

      if (remaining <= 0) {
        setTimeLeft(0);
        setQrExpired(true);
        clearInterval(interval);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [qrGeneratedAt, expiryMinutes, qrExpired]);

  useEffect(() => {
    return () => {
      if (isObjectUrl(previewUrl)) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const formatTimeLeft = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleRunUtility = async (utilityType: string) => {
    setUtilityProcessing(utilityType);
    
    const actionPromise = new Promise((resolve) => setTimeout(resolve, 2000));
    
    toast.promise(
      actionPromise,
      {
        loading: `Running ${utilityType} diagnostics simulation...`,
        success: `${utilityType.toUpperCase()} diagnostic ran successfully! (Simulated)`,
        error: `Failed to run ${utilityType} diagnostic.`,
      }
    );

    await actionPromise;
    setUtilityProcessing(null);
  };

  // Drag-and-drop file validations
  const validateAndSetFile = (selectedFile: File) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(selectedFile.type)) {
      toast.error("รูปแบบไฟล์ไม่ถูกต้อง JPG, PNG หรือ WEBP เท่านั้น");
      return;
    }
    const maxSize = 5 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      toast.error("ขนาดไฟล์รูปภาพต้องไม่เกิน 5MB");
      return;
    }
    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
    setVerificationResult(null);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setPreviewUrl(null);
    setVerificationResult(null);
  };

  // Submit to EasySlip verify
  const handleVerifySlip = async () => {
    if (!file) {
      toast.error("กรุณาอัปโหลดรูปภาพสลิปธนาคาร");
      return;
    }

    setIsUploading(true);
    setVerificationResult(null);

    try {
      // 1. Upload to Supabase Storage via Server Action to bypass RLS policies
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await uploadSandboxSlip(formData);
      if (!uploadRes.success || !uploadRes.url) {
        throw new Error(uploadRes.error || "Failed to upload image file on server.");
      }

      const publicUrl = uploadRes.url;

      // 2. Call Server Action
      startTransition(async () => {
        try {
          let res;
          if (selectedMilestone) {
            // Live verification + actual DB complete paid transitions
            res = await verifySlipPaymentAsAdmin(selectedMilestone.id, publicUrl);
          } else {
            // Standalone mode: dry run EasySlip API check
            res = await verifyTestSlip(publicUrl);
          }

          if (res.success) {
            toast.success(
              selectedMilestone 
                ? "ตรวจสอบสลิปและยืนยันการชำระเงินในระบบเสร็จสิ้น!" 
                : "ตรวจสอบสลิปสำเร็จ (ทดสอบ API เท่านั้น)"
            );
            setVerificationResult(res.data || res);
          } else {
            toast.error(res.error || "สลิปไม่ผ่านการตรวจสอบ");
            setVerificationResult({ success: false, error: res.error });
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการตรวจสอบสลิป";
          toast.error(message);
          setVerificationResult({ success: false, error: message });
        } finally {
          setIsUploading(false);
        }
      });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการอัปโหลดไฟล์";
      toast.error(message);
      setVerificationResult({ success: false, error: message });
      setIsUploading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8 items-start">
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-[#1E293B]" role="tablist">
          <button
            onClick={() => setActiveTab("payments")}
            className={cn(
              "px-6 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2",
              activeTab === "payments"
                ? "border-[#B7D1EA] text-[#B7D1EA]"
                : "border-transparent text-gray-400 hover:text-gray-100"
            )}
            role="tab"
            aria-selected={activeTab === "payments"}
          >
            <CreditCard className="w-4 h-4" />
            {t("tabs.payments")}
          </button>
          <button
            onClick={() => setActiveTab("esignature")}
            className={cn(
              "px-6 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer",
              activeTab === "esignature"
                ? "border-[#B7D1EA] text-[#B7D1EA]"
                : "border-transparent text-gray-400 hover:text-gray-100"
            )}
            role="tab"
            aria-selected={activeTab === "esignature"}
          >
            <FileCheck className="w-4 h-4 text-emerald-400" />
            E-Signature Audit Trail
          </button>
          <button
            onClick={() => setActiveTab("utilities")}
            className={cn(
              "px-6 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2",
              activeTab === "utilities"
                ? "border-[#B7D1EA] text-[#B7D1EA]"
                : "border-transparent text-gray-400 hover:text-gray-100"
            )}
            role="tab"
            aria-selected={activeTab === "utilities"}
          >
            <Terminal className="w-4 h-4" />
            {t("tabs.utilities")}
          </button>
        </div>

        {activeTab === "esignature" && <EsignatureSandboxTab />}

        {activeTab === "payments" && (
          <div className="space-y-8">
            {/* Live Interactive Sandbox Console */}
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 shadow-none space-y-6">
              <div>
                <h2 className="text-lg font-black text-[#F8FAFC] font-sans flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-[#B7D1EA]" />
                  {t("console.title")}
                </h2>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  {t("console.description")}
                </p>
              </div>

              {/* Status Header for selected milestones */}
              {selectedMilestone && selectedOrder && (
                <div className="bg-[#B7D1EA]/10 border border-[#B7D1EA]/30 p-4 rounded-xl flex items-center justify-between text-xs">
                  <div className="space-y-1">
                    <span className="font-black text-[#B7D1EA] uppercase tracking-wider block">{t("milestone.linked")}</span>
                    <p className="font-bold text-gray-100">
                      {t("milestone.order", { orderId: selectedOrder.id.slice(0, 8).toUpperCase(), milestone: selectedMilestone.milestoneOrder, name: selectedMilestone.milestoneName })}
                    </p>
                  </div>
                  <button
                    onClick={handleClearMilestoneSelection}
                    className="p-1.5 hover:bg-[#0B1121] rounded-lg text-gray-400"
                    title={t("milestone.unlink")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Interactive QR Generator & Live Uploader Columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* QR Generation Column */}
                <div className="space-y-5">
                  <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">
                    {t("qr.title")}
                  </h3>

                  {/* QR Input Settings */}
                  <div className="space-y-3.5 bg-[#0B1121] p-4 rounded-xl border border-slate-800">
                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider block mb-1">
                        {t("qr.promptPayId")}
                      </label>
                      <div className="relative">
                        <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                        <input
                          type="text"
                          value={promptpayID}
                          onChange={(e) => {
                            setPromptpayID(e.target.value);
                            resetQrTimer();
                          }}
                          className="w-full pl-9 pr-3 py-2 bg-[#0B1121] border border-slate-800 rounded-lg text-xs text-[#F8FAFC] placeholder-slate-500 focus:ring-2 focus:ring-[#B7D1EA] focus:border-transparent outline-none transition"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider block mb-1">
                        {t("qr.paymentValue")}
                      </label>
                      <div className="relative">
                        <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                        <input
                          type="number"
                          step="0.01"
                          value={customAmount}
                          onChange={(e) => {
                            setCustomAmount(e.target.value);
                            resetQrTimer();
                          }}
                          disabled={!!selectedMilestone}
                          className="w-full pl-9 pr-3 py-2 bg-[#0B1121] border border-slate-800 rounded-lg text-xs text-[#F8FAFC] placeholder-slate-500 focus:ring-2 focus:ring-[#B7D1EA] focus:border-transparent outline-none transition disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                      {selectedMilestone && (
                        <span className="text-[9px] text-[#94A3B8] italic mt-0.5 block">
                          {t("qr.lockedAmount")}
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider block mb-1">
                        {t("qr.expiration")}
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="180"
                        value={expiryMinutes}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          const nextMinutes = isNaN(val) || val < 1 ? 1 : val;
                          setExpiryMinutes(nextMinutes);
                          resetQrTimer(nextMinutes);
                        }}
                        className="w-full px-3 py-2 bg-[#0B1121] border border-slate-800 rounded-lg text-xs text-[#F8FAFC] focus:ring-2 focus:ring-[#B7D1EA] focus:border-transparent outline-none transition"
                      />
                    </div>
                  </div>

                  {/* QR Display or Bank Transfer Fallback */}
                  {Number(customAmount) > paymentSettings.promptpayLimit ? (
                    <div className="p-6 bg-[#0B1121] border border-[#1E293B] rounded-xl flex flex-col items-center justify-center space-y-4 relative overflow-hidden text-center">
                      <div className="w-12 h-12 bg-[#0F172A] rounded-full flex items-center justify-center border border-[#1E293B] shadow-none mb-2">
                        <Building className="w-6 h-6 text-[#B7D1EA]" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-[14px] font-black text-gray-100 uppercase tracking-widest">
                          {t("bankTransfer.required")}
                        </h4>
                        <p className="text-[10px] text-gray-400 max-w-[200px] mx-auto leading-relaxed">
                          {t("bankTransfer.limitExceeded", { amount: formatPrice(paymentSettings.promptpayLimit) })}
                        </p>
                      </div>
                      <div className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl p-4 text-left space-y-3 shadow-none">
                        <div>
                          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">{t("bankTransfer.bankName")}</p>
                          <p className="text-xs font-black text-gray-100">{paymentSettings.bankName}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">{t("bankTransfer.accountName")}</p>
                          <p className="text-xs font-black text-gray-100">{paymentSettings.bankAccountName}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">{t("bankTransfer.accountNumber")}</p>
                          <div className="flex items-center justify-between bg-[#0B1121] p-2 rounded-lg border border-[#1E293B] mt-1">
                            <p className="text-sm font-mono font-black text-[#B7D1EA]">{paymentSettings.bankAccountNumber}</p>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(paymentSettings.bankAccountNumber.replace(/[\s-]/g, ""));
                                toast.success(t("bankTransfer.copied"));
                              }}
                              className="p-1.5 bg-[#0F172A] hover:bg-[#0B1121] border border-[#1E293B] rounded-md text-gray-400 transition-colors"
                              title={t("bankTransfer.copyAccountNumber")}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="text-[10px] font-bold text-gray-400 bg-amber-500/10 text-amber-200 px-3 py-2 rounded-lg border border-amber-500/20 w-full flex items-center justify-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {t("bankTransfer.uploadSlip")}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#0B1121] p-4 border border-[#1E293B] rounded-xl flex flex-col items-center justify-center relative overflow-hidden">
                      {/* Premium PromptPay Card */}
                      <div className="w-full max-w-[240px] bg-[#0F172A] rounded-xl shadow-none border border-[#1E293B] overflow-hidden">
                        {/* PromptPay Header */}
                        <div className="bg-[#113566] p-3 flex flex-col items-center justify-center space-y-1">
                          <div className="flex items-center gap-2">
                            {/* Simple simulated PromptPay logo element */}
                            <div className="flex -space-x-1">
                               <div className="w-3 h-3 rounded-full bg-[#0F172A] opacity-90"></div>
                               <div className="w-3 h-3 rounded-full bg-[#B7D1EA] opacity-90"></div>
                            </div>
                            <span className="text-white font-black italic tracking-widest text-sm">PromptPay</span>
                          </div>
                          <span className="text-[9px] text-white/80 font-medium tracking-widest">พร้อมเพย์</span>
                        </div>
                        
                        {/* QR Body */}
                        <div className="p-4 flex flex-col items-center justify-center relative bg-[#0F172A]">
                          <div className="bg-[#0F172A] p-2 border border-[#1E293B] rounded-xl relative">
                            {qrPayload ? (
                              <div className={cn("transition-all flex items-center justify-center", qrExpired && "blur-[4px] opacity-30")}>
                                <QRCodeSVG value={qrPayload} size={140} includeMargin={false} />
                              </div>
                            ) : (
                              <div className="w-[140px] h-[140px] bg-[#0B1121] flex items-center justify-center text-center text-gray-500 text-[9px] p-2 leading-relaxed">
                                Please enter a valid PromptPay ID
                              </div>
                            )}
                            {qrExpired && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0F172A]/60 rounded-xl transition-all z-10">
                                <AlertCircle className="w-8 h-8 text-rose-600 mb-1 drop-shadow-none" />
                                <span className="text-[11px] font-black text-rose-600 uppercase tracking-widest drop-shadow-none">
                                  Expired
                                </span>
                                <button
                                  onClick={() => {
                                    setQrGeneratedAt(new Date());
                                    setTimeLeft(expiryMinutes * 60);
                                    setQrExpired(false);
                                    toast.success("QR Code regenerated");
                                  }}
                                  className="mt-2 px-3 py-1.5 bg-[#113566] hover:bg-[#0a2140] text-white rounded-lg text-[9px] font-black uppercase tracking-wider shadow-none"
                                >
                                  Regenerate
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* PromptPay Footer Details */}
                        <div className="bg-[#0B1121] p-3 border-t border-[#1E293B] flex flex-col items-center justify-center text-center space-y-1.5">
                          <div>
                            <span className="text-[8px] font-black tracking-widest text-gray-500 uppercase block mb-0.5">Reference / Mobile</span>
                            <span className="text-xs font-black tracking-wider text-[#B7D1EA] uppercase">{promptpayID}</span>
                          </div>
                          <div className="w-full h-px bg-[#1E293B]/60 my-1"></div>
                          <div>
                            <span className="text-[8px] font-black tracking-widest text-gray-500 uppercase block mb-0.5">Amount (THB)</span>
                            <h4 className="text-lg font-black text-gray-100 font-mono tracking-tight">{formatPrice(customAmount || 0).replace('THB', '').trim()}</h4>
                          </div>
                        </div>
                      </div>
                      
                      {/* Status row outside card */}
                      <div className="flex items-center justify-between w-full max-w-[240px] mt-3 px-1">
                        <div className="flex items-center gap-1.5">
                          <Clock className={cn("w-3.5 h-3.5", qrExpired ? "text-rose-500" : "text-[#B7D1EA]")} />
                          <span className={cn(
                            "text-[9px] font-mono font-bold uppercase tracking-wider",
                            qrExpired ? "text-rose-400 font-black" : "text-[#94A3B8]"
                          )}>
                            {qrExpired ? "EXPIRED" : `Expires: ${formatTimeLeft(timeLeft)}`}
                          </span>
                        </div>
                        <a 
                          href={`https://promptpay.io/${promptpayID.replace(/[\s-]/g, "")}/${Number(customAmount) || 0.0}.png`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[9px] text-[#94A3B8] hover:text-[#B7D1EA] hover:underline flex items-center justify-center gap-1 font-bold transition-colors"
                        >
                          External Link <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {/* Slip Upload & Check Column */}
                <div className="space-y-5">
                  <h3 className="text-xs font-black text-[#94A3B8] uppercase tracking-widest">
                    2. Upload & Verify Slip
                  </h3>

                  {/* File Upload Zone */}
                  {!previewUrl ? (
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={cn(
                        "relative flex flex-col items-center justify-center w-full aspect-video border border-dashed rounded-xl cursor-pointer transition-all bg-[#0B1121]",
                        dragActive
                          ? "border-[#B7D1EA] bg-[#B7D1EA]/10 scale-[1.01]"
                          : "border-slate-800 hover:border-[#B7D1EA] hover:bg-slate-800/30"
                      )}
                    >
                      <label className="flex flex-col items-center justify-center w-full h-full text-center px-4 cursor-pointer">
                        <Upload className={cn("w-8 h-8 mb-2 transition-colors", dragActive ? "text-[#B7D1EA]" : "text-[#94A3B8]")} />
                        <span className="text-[11px] font-bold text-[#F8FAFC] uppercase tracking-wider block">
                          Drag and Drop Bank Slip
                        </span>
                        <span className="text-[9px] text-[#94A3B8] tracking-wider mt-0.5">
                          JPG, PNG, or WEBP (Max 5MB)
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg, image/png, image/webp"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-800 shadow-none bg-[#0B1121] flex items-center justify-center p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Slip Preview"
                        className="max-h-full max-w-full object-contain rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="absolute top-2.5 right-2.5 bg-black/60 hover:bg-black/85 text-white p-1.5 rounded-full transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Verification Trigger Button */}
                  <button
                    type="button"
                    onClick={handleVerifySlip}
                    disabled={!file || isUploading || isPending}
                    className="w-full bg-[#B7D1EA] hover:bg-[#99BFE3] disabled:bg-slate-800 disabled:text-slate-500 text-[#0F172A] py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                  >
                    {(isUploading || isPending) ? (
                      <>
                        <GsapSpinner className="w-4 h-4 text-[#0F172A]" />
                        <span>Verifying with EasySlip...</span>
                      </>
                    ) : (
                      <span>
                        {selectedMilestone 
                          ? "Verify & Confirm Paid (Real API)" 
                          : "Dry-Run API Verification Only"}
                      </span>
                    )}
                  </button>

                  <div className="text-[9px] text-[#94A3B8] leading-relaxed bg-[#0B1121] p-3 rounded-xl border border-slate-800 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-[#94A3B8] shrink-0 mt-0.5" />
                    <p>
                      {selectedMilestone 
                        ? "Milestone mode will upload your slip, verify details against EasySlip, write mock tables, update milestone status, and revalidate."
                        : "Dry-run mode calls EasySlip directly to read details but does not modify the database or mark any order paid."}
                    </p>
                  </div>
                </div>
              </div>

              {/* JSON verification callback response */}
	              {verificationResult && (
	                <GsapReveal className="border border-slate-800 rounded-xl overflow-hidden space-y-0.5">
                  <div className="p-4 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-[#B7D1EA]" />
                      <h4 className="text-xs font-black text-[#F8FAFC] uppercase tracking-wider">
                        EasySlip Callback Response (JSON)
                      </h4>
                    </div>
                    <span className={cn(
                      "px-2.5 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-wider",
                      verificationResult.success !== false
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                    )}>
                      {verificationResult.success !== false ? "SUCCESS / PAID" : "ERROR"}
                    </span>
                  </div>
                  <div className="p-4 bg-[#0B1121] font-mono text-[10px] text-emerald-300 leading-relaxed overflow-x-auto">
                    <pre>
                      <code>{JSON.stringify(verificationResult, null, 2)}</code>
                    </pre>
                  </div>
	                </GsapReveal>
	              )}
            </div>

            {/* List of Active Milestones in Sandbox */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-[#B7D1EA]">
                  Active Unpaid Milestones List
                </h3>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  Select a milestone from the list to load it into the Live Sandbox verification cockpit.
                </p>
              </div>

              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <input
                  type="text"
                  placeholder="Filter milestones list by name, email, or order ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-800 bg-[#0B1121] text-xs text-[#F8FAFC] placeholder-slate-500 focus:ring-2 focus:ring-[#B7D1EA] focus:border-transparent outline-none transition"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredOrders.flatMap(order => 
                  order.paymentMilestones
                    .filter(m => m.status !== "PAID")
                    .map(milestone => (
                      <button
                        key={milestone.id}
                        onClick={() => handleSelectMilestone(order, milestone)}
                        className={cn(
                          "w-full text-left rounded-xl border p-4 transition-all bg-[#0F172A] hover:border-[#B7D1EA] shadow-none flex flex-col justify-between gap-3 text-[#F8FAFC]",
                          selectedMilestone?.id === milestone.id ? "border-[#B7D1EA] ring-1 ring-[#B7D1EA]" : "border-slate-800"
                        )}
                      >
                        <div className="flex justify-between items-start gap-4 w-full">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-black uppercase tracking-wider text-[#B7D1EA]">
                                ORDER #{order.id.slice(0, 8).toUpperCase()}
                              </span>
                              <span className="text-[9px] font-black text-gray-500">
                                งวดที่ {milestone.milestoneOrder}
                              </span>
                            </div>
                            <h4 className="text-xs font-bold text-gray-100 leading-snug">
                              {milestone.milestoneName}
                            </h4>
                            <p className="text-[9px] text-gray-400 font-bold font-mono">
                              ลูกค้า: {order.user.name || "Unnamed"} ({order.user.email})
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-gray-100 font-mono block">
                              {formatPrice(milestone.amount)}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))
                )}
                {filteredOrders.length === 0 && (
                  <div className="col-span-2 text-center py-6 text-gray-500 italic text-xs">
                    No active unpaid milestones matched.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "utilities" && (
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-6 shadow-none space-y-6">
            <div>
              <h2 className="text-lg font-black text-gray-100 font-sans flex items-center gap-2">
                <Terminal className="w-5 h-5 text-[#B7D1EA]" />
                Diagnostics & Sandbox Operations
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Simulate backend processes, triggers, and diagnostic testing slots.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Cron Card */}
              <div className="border border-[#1E293B] bg-[#0B1121]/70 p-5 rounded-xl flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-100 text-cyan-700 text-[8px] font-black uppercase tracking-wider rounded">CRON ENGINE</span>
                  <h3 className="text-sm font-bold text-gray-100">Payment Reminder Warnings</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Triggers the notification reminder worker loop. Iterates active/overdue payment milestones, parses due dates, and queues customer notification records (EMAIL/SMS).
                  </p>
                </div>
                <button
                  onClick={() => handleRunUtility("cron")}
                  disabled={utilityProcessing !== null}
                  className="w-full min-h-10 text-xs font-bold uppercase tracking-wider rounded-xl border border-[#1E293B] bg-[#0F172A] hover:bg-[#0B1121] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Activity className="w-3.5 h-3.5" />
                  Run Notification cron
                </button>
              </div>

              {/* Ingestion Card */}
              <div className="border border-[#1E293B] bg-[#0B1121]/70 p-5 rounded-xl flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <span className="px-2 py-0.5 bg-orange-50 border border-orange-100 text-orange-700 text-[8px] font-black uppercase tracking-wider rounded">INGESTION</span>
                  <h3 className="text-sm font-bold text-gray-100">Catalog Cache Reset</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Clears temporary local storage catalog cache and triggers a silent, incremental update from catalog synchronizers.
                  </p>
                </div>
                <button
                  onClick={() => handleRunUtility("ingestion")}
                  disabled={utilityProcessing !== null}
                  className="w-full min-h-10 text-xs font-bold uppercase tracking-wider rounded-xl border border-[#1E293B] bg-[#0F172A] hover:bg-[#0B1121] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  Reset Catalog Cache
                </button>
              </div>

              {/* Listmonk diagnostic */}
              <div className="border border-[#1E293B] bg-[#0B1121]/70 p-5 rounded-xl flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[8px] font-black uppercase tracking-wider rounded">DIAGNOSTIC</span>
                  <h3 className="text-sm font-bold text-gray-100">Listmonk Delivery Check</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Simulates a Listmonk delivery configuration check. Use Email automation to send a real test with a transactional template.
                  </p>
                </div>
                <button
                  onClick={() => handleRunUtility("email")}
                  disabled={utilityProcessing !== null}
                  className="w-full min-h-10 text-xs font-bold uppercase tracking-wider rounded-xl border border-[#1E293B] bg-[#0F172A] hover:bg-[#0B1121] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Check Listmonk Delivery
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar Panel Column */}
      <div className="space-y-6">
        {/* Environment Keys Status */}
        <div className="border border-[#1E293B] bg-[#0F172A] rounded-xl p-5 space-y-4 shadow-none">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-[#B7D1EA] flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-[#B7D1EA]" />
              Environment Checker (.env)
            </h3>
            <p className="text-[10px] text-gray-400 mt-0.5 font-medium">
              Current environment variables verification status on the server.
            </p>
          </div>

          <div className="space-y-3.5 max-h-[480px] overflow-y-auto pr-1">
            {/* Payments Group */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Payments & EasySlip</span>
              <div className="space-y-1">
                {["NEXT_PUBLIC_PROMPTPAY_ID", "COMPANY_BANK_ACCOUNT", "EASYSLIP_API_KEY"].map((key) => (
                  <div key={key} className="flex items-center justify-between text-[11px] py-0.5">
                    <span className="font-mono text-gray-400 truncate max-w-[210px]" title={key}>{key}</span>
                    {envStatus[key] ? (
                      <span className="flex items-center gap-1 text-emerald-600 font-bold text-[9px] bg-emerald-500/10 border border-emerald-100 px-1.5 py-0.5 rounded-full uppercase">
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-600 font-bold text-[9px] bg-rose-500/10 border border-rose-100 px-1.5 py-0.5 rounded-full uppercase">
                        Missing
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Database & Supabase */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Database & Supabase</span>
              <div className="space-y-1">
                {["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].map((key) => (
                  <div key={key} className="flex items-center justify-between text-[11px] py-0.5">
                    <span className="font-mono text-gray-400 truncate max-w-[210px]" title={key}>{key}</span>
                    {envStatus[key] ? (
                      <span className="flex items-center gap-1 text-emerald-600 font-bold text-[9px] bg-emerald-500/10 border border-emerald-100 px-1.5 py-0.5 rounded-full uppercase">
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-600 font-bold text-[9px] bg-rose-500/10 border border-rose-100 px-1.5 py-0.5 rounded-full uppercase">
                        Missing
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Google Services */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">Google Drive API</span>
              <div className="space-y-1">
                {["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_DRIVE_ROOT_FOLDER_ID"].map((key) => (
                  <div key={key} className="flex items-center justify-between text-[11px] py-0.5">
                    <span className="font-mono text-gray-400 truncate max-w-[210px]" title={key}>{key}</span>
                    {envStatus[key] ? (
                      <span className="flex items-center gap-1 text-emerald-600 font-bold text-[9px] bg-emerald-500/10 border border-emerald-100 px-1.5 py-0.5 rounded-full uppercase">
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-600 font-bold text-[9px] bg-rose-500/10 border border-rose-100 px-1.5 py-0.5 rounded-full uppercase">
                        Missing
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Integrations */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">ERPNext & Pusher</span>
              <div className="space-y-1">
                {["ERPNEXT_BASE_URL", "ERPNEXT_API_KEY", "ERPNEXT_API_SECRET", "PUSHER_APP_ID", "CRON_SECRET"].map((key) => (
                  <div key={key} className="flex items-center justify-between text-[11px] py-0.5">
                    <span className="font-mono text-gray-400 truncate max-w-[210px]" title={key}>{key}</span>
                    {envStatus[key] ? (
                      <span className="flex items-center gap-1 text-emerald-600 font-bold text-[9px] bg-emerald-500/10 border border-emerald-100 px-1.5 py-0.5 rounded-full uppercase">
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-600 font-bold text-[9px] bg-rose-500/10 border border-rose-100 px-1.5 py-0.5 rounded-full uppercase">
                        Missing
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Info Panel */}
        <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-[#B7D1EA] flex items-center gap-1.5">
            <Info className="w-4 h-4 text-[#B7D1EA]" />
            Sandbox Guidelines
          </h3>
          
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            The Developer Sandbox is a restricted utility intended solely for staging, local testing, and developer verification.
          </p>

          <ul className="space-y-2 text-xs text-[#94A3B8] list-disc list-inside">
            <li>Fulfillments bypassing EasySlip write transaction records directly as <code className="bg-slate-800 px-1 rounded text-[#F8FAFC] font-bold">SIMULATED</code>.</li>
            <li>Revalidation cascades updates instantly.</li>
            <li>Listmonk credentials are server-only environment settings.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
