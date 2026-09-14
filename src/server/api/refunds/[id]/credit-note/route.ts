import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { returnRefunds, proposals, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return new NextResponse("Missing refund ID", { status: 400 });
    }

    // Authenticate user via Supabase
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Load return_refunds and join proposals and users
    const [result] = await db
      .select({
        refund: returnRefunds,
        proposal: proposals,
        user: users,
      })
      .from(returnRefunds)
      .innerJoin(proposals, eq(returnRefunds.proposalId, proposals.id))
      .innerJoin(users, eq(proposals.userId, users.id))
      .where(eq(returnRefunds.id, id))
      .limit(1);

    if (!result) {
      return new NextResponse("Refund record not found", { status: 404 });
    }

    const refundRecord = result.refund;
    const proposalRecord = result.proposal;
    const userRecord = result.user;

    // Authorization: owner of the proposal, or staff/admin
    if (proposalRecord.userId !== user.id) {
      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: { role: true },
      });
      const isStaff =
        dbUser &&
        ["ADMIN", "SUPER_ADMIN", "MANAGER", "STAFF"].includes(dbUser.role);

      if (!isStaff) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }

    // Format output refund object for the generator
    const refund = {
      id: refundRecord.id,
      proposalId: refundRecord.proposalId,
      reason: refundRecord.reason,
      amount: Number(refundRecord.amount),
      createdAt: refundRecord.createdAt,
      refundedAt: refundRecord.refundedAt,
      proposal: {
        id: proposalRecord.id,
        userId: proposalRecord.userId,
        user: {
          name: userRecord.name,
          email: userRecord.email,
          phone: userRecord.phoneNumber,
        },
      },
    };

    // Generate Credit Note PDF
    const { generateCreditNotePdfBuffer } = await import("@/lib/creditNoteGenerator");
    const pdfBuffer = await generateCreditNotePdfBuffer(refund);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="CreditNote_${refund.id.slice(0, 8)}.pdf"`,
      },
    });
  } catch (error: unknown) {
    console.error("Credit note generation error:", error);
    return new NextResponse("Failed to generate PDF.", {
      status: 500,
    });
  }
}
