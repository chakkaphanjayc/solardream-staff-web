"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  MapPin,
  Phone,
  Route,
  ShieldCheck,
  User,
  Wrench,
} from "@/components/ui/icons";
import {
  updateJobTicketMilestone,
  updateJobTicketSiteSurvey,
} from "@/app/actions/tickets";
import { AuditLogSidebar, AuditLogTrigger, type AuditTimelineItem } from "@/components/ui/AuditLogSidebar";
import DocumentUploaderItem from "@/components/ui/document-uploader-item";
import InstalledAssetRegistration from "@/components/admin/InstalledAssetRegistration";
import { cn, formatPrice } from "@/lib/utils";
import { GsapSpinner } from "@/components/ui/GsapMotion";

type ProjectDocument = {
  id: string;
  phase: number;
  department: string;
  documentGroup: string;
  fileName: string;
  fileUrl: string;
  uploadedBy: string | null;
  uploadedAt: string | Date;
};

type RequiredDocument = {
  title: string;
  phase: number;
  department: string;
  documentGroup: string;
};

type MilestoneField =
  | "isMountingCompleted"
  | "isWiringCompleted"
  | "isInverterSetupCompleted"
  | "isInspectionCompleted";

type JobTicket = {
  id: string;
  quotationId: string;
  status: string;
  assignedTeamId: string | null;
  scheduledDate: string | Date | null;
  installerId: string | null;
  installationNotes: string | null;
  siteSurveyDate: string | Date | null;
  siteSurveyNotes: string | null;
  siteSurveyPhotos: unknown;
  isSiteSurveyCompleted: boolean;
  isMountingCompleted: boolean;
  isWiringCompleted: boolean;
  isInverterSetupCompleted: boolean;
  isInspectionCompleted: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  documents?: ProjectDocument[];
  activityLogs?: AuditTimelineItem[];
  quotation: {
    id: string;
    systemSizeKwp: number;
    panelCount: number;
    totalPrice: number;
    fulfillmentType?: string | null;
    configurationData: Record<string, unknown>;
    signedDocumentDriveUrl?: string | null;
    user: {
      name: string | null;
      email: string;
      phoneNumber: string | null;
    };
  };
};

const DOCUMENT_PHASES: Array<{
  phase: number;
  label: string;
  documents: RequiredDocument[];
}> = [
  {
    phase: 1,
    label: "Phase 1: Sales & Setup",
    documents: [
      { title: "Rooftop Survey Checklist", phase: 1, department: "SALES", documentGroup: "ROOFTOP_SURVEY_CHECKLIST" },
      { title: "Single Line Diagram (SLD)", phase: 1, department: "SALES", documentGroup: "SLD" },
      { title: "Quotation & Proposal", phase: 1, department: "SALES", documentGroup: "QUOTATION_PROPOSAL" },
      { title: "EPC Contract", phase: 1, department: "SALES", documentGroup: "EPC_CONTRACT" },
      { title: "Customer Credit Evaluation", phase: 1, department: "ACCOUNTING", documentGroup: "CUSTOMER_CREDIT_EVALUATION" },
      { title: "Billing Invoice (Down Payment)", phase: 1, department: "ACCOUNTING", documentGroup: "BILLING_INVOICE_DOWN_PAYMENT" },
      { title: "Tax Invoice / Receipt", phase: 1, department: "ACCOUNTING", documentGroup: "TAX_INVOICE_RECEIPT" },
    ],
  },
  {
    phase: 2,
    label: "Phase 2: Eng & Procure",
    documents: [
      { title: "Bill of Materials (BOM)", phase: 2, department: "ENGINEERING", documentGroup: "BOM" },
      { title: "HIRA Document", phase: 2, department: "ENGINEERING", documentGroup: "HIRA" },
      { title: "Method Statement", phase: 2, department: "ENGINEERING", documentGroup: "METHOD_STATEMENT" },
      { title: "Purchase Requisition (PR)", phase: 2, department: "PROCUREMENT", documentGroup: "PR" },
      { title: "Approved Vendor List (AVL)", phase: 2, department: "PROCUREMENT", documentGroup: "AVL" },
      { title: "Purchase Order (PO)", phase: 2, department: "PROCUREMENT", documentGroup: "PO" },
      { title: "Manufacturer's Test Reports", phase: 2, department: "PROCUREMENT", documentGroup: "MANUFACTURER_TEST_REPORTS" },
    ],
  },
  {
    phase: 3,
    label: "Phase 3: Warehouse",
    documents: [
      { title: "Goods Receive Note (GRN)", phase: 3, department: "WAREHOUSE", documentGroup: "GRN" },
      { title: "Asset Control Register", phase: 3, department: "WAREHOUSE", documentGroup: "ASSET_CONTROL_REGISTER" },
      { title: "Material Requisition (MR)", phase: 3, department: "WAREHOUSE", documentGroup: "MR" },
      { title: "AP Voucher / Payment Voucher", phase: 3, department: "ACCOUNTING", documentGroup: "AP_PAYMENT_VOUCHER" },
    ],
  },
  {
    phase: 4,
    label: "Phase 4: Execution",
    documents: [
      { title: "Daily Progress Report", phase: 4, department: "PROJECT_TEAM", documentGroup: "DAILY_PROGRESS_REPORT" },
      { title: "Official Permit Applications (Or.1, ERC, MEA/PEA)", phase: 4, department: "PROJECT_TEAM", documentGroup: "OFFICIAL_PERMIT_APPLICATIONS" },
      { title: "Progress Billing Invoice (2nd Milestone)", phase: 4, department: "ACCOUNTING", documentGroup: "PROGRESS_BILLING_INVOICE_2ND_MILESTONE" },
    ],
  },
  {
    phase: 5,
    label: "Phase 5: Handover",
    documents: [
      { title: "Commissioning & Testing Report", phase: 5, department: "PROJECT_TEAM", documentGroup: "COMMISSIONING_TESTING_REPORT" },
      { title: "Interconnection Approval Letter", phase: 5, department: "PROJECT_TEAM", documentGroup: "INTERCONNECTION_APPROVAL_LETTER" },
      { title: "As-built Drawings (Signed)", phase: 5, department: "PROJECT_TEAM", documentGroup: "AS_BUILT_DRAWINGS_SIGNED" },
      { title: "Operation Manual", phase: 5, department: "PROJECT_TEAM", documentGroup: "OPERATION_MANUAL" },
      { title: "Material Return Form", phase: 5, department: "WAREHOUSE", documentGroup: "MATERIAL_RETURN_FORM" },
      { title: "Scrap/Waste Log", phase: 5, department: "WAREHOUSE", documentGroup: "SCRAP_WASTE_LOG" },
      { title: "Final Billing Invoice", phase: 5, department: "ACCOUNTING", documentGroup: "FINAL_BILLING_INVOICE" },
      { title: "Final Receipt/Tax Invoice", phase: 5, department: "ACCOUNTING", documentGroup: "FINAL_RECEIPT_TAX_INVOICE" },
      { title: "Project Financial Close-Out", phase: 5, department: "ACCOUNTING", documentGroup: "PROJECT_FINANCIAL_CLOSE_OUT" },
      { title: "Warranty Certificate", phase: 5, department: "ACCOUNTING", documentGroup: "WARRANTY_CERTIFICATE" },
    ],
  },
];

const MILESTONES: Array<{ field: MilestoneField; label: string; helper: string }> = [
  { field: "isMountingCompleted", label: "Mounting / Racking", helper: "Rails, clamps, rooftop structure readiness" },
  { field: "isWiringCompleted", label: "DC / AC Wiring", helper: "Cable routing, conduit, breaker wiring" },
  { field: "isInverterSetupCompleted", label: "Inverter Setup", helper: "Inverter mounting, configuration, connectivity" },
  { field: "isInspectionCompleted", label: "Inspection & Safety Check", helper: "Final QA before commissioning handover" },
];

function getConfigText(config: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function toDateInputValue(value: string | Date | null) {
  if (!value) return "";
  return new Date(value).toISOString().split("T")[0] || "";
}

function toPhotoUrls(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

type CatalogProduct = {
  id: string;
  name: string;
  brand: string;
  model: string;
};

type InstalledAsset = {
  id: string;
  proposalId: string;
  customerId: string;
  productName: string;
  serialNumber: string;
  installedDate: Date | string;
  warrantyExpiryDate: Date | string;
};

export default function JobTicketDetailClient({
  ticket,
  catalogProducts,
  initialInstalledAssets,
}: {
  ticket: JobTicket;
  catalogProducts: CatalogProduct[];
  initialInstalledAssets: InstalledAsset[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [activePhase, setActivePhase] = useState(1);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const customerName = ticket.quotation.user.name || ticket.quotation.user.email || "Unknown Customer";
  const config = ticket.quotation.configurationData || {};
  const address = getConfigText(config, ["location", "address", "companyAddress"]) || "N/A";
  const phone = getConfigText(config, ["phone", "phoneNumber"]) || ticket.quotation.user.phoneNumber || "N/A";
  const branchRouting =
    ticket.quotation.fulfillmentType || "INSTALLATION";
  const surveyPhotos = toPhotoUrls(ticket.siteSurveyPhotos);

  const activePhaseConfig = DOCUMENT_PHASES.find((phase) => phase.phase === activePhase) || DOCUMENT_PHASES[0];

  const completedMilestoneCount = useMemo(
    () => MILESTONES.filter((milestone) => ticket[milestone.field]).length,
    [ticket],
  );

  const getDocumentForSlot = (slot: RequiredDocument) => {
    return (ticket.documents || []).find(
      (document) =>
        document.phase === slot.phase &&
        document.department === slot.department &&
        document.documentGroup === slot.documentGroup,
    ) || null;
  };

  const getPhaseCompletion = (phase: number) => {
    const phaseConfig = DOCUMENT_PHASES.find((item) => item.phase === phase);
    if (!phaseConfig) return { completed: 0, total: 0 };
    const completed = phaseConfig.documents.filter((document) => getDocumentForSlot(document)).length;
    return { completed, total: phaseConfig.documents.length };
  };

  const handleSurveySubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formRef.current) return;

    const formData = new FormData(formRef.current);
    formData.set("ticketId", ticket.id);
    setMessage(null);

    startTransition(async () => {
      try {
        const result = await updateJobTicketSiteSurvey(formData);
        if (result.error) {
          setMessage(result.error);
          return;
        }
        setMessage("Site survey logs updated.");
        router.refresh();
      } catch (error) {
        console.error("Site survey update error:", error);
        setMessage("Could not update site survey logs. Please try again.");
      }
    });
  };

  const handleMilestoneToggle = (field: MilestoneField, value: boolean) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await updateJobTicketMilestone(ticket.id, field, value);
        if (result.error) {
          setMessage(result.error);
          return;
        }
        router.refresh();
      } catch (error) {
        console.error("Job ticket milestone update error:", error);
        setMessage("Could not update the milestone. Please try again.");
      }
    });
  };

  return (
    <div className="min-h-dvh bg-[#0F172A] px-4 py-8 text-gray-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-full space-y-8">
        <Link
          href="/admin/job-tickets"
          className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-400 transition-colors hover:text-[#2C486A]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Job Tickets
        </Link>

        <header className="overflow-hidden rounded-3xl border border-[#1E293B] bg-[#0F172A] shadow-none">
          <div className="border-b border-[#1E293B] bg-[#B7D1EA]/25 px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#2C486A]">Job Ticket Detail</p>
                <h1 className="mt-2 flex items-center gap-3 text-2xl font-black uppercase tracking-tight text-[#2C486A] sm:text-3xl">
                  <Wrench className="h-7 w-7" />
                  #{ticket.id.slice(0, 8).toUpperCase()}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AuditLogTrigger
                  onClick={() => setIsAuditOpen(true)}
                  count={ticket.activityLogs?.length || 0}
                  label="Activity log"
                  className="min-h-10 rounded-full"
                />
                <Link
                  href={`/admin/projects/${ticket.id}/audit`}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-slate-900 px-4 text-xs font-black uppercase tracking-wider text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
                >
                  <ShieldCheck className="h-4 w-4" />
                  ISO Audit
                </Link>
                <span className="w-fit rounded-full border border-[#1E293B] bg-[#0F172A] px-4 py-2 text-xs font-black uppercase tracking-wider text-gray-300">
                  {ticket.status}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[#1E293B] bg-[#0B1121]/70 p-4">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-500">
                <FileCheck2 className="h-3.5 w-3.5" />
                Quotation ID
              </p>
              <p className="mt-2 font-mono text-sm font-black text-gray-100">{ticket.quotationId}</p>
            </div>
            <div className="rounded-2xl border border-[#1E293B] bg-[#0B1121]/70 p-4">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-500">
                <User className="h-3.5 w-3.5" />
                Customer Name
              </p>
              <p className="mt-2 text-sm font-black text-gray-100">{customerName}</p>
            </div>
            <div className="rounded-2xl border border-[#1E293B] bg-[#0B1121]/70 p-4">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-500">
                <Route className="h-3.5 w-3.5" />
                Branch Routing
              </p>
              <p className="mt-2 text-sm font-black text-gray-100">{branchRouting}</p>
            </div>
            <div className="rounded-2xl border border-[#1E293B] bg-[#0B1121]/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">System Value</p>
              <p className="mt-2 text-sm font-black text-gray-100">
                {ticket.quotation.systemSizeKwp} kWp / {formatPrice(ticket.quotation.totalPrice)}
              </p>
            </div>
            <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-4 md:col-span-2">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-500">
                <MapPin className="h-3.5 w-3.5" />
                Installation Address
              </p>
              <p className="mt-2 text-sm font-bold text-gray-300">{address}</p>
            </div>
            <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-4">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-500">
                <Phone className="h-3.5 w-3.5" />
                Phone
              </p>
              <p className="mt-2 text-sm font-bold text-gray-300">{phone}</p>
            </div>
            <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-4">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-500">
                <Calendar className="h-3.5 w-3.5" />
                Scheduled Date
              </p>
              <p className="mt-2 text-sm font-bold text-gray-300">
                {ticket.scheduledDate ? new Date(ticket.scheduledDate).toLocaleDateString("th-TH") : "Unscheduled"}
              </p>
            </div>
          </div>
        </header>

        {message && (
          <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A] px-4 py-3 text-sm font-bold text-gray-400">
            {message}
          </div>
        )}

        <section className="rounded-3xl border border-[#1E293B] bg-[#0F172A] p-5 shadow-none sm:p-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-[#2C486A]">
                <FileCheck2 className="h-5 w-5" />
                Document Master Hub
              </h2>
              <p className="mt-1 text-xs font-semibold text-gray-400">
                ISO compliance documents and operational controls across the 5 fulfillment phases.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#1E293B] bg-[#0F172A] p-1">
            <div className="grid min-w-[760px] grid-cols-5 gap-1">
              {DOCUMENT_PHASES.map((phase) => {
                const completion = getPhaseCompletion(phase.phase);
                const isActive = activePhase === phase.phase;
                return (
                  <button
                    key={phase.phase}
                    type="button"
                    onClick={() => setActivePhase(phase.phase)}
                    className={cn(
                      "rounded-xl px-3 py-3 text-left transition-all",
                      isActive ? "bg-[#B7D1EA] text-gray-100 shadow-none" : "text-gray-400 hover:bg-[#0B1121]",
                    )}
                  >
                    <span className="block text-xs font-black leading-tight">{phase.label}</span>
                    <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider opacity-75">
                      {completion.completed}/{completion.total} docs
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 space-y-5">
            {activePhase === 1 && (
              <form ref={formRef} onSubmit={handleSurveySubmit} className="rounded-2xl border border-[#1E293B] bg-[#0B1121]/70 p-4">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-gray-100">
                      <Camera className="h-4 w-4 text-[#2C486A]" />
                      Site Survey Logs
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-gray-400">Date, notes, and rooftop/site photo uploads for Phase 1.</p>
                  </div>
                  {ticket.isSiteSurveyCompleted && (
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Completed
                    </span>
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-gray-500">Survey Date</label>
                    <input
                      name="siteSurveyDate"
                      type="date"
                      defaultValue={toDateInputValue(ticket.siteSurveyDate)}
                      className="w-full rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#B7D1EA]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-gray-500">Notes</label>
                    <textarea
                      name="siteSurveyNotes"
                      defaultValue={ticket.siteSurveyNotes || ""}
                      rows={3}
                      className="w-full rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#B7D1EA]"
                      placeholder="Roof condition, access notes, shading observations..."
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_220px]">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-gray-500">Photo Uploads</label>
                    <input
                      name="siteSurveyPhotos"
                      type="file"
                      accept="image/*"
                      multiple
                      className="w-full rounded-xl border border-dashed border-[#1E293B] bg-[#0F172A] px-3 py-3 text-sm font-semibold text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-[#B7D1EA] file:px-3 file:py-2 file:text-xs file:font-black file:text-gray-100"
                    />
                  </div>
                  <label className="flex items-center gap-3 rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-3 text-sm font-black text-gray-300">
                    <input
                      name="isSiteSurveyCompleted"
                      type="checkbox"
                      defaultChecked={ticket.isSiteSurveyCompleted}
                      className="h-4 w-4 rounded border-[#1E293B] text-[#2C486A]"
                    />
                    Site survey completed
                  </label>
                </div>

                {surveyPhotos.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {surveyPhotos.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="group relative aspect-square overflow-hidden rounded-xl border border-[#1E293B] bg-[#0F172A]">
                        <Image src={url} alt="Site survey photo" fill className="object-cover transition-transform group-hover:scale-105" unoptimized />
                      </a>
                    ))}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isPending}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-[#B7D1EA] px-5 py-3 text-xs font-black uppercase tracking-wider text-gray-100 transition-all hover:bg-[#B7D1EA]/85 disabled:opacity-60"
                >
                  {isPending && <GsapSpinner className="h-4 w-4" />}
                  Save Site Survey
                </button>
              </form>
            )}

            {activePhase === 4 && (
              <div className="rounded-2xl border border-[#1E293B] bg-[#0B1121]/70 p-4">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-gray-100">
                      <ClipboardCheck className="h-4 w-4 text-[#2C486A]" />
                      Milestone Control Checklist
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-gray-400">Database-driven execution checkpoints linked to this job ticket.</p>
                  </div>
                  <span className="w-fit rounded-full bg-[#0F172A] px-3 py-1 text-xs font-black text-gray-400">
                    {completedMilestoneCount}/{MILESTONES.length} complete
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {MILESTONES.map((milestone) => {
                    const checked = Boolean(ticket[milestone.field]);
                    return (
                      <label
                        key={milestone.field}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all",
                          checked ? "border-emerald-200 bg-emerald-500/10" : "border-[#1E293B] bg-[#0F172A] hover:bg-[#0B1121]",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isPending}
                          onChange={(event) => handleMilestoneToggle(milestone.field, event.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-[#1E293B] text-[#2C486A]"
                        />
                        <span>
                          <span className="block text-sm font-black text-gray-100">{milestone.label}</span>
                          <span className="mt-1 block text-xs font-semibold text-gray-400">{milestone.helper}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-wider text-gray-500">{activePhaseConfig.label}</p>
                <p className="text-xs font-bold text-gray-400">
                  {getPhaseCompletion(activePhaseConfig.phase).completed} of {activePhaseConfig.documents.length} uploaded
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {activePhaseConfig.documents.map((document) => (
                  <DocumentUploaderItem
                    key={document.documentGroup}
                    title={document.title}
                    phase={document.phase}
                    department={document.department}
                    documentGroup={document.documentGroup}
                    jobTicketId={ticket.id}
                    existingDocument={getDocumentForSlot(document)}
                    onUploadSuccess={() => router.refresh()}
                    onDeleteSuccess={() => router.refresh()}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <InstalledAssetRegistration
          proposalId={ticket.quotationId}
          products={catalogProducts}
          initialAssets={initialInstalledAssets}
        />

        <AuditLogSidebar
          isOpen={isAuditOpen}
          onClose={() => setIsAuditOpen(false)}
          logs={ticket.activityLogs || []}
          title="Job ticket activity"
          entityLabel={`#${ticket.id.slice(0, 8).toUpperCase()} · ${ticket.quotation.user.name || ticket.quotation.user.email}`}
          emptyMessage="No job ticket audit activity recorded yet."
        />
      </div>
    </div>
  );
}
