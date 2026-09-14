import { redirect } from "next/navigation";

export default async function AdminBundlesPage() {
  redirect("/admin/settings/api?tab=erpnext");
}
