import { redirect } from "next/navigation";

export default async function AdminProductsPage() {
  redirect("/admin/settings/api?tab=erpnext");
}
