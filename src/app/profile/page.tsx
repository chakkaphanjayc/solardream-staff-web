import { redirect } from "next/navigation";

export default function StaffProfileEntry() {
  redirect("/th/login?error=unauthorized");
}
