import { BatteryCharging, FileSignature, Map, ShieldCheck, SunMedium, Wrench } from "@/components/ui/icons";
import SectionReveal from "../SectionReveal";

const trustSignals = [
  { label: "Live Weather Solar Signal", icon: SunMedium },
  { label: "Wizard Sizing Flow", icon: Map },
  { label: "ERPNext Quotations", icon: FileSignature },
  { label: "Customer Portal", icon: ShieldCheck },
  { label: "Battery Ready Planning", icon: BatteryCharging },
  { label: "O&M Support", icon: Wrench },
];
const marqueeItems = [...trustSignals, ...trustSignals];

export default function AwardsSection() {
  return (
    <SectionReveal className="overflow-hidden border-y border-[#B7D1EA]/35 bg-[#F0EEE9] py-6">
      <div className="agency-marquee flex w-max gap-4 px-5">
        {marqueeItems.map((item, index) => {
          const Icon = item.icon;
          return (
          <div
            key={`${item.label}-${index}`}
            className="flex h-20 w-72 items-center justify-center gap-3 rounded-2xl border border-white/80 bg-white/60 text-sm font-black text-[#0F172A] shadow-sm shadow-[#B7D1EA]/20 backdrop-blur"
          >
            <Icon className="h-5 w-5 text-[#0369a1]" />
            {item.label}
          </div>
          );
        })}
      </div>
    </SectionReveal>
  );
}
