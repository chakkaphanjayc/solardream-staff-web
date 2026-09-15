import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { enqueueDocumentRenderJob } from "@/server/services/documents/enqueue-document-job";
import { requireStaffJson } from "@/lib/auth-guard";

const renderDocumentSchema = z.object({
  proposalId: z.string().trim().min(1).max(160),
  sourceDocumentId: z.string().trim().max(160).optional(),
});

export async function POST(request: Request) {
  const auth = await requireStaffJson();
  if (!auth.ok) return auth.response;

  try {
    const input = renderDocumentSchema.parse(await request.json());
    const operationId = await enqueueDocumentRenderJob(db, {
      proposalId: input.proposalId,
      sourceDocumentId: input.sourceDocumentId || null,
      requestedBy: auth.user.id,
    });
    return NextResponse.json({
      success: true,
      queued: true,
      operationId,
      proposalId: input.proposalId,
    }, { status: 202 });
  } catch (error: unknown) {
    console.error("[Document Render API]", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unable to queue document rendering.",
    }, { status: 400 });
  }
}
