"use client";

import { useState, useTransition } from "react";
import { 
  CreditCard, 
  Building, 
  Smartphone, 
  Coins, 
  Save, 
  Info
} from "@/components/ui/icons";
import { toast } from "sonner";
import { updatePaymentSettings } from "@/app/actions/settings/paymentSettings";
import { cn } from "@/lib/utils";
import { GsapReveal, GsapSpinner } from "@/components/ui/GsapMotion";

type PaymentSettingsData = {
  promptpayId: string;
  promptpayLimit: number;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
};

interface Props {
  initialData: PaymentSettingsData;
}

export default function PaymentSettingsClient({ initialData }: Props) {
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState<PaymentSettingsData>(initialData);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === "promptpayLimit" ? Number(value) : value,
    }));
  };

  const handleSave = () => {
    startTransition(async () => {
      try {
        const result = await updatePaymentSettings(formData);
        if (result.success) {
          toast.success("Payment settings saved successfully");
        }
      } catch (error) {
        console.error("Failed to save payment settings", error);
        toast.error("Failed to save settings");
      }
    });
  };

  return (
    <GsapReveal className="space-y-8">
      {/* Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Section 1: PromptPay Config */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#B7D1EA]/10 rounded-lg">
              <Smartphone className="w-5 h-5 text-[#B7D1EA]" />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-100 uppercase tracking-wider">
                PromptPay Configuration
              </h2>
              <p className="text-[11px] text-gray-400">
                Setup the default PromptPay details and dynamic limits.
              </p>
            </div>
          </div>

          <div className="space-y-4 bg-[#0F172A] border border-[#1E293B] rounded-2xl p-5 shadow-none">
            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1.5 uppercase tracking-wider">
                PromptPay ID (Mobile or Tax ID)
              </label>
              <input
                type="text"
                name="promptpayId"
                value={formData.promptpayId}
                onChange={handleChange}
                placeholder="e.g. 0812345678"
                className="w-full px-4 py-2.5 bg-[#0B1121] border border-[#1E293B] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1.5 uppercase tracking-wider">
                PromptPay Limit (THB)
              </label>
              <div className="relative">
                <Coins className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="number"
                  name="promptpayLimit"
                  value={formData.promptpayLimit}
                  onChange={handleChange}
                  placeholder="200000"
                  className="w-full pl-10 pr-4 py-2.5 bg-[#0B1121] border border-[#1E293B] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all"
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-1.5 flex items-start gap-1">
                <Info className="w-3 h-3 shrink-0" />
                Amounts exceeding this limit will hide the PromptPay QR and force a Bank Transfer.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Bank Transfer Fallback */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#2C486A]/10 rounded-lg">
              <Building className="w-5 h-5 text-[#2C486A]" />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-100 uppercase tracking-wider">
                Bank Transfer Details
              </h2>
              <p className="text-[11px] text-gray-400">
                Fallback details shown when amount exceeds PromptPay limits.
              </p>
            </div>
          </div>

          <div className="space-y-4 bg-[#0F172A] border border-[#1E293B] rounded-2xl p-5 shadow-none">
            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1.5 uppercase tracking-wider">
                Bank Name
              </label>
              <input
                type="text"
                name="bankName"
                value={formData.bankName}
                onChange={handleChange}
                placeholder="e.g. Kasikorn Bank (KBank)"
                className="w-full px-4 py-2.5 bg-[#0B1121] border border-[#1E293B] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2C486A]/20 focus:border-[#2C486A] transition-all"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1.5 uppercase tracking-wider">
                Account Name
              </label>
              <input
                type="text"
                name="bankAccountName"
                value={formData.bankAccountName}
                onChange={handleChange}
                placeholder="e.g. SolarDream Co., Ltd."
                className="w-full px-4 py-2.5 bg-[#0B1121] border border-[#1E293B] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2C486A]/20 focus:border-[#2C486A] transition-all"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1.5 uppercase tracking-wider">
                Account Number
              </label>
              <div className="relative">
                <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  name="bankAccountNumber"
                  value={formData.bankAccountNumber}
                  onChange={handleChange}
                  placeholder="e.g. 012-3-45678-9"
                  className="w-full pl-10 pr-4 py-2.5 bg-[#0B1121] border border-[#1E293B] rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#2C486A]/20 focus:border-[#2C486A] transition-all"
                />
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Action Footer */}
      <div className="flex justify-end pt-4 border-t border-[#1E293B]">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-[#2C486A] hover:bg-[#1f344c] disabled:bg-[#1E293B] disabled:text-gray-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 uppercase tracking-wider shadow-none active:scale-95"
        >
          {isPending ? (
            <GsapSpinner className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span>Save Payment Settings</span>
        </button>
      </div>
    </GsapReveal>
  );
}
