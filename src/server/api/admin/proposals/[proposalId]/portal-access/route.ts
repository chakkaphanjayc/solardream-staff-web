import { NextRequest } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { portalAccessTokens, proposals } from "@/db/schema";
import { requireStaffJson } from "@/lib/auth-guard";
import { portalJson } from "@/lib/portalAccess";
import {
  closeProposalPortalTokens,
  issuePortalToken,
  PORTAL_SCOPES,
  revokePortalToken,
  rotatePortalToken,
} from "@/lib/portalTokens";

type RouteContext = { params: Promise<{ proposalId: string }> };
const actionSchema = z.object({
  action: z.enum(["ISSUE", "ROTATE", "REVOKE", "CLOSE"]).default("ISSUE"),
  tokenId: z.string().uuid().optional(),
  expiresInDays: z.number().int().min(1).max(90).default(14),
  scopes: z.array(z.enum(PORTAL_SCOPES)).min(1).default([...PORTAL_SCOPES]),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const staff = await requireStaffJson();
  if (!staff.ok) return staff.response;
  try {
    const { proposalId } = await context.params;
    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
      columns: { id: true },
    });
    if (!proposal) return portalJson({ success: false, error: "Proposal not found." }, { status: 404 });
    const input = actionSchema.parse(await request.json().catch(() => ({})));

    if (input.action === "CLOSE") {
      await closeProposalPortalTokens(proposal.id);
      return portalJson({ success: true });
    }

    const current = input.tokenId
      ? await db.query.portalAccessTokens.findFirst({
          where: and(
            eq(portalAccessTokens.id, input.tokenId),
            eq(portalAccessTokens.proposalId, proposal.id),
          ),
        })
      : await db.query.portalAccessTokens.findFirst({
          where: and(
            eq(portalAccessTokens.proposalId, proposal.id),
            isNull(portalAccessTokens.revokedAt),
            isNull(portalAccessTokens.closedAt),
          ),
          orderBy: [desc(portalAccessTokens.createdAt)],
        });

    if (input.action === "REVOKE") {
      if (!current) return portalJson({ success: false, error: "Portal token not found." }, { status: 404 });
      await revokePortalToken(current.id, proposal.id);
      return portalJson({ success: true });
    }

    const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
    const issued = input.action === "ROTATE" && current
      ? await rotatePortalToken({
          currentTokenId: current.id,
          proposalId: proposal.id,
          issuedByUserId: staff.user.id,
          scopes: input.scopes,
          expiresAt,
        })
      : await issuePortalToken({
          proposalId: proposal.id,
          issuedByUserId: staff.user.id,
          scopes: input.scopes,
          expiresAt,
        });
    return portalJson({
      success: true,
      token: issued.token,
      tokenId: issued.record.id,
      expiresAt: issued.record.expiresAt.toISOString(),
      scopes: issued.record.scopes,
    });
  } catch (error: unknown) {
    console.error("[Admin Portal Access]", error);
    return portalJson({ success: false, error: "Unable to update portal access." }, { status: 400 });
  }
}
