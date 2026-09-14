import { z } from "zod";
import { locales } from "@/i18n/locales";

export const localizedServiceTextSchema = z.object({
  en: z.string().trim().min(1).max(200),
  th: z.string().trim().min(1).max(200),
}).strict();

const contactSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(8).max(32),
  email: z.string().trim().email().max(254),
}).strict();

const commonOrderFields = {
  idempotencyKey: z.string().uuid(),
  offeringSlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  appointmentDate: z.coerce.date(),
  contact: contactSchema,
  customerNotes: z.string().trim().max(2000).optional(),
};

export const createServiceOrderSchema = z.discriminatedUnion("systemSource", [
  z.object({
    ...commonOrderFields,
    systemSource: z.literal("SOLARDREAM"),
    assetId: z.string().uuid(),
  }).strict(),
  z.object({
    ...commonOrderFields,
    systemSource: z.literal("EXTERNAL"),
    systemDetails: z.object({
      systemSizeKw: z.coerce.number().positive().max(10_000),
      inverterBrand: z.string().trim().min(1).max(120),
      roofType: z.string().trim().min(1).max(120),
    }).strict(),
  }).strict(),
]);

export const serviceOrderIdSchema = z.string().uuid();
export type CreateServiceOrderInput = z.input<typeof createServiceOrderSchema>;
export type ValidatedServiceOrderInput = z.output<typeof createServiceOrderSchema>;

const quoteBase = {
  offeringSlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  website: z.string().max(0).optional(),
};
const externalSystemSchema = z.object({
  systemSizeKw: z.coerce.number().positive().max(1_000),
  inverterBrand: z.string().trim().min(1).max(120),
  roofType: z.string().trim().min(1).max(120),
}).strict();
const bookingContactSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(8).max(32),
  email: z.string().trim().email().max(254),
  serviceAddress: z.string().trim().min(10).max(1000),
}).strict();

export const serviceQuoteSchema = z.discriminatedUnion("systemSource", [
  z.object({ ...quoteBase, systemSource: z.literal("SOLARDREAM"), assetId: z.string().uuid() }).strict(),
  z.object({ ...quoteBase, systemSource: z.literal("EXTERNAL"), systemDetails: externalSystemSchema }).strict(),
]);

export const serviceBookingSchema = z.discriminatedUnion("systemSource", [
  z.object({ ...quoteBase, systemSource: z.literal("SOLARDREAM"), assetId: z.string().uuid(), locale: z.enum(locales), appointmentDate: z.coerce.date(), contact: bookingContactSchema, necessaryConsent: z.literal(true), customerNotes: z.string().trim().max(2000).optional() }).strict(),
  z.object({ ...quoteBase, systemSource: z.literal("EXTERNAL"), systemDetails: externalSystemSchema, locale: z.enum(locales), appointmentDate: z.coerce.date(), contact: bookingContactSchema, necessaryConsent: z.literal(true), customerNotes: z.string().trim().max(2000).optional() }).strict(),
]);

export type ServiceQuoteInput = z.input<typeof serviceQuoteSchema>;
export type ServiceBookingInput = z.input<typeof serviceBookingSchema>;

export type FormulaPricing = {
  basePrice: string;
  ratePerKwp: string;
  minimumPrice: string;
  loyaltyDiscount: string;
};

export function calculateFormulaPrice(pricing: FormulaPricing, systemSizeKw: number, loyaltyEligible: boolean) {
  const subtotalSatang = Math.round((Number(pricing.basePrice) + Number(pricing.ratePerKwp) * systemSizeKw) * 100);
  const minimumSatang = Math.round(Number(pricing.minimumPrice) * 100);
  const discountSatang = loyaltyEligible ? Math.round(Number(pricing.loyaltyDiscount) * 100) : 0;
  return (Math.max(0, Math.max(subtotalSatang, minimumSatang) - discountSatang) / 100).toFixed(2);
}

export function selectServicePrice(
  source: "SOLARDREAM" | "EXTERNAL",
  prices: { solarDreamCustomerPrice: string; externalPrice: string },
) {
  return source === "SOLARDREAM" ? prices.solarDreamCustomerPrice : prices.externalPrice;
}
