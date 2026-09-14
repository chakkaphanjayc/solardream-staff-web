import { z } from "zod";

export const idempotencyKeySchema = z.string().trim().min(16).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const sanitizedReason = z.string().trim().min(3).max(1000).refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value), "Remarks contain invalid characters.");
export const checklistCompleteSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  outcome: z.enum(["PASS", "FAIL", "NA"]),
  remarks: sanitizedReason.optional(),
}).superRefine((value, context) => {
  if (value.outcome === "NA" && !value.remarks) context.addIssue({ code: "custom", path: ["remarks"], message: "N/A requires a reason." });
});
export const taskCompleteSchema = z.object({ idempotencyKey: idempotencyKeySchema });
export const evidenceReviewSchema = z.object({ evidenceId: z.string().uuid(), decision: z.enum(["READY", "REJECTED"]), reason: sanitizedReason, idempotencyKey: idempotencyKeySchema });
export const amendmentSchema = z.object({ itemId: z.string().uuid(), label: z.string().trim().min(3).max(240), evidenceRequired: z.boolean(), allowsNa: z.boolean().default(false), reason: sanitizedReason, idempotencyKey: idempotencyKeySchema });
export const installationWebhookSchema = z.object({
  version: z.literal(1), eventId: z.string().trim().min(8).max(160), occurredAt: z.string().datetime(),
  proposalId: z.string().trim().min(1).max(128), eventType: z.enum(["project.updated", "task.updated", "checklist.verified"]),
  taskCode: z.string().trim().max(255).optional(), status: z.string().trim().max(80).optional(),
});

export function parseCoordinate(value: FormDataEntryValue | null, minimum: number, maximum: number) {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error("Invalid coordinates.");
  return parsed;
}
