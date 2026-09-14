"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useTranslations } from "next-intl";

type BudgetOption = Readonly<{
  label: string;
  value: string;
}>;

export default function ContactForm() {
  const t = useTranslations("ContactForm");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const successRef = useRef<HTMLDivElement | null>(null);
  const budgetOptions: readonly BudgetOption[] = [
    { label: t("budget.placeholder"), value: "" },
    { label: t("budget.tier1"), value: "10-25" },
    { label: t("budget.tier2"), value: "25-50" },
    { label: t("budget.tier3"), value: "50-100" },
    { label: t("budget.tier4"), value: "100-plus" },
  ];

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    window.setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
      event.currentTarget.reset();
    }, 650);
  };

  useEffect(() => {
    const form = formRef.current;
    if (!form || submitted) return;

    const fields = gsap.utils.toArray<HTMLElement>("[data-contact-field]", form);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const context = gsap.context(() => {
      gsap.fromTo(
        fields,
        {
          autoAlpha: 0,
          y: prefersReducedMotion ? 0 : 18,
        },
        {
          autoAlpha: 1,
          y: 0,
          duration: prefersReducedMotion ? 0.08 : 0.48,
          stagger: prefersReducedMotion ? 0 : 0.07,
          ease: prefersReducedMotion ? "none" : "expo.out",
        },
      );
    }, form);

    return () => context.revert();
  }, [submitted]);

  useEffect(() => {
    const success = successRef.current;
    if (!success || !submitted) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const context = gsap.context(() => {
      gsap.fromTo(
        success,
        {
          autoAlpha: 0,
          y: prefersReducedMotion ? 0 : 16,
        },
        {
          autoAlpha: 1,
          y: 0,
          duration: prefersReducedMotion ? 0.12 : 0.5,
          ease: prefersReducedMotion ? "none" : "expo.out",
        },
      );
    }, success);

    return () => context.revert();
  }, [submitted]);

  if (submitted) {
    return (
      <div
        ref={successRef}
        className="rounded-[28px] border border-[#8E8B83]/20 bg-[#E6E3DC] p-8 shadow-sm sm:p-10"
      >
        <p className="text-sm font-medium text-[#4F7FA8]">{t("success.eyebrow")}</p>
        <h2 className="mt-4 text-3xl font-bold tracking-tight text-[#1C1C1A]">{t("success.title")}</h2>
        <p className="mt-5 max-w-md text-sm font-normal leading-6 text-[#4E4B44]">
          {t("success.description")}
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-8 rounded-full bg-[#B7D1EA] px-6 py-3 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:bg-[#A5C2DE]/90 active:scale-95"
        >
          {t("success.sendAnother")}
        </button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      data-analytics-form="contact_form"
      data-analytics-submit-event="support_request_submitted"
      className="space-y-6"
    >
      <div data-contact-field>
        <label htmlFor="name" className="text-sm font-medium text-[#1C1C1A]">
          {t("fields.name")}
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          className="mt-2 w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] px-4 py-3 text-sm font-medium text-[#1C1C1A] outline-none transition placeholder:text-[#4E4B44]/50 focus:border-[#7CA8D0] focus:bg-[#F0EEE9] focus:ring-0"
          placeholder={t("placeholders.name")}
        />
      </div>

      <div data-contact-field>
        <label htmlFor="email" className="text-sm font-medium text-[#1C1C1A]">
          {t("fields.email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-2 w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] px-4 py-3 text-sm font-medium text-[#1C1C1A] outline-none transition placeholder:text-[#4E4B44]/50 focus:border-[#7CA8D0] focus:bg-[#F0EEE9] focus:ring-0"
          placeholder="you@company.com"
        />
      </div>

      <div data-contact-field>
        <label htmlFor="company" className="text-sm font-medium text-[#1C1C1A]">
          {t("fields.company")}
        </label>
        <input
          id="company"
          name="company"
          type="text"
          autoComplete="organization"
          className="mt-2 w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] px-4 py-3 text-sm font-medium text-[#1C1C1A] outline-none transition placeholder:text-[#4E4B44]/50 focus:border-[#7CA8D0] focus:bg-[#F0EEE9] focus:ring-0"
          placeholder={t("placeholders.company")}
        />
      </div>

      <div data-contact-field>
        <label htmlFor="budget" className="text-sm font-medium text-[#1C1C1A]">
          {t("fields.budget")}
        </label>
        <select
          id="budget"
          name="budget"
          required
          defaultValue=""
          className="mt-2 w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] px-4 py-3 text-sm font-medium text-[#1C1C1A] outline-none transition focus:border-[#7CA8D0] focus:bg-[#F0EEE9] focus:ring-0"
        >
          {budgetOptions.map((option) => (
            <option key={option.value || "empty"} value={option.value} className="bg-[#F0EEE9] text-[#1C1C1A]">
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div data-contact-field>
        <label htmlFor="details" className="text-sm font-medium text-[#1C1C1A]">
          {t("fields.details")}
        </label>
        <textarea
          id="details"
          name="details"
          required
          rows={5}
          className="mt-2 w-full resize-none rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] px-4 py-3 text-sm font-medium text-[#1C1C1A] outline-none transition placeholder:text-[#4E4B44]/50 focus:border-[#7CA8D0] focus:bg-[#F0EEE9] focus:ring-0"
          placeholder={t("placeholders.details")}
        />
      </div>

      <div data-contact-field>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#B7D1EA] px-8 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:bg-[#A5C2DE]/90 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        >
          {submitting ? t("sending") : t("send")}
        </button>
      </div>
    </form>
  );
}
