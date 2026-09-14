"use client";

import React, { useState } from "react";
import {
  Zap,
  Battery,
  Home,
  CheckSquare,
  DollarSign,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Code,
  Sparkles,
} from "@/components/ui/icons";
import { cn, formatPrice } from "@/lib/utils";
import { useCurrencyStore } from "@/store/useCurrencyStore";
import { useTranslations } from "next-intl";

interface Props {
  payload: Record<string, unknown> | null | undefined;
}

export default function LeadPayloadSummary({ payload }: Props) {
  const t = useTranslations("LeadPayloadSummary");
  const activeCurrency = useCurrencyStore((state) => state.currency);
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!payload || typeof payload !== "object" || Object.keys(payload).length === 0) {
    return (
      <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl text-slate-500 text-xs font-mono">
        {t("noPayload")}
      </div>
    );
  }

  // Extract Known Specs safely
  const systemSizeKwp = Number(
    payload.systemSizeKwp || payload.sizeKwp || payload.recommendedSizeKw || payload.targetSystemSize || 0
  );
  const batteryKwh = Number(payload.batteryKwh || payload.batteryCapacityKwh || 0);
  const roofTilt = payload.roofTilt || payload.tilt || payload.roofType || null;
  const roofType = payload.roofType || payload.roofStructure || null;
  const addOns = Array.isArray(payload.addOns)
    ? payload.addOns
    : Array.isArray(payload.addons)
    ? payload.addons
    : [];

  const totalPrice = Number(
    payload.totalPrice || payload.estimatedPrice || payload.estimatedBudget || payload.price || 0
  );
  const monthlySavings = Number(
    payload.monthlySavings || payload.estimatedMonthlySavings || payload.calculatedMonthlySavings || 0
  );
  const annualGenKwh = Number(
    payload.annualGenerationKwh || payload.annualGenKwh || (systemSizeKwp > 0 ? systemSizeKwp * 1350 : 0)
  );

  // Track recognized keys to isolate unrecognized ones
  const recognizedKeys = new Set([
    "systemSizeKwp",
    "sizeKwp",
    "recommendedSizeKw",
    "targetSystemSize",
    "batteryKwh",
    "batteryCapacityKwh",
    "roofTilt",
    "tilt",
    "roofType",
    "roofStructure",
    "addOns",
    "addons",
    "totalPrice",
    "estimatedPrice",
    "estimatedBudget",
    "price",
    "monthlySavings",
    "estimatedMonthlySavings",
    "calculatedMonthlySavings",
    "annualGenerationKwh",
    "annualGenKwh",
    "notes",
    "staffNotes",
    "siteLocation",
    "locationSnapshot",
    "pdpaLocationConsent",
    "pdpaConsent",
    "wizardAnswers",
    "systemProfile",
    "latitude",
    "longitude",
    "location",
  ]);

  const unrecognizedEntries = Object.entries(payload).filter(
    ([key]) => !recognizedKeys.has(key)
  );

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Primary Spec Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* System Size Card */}
        <div className="bg-[#0B1121] border border-purple-900/40 rounded-xl p-3 space-y-1 shadow-sm">
          <div className="flex items-center gap-1.5 text-purple-400 font-mono text-[11px] font-bold uppercase">
            <Zap className="w-3.5 h-3.5" />
            <span>{t("systemSize")}</span>
          </div>
          <div className="text-lg font-black text-white">
            {systemSizeKwp > 0 ? `${systemSizeKwp.toLocaleString()} kWp` : t("customSpec")}
          </div>
        </div>

        {/* Battery Storage Card */}
        <div className="bg-[#0B1121] border border-sky-900/40 rounded-xl p-3 space-y-1 shadow-sm">
          <div className="flex items-center gap-1.5 text-sky-400 font-mono text-[11px] font-bold uppercase">
            <Battery className="w-3.5 h-3.5" />
            <span>{t("batteryStorage")}</span>
          </div>
          <div className="text-lg font-black text-white">
            {batteryKwh > 0 ? `${batteryKwh.toLocaleString()} kWh` : t("noBattery")}
          </div>
        </div>

        {/* Estimated Budget Card */}
        <div className="bg-[#0B1121] border border-emerald-900/40 rounded-xl p-3 space-y-1 shadow-sm col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px] font-bold uppercase">
            <DollarSign className="w-3.5 h-3.5" />
            <span>{t("estimatedValuation")}</span>
          </div>
          <div className="text-lg font-black text-emerald-400">
            {totalPrice > 0 ? formatPrice(totalPrice) : t("quoteToBeDetermined")}
          </div>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Roof Specifications */}
        {(roofTilt || roofType) && (
          <div className="bg-[#0B1121] border border-slate-800 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300">
              <Home className="w-4 h-4 text-[#B7D1EA]" />
              <span className="font-semibold">{t("roofSpecs")}</span>
            </div>
            <span className="font-mono text-slate-400">
              {String(roofType || "")} {roofTilt ? `(${roofTilt}°)` : ""}
            </span>
          </div>
        )}

        {/* Savings & Production */}
        {(monthlySavings > 0 || annualGenKwh > 0) && (
          <div className="bg-[#0B1121] border border-slate-800 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold">{t("estimatedSavings")}</span>
            </div>
            <div className="text-right font-mono">
              {monthlySavings > 0 && (
                <div className="text-emerald-400 font-bold">{t("perMonth", { amount: formatPrice(monthlySavings) })}</div>
              )}
              {annualGenKwh > 0 && (
                <div className="text-slate-500 text-[10px]">{t("perYear", { amount: annualGenKwh.toLocaleString() })}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add-ons List */}
      {addOns.length > 0 && (
        <div className="bg-[#0B1121] border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px] font-bold uppercase">
            <CheckSquare className="w-3.5 h-3.5 text-[#B7D1EA]" />
            {t("selectedAddons", { count: addOns.length })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {addOns.map((item, idx) => (
              <span
                key={idx}
                className="bg-slate-800 border border-slate-700 text-slate-200 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3 text-purple-400" />
                {String(item)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Unrecognized / Advanced JSON Collapsible Accordion */}
      {unrecognizedEntries.length > 0 && (
        <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-[#0B1121]">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Code className="w-4 h-4 text-[#B7D1EA]" />
              {t("advancedDataDetails", { count: unrecognizedEntries.length })}
            </span>
            {showAdvanced ? (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {showAdvanced && (
            <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 font-mono text-[11px] text-emerald-400 overflow-x-auto max-h-48 leading-relaxed">
              <pre>{JSON.stringify(Object.fromEntries(unrecognizedEntries), null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
