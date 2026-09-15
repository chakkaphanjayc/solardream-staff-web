import "server-only";

import { z } from "zod";

import {
  COMMUNICATION_EVENT_TYPES,
  WORKER_EVENT_SCHEMA_VERSION,
} from "@solar-dream/contracts/workers";

import type { LifecyclePayload } from "@/lib/customerLifecycle";
import { NotificationOrchestrator } from "@/lib/notificationOrchestrator";

const lifecyclePayloadSchema = z.object({
  customerName: z.string().trim().min(1),
  phone: z.string(),
  email: z.string().nullable().optional(),
  lineUserId: z.string().nullable().optional(),
  leadId: z.string().nullable().optional(),
  quotationId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  proposalUrl: z.string().nullable().optional(),
  pdfUrl: z.string().nullable().optional(),
  warrantyCardUrl: z.string().nullable().optional(),
  warrantySubject: z.string().nullable().optional(),
  warrantyDaysRemaining: z.number().finite().nullable().optional(),
  milestone: z.enum(["SURVEY_PENDING", "MATERIAL_DELIVERY", "INSTALLING", "INSPECTION", "COMPLETED"]).nullable().optional(),
  milestoneDetails: z.string().nullable().optional(),
  systemSizeKwp: z.number().finite().nullable().optional(),
  warrantyYears: z.number().finite().nullable().optional(),
  paymentAmount: z.number().finite().nullable().optional(),
  paymentMilestoneName: z.string().nullable().optional(),
  paymentBankAccount: z.string().nullable().optional(),
  paymentTransRef: z.string().nullable().optional(),
  projectProgressUrl: z.string().nullable().optional(),
  paymentActionUrl: z.string().nullable().optional(),
}).passthrough();

const communicationJobSchema = z.object({
  schemaVersion: z.literal(WORKER_EVENT_SCHEMA_VERSION),
  eventType: z.enum(COMMUNICATION_EVENT_TYPES),
  payload: lifecyclePayloadSchema,
});

type CommunicationOutboxEvent = {
  id: string;
  topic: string;
  payload: unknown;
};

export async function deliverCommunicationNotification(event: CommunicationOutboxEvent) {
  const parsed = communicationJobSchema.safeParse(event.payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Invalid communication job ${event.id}: ${issue?.path.join(".") || "payload"} ${issue?.message || "is invalid"}.`);
  }

  const result = await NotificationOrchestrator(
    parsed.data.eventType,
    parsed.data.payload as LifecyclePayload,
  );
  if (!result.success) {
    throw new Error(result.errors?.join("; ") || `Communication job ${event.id} failed.`);
  }
  return result;
}
