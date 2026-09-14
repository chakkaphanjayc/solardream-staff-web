import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  manifest: "/tech-portal/manifest.webmanifest",
};

export const instant = false;

export default function TechnicianPortalLayout({ children }: { children: ReactNode }) {
  return children;
}
