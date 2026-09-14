import { redirect } from "next/navigation";

export default function LineSettingsPage() {
  redirect("/admin/settings/api?tab=line");
}
