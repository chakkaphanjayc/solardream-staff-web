import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { getStaffInboxThreads } from "@/app/actions/chat";
import { listLineContent } from "@/app/actions/lineContent";
import { AdminPageHeader } from "@/components/admin/AdminPrimitives";
import AdminInboxClient from "./AdminInboxClient";

export default async function AdminMessagesPage() {
  await connection();
  const [t, result, contentResult] = await Promise.all([
    getTranslations("AdminInbox"),
    getStaffInboxThreads(),
    listLineContent({ status: "PUBLISHED", locale: "all" }),
  ]);
  return (
    <div className="space-y-5">
      <AdminPageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
      <AdminInboxClient
        initialThreads={result.success ? (result.threads ?? []) : []}
        initialError={result.success ? null : (result.error ?? t("unavailable"))}
        initialContentItems={contentResult.success ? contentResult.items : []}
      />
    </div>
  );
}
