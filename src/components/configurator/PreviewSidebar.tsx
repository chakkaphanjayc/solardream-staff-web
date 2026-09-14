"use client";

import { ShoppingBag, Trash2, Save, CheckCircle2, Send } from "@/components/ui/icons";
import dynamic from "next/dynamic";
import { useConfiguratorStore } from "@/store/useConfiguratorStore";
import { formatPrice } from "@/lib/utils";
import { CATEGORIES } from "@/lib/mock-data";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { saveConfiguration } from "@/app/actions/configurations";
import { useUser } from "@/hooks/useUser";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GsapPulse, GsapSpinner } from "@/components/ui/GsapMotion";

const LeadCaptureModal = dynamic(() => import("./LeadCaptureModal"), {
  ssr: false,
});

export default function PreviewSidebar() {
  const t = useTranslations("ConfiguratorSidebar");
  const { user } = useUser();
  const { selectedComponents, totalPrice, removeComponent, reset } = useConfiguratorStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);

  const selectedCount = Object.values(selectedComponents).filter((c) => c !== null).length;

  const handleSave = async () => {
    if (!user) {
      toast.error(t("feedback.signIn"));
      return;
    }
    
    setSaving(true);
    
    // Optimistic delay for smooth feel
    const optimistic = setTimeout(() => {
      setSaved(true);
      setSaving(false);
      toast.success(t("feedback.saving"));
    }, 400);
    
    const componentIds = Object.values(selectedComponents)
      .filter((c) => c !== null)
      .map((c) => c!.id);

    const result = await saveConfiguration(componentIds, totalPrice);
    
    clearTimeout(optimistic);

    if (result.success) {
      setSaved(true);
      toast.success(t("feedback.saved"));
      setTimeout(() => setSaved(false), 3000);
    } else {
      toast.error(result.error || t("feedback.saveFailed"));
      setSaved(false);
    }
    setSaving(false);
  };

  return (
    <>
      <div className="glass rounded-3xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            {t("configuration")}
          </h2>
          <button
            onClick={reset}
            className="p-2 text-muted-foreground hover:text-destructive transition-colors hover:bg-destructive/10 rounded-lg"
            title={t("resetAll")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {CATEGORIES.map((category) => {
            const selected = selectedComponents[category];
            return (
              <div key={category} className="group flex items-center justify-between gap-4 p-3 rounded-xl hover:bg-secondary/50 transition-colors border border-transparent hover:border-border">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                    {category}
                  </p>
                  {selected ? (
                    <p className="text-sm font-bold truncate max-w-[180px]">
                      {selected.name}
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-muted-foreground italic">
                      {t("notSelected")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {selected && (
                    <>
                      <span className="text-sm font-bold text-primary">
                        {formatPrice(selected.price)}
                      </span>
                      <button
                        onClick={() => removeComponent(category)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive transition-all rounded-md bg-secondary"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-6 border-t space-y-4">
          <div className="flex justify-between items-end">
            <span className="text-muted-foreground font-medium">{t("totalEstimate")}</span>
            <span className="text-3xl font-black text-primary tracking-tight">
              {formatPrice(totalPrice)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => setIsLeadModalOpen(true)}
              disabled={selectedCount === 0}
              className="w-full bg-[#D8A87B] hover:bg-[#c99a6e] disabled:bg-muted disabled:text-muted-foreground text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-[#D8A87B]/25"
            >
              <Send className="w-5 h-5 fill-current" />
              {t("requestSurvey")}
            </button>

            {user && (
              <button
                onClick={handleSave}
                disabled={selectedCount === 0 || saving}
                className={cn(
                  "w-full font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] border-2",
                  saved 
                    ? "bg-green-500/10 border-green-500 text-green-500" 
                    : "bg-brand-surface/5 border-white/10 hover:bg-brand-surface/10 text-foreground"
                )}
              >
                {saving ? (
                  <GsapSpinner className="w-4 h-4" />
                ) : saved ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saved ? t("savedToBuilds") : t("saveConfiguration")}
              </button>
            )}
          </div>
          
          {selectedCount > 0 && selectedCount < CATEGORIES.length && (
            <GsapPulse className="text-[11px] text-center text-muted-foreground font-medium">
              {t("completeSelection")}
            </GsapPulse>
          )}
        </div>
      </div>
      {isLeadModalOpen ? (
        <LeadCaptureModal
          isOpen
          onClose={() => setIsLeadModalOpen(false)}
        />
      ) : null}
    </>
  );
}
