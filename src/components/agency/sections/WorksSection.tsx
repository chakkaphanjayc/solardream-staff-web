import Link from "next/link";
import Image from "next/image";
import SectionReveal from "../SectionReveal";

type Work = Readonly<{
  title: string;
  category: string;
  imageSrc?: string;
  imageAlt: string;
  href: string;
}>;

type WorksSectionProps = Readonly<{
  locale: string;
}>;

const works: readonly Work[] = [
  {
    title: "Weather-Aware Home Signal",
    category: "Live location, weather, and 5 kW solar estimate",
    imageSrc: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=80",
    imageAlt: "Modern glass interior representing a premium connected home energy experience.",
    href: "/wizard",
  },
  {
    title: "Quotation Portal Flow",
    category: "ERPNext sync, customer portal, magic link",
    imageAlt: "Abstract light interface panels representing signed solar quotation workflow.",
    href: "/proposals",
  },
];

export default function WorksSection({ locale }: WorksSectionProps) {
  return (
    <SectionReveal className="bg-[#F0EEE9] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <h2 className="max-w-3xl text-balance text-4xl font-bold tracking-[-0.03em] text-[#0F172A] sm:text-6xl">
            The SolarDream flow, redesigned with the same features underneath.
          </h2>
          <Link href={`/${locale}/works`} className="group inline-flex w-fit text-sm font-black text-[#0369a1]">
            View platform map
            <span className="ml-3 mt-[0.7rem] h-px w-8 bg-[#0369a1]/50 transition-all duration-300 group-hover:w-12 group-hover:bg-[#0369a1]" />
          </Link>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {works.map((work) => (
            <Link key={work.title} href={work.href} className="group block">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/75 bg-white/70 shadow-sm shadow-[#B7D1EA]/20">
                {work.imageSrc ? (
                  <Image
                    src={work.imageSrc}
                    alt={work.imageAlt}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="h-full w-full object-cover opacity-80 transition duration-700 group-hover:scale-105 group-hover:opacity-100"
                  />
                ) : (
                  <div
                    role="img"
                    aria-label={work.imageAlt}
                    className="bg-polkadot h-full w-full transition-transform duration-700 ease-expo-out group-hover:scale-105"
                  >
                    <div className="grid h-full grid-cols-5 gap-px p-6 opacity-70">
                      {Array.from({ length: 15 }).map((_, index) => (
                        <div key={index} className="rounded-lg bg-white/45" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-2xl font-black tracking-[-0.03em] text-[#0F172A]">{work.title}</h3>
                <p className="text-sm font-semibold text-[#475569]">{work.category}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </SectionReveal>
  );
}
