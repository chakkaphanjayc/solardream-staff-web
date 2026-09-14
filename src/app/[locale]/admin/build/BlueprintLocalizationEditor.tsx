"use client";

import { useState, useTransition } from "react";
import { Languages, Save } from "@/components/ui/icons";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { ContentLocaleTabs } from "@/components/admin/ContentLocaleTabs";
import type { Locale } from "@/i18n/locales";
import { updateBlueprint } from "./actions";

type BlueprintTranslations = Partial<Record<Locale, { name?: string; description?: string | null }>>;

interface BlueprintLocalizationEditorProps {
  blueprint: {
    id: string;
    name: string;
    description: string | null;
    translations: BlueprintTranslations | null;
  };
}

export default function BlueprintLocalizationEditor({ blueprint }: BlueprintLocalizationEditorProps) {
  const t = useTranslations("BlueprintLocalizationEditor");
  const [contentLocale, setContentLocale] = useState<Locale>("th");
  const [translations, setTranslations] = useState<BlueprintTranslations>(blueprint.translations ?? {});
  const [isPending, startTransition] = useTransition();
  const initial = translations[contentLocale];
  const [name, setName] = useState(initial?.name ?? blueprint.name);
  const [description, setDescription] = useState(initial?.description ?? blueprint.description ?? "");

  const switchLocale = (nextLocale: Locale) => {
    setTranslations((current) => ({
      ...current,
      [contentLocale]: { name, description: description || null },
    }));
    const next = translations[nextLocale];
    setContentLocale(nextLocale);
    setName(next?.name ?? blueprint.name);
    setDescription(next?.description ?? blueprint.description ?? "");
  };

  const save = () => {
    const nextTranslations: BlueprintTranslations = {
      ...translations,
      [contentLocale]: { name, description: description || null },
    };
    startTransition(async () => {
      try {
        const result = await updateBlueprint(blueprint.id, {
          name: blueprint.name,
          description: blueprint.description,
          translations: nextTranslations,
        });
        if (result.success) {
          setTranslations(nextTranslations);
          toast.success(t("feedback.saved"));
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Failed to save blueprint translations:", error);
        toast.error(t("feedback.saveFailed"));
      }
    });
  };

  return (
    <section className="rounded-2xl border border-[#1E293B] bg-[#0B1121] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-100">
          <Languages className="h-4 w-4 text-[#B7D1EA]" /> {t("title")}
        </div>
        <ContentLocaleTabs locale={contentLocale} onChange={switchLocale} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-gray-200">{t("fields.name")}
          <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2.5 text-gray-100" />
        </label>
        <label className="text-xs font-semibold text-gray-200">{t("fields.description")}
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2.5 text-gray-100" />
        </label>
      </div>
      <button type="button" onClick={save} disabled={isPending || !name.trim()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#B7D1EA] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50">
        <Save className="h-3.5 w-3.5" /> {isPending ? t("actions.saving") : t("actions.save")}
      </button>
    </section>
  );
}
