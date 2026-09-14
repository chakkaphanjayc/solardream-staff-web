import React from "react";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/db";
import { quotationSettings } from "@/db/schema";

const BRAND_NAVY = "#0F172A";
const BRAND_SLATE = "#334155";
const BORDER = "#CBD5E1";
const SOFT_BG = "#F8FAFC";
const MUTED = "#64748B";
const THAI_FONT_FAMILY = "THSarabunNew";
type TaxMode = "EXCLUSIVE" | "INCLUSIVE" | "NONE";

let thaiFontsRegistered = false;

function ensureThaiFontsRegistered() {
  if (thaiFontsRegistered) return;

  const regularFontPath = path.join(process.cwd(), "public/fonts/THSarabunNew.ttf");
  const boldFontPath = path.join(process.cwd(), "public/fonts/THSarabunNew-Bold.ttf");

  Font.register({
    family: THAI_FONT_FAMILY,
    fonts: [
      { src: regularFontPath, fontWeight: "normal" },
      { src: boldFontPath, fontWeight: "bold" },
    ],
  });

  Font.registerHyphenationCallback((word) => [word]);

  thaiFontsRegistered = true;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 24,
    fontSize: 9,
    fontFamily: THAI_FONT_FAMILY,
    color: BRAND_SLATE,
    lineHeight: 1.45,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: BRAND_NAVY,
    paddingBottom: 10,
    marginBottom: 10,
  },
  brandBlock: {
    maxWidth: 280,
  },
  brandName: {
    fontSize: 18,
    fontWeight: "bold",
    color: BRAND_NAVY,
  },
  brandMeta: {
    fontSize: 8,
    color: MUTED,
    marginTop: 3,
  },
  docBlock: {
    alignItems: "flex-end",
    maxWidth: 230,
  },
  docKicker: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: BRAND_NAVY,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  docTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: BRAND_NAVY,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  docMeta: {
    fontSize: 7.5,
    color: MUTED,
    marginTop: 2,
    textAlign: "right",
    lineHeight: 1.45,
  },
  metaStrip: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  metaCard: {
    flex: 1,
    backgroundColor: SOFT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  metaLabel: {
    fontSize: 6.5,
    fontWeight: "bold",
    color: MUTED,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: BRAND_NAVY,
  },
  infoGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  infoBox: {
    flex: 1,
    backgroundColor: SOFT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 8,
  },
  infoTitle: {
    fontSize: 8,
    fontWeight: "bold",
    color: BRAND_NAVY,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  infoLine: {
    fontSize: 8,
    color: BRAND_SLATE,
    marginBottom: 3,
  },
  infoLabel: {
    color: MUTED,
    fontWeight: "bold",
  },
  sectionTitle: {
    fontSize: 9.5,
    fontWeight: "bold",
    color: BRAND_NAVY,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 6,
  },
  metricGrid: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: SOFT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 6,
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 6.5,
    fontWeight: "bold",
    color: MUTED,
    textTransform: "uppercase",
    marginBottom: 2,
    textAlign: "center",
  },
  metricValue: {
    fontSize: 9.5,
    fontWeight: "bold",
    color: BRAND_NAVY,
    textAlign: "center",
  },
  formulaBox: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  formulaLeft: {
    flex: 1,
    paddingRight: 10,
  },
  formulaTitle: {
    fontSize: 7,
    fontWeight: "bold",
    color: BRAND_NAVY,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  formulaValue: {
    fontSize: 9.5,
    fontWeight: "bold",
    color: BRAND_NAVY,
  },
  formulaStats: {
    flexDirection: "row",
    gap: 10,
  },
  formulaStat: {
    alignItems: "center",
  },
  formulaStatLabel: {
    fontSize: 6.5,
    fontWeight: "bold",
    color: MUTED,
    textTransform: "uppercase",
  },
  formulaStatValue: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: BRAND_NAVY,
    marginTop: 1,
  },
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 4,
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: SOFT_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingHorizontal: 6,
    paddingVertical: 6,
    alignItems: "center",
  },
  tableColCategory: { flex: 1.35, paddingRight: 4 },
  tableColName: { flex: 3, paddingRight: 4 },
  tableColQty: { flex: 0.6, textAlign: "center" },
  tableColPrice: { flex: 1.15, textAlign: "right" },
  tableColTotal: { flex: 1.15, textAlign: "right", fontWeight: "bold" },
  tableHeaderText: {
    fontSize: 7.5,
    fontWeight: "bold",
    color: BRAND_NAVY,
    textTransform: "uppercase",
  },
  itemText: {
    fontSize: 8,
    color: BRAND_SLATE,
  },
  summaryBox: {
    backgroundColor: SOFT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
    minHeight: 14,
  },
  summaryLabel: {
    fontSize: 8,
    color: BRAND_SLATE,
    fontWeight: "bold",
  },
  summaryValue: {
    fontSize: 8,
    color: BRAND_NAVY,
    fontWeight: "bold",
  },
  summaryGrandRow: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
    marginTop: 4,
    marginBottom: 0,
  },
  summaryGrandLabel: {
    fontSize: 9,
    color: BRAND_NAVY,
    fontWeight: "bold",
  },
  summaryGrandValue: {
    fontSize: 10,
    color: BRAND_NAVY,
    fontWeight: "bold",
  },
  legalGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  legalBox: {
    flex: 1,
    backgroundColor: SOFT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 8,
  },
  legalBoxTitle: {
    fontSize: 8,
    fontWeight: "bold",
    color: BRAND_NAVY,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  legalText: {
    fontSize: 8,
    lineHeight: 1.55,
    color: BRAND_SLATE,
  },
  footer: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  footerBrand: {
    fontSize: 9,
    fontWeight: "bold",
    color: BRAND_NAVY,
  },
  footerMeta: {
    fontSize: 7.5,
    color: MUTED,
    marginTop: 2,
  },
  signatureBlock: {
    alignItems: "center",
    minWidth: 180,
  },
  signatureTitle: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: BRAND_NAVY,
    marginBottom: 4,
  },
  signatureImage: {
    width: 160,
    height: 42,
    objectFit: "contain",
    marginBottom: 4,
  },
  signatureLine: {
    width: 160,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    marginTop: 8,
  },
  signatureLabel: {
    fontSize: 7.5,
    color: MUTED,
    marginTop: 4,
  },
});

interface PdfItem {
  categoryName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface ProposalPdfProps {
  leadId: string;
  name: string;
  email: string;
  phone: string;
  location?: string;
  buyerTaxId?: string;
  totalPrice: number;
  items: PdfItem[];
  systemkWp?: number;
  panelCount?: number;
  estimatedSavings?: number;
  paybackPeriod?: string;
  meterType?: string;
  electricityRate?: number;
  signatureDataUri?: string | null;
  /** Daily energy output from E = P × T × PR (kWh/day) */
  dailyEnergyKwh?: number;
  /** Performance Ratio used in the calculation (0–1) */
  PR?: number;
  documentDate?: string | Date;
}

type QuotationSettingsRow = typeof quotationSettings.$inferSelect;

const FALLBACK_SETTINGS: QuotationSettingsRow = {
  id: "default",
  companyName: "Solar Dream Co., Ltd.",
  companyAddress: "กรุณาตั้งค่าที่อยู่บริษัทในหน้าการตั้งค่าใบเสนอราคา",
  taxId: "0000000000000",
  phone: "",
  email: "",
  website: "solardream.co.th",
  taxMode: "EXCLUSIVE",
  termsAndConditions: "กรุณาระบุเงื่อนไขและข้อกำหนดในการขายในระบบ",
  paymentDetails: "กรุณาระบุรายละเอียดการชำระเงินในระบบ",
  validityDays: 30,
  updatedAt: new Date(),
};

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatThaiDate(value: string | Date | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString("th-TH", { dateStyle: "medium" });
  }
  return date.toLocaleDateString("th-TH", { dateStyle: "medium" });
}

function addDays(value: string | Date | undefined, days: number) {
  const base = value instanceof Date ? value : value ? new Date(value) : new Date();
  const safeBase = Number.isNaN(base.getTime()) ? new Date() : base;
  return new Date(safeBase.getTime() + days * 24 * 60 * 60 * 1000);
}

function toText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function shapeThaiText(text: string) {
  if (!text) return text;

  return text
    .normalize("NFC")
    .replace(/ำ/g, "ํา")
    .replace(/ํํ/g, "ํ");
}

function toThaiText(value: unknown, fallback = "") {
  return shapeThaiText(toText(value, fallback));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function formatItemTotal(value: number) {
  return `฿${formatMoney(value)}`;
}

async function loadQuotationSettings() {
  const [settings] = await db.select().from(quotationSettings).limit(1);
  return settings ?? FALLBACK_SETTINGS;
}

function ProposalDocument({
  leadId,
  name,
  email,
  phone,
  location,
  buyerTaxId,
  totalPrice,
  items,
  systemkWp = 0,
  panelCount = 0,
  estimatedSavings = 0,
  paybackPeriod = "0.0",
  meterType = "NORMAL",
  electricityRate = 4.5,
  signatureDataUri = null,
  dailyEnergyKwh = 0,
  PR = 0,
  documentDate,
  settings,
}: ProposalPdfProps & { settings: QuotationSettingsRow }) {
  const issueDate = documentDate ?? new Date();
  const validityDays = Number.isFinite(settings.validityDays) ? settings.validityDays : 30;
  const validUntil = addDays(issueDate, validityDays);
  const documentNo = `QT-${leadId.slice(0, 8).toUpperCase()}`;
  const taxMode = (settings.taxMode || "EXCLUSIVE").toUpperCase() as TaxMode;
  const itemTotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const subtotal = taxMode === "INCLUSIVE" ? itemTotal - (itemTotal * 7 / 107) : itemTotal;
  const vat = taxMode === "EXCLUSIVE"
    ? subtotal * 0.07
    : taxMode === "INCLUSIVE"
      ? itemTotal * (7 / 107)
      : 0;
  const grandTotal = taxMode === "INCLUSIVE" ? itemTotal : subtotal + vat;
  const buyerAddress = toThaiText(location, "");
  const buyerTaxIdText = toThaiText(buyerTaxId, "");
  const hasBuyerAddress = buyerAddress.length > 0;
  const hasBuyerTaxId = buyerTaxIdText.length > 0;
  const companyNameText = toThaiText(settings.companyName);
  const companyAddressText = toThaiText(settings.companyAddress);
  const taxIdText = toThaiText(settings.taxId);
  const phoneText = toThaiText(settings.phone || "");
  const emailText = toThaiText(settings.email || "");
  const websiteText = toThaiText(settings.website || "");
  const nameText = toThaiText(name);
  const emailBuyerText = toThaiText(email);
  const phoneBuyerText = toThaiText(phone);
  const paymentDetailsText = toThaiText(settings.paymentDetails);
  const termsText = toThaiText(settings.termsAndConditions);
  const grandTotalLabel = taxMode === "INCLUSIVE"
    ? "ยอดรวมสุทธิ (Grand Total, รวม VAT แล้ว)"
    : "ยอดรวมสุทธิ (Grand Total)";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>{companyNameText}</Text>
            <Text style={styles.brandMeta}>{companyAddressText}</Text>
            <Text style={styles.brandMeta}>{shapeThaiText(`เลขประจำตัวผู้เสียภาษี: ${taxIdText}`)}</Text>
            {(phoneText || emailText || websiteText) && (
              <Text style={styles.brandMeta}>
                {[phoneText, emailText, websiteText].filter(Boolean).join(" | ")}
              </Text>
            )}
          </View>
          <View style={styles.docBlock}>
            <Text style={styles.docKicker}>{shapeThaiText("ใบเสนอราคา (Quotation)")}</Text>
            <Text style={styles.docTitle}>Quotation</Text>
            <Text style={styles.docMeta}>{shapeThaiText(`เลขที่เอกสาร (Document No.): ${documentNo}`)}</Text>
            <Text style={styles.docMeta}>{shapeThaiText(`วันที่ (Date): ${formatThaiDate(issueDate)}`)}</Text>
            <Text style={styles.docMeta}>{shapeThaiText(`ยืนราคาภายใน (Valid Until): ${formatThaiDate(validUntil)}`)}</Text>
          </View>
        </View>

        <View style={styles.metaStrip}>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Document No.</Text>
            <Text style={styles.metaValue}>{documentNo}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{shapeThaiText(formatThaiDate(issueDate))}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Valid Until</Text>
            <Text style={styles.metaValue}>{shapeThaiText(formatThaiDate(validUntil))}</Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>{shapeThaiText("Seller Information")}</Text>
            <Text style={styles.infoLine}>
              <Text style={styles.infoLabel}>{shapeThaiText("Company Name: ")}</Text>
              {companyNameText}
            </Text>
            <Text style={styles.infoLine}>
              <Text style={styles.infoLabel}>{shapeThaiText("Address: ")}</Text>
              {companyAddressText}
            </Text>
            <Text style={styles.infoLine}>
              <Text style={styles.infoLabel}>{shapeThaiText("เลขประจำตัวผู้เสียภาษี: ")}</Text>
              {taxIdText}
            </Text>
            {phoneText ? (
              <Text style={styles.infoLine}>
                <Text style={styles.infoLabel}>{shapeThaiText("Phone: ")}</Text>
                {phoneText}
              </Text>
            ) : null}
            {emailText ? (
              <Text style={styles.infoLine}>
                <Text style={styles.infoLabel}>{shapeThaiText("Email: ")}</Text>
                {emailText}
              </Text>
            ) : null}
            {websiteText ? (
              <Text style={styles.infoLine}>
                <Text style={styles.infoLabel}>{shapeThaiText("Website: ")}</Text>
                {websiteText}
              </Text>
            ) : null}
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>{shapeThaiText("Buyer Information")}</Text>
            <Text style={styles.infoLine}>
              <Text style={styles.infoLabel}>{shapeThaiText("Customer Name: ")}</Text>
              {nameText}
            </Text>
            <Text style={styles.infoLine}>
              <Text style={styles.infoLabel}>{shapeThaiText("Email: ")}</Text>
              {emailBuyerText}
            </Text>
            <Text style={styles.infoLine}>
              <Text style={styles.infoLabel}>{shapeThaiText("Phone: ")}</Text>
              {phoneBuyerText}
            </Text>
            {hasBuyerAddress ? (
              <Text style={styles.infoLine}>
                <Text style={styles.infoLabel}>{shapeThaiText("ที่อยู่ (Address): ")}</Text>
                {buyerAddress}
              </Text>
            ) : null}
            {hasBuyerTaxId ? (
              <Text style={styles.infoLine}>
                <Text style={styles.infoLabel}>{shapeThaiText("เลขประจำตัวผู้เสียภาษี (Tax ID): ")}</Text>
                {buyerTaxIdText}
              </Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.sectionTitle}>{shapeThaiText("Bill of Materials")}</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableColCategory, styles.tableHeaderText]}>{shapeThaiText("Category")}</Text>
            <Text style={[styles.tableColName, styles.tableHeaderText]}>{shapeThaiText("Spec Details")}</Text>
            <Text style={[styles.tableColQty, styles.tableHeaderText]}>{shapeThaiText("Qty")}</Text>
            <Text style={[styles.tableColPrice, styles.tableHeaderText]}>{shapeThaiText("Unit Price")}</Text>
            <Text style={[styles.tableColTotal, styles.tableHeaderText]}>{shapeThaiText("Total")}</Text>
          </View>

          {items.map((item, index) => (
            <View key={`${item.categoryName}-${index}`} style={styles.tableRow}>
              <Text style={[styles.tableColCategory, styles.itemText]}>{toThaiText(item.categoryName)}</Text>
              <Text style={[styles.tableColName, styles.itemText]}>{toThaiText(item.productName)}</Text>
              <Text style={[styles.tableColQty, styles.itemText]}>{item.quantity}</Text>
              <Text style={[styles.tableColPrice, styles.itemText]}>{formatMoney(item.unitPrice)}</Text>
              <Text style={[styles.tableColTotal, styles.itemText]}>{formatMoney(item.totalPrice)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{shapeThaiText("รวมเป็นเงิน (Subtotal)")}</Text>
            <Text style={styles.summaryValue}>{formatItemTotal(subtotal)}</Text>
          </View>
          {taxMode !== "NONE" && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{shapeThaiText("ภาษีมูลค่าเพิ่ม 7% (VAT 7%)")}</Text>
              <Text style={styles.summaryValue}>{formatItemTotal(vat)}</Text>
            </View>
          )}
          <View style={[styles.summaryRow, styles.summaryGrandRow]}>
            <Text style={styles.summaryGrandLabel}>{shapeThaiText(grandTotalLabel)}</Text>
            <Text style={styles.summaryGrandValue}>{formatItemTotal(grandTotal)}</Text>
          </View>
        </View>

        <View style={styles.legalGrid}>
          <View style={styles.legalBox}>
            <Text style={styles.legalBoxTitle}>{shapeThaiText("รายละเอียดการชำระเงิน (Payment Details)")}</Text>
            <Text style={styles.legalText}>{paymentDetailsText}</Text>
          </View>
          <View style={styles.legalBox}>
            <Text style={styles.legalBoxTitle}>{shapeThaiText("เงื่อนไขและข้อกำหนด (Terms &amp; Conditions)")}</Text>
            <Text style={styles.legalText}>{termsText}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View>
            <Text style={styles.footerBrand}>{companyNameText}</Text>
            <Text style={styles.footerMeta}>
              {websiteText || "solardream.co.th"} | Solar Dream quotation document
            </Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureTitle}>{shapeThaiText("Customer Acceptance / Signature")}</Text>
            {signatureDataUri ? (
              <Image src={signatureDataUri} style={styles.signatureImage} />
            ) : (
              <View style={styles.signatureImage} />
            )}
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>{shapeThaiText("Authorized Signature &amp; Date")}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generateProposalPdfBuffer(data: ProposalPdfProps): Promise<Buffer> {
  ensureThaiFontsRegistered();
  const settings = await loadQuotationSettings();
  const buffer = await renderToBuffer(<ProposalDocument {...data} settings={settings} />);

  if (!buffer.subarray(0, 4).equals(Buffer.from("%PDF"))) {
    throw new Error("PDF renderer returned an invalid PDF buffer.");
  }

  return buffer;
}
