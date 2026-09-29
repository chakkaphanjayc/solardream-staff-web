import Link from "next/link";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { and, count, eq, ne } from "drizzle-orm";
import { ArrowUpRight, BarChart3, CheckCircle2, CircleAlert, Inbox, Users } from "@/components/ui/icons";

import { getSystemSetting } from "@/app/actions/systemSettings";
import { getDbUser } from "@/app/actions/auth";
import { db } from "@/db";
import { chatThreads, inboundRequests, installationJobTickets, integrationOutbox } from "@/db/schema";
import { ADMIN_NAV_SECTIONS } from "@/components/admin/adminNavigation";
import { AdminPageHeader, AdminStatusBadge } from "@/components/admin/AdminPrimitives";

const DEFAULT_UMAMI_DASHBOARD_URL = "https://umami.solar-dream.org";

async function getUmamiDashboardUrl() {
  const storedUrl = await getSystemSetting("umami_url");
  return (storedUrl || process.env.NEXT_PUBLIC_UMAMI_URL || process.env.UMAMI_URL || DEFAULT_UMAMI_DASHBOARD_URL).trim().replace(/\/$/, "");
}

async function safeCount(query: Promise<Array<{ value: number }>>): Promise<number | null> {
  try {
    const [row] = await query;
    return row ? Number(row.value) : null;
  } catch (error: unknown) {
    console.warn("[Admin overview] Count unavailable:", error instanceof Error ? error.message : "Unknown database error");
    return null;
  }
}

export default async function AdminDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  const [t, sidebarT, umamiDashboardUrl, user, newRequests, inboxWaiting, fieldWork, failedIntegrations] = await Promise.all([
    getTranslations("AdminDashboard"),
    getTranslations("AdminSidebar"),
    getUmamiDashboardUrl(),
    getDbUser(),
    safeCount(db.select({ value: count() }).from(inboundRequests).where(eq(inboundRequests.status, "NEW"))),
    safeCount(db.select({ value: count() }).from(chatThreads).where(and(eq(chatThreads.isArchived, false), ne(chatThreads.status, "CLOSED")))),
    safeCount(db.select({ value: count() }).from(installationJobTickets).where(ne(installationJobTickets.status, "COMPLETED"))),
    safeCount(db.select({ value: count() }).from(integrationOutbox).where(ne(integrationOutbox.status, "PROCESSED"))),
  ]);
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const shortcuts = ADMIN_NAV_SECTIONS.flatMap((section) => section.items).filter((item) => !item.adminOnly || isAdmin).filter((item) => !["overview", "pending-work"].includes(item.id)).slice(0, 8);
  const metrics = [
     { label: t("metrics.newRequests"), value: newRequests, href: `/${locale}/admin/requests`, tone: (newRequests ?? 0) > 0 ? "warning" : "success", icon: Inbox },
     { label: t("metrics.inboxWaiting"), value: inboxWaiting, href: `/${locale}/admin/messages`, tone: (inboxWaiting ?? 0) > 0 ? "info" : "success", icon: Users },
     { label: t("metrics.fieldWork"), value: fieldWork, href: `/${locale}/admin/job-tickets`, tone: (fieldWork ?? 0) > 0 ? "info" : "success", icon: CheckCircle2 },
     { label: t("metrics.integrationIssues"), value: failedIntegrations, href: `/${locale}/admin/settings/integration-sync`, tone: (failedIntegrations ?? 0) > 0 ? "danger" : "success", icon: CircleAlert },
  ] as const;

  return (
    <div data-bagui="admin-dashboard" className="space-y-6 text-[var(--solar-ops-body)]">
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        action={
          <Link href={`/${locale}/admin/requests`} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--solar-ops-green)] px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--solar-ops-green-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--solar-ops-blue)]">
            {t("reviewRequests")}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        }
      />

      <section aria-labelledby="today-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 id="today-heading" className="text-lg font-semibold text-[var(--solar-ops-text)]">{t("todayTitle")}</h2>
            <p className="mt-1 text-sm text-[var(--solar-ops-muted)]">{t("todayDescription")}</p>
          </div>
          <span className="hidden text-xs text-[var(--solar-ops-muted)] sm:block">{t("liveData")}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <Link key={metric.href} href={metric.href} className="group rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4 transition-colors hover:border-[var(--solar-ops-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--solar-ops-blue)]">
                <div className="flex items-start justify-between gap-3">
                   <span className="flex size-9 items-center justify-center rounded-md bg-[var(--solar-ops-hover)] text-[var(--solar-ops-blue)]"><Icon className="size-4" aria-hidden="true" /></span>
                   <AdminStatusBadge value={metric.value === null ? t("status.unavailable") : metric.value > 0 ? t("status.needsAttention") : t("status.clear")} tone={metric.value === null ? "neutral" : metric.tone} />
                 </div>
                 <p className="mt-5 text-3xl font-semibold tracking-tight text-[var(--solar-ops-text)]">{metric.value === null ? "—" : metric.value.toLocaleString(locale)}</p>
                <p className="mt-1 text-sm text-[var(--solar-ops-muted)]">{metric.label}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("shortcutsTitle")}</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--solar-ops-muted)]">{t("shortcutsDescription")}</p>
            </div>
            <span className="rounded-md bg-[var(--solar-ops-hover)] p-2 text-[var(--solar-ops-blue)]"><Users className="size-4" aria-hidden="true" /></span>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {shortcuts.map((item) => (
              <Link key={item.id} href={`/${locale}${item.href}`} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-[var(--solar-ops-border)] px-3 text-sm font-medium text-[var(--solar-ops-body)] transition-colors hover:bg-[var(--solar-ops-hover)] hover:text-[var(--solar-ops-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--solar-ops-blue)]">
                {sidebarT(`nav.${item.labelKey}`)}
                <ArrowUpRight className="size-4 shrink-0 text-[var(--solar-ops-muted)]" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--solar-ops-hover)] text-[var(--solar-ops-blue)]"><BarChart3 className="size-4" aria-hidden="true" /></span>
            <div>
              <h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("analyticsTitle")}</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--solar-ops-muted)]">{t("analyticsDescription")}</p>
            </div>
          </div>
          <a href={umamiDashboardUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3.5 text-sm font-semibold text-[var(--solar-ops-body)] transition-colors hover:bg-[var(--solar-ops-hover)] hover:text-[var(--solar-ops-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--solar-ops-blue)]">
            {t("openAnalytics")}
            <ArrowUpRight className="size-4 text-[var(--solar-ops-blue)]" aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  );
}
