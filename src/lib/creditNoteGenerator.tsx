import React from "react";
import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/db";
import { quotationSettings } from "@/db/schema";

const BRAND_NAVY = "#0F172A";
const BRAND_SLATE = "#334155";
const BORDER = "#CBD5E1";
const SOFT_BG = "#F8FAFC";
const MUTED = "#64748B";
const THAI_FONT_FAMILY = "THSarabunNew";

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
    paddingTop: 32,
    paddingHorizontal: 32,
    paddingBottom: 28,
    fontSize: 9.5,
    fontFamily: THAI_FONT_FAMILY,
    color: BRAND_SLATE,
    lineHeight: 1.5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: BRAND_NAVY,
    paddingBottom: 12,
    marginBottom: 12,
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
    fontSize: 14,
    fontWeight: "bold",
    color: BRAND_NAVY,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  docMeta: {
    fontSize: 8,
    color: MUTED,
    marginTop: 2.5,
    textAlign: "right",
  },
  infoGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  infoBox: {
    flex: 1,
    backgroundColor: SOFT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 10,
  },
  infoTitle: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: BRAND_NAVY,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  infoLine: {
    fontSize: 8.5,
    color: BRAND_SLATE,
    marginBottom: 3.5,
  },
  infoLabel: {
    color: MUTED,
    fontWeight: "bold",
  },
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 6,
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: SOFT_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  tableColDesc: { flex: 4, paddingRight: 6 },
  tableColReason: { flex: 4, paddingRight: 6 },
  tableColAmount: { flex: 2, textAlign: "right", fontWeight: "bold" },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: "bold",
    color: BRAND_NAVY,
    textTransform: "uppercase",
  },
  itemText: {
    fontSize: 8.5,
    color: BRAND_SLATE,
  },
  summaryBox: {
    backgroundColor: SOFT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    alignSelf: "flex-end",
    width: 250,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3.5,
  },
  summaryLabel: {
    fontSize: 8.5,
    color: BRAND_SLATE,
    fontWeight: "bold",
  },
  summaryValue: {
    fontSize: 9,
    color: BRAND_NAVY,
    fontWeight: "bold",
  },
  summaryGrandRow: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 7,
    marginTop: 5,
  },
  summaryGrandLabel: {
    fontSize: 9.5,
    color: BRAND_NAVY,
    fontWeight: "bold",
  },
  summaryGrandValue: {
    fontSize: 11,
    color: BRAND_NAVY,
    fontWeight: "bold",
  },
  footer: {
    marginTop: "auto",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  footerBrand: {
    fontSize: 9.5,
    fontWeight: "bold",
    color: BRAND_NAVY,
  },
  footerMeta: {
    fontSize: 8,
    color: MUTED,
    marginTop: 3,
  },
  signatureBlock: {
    alignItems: "center",
    minWidth: 180,
  },
  signatureTitle: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: BRAND_NAVY,
    marginBottom: 20,
  },
  signatureLine: {
    width: 160,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    marginTop: 8,
  },
  signatureLabel: {
    fontSize: 8,
    color: MUTED,
    marginTop: 4,
  },
});

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatThaiDate(value: Date | string | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("th-TH", { dateStyle: "medium" });
}

function shapeThaiText(text: string) {
  if (!text) return text;
  return text
    .normalize("NFC")
    .replace(/ำ/g, "ํา")
    .replace(/ํํ/g, "ํ");
}

interface CreditNoteProps {
  id: string;
  proposalId: string;
  reason: string;
  amount: number;
  createdAt: Date | string;
  refundedAt: Date | string | null;
  proposal: {
    id: string;
    userId: string;
    user: {
      name: string | null;
      email: string;
      phone?: string | null;
    };
  };
}

interface SettingsProps {
  companyName: string;
  companyAddress: string;
  taxId: string;
  phone: string | null;
  email: string | null;
  website: string | null;
}

const FALLBACK_SETTINGS: SettingsProps = {
  companyName: "บริษัท โซลาร์ ดรีม จำกัด (Solar Dream Co., Ltd.)",
  companyAddress: "123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110",
  taxId: "0105563000000",
  phone: "02-123-4567",
  email: "support@solardream.co.th",
  website: "solardream.co.th",
};

async function loadQuotationSettings(): Promise<SettingsProps> {
  const [settings] = await db.select().from(quotationSettings).limit(1);
  return (settings as SettingsProps) ?? FALLBACK_SETTINGS;
}

function CreditNoteDocument({ refund, settings }: { refund: CreditNoteProps; settings: SettingsProps }) {
  const documentNo = `CN-${refund.id.slice(0, 8).toUpperCase()}`;
  const originalDocNo = `QT-${refund.proposalId.slice(0, 8).toUpperCase()}`;
  const issueDate = refund.refundedAt || refund.createdAt;

  const companyName = shapeThaiText(settings.companyName);
  const companyAddress = shapeThaiText(settings.companyAddress);
  const taxId = shapeThaiText(settings.taxId);
  const phone = shapeThaiText(settings.phone || "");
  const email = shapeThaiText(settings.email || "");
  const website = shapeThaiText(settings.website || "solardream.co.th");

  const customerName = shapeThaiText(refund.proposal.user.name || "ผู้ใช้บริการ");
  const customerEmail = shapeThaiText(refund.proposal.user.email);
  const customerPhone = shapeThaiText(refund.proposal.user.phone || "-");
  const refundReason = shapeThaiText(refund.reason);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>{companyName}</Text>
            <Text style={styles.brandMeta}>{companyAddress}</Text>
            <Text style={styles.brandMeta}>เลขประจำตัวผู้เสียภาษี: {taxId}</Text>
            <Text style={styles.brandMeta}>โทร: {phone} | อีเมล: {email}</Text>
          </View>
          <View style={styles.docBlock}>
            <Text style={styles.docKicker}>ใบลดหนี้ / ใบส่งคืนสินค้า</Text>
            <Text style={styles.docTitle}>CREDIT NOTE</Text>
            <Text style={styles.docMeta}>เลขที่เอกสาร (CN No.): {documentNo}</Text>
            <Text style={styles.docMeta}>อ้างอิงเอกสารเดิม (Ref QT): {originalDocNo}</Text>
            <Text style={styles.docMeta}>วันที่คืนเงิน (Refund Date): {formatThaiDate(issueDate)}</Text>
          </View>
        </View>

        {/* Info Grid */}
        <View style={styles.infoGrid}>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>ข้อมูลผู้ให้บริการ (Seller)</Text>
            <Text style={styles.infoLine}>
              <Text style={styles.infoLabel}>ชื่อบริษัท: </Text>
              {companyName}
            </Text>
            <Text style={styles.infoLine}>
              <Text style={styles.infoLabel}>ที่อยู่: </Text>
              {companyAddress}
            </Text>
            <Text style={styles.infoLine}>
              <Text style={styles.infoLabel}>เลขผู้เสียภาษี: </Text>
              {taxId}
            </Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>ข้อมูลผู้ซื้อ (Customer)</Text>
            <Text style={styles.infoLine}>
              <Text style={styles.infoLabel}>ชื่อผู้ซื้อ: </Text>
              {customerName}
            </Text>
            <Text style={styles.infoLine}>
              <Text style={styles.infoLabel}>เบอร์โทร: </Text>
              {customerPhone}
            </Text>
            <Text style={styles.infoLine}>
              <Text style={styles.infoLabel}>อีเมล: </Text>
              {customerEmail}
            </Text>
          </View>
        </View>

        {/* Details Table */}
        <Text style={{ fontSize: 9.5, fontWeight: "bold", color: BRAND_NAVY, marginBottom: 5 }}>
          รายละเอียดการคืนเงิน (Refund Details)
        </Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableColDesc, styles.tableHeaderText]}>รายการสินค้า/บริการ (Description)</Text>
            <Text style={[styles.tableColReason, styles.tableHeaderText]}>สาเหตุการลดหนี้ (Reason)</Text>
            <Text style={[styles.tableColAmount, styles.tableHeaderText]}>จำนวนเงินคืน (Refund Amount)</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tableColDesc, styles.itemText]}>
              คืนเงินมัดจำการติดตั้งและสั่งซื้ออุปกรณ์ระบบโซลาร์เซลล์
            </Text>
            <Text style={[styles.tableColReason, styles.itemText]}>
              {refundReason}
            </Text>
            <Text style={[styles.tableColAmount, styles.itemText]}>
              ฿{formatMoney(refund.amount)}
            </Text>
          </View>
        </View>

        {/* Summary */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>มูลค่าก่อนภาษี (Subtotal)</Text>
            <Text style={styles.summaryValue}>฿{formatMoney(refund.amount / 1.07)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>ภาษีมูลค่าเพิ่ม 7% (VAT)</Text>
            <Text style={styles.summaryValue}>฿{formatMoney(refund.amount - (refund.amount / 1.07))}</Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryGrandRow]}>
            <Text style={styles.summaryGrandLabel}>ยอดรวมเงินคืนสุทธิ (Total Refunded)</Text>
            <Text style={styles.summaryGrandValue}>฿{formatMoney(refund.amount)}</Text>
          </View>
        </View>

        {/* Footer Signature */}
        <View style={styles.footer}>
          <View>
            <Text style={styles.footerBrand}>{companyName}</Text>
            <Text style={styles.footerMeta}>เว็บไซต์: {website} | เอกสารนี้ออกในนามระบบ Solar Dream</Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureTitle}>ผู้มีอำนาจลงนาม (Authorized Signature)</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>เจ้าหน้าที่ตรวจสอบและอนุมัติ</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generateCreditNotePdfBuffer(refund: CreditNoteProps): Promise<Buffer> {
  ensureThaiFontsRegistered();
  const settings = await loadQuotationSettings();
  const buffer = await renderToBuffer(<CreditNoteDocument refund={refund} settings={settings} />);

  if (!buffer.subarray(0, 4).equals(Buffer.from("%PDF"))) {
    throw new Error("PDF renderer returned an invalid PDF buffer.");
  }

  return buffer;
}
