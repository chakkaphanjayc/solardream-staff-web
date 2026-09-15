import type { Metadata } from "next";

import { listDocumentTemplatesAction } from "@/app/actions/documentTemplates";
import { requireStaff } from "@/lib/auth-guard";
import DocumentTemplateEditor from "./DocumentTemplateEditor";

export const metadata: Metadata = {
  title: "Document templates | SolarDream Admin",
  robots: { index: false, follow: false },
};

export default async function AdminDocumentTemplatesPage() {
  await requireStaff();
  const result = await listDocumentTemplatesAction();

  return (
    <main className="min-h-full bg-[#0d1117] px-4 py-6 text-[#c9d1d9] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-6 border-b border-[#30363d] pb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#58a6ff]">Document control</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#f0f6fc]">Templates</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8b949e]">
            Create versioned quotation templates, place recipient fields in PDF crop-box coordinates, validate the layout, and publish an immutable version.
          </p>
        </header>
        <DocumentTemplateEditor initialTemplates={result.templates} initialError={result.success ? undefined : result.error} />
      </div>
    </main>
  );
}
