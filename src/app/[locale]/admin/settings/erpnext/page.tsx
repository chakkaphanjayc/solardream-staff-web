import { redirect } from "next/navigation";

export default function ErpnextSettingsPage() {
  redirect("/admin/settings/api?tab=erpnext");
}
