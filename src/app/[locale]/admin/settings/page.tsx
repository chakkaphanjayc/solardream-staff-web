import Link from "next/link";
import { ArrowRight, BarChart3, FileText, Globe2, Megaphone, Sliders, ShieldCheck, BadgePercent, Cpu, Languages, CloudCog } from "@/components/ui/icons";


const SETTING_CARDS = [
  {
    href: "/admin/settings/localization",
    eyebrow: "Localization",
    title: "Language & Fallback",
    description: "Choose fallback behavior for translated template and configuration content.",
    icon: Languages,
    tone: "text-[#B7D1EA]",
  },
  {
    href: "/admin/settings/api",
    eyebrow: "API Settings",
    title: "API & Connections",
    description: "Web API endpoints, ERPNext integration credentials, and LINE Messaging test tools.",
    icon: Cpu,
    tone: "text-[#B7D1EA]",
  },
  {
    href: "/admin/settings/integration-sync",
    eyebrow: "Field Operations",
    title: "Installation Sync Monitor",
    description: "Inspect local installation projects, ERPNext bindings, pending outbox events, retries, and failures.",
    icon: CloudCog,
    tone: "text-[#B7D1EA]",
  },
  {
    href: "/admin/settings/system",
    eyebrow: "Tool Config",
    title: "System Parameters",
    description: "Quotation expiry, survey timeout, search scope, and homepage video configuration.",
    icon: Sliders,
    tone: "text-[#B7D1EA]",
  },
  {
    href: "/admin/settings/quotation",
    eyebrow: "Quotation Settings",
    title: "Financial & Fee Config",
    description: "Financing plans, bank promotions, and quotation service fee catalog.",
    icon: FileText,
    tone: "text-[#B7D1EA]",
  },
  {
    href: "/admin/settings/notifications",
    eyebrow: "Notifications",
    title: "Alert Integrations",
    description: "Discord webhook testing, Listmonk email automation, and optional LINE alerts.",
    icon: Megaphone,
    tone: "text-[#B7D1EA]",
  },
  {
    href: "/admin/settings/analytics",
    eyebrow: "Analytics",
    title: "Umami Controls",
    description: "Toggle product analytics flags for registration, wizard engagement, and proposal lifecycle events.",
    icon: BarChart3,
    tone: "text-[#B7D1EA]",
  },
  {
    href: "/admin/settings/website",
    eyebrow: "Website",
    title: "Footer & Consent",
    description: "Manage company details, footer navigation, social links, and public cookie consent copy.",
    icon: Globe2,
    tone: "text-[#B7D1EA]",
  },
];

export default function CatalogSettingsPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#B7D1EA]/30 bg-[#B7D1EA]/15 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.35em] text-[#B7D1EA]">
            <ShieldCheck className="h-4 w-4 text-[#B7D1EA]" />
            Admin Settings Hub
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white font-urbanist">
            Modular Settings Console
          </h1>
          <p className="max-w-3xl text-sm font-medium leading-6 text-slate-300">
            The single-page settings console is split into focused workspaces so each operational area loads faster and is easier to maintain.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-800 bg-[#0F172A] px-4 py-2 text.xs font-bold uppercase tracking-wider text-slate-300 shadow-none">
          <BadgePercent className="h-4 w-4 text-[#B7D1EA]" />
          <span>Settings routes ready</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SETTING_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-2xl border border-slate-800 bg-[#0F172A] p-5 shadow-none transition-all hover:border-[#B7D1EA]/50 hover:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300">
                    <Icon className={`h-4 w-4 ${card.tone}`} />
                    {card.eyebrow}
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-lg font-black text-white group-hover:text-[#B7D1EA] transition-colors">{card.title}</h2>
                    <p className="text-sm font-medium leading-relaxed text-slate-300">{card.description}</p>
                  </div>
                </div>
                <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#B7D1EA]" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
