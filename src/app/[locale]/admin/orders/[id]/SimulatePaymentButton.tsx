"use client";

import { useTransition } from "react";
import { Cpu } from "@/components/ui/icons";
import { toast } from "sonner";
import { simulateMilestonePayment } from "@/app/actions/payments";
import { GsapSpinner } from "@/components/ui/GsapMotion";

interface SimulatePaymentButtonProps {
  milestoneId: string;
  locale?: string;
  milestoneOrder: number;
}

export default function SimulatePaymentButton({
  milestoneId,
  locale = "th",
  milestoneOrder,
}: SimulatePaymentButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleSimulate = () => {
    if (
      !window.confirm(
        `[ระบบทดสอบ] ยืนยันการจำลองการชำระเงินของงวดที่ ${milestoneOrder}?\nการดำเนินการนี้จะข้าม EasySlip, ปรับปรุงสถานะเป็นชำระแล้ว และสร้างประวัติธุรกรรมจำลอง`
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await simulateMilestonePayment(milestoneId, locale);

        if (!result.success) {
          toast.error(result.error || "ไม่สามารถจำลองการชำระเงินได้");
          return;
        }

        if (result.alreadyPaid) {
          toast.info("งวดชำระเงินนี้ชำระเรียบร้อยแล้ว");
        } else {
          toast.success("จำลองการชำระเงินงวดนี้สำเร็จ!");
        }
      } catch (err) {
        console.error(err);
        toast.error("เกิดข้อผิดพลาดในการจำลองการชำระเงิน");
      }
    });
  };

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleSimulate}
      className="inline-flex w-full min-h-[2.5rem] items-center justify-center gap-1.5 rounded-xl border border-[#1E293B] bg-[#0B1121] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 transition-colors hover:bg-[#0B1121] hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? (
        <>
          <GsapSpinner className="h-3.5 w-3.5 text-gray-400" />
          <span>Simulating...</span>
        </>
      ) : (
        <>
          <Cpu className="h-3.5 w-3.5 text-gray-400" />
          <span>Simulate Payment (Test)</span>
        </>
      )}
    </button>
  );
}
