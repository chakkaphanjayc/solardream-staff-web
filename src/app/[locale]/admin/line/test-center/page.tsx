import Link from "next/link";
import { connection } from "next/server";
import { FlaskConical } from "@/components/ui/icons";
import { getTranslations } from "next-intl/server";
import { listLineAutomationRules } from "@/app/actions/lineAutomation";
import { listDifyIntegrations } from "@/app/actions/difyIntegration";
import { AdminPageHeader } from "@/components/admin/AdminPrimitives";
import LineTestCenterClient from "./LineTestCenterClient";

export default async function LineTestCenterPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  const [t, rulesResult, difyResult] = await Promise.all([
    getTranslations("AdminLineTestCenter"),
    listLineAutomationRules(),
    listDifyIntegrations(),
  ]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        action={<Link href={`/${locale}/admin/line/automation`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-sm font-semibold text-[var(--solar-ops-body)] hover:bg-[var(--solar-ops-hover)]"><FlaskConical className="size-4" aria-hidden="true" />{t("automationRules")}</Link>}
      />
      <LineTestCenterClient
        initialRules={rulesResult.success ? rulesResult.rules : []}
        initialIntegrations={difyResult.success ? difyResult.integrations : []}
        initialError={rulesResult.success ? null : rulesResult.error}
      />
    </div>
  );
}
