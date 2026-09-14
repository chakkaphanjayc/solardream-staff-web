import { z } from "zod";

const safeFooterHrefSchema = z.string().trim().min(1).max(500).refine((value) => {
  if (value.startsWith("/") || value.startsWith("#")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "mailto:" || url.protocol === "tel:";
  } catch {
    return false;
  }
}, "Use an internal path, anchor, https, mailto, or tel link.");

const safeSocialUrlSchema = z.string().trim().min(1).max(500).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "mailto:" || url.protocol === "tel:";
  } catch {
    return false;
  }
}, "Social links must use https, mailto, or tel URLs.");

export const footerLinkSchema = z.object({
  label: z.string().trim().min(1).max(120),
  href: safeFooterHrefSchema,
}).strict();

export const footerNavigationColumnSchema = z.object({
  title: z.string().trim().min(1).max(120),
  links: z.array(footerLinkSchema).max(20),
}).strict();

export const socialLinkSchema = z.object({
  platform: z.string().trim().min(1).max(60),
  url: safeSocialUrlSchema,
  imageUrl: z.string().trim().url().max(500).optional(),
  label: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().default(true),
}).strict();

const localizedWebsiteContentSchema = z.object({
  company: z.object({
    companyName: z.string().trim().min(1).max(160),
    companyDescription: z.string().trim().min(1).max(800),
    taxId: z.string().trim().max(80),
    address: z.string().trim().max(600),
    phone: z.string().trim().max(80),
    email: z.string().trim().email().or(z.literal("")),
  }).strict(),
  socialLinks: z.array(socialLinkSchema).max(20),
  footerNavigation: z.array(footerNavigationColumnSchema).max(8),
}).strict();

export const websiteSettingsSchema = z.object({
  company: z.object({
    companyName: z.string().trim().min(1).max(160).default("SolarDream"),
    companyDescription: z.string().trim().min(1).max(800),
    taxId: z.string().trim().max(80).default(""),
    address: z.string().trim().max(600).default(""),
    phone: z.string().trim().max(80).default(""),
    email: z.string().trim().email().or(z.literal("")).default(""),
  }).strict(),
  socialLinks: z.array(socialLinkSchema).max(20).default([]),
  footerNavigation: z.array(footerNavigationColumnSchema).max(8),
  cookieConsent: z.object({
    cookieTitle: z.string().trim().min(1).max(160),
    cookieMessage: z.string().trim().min(1).max(1000),
    essentialButtonText: z.string().trim().min(1).max(80),
    acceptAllButtonText: z.string().trim().min(1).max(80),
    managePreferencesText: z.string().trim().min(1).max(80).default("Manage preferences"),
  }).strict(),
  localizedContent: z.record(z.string(), localizedWebsiteContentSchema).default({}),
}).strict();

export type WebsiteSettings = z.infer<typeof websiteSettingsSchema>;

export const DEFAULT_WEBSITE_SETTINGS: WebsiteSettings = {
  company: {
    companyName: "SolarDream",
    companyDescription:
      "SolarDream helps Thai homeowners plan, compare, and track residential solar projects with clean estimates, document handoff, and service support in one place.",
    taxId: "0105569000123",
    address: "123 Sukhumvit Road, Khlong Toei, Bangkok 10110, Thailand",
    phone: "+66 2 123 4567",
    email: "support@solardream.com",
  },
  socialLinks: [
    { platform: "facebook", label: "Facebook", url: "https://facebook.com", isActive: true },
    { platform: "instagram", label: "Instagram", url: "https://instagram.com", isActive: true },
    { platform: "linkedin", label: "LinkedIn", url: "https://linkedin.com", isActive: true },
  ],
  footerNavigation: [
    {
      title: "Solutions",
      links: [
        { label: "Home", href: "/" },
        { label: "Solar Calculator", href: "/build" },
        { label: "Wizard Advisor", href: "/wizard" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Solar News", href: "/news" },
        { label: "Support Desk", href: "/support" },
      ],
    },
  ],
  cookieConsent: {
    cookieTitle: "Cookie preferences",
    cookieMessage:
      "We use essential cookies to keep SolarDream secure. Analytics and marketing cookies are optional and help us improve the experience.",
    essentialButtonText: "Essential only",
    acceptAllButtonText: "Accept all",
    managePreferencesText: "Manage preferences",
  },
  localizedContent: {},
};
