import Link from "next/link";
import { ArrowLeft } from "@/components/ui/icons";
import { requireAdmin } from "@/lib/auth-guard";
import { getLocalizationConfig, getRuntimeMessageEditorData } from "@/app/actions/systemSettings";
import LocalizationSettingsClient from "./LocalizationSettingsClient";
import RuntimeMessageEditorClient from "./RuntimeMessageEditorClient";


export default async function LocalizationSettingsPage() {
  await requireAdmin();
  const [config, messageEditorData] = await Promise.all([
    getLocalizationConfig(),
    getRuntimeMessageEditorData(),
  ]);

  return (
    <div className="space-y-6">
      <Link href="/admin/settings" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold text-slate-300 transition hover:bg-slate-800 hover:text-white"><ArrowLeft className="size-4" /> Back to settings</Link>
      <div><h1 className="text-3xl font-black tracking-tight text-white">Localization</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Manage the fallback language for translated configuration and template content.</p></div>
      <LocalizationSettingsClient initialConfig={config} />
      <RuntimeMessageEditorClient initialData={messageEditorData} availableLocales={config.supportedLocales} />
    </div>
  );
}
