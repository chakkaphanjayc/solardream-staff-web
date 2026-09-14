import { z } from "zod";

import { TECH_PORTAL_PHASE_CODES, TECH_PRE_FLIGHT_CHECKS, TECH_PRE_FLIGHT_VERSION, type TechOperationSource } from "@/types/techPortal";

export const techTaskIdSchema = z.string().trim().uuid();
export const techIdempotencyKeySchema = z.string().trim().min(16).max(160).regex(/^[A-Za-z0-9._:-]+$/);
export const techOperationSourceSchema = z.enum(["PWA_ONLINE", "PWA_OFFLINE"] satisfies [TechOperationSource, TechOperationSource]);

const isoTimestampSchema = z.string().trim().min(1).max(80).refine(
  (value) => Number.isFinite(Date.parse(value)),
  "A valid timestamp is required.",
);

export const technicianGpsSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(100_000).optional(),
  capturedAt: isoTimestampSchema.optional(),
}).transform((value) => ({
  ...value,
  capturedAt: value.capturedAt || new Date().toISOString(),
}));

const preFlightKeySchema = z.enum(TECH_PRE_FLIGHT_CHECKS.map((check) => check.key) as [string, ...string[]]);

export const startJobSchema = z.object({
  taskId: techTaskIdSchema,
  fieldVisitId: techTaskIdSchema.nullable().optional(),
  idempotencyKey: techIdempotencyKeySchema.optional(),
  source: techOperationSourceSchema.optional(),
  preflightVersion: z.literal(TECH_PRE_FLIGHT_VERSION),
  checks: z.record(preFlightKeySchema, z.boolean()),
  gps: technicianGpsSchema,
});

export const techPhaseSchema = z.enum(TECH_PORTAL_PHASE_CODES);

const testValueSchema = z.union([
  z.string().trim().max(120),
  z.number().finite(),
  z.boolean(),
]);

export const qcCompleteSchema = z.object({
  taskId: techTaskIdSchema,
  fieldVisitId: techTaskIdSchema.nullable().optional(),
  idempotencyKey: techIdempotencyKeySchema.optional(),
  source: techOperationSourceSchema.optional(),
  phase: techPhaseSchema,
  testValues: z.record(z.string().trim().min(1).max(80), testValueSchema).default({}),
  evidenceIds: z.array(z.string().uuid()).max(20).default([]),
});

export const handoverSchema = z.object({
  taskId: techTaskIdSchema,
  fieldVisitId: techTaskIdSchema.nullable().optional(),
  idempotencyKey: techIdempotencyKeySchema.optional(),
  source: techOperationSourceSchema.optional(),
  signatureBase64: z.string()
    .trim()
    .min(100)
    .max(4_000_000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/, "A PNG signature is required."),
  gps: technicianGpsSchema,
  notes: z.string().trim().max(4_000).optional(),
});

export function getBodyIdempotencyKey(value: { idempotencyKey?: string }, headerValue: string | null) {
  const candidate = headerValue?.trim() || value.idempotencyKey?.trim() || "";
  return techIdempotencyKeySchema.parse(candidate);
}

export function parseMultipartCoordinate(value: FormDataEntryValue | null, min: number, max: number) {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error("Invalid GPS coordinates.");
  return parsed;
}

export function parseCapturedAt(value: FormDataEntryValue | null) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return new Date().toISOString();
  if (!Number.isFinite(Date.parse(raw))) throw new Error("Invalid capture timestamp.");
  return new Date(raw).toISOString();
}
