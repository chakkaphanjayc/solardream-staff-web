import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { z } from "zod";

import type { FinancialReportRequest } from "@/lib/estimateDraftBridge";

const flowSchema = z.object({
  year: z.number().int().min(0).max(25),
  yearSavings: z.number().finite(),
  cumulativeSavings: z.number().finite(),
  yearInstallment: z.number().finite(),
  cumulativeInstallments: z.number().finite(),
  netCashBenefit: z.number().finite(),
}).passthrough();
type FlowRow = z.infer<typeof flowSchema>;

const styles = StyleSheet.create({
  page: { padding: 34, fontFamily: "Helvetica", fontSize: 9, color: "#0F172A" },
  title: { fontSize: 21, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  subtitle: { color: "#475569", fontSize: 9, marginBottom: 18 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 8, color: "#0F4C5C" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  summaryCard: { width: "31%", padding: 9, backgroundColor: "#F0EEE9", borderRadius: 4 },
  label: { fontSize: 7, color: "#64748B", marginBottom: 3, textTransform: "uppercase" },
  value: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  tableHeader: { flexDirection: "row", backgroundColor: "#B7D1EA", paddingVertical: 6, paddingHorizontal: 4, fontFamily: "Helvetica-Bold" },
  tableRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0" },
  year: { width: "8%", textAlign: "center" },
  money: { width: "23%", textAlign: "right" },
  net: { width: "23%", textAlign: "right" },
  note: { marginTop: 14, padding: 10, backgroundColor: "#FFF7ED", color: "#7C2D12", lineHeight: 1.45 },
  footer: { position: "absolute", left: 34, right: 34, bottom: 20, flexDirection: "row", justifyContent: "space-between", color: "#64748B", fontSize: 7 },
});

function money(value: number) { return `THB ${Math.round(value).toLocaleString("en-US")}`; }
function readCashFlows(request: FinancialReportRequest): FlowRow[] {
  const source = request.estimate.summary.cashFlow10Years.flows;
  if (!Array.isArray(source)) return [];
  return source.flatMap((value) => {
    const parsed = flowSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  }).sort((left, right) => left.year - right.year).slice(0, 26);
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <View style={styles.summaryCard}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

function FinancialReportDocument({ request, generatedAt }: { request: FinancialReportRequest; generatedAt: Date }) {
  const summary = request.estimate.summary;
  const flows = readCashFlows(request);
  const financing = summary.activeFinancing;
  return (
    <Document title="SolarDream 25-Year Financial Estimate" author="SolarDream">
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>SolarDream 25-Year Financial Estimate</Text>
        <Text style={styles.subtitle}>Generated {generatedAt.toISOString().slice(0, 10)} from your saved solar configuration.</Text>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>System and financial overview</Text>
          <View style={styles.summaryGrid}>
            <SummaryCard label="System size" value={`${summary.systemSizeKwp.toFixed(2)} kWp`} />
            <SummaryCard label="Panel count" value={`${summary.panelCount}`} />
            <SummaryCard label="Estimated price" value={money(summary.totalPrice)} />
            <SummaryCard label="Monthly savings" value={money(summary.monthlySavings)} />
            <SummaryCard label="Simple payback" value={`${summary.paybackPeriodYears.toFixed(1)} years`} />
            <SummaryCard label="Estimated installment" value={money(summary.estimatedInstallment)} />
            <SummaryCard label="Financing" value={financing ? `${financing.providerName} / ${financing.financeType}` : "No financing selected"} />
            <SummaryCard label="Down payment" value={`${request.estimate.downPaymentPct.toFixed(0)}%`} />
            <SummaryCard label="Loan term" value={`${request.estimate.loanTermMonths} months`} />
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Annual estimated cash flow</Text>
          <View style={styles.tableHeader} fixed>
            <Text style={styles.year}>Year</Text><Text style={styles.money}>Annual savings</Text><Text style={styles.money}>Cumulative savings</Text><Text style={styles.money}>Cumulative payments</Text><Text style={styles.net}>Net benefit</Text>
          </View>
          {flows.length ? flows.map((flow) => (
            <View key={flow.year} style={styles.tableRow} wrap={false}>
              <Text style={styles.year}>{flow.year}</Text><Text style={styles.money}>{money(flow.yearSavings)}</Text><Text style={styles.money}>{money(flow.cumulativeSavings)}</Text><Text style={styles.money}>{money(flow.cumulativeInstallments)}</Text><Text style={styles.net}>{money(flow.netCashBenefit)}</Text>
            </View>
          )) : <Text>No cash-flow rows were available in this estimate.</Text>}
        </View>
        <Text style={styles.note}>Important: All figures in this report are estimates, not guarantees or financial advice. Actual generation, savings, tariffs, financing, equipment, installation conditions, and final pricing may differ after site survey and formal quotation.</Text>
        <View style={styles.footer} fixed><Text>SolarDream | Premium residential solar planning</Text><Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} /></View>
      </Page>
    </Document>
  );
}

export async function generateFinancialReportPdf(request: FinancialReportRequest, generatedAt = new Date()) {
  return renderToBuffer(<FinancialReportDocument request={request} generatedAt={generatedAt} />);
}
