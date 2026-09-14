"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  Landmark,
  ReceiptText,
  ShieldAlert,
  UserRound,
} from "@/components/ui/icons";
import { toast } from "sonner";
import { manuallyMarkPaymentTransactionPaid } from "@/app/actions/paymentAudit";
import { cn } from "@/lib/utils";
import { GsapSpinner } from "@/components/ui/GsapMotion";

type PaymentTransactionStatus = "PENDING" | "PAID" | "EXPIRED" | "FAILED";

export interface PaymentAuditTransaction {
  id: string;
  amount: number;
  milestoneIndex: number | null;
  status: PaymentTransactionStatus;
  slipGoogleDriveId: string | null;
  senderName: string | null;
  senderBank: string | null;
  transRef: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PaymentHistoryTabProps {
  locale: string;
  transactions: PaymentAuditTransaction[];
}

function formatDriveUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://drive.google.com/file/d/${encodeURIComponent(value)}/view`;
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(amount);
}

function statusLabel(status: PaymentTransactionStatus) {
  switch (status) {
    case "PAID":
      return "ชำระแล้ว";
    case "PENDING":
      return "รอตรวจสอบ";
    case "EXPIRED":
      return "หมดอายุ";
    case "FAILED":
      return "ตรวจสอบไม่สำเร็จ";
  }
}

export default function PaymentHistoryTab({
  locale,
  transactions,
}: PaymentHistoryTabProps) {
  const [activeTab, setActiveTab] = useState<"history" | "guidance">(
    "history",
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleManualOverride = (transactionId: string) => {
    if (
      !window.confirm(
        "ยืนยันการทำ Manual Override และบันทึกธุรกรรมนี้เป็น PAID?",
      )
    ) {
      return;
    }

    setPendingId(transactionId);
    startTransition(async () => {
      try {
        const result = await manuallyMarkPaymentTransactionPaid(
          transactionId,
          locale,
        );

        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success(
          result.alreadyPaid
            ? "ธุรกรรมนี้ชำระแล้ว"
            : "บันทึก Manual Override เรียบร้อยแล้ว",
        );
      } catch (error) {
        console.error("Manual payment override error:", error);
        toast.error("ไม่สามารถบันทึก Manual Override ได้ กรุณาลองใหม่");
      } finally {
        setPendingId(null);
      }
    });
  };

  return (
    <section className="rounded-2xl border border-[#1E293B] bg-[#0F172A]">
      <div className="border-b border-[#1E293B] px-5 pt-5 sm:px-6">
        <div className="flex flex-col gap-1 pb-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-100">
            <ReceiptText className="h-5 w-5 text-[#B7D1EA]" />
            ประวัติการชำระเงิน
            <span className="text-sm font-semibold text-gray-400">
              (Payment History)
            </span>
          </h2>
          <p className="text-sm text-gray-400">
            ตรวจสอบหลักฐานและข้อมูล EasySlip ของธุรกรรมในโครงการนี้
          </p>
        </div>

        <div className="flex gap-1" role="tablist" aria-label="Payment audit">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            className={cn(
              "min-h-11 border-b-2 px-4 text-sm font-bold transition-colors",
              activeTab === "history"
                ? "border-[#B7D1EA] text-gray-100"
                : "border-transparent text-gray-400 hover:text-gray-100",
            )}
          >
            รายการธุรกรรม ({transactions.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "guidance"}
            onClick={() => setActiveTab("guidance")}
            className={cn(
              "min-h-11 border-b-2 px-4 text-sm font-bold transition-colors",
              activeTab === "guidance"
                ? "border-[#B7D1EA] text-gray-100"
                : "border-transparent text-gray-400 hover:text-gray-100",
            )}
          >
            แนวทางตรวจสอบ
          </button>
        </div>
      </div>

      {activeTab === "guidance" ? (
        <div className="p-5 sm:p-6">
          <div className="flex max-w-3xl items-start gap-3 rounded-xl bg-amber-500/10 p-4 text-sm text-amber-950">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <p className="leading-6">
              ใช้ Manual Override เฉพาะเมื่อเจ้าหน้าที่ตรวจสอบยอดเงิน
              ผู้โอน และหลักฐานใน Google Drive แล้วเท่านั้น
              การดำเนินการจะถูกบันทึกใน Audit Log
            </p>
          </div>
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <ReceiptText className="mb-3 h-9 w-9 text-slate-300" />
          <p className="font-bold text-gray-100">
            ยังไม่มีประวัติธุรกรรม
          </p>
          <p className="mt-1 text-sm text-gray-400">
            รายการจะปรากฏหลังจากลูกค้าสร้าง QR สำหรับชำระเงิน
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {transactions.map((transaction) => {
            const isPaid = transaction.status === "PAID";
            const isOverriding =
              isPending && pendingId === transaction.id;

            return (
              <article
                key={transaction.id}
                className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xl font-black text-gray-100">
                      {formatMoney(transaction.amount)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
                        isPaid
                          ? "bg-emerald-500/10 text-emerald-700"
                          : transaction.status === "FAILED"
                            ? "bg-rose-500/10 text-rose-700"
                            : "bg-[#0B1121] text-gray-300",
                      )}
                    >
                      {isPaid ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Clock3 className="h-3.5 w-3.5" />
                      )}
                      {statusLabel(transaction.status)}
                    </span>
                    {transaction.milestoneIndex !== null && (
                      <span className="text-xs font-semibold text-gray-400">
                        งวดที่ {transaction.milestoneIndex}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-gray-400">
                    วันที่:{" "}
                    <span className="font-semibold text-gray-100">
                      {new Date(
                        isPaid
                          ? transaction.updatedAt
                          : transaction.createdAt,
                      ).toLocaleString("th-TH")}
                    </span>
                  </p>

                  {isPaid && (
                    <dl className="grid gap-3 rounded-xl bg-[#0B1121] p-4 sm:grid-cols-3">
                      <div>
                        <dt className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                          <UserRound className="h-3.5 w-3.5" />
                          ผู้โอน
                        </dt>
                        <dd className="mt-1 break-words text-sm font-bold text-gray-100">
                          {transaction.senderName || "ไม่มีข้อมูล"}
                        </dd>
                      </div>
                      <div>
                        <dt className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                          <Landmark className="h-3.5 w-3.5" />
                          ธนาคาร
                        </dt>
                        <dd className="mt-1 text-sm font-bold text-gray-100">
                          {transaction.senderBank || "ไม่มีข้อมูล"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold text-gray-400">
                          Transaction Ref
                        </dt>
                        <dd className="mt-1 break-all font-mono text-sm font-bold text-gray-100">
                          {transaction.transRef || "ไม่มีข้อมูล"}
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>

                <div className="flex flex-col items-stretch gap-2 sm:flex-row lg:w-64 lg:flex-col">
                  {transaction.slipGoogleDriveId && (
                    <a
                      href={formatDriveUrl(
                        transaction.slipGoogleDriveId,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#B7D1EA] px-4 text-sm font-bold text-white transition-colors hover:bg-[#99BFE3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2"
                    >
                      ดูหลักฐานใน Google Drive
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}

                  {!isPaid && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        handleManualOverride(transaction.id)
                      }
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#1E293B] bg-[#0F172A] px-4 text-sm font-bold text-gray-100 transition-colors hover:bg-[#0B1121] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isOverriding ? (
                        <GsapSpinner className="h-4 w-4" />
                      ) : (
                        <ShieldAlert className="h-4 w-4" />
                      )}
                      Manual Override
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
