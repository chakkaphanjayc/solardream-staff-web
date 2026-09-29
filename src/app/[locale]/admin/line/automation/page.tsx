import Link from "next/link";
import { connection } from "next/server";
import { FlaskConical } from "@/components/ui/icons";
import { getTranslations } from "next-intl/server";
import { listLineAutomationRules } from "@/app/actions/lineAutomation";
import { AdminPageHeader } from "@/components/admin/AdminPrimitives";
import LineAutomationClient from "./LineAutomationClient";

export default async function LineAutomationPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  const [t, result] = await Promise.all([
    getTranslations("AdminLineAutomation"),
    listLineAutomationRules(),
  ]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        action={
          <Link href={`/${locale}/admin/line/test-center`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-sm font-semibold text-[var(--solar-ops-body)] hover:bg-[var(--solar-ops-hover)] hover:text-[var(--solar-ops-text)]">
            <FlaskConical className="size-4" aria-hidden="true" />
            {t("testCenter")}
          </Link>
        }
      />
      <LineAutomationClient locale={locale} initialRules={result.success ? result.rules : []} initialError={result.success ? null : result.error} />
    </div>
  );
}
