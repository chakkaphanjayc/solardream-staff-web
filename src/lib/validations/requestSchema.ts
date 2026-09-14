import { z } from "zod";
import { locales } from "@/i18n/locales";

const phonePattern = /^(?:\+?66|0)\d{8,9}$/;

const payloadSchema = z.object({
  systemSizeKwp: z.coerce.number().finite().positive().max(100).optional(),
  systemSizeKw: z.coerce.number().finite().positive().max(100).optional(),
  recommendedSizeKw: z.coerce.number().finite().positive().max(100).optional(),
  totalPrice: z.coerce.number().finite().nonnegative().max(100_000_000).optional(),
  estimatedPrice: z.coerce.number().finite().nonnegative().max(100_000_000).optional(),
  address: z.string().trim().max(500).optional(),
  location: z.string().trim().max(500).optional(),
  postalCode: z.string().trim().regex(/^\d{5}$/).optional(),
  preferredContactMethod: z.enum(["phone", "email", "line"]).optional(),
  preferredDateTime: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2_000).optional(),
  sourcePage: z.string().trim().max(120).optional(),
}).strip();

export const inboundRequestSchema = z.object({
  customer_name: z.string().trim().min(1).max(160).optional(),
  customerName: z.string().trim().min(1).max(160).optional(),
  phone: z.string().trim().transform((value) => value.replace(/[\s()-]/g, "")).pipe(z.string().regex(phonePattern)),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  request_type: z.enum(["WIZARD", "BUILD", "SERVICE"]).optional(),
  requestType: z.enum(["WIZARD", "BUILD", "SERVICE"]).optional(),
  source: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2_000).optional(),
  preferred_language: z.enum(locales).optional(),
  preferredLanguage: z.enum(locales).optional(),
  payload: payloadSchema.optional(),
}).strip().superRefine((value, context) => {
  if (!value.customer_name && !value.customerName) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Customer name is required.", path: ["customer_name"] });
  }
});

export type InboundRequestInput = z.infer<typeof inboundRequestSchema>;
