import type { IconType } from "@/components/ui/icons";
import {
  Activity,
  BellRing,
  BookOpen,
  Boxes,
  CalendarRange,
  ClipboardCheck,
  CloudCog,
  Cpu,
  Database,
  FileCheck2,
  FileText,
  FolderKanban,
  FlaskConical,
  GitBranch,
  Globe2,
  Hammer,
  Images,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Languages,
  Mail,
  Megaphone,
  MessageSquare,
  Newspaper,
  PackageCheck,
  PanelsTopLeft,
  PlugZap,
  ReceiptText,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TicketCheck,
  Users,
  Wrench,
  Workflow,
} from "@/components/ui/icons";

export type AdminWorkspaceId =
  | "sales"
  | "technical"
  | "marketing"
  | "developer"
  | "support";

export type AdminNavItem = {
  id: string;
  labelKey: string;
  href: string;
  icon: IconType;
  adminOnly?: boolean;
  external?: boolean;
};

export type AdminNavSection = {
  id: string;
  labelKey: string;
  items: readonly AdminNavItem[];
};

export type AdminWorkspace = {
  id: AdminWorkspaceId;
  slug: string;
  labelKey: string;
  descriptionKey: string;
  href: string;
  icon: IconType;
  accentClass: string;
  adminOnly?: boolean;
  sections: readonly AdminNavSection[];
};

export const ADMIN_WORKSPACES: readonly AdminWorkspace[] = [
  {
    id: "sales",
    slug: "sales",
    labelKey: "sales",
    descriptionKey: "salesDescription",
    href: "/admin/sales",
    icon: GitBranch,
    accentClass: "text-[#3fb950]",
    sections: [
      {
        id: "sales-work",
        labelKey: "work",
        items: [
          { id: "pipeline", labelKey: "pipeline", href: "/admin/quotations", icon: GitBranch },
          { id: "dispatch", labelKey: "signatureDispatch", href: "/admin/quotations/dispatch", icon: FileCheck2 },
          { id: "customers", labelKey: "customers", href: "/admin/crm", icon: Users },
        ],
      },
      {
        id: "sales-fulfilment",
        labelKey: "fulfilment",
        items: [
          { id: "orders", labelKey: "ordersPayments", href: "/admin/orders", icon: ReceiptText },
          { id: "documents", labelKey: "customerDocuments", href: "/admin/documents", icon: FileText },
          { id: "services", labelKey: "serviceCommerce", href: "/admin/services", icon: PackageCheck },
        ],
      },
    ],
  },
  {
    id: "technical",
    slug: "technical",
    labelKey: "technical",
    descriptionKey: "technicalDescription",
    href: "/admin/technical",
    icon: Wrench,
    accentClass: "text-[#58a6ff]",
    sections: [
      {
        id: "technical-delivery",
        labelKey: "delivery",
        items: [
          { id: "operationsWorkspace", labelKey: "operationsWorkspace", href: "/admin/operations", icon: FolderKanban },
          { id: "projects", labelKey: "installationProjects", href: "/admin/projects", icon: FolderKanban },
          { id: "tickets", labelKey: "jobTickets", href: "/admin/job-tickets", icon: TicketCheck },
          { id: "dispatchBoard", labelKey: "dispatchBoard", href: "/admin/operations/schedule", icon: ClipboardCheck },
        ],
      },
      {
        id: "technical-tools",
        labelKey: "fieldTools",
        items: [
          { id: "technicianPortal", labelKey: "technicianPortal", href: "/tech-portal", icon: PanelsTopLeft, external: true },
          { id: "assets", labelKey: "assets", href: "/admin/assets", icon: Boxes },
          { id: "buildConfig", labelKey: "buildConfiguration", href: "/admin/build/config", icon: Settings2 },
        ],
      },
    ],
  },
  {
    id: "marketing",
    slug: "marketing",
    labelKey: "marketing",
    descriptionKey: "marketingDescription",
    href: "/admin/marketing",
    icon: Megaphone,
    accentClass: "text-[#d29922]",
    sections: [
      {
        id: "marketing-content",
        labelKey: "content",
        items: [
          { id: "articles", labelKey: "articles", href: "/admin/articles", icon: Newspaper },
          { id: "notifications", labelKey: "notifications", href: "/admin/notifications", icon: Megaphone },
          { id: "messages", labelKey: "messages", href: "/admin/messages", icon: MessageSquare },
        ],
      },
      {
        id: "marketing-channels",
        labelKey: "channels",
        items: [
          { id: "emailAutomation", labelKey: "emailAutomation", href: "/admin/settings/email", icon: Mail },
          { id: "seo", labelKey: "seo", href: "/admin/settings/seo", icon: Globe2 },
        ],
      },
    ],
  },
  {
    id: "developer",
    slug: "developer",
    labelKey: "developer",
    descriptionKey: "developerDescription",
    href: "/admin/developer",
    icon: Cpu,
    accentClass: "text-[#7CA8D0]",
    adminOnly: true,
    sections: [
      {
        id: "developer-integrations",
        labelKey: "integrations",
        items: [
          { id: "api", labelKey: "apiConnections", href: "/admin/settings/api", icon: Cpu, adminOnly: true },
          { id: "lineRichMenus", labelKey: "lineRichMenus", href: "/admin/settings/line", icon: PanelsTopLeft, adminOnly: true },
          { id: "richMenuScheduler", labelKey: "richMenuScheduler", href: "/admin/settings/line/scheduler", icon: CalendarRange, adminOnly: true },
          { id: "notificationIntegrations", labelKey: "notificationIntegrations", href: "/admin/settings/notifications", icon: BellRing, adminOnly: true },
          { id: "integrationCenter", labelKey: "integrationCenter", href: "/admin/settings/integration-sync", icon: CloudCog, adminOnly: true },
        ],
      },
      {
        id: "developer-configuration",
        labelKey: "configuration",
        items: [
          { id: "dataManager", labelKey: "dataManager", href: "/admin/settings/data", icon: Database, adminOnly: true },
          { id: "featureToggles", labelKey: "featureToggles", href: "/admin/settings/feature-toggles", icon: SlidersHorizontal, adminOnly: true },
          { id: "showcase", labelKey: "showcaseConfiguration", href: "/admin/settings/showcase", icon: Images, adminOnly: true },
          { id: "sandbox", labelKey: "developerSandbox", href: "/admin/settings/sandbox", icon: Hammer, adminOnly: true },
          { id: "workflowBuilder", labelKey: "workflowBuilder", href: "/admin/workflows/builder", icon: GitBranch, adminOnly: true },
          { id: "localization", labelKey: "localization", href: "/admin/settings/localization", icon: Globe2, adminOnly: true },
        ],
      },
      {
        id: "developer-observability",
        labelKey: "observability",
        items: [
          { id: "apiLogs", labelKey: "apiLogs", href: "/admin/settings/api-logs", icon: Activity, adminOnly: true },
          { id: "auditLogs", labelKey: "auditLogs", href: "/admin/settings/audit-logs", icon: ShieldCheck, adminOnly: true },
          { id: "analytics", labelKey: "analyticsSettings", href: "/admin/settings/analytics", icon: LayoutDashboard, adminOnly: true },
        ],
      },
      {
        id: "developer-access",
        labelKey: "access",
        items: [
          { id: "accessControl", labelKey: "accessControl", href: "/admin/settings/access-control", icon: KeyRound, adminOnly: true },
          { id: "users", labelKey: "users", href: "/admin/users", icon: Users, adminOnly: true },
          { id: "userGroups", labelKey: "userGroups", href: "/admin/settings/user-groups", icon: Users, adminOnly: true },
          { id: "compliance", labelKey: "compliance", href: "/admin/settings/compliance", icon: ShieldCheck, adminOnly: true },
        ],
      },
    ],
  },
  {
    id: "support",
    slug: "support-workspace",
    labelKey: "support",
    descriptionKey: "supportDescription",
    href: "/admin/support-workspace",
    icon: LifeBuoy,
    accentClass: "text-[#C58F61]",
    sections: [
      {
        id: "support-desk",
        labelKey: "desk",
        items: [
          { id: "supportDesk", labelKey: "supportDesk", href: "/admin/support", icon: LifeBuoy },
          { id: "afterSales", labelKey: "afterSales", href: "/admin/operations/service-cases", icon: LifeBuoy },
          { id: "tickets", labelKey: "tickets", href: "/admin/tickets", icon: TicketCheck },
          { id: "messages", labelKey: "messages", href: "/admin/messages", icon: MessageSquare },
        ],
      },
      {
        id: "support-knowledge",
        labelKey: "knowledge",
        items: [
          { id: "knowledgeBase", labelKey: "knowledgeBase", href: "/admin/support/knowledge", icon: BookOpen },
          { id: "supportSettings", labelKey: "supportSettings", href: "/admin/settings/support", icon: Settings2 },
        ],
      },
    ],
  },
];

/**
 * Canonical job-based navigation. ADMIN_WORKSPACES remains exported for the
 * legacy workspace URLs and old deep links, but the shell no longer asks a
 * staff member to choose a workspace before seeing their work.
 */
export const ADMIN_NAV_SECTIONS: readonly AdminNavSection[] = [
  {
    id: "overview",
    labelKey: "overview",
    items: [
      { id: "overview", labelKey: "overview", href: "/admin", icon: LayoutDashboard },
      { id: "pending-work", labelKey: "pendingWork", href: "/admin/requests", icon: ClipboardCheck },
    ],
  },
  {
    id: "sales-customers",
    labelKey: "salesCustomers",
    items: [
      { id: "customers", labelKey: "customers", href: "/admin/crm", icon: Users },
      { id: "quotations", labelKey: "pipeline", href: "/admin/quotations", icon: GitBranch },
      { id: "signatures", labelKey: "signatureDispatch", href: "/admin/quotations/dispatch", icon: FileCheck2 },
      { id: "payments", labelKey: "ordersPayments", href: "/admin/orders", icon: ReceiptText },
      { id: "documents", labelKey: "customerDocuments", href: "/admin/documents", icon: FileText },
      { id: "document-verification", labelKey: "documentVerification", href: "/admin/documents/verify", icon: ShieldCheck },
    ],
  },
  {
    id: "installation-service",
    labelKey: "installationService",
    items: [
      { id: "projects", labelKey: "installationProjects", href: "/admin/projects", icon: FolderKanban },
      { id: "schedule", labelKey: "dispatchBoard", href: "/admin/operations/schedule", icon: CalendarRange },
      { id: "field-tickets", labelKey: "jobTickets", href: "/admin/job-tickets", icon: TicketCheck },
      { id: "service-cases", labelKey: "afterSales", href: "/admin/operations/service-cases", icon: LifeBuoy },
    ],
  },
  {
    id: "inbox",
    labelKey: "inbox",
    items: [
      { id: "inbox-threads", labelKey: "inboxThreads", href: "/admin/messages", icon: MessageSquare },
      { id: "support-tickets", labelKey: "tickets", href: "/admin/tickets", icon: TicketCheck },
      { id: "support-desk", labelKey: "supportDesk", href: "/admin/support", icon: LifeBuoy },
    ],
  },
  {
    id: "line-automation",
    labelKey: "lineAutomation",
    items: [
      { id: "line-overview", labelKey: "lineOverview", href: "/admin/line", icon: MessageSquare },
      { id: "line-content", labelKey: "lineContent", href: "/admin/line/content", icon: FileText },
      { id: "line-rich-menu", labelKey: "lineRichMenus", href: "/admin/line/rich-menu", icon: PanelsTopLeft },
      { id: "line-automation-rules", labelKey: "automationRules", href: "/admin/line/automation", icon: Workflow },
      { id: "line-test-center", labelKey: "testCenter", href: "/admin/line/test-center", icon: FlaskConical },
    ],
  },
  {
    id: "website-content",
    labelKey: "websiteContent",
    items: [
      { id: "articles", labelKey: "articles", href: "/admin/articles", icon: Newspaper },
      { id: "assets", labelKey: "assets", href: "/admin/assets", icon: Images },
      { id: "notifications", labelKey: "notifications", href: "/admin/notifications", icon: BellRing },
      { id: "showcase", labelKey: "showcaseConfiguration", href: "/admin/settings/showcase", icon: PanelsTopLeft },
    ],
  },
  {
    id: "system-settings",
    labelKey: "systemSettings",
    items: [
      { id: "connections", labelKey: "lineConnections", href: "/admin/line/connections", icon: PlugZap, adminOnly: true },
      { id: "api-settings", labelKey: "apiConnections", href: "/admin/settings/api", icon: CloudCog, adminOnly: true },
      { id: "access-control", labelKey: "accessControl", href: "/admin/settings/access-control", icon: KeyRound, adminOnly: true },
      { id: "users", labelKey: "users", href: "/admin/users", icon: Users, adminOnly: true },
      { id: "localization", labelKey: "localization", href: "/admin/settings/localization", icon: Languages, adminOnly: true },
      { id: "audit-logs", labelKey: "auditLogs", href: "/admin/settings/audit-logs", icon: ShieldCheck, adminOnly: true },
    ],
  },
];

export function getAdminWorkspaceForPath(pathname: string): AdminWorkspace {
  return ADMIN_WORKSPACES.find((workspace) => {
    const itemPaths = workspace.sections.flatMap((section) => section.items.map((item) => item.href));
    return pathname === workspace.href || itemPaths.some((href) => pathname === href || pathname.startsWith(`${href}/`));
  }) ?? ADMIN_WORKSPACES[0];
}

export function getAdminWorkspaceBySlug(slug: string): AdminWorkspace | null {
  return ADMIN_WORKSPACES.find((workspace) => workspace.slug === slug) ?? null;
}
