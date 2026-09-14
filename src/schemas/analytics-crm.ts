import { z } from "zod";

export const ElectricalPhaseSchema = z.enum(["SINGLE_PHASE", "THREE_PHASE"]);

export const WizardSubmissionSchema = z.object({
  kwSize: z.coerce
    .number()
    .positive("System capacity must be greater than 0 kW.")
    .max(200, "Please contact SolarDream for systems above 200 kW."),
  monthlyElectricityBill: z.coerce
    .number()
    .min(0, "Monthly electricity bill cannot be negative.")
    .max(10_000_000, "Monthly electricity bill is outside the supported range."),
  estimatedBudget: z.coerce
    .number()
    .min(0, "Estimated budget cannot be negative.")
    .optional(),
  electricalPhase: ElectricalPhaseSchema,
  usagePeak: z.enum(["DAYTIME", "NIGHTTIME"]).optional(),
  buildingType: z.enum(["RESIDENTIAL", "COMMERCIAL_FACTORY", "GROUND_MOUNT"]).optional(),
  roofMaterial: z.enum(["ROMAN_TILE", "METAL_SHEET", "FLAT_ROOF", "CPAC"]).optional(),
  systemObjective: z.enum(["ON_GRID_SAVINGS", "HYBRID_BACKUP"]).optional(),
  wantsEvChargerReady: z.boolean().optional(),
});

const MAX_ONBOARDING_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_ONBOARDING_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

function isFileLike(value: unknown): value is { size: number; type: string; name?: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "size" in value &&
      typeof (value as { size?: unknown }).size === "number" &&
      "type" in value &&
      typeof (value as { type?: unknown }).type === "string",
  );
}

export const DocumentOnboardingSchema = z.object({
  proposalId: z.string().min(1, "Missing proposal reference."),
  documentRequestId: z.string().min(1, "Missing document request reference."),
  magicTokenSlug: z.string().optional().nullable(),
  requestType: z.enum(["FILE", "LOCATION", "CONTACT_INFO"]).default("FILE"),
  file: z
    .unknown()
    .optional()
    .superRefine((file, ctx) => {
      if (file === undefined || file === null) return;
      if (!isFileLike(file)) {
        ctx.addIssue({
          code: "custom",
          message: "Invalid file payload.",
        });
        return;
      }

      if (file.size > MAX_ONBOARDING_FILE_BYTES) {
        ctx.addIssue({
          code: "custom",
          message: "ไฟล์ต้องมีขนาดไม่เกิน 20MB",
        });
      }

      if (!ALLOWED_ONBOARDING_MIME_TYPES.includes(file.type as typeof ALLOWED_ONBOARDING_MIME_TYPES[number])) {
        ctx.addIssue({
          code: "custom",
          message: "รองรับเฉพาะ PDF หรือไฟล์รูปภาพเท่านั้น",
        });
      }
    }),
  fields: z.record(z.string(), z.string()).optional(),
});

export type WizardSubmissionInput = z.infer<typeof WizardSubmissionSchema>;
export type DocumentOnboardingInput = z.infer<typeof DocumentOnboardingSchema>;
