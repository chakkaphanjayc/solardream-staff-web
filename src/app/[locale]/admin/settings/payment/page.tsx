import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth-guard";
import { getPaymentSettings } from "@/app/actions/settings/paymentSettings";
import PaymentSettingsClient from "./PaymentSettingsClient";

export default async function PaymentSettingsPage() {
  await requireAdmin();
  const t = await getTranslations("Admin");
  
  const paymentSettings = await getPaymentSettings();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black text-gray-100 tracking-tight">Payment Settings</h1>
        <p className="text-sm text-gray-400">
          Configure PromptPay and Bank Transfer fallback options for your system.
        </p>
      </div>

      <PaymentSettingsClient initialData={paymentSettings} />
    </div>
  );
}
