import SectionReveal from "../SectionReveal";

type Kpi = Readonly<{
  value: string;
  label: string;
}>;

const kpis: readonly Kpi[] = [
  { value: "5 kW", label: "default live home signal" },
  { value: "3-10 kW", label: "instant simulator presets" },
  { value: "24/7", label: "customer portal access" },
];

export default function KpisSection() {
  return (
    <SectionReveal className="border-y border-[#B7D1EA]/35 bg-[#F0EEE9] py-16 sm:py-20">
      <div className="mx-auto grid max-w-7xl gap-px overflow-hidden rounded-2xl border border-[#B7D1EA]/40 bg-[#B7D1EA]/40 px-px sm:grid-cols-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white/72 p-8 sm:p-10">
            <p className="text-[clamp(3.5rem,9vw,6rem)] font-extrabold leading-none tracking-[-0.04em] text-[#0F172A]">
              {kpi.value}
            </p>
            <p className="mt-4 text-sm font-bold text-[#475569]">{kpi.label}</p>
          </div>
        ))}
      </div>
    </SectionReveal>
  );
}
