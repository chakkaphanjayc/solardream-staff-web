"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Component } from "@/types";
import { formatPrice } from "@/lib/utils";
import { Edit2, Trash2, ExternalLink } from "@/components/ui/icons";
import Image from "next/image";
import { deleteComponent } from "@/app/actions/components";

import ConfirmDeleteModal from "@/components/layout/ConfirmDeleteModal";

interface ComponentTableProps {
  initialComponents: Component[];
}

export default function ComponentTable({ initialComponents }: ComponentTableProps) {
  const t = useTranslations("AdminComponentTable");
  const [components, setComponents] = useState(initialComponents);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      await deleteComponent(deleteTargetId);
      setComponents(components.filter((c) => c.id !== deleteTargetId));
    } catch (error) {
      console.error("Failed to delete component:", error);
    } finally {
      setIsDeleting(false);
      setDeleteTargetId(null);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[720px] w-full text-left border-collapse">
        <thead>
          <tr className="border-b bg-[#0B1121]/60">
            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground">{t("component")}</th>
            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground">{t("category")}</th>
            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground">{t("price")}</th>
            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-muted-foreground text-right">{t("actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {components.map((component) => (
            <tr key={component.id} className="hover:bg-[#0B1121]/20 transition-colors group">
              <td className="px-6 py-4">
                <div className="flex items-center gap-4">
                  <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-[#0B1121]">
                    {component.imageUrl && component.imageUrl.trim() !== "" ? (
                      <Image
                        src={component.imageUrl}
                        alt={component.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-slate-150 flex items-center justify-center text-[8px] text-gray-500 font-bold uppercase">
                        {t("noImage")}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{component.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs">{component.description}</p>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <span className="px-2 py-1 rounded-md bg-[#B7D1EA]/10 text-[#0891B2] border border-[#B7D1EA]/20 text-[10px] font-bold uppercase tracking-wider">
                  {component.category}
                </span>
              </td>
              <td className="px-6 py-4 font-mono font-bold text-sm">
                {formatPrice(component.price)}
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-2 hover:bg-[#0B1121] rounded-lg transition-colors text-muted-foreground hover:text-gray-100">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteTargetId(component.id);
                    }}
                    className="p-2 hover:bg-destructive/10 rounded-lg transition-colors text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {components.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-muted-foreground italic">{t("empty")}</p>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={confirmDelete}
        isDeleting={isDeleting}
        title={t("deleteTitle")}
        message={t("deleteMessage")}
      />
    </div>
  );
}
