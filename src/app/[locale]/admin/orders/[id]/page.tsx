import { requireStaff } from "@/lib/auth-guard";
import { getPaymentMilestones } from "@/app/actions/payments";
import { db } from "@/db";
import {
  paymentReminderLogs,
  paymentTransactions,
  proposals,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import PaymentHistoryTab, {
  type PaymentAuditTransaction,
} from "./PaymentHistoryTab";
import SimulatePaymentButton from "./SimulatePaymentButton";
import DeleteOrderButton from "./DeleteOrderButton";
import { 
  ArrowLeft, 
  Bell, 
  Calendar, 
  Mail, 
  MessageSquare, 
  ShieldCheck, 
  Clock, 
  DollarSign, 
  Cpu, 
  TrendingUp,
  Link2,
  ExternalLink,
  Building2,
  FileText
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{
    locale: string;
    id: string;
  }>;
}


// Format price helper
function formatPrice(value: number | string) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(Number(value));
}

// Map reminder type to Thai label
function mapReminderType(type: string) {
  switch (type) {
    case "3_DAYS_BEFORE":
      return "แจ้งเตือนล่วงหน้า 3 วัน";
    case "DUE_DATE":
      return "แจ้งเตือนวันกำหนดชำระ";
    case "OVERDUE":
      return "แจ้งเตือนค้างชำระ [⚠️]";
    default:
      return type;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nestedValue(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function paymentAuditView(
  transaction: typeof paymentTransactions.$inferSelect,
): PaymentAuditTransaction {
  const rawSlip =
    nestedValue(transaction.easyslipData, ["data", "rawSlip"]) ||
    nestedValue(transaction.easyslipData, ["rawSlip"]) ||
    transaction.easyslipData;

  return {
    id: transaction.id,
    amount: Number(transaction.amount),
    milestoneIndex: transaction.milestoneIndex,
    status: transaction.status,
    slipGoogleDriveId: transaction.slipGoogleDriveId,
    senderName:
      textValue(
        nestedValue(rawSlip, ["sender", "account", "name", "th"]),
      ) ||
      textValue(
        nestedValue(rawSlip, ["sender", "account", "name", "en"]),
      ) ||
      textValue(nestedValue(rawSlip, ["sender", "account", "name"])),
    senderBank:
      textValue(nestedValue(rawSlip, ["sender", "bank", "short"])) ||
      textValue(nestedValue(rawSlip, ["sender", "bank", "name"])),
    transRef: textValue(nestedValue(rawSlip, ["transRef"])),
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  };
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const staffUser = await requireStaff();
  const isAdmin = staffUser.role === "ADMIN" || staffUser.role === "SUPER_ADMIN";

  // Load the order/proposal details
  const order = await db.query.proposals.findFirst({
    where: eq(proposals.id, id),
    with: {
      user: true,
    },
  });

  if (!order) {
    notFound();
  }

  // Configuration snapshot and linked references
  const configuration = isRecord(order.configurationData) ? order.configurationData : {};
  const linkedLeadId =
    order.wizardLeadId ||
    (typeof configuration.sourceLeadId === "string" ? configuration.sourceLeadId : null) ||
    (typeof configuration.inboundRequestId === "string" ? configuration.inboundRequestId : null) ||
    (typeof configuration.leadId === "string" ? configuration.leadId : null);

  const erpnextQuotId =
    order.erpnextQuotationId ||
    (typeof configuration.erpnextQuotationId === "string" ? configuration.erpnextQuotationId : null);

  const erpnextCustId =
    order.erpnextCustomerId ||
    (typeof configuration.erpnextCustomerId === "string" ? configuration.erpnextCustomerId : null);

  const erpnextBaseUrl = process.env.NEXT_PUBLIC_ERPNEXT_BASE_URL || "https://erp.solar-dream.org";

  // Load payment milestones (generating them if they don't exist yet)
  const milestoneRes = await getPaymentMilestones(id);
  if (!milestoneRes.success || !milestoneRes.milestones) {
    return (
      <div className="p-8 text-center text-rose-600 font-bold bg-[#0F172A] min-h-dvh">
        Error loading payment milestones: {milestoneRes.error || "Unknown error"}
      </div>
    );
  }
  const milestones = milestoneRes.milestones;

  // Load reminder logs linked to milestones
  const milestoneIds = milestones.map((m) => m.id);
  const logs = milestoneIds.length > 0
    ? await db.query.paymentReminderLogs.findMany({
        where: inArray(paymentReminderLogs.milestoneId, milestoneIds),
        orderBy: (l, { desc }) => [desc(l.sentAt)],
        with: {
          milestone: true,
        },
      })
    : [];
  const transactions = await db.query.paymentTransactions.findMany({
    where: eq(paymentTransactions.proposalId, id),
    orderBy: (transaction, { desc }) => [
      desc(transaction.createdAt),
    ],
  });
  const paymentHistory = transactions.map(paymentAuditView);

  return (
    <div className="min-h-dvh bg-[#0F172A] text-gray-100 font-sans">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        
        {/* Back Link & Header */}
        <div className="flex flex-col gap-4">
          <Link
            href={`/${locale}/admin/orders`}
            className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-gray-400 transition-colors hover:text-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Proposal CRM & Orders
          </Link>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-gray-100 sm:text-4xl font-sans">
                Order <span className="text-[#B7D1EA]">#{order.id.slice(0, 8).toUpperCase()}</span>
              </h1>
              <p className="text-gray-400 text-xs mt-1 uppercase font-black tracking-widest">
                Quotation detail, lead lineage, and automated payment communication records.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2.5">
              <span className={cn(
                "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border shadow-none",
                order.status === "ACCEPTED" || order.status === "FULLY_PAID"
                  ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/10"
                  : order.status === "SENT"
                  ? "bg-blue-500/5 text-blue-600 border-blue-500/10"
                  : order.status === "SIGNED_WAITING_VERIFY"
                  ? "bg-amber-500/5 text-amber-600 border-amber-500/10"
                  : order.status === "CONFIRMED"
                  ? "bg-indigo-500/5 text-indigo-600 border-indigo-500/10"
                  : "bg-slate-500/5 text-gray-400 border-slate-500/10"
              )}>
                {order.status}
              </span>
              <div className="flex items-center gap-2 bg-[#0F172A]/70 border border-[#1E293B] px-4 py-2.5 rounded-2xl text-[10px] font-mono font-black uppercase text-gray-400 shadow-xs">
                <ShieldCheck className="w-4 h-4 text-[#B7D1EA]" />
                <span>Authorized Access</span>
              </div>
              <DeleteOrderButton
                proposalId={order.id}
                locale={locale}
                isAdmin={isAdmin}
              />
            </div>
          </div>
        </div>

        {/* Customer, Linked Workflow & Package Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Customer Metadata Card */}
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="text-sm font-black tracking-widest text-[#B7D1EA] uppercase">
                👤 ข้อมูลลูกค้า (Customer Details)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Customer Name</span>
                  <span className="text-sm font-bold text-gray-100">{order.user.name || "Unnamed Customer"}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Email Address</span>
                  <span className="text-sm font-semibold text-gray-100 font-mono">{order.user.email}</span>
                </div>
                {order.installationMapAddress && (
                  <div className="sm:col-span-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Site Address</span>
                    <span className="text-xs font-semibold text-gray-100">{order.installationMapAddress}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="pt-4 border-t border-[#1E293B] flex items-center justify-between text-[11px] font-bold text-gray-500 font-mono mt-4">
              <span>USER ID: {order.user.id.slice(0, 12).toUpperCase()}...</span>
              <span>ROLE: {order.user.role || "CUSTOMER"}</span>
            </div>
          </div>

          {/* Linked Lead & Quotation Workflow Card */}
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="text-sm font-black tracking-widest text-purple-400 uppercase flex items-center gap-1.5">
                <Link2 className="w-4 h-4 text-purple-400" />
                🔗 เชื่อมโยง Lead & Quotation
              </h2>
              <div className="space-y-3">
                {/* Linked Lead */}
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                    Linked Sales Lead
                  </span>
                  {linkedLeadId ? (
                    <Link
                      href={`/${locale}/admin/quotations?view=leads&lead=${encodeURIComponent(linkedLeadId)}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-mono font-bold text-purple-300 hover:bg-purple-500/20 hover:text-white transition-colors"
                      title="Open Lead in Sales Pipeline"
                    >
                      <span>🎯 Lead #{linkedLeadId.slice(0, 8)}</span>
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-500 italic">Direct Online Order (No Lead)</span>
                  )}
                </div>

                {/* Linked Quotation Workbench */}
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                    Quotation Workbench & Documents
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/${locale}/admin/crm/${order.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#58a6ff]/30 bg-[#58a6ff]/10 px-3 py-1.5 text-xs font-mono font-bold text-[#58a6ff] hover:bg-[#58a6ff]/20 hover:text-white transition-colors"
                    >
                      <FileText className="w-3 h-3 text-[#58a6ff]" />
                      <span>Quotation Workbench</span>
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </Link>

                    {order.pdfUrl && (
                      <a
                        href={order.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-[#0B1121] px-2.5 py-1.5 text-xs font-bold text-gray-300 hover:text-white transition-colors"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>

                {/* Linked ERPNext Integration */}
                {(erpnextQuotId || erpnextCustId) && (
                  <div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                      ERPNext CRM Records
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {erpnextQuotId && (
                        <a
                          href={`${erpnextBaseUrl}/app/quotation/${encodeURIComponent(erpnextQuotId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-mono text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                        >
                          <Building2 className="w-3 h-3" />
                          <span>Quot: {erpnextQuotId}</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                        </a>
                      )}
                      {erpnextCustId && (
                        <a
                          href={`${erpnextBaseUrl}/app/customer/${encodeURIComponent(erpnextCustId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-mono text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                        >
                          <Building2 className="w-3 h-3" />
                          <span>Cust: {erpnextCustId}</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="pt-4 border-t border-[#1E293B] flex items-center justify-between text-[11px] font-bold text-gray-500 font-mono mt-4">
              <span>QUOTATION ID: #{order.id.slice(0, 8)}</span>
              <span>STATUS: {order.status}</span>
            </div>
          </div>

          {/* System Package Summary */}
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="text-sm font-black tracking-widest text-[#B7D1EA] uppercase">
                ⚡ ข้อมูลการสั่งซื้อ (Order Summary)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">System Size</span>
                  <span className="text-lg font-black text-gray-100 flex items-center gap-1.5 mt-0.5">
                    <Cpu className="w-4 h-4 text-gray-500 shrink-0" />
                    {order.systemSizeKwp.toFixed(2)} kWp
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Total Panels</span>
                  <span className="text-lg font-black text-gray-100 flex items-center gap-1.5 mt-0.5">
                    <TrendingUp className="w-4 h-4 text-gray-500 shrink-0" />
                    {order.panelCount} Panels
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Contract Value</span>
                  <span className="text-lg font-black text-[#D8A87B] flex items-center gap-1.5 mt-0.5 font-mono">
                    <DollarSign className="w-4 h-4 text-[#D8A87B] shrink-0" />
                    {formatPrice(order.totalPrice)}
                  </span>
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-[#1E293B] flex items-center justify-between text-[11px] font-bold text-gray-500 font-mono mt-4">
              <span>CREATED: {new Date(order.createdAt).toLocaleDateString("th-TH")}</span>
              <span>REVISION: v{order.revisionNumber}</span>
            </div>
          </div>
        </div>

        <PaymentHistoryTab
          locale={locale}
          transactions={paymentHistory}
        />

        {/* Dashboard Panels */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
          
          {/* Payment Milestones (2/5 Cols) */}
          <div className="xl:col-span-2 bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none space-y-5">
            <div>
              <h2 className="text-lg font-black tracking-tight text-gray-100 font-sans">
                📍 แผนการชำระเงิน (Payment Milestones)
              </h2>
              <p className="text-gray-400 text-xs mt-0.5">
                The split-payment stages defined for this solar contract.
              </p>
            </div>
            
            <div className="space-y-4">
              {milestones.map((milestone) => {
                const isPaid = milestone.status === "PAID";
                const isActive = milestone.status === "ACTIVE";
                const isOverdue = milestone.status === "OVERDUE";
                
                return (
                  <div 
                    key={milestone.id} 
                    className={cn(
                      "rounded-2xl border p-4 transition-all",
                      isPaid 
                        ? "border-emerald-100 bg-emerald-500/[0.02] text-gray-100" 
                        : isActive 
                        ? "border-[#B7D1EA]/60 bg-[#0F172A] ring-1 ring-[#B7D1EA]/10" 
                        : isOverdue
                        ? "border-rose-100 bg-rose-500/[0.02]"
                        : "border-slate-150 bg-[#0B1121]/70 opacity-75"
                    )}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-[#B7D1EA]">
                            งวดที่ {milestone.milestoneOrder} ({Number(milestone.percentage)}%)
                          </span>
                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider border",
                            isPaid 
                              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" 
                              : isActive 
                              ? "bg-cyan-500/10 text-[#B7D1EA] border-cyan-500/20" 
                              : isOverdue
                              ? "bg-rose-500/10 text-rose-700 border-rose-500/20"
                              : "bg-[#0B1121] text-gray-400 border-[#1E293B]"
                          )}>
                            {milestone.status === "PAID" ? "ชำระแล้ว" : milestone.status === "ACTIVE" ? "รอชำระ" : milestone.status === "OVERDUE" ? "ค้างชำระ" : "รอดำเนินการ"}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-gray-100 leading-snug">
                          {milestone.milestoneName}
                        </h4>
                        {milestone.dueDate && (
                          <p className="text-[9px] text-gray-400 font-bold flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3 text-gray-500" />
                            กำหนดชำระ: {new Date(milestone.dueDate).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
                          </p>
                        )}
                        {isPaid && milestone.paidAt && (
                          <p className="text-[9px] text-gray-400 font-bold flex items-center gap-1 font-mono">
                            <Calendar className="w-3 h-3 text-gray-500" />
                            ชำระเมื่อ: {new Date(milestone.paidAt).toLocaleString("th-TH")}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-gray-100 font-mono tracking-tight block">
                          {formatPrice(milestone.amount)}
                        </span>
                      </div>
                    </div>
                    {!isPaid && (
                      <div className="mt-3 pt-3 border-t border-[#1E293B]">
                        <SimulatePaymentButton
                          milestoneId={milestone.id}
                          locale={locale}
                          milestoneOrder={milestone.milestoneOrder}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment Alerts Log (3/5 Cols) */}
          <div className="xl:col-span-3 bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none space-y-5">
            <div>
              <h2 className="text-lg font-black tracking-tight text-gray-100 font-sans flex items-center gap-2">
                <Bell className="w-5 h-5 text-[#B7D1EA] shrink-0" />
                ประวัติการแจ้งเตือนชำระเงิน (Payment Alerts Log)
              </h2>
              <p className="text-gray-400 text-xs mt-0.5">
                Audit trail of automated email and SMS payment alerts dispatched to the customer.
              </p>
            </div>

            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[#1E293B] rounded-2xl bg-[#0B1121]/70">
                <Mail className="w-10 h-10 text-slate-300 mb-3" />
                <p className="text-sm font-bold text-gray-300">ยังไม่มีประวัติการส่งคำเตือนอัตโนมัติ</p>
                <p className="text-xs text-gray-500 mt-1">
                  Automated communications will appear here once notifications trigger.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[#1E293B]">
                <div className="overflow-x-auto">
                  <table className="min-w-[760px] w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#1E293B] bg-[#0B1121] text-[9px] uppercase tracking-widest text-gray-300 font-black">
                        <th className="px-4 py-3.5">วันเวลาที่ส่ง (Sent At)</th>
                        <th className="px-4 py-3.5">งวดงาน (Milestone)</th>
                        <th className="px-4 py-3.5">ประเภทการเตือน (Type)</th>
                        <th className="px-4 py-3.5">ช่องทาง (Channel)</th>
                        <th className="px-4 py-3.5">ผู้รับ (Sent To)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logs.map((log) => {
                        const isEmail = log.channel === "EMAIL";
                        
                        return (
                          <tr key={log.id} className="hover:bg-[#0B1121] transition-colors text-xs">
                            {/* Sent At */}
                            <td className="px-4 py-3.5 text-gray-400 font-mono font-bold">
                              {new Date(log.sentAt).toLocaleString("th-TH", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>

                            {/* Milestone */}
                            <td className="px-4 py-3.5 font-bold text-gray-100">
                              งวดที่ {log.milestone.milestoneOrder}: {log.milestone.milestoneName.split(" (")[0]}
                            </td>

                            {/* Type */}
                            <td className="px-4 py-3.5">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold",
                                log.reminderType === "OVERDUE" 
                                  ? "bg-rose-500/10 text-rose-700" 
                                  : log.reminderType === "DUE_DATE" 
                                  ? "bg-cyan-500/10 text-[#B7D1EA]" 
                                  : "bg-[#0B1121] text-gray-300"
                              )}>
                                {mapReminderType(log.reminderType)}
                              </span>
                            </td>

                            {/* Channel */}
                            <td className="px-4 py-3.5">
                              <span className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black tracking-wider border uppercase shadow-2xs",
                                isEmail 
                                  ? "bg-blue-500/5 text-blue-600 border-blue-500/10" 
                                  : "bg-orange-500/5 text-orange-600 border-orange-500/10"
                              )}>
                                {isEmail ? (
                                  <>
                                    <Mail className="w-3 h-3 text-blue-500" />
                                    <span>EMAIL</span>
                                  </>
                                ) : (
                                  <>
                                    <MessageSquare className="w-3 h-3 text-orange-500" />
                                    <span>SMS</span>
                                  </>
                                )}
                              </span>
                            </td>

                            {/* Sent To */}
                            <td className="px-4 py-3.5 font-mono text-gray-400">
                              {log.sentTo}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}
