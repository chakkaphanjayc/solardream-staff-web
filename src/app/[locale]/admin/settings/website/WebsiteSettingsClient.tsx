"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Globe2, Save, Settings2 } from "@/components/ui/icons";
import { toast } from "sonner";

import { saveWebsiteSettingsJson } from "@/app/actions/websiteSettings";
import type { WebsiteSettings } from "@/lib/websiteSettingsTypes";

type WebsiteSettingsClientProps = {
  initialJson: string;
  activeSettings: WebsiteSettings;
};

export default function WebsiteSettingsClient({
  initialJson,
  activeSettings,
}: WebsiteSettingsClientProps) {
  const [json, setJson] = useState(initialJson);
  const [isPending, startTransition] = useTransition();
  const formattedActive = useMemo(() => JSON.stringify(activeSettings, null, 2), [activeSettings]);

  const save = () => {
    startTransition(async () => {
      try {
        const result = await saveWebsiteSettingsJson(json);
        if (result.success) {
          toast.success("Website settings saved.");
        } else {
          toast.error(result.error || "Website settings could not be saved.");
        }
      } catch (error) {
        console.error("Website settings save error:", error);
        toast.error("Website settings could not be saved. Please try again.");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#B7D1EA]/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-[#B7D1EA]">
            <Globe2 className="h-4 w-4" />
            Website Settings
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-gray-100">
            Footer and Consent Content
          </h1>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-gray-400">
            Manage the local fallback JSON used when ERPNext Website Settings is unavailable. The public site reads ERPNext first, then this fallback.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#B7D1EA] px-5 text-sm font-black text-[#0F172A] transition hover:bg-[#A5C2DE] disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {isPending ? "Saving..." : "Save settings"}
        </button>
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-5">
          <div className="flex items-center gap-2 text-sm font-black text-gray-100">
            <Settings2 className="h-4 w-4 text-[#B7D1EA]" />
            Editable fallback JSON
          </div>
          <textarea
            value={json}
            onChange={(event) => setJson(event.target.value)}
            spellCheck={false}
            className="mt-4 min-h-[560px] w-full resize-y rounded-xl border border-[#1E293B] bg-[#0B1121] px-4 py-3 font-mono text-xs leading-6 text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
          />
        </div>

        <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-5">
          <div className="flex items-center gap-2 text-sm font-black text-gray-100">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Active public payload
          </div>
          <pre className="mt-4 max-h-[620px] overflow-auto rounded-xl border border-[#1E293B] bg-[#0B1121] p-4 text-xs leading-6 text-gray-300">
            {formattedActive}
          </pre>
        </div>
      </section>
    </div>
  );
}
