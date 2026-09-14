"use client";

import NotFoundView from "@/components/ui/NotFoundView";

export default function GlobalNotFound() {
  return (
    <html lang="th">
      <body data-solar-ui="customer" className="min-h-screen bg-[#F0EEE9] text-[#2E2C27] antialiased selection:bg-[#DCE8F5] selection:text-[#2E2C27] [font-family:'Sarabun','Inter',sans-serif]">
        <NotFoundView homeUrl="/" autoRedirectSeconds={5} />
      </body>
    </html>
  );
}
