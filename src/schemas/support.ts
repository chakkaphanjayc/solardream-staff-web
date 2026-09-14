import { z } from "zod";

export const TicketStatusEnum = z.enum([
  "NEW",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "PENDING_DISPATCH",
  "RESOLVED",
  "CLOSED",
]);
export type TicketStatus = z.infer<typeof TicketStatusEnum>;

export const TicketPriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export type TicketPriority = z.infer<typeof TicketPriorityEnum>;

export const TicketCategoryEnum = z.enum([
  "INVERTER",
  "BATTERY",
  "BILLING_PEA",
  "MAINTENANCE",
  "WARRANTY",
  "GENERAL",
]);
export type TicketCategory = z.infer<typeof TicketCategoryEnum>;

export const SupportConfigSchema = z.object({
  contact: z.object({
    lineUrl: z.string().trim().url().default("https://line.me/R/ti/p/@solardream"),
    lineId: z.string().trim().default("@solardream"),
    email: z.string().trim().email().default("support@solardream.com"),
    phone: z.string().trim().default("+66 85-834-7128"),
    operatingHours: z.string().trim().default("Mon - Sat: 08:00 - 18:00 (ICT)"),
    address: z.string().trim().default("350/18 village no.5 Donkaew Saraphee Chiangmai 50140"),
    urgentSlaTargetHours: z.number().int().positive().default(2),
    standardSlaTargetHours: z.number().int().positive().default(24),
  }),
  hero: z.object({
    badgeText: z.string().trim().default("SolarDream Support"),
    headerTitle: z.string().trim().default("After-sales Help Center"),
    headerDesc: z
      .string()
      .trim()
      .default("Find answers, read user manuals, and book maintenance services for your solar system all in one place."),
    announcementBanner: z.string().trim().optional(),
    isBannerActive: z.boolean().default(false),
  }),
  featureToggles: z.object({
    enableKbSearch: z.boolean().default(true),
    enableDirectContactCard: z.boolean().default(true),
    enableDocumentVerifyLink: z.boolean().default(true),
    enableMaintenanceBookingLink: z.boolean().default(true),
    enableLiveTicketSubmission: z.boolean().default(true),
  }),
});

export type SupportConfig = z.infer<typeof SupportConfigSchema>;

export const FAQItemSchema = z.object({
  id: z.string(),
  question: z.string().trim().min(1, "Question is required."),
  answer: z.string().trim().min(1, "Answer is required."),
  category: TicketCategoryEnum.default("GENERAL"),
  isFeatured: z.boolean().default(false),
  order: z.number().int().default(0),
});

export type FAQItem = z.infer<typeof FAQItemSchema>;

export const TutorialItemSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1, "Title is required."),
  description: z.string().trim().min(1, "Description is required."),
  duration: z.string().trim().default("5 mins"),
  videoUrl: z.string().trim().url("Valid YouTube/Video URL required."),
  category: TicketCategoryEnum.default("GENERAL"),
  tone: z.string().trim().default("bg-sky-50 text-sky-700"),
  isPublished: z.boolean().default(true),
});

export type TutorialItem = z.infer<typeof TutorialItemSchema>;

export const KnowledgeBaseConfigSchema = z.object({
  faqs: z.array(FAQItemSchema),
  tutorials: z.array(TutorialItemSchema),
});

export type KnowledgeBaseConfig = z.infer<typeof KnowledgeBaseConfigSchema>;

export const SupportTicketSchema = z.object({
  id: z.string(),
  ticketNumber: z.string(),
  customerName: z.string(),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional(),
  subject: z.string(),
  description: z.string(),
  category: TicketCategoryEnum,
  priority: TicketPriorityEnum,
  status: TicketStatusEnum,
  assignedStaffId: z.string().nullable().optional(),
  assignedStaffName: z.string().nullable().optional(),
  dispatchJobTicketId: z.string().nullable().optional(),
  internalNotes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SupportTicket = z.infer<typeof SupportTicketSchema>;

export const UpdateTicketStatusSchema = z.object({
  ticketId: z.string().min(1),
  status: TicketStatusEnum,
  priority: TicketPriorityEnum.optional(),
  assignedStaffId: z.string().nullable().optional(),
  internalNotes: z.string().optional(),
});

export const DEFAULT_SUPPORT_CONFIG: SupportConfig = {
  contact: {
    lineUrl: "https://line.me/R/ti/p/@solardream",
    lineId: "@solardream",
    email: "support@solardream.com",
    phone: "+66 85-834-7128",
    operatingHours: "Mon - Sat: 08:00 - 18:00 (ICT)",
    address: "350/18 village no.5 Donkaew Saraphee Chiangmai 50140",
    urgentSlaTargetHours: 2,
    standardSlaTargetHours: 24,
  },
  hero: {
    badgeText: "SolarDream Support",
    headerTitle: "After-sales Help Center",
    headerDesc: "Find answers, read user manuals, and book maintenance services for your solar system all in one place.",
    announcementBanner: "Emergency Hotline: 24/7 technical assistance available for grid power interruption or inverter alarms.",
    isBannerActive: true,
  },
  featureToggles: {
    enableKbSearch: true,
    enableDirectContactCard: true,
    enableDocumentVerifyLink: true,
    enableMaintenanceBookingLink: true,
    enableLiveTicketSubmission: true,
  },
};

export const DEFAULT_KB_CONFIG: KnowledgeBaseConfig = {
  faqs: [
    {
      id: "faq-inverter-1",
      question: "What should I do if the inverter red light is blinking?",
      answer: "A blinking red light usually indicates a grid voltage fault or temporary DC isolator trip. Turn off the AC isolator switch for 60 seconds and switch back on. If the light stays solid red, contact our support hotline immediately.",
      category: "INVERTER",
      isFeatured: true,
      order: 1,
    },
    {
      id: "faq-battery-1",
      question: "How do I care for my battery storage during extended rain or power outage?",
      answer: "Set your battery minimum SOC (State of Charge) limit to 20% via the SolarDream App during rainy weeks to preserve battery longevity and emergency reserve power.",
      category: "BATTERY",
      isFeatured: true,
      order: 2,
    },
    {
      id: "faq-warranty-1",
      question: "How does the 25-year panel linear performance warranty claim process work?",
      answer: "SolarDream manages all manufacturer warranty claims directly. Simply submit an inquiry via the Support Hub or LINE. Our field team will conduct an on-site thermal diagnostic check.",
      category: "WARRANTY",
      isFeatured: true,
      order: 3,
    },
    {
      id: "faq-billing-1",
      question: "Why does my PEA electricity bill show different kWh numbers than my inverter app?",
      answer: "Inverters measure total solar yield at the AC output, whereas the PEA bi-directional meter measures net export and grid consumption. Transmission line losses (approx 1-3%) can also account for slight variations.",
      category: "BILLING_PEA",
      isFeatured: false,
      order: 4,
    },
    {
      id: "faq-maintenance-1",
      question: "How often should solar panels be cleaned in Chiang Mai / Northern Thailand?",
      answer: "We recommend professional deep panel cleaning twice a year — once right after PM2.5 dust season (April) and once before peak winter generation (October).",
      category: "MAINTENANCE",
      isFeatured: false,
      order: 5,
    },
  ],
  tutorials: [
    {
      id: "tut-1",
      title: "System Health Check & Inverter Alarm Diagnostics",
      description: "Step-by-step video guide on checking fault error codes on Huawei & Growatt solar inverters.",
      duration: "4 mins",
      videoUrl: "https://www.youtube.com/results?search_query=solar+inverter+red+light+troubleshooting",
      category: "INVERTER",
      tone: "bg-rose-50 text-rose-700",
      isPublished: true,
    },
    {
      id: "tut-2",
      title: "Understanding Your PEA Electricity Bill & Net Metering",
      description: "How to cross-verify solar production credits against official Provincial Electricity Authority bills.",
      duration: "6 mins",
      videoUrl: "https://www.youtube.com/results?search_query=วิธีอ่านบิลค่าไฟ+PEA",
      category: "BILLING_PEA",
      tone: "bg-sky-50 text-sky-700",
      isPublished: true,
    },
    {
      id: "tut-3",
      title: "Solar Production Graph & Efficiency Monitoring",
      description: "Learn how to read real-time daily generation curves and detect panel shading patterns.",
      duration: "5 mins",
      videoUrl: "https://www.youtube.com/results?search_query=how+to+read+solar+production+graph",
      category: "INVERTER",
      tone: "bg-violet-50 text-violet-700",
      isPublished: true,
    },
    {
      id: "tut-4",
      title: "Panel Cleaning Safety & Dust Removal Standard",
      description: "Best practices for removing dust and organic grime without micro-cracking solar cells.",
      duration: "7 mins",
      videoUrl: "https://www.youtube.com/results?search_query=solar+panel+cleaning+safety",
      category: "MAINTENANCE",
      tone: "bg-emerald-50 text-emerald-700",
      isPublished: true,
    },
  ],
};
