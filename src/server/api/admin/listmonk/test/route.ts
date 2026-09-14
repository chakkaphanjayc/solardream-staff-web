import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminJson } from "@/lib/auth-guard";
import { sendTransactional } from "@/lib/listmonk";

const listmonkTestSchema = z.object({
  email: z.string().trim().email().max(320),
  templateId: z.coerce.number().int().positive().max(2_147_483_647).optional(),
});

function getConfiguredTestTemplateId() {
  const value = Number(process.env.LISTMONK_TEST_TEMPLATE_ID);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminJson();
  if (!admin.ok) return admin.response;

  const payload = await request.json().catch(() => null);
  const parsed = listmonkTestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Enter a valid recipient email and Listmonk template ID." },
      { status: 400 },
    );
  }

  const templateId = parsed.data.templateId ?? getConfiguredTestTemplateId();
  if (!templateId) {
    return NextResponse.json(
      {
        success: false,
        error: "Enter a Listmonk template ID or configure LISTMONK_TEST_TEMPLATE_ID.",
      },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const delivery = await sendTransactional({
    subscriberEmail: email,
    templateId,
    subscriberMode: "fallback",
    data: {
      is_test: true,
      recipient_email: email,
      customer_name: "SolarDream test recipient",
      document_no: "TEST-EMAIL-2026",
      amount: 149_000,
      action_url: process.env.NEXT_PUBLIC_SITE_URL || "https://solar-dream.org",
      title: "SolarDream Listmonk delivery test",
      message: "This is a test transactional email sent from the SolarDream admin console.",
    },
  });

  if (!delivery.success) {
    return NextResponse.json(
      { success: false, error: delivery.error },
      { status: delivery.status && delivery.status >= 400 && delivery.status < 500 ? 400 : 502 },
    );
  }

  return NextResponse.json({
    success: true,
    message: `Listmonk accepted the test delivery for ${email}.`,
  });
}
