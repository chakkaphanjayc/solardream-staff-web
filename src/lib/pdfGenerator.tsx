import React from "react";
import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

const BRAND_NAVY = "#0F172A";
const BRAND_SLATE = "#334155";
const BORDER = "#E2E8F0";
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
    padding: 36,
    fontSize: 10,
    fontFamily: THAI_FONT_FAMILY,
    color: BRAND_SLATE,
    lineHeight: 1.4,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: BRAND_NAVY,
    paddingBottom: 8,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: BRAND_NAVY,
  },
  subtitle: {
    fontSize: 9,
    color: MUTED,
    marginTop: 2,
  },
  metaText: {
    fontSize: 8.5,
    textAlign: "right",
    color: BRAND_SLATE,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: BRAND_NAVY,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingBottom: 4,
    marginBottom: 8,
  },
  grid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  col: {
    flex: 1,
    backgroundColor: SOFT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 8,
  },
  label: {
    fontSize: 7.5,
    fontWeight: "bold",
    color: MUTED,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  value: {
    fontSize: 10,
    fontWeight: "bold",
    color: BRAND_NAVY,
  },
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: SOFT_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    padding: 6,
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    padding: 6,
  },
  thCategory: { flex: 1.5 },
  thProduct: { flex: 3 },
  thQty: { flex: 0.8, textAlign: "center" },
  thPrice: { flex: 1.2, textAlign: "right" },
  thTotal: { flex: 1.2, textAlign: "right" },
  footer: {
    position: "absolute",
    bottom: 36,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 7.5,
    color: MUTED,
  },
});

function sanitizeNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function formatMoney(value: unknown) {
  return sanitizeNumber(value).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export type PreliminaryProposalWizardAnswers = {
  propertyType?: string | null;
  monthlyBill?: number | string | null;
  systemkWp?: number | string | null;
};

export type PreliminaryProposalBundleItem = {
  categoryName?: string | null;
  productName?: string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  totalPrice?: number | string | null;
};

export type PreliminaryProposalFinancialPlan = {
  selectedFinancingId?: string | null;
  preferredLoanTermMonths?: number | string | null;
  downPaymentAmount?: number | string | null;
};

export type PreliminaryProposalPdfData = {
  wizardAnswers: PreliminaryProposalWizardAnswers;
  recommendedBundle: PreliminaryProposalBundleItem[];
  financialPlan?: PreliminaryProposalFinancialPlan | null;
  totalPrice: number;
};

export function PreliminaryProposalPDF({
  wizardAnswers,
  recommendedBundle,
  financialPlan,
  totalPrice,
}: PreliminaryProposalPdfData) {
  const propertyType = wizardAnswers.propertyType === "factory" ? "โรงงาน/อาคารพาณิชย์" : "บ้านพักอาศัย";
  const monthlyBill = sanitizeNumber(wizardAnswers.monthlyBill);
  const sysKwp = sanitizeNumber(wizardAnswers.systemkWp);
  const planId = financialPlan?.selectedFinancingId || "cash";
  const safeTotalPrice = sanitizeNumber(totalPrice);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>SolarDream Preliminary Proposal</Text>
            <Text style={styles.subtitle}>ข้อเสนอการติดตั้งระบบโซลาร์เซลล์เบื้องต้น</Text>
          </View>
          <View>
            <Text style={styles.metaText}>วันที่ออกเอกสาร: {new Date().toLocaleDateString("th-TH")}</Text>
            <Text style={styles.metaText}>ระบบคำนวณอัจฉริยะ SolarDream</Text>
          </View>
        </View>

        {/* Section 1: Customer Info & System Sizing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ข้อมูลโครงการเบื้องต้น (Project Sizing)</Text>
          <View style={styles.grid}>
            <View style={styles.col}>
              <Text style={styles.label}>ประเภทสิ่งปลูกสร้าง</Text>
              <Text style={styles.value}>{propertyType}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>ค่าไฟเดิมเฉลี่ย</Text>
              <Text style={styles.value}>฿{formatMoney(monthlyBill)} / เดือน</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>ขนาดกำลังติดตั้งติดตั้งที่แนะนำ</Text>
              <Text style={styles.value}>{sysKwp.toFixed(2)} kWp</Text>
            </View>
          </View>
        </View>

        {/* Section 2: Bill of Materials */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>รายการอุปกรณ์และราคารวม (BOM Details)</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.thCategory, { fontWeight: "bold" }]}>หมวดหมู่</Text>
              <Text style={[styles.thProduct, { fontWeight: "bold" }]}>รายละเอียดอุปกรณ์</Text>
              <Text style={[styles.thQty, { fontWeight: "bold", textAlign: "center" }]}>จำนวน</Text>
              <Text style={[styles.thPrice, { fontWeight: "bold", textAlign: "right" }]}>ราคาต่อหน่วย</Text>
              <Text style={[styles.thTotal, { fontWeight: "bold", textAlign: "right" }]}>รวม (บาท)</Text>
            </View>
            {recommendedBundle.map((item, idx) => (
              <View key={idx} style={styles.tableRow}>
                <Text style={styles.thCategory}>{item.categoryName || "-"}</Text>
                <Text style={styles.thProduct}>{item.productName || "-"}</Text>
                <Text style={[styles.thQty, { textAlign: "center" }]}>{item.quantity || 0}</Text>
                <Text style={[styles.thPrice, { textAlign: "right" }]}>฿{formatMoney(item.unitPrice)}</Text>
                <Text style={[styles.thTotal, { textAlign: "right" }]}>฿{formatMoney(item.totalPrice)}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingRight: 8 }}>
            <Text style={{ fontWeight: "bold", fontSize: 11, color: BRAND_NAVY }}>
              ยอดลงทุนรวมทั้งสิ้น (Grand Total): ฿{formatMoney(safeTotalPrice)}
            </Text>
          </View>
        </View>

        {/* Section 3: Chosen Financing Plan */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>แผนการเงินและผลตอบแทนที่เลือก (Financial Plan)</Text>
          <View style={styles.grid}>
            {planId === "cash" ? (
              <>
                <View style={styles.col}>
                  <Text style={styles.label}>รูปแบบการเงิน</Text>
                  <Text style={styles.value}>ซื้อสด (Cash Purchase)</Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>ยอดเงินดาวน์ / ลงทุนเริ่มต้น</Text>
                  <Text style={styles.value}>฿{formatMoney(safeTotalPrice)}</Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>ค่างวดผ่อนชำระรายเดือน</Text>
                  <Text style={styles.value}>N/A</Text>
                </View>
              </>
            ) : financialPlan?.preferredLoanTermMonths ? (
              <>
                <View style={styles.col}>
                  <Text style={styles.label}>รูปแบบการเงิน</Text>
                  <Text style={styles.value}>ขอสินเชื่อธนาคาร (Bank Loan)</Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>เงินดาวน์</Text>
                  <Text style={styles.value}>฿{formatMoney(financialPlan.downPaymentAmount)}</Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>ผ่อนชำระรายเดือน / ระยะเวลา</Text>
                  <Text style={styles.value}>{sanitizeNumber(financialPlan.preferredLoanTermMonths)} เดือน</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.col}>
                  <Text style={styles.label}>รูปแบบการเงิน</Text>
                  <Text style={styles.value}>โครงการเช่าซื้อพลังงานไฟฟ้า (PPA)</Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>เงินดาวน์เริ่มต้น</Text>
                  <Text style={styles.value}>฿0 (ติดตั้งฟรี)</Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>เงื่อนไข</Text>
                  <Text style={styles.value}>ค่าไฟส่วนลดตามข้อตกลง</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>© SolarDream Co., Ltd. ระบบออกข้อเสนออัตโนมัติ</Text>
          <Text>เอกสารฉบับนี้ใช้เป็นข้อมูลอ้างอิงเบื้องต้นเท่านั้น</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateProposalBuffer(data: PreliminaryProposalPdfData): Promise<Buffer> {
  ensureThaiFontsRegistered();
  const buffer = await renderToBuffer(<PreliminaryProposalPDF {...data} />);
  return buffer;
}
