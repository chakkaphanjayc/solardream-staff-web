import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";

// Settings pages are authenticated and intentionally request-bound. They are
// not candidates for instant-navigation prefetching.
export const instant = false;

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  await requireAdmin();
  return <>{children}</>;
}
