"use client";

import React, { useRef } from "react";
import { useTranslations } from "next-intl";
import { Download, Upload } from "@/components/ui/icons";
import { toast } from "sonner";

interface DataImportExportProps {
  moduleName: string;
  exportData: Record<string, unknown>[];
  onImport: (data: Record<string, unknown>[]) => void | Promise<void>;
}

export function DataImportExport({
  moduleName,
  exportData,
  onImport,
}: DataImportExportProps) {
  const t = useTranslations("DataImportExport");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    try {
      if (!exportData || exportData.length === 0) {
        toast.error(t("errors.noExportData"));
        return;
      }

      // Get all headers dynamically from keys, filter out nested objects/arrays except specifically serialized ones
      const headers = Object.keys(exportData[0]).filter(
        (key) => typeof exportData[0][key] !== "object" || Array.isArray(exportData[0][key]) || exportData[0][key] === null
      );

      const csvRows: string[] = [];
      // 1. Headers row
      csvRows.push(headers.join(","));

      // 2. Data rows
      for (const row of exportData) {
        const values = headers.map((header) => {
          const value = row[header];
          let cellValue: string;
          
          if (value === null || value === undefined) {
            cellValue = "";
          } else if (Array.isArray(value)) {
            // For labels, convert to string joined by semicolon
            cellValue = value.join(";");
          } else if (typeof value === "string") {
            // Escape double quotes and wrap in quotes if contains commas/quotes/newlines
            cellValue = value.replace(/"/g, '""');
            if (cellValue.includes(",") || cellValue.includes('"') || cellValue.includes("\n") || cellValue.includes("\r")) {
              cellValue = `"${cellValue}"`;
            }
          } else {
            cellValue = String(value);
          }
          return cellValue;
        });
        csvRows.push(values.join(","));
      }

      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      try {
        link.setAttribute("href", url);
        link.setAttribute("download", `solar-${moduleName}-export.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
      toast.success(t("success.exported"));
    } catch (err) {
      console.error(err);
      toast.error(t("errors.exportFailed"));
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          toast.error(t("errors.emptyFile"));
          return;
        }

        const parsedData = parseCSV(text);
        if (parsedData.length === 0) {
          toast.error(t("errors.noCsvData"));
          return;
        }

        await onImport(parsedData);
        if (fileInputRef.current) {
          fileInputRef.current.value = ""; // Reset input
        }
      } catch (err: unknown) {
        console.error(err);
        const message = err instanceof Error ? err.message : t("errors.invalidFormat");
        toast.error(t("errors.importFailed", { message }));
      }
    };
    reader.readAsText(file);
  };

  // Safe client-side CSV parser
  const parseCSV = (text: string): Record<string, unknown>[] => {
    const lines: string[][] = [];
    let row: string[] = [""];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          row[row.length - 1] += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        row.push("");
      } else if ((char === "\r" || char === "\n") && !inQuotes) {
        if (char === "\r" && nextChar === "\n") {
          i++; // skip \n
        }
        lines.push(row);
        row = [""];
      } else {
        row[row.length - 1] += char;
      }
    }
    if (row.length > 1 || row[0] !== "") {
      lines.push(row);
    }

    if (lines.length < 2) return [];

    const headers = lines[0].map((h) => h.trim());
    const data: Record<string, unknown>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i];
      if (values.length < headers.length) continue; // skip incomplete rows
      const obj: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        let val = values[index]?.trim();
        if (val === undefined) val = "";
        obj[header] = val;
      });
      data.push(obj);
    }
    return data;
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleExport}
        className="px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{t("actions.exportCsv")}</span>
      </button>

      <button
        type="button"
        onClick={handleImportClick}
        className="px-3 py-1.5 bg-[#B7D1EA]/20 text-[#2C486A] hover:bg-[#B7D1EA]/40 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
      >
        <Upload className="w-3.5 h-3.5" />
        <span>{t("actions.import")}</span>
      </button>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv"
        className="hidden"
      />
    </div>
  );
}
