import { redirect } from "next/navigation";

export const metadata = {
  title: "ERPNext Add-ons | SolarDream Admin",
  description: "Add-ons are read from ERPNext Item records.",
};

export default async function AddonsConfigPage() {
  redirect("/admin/settings/api?tab=erpnext");
}
