import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { listLineContent } from "@/app/actions/lineContent";
import { AdminPageHeader } from "@/components/admin/AdminPrimitives";
import LineContentLibraryClient from "./LineContentLibraryClient";

export default async function LineContentPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  const [t, result] = await Promise.all([getTranslations("AdminLineContent"), listLineContent({ locale: locale === "en" ? "en" : "th" })]);

  return (
    <div className="space-y-5">
      <AdminPageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
      <LineContentLibraryClient locale={locale === "en" ? "en" : "th"} initialItems={result.items} initialError={result.success ? null : result.error} />
    </div>
  );
}
