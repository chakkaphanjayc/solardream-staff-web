"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock3, Save, ShieldCheck, TimerReset, Video, Search } from "@/components/ui/icons";
import { saveSystemSettings } from "@/app/actions/systemSettings";

type SystemParametersClientProps = {
  initialQuotationExpirationDays: number;
  initialSiteSurveyTimeoutMinutes: number;
  initialHomepageVideoLink: string;
  initialSearchEnableArticles: boolean;
  initialSearchEnableProducts: boolean;
};

export default function SystemParametersClient({
  initialQuotationExpirationDays,
  initialSiteSurveyTimeoutMinutes,
  initialHomepageVideoLink,
  initialSearchEnableArticles,
  initialSearchEnableProducts,
}: SystemParametersClientProps) {
  const router = useRouter();
  const [quotationExpirationDays, setQuotationExpirationDays] = useState(String(initialQuotationExpirationDays));
  const [siteSurveyTimeoutMinutes, setSiteSurveyTimeoutMinutes] = useState(String(initialSiteSurveyTimeoutMinutes));
  const [homepageVideoLink, setHomepageVideoLink] = useState(initialHomepageVideoLink);
  const [searchEnableArticles, setSearchEnableArticles] = useState(initialSearchEnableArticles);
  const [searchEnableProducts, setSearchEnableProducts] = useState(initialSearchEnableProducts);
  const [isSaving, startSavingTransition] = useTransition();

  const normalizedValues = useMemo(() => {
    const quoteDays = Number(quotationExpirationDays);
    const surveyMinutes = Number(siteSurveyTimeoutMinutes);

    return {
      quotationExpirationDays: Number.isFinite(quoteDays) && quoteDays > 0 ? Math.floor(quoteDays) : 7,
      siteSurveyTimeoutMinutes: Number.isFinite(surveyMinutes) && surveyMinutes > 0 ? Math.floor(surveyMinutes) : 120,
    };
  }, [quotationExpirationDays, siteSurveyTimeoutMinutes]);

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    startSavingTransition(async () => {
      try {
        const result = await saveSystemSettings([
          {
            key: "quotation_expiration_days",
            value: String(normalizedValues.quotationExpirationDays),
          },
          {
            key: "site_survey_allocation_timeout_minutes",
            value: String(normalizedValues.siteSurveyTimeoutMinutes),
          },
          {
            key: "homepage_video_link",
            value: homepageVideoLink.trim(),
          },
          {
            key: "search_enable_articles",
            value: String(searchEnableArticles),
          },
          {
            key: "search_enable_products",
            value: String(searchEnableProducts),
          },
        ]);

        if (result.success) {
          toast.success("System parameters and search settings have been successfully updated.");
          router.refresh();
        } else {
          toast.error(result.error || "Failed to update system parameters.");
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update system parameters.";
        toast.error(message);
      }
    });
  };

  return (
    <section className="space-y-6 rounded-xl border border-[#1E293B] bg-[#0F172A] p-6 shadow-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gray-400">Global Application Parameters</p>
          <h2 className="mt-2 text-2xl font-black text-gray-100">System Parameters Management</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-gray-400">
            Adjust operational defaults used across proposal expiration, search crawl databases, and cinematic content.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-700">
          <ShieldCheck className="h-4 w-4" />
          <span>Live Settings</span>
        </div>
      </div>

      <form onSubmit={handleSave} className="grid gap-4 pb-28 lg:grid-cols-2">
        <div className="rounded-xl border border-[#1E293B]/70 bg-[#0B1121] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gray-400">Quotation Expiration Window</p>
              <h3 className="mt-2 text-base font-black text-gray-100">quotation_expiration_days</h3>
            </div>
            <TimerReset className="h-5 w-5 text-[#B7D1EA]" />
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-xs font-semibold text-gray-400">Number of days before DRAFT / PENDING proposals expire</span>
            <input
              type="number"
              min={1}
              step={1}
              value={quotationExpirationDays}
              onChange={(event) => setQuotationExpirationDays(event.target.value)}
              className="w-full rounded-xl border border-[#1E293B] bg-[#0F172A] px-4 py-3 text-sm font-semibold text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/30"
            />
          </label>

          <p className="mt-3 text-[11px] leading-6 text-gray-400">
            Used by proposal read paths to mark stale quotes as expired when they exceed the configured validity window.
          </p>
        </div>

        <div className="rounded-xl border border-[#1E293B]/70 bg-[#0B1121] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gray-400">Site Survey Allocation Timeout</p>
              <h3 className="mt-2 text-base font-black text-gray-100">site_survey_allocation_timeout_minutes</h3>
            </div>
            <Clock3 className="h-5 w-5 text-[#B7D1EA]" />
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-xs font-semibold text-gray-400">Allocation timeout in minutes for pending survey assignment</span>
            <input
              type="number"
              min={15}
              step={5}
              value={siteSurveyTimeoutMinutes}
              onChange={(event) => setSiteSurveyTimeoutMinutes(event.target.value)}
              className="w-full rounded-xl border border-[#1E293B] bg-[#0F172A] px-4 py-3 text-sm font-semibold text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/30"
            />
          </label>

          <p className="mt-3 text-[11px] leading-6 text-gray-400">
            This supports admin scheduling workflows and can be tuned without redeploying the application.
          </p>
        </div>

        {/* Customer Portal Search Settings */}
        <div className="lg:col-span-2 rounded-xl border border-[#1E293B]/70 bg-[#0B1121] p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gray-400">Customer Portal Search Configuration</p>
              <h3 className="mt-2 text-base font-black text-gray-100">Configured Search Databases</h3>
              <p className="text-xs text-gray-400 mt-1">
                Toggle which databases/tables are crawled when customers search on the After-Sales Support Hub.
              </p>
            </div>
            <Search className="h-5 w-5 text-[#B7D1EA]" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 mt-4">
            <label className="flex items-center gap-3 rounded-xl border border-[#1E293B] bg-[#0F172A] p-4 cursor-pointer hover:border-[#B7D1EA]/50 transition duration-150">
              <input
                type="checkbox"
                checked={searchEnableArticles}
                onChange={(e) => setSearchEnableArticles(e.target.checked)}
                className="w-4 h-4 rounded text-[#B7D1EA] focus:ring-[#B7D1EA]/30 border-[#1E293B] cursor-pointer"
              />
              <div className="text-left">
                <span className="text-xs font-black text-gray-100 uppercase block tracking-wider">Articles & News</span>
                <span className="text-[10px] text-gray-400 mt-0.5 block leading-relaxed">Search official guides</span>
              </div>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-[#1E293B] bg-[#0F172A] p-4 cursor-pointer hover:border-[#B7D1EA]/50 transition duration-150">
              <input
                type="checkbox"
                checked={searchEnableProducts}
                onChange={(e) => setSearchEnableProducts(e.target.checked)}
                className="w-4 h-4 rounded text-[#B7D1EA] focus:ring-[#B7D1EA]/30 border-[#1E293B] cursor-pointer"
              />
              <div className="text-left">
                <span className="text-xs font-black text-gray-100 uppercase block tracking-wider">Product Catalog</span>
                <span className="text-[10px] text-gray-400 mt-0.5 block leading-relaxed">Search in-stock gear</span>
              </div>
            </label>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-[#1E293B]/70 bg-[#0B1121] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gray-400">Homepage Cinematic Video URL</p>
              <h3 className="mt-2 text-base font-black text-gray-100">homepage_video_link</h3>
            </div>
            <Video className="h-5 w-5 text-[#B7D1EA]" />
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-xs font-semibold text-gray-400">Video source URL (local path or direct hosting URL)</span>
            <input
              type="text"
              value={homepageVideoLink}
              onChange={(event) => setHomepageVideoLink(event.target.value)}
              className="w-full rounded-xl border border-[#1E293B] bg-[#0F172A] px-4 py-3 text-sm font-semibold text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/30"
              placeholder="/videos/preview_homescreen.mp4"
            />
          </label>

          <p className="mt-3 text-[11px] leading-6 text-gray-400">
            Update the playing cinematic backdrop on the landing page hero section. Ensure the hosting server supports HTTP range-requests for full device compatibility (Safari/iOS).
          </p>
        </div>

        <div className="lg:col-span-2 sticky bottom-4 z-20 flex items-center justify-end rounded-xl border border-[#1E293B] bg-[#0F172A]/95 px-4 py-4 shadow-none backdrop-blur">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#B7D1EA] px-5 py-3 text-sm font-black uppercase tracking-wider text-gray-100 shadow-none transition hover:bg-[#B7D1EA]/85 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save System Parameters"}
          </button>
        </div>
      </form>
    </section>
  );
}
