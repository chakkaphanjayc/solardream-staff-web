import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { ArrowRight, ChevronLeft } from "@/components/ui/icons";

import { getAdminWorkspaceBySlug } from "@/components/admin/adminNavigation";
import { getDbUser } from "@/app/actions/auth";

type AdminWorkspacePageProps = {
  params: Promise<{ locale: string; workspace: string }>;
};

// Workspace dashboards read request-scoped locale and access data, so they
// should render on demand instead of being treated as instant-prefetch UI.
export default async function AdminWorkspacePage({ params }: AdminWorkspacePageProps) {
  await connection();
  const { locale, workspace: workspaceSlug } = await params;
  const workspace = getAdminWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const t = await getTranslations("AdminSidebar");
  const pageT = await getTranslations("AdminWorkspaceDashboard");
  const user = await getDbUser();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  if (workspace.adminOnly && !isAdmin) notFound();
  const visibleSections = workspace.sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.adminOnly || isAdmin),
    }))
    .filter((section) => section.items.length > 0);
  const WorkspaceIcon = workspace.icon;

  return (
    <div data-bagui="admin-workspace" className="space-y-8 text-[#c9d1d9]">
      <header className="border-b border-[#30363d] pb-6">
        <Link
          href={`/${locale}/admin`}
          className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-[#8b949e] transition-colors hover:text-[#f0f6fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff]"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          {pageT("backToAll")}
        </Link>
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#8b949e]">
              <WorkspaceIcon className={cnWorkspaceAccent(workspace.accentClass)} aria-hidden="true" />
              <span>{pageT("eyebrow")}</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#f0f6fc] sm:text-3xl">
              {pageT(`titles.${workspace.labelKey}`)}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8b949e]">
              {pageT(`descriptions.${workspace.id}`)}
            </p>
          </div>
          <span data-bagui="badge" className="inline-flex min-h-9 items-center gap-2 self-start rounded-md border border-[#30363d] bg-[#161b22] px-3 text-xs font-medium text-[#8b949e] sm:self-auto">
            {pageT("toolCount", { count: visibleSections.reduce((count, section) => count + section.items.length, 0) })}
          </span>
        </div>
      </header>

      <section aria-labelledby="workspace-tools-heading">
        <div className="mb-4">
          <h2 id="workspace-tools-heading" className="text-lg font-semibold text-[#f0f6fc]">{pageT("toolsTitle")}</h2>
          <p className="mt-1 text-sm text-[#8b949e]">{pageT("toolsDescription")}</p>
        </div>

        <div className="space-y-6">
          {visibleSections.map((section) => (
            <section key={section.id} aria-labelledby={`${section.id}-heading`}>
              <h3 id={`${section.id}-heading`} className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#8b949e]">
                {t(`sections.${section.labelKey}`)}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      data-bagui="card"
                      href={`/${locale}${item.href}`}
                      className="ops-surface group flex min-h-28 items-start gap-4 rounded-md p-5 transition-colors hover:border-[#8b949e] hover:bg-[#21262d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1117]"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#21262d] text-[#8b949e] group-hover:text-[#f0f6fc]">
                        <Icon className="size-[18px]" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-3 text-sm font-semibold text-[#f0f6fc]">
                          <span>{t(`nav.${item.labelKey}`)}</span>
                          <ArrowRight className="size-4 shrink-0 text-[#8b949e] transition-transform group-hover:translate-x-0.5 group-hover:text-[#58a6ff]" aria-hidden="true" />
                        </span>
                        <span className="mt-2 block text-xs leading-5 text-[#8b949e]">{pageT("openTool", { tool: t(`nav.${item.labelKey}`) })}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

function cnWorkspaceAccent(accentClass: string) {
  return `size-4 ${accentClass}`;
}
