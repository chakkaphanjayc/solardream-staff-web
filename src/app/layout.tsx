import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./[locale]/globals.css";

export const metadata: Metadata = {
  title: "SolarDream Staff",
  description: "SolarDream staff workspace.",
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/asset/sd-logo.png", type: "image/png", sizes: "1254x1254" }],
  },
};

export default function StaffRootLayout({ children }: { children: ReactNode }) {
  return children;
}
