import type { Metadata } from "next";
import { connection } from "next/server";
import "./admin.css";

import { requireStaff } from "@/lib/auth-guard";
import AdminMobileNav from "@/components/admin/AdminMobileNav";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminThemeScope from "@/components/admin/AdminThemeScope";
import AdminTopbar from "@/components/admin/AdminTopbar";
import AdminCommandPaletteLoader from "@/components/admin/AdminCommandPaletteLoader";
import RealtimeProvider from "@/components/providers/RealtimeProvider";
import { getConfiguredAdminSiteUrl } from "@/lib/siteUrl";

// The operations console is request-bound by design: its auth guard reads the
// session cookie before any page content can render.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const adminUrl = getConfiguredAdminSiteUrl();

  return {
    metadataBase: new URL(adminUrl),
    title: "Admin Console - SolarDream",
    description: "Secure administrative dashboard for SolarDream solar solutions.",
    robots: {
      index: false,
      follow: false,
    },
    alternates: {
      canonical: `/${locale}/admin`,
      languages: {
        th: "/th/admin",
        en: "/en/admin",
      },
    },
    openGraph: {
      title: "Admin Console - SolarDream",
      description: "Secure administrative dashboard for SolarDream solar solutions.",
      siteName: "SolarDream Admin",
      type: "website",
    },
  };
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  // Protect all /admin routes securely on the server
  const staffUser = await requireStaff();
  const adminUser = {
    role: staffUser.role,
    email: staffUser.email,
    name: staffUser.name,
  };

  return (
    <RealtimeProvider>
      <div data-bagui="operations-shell" data-admin-theme="dark" className="solar-ops flex h-screen w-full overflow-hidden bg-[#0d1117] text-[#c9d1d9]">
        <AdminThemeScope />
        <div className="hidden h-full w-64 shrink-0 border-r border-[#30363d] bg-[#161b22] lg:block">
          <AdminSidebar currentUser={adminUser} />
        </div>

        <div
          data-lenis-prevent
          className="custom-scrollbar relative flex h-full min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-[#0d1117]"
        >
          <AdminTopbar />
          {children}
        </div>

        <AdminMobileNav currentUser={adminUser} />
        <AdminCommandPaletteLoader />
      </div>
    </RealtimeProvider>
  );
}
