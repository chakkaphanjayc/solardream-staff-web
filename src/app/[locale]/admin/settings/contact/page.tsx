import { getContactLinks } from "@/app/actions/contact";
import ContactSettingsClient from "./ContactSettingsClient";
import { Link2, ShieldCheck } from "@/components/ui/icons";
import { GsapPulse } from "@/components/ui/GsapMotion";


export default async function ContactSettingsPage() {
  const initialLinks = await getContactLinks();

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-gray-100 flex items-center gap-3 font-sans">
            Contact & <span className="text-[#B7D1EA]">Social Links</span>
          </h1>
          <p className="text-gray-400 text-xs mt-1 uppercase font-black tracking-widest">
            Manage your company's social media platforms and communication links dynamically.
          </p>
        </div>
        
        <div className="flex items-center gap-2.5 bg-[#0F172A] border border-[#1E293B] px-4 py-2.5 rounded-2xl text-[10px] font-mono font-black uppercase text-gray-400 self-start md:self-auto shadow-none">
          <GsapPulse scale={1.08}>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </GsapPulse>
          <span>Global Updates Enabled</span>
        </div>
      </div>

      {/* Client view */}
      <ContactSettingsClient initialLinks={initialLinks} />
    </div>
  );
}
