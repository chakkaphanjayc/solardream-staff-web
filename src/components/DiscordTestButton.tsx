"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { triggerDiscordTestNotification } from "@/app/actions/discordTest";
import { Terminal, Send } from "@/components/ui/icons";

export default function DiscordTestButton() {
    const t = useTranslations("DiscordTestButton");
    const [loading, setLoading] = useState(false);

    const handleTest = async () => {
        setLoading(true);
        try {
            const res = await triggerDiscordTestNotification();
            if (res.success) {
                toast.success(res.message);
            } else {
                toast.error(t("errorAlert", { error: res.error }));
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to send Discord test notification.";
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 shadow-xl max-w-md mt-8">
            <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-5 h-5 text-[#1CBBBB]" />
                <h3 className="font-bold text-sm uppercase tracking-wider text-slate-200">{t("title")}</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
                {t("description")}
            </p>
            <button
                onClick={handleTest}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#1CBBBB] hover:bg-[#159999] disabled:bg-slate-700 text-white font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
                <Send className="w-4 h-4" />
                {loading ? t("sending") : t("testAction")}
            </button>
        </div>
    );
}
