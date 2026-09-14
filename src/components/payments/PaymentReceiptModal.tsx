"use client";

import { useRef } from "react";
import {
  CheckCircle2,
  FileCheck,
  Printer,
  ShieldCheck,
  X,
} from "@/components/ui/icons";
import { formatPrice } from "@/lib/utils";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog";

export interface ReceiptPaymentRequestData {
  id: string;
  proposalId?: string;
  title: string;
  amountRequested: number | string;
  paymentType?: string;
  paymentMethod?: string;
  status: string;
  slipUrl?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  createdAt?: string | null;
  easySlipData?: Record<string, unknown> | null;
}

export interface ReceiptCustomerInfo {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  proposalCode?: string | null;
  systemKwp?: number | null;
}

interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentRequest: ReceiptPaymentRequestData | null;
  customerInfo?: ReceiptCustomerInfo;
}

function formatMoney(amount: number | string) {
  const num = typeof amount === "number" ? amount : Number(String(amount || "0").replace(/,/g, ""));
  return formatPrice(Number.isFinite(num) ? num : 0);
}

export default function PaymentReceiptModal({
  isOpen,
  onClose,
  paymentRequest,
  customerInfo,
}: PaymentReceiptModalProps) {
  const printContentRef = useRef<HTMLDivElement | null>(null);

  if (!paymentRequest) return null;

  const numAmount = typeof paymentRequest.amountRequested === "number"
    ? paymentRequest.amountRequested
    : Number(String(paymentRequest.amountRequested || "0").replace(/,/g, ""));

  const vatAmount = Math.round((numAmount * 7) / 107);
  const beforeVatAmount = numAmount - vatAmount;

  const receiptNo = `REC-${paymentRequest.id.slice(0, 8).toUpperCase()}`;
  const paidDate = paymentRequest.verifiedAt
    ? new Date(paymentRequest.verifiedAt).toLocaleDateString("th-TH", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : new Date().toLocaleDateString("th-TH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  const handlePrint = () => {
    window.print();
  };

  const transRef = typeof paymentRequest.easySlipData?.transRef === "string"
    ? paymentRequest.easySlipData.transRef
    : `TR-${paymentRequest.id.slice(0, 10).toUpperCase()}`;

  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="md">
      <DialogContent className="bg-[#F0EEE9] text-[#2E2C27] max-w-3xl border border-[#F7F6F3] shadow-2xl p-0 overflow-hidden rounded-[28px]">
        {/* Modal Header Toolbar */}
        <DialogHeader className="border-b border-[#F7F6F3] bg-[#E6E3DC] px-6 py-4 flex flex-row items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-[#4F7FA8]" />
            <h2 className="text-base font-black text-[#2E2C27]">
              ใบเสร็จรับเงิน / Payment Receipt & Tax Invoice
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-4 py-1.5 text-xs font-bold text-[#2E2C27] transition hover:bg-[#DCE8F5] cursor-pointer shadow-xs active:scale-95"
            >
              <Printer className="h-4 w-4 text-[#4E4B44]" />
              <span>พิมพ์ / สั่งพิมพ์ใบเสร็จ</span>
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
            {/* Header Document Company Seal */}
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
                <span className="inline-block rounded-full bg-emerald-50 px-3.5 py-1 text-xs font-black text-emerald-800 border border-emerald-200 print:bg-emerald-50 print:text-emerald-800">
                  RECEIPT / ใบเสร็จรับเงิน
                </span>
                <p className="text-sm font-black text-[#2E2C27] print:text-black font-mono pt-1">
                  เลขที่ใบเสร็จ: {receiptNo}
                </p>
                <p className="text-xs font-medium text-[#4E4B44] print:text-slate-600">
                  วันที่ชำระเงิน: {paidDate}
                </p>
                <p className="text-[11px] font-mono text-[#8E8B83] print:text-slate-600">
                  อ้างอิงธุรกรรม: {transRef}
                </p>
              </div>
            </div>

            {/* Customer & System Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-[20px] bg-[#E6E3DC] border border-[#F7F6F3] print:bg-slate-50 print:border-slate-200 p-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#8E8B83] print:text-slate-600">
                  ผู้รับบริการ / Received From
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
              </div>

              <div className="space-y-1 text-left md:text-right">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#8E8B83] print:text-slate-600">
                  โครงการ / Project Reference
                </p>
                <p className="text-sm font-black text-[#2E2C27] print:text-black font-mono">
                  {customerInfo?.proposalCode || `PROPOSAL-${paymentRequest.proposalId?.slice(0, 8).toUpperCase() || "SOLAR"}`}
                </p>
                {customerInfo?.systemKwp && (
                  <p className="text-xs font-medium text-[#4E4B44] print:text-slate-700">
                    ขนาดระบบ: {customerInfo.systemKwp} kWp Solar System
                  </p>
                )}
                <p className="text-xs font-medium text-emerald-700 print:text-emerald-700 font-bold">
                  ✓ ชำระแล้วผ่าน {paymentRequest.paymentMethod === "BANK_TRANSFER" ? "โอนผ่านธนาคาร" : "PromptPay QR"}
                </p>
              </div>
            </div>

            {/* Receipt Table */}
            <div className="rounded-[20px] border border-[#F7F6F3] print:border-slate-300 overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#E6E3DC] text-[#4E4B44] print:bg-slate-100 print:text-slate-700 text-[10px] font-black uppercase tracking-wider border-b border-[#F7F6F3] print:border-slate-300">
                    <th className="p-3.5">รายการรับชำระ / Paid Description</th>
                    <th className="p-3.5 text-right">มูลค่าก่อน VAT</th>
                    <th className="p-3.5 text-right">VAT (7%)</th>
                    <th className="p-3.5 text-right">รับชำระสุทธิ (THB)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F7F6F3] print:divide-slate-200 bg-[#F0EEE9] print:bg-white font-medium">
                  <tr>
                    <td className="p-3.5">
                      <p className="font-bold text-[#2E2C27] print:text-black text-sm">
                        {paymentRequest.title}
                      </p>
                      <p className="text-[11px] text-[#4E4B44] print:text-slate-600 mt-0.5">
                        รับชำระค่างวดการจัดหาและติดตั้งระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์
                      </p>
                    </td>
                    <td className="p-3.5 text-right font-mono text-[#4E4B44] print:text-slate-700">
                      {formatMoney(beforeVatAmount)}
                    </td>
                    <td className="p-3.5 text-right font-mono text-[#4E4B44] print:text-slate-700">
                      {formatMoney(vatAmount)}
                    </td>
                    <td className="p-3.5 text-right font-black font-mono text-sm text-emerald-700 print:text-slate-950">
                      {formatMoney(numAmount)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-[#E6E3DC] print:bg-slate-100 border-t border-[#F7F6F3] print:border-slate-300">
                    <td colSpan={3} className="p-3.5 text-right font-bold text-[#4E4B44] print:text-slate-700">
                      รวมเงินรับชำระทั้งสิ้น (Total Paid Amount):
                    </td>
                    <td className="p-3.5 text-right font-black font-mono text-base text-[#4F7FA8] print:text-black">
                      {formatMoney(numAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Official Digital Signature & EasySlip Verification Seal */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-[20px] border border-emerald-200 bg-emerald-50/50 print:border-slate-300 print:bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-black text-emerald-800 print:text-slate-900">
                    ยืนยันการรับชำระเงินและตรวจสอบสลิปอัตโนมัติแล้ว (Verified by EasySlip & SolarDream Audit)
                  </p>
                  <p className="text-[11px] text-[#4E4B44] print:text-slate-600 mt-0.5">
                    ตรวจสอบโดย: {paymentRequest.verifiedBy || "SolarDream Automated Payment Engine"} | {paidDate}
                  </p>
                </div>
              </div>

              {/* Digital Stamp */}
              <div className="border-2 border-dashed border-emerald-600 text-emerald-700 rounded-full px-5 py-2 text-center font-black uppercase text-xs tracking-wider transform -rotate-2 print:border-slate-900 print:text-slate-900">
                ✓ PAID & VERIFIED
              </div>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
