"use client";

import { useMemo, useState, type ReactNode } from "react";
import AnimatedNumber from "@/components/ui/AnimatedNumber";

type LoanSimulatorProps = {
  totalSystemCost: number;
  currentMonthlyBill: number;
  estimatedMonthlySavings: number;
  annualInterestRate?: number;
  className?: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

function calculateMonthlyInstallment(
  principal: number,
  annualInterestRate: number,
  years: number,
) {
  const months = years * 12;
  const monthlyRate = annualInterestRate / 12;

  if (principal <= 0 || months <= 0) return 0;
  if (monthlyRate <= 0) return principal / months;

  return (
    (principal * monthlyRate) /
    (1 - Math.pow(1 + monthlyRate, -months))
  );
}

export default function LoanSimulator({
  totalSystemCost,
  currentMonthlyBill,
  estimatedMonthlySavings,
  annualInterestRate = 0.065,
  className = "",
}: LoanSimulatorProps) {
  const [loanYears, setLoanYears] = useState(5);
  const [downPaymentPct, setDownPaymentPct] = useState(10);

  const simulation = useMemo(() => {
    const downPaymentAmount = totalSystemCost * (downPaymentPct / 100);
    const financedPrincipal = Math.max(0, totalSystemCost - downPaymentAmount);
    const monthlyInstallment = calculateMonthlyInstallment(
      financedPrincipal,
      annualInterestRate,
      loanYears,
    );
    const newMonthlyElectricityBill = Math.max(
      0,
      currentMonthlyBill - estimatedMonthlySavings,
    );
    const totalMonthlyExpense =
      monthlyInstallment + newMonthlyElectricityBill;
    const monthlySavingsComparedToCurrent =
      currentMonthlyBill - totalMonthlyExpense;
    const maxComparisonValue = Math.max(
      currentMonthlyBill,
      totalMonthlyExpense,
      1,
    );

    return {
      downPaymentAmount,
      financedPrincipal,
      monthlyInstallment,
      newMonthlyElectricityBill,
      totalMonthlyExpense,
      monthlySavingsComparedToCurrent,
      oldBillPct: Math.max(
        8,
        Math.min(100, (currentMonthlyBill / maxComparisonValue) * 100),
      ),
      newExpensePct: Math.max(
        8,
        Math.min(100, (totalMonthlyExpense / maxComparisonValue) * 100),
      ),
    };
  }, [
    annualInterestRate,
    currentMonthlyBill,
    downPaymentPct,
    estimatedMonthlySavings,
    loanYears,
    totalSystemCost,
  ]);

  return (
    <section
      className={`rounded-[24px] border border-[#F7F6F3] bg-[#F0EEE9] p-4 shadow-sm md:p-5 ${className}`}
    >
      <div className="mb-4 flex flex-col gap-3 border-b border-[#F7F6F3] pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-[#2E2C27] md:text-xl">
            จำลองการผ่อนชำระโซลาร์ (Solar Financing Simulator)
          </h2>
          <p className="mt-1 text-xs font-semibold text-[#4E4B44]">
            ยอดจ่ายสุทธิหลังหักลบส่วนต่างประหยัดค่าไฟ
          </p>
        </div>
        <span className="self-start sm:self-auto rounded-full bg-[#DCE8F5] px-4 py-2 text-xs font-black text-[#2E2C27]">
          {(annualInterestRate * 100).toFixed(1)}% APR Interest Estimate
        </span>
      </div>

      <div className="space-y-4">
        {/* Input Parameters */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC] p-3.5">
            <div className="flex items-center justify-between gap-4">
              <label className="text-xs font-black text-[#2E2C27]">
                ระยะเวลาผ่อนชำระ (Loan Duration)
              </label>
              <span className="rounded-full bg-[#F0EEE9] border border-[#CBC7BE] px-3 py-1 text-xs font-black text-[#4F7FA8] shadow-xs">
                {loanYears} ปี (Years)
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={loanYears}
              onChange={(event) => setLoanYears(Number(event.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#F7F6F3] accent-[#B7D1EA]"
            />
            <div className="flex justify-between text-[10px] font-black text-[#8E8B83]">
              <span>1 ปี (1 Year)</span>
              <span>10 ปี (10 Years)</span>
            </div>
          </div>

          <div className="space-y-2 rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC] p-3.5">
            <div className="flex items-center justify-between gap-4">
              <label className="text-xs font-black text-[#2E2C27]">
                เงินดาวน์เริ่มต้น (Down Payment)
              </label>
              <span className="rounded-full bg-[#F0EEE9] border border-[#CBC7BE] px-3 py-1 text-xs font-black text-[#4F7FA8] shadow-xs">
                <AnimatedNumber value={downPaymentPct} suffix="%" /> ·{" "}
                <AnimatedNumber
                  value={simulation.downPaymentAmount}
                  formatter={(amount) => formatCurrency(Math.round(amount))}
                />
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={downPaymentPct}
              onChange={(event) => setDownPaymentPct(Number(event.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#F7F6F3] accent-[#B7D1EA]"
            />
            <div className="flex justify-between text-[10px] font-black text-[#8E8B83]">
              <span>ไม่มีเงินดาวน์ (0%)</span>
              <span>ดาวน์สูงสุด (80%)</span>
            </div>
          </div>
        </div>

        {/* Calculated Results */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <OutputCard
              label="ค่างวดโซลาร์รายเดือน"
              subLabel="Monthly Solar Installment"
              description={`ผ่อนชำระยอดจัด ${formatCurrency(simulation.financedPrincipal)}`}
              value={<AnimatedNumber value={simulation.monthlyInstallment} formatter={(amount) => formatCurrency(Math.round(amount))} />}
            />
            <OutputCard
              label="ค่าไฟเฉลี่ยใหม่หลังหักส่วนประหยัด"
              subLabel="New Monthly Electricity Bill"
              description="ประมาณการค่าไฟที่ยังต้องจ่ายให้การไฟฟ้า"
              value={<AnimatedNumber value={simulation.newMonthlyElectricityBill} formatter={(amount) => formatCurrency(Math.round(amount))} />}
            />
            <OutputCard
              label="ยอดรวมภาระจ่ายรายเดือนใหม่"
              subLabel="Total New Monthly Expense"
              description="ค่างวดผ่อน + ค่าไฟรายเดือนที่เหลือ"
              value={<AnimatedNumber value={simulation.totalMonthlyExpense} formatter={(amount) => formatCurrency(Math.round(amount))} />}
            />
            <OutputCard
              label="ส่วนต่างการประหยัด (สุทธิ)"
              subLabel="Net Monthly Savings"
              description={simulation.monthlySavingsComparedToCurrent >= 0 ? "ประหยัดเพิ่มขึ้นจากค่าไฟเดิม" : "ยอดรวมจ่ายเพิ่มกว่าค่าไฟเดิมชั่วคราว"}
              value={<AnimatedNumber value={simulation.monthlySavingsComparedToCurrent} formatter={(amount) => formatCurrency(Math.round(amount))} />}
              tone={
                simulation.monthlySavingsComparedToCurrent >= 0
                  ? "positive"
                  : "negative"
              }
            />
          </div>

          <div className="rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC] p-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="text-xs font-black text-[#2E2C27]">
                เปรียบเทียบภาระค่าใช้จ่ายรายเดือน (Old Bill vs New Expense)
              </p>
            </div>
            <ComparisonBar
              label="ค่าไฟเดิมก่อนติดตั้ง (Old Bill)"
              value={<AnimatedNumber value={currentMonthlyBill} formatter={(amount) => formatCurrency(Math.round(amount))} />}
              percent={simulation.oldBillPct}
              colorClass="bg-[#8E8B83]"
            />
            <ComparisonBar
              label="รายจ่ายใหม่ (ค่างวด + ค่าไฟหลังประหยัด)"
              value={<AnimatedNumber value={simulation.totalMonthlyExpense} formatter={(amount) => formatCurrency(Math.round(amount))} />}
              percent={simulation.newExpensePct}
              colorClass="bg-[#B7D1EA]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function OutputCard({
  label,
  subLabel,
  description,
  value,
  tone = "default",
}: {
  label: string;
  subLabel: string;
  description: string;
  value: ReactNode;
  tone?: "default" | "positive" | "negative";
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-rose-600"
        : "text-[#2E2C27]";

  return (
    <div className="flex min-h-[118px] flex-col justify-between rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC] p-3.5">
      <div>
        <p className="text-xs font-black leading-tight text-[#2E2C27]">{label}</p>
        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-tight text-[#8E8B83]">{subLabel}</p>
      </div>
      <div className="mt-4">
        <p className={`font-mono text-base font-black leading-none ${valueClass}`}>{value}</p>
        <p className="mt-1.5 text-[9px] font-semibold leading-normal text-[#4E4B44]">{description}</p>
      </div>
    </div>
  );
}

function ComparisonBar({
  label,
  value,
  percent,
  colorClass,
}: {
  label: string;
  value: ReactNode;
  percent: number;
  colorClass: string;
}) {
  return (
    <div className="mb-3.5 last:mb-0">
      <div className="mb-1 flex items-center justify-between text-[10px] font-black text-[#4E4B44]">
        <span>{label}</span>
        <span className="font-mono text-[#2E2C27]">{value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#F0EEE9] border border-[#F7F6F3]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
