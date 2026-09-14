import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      id: "/tech-portal",
      name: "SolarDream Technician Portal",
      short_name: "SolarDream Tech",
      description: "A mobile-first installation and handover workspace for SolarDream technicians.",
      start_url: "/tech-portal",
      scope: "/tech-portal",
      display: "standalone",
      background_color: "#F0EEE9",
      theme_color: "#0F172A",
      orientation: "portrait-primary",
      icons: [{ src: "/asset/sd-logo.png", sizes: "1254x1254", type: "image/png", purpose: "maskable" }],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": "application/manifest+json",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
