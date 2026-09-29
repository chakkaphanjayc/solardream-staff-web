import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, Bot, FileText, FlaskConical, KeyRound, PanelsTopLeft, Workflow } from "@/components/ui/icons";
import { getTranslations } from "next-intl/server";
import { listLineContent } from "@/app/actions/lineContent";
import { listLineAutomationRules } from "@/app/actions/lineAutomation";
import { listLineRichMenuDefinitions } from "@/app/actions/lineRichMenu";
import { listDifyIntegrations } from "@/app/actions/difyIntegration";
import { getLineIntegrationConfig } from "@/lib/lineApi";
import { AdminPageHeader, AdminStatusBadge } from "@/components/admin/AdminPrimitives";

export default async function LineOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  const adminPrefix = `/${locale}/admin`;
  const [t, content, automation, richMenus, dify, lineConfig] = await Promise.all([
    getTranslations("AdminLineOverview"),
    listLineContent({}),
    listLineAutomationRules(),
    listLineRichMenuDefinitions(),
    listDifyIntegrations(),
    getLineIntegrationConfig(),
  ]);
  const connected = Boolean(lineConfig.accessToken && lineConfig.channelSecret);

  return (
    <div className="space-y-5">
      <AdminPageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("readiness")}>
        <ReadinessCard label={t("lineChannel")} value={connected ? t("connected") : t("notConnected")} tone={connected ? "success" : "warning"} />
        <ReadinessCard label={t("contentItems")} value={content.success ? String(content.items.length) : t("unavailable")} tone={content.success ? "info" : "warning"} />
        <ReadinessCard label={t("automationRules")} value={automation.success ? String(automation.rules.length) : t("unavailable")} tone={automation.success ? "info" : "warning"} />
        <ReadinessCard label={t("difyConnections")} value={dify.success ? String(dify.integrations.filter((item) => item.enabled).length) : t("notConnected")} tone={dify.success && dify.integrations.some((item) => item.enabled) ? "success" : "neutral"} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2" aria-label={t("workAreas")}>
        <AreaCard href={`${adminPrefix}/line/content`} icon={FileText} title={t("contentTitle")} description={t("contentDescription")} count={content.success ? content.items.length : null} countLabel={t("items")} />
        <AreaCard href={`${adminPrefix}/line/rich-menu`} icon={PanelsTopLeft} title={t("richMenuTitle")} description={t("richMenuDescription")} count={richMenus.success ? richMenus.definitions.length : null} countLabel={t("drafts")} />
        <AreaCard href={`${adminPrefix}/line/automation`} icon={Workflow} title={t("automationTitle")} description={t("automationDescription")} count={automation.success ? automation.rules.length : null} countLabel={t("rules")} />
        <AreaCard href={`${adminPrefix}/line/test-center`} icon={FlaskConical} title={t("testTitle")} description={t("testDescription")} count={null} countLabel={t("noSideEffects")} />
        <AreaCard href={`${adminPrefix}/line/connections`} icon={KeyRound} title={t("connectionsTitle")} description={t("connectionsDescription")} count={null} countLabel={connected ? t("lineReady") : t("setupRequired")} />
        <AreaCard href={`${adminPrefix}/messages`} icon={Bot} title={t("inboxTitle")} description={t("inboxDescription")} count={null} countLabel={t("humanHandoff")} />
      </section>
      <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] px-4 py-3 text-xs leading-5 text-[var(--solar-ops-muted)]">{t("legacyNote")}</div>
    </div>
  );
}

function ReadinessCard({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "info" | "neutral" }) {
  return <article className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><p className="text-xs text-[var(--solar-ops-muted)]">{label}</p><div className="mt-3"><AdminStatusBadge value={value} tone={tone} /></div></article>;
}

function AreaCard({ href, icon: Icon, title, description, count, countLabel }: { href: string; icon: typeof FileText; title: string; description: string; count: number | null; countLabel: string }) {
  return <Link href={href} className="group rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-5 transition-colors hover:border-[var(--solar-ops-border-strong)] hover:bg-[var(--solar-ops-hover)]"><div className="flex items-start justify-between gap-3"><span className="flex size-9 items-center justify-center rounded-md bg-[var(--solar-ops-hover)] text-[var(--solar-ops-blue)]"><Icon className="size-4" aria-hidden="true" /></span><ArrowRight className="size-4 text-[var(--solar-ops-muted)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></div><h2 className="mt-4 text-sm font-semibold text-[var(--solar-ops-text)]">{title}</h2><p className="mt-1 text-sm leading-6 text-[var(--solar-ops-muted)]">{description}</p><p className="mt-4 text-xs font-semibold text-[var(--solar-ops-body)]">{count === null ? countLabel : `${count} ${countLabel}`}</p></Link>;
}
