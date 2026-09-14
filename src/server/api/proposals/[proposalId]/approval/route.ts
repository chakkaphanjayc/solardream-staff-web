import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { activityLogs, proposals, userNotifications, users } from "@/db/schema";
import { getQuotationDocumentNo } from "@/lib/erpnext";
import { sendDiscordProposalApprovalNotification } from "@/lib/discord";
import { createClient } from "@/utils/supabase/server";


async function notifyStaffAboutApprovedProposal(input: {
  proposalId: string;
  documentNo: string;
  customerName: string;
}) {
  const staffUsers = await db.query.users.findMany({
    where: inArray(users.role, ["ADMIN", "SUPER_ADMIN", "MANAGER", "STAFF"]),
    columns: { id: true },
  });

  if (staffUsers.length === 0) return;

  await db.insert(userNotifications).values(staffUsers.map((staffUser) => ({
    userId: staffUser.id,
    featureKey: "PROPOSAL_APPROVED_BY_CUSTOMER",
    title: "Customer approved ERPNext quotation",
    link: `/admin/crm/${input.proposalId}`,
    message: `${input.customerName} approved ${input.documentNo}.`,
    isRead: false,
  })));
}

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  try {
    const { proposalId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const proposal = await db.query.proposals.findFirst({
      where: and(
        eq(proposals.id, proposalId),
        eq(proposals.userId, user.id),
      ),
      with: {
        user: {
          columns: {
            name: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!proposal) {
      return NextResponse.json({ success: false, error: "Proposal not found" }, { status: 404 });
    }

    if (["CANCELLED", "DEACTIVATED", "EXPIRED"].includes(proposal.status.toUpperCase())) {
      return NextResponse.json(
        { success: false, error: "This proposal cannot be approved." },
        { status: 409 },
      );
    }

    const approvedAt = new Date().toISOString();
    const documentNo = proposal.erpnextQuotationId || getQuotationDocumentNo(proposal.id);
    const customerName =
      proposal.user?.fullName ||
      proposal.user?.name ||
      proposal.user?.email ||
      user.email ||
      "Customer";
    const currentConfig = (proposal.configurationData as Record<string, unknown>) || {};
    const configurationData = {
      ...currentConfig,
      customerApproval: {
        status: "APPROVED_BY_CUSTOMER",
        approvedAt,
        source: "client-pdf-review-view",
      },
    };

    const [updatedProposal] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(proposals)
        .set({
          status: "APPROVED_BY_CUSTOMER",
          configurationData,
        })
        .where(eq(proposals.id, proposal.id))
        .returning();

      await tx.insert(activityLogs).values({
        entityId: proposal.id,
        entityType: "QUOTATION",
        action: "APPROVED_BY_CUSTOMER",
        description: `${customerName} approved ERPNext quotation ${documentNo}.`,
        userId: user.id,
      });

      return [updated];
    });

    await notifyStaffAboutApprovedProposal({
      proposalId: proposal.id,
      documentNo,
      customerName,
    });

    void sendDiscordProposalApprovalNotification({
      proposalId: proposal.id,
      customerName,
      documentNo,
      totalPrice: updatedProposal.totalPrice,
    }).catch((error) => {
      console.error("Failed to send Discord approval notification:", error);
    });

    revalidatePath("/proposals");
    revalidatePath(`/proposals/${proposal.id}`);
    revalidatePath("/admin/crm");
    revalidatePath(`/admin/crm/${proposal.id}`);

    return NextResponse.json({
      success: true,
      status: updatedProposal.status,
      approvedAt,
    });
  } catch (error: unknown) {
    console.error("[API /proposals/:proposalId/approval] failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to approve proposal" },
      { status: 500 },
    );
  }
}
