import { useState, useId, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Landmark,
  Printer,
  QrCode,
  Share2,
  ShieldCheck,
  Tag,
  Upload,
  X,
} from "@/components/ui/icons";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils";
import { buildPromptPayPayload } from "@/lib/promptpay";
import { applyPaymentPromoCodeAction } from "@/app/actions/paymentRequests";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog";

export interface InvoicePaymentRequestData {
  id: string;
  proposalId?: string;
  title: string;
  amountRequested: number | string;
  paymentType?: string;
  paymentMethod?: string;
  status: "PENDING" | "AWAITING_VERIFICATION" | "PAID" | "EXPIRED" | "FAILED" | string;
  slipUrl?: string | null;
  slipImageUrl?: string | null;
  verifiedAt?: string | null;
  createdAt?: string | null;
}

export interface InvoiceCustomerInfo {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  proposalCode?: string | null;
  systemKwp?: number | null;
}

interface PaymentInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentRequest: InvoicePaymentRequestData | null;
  customerInfo?: InvoiceCustomerInfo;
  onUploadSlip?: (paymentRequestId: string, file: File) => void | Promise<void>;
  isUploading?: boolean;
}

function formatMoney(amount: number | string) {
  const num = typeof amount === "number" ? amount : Number(String(amount || "0").replace(/,/g, ""));
  return formatPrice(Number.isFinite(num) ? num : 0);
}

export default function PaymentInvoiceModal({
  isOpen,
  onClose,
  paymentRequest,
  customerInfo,
  onUploadSlip,
  isUploading = false,
}: PaymentInvoiceModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const printContentRef = useRef<HTMLDivElement | null>(null);
  const fileInputId = useId();

  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  if (!paymentRequest) return null;

  const numAmount = typeof paymentRequest.amountRequested === "number"
    ? paymentRequest.amountRequested
    : Number(String(paymentRequest.amountRequested || "0").replace(/,/g, ""));
  const qrPayload = buildPromptPayPayload(numAmount);

  const invoiceNo = `INV-${paymentRequest.id.slice(0, 8).toUpperCase()}`;
  const issueDate = paymentRequest.createdAt
    ? new Date(paymentRequest.createdAt).toLocaleDateString("th-TH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString("th-TH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  const handlePrint = () => {
    window.print();
  };

  const handleCopyShareLink = () => {
    const message = `☀️ SolarDream ใบแจ้งชำระเงิน (${paymentRequest.title})\nยอดชำระ: ${formatMoney(numAmount)}\nเลขที่ใบแจ้งชำระ: ${invoiceNo}\nกรุณาชำระเงินผ่าน QR PromptPay หรือ บัญชีธนาคารกสิกรไทย 123-4-56789-0`;
    navigator.clipboard.writeText(message);
    setCopiedShareLink(true);
    toast.success("คัดลอกข้อความแจ้งชำระเงินเรียบร้อยแล้ว");
    setTimeout(() => setCopiedShareLink(false), 2500);
  };

  const handleApplyPromo = async () => {
    if (!promoCodeInput.trim()) return;
    setIsApplyingPromo(true);
    const result = await applyPaymentPromoCodeAction(paymentRequest.id, promoCodeInput);
    setIsApplyingPromo(false);

    if (!result.success) {
      toast.error(result.error || "ไม่สามารถใช้ส่วนลดนี้ได้");
      return;
    }

    toast.success(`ปรับใช้ส่วนลดสำเร็จ! ประหยัด ${result.discountAmount?.toLocaleString()} บาท`);
    setPromoCodeInput("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadSlip) {
      void onUploadSlip(paymentRequest.id, file);
    }
  };

  const isPaid = paymentRequest.status === "PAID";
  const isAwaiting = paymentRequest.status === "AWAITING_VERIFICATION";

  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="md">
      <DialogContent className="bg-[#F0EEE9] text-[#2E2C27] max-w-3xl border border-[#F7F6F3] shadow-2xl p-0 overflow-hidden rounded-[28px]">
        {/* Modal Toolbar (Non-printable) */}
        <DialogHeader className="border-b border-[#F7F6F3] bg-[#E6E3DC] px-6 py-4 flex flex-row items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#4F7FA8]" />
            <h2 className="text-base font-black text-[#2E2C27]">
              ใบแจ้งชำระเงิน / Invoice & Payment Notice
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyShareLink}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-3.5 py-1.5 text-xs font-bold text-[#2E2C27] transition hover:bg-[#DCE8F5] cursor-pointer shadow-xs active:scale-95"
            >
              {copiedShareLink ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4 text-[#4F7FA8]" />}
              <span>{copiedShareLink ? "คัดลอกแล้ว" : "แชร์ให้ลูกค้า"}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-3.5 py-1.5 text-xs font-bold text-[#2E2C27] transition hover:bg-[#DCE8F5] cursor-pointer shadow-xs active:scale-95"
            >
              <Printer className="h-4 w-4 text-[#4E4B44]" />
              <span>พิมพ์ / สั่งพิมพ์</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-[#4E4B44] hover:bg-[#DCE8F5] hover:text-[#2E2C27] transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <DialogBody className="p-6 md:p-8 space-y-6 max-h-[85vh] overflow-y-auto print:p-0 print:overflow-visible print:bg-white print:text-black">
          <div ref={printContentRef} className="space-y-6">
          {/* Document Printable Header */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 border-b border-[#F7F6F3] print:border-slate-300 pb-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#B7D1EA] text-white font-black flex items-center justify-center text-lg shadow-md">
                  SD
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-tight text-[#2E2C27] print:text-black">
                    SolarDream (Thailand) Co., Ltd.
                  </h1>
                  <p className="text-xs font-semibold text-[#4E4B44] print:text-slate-600">
                    บริษัท โซลาร์ดรีม (ประเทศไทย) จำกัด (สำนักงานใหญ่)
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-[#4E4B44] print:text-slate-600 leading-relaxed max-w-md">
                88/1 อาคารวิศวกรรมพลังงานสะอาด ถ.สุขุมวิท กรุงเทพมหานคร 10110<br />
                เลขประจำตัวผู้เสียภาษี: 0105566088991 | โทร. 02-123-4567
              </p>
            </div>

            <div className="text-left md:text-right space-y-1">
              <span className="inline-block rounded-full bg-[#DCE8F5] px-3 py-1 text-xs font-black text-[#2E2C27] border border-[#CBC7BE] print:bg-slate-100 print:text-slate-800">
                INVOICE / ใบแจ้งชำระเงิน
              </span>
              <p className="text-sm font-black text-[#2E2C27] print:text-black font-mono pt-1">
                เลขที่: {invoiceNo}
              </p>
              <p className="text-xs font-medium text-[#4E4B44] print:text-slate-600">
                วันที่ออกเอกสาร: {issueDate}
              </p>
              <div className="pt-2">
                {isPaid ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-xs font-black">
                    <CheckCircle2 className="h-4 w-4" />
                    ชำระเงินเรียบร้อยแล้ว (PAID)
                  </span>
                ) : isAwaiting ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 text-xs font-black">
                    <Clock className="h-4 w-4" />
                    รอตรวจสอบสลิปการโอน
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1 text-xs font-black">
                    รอการชำระเงิน (UNPAID)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Customer & Proposal Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-[20px] bg-[#E6E3DC] border border-[#F7F6F3] print:bg-slate-50 print:border-slate-200 p-4">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#8E8B83] print:text-slate-600">
                ข้อมูลผู้ชำระเงิน / Billed To
              </p>
              <p className="text-sm font-black text-[#2E2C27] print:text-black">
                {customerInfo?.name || "ลูกค้าผู้ทรงเกียรติ / Client Account"}
              </p>
              {customerInfo?.email && (
                <p className="text-xs font-medium text-[#4E4B44] print:text-slate-700">
                  อีเมล: {customerInfo.email}
                </p>
              )}
              {customerInfo?.phone && (
                <p className="text-xs font-medium text-[#4E4B44] print:text-slate-700">
                  เบอร์โทร: {customerInfo.phone}
                </p>
              )}
              {customerInfo?.address && (
                <p className="text-xs font-medium text-[#4E4B44] print:text-slate-600 leading-relaxed">
                  สถานที่ติดตั้ง: {customerInfo.address}
                </p>
              )}
            </div>

            <div className="space-y-1 text-left md:text-right">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#8E8B83] print:text-slate-600">
                อ้างอิงโครงการ / Project Reference
              </p>
              <p className="text-sm font-black text-[#2E2C27] print:text-black font-mono">
                {customerInfo?.proposalCode || `PROPOSAL-${paymentRequest.proposalId?.slice(0, 8).toUpperCase() || "SOLAR"}`}
              </p>
              {customerInfo?.systemKwp && (
                <p className="text-xs font-medium text-[#4E4B44] print:text-slate-700">
                  ขนาดระบบ: {customerInfo.systemKwp} kWp Solar System
                </p>
              )}
              <p className="text-xs font-medium text-[#4E4B44] print:text-slate-600">
                รูปแบบการชำระ: {paymentRequest.paymentType === "FULL" ? "ชำระเต็มจำนวน" : "ชำระแบบแบ่งงวด (Installment)"}
              </p>
            </div>
          </div>

          {/* Payment Item Table */}
          <div className="rounded-[20px] border border-[#F7F6F3] print:border-slate-300 overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#E6E3DC] text-[#4E4B44] print:bg-slate-100 print:text-slate-700 text-[10px] font-black uppercase tracking-wider border-b border-[#F7F6F3] print:border-slate-300">
                  <th className="p-3.5">รายการชำระเงิน / Description</th>
                  <th className="p-3.5 text-center">วิธีชำระ</th>
                  <th className="p-3.5 text-right">จำนวนเงิน (THB)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F7F6F3] print:divide-slate-200 bg-[#F0EEE9] print:bg-white font-medium">
                <tr>
                  <td className="p-3.5">
                    <p className="font-bold text-[#2E2C27] print:text-black text-sm">
                      {paymentRequest.title}
                    </p>
                    <p className="text-[11px] text-[#4E4B44] print:text-slate-600 mt-0.5">
                      ค่างวดตามสัญญาการติดตั้งและจัดหาอุปกรณ์ระบบโซลาร์เซลล์
                    </p>
                  </td>
                  <td className="p-3.5 text-center">
                    <span className="inline-block rounded-full bg-[#DCE8F5] print:bg-slate-200 px-3 py-1 text-[11px] font-bold text-[#2E2C27] print:text-slate-800">
                      {paymentRequest.paymentMethod === "BANK_TRANSFER" ? "โอนผ่านธนาคาร" : "สแกน QR PromptPay"}
                    </span>
                  </td>
                  <td className="p-3.5 text-right font-black font-mono text-sm text-[#2E2C27] print:text-black">
                    {formatMoney(numAmount)}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="bg-[#E6E3DC] print:bg-slate-100 border-t border-[#F7F6F3] print:border-slate-300">
                  <td colSpan={2} className="p-3.5 text-right font-bold text-[#4E4B44] print:text-slate-700">
                    ยอดรวมสุทธิที่ต้องชำระ (Total Net Amount Payable):
                  </td>
                  <td className="p-3.5 text-right font-black font-mono text-base text-[#4F7FA8] print:text-black">
                    {formatMoney(numAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Promo Code Box (Non-printable) */}
          {!isPaid && (
            <div className="rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC] p-4 print:hidden flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#2E2C27]">
                <Tag className="h-4 w-4 text-[#4F7FA8]" />
                <span>มีคูปองส่วนลด? (Promo Code)</span>
                <span className="text-[10px] text-[#4E4B44] font-normal">ลองใช้: SOLAR2026, EARLYBIRD</span>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <input
                  type="text"
                  value={promoCodeInput}
                  onChange={(e) => setPromoCodeInput(e.target.value)}
                  placeholder="กรอกรหัสส่วนลด"
                  className="rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-4 py-2 text-xs text-[#2E2C27] uppercase placeholder:normal-case outline-none focus:border-[#7CA8D0] font-mono flex-1 md:w-40"
                />
                <button
                  type="button"
                  onClick={handleApplyPromo}
                  disabled={isApplyingPromo || !promoCodeInput.trim()}
                  className="rounded-full bg-[#B7D1EA] hover:bg-[#A5C2DE] px-5 py-2 text-xs font-black text-white transition disabled:opacity-50 cursor-pointer shrink-0 active:scale-95 shadow-sm"
                >
                  {isApplyingPromo ? "กำลังตรวจสอบ..." : "ใช้ส่วนลด"}
                </button>
              </div>
            </div>
          )}

          {/* Payment Methods: Dynamic PromptPay QR + Official Bank Details */}
          {!isPaid && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-[20px] border border-[#F7F6F3] print:border-slate-300 p-5 bg-[#E6E3DC]/50 print:bg-slate-50">
              {/* Dynamic QR PromptPay */}
              <div className="flex flex-col items-center justify-center p-4 bg-[#F0EEE9] border border-[#F7F6F3] rounded-[20px] text-[#2E2C27] text-center shadow-sm">
                <div className="flex items-center gap-1.5 text-xs font-black text-[#4F7FA8] uppercase mb-2">
                  <QrCode className="h-4 w-4" />
                  <span>PromptPay QR Code</span>
                </div>
                {qrPayload ? (
                  <QRCodeSVG value={qrPayload} size={150} level="M" />
                ) : (
                  <div className="h-36 w-36 bg-[#F7F6F3] rounded-lg flex items-center justify-center text-xs font-bold text-[#8E8B83]">
                    ไม่พบข้อมูล QR
                  </div>
                )}
                <p className="mt-2 text-[11px] font-black text-[#2E2C27]">
                  สแกนชำระเงิน {formatMoney(numAmount)}
                </p>
                <p className="text-[10px] text-[#4E4B44] font-semibold">
                  รองรับทุกแอปธนาคารไทย (ไม่เสียค่าธรรมเนียม)
                </p>
              </div>

              {/* Official Bank Account Details */}
              <div className="flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-black text-[#4F7FA8] print:text-slate-800 uppercase mb-2">
                    <Landmark className="h-4 w-4" />
                    <span>บัญชีธนาคารสำหรับโอนเงิน</span>
                  </div>

                  <div className="space-y-2 rounded-[20px] bg-[#F0EEE9] print:bg-white border border-[#F7F6F3] print:border-slate-200 p-4 text-xs shadow-xs">
                    <div>
                      <p className="text-[10px] font-bold text-[#8E8B83] print:text-slate-500 uppercase">ธนาคาร (Bank)</p>
                      <p className="font-black text-[#2E2C27] print:text-black">ธนาคารกสิกรไทย (KBank)</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-[#8E8B83] print:text-slate-500 uppercase">ชื่อบัญชี (Account Name)</p>
                      <p className="font-black text-[#2E2C27] print:text-black">บจก. โซลาร์ดรีม (ประเทศไทย)</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-[#8E8B83] print:text-slate-500 uppercase">เลขที่บัญชี (Account No.)</p>
                      <p className="font-black text-[#4F7FA8] print:text-slate-900 font-mono text-sm">
                        123-4-56789-0
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-semibold text-[#4E4B44] print:text-slate-600">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>ระบบตรวจสลิปอัตโนมัติ EasySlip ตลอด 24 ชม.</span>
                </div>
              </div>
            </div>
          )}

          {/* Slip Action Section */}
          <div className="rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC] p-4 flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
            <div>
              <p className="text-xs font-black text-[#2E2C27]">
                หลักฐานการชำระเงิน (Payment Slip)
              </p>
              <p className="text-xs font-semibold text-[#4E4B44] mt-0.5">
                {paymentRequest.slipUrl
                  ? "มีการแนบหลักฐานการโอนเรียบร้อยแล้ว"
                  : "กรุณาอัปโหลดสลิปหลังโอนเงินเพื่อยืนยันยอด"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {paymentRequest.slipUrl && (
                <a
                  href={paymentRequest.slipUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-4 py-2 text-xs font-black text-[#2E2C27] transition hover:bg-[#DCE8F5] cursor-pointer active:scale-95 shadow-xs"
                >
                  <ExternalLink className="h-4 w-4 text-[#4F7FA8]" />
                  <span>ดูสลิปที่อัปโหลด</span>
                </a>
              )}

              {onUploadSlip && (
                <>
                  <input
                    ref={fileInputRef}
                    id={fileInputId}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#B7D1EA] hover:bg-[#A5C2DE] text-white px-5 py-2.5 text-xs font-black transition cursor-pointer disabled:opacity-50 active:scale-95 shadow-sm"
                  >
                    <Upload className="h-4 w-4" />
                    <span>{isUploading ? "กำลังอัปโหลด..." : "แนบ / เปลี่ยนสลิปการโอน"}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
