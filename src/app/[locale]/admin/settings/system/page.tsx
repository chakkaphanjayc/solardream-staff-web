import Link from "next/link";
import { ArrowLeft, Sliders } from "@/components/ui/icons";
import { requireAdmin } from "@/lib/auth-guard";
import { getSystemSetting } from "@/app/actions/systemSettings";
import SystemParametersClient from "../SystemParametersClient";


export default async function SystemSettingsPage() {
  await requireAdmin();

  const [
    quotationExpirationDaysValue,
    siteSurveyTimeoutValue,
    videoLinkValue,
    searchEnableArticlesValue,
    searchEnableProductsValue,
  ] = await Promise.all([
    getSystemSetting("quotation_expiration_days"),
    getSystemSetting("site_survey_allocation_timeout_minutes"),
    getSystemSetting("homepage_video_link"),
    getSystemSetting("search_enable_articles"),
    getSystemSetting("search_enable_products"),
  ]);

  const quotationExpirationDays = Number(quotationExpirationDaysValue);
  const siteSurveyTimeoutMinutes = Number(siteSurveyTimeoutValue);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#0B1121] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-gray-300">
            <Sliders className="h-4 w-4 text-gray-100" />
            Tool Config
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight text-gray-100">
              System Parameters
            </h1>
            <p className="max-w-3xl text-sm font-medium leading-6 text-gray-400">
              Manage quotation expiration, survey timeout, portal search scopes, and the homepage cinematic video from one save action.
            </p>
          </div>
        </div>

        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-2 rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-xs font-black uppercase tracking-wider text-gray-400 transition hover:border-[#B7D1EA] hover:text-[#B7D1EA]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>

      <SystemParametersClient
        initialQuotationExpirationDays={
          Number.isFinite(quotationExpirationDays) && quotationExpirationDays > 0
            ? Math.floor(quotationExpirationDays)
            : 7
        }
        initialSiteSurveyTimeoutMinutes={
          Number.isFinite(siteSurveyTimeoutMinutes) && siteSurveyTimeoutMinutes > 0
            ? Math.floor(siteSurveyTimeoutMinutes)
            : 120
        }
        initialHomepageVideoLink={videoLinkValue || "/videos/preview_homescreen.mp4"}
        initialSearchEnableArticles={searchEnableArticlesValue !== "false"}
        initialSearchEnableProducts={searchEnableProductsValue !== "false"}
      />
    </div>
  );
}
