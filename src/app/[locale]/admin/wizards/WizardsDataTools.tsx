"use client";

import { useRef, useTransition } from "react";
import { Download, FileSpreadsheet, Trash2, Upload } from "@/components/ui/icons";
import { toast } from "sonner";
import { deleteWizards, importWizards, type WizardWithRelations } from "@/app/actions/wizard";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { downloadCsv, readCsvRows } from "@/lib/clientCsv";

export default function WizardsDataTools({
  wizards,
}: {
  wizards: WizardWithRelations[];
}) {
  const router = useRouter();
  const t = useTranslations("WizardsDataTools");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const selection = useAdminSelection(wizards.map((wizard) => wizard.id));

  const rows = wizards.map((wizard) => ({
    id: wizard.id,
    title: wizard.title,
    slug: wizard.slug,
    description: wizard.description ?? "",
    translations: JSON.stringify(wizard.translations ?? {}),
    isActive: wizard.isActive,
    recommendationConfig: JSON.stringify(wizard.recommendationConfig ?? {}),
    steps: JSON.stringify(wizard.steps ?? []),
    rules: JSON.stringify(wizard.rules ?? []),
  }));

  const handleExport = (template = false) => {
    const exportRows = template
      ? [
          {
            id: "",
            title: "Imported Wizard",
            slug: "imported-wizard",
            description: "Wizard imported from spreadsheet",
            translations: JSON.stringify({
              th: { title: "วิซาร์ดที่นำเข้า", description: "นำเข้าจากสเปรดชีต" },
              en: { title: "Imported Wizard", description: "Wizard imported from spreadsheet" },
            }),
            isActive: false,
            recommendationConfig: JSON.stringify({}),
            rules: JSON.stringify([]),
            steps: JSON.stringify([
              {
                title: "Step 1",
                description: "",
                questions: [
                  {
                    type: "RADIO_CARD",
                    questionText: "Question text",
                    helperText: "",
                    stateKey: "customKey",
                    options: [
                      {
                        label: "Option",
                        value: "option",
                        description: "",
                        icon: "",
                        isRecommended: false,
                      },
                    ],
                  },
                ],
              },
            ]),
          },
        ]
      : rows;
    downloadCsv(exportRows, `wizards-${template ? "template" : "export"}`);
  };

  const handleImportFile = async (file: File) => {
    try {
      const importRows = await readCsvRows(file);
      startTransition(async () => {
        try {
          const result = await importWizards(importRows);
          if (result.success) {
            toast.success(result.message);
            router.refresh();
          } else {
            toast.error(result.error || result.message || t("feedback.importFailed"));
            if (result.errors?.length) console.error("Wizard import errors:", result.errors);
          }
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t("feedback.importFailed"));
        }
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("feedback.readFailed"));
    }
  };

  const handleDelete = () => {
    if (selection.selectedCount === 0) {
      toast.error(t("feedback.selectFirst"));
      return;
    }
    if (!confirm(t("feedback.confirmDelete", { count: selection.selectedCount }))) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await deleteWizards(selection.selectedIds);
        if (result.success) {
          toast.success(result.message);
          selection.clear();
          router.refresh();
        } else {
          toast.error(result.error || t("feedback.deleteFailed"));
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("feedback.deleteFailed"));
      }
    });
  };

  return (
    <div className="mb-8 bg-[#0F172A] border border-[#1E293B] rounded-2xl p-5 shadow-none space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handleImportFile(file);
        }}
      />
      <AdminBulkActionBar
        selectedCount={selection.selectedCount}
        visibleCount={wizards.length}
        allVisibleSelected={selection.allVisibleSelected}
        someVisibleSelected={selection.someVisibleSelected}
        onToggleVisible={selection.toggleVisible}
        onClear={selection.clear}
        isPending={isPending}
        actions={[{
          id: "delete",
          label: "Delete",
          icon: Trash2,
          tone: "danger",
          onClick: handleDelete,
        }]}
      />
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div>
          <h2 className="text-sm font-black text-gray-100 uppercase tracking-wider">
            {t("title")}
          </h2>
          <p className="text-xs text-gray-400 font-semibold mt-1">
            {t("description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleExport(true)}
            className="px-3 py-2 rounded-xl border border-[#1E293B] text-gray-400 hover:text-[#B7D1EA] hover:border-[#B7D1EA]/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {t("actions.template")}
          </button>
          <button
            type="button"
            onClick={() => handleExport()}
            className="px-3 py-2 rounded-xl border border-[#1E293B] text-gray-400 hover:text-[#B7D1EA] hover:border-[#B7D1EA]/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {t("actions.csv")}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
            className="px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-700 text-[10px] font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {t("actions.import")}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {wizards.map((wizard) => (
          <label
            key={wizard.id}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider cursor-pointer ${
              selection.isSelected(wizard.id)
                ? "border-[#B7D1EA]/40 bg-[#B7D1EA]/10 text-[#99BFE3]"
                : "border-[#1E293B] bg-[#0B1121] text-gray-400"
            }`}
          >
            <input
              type="checkbox"
              checked={selection.isSelected(wizard.id)}
              onChange={() => selection.toggle(wizard.id)}
              className="w-3.5 h-3.5 rounded border-[#1E293B] text-[#B7D1EA] focus:ring-[#B7D1EA]"
            />
            {wizard.title}
          </label>
        ))}
      </div>
    </div>
  );
}
