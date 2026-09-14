import Link from "next/link";
import { connection } from "next/server";
import { CalendarRange } from "@/components/ui/icons";
import { listLineRichMenuDefinitions } from "@/app/actions/lineRichMenu";
import { AdminPageHeader } from "@/components/admin/AdminPrimitives";
import { getTranslations } from "next-intl/server";
import RichMenuBuilderClient from "./RichMenuBuilderClient";

export const instant = false;

export default async function LineRichMenuPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  const [t, result] = await Promise.all([
    getTranslations("AdminRichMenu"),
    listLineRichMenuDefinitions(),
  ]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        action={
          <Link
            href={`/${locale}/admin/settings/line/scheduler`}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-sm font-semibold text-[var(--solar-ops-body)] transition-colors hover:bg-[var(--solar-ops-hover)] hover:text-[var(--solar-ops-text)]"
          >
            <CalendarRange className="size-4" aria-hidden="true" />
            {t("scheduler")}
          </Link>
        }
      />
      <RichMenuBuilderClient
        locale={locale}
        timezone={process.env.LINE_AUTOMATION_TIMEZONE || "Asia/Bangkok"}
        initialDefinitions={result.success ? result.definitions : []}
        initialError={result.success ? null : result.error}
      />
    </div>
  );
}
