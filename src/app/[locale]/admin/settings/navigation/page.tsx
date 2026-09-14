import { redirect } from "next/navigation";

export default function NavigationSettingsRedirectPage() {
  redirect("/admin/settings/compliance?tab=navigation");
}
