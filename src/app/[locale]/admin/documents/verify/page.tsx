import type { Metadata } from "next";

import { requireStaff } from "@/lib/auth-guard";
import { DocumentVerificationDropzone } from "@/components/document-signing/DocumentVerificationDropzone";

export const metadata: Metadata = {
  title: "Verify document | SolarDream Admin",
  robots: { index: false, follow: false },
};

export default async function AdminDocumentVerificationPage() {
  await requireStaff();

  return (
    <main className="min-h-full bg-[#0d1117] px-4 py-6 text-[#c9d1d9] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-[#30363d] pb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#58a6ff]">Document Control</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#f0f6fc]">Verify a signed document</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8b949e]">
            Upload a PDF for in-memory cryptographic verification. Files are not stored by the Staff app.
          </p>
        </header>
        <section className="mt-6 rounded-xl border border-[#30363d] bg-[#161b22] p-4 sm:p-6" aria-labelledby="document-verification-heading">
          <h2 id="document-verification-heading" className="sr-only">PDF verification form</h2>
          <DocumentVerificationDropzone />
        </section>
      </div>
    </main>
  );
}
