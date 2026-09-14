import Link from "next/link";
import { connection } from "next/server";
import { KeyRound, Settings2 } from "@/components/ui/icons";
import { getTranslations } from "next-intl/server";
import { listDifyIntegrations } from "@/app/actions/difyIntegration";
import { getLineIntegrationConfig } from "@/lib/lineApi";
import { AdminPageHeader } from "@/components/admin/AdminPrimitives";
import DifyConnectionsClient from "./DifyConnectionsClient";

export const instant = false;

export default async function LineConnectionsPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  const [t, difyResult, lineConfig] = await Promise.all([
    getTranslations("AdminLineConnections"),
    listDifyIntegrations(),
    getLineIntegrationConfig(),
  ]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        action={<Link href={`/${locale}/admin/settings/api?tab=line`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-sm font-semibold text-[var(--solar-ops-body)] hover:bg-[var(--solar-ops-hover)] hover:text-[var(--solar-ops-text)]"><Settings2 className="size-4" aria-hidden="true" />{t("legacySettings")}</Link>}
      />
      <section className="grid gap-4 md:grid-cols-3" aria-labelledby="line-connection-status-heading">
        <h2 id="line-connection-status-heading" className="sr-only">{t("lineStatus")}</h2>
        <ConnectionCard label={t("channelAccessToken")} configured={Boolean(lineConfig.accessToken)} source={lineConfig.accessTokenSource} t={t} />
        <ConnectionCard label={t("channelSecret")} configured={Boolean(lineConfig.channelSecret)} source={lineConfig.channelSecretSource} t={t} />
        <ConnectionCard label={t("memberRichMenu") } configured={Boolean(lineConfig.memberRichMenuId)} source={lineConfig.memberRichMenuIdSource} t={t} />
      </section>
      <div className="flex items-start gap-3 rounded-lg border border-[#58a6ff]/40 bg-[#58a6ff]/10 px-4 py-3"><KeyRound className="mt-0.5 size-5 shrink-0 text-[#79c0ff]" aria-hidden="true" /><p className="text-xs leading-5 text-[var(--solar-ops-body)]">{t("secretNotice")}</p></div>
      <DifyConnectionsClient initialIntegrations={difyResult.success ? difyResult.integrations : []} initialError={difyResult.success ? null : difyResult.error} />
    </div>
  );
}

function ConnectionCard({ label, configured, source, t }: { label: string; configured: boolean; source: string; t: (key: string) => string }) {
  return <article className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-[var(--solar-ops-text)]">{label}</h3><span className={`size-2 rounded-full ${configured ? "bg-[#3fb950]" : "bg-[#8b949e]"}`} aria-hidden="true" /></div><p className="mt-3 text-xs font-semibold text-[var(--solar-ops-body)]">{configured ? t("configured") : t("notConnected")}</p><p className="mt-1 text-xs text-[var(--solar-ops-muted)]">{t(`sources.${source}`)}</p></article>;
}
