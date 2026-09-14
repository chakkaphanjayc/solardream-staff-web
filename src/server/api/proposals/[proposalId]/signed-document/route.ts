import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 60;

const MAX_SIGNATURE_IMAGE_BYTES = 2 * 1024 * 1024;
const SIGNATURE_FETCH_TIMEOUT_MS = 8_000;

type ProposalPdfItem = {
  categoryName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

type ProposalWithSignature = {
  id: string;
  status: string;
  totalPrice: number;
  systemSizeKwp: number;
  panelCount: number;
  monthlySavings: number;
  paybackPeriod: string;
  pdfUrl: string | null;
  revisedPdfUrl: string | null;
  signatureUrl: string | null;
  signedAt: Date | string | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    name: string | null;
    email: string | null;
    phoneNumber: string | null;
  } | null;
  configurationData: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function isLikelyValidImageBuffer(buffer: Buffer, mimeType: string) {
  if (buffer.length === 0) {
    return false;
  }

  if (mimeType === "image/png") {
    return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  return true;
}

function inferSupportedImageMime(buffer: Buffer, fallbackMimeType = "image/png") {
  if (isLikelyValidImageBuffer(buffer, "image/png")) {
    return "image/png";
  }

  if (isLikelyValidImageBuffer(buffer, "image/jpeg")) {
    return "image/jpeg";
  }

  const normalizedFallback = fallbackMimeType.toLowerCase() === "image/jpg" ? "image/jpeg" : fallbackMimeType.toLowerCase();
  return normalizedFallback === "image/png" || normalizedFallback === "image/jpeg" ? normalizedFallback : null;
}

function buildSignatureDataUri(base64Input: string, mimeType = "image/png") {
  const base64Data = base64Input.replace(/\s+/g, "");
  const buffer = Buffer.from(base64Data, "base64");
  const supportedMimeType = inferSupportedImageMime(buffer, mimeType);

  if (!supportedMimeType || !isLikelyValidImageBuffer(buffer, supportedMimeType)) {
    return null;
  }

  return `data:${supportedMimeType};base64,${base64Data}`;
}

function normalizeSignatureDataUri(signatureSource: string) {
  const trimmed = signatureSource.trim();
  const exactMatch = trimmed.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/i);

  if (exactMatch) {
    const mimeType = exactMatch[1].toLowerCase() === "jpg" ? "image/jpeg" : `image/${exactMatch[1].toLowerCase()}`;
    const base64Data = exactMatch[2].replace(/^data:image\/(png|jpg|jpeg);base64,/i, "");
    return buildSignatureDataUri(base64Data, mimeType);
  }

  const unsupportedDataUri = trimmed.match(/^data:image\/([^;]+);base64,/i);
  if (unsupportedDataUri) {
    console.error("[Signed Proposal PDF] Unsupported signature image type:", unsupportedDataUri[1]);
    return null;
  }

  return buildSignatureDataUri(trimmed.replace(/^data:image\/(png|jpg|jpeg);base64,/i, ""), "image/png");
}

function mapConfigurationItem(item: Record<string, unknown>): ProposalPdfItem | null {
  const categoryName = getText(item.categoryName || item.category || item.group || item.section, "Quotation Item");
  const productName = getText(item.productName || item.item_name || item.name || item.model, "");
  const quantity = Math.max(1, toNumber(item.quantity ?? item.qty, 1));
  const unitPrice = toNumber(item.unitPrice ?? item.rate ?? item.basePrice ?? item.price, 0);
  const totalPrice = toNumber(item.totalPrice ?? item.amount, unitPrice * quantity);

  if (!productName) {
    return null;
  }

  return {
    categoryName,
    productName,
    quantity,
    unitPrice,
    totalPrice,
  };
}

function buildServiceFeeItem(item: Record<string, unknown>): ProposalPdfItem | null {
  const productName = getText(item.name || item.title, "");
  if (!productName) return null;

  const quantity = Math.max(1, toNumber(item.qty, 1));
  const unitPrice = toNumber(item.basePrice ?? item.rate ?? item.amount, 0);
  const totalPrice = toNumber(item.amount, unitPrice * quantity);

  return {
    categoryName: "Service Fee",
    productName,
    quantity,
    unitPrice,
    totalPrice,
  };
}

function buildProposalItems(configurationData: unknown, totalPrice: number) {
  const config = asRecord(configurationData);
  const rawItems = Array.isArray(config.items) ? config.items : [];
  const serviceFees = Array.isArray(config.serviceFees) ? config.serviceFees : [];

  const items = [
    ...rawItems
      .map((item) => (item && typeof item === "object" && !Array.isArray(item) ? mapConfigurationItem(item as Record<string, unknown>) : null))
      .filter((item): item is ProposalPdfItem => Boolean(item)),
    ...serviceFees
      .map((item) => (item && typeof item === "object" && !Array.isArray(item) ? buildServiceFeeItem(item as Record<string, unknown>) : null))
      .filter((item): item is ProposalPdfItem => Boolean(item)),
  ];

  if (items.length > 0) {
    return items;
  }

  return [{
    categoryName: "Quotation",
    productName: "Final Proposal Total",
    quantity: 1,
    unitPrice: totalPrice,
    totalPrice,
  }];
}

function isAllowedSignatureImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) {
      return false;
    }

    const hostname = url.hostname.toLowerCase();
    const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const configuredSupabaseHost = configuredSupabaseUrl
      ? new URL(configuredSupabaseUrl).hostname.toLowerCase()
      : "";

    return (
      Boolean(configuredSupabaseHost && hostname === configuredSupabaseHost) ||
      hostname === "lh3.googleusercontent.com" ||
      hostname.endsWith(".googleusercontent.com")
    );
  } catch {
    return false;
  }
}

async function fetchSignatureImageBuffer(url: string) {
  if (!isAllowedSignatureImageUrl(url)) {
    throw new Error("Signature image URL is not from an allowed host.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SIGNATURE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("Unable to fetch the customer signature image.");
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_SIGNATURE_IMAGE_BYTES) {
      throw new Error("Signature image exceeds the maximum allowed size.");
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_SIGNATURE_IMAGE_BYTES) {
      throw new Error("Signature image exceeds the maximum allowed size.");
    }

    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveSignatureDataUri(signatureSource: string | null | undefined) {
  if (!signatureSource) return null;

  const trimmed = signatureSource.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:image/")) {
    return normalizeSignatureDataUri(trimmed);
  }

  if (trimmed.startsWith("data:")) {
    console.error("[Signed Proposal PDF] Unsupported signature data URI payload.");
    return null;
  }

  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && !trimmed.startsWith("http")) {
    return buildSignatureDataUri(trimmed.replace(/^data:image\/(png|jpg|jpeg);base64,/i, ""), "image/png");
  }

  try {
    const { buffer, mimeType } = await fetchSignatureImageBuffer(trimmed);
    const supportedMimeType = inferSupportedImageMime(buffer, mimeType);

    if (!supportedMimeType || !isLikelyValidImageBuffer(buffer, supportedMimeType)) {
      console.error("[Signed Proposal PDF] Signature image is not a supported PNG/JPEG payload.");
      return null;
    }

    const base64 = buffer.toString("base64");
    return `data:${supportedMimeType};base64,${base64}`;
  } catch (error) {
    console.error("[Signed Proposal PDF] Failed to resolve signature image:", error);
    return null;
  }
}

function buildFileName(proposalId: string) {
  return `Quotation_#${proposalId.slice(0, 8).toUpperCase()}_Signed.pdf`;
}

async function generateSignedDocument(proposal: ProposalWithSignature) {
  const { generateProposalPdfBuffer } = await import("@/lib/pdf-generator");
  const config = asRecord(proposal.configurationData);
  const signatureDataUri = await resolveSignatureDataUri(
    proposal.signatureUrl || getText(config.signatureUrl, "")
  );

  const baseDocumentData = {
    leadId: proposal.id,
    name: proposal.user?.name || proposal.user?.email?.split("@")[0] || "Customer",
    email: proposal.user?.email || "",
    phone: getText(config.phone || proposal.user?.phoneNumber, ""),
    location: getText(config.buyerAddress || config.location, "Thailand"),
    buyerTaxId: getText(config.taxId || config.buyerTaxId, ""),
    totalPrice: proposal.totalPrice,
    items: buildProposalItems(proposal.configurationData, proposal.totalPrice),
    systemkWp: proposal.systemSizeKwp,
    panelCount: proposal.panelCount,
    estimatedSavings: proposal.monthlySavings,
    paybackPeriod: proposal.paybackPeriod,
    meterType: getText(config.meterType, "NORMAL"),
    electricityRate: toNumber(config.electricityRate, 4.5),
    dailyEnergyKwh: toNumber(config.dailyEnergyKwh, 0),
    PR: toNumber(config.PR, 0),
    documentDate: proposal.signedAt || proposal.createdAt,
  };

  try {
    return await generateProposalPdfBuffer({
      ...baseDocumentData,
      signatureDataUri,
    });
  } catch (error) {
    if (signatureDataUri) {
      console.error("[Signed Proposal PDF] Signature embedding failed, retrying without signature:", error);
      return generateProposalPdfBuffer({
        ...baseDocumentData,
        signatureDataUri: null,
      });
    }

    throw error;
  }
}

export async function GET(
  req: NextRequest,
  context: { params: { proposalId: string } | Promise<{ proposalId: string }> }
) {
  try {
    const { proposalId } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const proposal = await db.query.proposals.findFirst({
      where: and(
        eq(proposals.id, proposalId),
        eq(proposals.userId, user.id)
      ),
      with: {
        user: {
          columns: {
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
    });

    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    if (proposal.status.toUpperCase() !== "SIGNED") {
      return NextResponse.json(
        { error: "The signed quotation is only available after the proposal has been signed." },
        { status: 409 }
      );
    }

    const pdfBuffer = await generateSignedDocument(proposal);
    const download = req.nextUrl.searchParams.get("download") === "1";
    const fileName = buildFileName(proposal.id);

    if (!pdfBuffer.subarray(0, 4).equals(Buffer.from("%PDF"))) {
      throw new Error("Generated signed quotation is not a valid PDF buffer.");
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
        "Content-Length": String(pdfBuffer.byteLength),
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
      },
    });
  } catch (error: unknown) {
    console.error("[Signed Proposal PDF] Failed to generate document:", error);
    return NextResponse.json(
      { error: "Failed to generate signed quotation document." },
      { status: 500 }
    );
  }
}
