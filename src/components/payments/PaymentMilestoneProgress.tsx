"use client";

import { CheckCircle2, Clock, ShieldCheck, Wallet } from "@/components/ui/icons";
import { formatPrice } from "@/lib/utils";
import StatusBadge from "@/components/ui/StatusBadge";
import type { ClientPaymentRequest } from "@/components/proposals/portalTypes";

interface PaymentMilestoneProgressProps {
  totalProjectPrice: number;
  paymentRequests: ClientPaymentRequest[];
  onSelectMilestone?: (request: ClientPaymentRequest) => void;
}

function toNumber(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(String(value || "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function PaymentMilestoneProgress({
  totalProjectPrice,
  paymentRequests,
  onSelectMilestone,
}: PaymentMilestoneProgressProps) {
  const totalPaid = paymentRequests
    .filter((req) => req.status === "PAID")
    .reduce((acc, req) => acc + toNumber(req.amountRequested), 0);

  const remainingBalance = Math.max(0, totalProjectPrice - totalPaid);
  const paidPercent = totalProjectPrice > 0
    ? Math.min(100, Math.round((totalPaid / totalProjectPrice) * 100))
    : 0;

  const defaultMilestones = [
    {
      stage: 1,
      title: "มัดจำทำสัญญา",
      percentLabel: "30%",
      expectedPercent: 30,
      description: "เริ่มต้นจองคิววิศวกรและยื่นขออนุญาตขนานไฟ",
    },
    {
      stage: 2,
      title: "วันส่งมอบอุปกรณ์และติดตั้ง",
      percentLabel: "60%",
      expectedPercent: 60,
      description: "จัดส่งแผงโซลาร์ อินเวอร์เตอร์ และเข้าดำเนินการติดตั้ง",
    },
    {
      stage: 3,
      title: "วันทดสอบและเปิดใช้งานระบบ",
      percentLabel: "10%",
      expectedPercent: 10,
      description: "ตรวจสอบความปลอดภัยและเปิดใช้งานระบบเต็มรูปแบบ",
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-[#F5F2EB] p-5 md:p-6 shadow-xs space-y-6">
      {/* Header Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <Wallet className="h-4 w-4 text-[#0369a1]" />
            <span>ตารางการชำระเงินตามงวดงาน / Payment Milestones</span>
          </div>
          <h3 className="mt-1 text-lg font-black text-slate-950 tracking-tight">
            สถานะค่างวดและการชำระเงินโครงการ
          </h3>
        </div>

        <div className="flex items-center gap-4 bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
          <div className="text-right border-r border-slate-200 pr-4">
            <p className="text-[10px] font-bold uppercase text-slate-400">ชำระแล้วรวม</p>
            <p className="text-sm font-black text-emerald-600 font-mono">
              {formatPrice(totalPaid)} ({paidPercent}%)
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">คงเหลือค้างชำระ</p>
            <p className="text-sm font-black text-slate-900 font-mono">
              {formatPrice(remainingBalance)}
            </p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-600">
          <span>ความคืบหน้าการชำระเงินทั้งหมด</span>
          <span className="font-mono text-emerald-700">{paidPercent}% COMPLETED</span>
        </div>
        <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden p-0.5 border border-slate-300/50">
          <div
            className="h-full bg-gradient-to-r from-[#0369a1] to-emerald-500 rounded-full transition-all duration-500 shadow-xs"
            style={{ width: `${paidPercent}%` }}
          />
        </div>
      </div>

      {/* 3-Step Milestone Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {defaultMilestones.map((m, idx) => {
          const matchedRequest = paymentRequests[idx] || paymentRequests.find((r) => r.title.includes(m.title));
          const isPaid = matchedRequest?.status === "PAID";
          const isAwaiting = matchedRequest?.status === "AWAITING_VERIFICATION";
          const isPending = matchedRequest?.status === "PENDING";

          return (
            <div
              key={m.stage}
              onClick={() => matchedRequest && onSelectMilestone?.(matchedRequest)}
              className={`rounded-xl border p-4 transition space-y-3 ${
                matchedRequest ? "cursor-pointer hover:shadow-md" : ""
              } ${
                isPaid
                  ? "bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-400/20"
                  : isAwaiting
                  ? "bg-amber-50/60 border-amber-300 ring-1 ring-amber-400/20"
                  : isPending
                  ? "bg-white border-[#B7D1EA] ring-2 ring-[#B7D1EA]/20"
                  : "bg-white/60 border-slate-200 opacity-70"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`h-7 w-7 rounded-full text-xs font-black flex items-center justify-center ${
                  isPaid ? "bg-emerald-600 text-white" : "bg-slate-900 text-white"
                }`}>
                  {m.stage}
                </span>

                {isPaid ? (
                  <StatusBadge tone="success" className="text-[10px]">
                    ✓ ชำระแล้ว ({m.percentLabel})
                  </StatusBadge>
                ) : isAwaiting ? (
                  <StatusBadge tone="warning" className="text-[10px]">
                    ⏳ รอตรวจสลิป
                  </StatusBadge>
                ) : isPending ? (
                  <StatusBadge tone="info" className="text-[10px]">
                    💳 รอการชำระ ({m.percentLabel})
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="neutral" className="text-[10px]">
                    งวดถัดไป ({m.percentLabel})
                  </StatusBadge>
                )}
              </div>

              <div>
                <p className="text-xs font-black text-slate-950">{m.title}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-600 leading-relaxed">
                  {m.description}
                </p>
              </div>

              {matchedRequest && (
                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500">จำนวนเงิน:</span>
                  <span className="font-black font-mono text-slate-900">
                    {formatPrice(toNumber(matchedRequest.amountRequested))}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
