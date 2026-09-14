import Link from "next/link";
import { BatteryCharging, ClipboardCheck, House, MapPinned } from "@/components/ui/icons";
import SectionReveal from "../SectionReveal";

type Service = Readonly<{
  title: string;
  description: string;
  href: string;
  icon: typeof House;
}>;

const services: readonly Service[] = [
  {
    title: "Solar Wizard",
    description: "Estimate system size, budget, savings, and customer requirements from a guided residential solar flow.",
    href: "/wizard",
    icon: ClipboardCheck,
  },
  {
    title: "Product Catalog",
    description: "Browse solar bundles, hardware options, and service packages prepared for advisor follow-up.",
    href: "/catalog",
    icon: House,
  },
  {
    title: "Roof Visualizer",
    description: "Move from curiosity into a visual planning step for roof fit and installation context.",
    href: "/visualizer",
    icon: MapPinned,
  },
  {
    title: "Support & O&M",
    description: "Keep signed customers connected to project updates, warranty records, and maintenance pathways.",
    href: "/support",
    icon: BatteryCharging,
  },
];

export default function ServicesSection() {
  return (
    <SectionReveal id="services" className="bg-[#F0EEE9] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <h2 className="text-balance text-4xl font-bold tracking-[-0.03em] text-[#0F172A] sm:text-6xl">
              Solar planning tools, connected from first click to signed quote.
            </h2>
            <p className="mt-6 max-w-xl text-base font-semibold leading-8 text-[#475569]">
              The old SolarDream workflow is still here: weather-aware sizing, product exploration, CRM handoff, quotation dispatch, and post-install support.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {services.map((service) => {
              const Icon = service.icon;
              return (
              <Link
                key={service.title}
                href={service.href}
                className="group min-h-72 overflow-hidden rounded-2xl border border-white/75 bg-white/64 p-6 shadow-sm shadow-[#B7D1EA]/20 transition-colors duration-300 ease-expo-out hover:bg-white/90"
              >
                <div className="relative h-28 overflow-hidden rounded-xl bg-[#B7D1EA]/36">
                  <div className="bg-polkadot absolute inset-0 transition-transform duration-500 ease-expo-out group-hover:scale-110" />
                  <div className="absolute left-5 top-5 flex h-12 w-12 items-center justify-center rounded-full bg-white/80 text-[#0369a1]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="absolute bottom-5 left-5 h-px w-24 bg-[#0F172A]/20 transition-all duration-500 ease-expo-out group-hover:w-36 group-hover:bg-[#0F172A]/45" />
                </div>
                <h3 className="mt-6 text-2xl font-black tracking-[-0.03em] text-[#0F172A]">{service.title}</h3>
                <p className="mt-4 text-sm font-semibold leading-6 text-[#475569]">{service.description}</p>
              </Link>
              );
            })}
          </div>
        </div>
      </div>
    </SectionReveal>
  );
}
