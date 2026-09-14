"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FiArrowUpRight, FiCheck, FiZap } from "react-icons/fi";

import AnimatedNumber from "@/components/ui/AnimatedNumber";
import {
  BILL_IMPACT_DEFAULT_MONTHLY_BILL_THB,
  BILL_IMPACT_MAX_MONTHLY_BILL_THB,
  BILL_IMPACT_MIN_MONTHLY_BILL_THB,
  calculateBillImpactEstimate,
  clamp,
} from "../solar-estimates";

import styles from "./solar-editorial-home.module.css";

export type EditorialImpactCalculatorLabels = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  billLabel: string;
  billHint: string;
  billMin: string;
  billMax: string;
  savingsLabel: string;
  annualSavingsLabel: string;
  co2Label: string;
  treesLabel: string;
  systemSizeLabel: string;
  impactLabel: string;
  estimateTag: string;
  disclaimer: string;
  action: string;
  success: string;
  unitMonth: string;
  unitYear: string;
  currencySymbol: string;
}>;

type EditorialImpactCalculatorProps = Readonly<{
  locale: string;
  wizardHref: string;
  labels: EditorialImpactCalculatorLabels;
}>;

function formatNumber(value: number, locale: string, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits,
  }).format(value);
}

function TreeIcon() {
  return (
    <svg viewBox="0 0 48 48" role="presentation" focusable="false">
      <path d="M24 42V25" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
      <path d="M24 29c-5.2-1.2-9.1-4.6-9.1-9.1 0-4.9 4-8.8 8.9-8.8s8.9 3.9 8.9 8.8c0 4.5-3.5 7.6-8.7 9.1Z" fill="currentColor" opacity=".18" />
      <path d="M24 28.5c-4.2-1.1-7-3.6-7-7.2 0-3.8 3.1-6.9 6.9-6.9s6.9 3.1 6.9 6.9c0 3.6-2.6 6.1-6.8 7.2Z" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M24 25c-3.3-.1-5.9-1.7-7.4-4.1M24 25c3.2-.4 5.4-1.9 6.8-4.3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M16 42h16" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  );
}

function Co2Icon() {
  return (
    <svg viewBox="0 0 48 48" role="presentation" focusable="false">
      <circle cx="24" cy="24" r="16" fill="currentColor" opacity=".12" />
      <path d="M15 29.5c3.1-5.2 7.7-8.7 14.2-10.5 1.8-.5 3.3-.5 4.7-.4-1.1 5.6-3.8 9.5-8.2 11.4-3.6 1.5-7.1 1.3-10.7-.5Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
      <path d="M17.2 28.9c4.3-.4 8-2.3 11.1-5.7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M24 35v3M13 24h-3M38 24h-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" opacity=".7" />
    </svg>
  );
}

export default function EditorialImpactCalculator({
  locale,
  wizardHref,
  labels,
}: EditorialImpactCalculatorProps) {
  const billInputId = useId();
  const reduceMotion = useReducedMotion() ?? false;
  const [monthlyBill, setMonthlyBill] = useState(BILL_IMPACT_DEFAULT_MONTHLY_BILL_THB);
  const [successMessage, setSuccessMessage] = useState("");

  const estimate = useMemo(() => calculateBillImpactEstimate(monthlyBill), [monthlyBill]);
  const formatMoney = (value: number) => `${labels.currencySymbol}${formatNumber(value, locale)}`;
  const formatKwp = (value: number) => `${formatNumber(value, locale, 1)} kWp`;

  const handleBillChange = (value: number) => {
    if (!Number.isFinite(value)) return;
    setMonthlyBill(
      clamp(
        Math.round(value),
        BILL_IMPACT_MIN_MONTHLY_BILL_THB,
        BILL_IMPACT_MAX_MONTHLY_BILL_THB,
      ),
    );
    setSuccessMessage("");
  };

  const handleCelebrate = () => {
    setSuccessMessage(labels.success);
    void import("canvas-confetti")
      .then(({ default: confetti }) => {
        confetti({
          particleCount: 54,
          spread: 62,
          startVelocity: 24,
          origin: { y: 0.72 },
          colors: ["#1e3a2f", "#2d5a47", "#f59e0b", "#b7d1ea"],
          disableForReducedMotion: reduceMotion,
        });
      })
      .catch(() => {
        // The estimate is still complete if the optional celebration chunk fails.
      });
  };

  return (
    <section className={styles.calculator} id="calculator" aria-labelledby="calculator-title">
      <div className={styles.calculatorIntro}>
        <p className={styles.sectionMarker}>{labels.eyebrow}</p>
        <h2 id="calculator-title">{labels.title}</h2>
        <p>{labels.description}</p>
        <span className={styles.estimateTag}><FiZap aria-hidden="true" /> {labels.estimateTag}</span>
      </div>

      <motion.div
        className={styles.calculatorCard}
        // Keep the initial value stable between the server and browser. The
        // reduced-motion preference is only applied to the transition so the
        // client cannot hydrate a different inline transform than the server.
        initial={{ y: 24 }}
        whileInView={{ y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className={styles.calculatorControls}>
          <div className={styles.calculatorControlHeader}>
            <label htmlFor={billInputId}>{labels.billLabel}</label>
            <output htmlFor={billInputId}>{formatMoney(monthlyBill)} <span>{labels.unitMonth}</span></output>
          </div>
          <input
            id={billInputId}
            className={styles.calculatorRange}
            type="range"
            min={BILL_IMPACT_MIN_MONTHLY_BILL_THB}
            max={BILL_IMPACT_MAX_MONTHLY_BILL_THB}
            step={100}
            value={monthlyBill}
            onChange={(event) => handleBillChange(Number(event.target.value))}
            aria-label={labels.billLabel}
            aria-valuetext={`${formatMoney(monthlyBill)} ${labels.unitMonth}`}
          />
          <div className={styles.rangeScale} aria-hidden="true">
            <span>{labels.billMin}</span>
            <span>{labels.billMax}</span>
          </div>
          <div className={styles.billInputRow}>
            <span className={styles.billPrefix}>{labels.currencySymbol}</span>
            <input
              type="number"
              min={BILL_IMPACT_MIN_MONTHLY_BILL_THB}
              max={BILL_IMPACT_MAX_MONTHLY_BILL_THB}
              step={100}
              value={monthlyBill}
              onChange={(event) => handleBillChange(Number(event.target.value))}
              aria-label={labels.billLabel}
            />
            <span className={styles.billSuffix}>{labels.unitMonth}</span>
          </div>
          <p className={styles.calculatorHint}>{labels.billHint}</p>
        </div>

        <div className={styles.calculatorResults}>
          <div className={styles.calculatorResultLead}>
            <span>{labels.savingsLabel}</span>
            <strong>
              <AnimatedNumber value={estimate.monthlySavingsThb} formatter={formatMoney} />
              <small>{labels.unitMonth}</small>
            </strong>
          </div>
          <div className={styles.calculatorResultMeta}>
            <span>{labels.systemSizeLabel}</span>
            <strong>{formatKwp(estimate.solarSizeKwp)}</strong>
          </div>
          <div className={styles.calculatorResultMeta}>
            <span>{labels.annualSavingsLabel}</span>
            <strong><AnimatedNumber value={estimate.annualSavingsThb} formatter={formatMoney} /> <small>{labels.unitYear}</small></strong>
          </div>
        </div>

        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {labels.savingsLabel}: {formatMoney(estimate.monthlySavingsThb)} {labels.unitMonth}. {labels.annualSavingsLabel}: {formatMoney(estimate.annualSavingsThb)} {labels.unitYear}. {labels.co2Label}: {formatNumber(estimate.avoidedCo2Tons, locale, 1)}. {labels.treesLabel}: {formatNumber(estimate.treeEquivalent, locale)}.
        </p>

        <div className={styles.impactPanel}>
          <div className={styles.impactPanelHeader}>
            <span>{labels.impactLabel}</span>
            <span className={styles.impactRule} aria-hidden="true" />
          </div>
          <div className={styles.impactMetrics}>
            <div className={styles.impactMetric}>
              <motion.span
                className={`${styles.impactIcon} ${styles.treeIcon}`}
                animate={reduceMotion ? undefined : { scale: [1, 1.08, 1], opacity: [0.86, 1, 0.86] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                aria-hidden="true"
              >
                <TreeIcon />
              </motion.span>
              <span className={styles.impactValue}><AnimatedNumber value={estimate.treeEquivalent} formatter={(value) => formatNumber(value, locale)} /></span>
              <span className={styles.impactLabel}>{labels.treesLabel}</span>
            </div>
            <div className={styles.impactMetric}>
              <motion.span
                className={`${styles.impactIcon} ${styles.co2Icon}`}
                animate={reduceMotion ? undefined : { rotate: [0, -4, 0, 4, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                aria-hidden="true"
              >
                <Co2Icon />
              </motion.span>
              <span className={styles.impactValue}><AnimatedNumber value={estimate.avoidedCo2Tons} decimals={1} formatter={(value) => formatNumber(value, locale, 1)} /></span>
              <span className={styles.impactLabel}>{labels.co2Label}</span>
            </div>
          </div>
          <p className={styles.calculatorDisclaimer}>{labels.disclaimer}</p>
        </div>

        <div className={styles.calculatorFooter}>
          <div className={styles.calculatorSuccess} role="status" aria-live="polite">
            {successMessage ? <><FiCheck aria-hidden="true" /> {successMessage}</> : null}
          </div>
          <Link className={styles.calculatorAction} href={wizardHref} onClick={handleCelebrate}>
            {labels.action} <FiArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
