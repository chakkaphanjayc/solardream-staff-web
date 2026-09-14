import { redirect } from "next/navigation";


export default function LegacyLineUserGroupsPage() {
  redirect("/admin/settings/user-groups");
}
