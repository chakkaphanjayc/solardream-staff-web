"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  ArrowRight,
  Archive,
  BadgeCheck,
  CalendarDays,
  CheckCircle,
  Hash,
  Eye,
  FileText,
  Mail,
  Phone,
  Search,
  Trash2,
  UserPlus,
  Wrench,
  SolarPanel,
  MapPin,
} from "@/components/ui/icons";
import { toast } from "sonner";
import Combobox from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { deleteSalesPipelineRecords } from "@/app/actions/salesPipeline";
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { type CrmRow, rowMatchesCrmTab } from "@/lib/crmRows";
import { GsapReveal } from "@/components/ui/GsapMotion";
import StatusBadge, { type StatusBadgeTone } from "@/components/ui/StatusBadge";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import { useTranslations } from "next-intl";

interface CrmClientProps {
  initialRows: CrmRow[];
  hideHeader?: boolean;
}

type CrmSortValue = "newest" | "value_desc" | "value_asc";
type CrmScopeValue = "all" | "lead" | "proposal" | "won_completed" | "archive";
type ProposalStatusValue = "all" | "draft" | "pending" | "signed" | "expired";
type DateRangeValue = "all" | "today" | "week" | "month";
type RequestTypeValue = "all" | "installation" | "service";

const SORT_OPTIONS: Array<{
  value: CrmSortValue;
  label: string;
  description: string;
}> = [
  {
    value: "newest",
    label: "Newest First",
    description: "Recent quotations appear first.",
  },
  {
    value: "value_desc",
    label: "Value (High to Low)",
    description: "Highest value rows first.",
  },
  {
    value: "value_asc",
    label: "Value (Low to High)",
    description: "Lowest value rows first.",
  },
];

const SCOPE_OPTIONS: Array<{
  value: CrmScopeValue;
  label: string;
  icon: typeof UserPlus;
}> = [
  { value: "lead", label: "Lead", icon: UserPlus },
  { value: "proposal", label: "Proposal", icon: FileText },
  { value: "won_completed", label: "Won / Completed", icon: BadgeCheck },
  { value: "archive", label: "ARCHIVE", icon: Archive },
];

const PROPOSAL_STATUS_OPTIONS: Array<{
  value: ProposalStatusValue;
  label: string;
}> = [
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "signed", label: "Signed" },
  { value: "expired", label: "Expired" },
];

const DATE_RANGE_OPTIONS: Array<{
  value: DateRangeValue;
  label: string;
  icon: typeof CalendarDays;
}> = [
  { value: "today", label: "Today", icon: CalendarDays },
  { value: "week", label: "This Week", icon: CalendarDays },
  { value: "month", label: "This Month", icon: CalendarDays },
];

function WorkflowStatus({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const tone: StatusBadgeTone =
    normalized === "VERIFIED_IN_PROGRESS" ||
    normalized === "COMPLETED" ||
    normalized === "WON" ||
    normalized === "SIGNED" ||
    normalized === "CONFIRMED" ||
    normalized === "QUOTED"
      ? "success"
      : normalized === "SENT" ||
          normalized === "SIGNED_WAITING_VERIFY" ||
          normalized === "PENDING" ||
          normalized === "PENDING_QUOTE" ||
          normalized === "PENDING_CUSTOMER_APPROVAL" ||
          normalized === "PENDING_CUSTOMER_SIGNATURE" ||
          normalized === "PENDING_EVALUATION" ||
          normalized === "NEW" ||
          normalized === "CONTACTED"
        ? "warning"
        : normalized === "DRAFT"
          ? "slate"
          : normalized === "LOST" ||
              normalized === "DEACTIVATED" ||
              normalized === "CANCELLED" ||
              normalized === "CANCEL_REQUESTED" ||
              normalized === "EXPIRED" ||
              normalized === "REJECTED"
            ? "danger"
            : "warning";

  return (
    <StatusBadge tone={tone}>{status.replaceAll("_", " ")}</StatusBadge>
  );
}

function ErpnextBadge({ quotationId }: { quotationId?: string | null }) {
  if (!quotationId) {
    return <StatusBadge tone="slate">Not Linked</StatusBadge>;
  }

  return (
    <StatusBadge tone="success">
      <CheckCircle className="h-3.5 w-3.5" />
      Synced
      <span className="font-mono text-[10px]">{quotationId}</span>
    </StatusBadge>
  );
}

function TrackRequestBadge({ row }: { row: CrmRow }) {
  return (
    <span className="inline-flex max-w-[180px] items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/50 px-2.5 py-1.5 font-mono text-[10px] font-bold text-windbreeze">
      <Hash className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="truncate">{row.trackRequestNumber}</span>
    </span>
  );
}

function SystemDetails({ row }: { row: CrmRow }) {
  if (row.requestType.toLowerCase() === "service") {
    const names = row.serviceItems.map((item) => {
      const name = item.name;
      if (name && typeof name === "object" && !Array.isArray(name))
        return String(
          (name as Record<string, unknown>).en ||
            (name as Record<string, unknown>).th ||
            "Service",
        );
      return String(item.title || item.serviceName || name || "Service");
    });
    return (
      <div className="flex flex-wrap gap-1.5">
        {names.map((name, index) => (
          <span
            key={`${name}-${index}`}
            className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[11px] font-semibold text-blue-400"
          >
            {name}
          </span>
        ))}
      </div>
    );
  }
  const tags = [
    row.systemSizeKwp !== null ? `${row.systemSizeKwp.toFixed(2)} kWp` : null,
    row.panelCount !== null ? `${row.panelCount} Panels` : null,
  ].filter(Boolean);

  if (tags.length === 0) {
    return (
      <span className="text-xs font-medium text-gray-500">No system data</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-md border border-slate-800 bg-[#0B1121] px-2 py-1 text-[11px] font-semibold text-slate-400"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function formatCompactDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(value));
}

function normalizeStatus(value: string) {
  return value.toUpperCase().replace(/\s+/g, "_");
}

function isProposalExpired(row: CrmRow) {
  return new Date(row.expiresAt).getTime() < Date.now();
}

function isLocalToday(dateLike: string) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function startOfCurrentWeek(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  const offset = (day + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - offset);
  return start;
}

function startOfCurrentMonth(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(1);
  return start;
}

function matchesDateRange(row: CrmRow, dateRange: DateRangeValue) {
  if (dateRange === "all") return true;

  const createdAt = new Date(row.createdAt);
  if (Number.isNaN(createdAt.getTime())) return true;

  if (dateRange === "today") {
    return isLocalToday(row.createdAt);
  }

  if (dateRange === "week") {
    return createdAt >= startOfCurrentWeek();
  }

  if (dateRange === "month") {
    return createdAt >= startOfCurrentMonth();
  }

  return true;
}

function matchesScope(row: CrmRow, scope: CrmScopeValue) {
  if (scope === "all") return true;
  if (scope === "lead") return row.type === "LEAD";
  if (scope === "proposal") return row.type === "PROPOSAL";
  if (scope === "archive") return row.type === "PROPOSAL" && row.isArchived;
  return rowMatchesCrmTab(row, "WON_COMPLETED");
}

function matchesProposalStatus(row: CrmRow, status: ProposalStatusValue) {
  if (row.type !== "PROPOSAL" || status === "all") return true;

  const normalized = normalizeStatus(row.status);
  switch (status) {
    case "draft":
      return normalized === "DRAFT" || normalized === "NEW";
    case "pending":
      return (
        normalized === "PENDING" ||
        normalized === "PENDING_EVALUATION" ||
        normalized === "SENT" ||
        normalized === "SIGNED_WAITING_VERIFY"
      );
    case "signed":
      return (
        normalized === "SIGNED" ||
        normalized === "CONFIRMED" ||
        normalized === "VERIFIED_IN_PROGRESS" ||
        normalized === "COMPLETED"
      );
    case "expired":
      return normalized === "EXPIRED" || isProposalExpired(row);
    default:
      return true;
  }
}

function getScopeLabel(scope: CrmScopeValue) {
  switch (scope) {
    case "lead":
      return "Lead";
    case "proposal":
      return "Proposal";
    case "won_completed":
      return "Won / Completed";
    case "archive":
      return "Archive";
    default:
      return "All";
  }
}

function getProposalStatusLabel(status: ProposalStatusValue) {
  switch (status) {
    case "draft":
      return "Draft";
    case "pending":
      return "Pending";
    case "signed":
      return "Signed";
    case "expired":
      return "Expired";
    default:
      return "All";
  }
}

interface CrmFilterPanelProps {
  sortBy: CrmSortValue;
  scope: CrmScopeValue;
  proposalStatus: ProposalStatusValue;
  dateRange: DateRangeValue;
  requestType: RequestTypeValue;
  activeFilterCount: number;
  onSortChange: (value: CrmSortValue) => void;
  onScopeChange: (value: CrmScopeValue) => void;
  onProposalStatusChange: (value: ProposalStatusValue) => void;
  onDateRangeChange: (value: DateRangeValue) => void;
  onRequestTypeChange: (value: RequestTypeValue) => void;
  onClearAll: () => void;
}

function CrmFilterPanel({
  sortBy,
  scope,
  proposalStatus,
  dateRange,
  requestType,
  activeFilterCount,
  onSortChange,
  onScopeChange,
  onProposalStatusChange,
  onDateRangeChange,
  onRequestTypeChange,
  onClearAll,
}: CrmFilterPanelProps) {
  const scopeLabel =
    SCOPE_OPTIONS.find((o) => o.value === scope)?.label || "All Categories";
  const proposalStatusLabel =
    PROPOSAL_STATUS_OPTIONS.find((o) => o.value === proposalStatus)?.label ||
    "All Statuses";
  const dateRangeLabel =
    DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label || "All Time";
  const sortByLabel =
    SORT_OPTIONS.find((o) => o.value === sortBy)?.label || "Sort By";

  return (
    <div data-bagui="crm-filter-bar" className="admin-crm-filter-bar flex w-full flex-row flex-wrap items-center gap-3 rounded-md border border-[#30363d] bg-[#161b22] p-3 mb-4">
      <div
        className="flex min-h-10 items-center gap-1 rounded-md border border-[#30363d] bg-[#0d1117] p-1"
        aria-label="Request type filter"
      >
        {(["all", "installation", "service"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onRequestTypeChange(value)}
            aria-pressed={requestType === value}
            className={cn(
              "min-h-8 rounded-sm px-3 text-xs font-semibold",
              requestType === value
                ? "bg-[#21262d] text-[#f0f6fc]"
                : "text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]",
            )}
          >
            {value === "all"
              ? "All"
              : value === "installation"
                ? "Installations"
                : "Services"}
          </button>
        ))}
      </div>
      {/* Categories/Status Dropdown */}
      <div className="min-w-[160px] flex-1 sm:flex-initial">
        <Combobox
          options={[
            { value: "all", label: "All Categories" },
            ...SCOPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          ]}
          value={scope === "all" ? "all" : scope}
          onSelect={(value) => onScopeChange(value as CrmScopeValue)}
          buttonLabel={scope === "all" ? "All Categories" : scopeLabel}
          placeholder="Categories / Status"
          className="w-full"
          variant="admin"
        />
      </div>

      {/* Proposal Status (conditional) */}
      {(scope === "proposal" || proposalStatus !== "all") && (
        <div className="min-w-[160px] flex-1 sm:flex-initial">
          <Combobox
            options={[
              { value: "all", label: "All Statuses" },
              ...PROPOSAL_STATUS_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              })),
            ]}
            value={proposalStatus === "all" ? "all" : proposalStatus}
            onSelect={(value) =>
              onProposalStatusChange(value as ProposalStatusValue)
            }
            buttonLabel={
              proposalStatus === "all" ? "All Statuses" : proposalStatusLabel
            }
            placeholder="Proposal Status"
            className="w-full"
            variant="admin"
          />
        </div>
      )}

      {/* Date Range Dropdown */}
      <div className="min-w-[160px] flex-1 sm:flex-initial">
        <Combobox
          options={[
            { value: "all", label: "All Time" },
            ...DATE_RANGE_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            })),
          ]}
          value={dateRange === "all" ? "all" : dateRange}
          onSelect={(value) => onDateRangeChange(value as DateRangeValue)}
          buttonLabel={dateRange === "all" ? "All Time" : dateRangeLabel}
          placeholder="Date Range"
          className="w-full"
          variant="admin"
        />
      </div>

      {/* Sort By Dropdown */}
      <div className="min-w-[160px] flex-1 sm:flex-initial">
        <Combobox
          options={SORT_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
            description: o.description,
          }))}
          value={sortBy}
          onSelect={(value) => onSortChange(value as CrmSortValue)}
          buttonLabel={sortByLabel}
          placeholder="Sort By"
          className="w-full"
          variant="admin"
        />
      </div>

      {/* Clear Action */}
      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className="min-h-10 rounded-md border border-[#30363d] bg-[#0d1117] px-3.5 py-2 text-xs font-semibold text-[#8b949e] transition hover:border-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc] cursor-pointer sm:ml-auto"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}

export default function CrmClient({ initialRows, hideHeader = false }: CrmClientProps) {
  const t = useTranslations("AdminCrm");
  const params = useParams<{ locale?: string }>();
  const locale = typeof params.locale === "string" ? params.locale : "en";
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<CrmRow[]>(initialRows);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<CrmRow | null>(null);
  const [mutatingRowId, setMutatingRowId] = useState<string | null>(null);
  const [isBulkMutating, setIsBulkMutating] = useState(false);

  // Preserve filters while replacing the table data received by router.refresh().
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setRows(initialRows);
      setSelectedRow((current) => current
        ? initialRows.find((row) => row.id === current.id) ?? null
        : null);
    });

    return () => {
      cancelled = true;
    };
  }, [initialRows]);

  const sortBy = useMemo(() => {
    const value = searchParams.get("sort");
    return SORT_OPTIONS.some((option) => option.value === value)
      ? (value as CrmSortValue)
      : "newest";
  }, [searchParams]);

  const rawScope = useMemo(() => {
    const value = searchParams.get("scope");
    return SCOPE_OPTIONS.some((option) => option.value === value)
      ? (value as CrmScopeValue)
      : "all";
  }, [searchParams]);

  const proposalStatus = useMemo(() => {
    const value = searchParams.get("proposalStatus");
    return PROPOSAL_STATUS_OPTIONS.some((option) => option.value === value)
      ? (value as ProposalStatusValue)
      : "all";
  }, [searchParams]);

  const dateRange = useMemo(() => {
    const value = searchParams.get("date");
    return DATE_RANGE_OPTIONS.some((option) => option.value === value)
      ? (value as DateRangeValue)
      : "all";
  }, [searchParams]);
  const requestType: RequestTypeValue =
    searchParams.get("requestType") === "service"
      ? "service"
      : searchParams.get("requestType") === "installation"
        ? "installation"
        : "all";

  const searchQuery = searchParams.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(searchQuery);

  const updateQuery = useCallback((patch: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());

    Object.entries(patch).forEach(([key, value]) => {
      if (!value) {
        next.delete(key);
        return;
      }
      next.set(key, value);
    });

    const nextQuery = next.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchQuery) {
        updateQuery({ q: searchInput ? searchInput : null });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, searchQuery, updateQuery]);

  const scope =
    rawScope === "archive"
      ? rawScope
      : proposalStatus !== "all"
        ? "proposal"
        : rawScope;

  const handleSortChange = (value: CrmSortValue) => {
    updateQuery({ sort: value === "newest" ? null : value });
  };

  const handleScopeChange = (value: CrmScopeValue) => {
    if (value === "all") {
      updateQuery({ scope: null, proposalStatus: null });
      return;
    }

    if (value === "proposal") {
      updateQuery({ scope: value });
      return;
    }

    updateQuery({ scope: value, proposalStatus: null });
  };

  const handleProposalStatusChange = (value: ProposalStatusValue) => {
    updateQuery({
      scope: "proposal",
      proposalStatus: value === "all" ? null : value,
    });
  };

  const handleDateRangeChange = (value: DateRangeValue) => {
    updateQuery({ date: value === "all" ? null : value });
  };
  const handleRequestTypeChange = (value: RequestTypeValue) =>
    updateQuery({ requestType: value === "all" ? null : value });

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
  };

  const clearAllFilters = () => {
    setSearchInput("");
    updateQuery({
      q: null,
      sort: null,
      scope: null,
      proposalStatus: null,
      date: null,
      requestType: null,
    });
  };

  const activeFilterCount = [
    searchInput.trim() ? 1 : 0,
    sortBy !== "newest" ? 1 : 0,
    scope !== "all" ? 1 : 0,
    scope === "proposal" && proposalStatus !== "all" ? 1 : 0,
    dateRange !== "all" ? 1 : 0,
    requestType !== "all" ? 1 : 0,
  ].reduce((total, value) => total + value, 0);

  const filteredRows = useMemo(() => {
    const query = searchInput.toLowerCase().trim();

    const matchingRows = rows.filter((row) => {
      const matchesSearch =
        !query ||
        [
          row.id,
          row.customerName,
          row.email,
          row.phone,
          row.status,
          row.trackRequestNumber,
          row.erpnextQuotationId,
          row.magicTokenSlug,
          row.shippingTrackingNumber,
          row.valueLabel,
          ...row.trackingReferences,
          ...row.serviceItems.map((item) => JSON.stringify(item)),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      const matchesSelectedScope = matchesScope(row, scope);
      const matchesStatus =
        scope === "proposal"
          ? matchesProposalStatus(row, proposalStatus)
          : true;
      const matchesDate = matchesDateRange(row, dateRange);
      const matchesRequestType =
        requestType === "all" || row.requestType.toLowerCase() === requestType;

      return (
        matchesSearch &&
        matchesSelectedScope &&
        matchesStatus &&
        matchesDate &&
        matchesRequestType
      );
    });

    return [...matchingRows].sort((a, b) => {
      if (sortBy === "value_desc") {
        const valueA = a.value ?? Number.NEGATIVE_INFINITY;
        const valueB = b.value ?? Number.NEGATIVE_INFINITY;
        if (valueB !== valueA) return valueB - valueA;
      } else if (sortBy === "value_asc") {
        const valueA = a.value ?? Number.POSITIVE_INFINITY;
        const valueB = b.value ?? Number.POSITIVE_INFINITY;
        if (valueA !== valueB) return valueA - valueB;
      } else {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        if (timeB !== timeA) return timeB - timeA;
      }

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [
    rows,
    searchInput,
    scope,
    proposalStatus,
    dateRange,
    requestType,
    sortBy,
  ]);
  const crmSummary = useMemo(() => {
    const terminalStatuses = new Set(["LOST", "CANCELLED", "EXPIRED"]);
    const completedStatuses = new Set(["SIGNED", "CONFIRMED", "VERIFIED_IN_PROGRESS", "COMPLETED", "FULLY_PAID"]);
    const attention = filteredRows.filter((row) => {
      const status = normalizeStatus(row.status);
      return !terminalStatuses.has(status) && !completedStatuses.has(status);
    }).length;

    return {
      total: filteredRows.length,
      leads: filteredRows.filter((row) => row.type === "LEAD").length,
      proposals: filteredRows.filter((row) => row.type === "PROPOSAL").length,
      attention,
    };
  }, [filteredRows]);
  const selection = useAdminSelection(filteredRows.map((row) => row.id));

  const openDeleteDialog = (row: CrmRow) => {
    setSelectedRow(row);
    setConfirmOpen(true);
  };

  const handlePrimaryAction = async () => {
    if (!selectedRow) return;

    setMutatingRowId(selectedRow.id);
    try {
      const result = await deleteSalesPipelineRecords([
        { type: selectedRow.type === "LEAD" ? "LEAD" : "PROPOSAL", id: selectedRow.id },
      ]);

      if (!result.success) {
        toast.error(result.error || "Unable to delete the linked sales thread.");
        return;
      }

      setRows((current) => current.filter((row) => row.id !== selectedRow.id));
      toast.success("Linked sales thread deleted successfully.");

      selection.clear();
      setConfirmOpen(false);
      setSelectedRow(null);
    } catch (error) {
      console.error("Failed to process CRM destructive action:", error);
      toast.error("Failed to delete the linked sales thread.");
    } finally {
      setMutatingRowId(null);
    }
  };

  const handleBulkDestructiveAction = async () => {
    if (selection.selectedCount === 0) return;
    const selectedRows = rows.filter((row) => selection.selectedIds.includes(row.id));
    if (selectedRows.length === 0) {
      toast.error("The selected CRM records are no longer available. Refresh and try again.");
      return;
    }
    if (!window.confirm(`Permanently delete ${selectedRows.length} selected CRM record(s) and their linked lead, quotation, and customer thread data?`)) return;

    setIsBulkMutating(true);
    try {
      const result = await deleteSalesPipelineRecords(
        selectedRows.map((row) => ({
          type: row.type === "LEAD" ? "LEAD" as const : "PROPOSAL" as const,
          id: row.id,
        })),
      );
      if (!result.success) {
        toast.error(result.error || "Selected sales threads could not be deleted.");
        return;
      }
      const selectedIds = selectedRows.map((row) => row.id);
      setRows((current) => current.filter((row) => !selectedIds.includes(row.id)));
      selection.clear();
      toast.success(`${selectedRows.length} CRM record(s) processed.`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to process selected CRM records.");
    } finally {
      setIsBulkMutating(false);
    }
  };

  return (
    <div data-bagui="crm-list" className="admin-crm-list">
      <GsapReveal className="admin-crm-list__content space-y-6">
        {!hideHeader && (
          <header className="admin-crm-list__header flex flex-col gap-5 border-b border-[#30363d] pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#8b949e]">
                <span className="size-2 rounded-full bg-[#3fb950]" aria-hidden="true" />
                Customers &amp; CRM
                <span className="text-[#6e7681]">/</span>
                <span>Sales records</span>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#f0f6fc] sm:text-3xl">
                Quotation CRM
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#8b949e]">
                Search customer cases, check commercial status, and open the next safe sales action.
              </p>
            </div>
            <Link
              href={`/${locale}/admin/quotations?view=leads`}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[#238636] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2ea043] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff]"
            >
              Open sales pipeline
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </header>
        )}

        {!hideHeader && (
          <dl data-bagui="crm-summary" className="admin-crm-summary grid gap-px overflow-hidden rounded-md border border-[#30363d] bg-[#30363d] sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Visible records", value: crmSummary.total, tone: "text-[#f0f6fc]" },
              { label: "Leads", value: crmSummary.leads, tone: "text-[#58a6ff]" },
              { label: "Quotations", value: crmSummary.proposals, tone: "text-[#d29922]" },
              { label: "Needs attention", value: crmSummary.attention, tone: "text-[#C58F61]" },
            ].map((metric) => (
              <div key={metric.label} className="bg-[#161b22] px-4 py-3.5 sm:px-5">
                <dt className="text-[11px] font-semibold text-[#8b949e]">{metric.label}</dt>
                <dd className={cn("mt-1 font-mono text-xl font-semibold tabular-nums", metric.tone)}>{metric.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="flex flex-col gap-6">
          <section className="space-y-4 min-w-0">
            <div data-bagui="crm-search" className="admin-crm-search flex flex-col gap-3 rounded-md border border-[#30363d] bg-[#161b22] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b949e]" />
                <input
                  value={searchInput}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  placeholder="Search customer, email, ERP ID, or Track No. (QT-...)"
                  className="w-full rounded-md border border-[#30363d] bg-[#0d1117] py-2.5 pl-10 pr-4 text-sm font-medium text-[#f0f6fc] outline-none transition-all placeholder:text-[#6e7681] focus:border-[#58a6ff] focus:bg-[#161b22] focus:ring-1 focus:ring-[#58a6ff]"
                />
              </div>

              {searchInput.trim() && (
                <div className="flex items-center gap-2 sm:flex-none">
                  <button
                    type="button"
                    onClick={() => handleSearchChange("")}
                    className="min-h-10 rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-xs font-semibold text-[#8b949e] transition hover:border-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]"
                  >
                    Clear Search
                  </button>
                </div>
              )}
            </div>

            <CrmFilterPanel
              sortBy={sortBy}
              scope={scope}
              proposalStatus={proposalStatus}
              dateRange={dateRange}
              requestType={requestType}
              activeFilterCount={activeFilterCount}
              onSortChange={handleSortChange}
              onScopeChange={handleScopeChange}
              onProposalStatusChange={handleProposalStatusChange}
              onDateRangeChange={handleDateRangeChange}
              onRequestTypeChange={handleRequestTypeChange}
              onClearAll={clearAllFilters}
            />

            <AdminBulkActionBar
              selectedCount={selection.selectedCount}
              visibleCount={filteredRows.length}
              allVisibleSelected={selection.allVisibleSelected}
              someVisibleSelected={selection.someVisibleSelected}
              onToggleVisible={selection.toggleVisible}
              onClear={selection.clear}
              isPending={isBulkMutating}
              actions={[{
                id: "process",
                label: "Delete selected linked records",
                icon: Trash2,
                tone: "danger",
                onClick: () => void handleBulkDestructiveAction(),
              }]}
              className="mb-3"
            />
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0F172A]">
              <div className="flex items-center justify-between border-b border-slate-800 bg-[#0F172A] px-4 py-3">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-windbreeze" />
                  {getScopeLabel(scope)}
                  {scope === "proposal" && proposalStatus !== "all" && (
                    <span className="rounded-full bg-slate-900/60 px-2.5 py-1 text-[10px] tracking-wider text-slate-350 border border-slate-800">
                      {getProposalStatusLabel(proposalStatus)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-900/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-350 border border-slate-800">
                    {sortBy === "newest"
                      ? "Newest"
                      : sortBy === "value_desc"
                        ? "Value High"
                        : "Value Low"}
                  </span>
                </div>
              </div>

              {/* Horizontal scroll shield: smooth isolated dragging on mobile/tablet */}
              <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      <th className="w-14 px-4 py-3.5 md:px-5">
                        <AdminSelectionCheckbox
                          checked={selection.allVisibleSelected}
                          indeterminate={selection.someVisibleSelected}
                          disabled={isBulkMutating}
                          label="Select all visible CRM records"
                          onChange={selection.toggleVisible}
                        />
                      </th>
                      <th className="min-w-[200px] px-4 py-3.5 md:px-5">Customer & Track No.</th>
                      <th className="min-w-[150px] px-4 py-3.5 md:px-5">System & Type</th>
                      <th className="min-w-[130px] px-4 py-3.5 text-right md:px-5">Value & Payment</th>
                      <th className="min-w-[110px] px-4 py-3.5 md:px-5">Status</th>
                      <th className="min-w-[140px] px-4 py-3.5 md:px-5">ERPNext</th>
                      <th className="w-28 min-w-[100px] px-4 py-3.5 text-right md:px-5">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-16 text-center text-xs font-bold uppercase tracking-widest text-slate-500 md:px-6"
                        >
                          No CRM rows found.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row) => (
                        <tr
                          key={`${row.type}-${row.id}`}
                          className="group transition-colors duration-150 hover:bg-slate-800/40"
                        >
                          <td className="px-4 py-3.5 align-top md:px-5">
                            <AdminSelectionCheckbox
                              checked={selection.isSelected(row.id)}
                              disabled={isBulkMutating}
                              label={`Select CRM record ${row.customerName}`}
                              onChange={() => selection.toggle(row.id)}
                            />
                          </td>
                          {/* Column 1: Customer & Track No. */}
                          <td className="px-4 py-3.5 align-top md:px-5">
                            <Link
                              href={`/${locale}/admin/crm/${row.id}`}
                              className="block"
                            >
                              <p className="font-semibold text-slate-100 transition-colors group-hover:text-windbreeze">
                                {row.customerName}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                                <span className="text-slate-400">#{row.id.slice(0, 8).toUpperCase()}</span>
                                {row.trackRequestNumber ? (
                                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-windbreeze border border-slate-700">
                                    {row.trackRequestNumber}
                                  </span>
                                ) : null}
                                <span
                                  className={cn(
                                    "rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider",
                                    row.type === "LEAD"
                                      ? "bg-slate-800/80 text-slate-300 border border-slate-700/50"
                                      : "bg-windbreeze/10 text-windbreeze border border-windbreeze/20",
                                  )}
                                >
                                  {row.type}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                                {row.phone && (
                                  <span className="inline-flex items-center gap-1">
                                    <Phone className="size-2.5 text-slate-500" />
                                    {row.phone}
                                  </span>
                                )}
                                {row.email && (
                                  <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
                                    <Mail className="size-2.5 text-slate-500" />
                                    {row.email}
                                  </span>
                                )}
                              </div>
                              {(row.installationLatitude || row.installationMapAddress || row.location) && (
                                <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                                  <MapPin className="size-2.5 text-[#B7D1EA] shrink-0" />
                                  <span className="truncate max-w-[200px]">
                                    {row.installationMapAddress || row.location || `${Number(row.installationLatitude).toFixed(4)}, ${Number(row.installationLongitude).toFixed(4)}`}
                                  </span>
                                </div>
                              )}
                            </Link>
                          </td>

                          {/* Column 2: System Specs & Fulfillment */}
                          <td className="px-4 py-3.5 align-top md:px-5">
                            <div className="space-y-1.5">
                              <SystemDetails row={row} />
                              <div>
                                {row.type === "PROPOSAL" ? (
                                  row.requestType.toLowerCase() === "service" ? (
                                    <StatusBadge tone="info" className="px-2 py-0.5 text-[9px]">
                                      <Wrench className="size-2.5" />
                                      Service Call
                                    </StatusBadge>
                                  ) : row.fulfillmentType === "SUPPLY_ONLY" ? (
                                    <StatusBadge tone="success" className="px-2 py-0.5 text-[9px]">
                                      <Archive className="size-2.5" />
                                      Supply Only
                                    </StatusBadge>
                                  ) : (
                                    <StatusBadge tone="info" className="px-2 py-0.5 text-[9px]">
                                      <SolarPanel className="size-2.5" />
                                      Installation
                                    </StatusBadge>
                                  )
                                ) : (
                                  <span className="text-[11px] text-slate-500">—</span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Column 3: Value & Payment */}
                          <td className="px-4 py-3.5 align-top text-right md:px-5">
                            <div className="space-y-1">
                              <p className="font-mono text-sm font-bold text-slate-100 tabular-nums">
                                {row.valueLabel}
                              </p>
                              <div>
                                {row.type === "PROPOSAL" ? (
                                  row.paymentStatus === "Paid 100%" ? (
                                    <StatusBadge tone="success" className="px-2 py-0.5 text-[9px]">Paid 100%</StatusBadge>
                                  ) : row.paymentStatus === "Deposit Paid" ? (
                                    <StatusBadge tone="info" className="px-2 py-0.5 text-[9px]">Deposit Paid</StatusBadge>
                                  ) : (
                                    <StatusBadge tone="danger" className="px-2 py-0.5 text-[9px]">Unpaid</StatusBadge>
                                  )
                                ) : (
                                  <span className="text-[10px] text-slate-500">N/A</span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Column 4: Workflow Status */}
                          <td className="px-4 py-3.5 align-top md:px-5">
                            <WorkflowStatus status={row.status} />
                          </td>

                          {/* Column 5: ERPNext Sync */}
                          <td className="px-4 py-3.5 align-top md:px-5">
                            <ErpnextBadge quotationId={row.erpnextQuotationId} />
                          </td>

                          {/* Column 6: Actions */}
                          <td className="px-4 py-3.5 align-top text-right md:px-5">
                            <div className="flex items-center justify-end gap-1.5">
                              <Link
                                href={`/${locale}/admin/crm/${row.id}`}
                                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-700 bg-slate-800/80 px-2.5 text-xs font-semibold text-slate-200 transition-colors hover:border-windbreeze hover:bg-windbreeze/10 hover:text-white"
                              >
                                <Eye className="size-3.5" />
                                <span>View</span>
                              </Link>
                              <button
                                type="button"
                                onClick={() => openDeleteDialog(row)}
                                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-rose-900/50 bg-rose-950/30 text-rose-400 transition-colors hover:bg-rose-900/50 hover:text-rose-200"
                                title={
                                  row.type === "LEAD"
                                    ? t("actions.deleteLead")
                                    : "Delete linked quotation"
                                }
                                aria-label={
                                  row.type === "LEAD"
                                    ? t("actions.deleteLead")
                                    : "Delete linked quotation"
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </GsapReveal>

      <Dialog
        isOpen={confirmOpen}
        onClose={() => {
          if (mutatingRowId) return;
          setConfirmOpen(false);
          setSelectedRow(null);
        }}
        size="sm"
      >
        <DialogContent className="bg-[#0F172A]">
          <DialogHeader className="border-b border-[#1E293B]/50 pb-4">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-rose-500">
                {selectedRow?.type === "LEAD"
                  ? t("confirm.leadEyebrow")
                  : "Confirm linked quotation deletion"}
              </p>
              <h2 className="text-xl font-black tracking-tight text-gray-100">
                {selectedRow?.type === "LEAD"
                  ? t("confirm.leadTitle")
                  : "Delete linked sales data"}
              </h2>
            </div>
          </DialogHeader>
          <DialogBody className="space-y-4 py-6">
            <div className="rounded-[1.5rem] border border-[#1E293B] bg-[#0F172A]/70 p-4 shadow-none">
              {selectedRow?.type === "LEAD" ? (
                <div className="space-y-3 text-xs leading-relaxed text-gray-300">
                  <p>{t("confirm.leadDescription")}</p>
                  <p className="font-semibold text-gray-400">
                    {t("confirm.leadHint")}
                  </p>
                </div>
              ) : (
                <>
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
                    {t("confirm.impactSystems")}
                  </p>
                  <ul className="space-y-3.5 text-xs leading-relaxed text-gray-300">
                    <li className="flex items-start gap-2.5">
                      <span className="mt-0.5 shrink-0">🔴</span>
                      <div>
                        <strong>Local Database</strong>:{" "}
                        The quotation, linked lead, customer thread, and related service records will be permanently deleted.
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="mt-0.5 shrink-0">🔄</span>
                      <div>
                        <strong>ERPNext Integration</strong>:{" "}
                        The linked ERPNext quotation will be cancelled after local deletion.
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="mt-0.5 shrink-0">📁</span>
                      <div>
                        <strong>Google Drive</strong>:{" "}
                        Linked document references will be removed from this sales record.
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="mt-0.5 shrink-0">💬</span>
                      <div>
                        <strong>Discord Alert</strong>:{" "}
                        The deletion will be recorded in the audit trail for staff review.
                      </div>
                    </li>
                  </ul>
                </>
              )}
            </div>

            {selectedRow && (
              <div className="rounded-[1.5rem] border border-[#1E293B] bg-[#0F172A]/40 p-4 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">
                    {selectedRow.type === "LEAD" ? "Lead ID" : "Proposal ID"}
                  </span>
                  <span className="font-mono text-xs font-semibold text-gray-300">
                    {selectedRow.id.toUpperCase()}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">
                    Customer
                  </span>
                  <span className="text-right text-xs font-semibold text-gray-300">
                    {selectedRow.customerName}
                    <span className="block font-normal text-gray-400">
                      {selectedRow.email || "No email"}
                    </span>
                  </span>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter className="border-t border-[#1E293B]/50 bg-[#0F172A]">
            <DialogCloseButton className="mr-3 text-xs font-bold text-gray-400 transition-colors hover:text-gray-100">
              {t("actions.cancel")}
            </DialogCloseButton>
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={!selectedRow || Boolean(mutatingRowId)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#F1D6B8] px-5 py-3 text-xs font-bold tracking-wider text-gray-100 transition-all hover:bg-[#e0c5a7] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mutatingRowId
                ? t("actions.processing")
                : t("actions.confirmDelete")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
