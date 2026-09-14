"use client";

import { useMemo, useRef, useState } from "react";
import { Database, Edit3, Plus, RefreshCw, Search, Trash2, X, Check, Clock } from "@/components/ui/icons";
import { toast } from "sonner";

import type {
  DeveloperDataField,
  DeveloperDataResource,
  DeveloperDataResourceDefinition,
  DeveloperDataRow,
  DeveloperDataValue,
} from "@/lib/developerData";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import { cn } from "@/lib/utils";

type FormValue = string | number | boolean;
type FormState = Record<string, FormValue>;

type DataManagerClientProps = {
  resources: readonly DeveloperDataResourceDefinition[];
  initialRows: DeveloperDataRow[];
};

function defaultValue(field: DeveloperDataField): FormValue {
  if (field.kind === "boolean") return false;
  if (field.kind === "number") return 0;
  if (field.kind === "json") return "{}";
  return "";
}

function toFormState(definition: DeveloperDataResourceDefinition, row?: DeveloperDataRow | null): FormState {
  return Object.fromEntries(
    definition.fields.map((field) => {
      const raw = row?.values[field.key];
      if (raw === undefined || raw === null) return [field.key, defaultValue(field)];
      if (field.kind === "json") return [field.key, JSON.stringify(raw, null, 2)];
      return [field.key, raw as FormValue];
    }),
  );
}

function displayValue(value: DeveloperDataValue) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function DataManagerClient({ resources, initialRows }: DataManagerClientProps) {
  const [resourceId, setResourceId] = useState<DeveloperDataResource>(resources[0].id);
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editing, setEditing] = useState<DeveloperDataRow | null>(null);
  const [form, setForm] = useState<FormState>(() => toFormState(resources[0]));
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const loadSequence = useRef(0);

  const definition = useMemo(
    () => resources.find((resource) => resource.id === resourceId) || resources[0],
    [resourceId, resources],
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((item) => JSON.stringify(item.values).toLowerCase().includes(query) || item.id.toLowerCase().includes(query));
  }, [rows, search]);
  const selection = useAdminSelection(visibleRows.map((row) => row.id));

  async function loadResource(nextResource: DeveloperDataResource) {
    const sequence = loadSequence.current + 1;
    loadSequence.current = sequence;
    setResourceId(nextResource);
    setEditing(null);
    setIsEditorOpen(false);
    setSearch("");
    selection.clear();
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/developer/data?resource=${encodeURIComponent(nextResource)}`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (sequence !== loadSequence.current) return;
      if (!response.ok || !payload || typeof payload !== "object" || !Array.isArray((payload as { rows?: unknown }).rows)) {
        const message = payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : "The collection could not be loaded.";
        throw new Error(message);
      }
      setRows((payload as { rows: DeveloperDataRow[] }).rows);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "The collection could not be loaded.");
    } finally {
      if (sequence === loadSequence.current) setIsLoading(false);
    }
  }

  function startCreate() {
    setEditing(null);
    setForm(toFormState(definition));
    setIsEditorOpen(true);
  }

  function startEdit(row: DeveloperDataRow) {
    setEditing(row);
    setForm(toFormState(definition, row));
    setIsEditorOpen(true);
  }

  function updateField(field: DeveloperDataField, value: FormValue) {
    setForm((current) => ({ ...current, [field.key]: value }));
  }

  async function save() {
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/developer/data", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: resourceId, ...(editing ? { id: editing.id } : {}), values: form }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "The data row could not be saved.";
        throw new Error(message);
      }
      toast.success(editing ? "Data row updated." : "Data row created.");
      setIsEditorOpen(false);
      setEditing(null);
      await loadResource(resourceId);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "The data row could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function remove(row: DeveloperDataRow) {
    if (!window.confirm(`Delete row "${row.id}"? This action cannot be undone.`)) return;
    try {
      const response = await fetch("/api/admin/developer/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: resourceId, id: row.id }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "The data row could not be deleted.",
        );
      }
      toast.success("Data row deleted.");
      if (editing?.id === row.id) {
        setIsEditorOpen(false);
        setEditing(null);
      }
      await loadResource(resourceId);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "The data row could not be deleted.");
    }
  }

  async function removeSelected() {
    if (selection.selectedCount === 0) return;
    if (!window.confirm(`Delete ${selection.selectedCount} selected row(s)? This action cannot be undone.`)) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/developer/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: resourceId, ids: selection.selectedIds }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "The selected data rows could not be deleted.",
        );
      }
      const deletedCount = payload && typeof payload === "object" && typeof (payload as { count?: unknown }).count === "number"
        ? (payload as { count: number }).count
        : selection.selectedCount;
      toast.success(`${deletedCount} data row(s) deleted.`);
      selection.clear();
      await loadResource(resourceId);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "The selected data rows could not be deleted.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-full bg-[#0d1117] p-5 text-[#c9d1d9] sm:p-8">
      {/* Header */}
      <header className="mx-auto max-w-7xl border-b border-[#30363d] pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#7CA8D0]">
              <Database className="size-4" aria-hidden="true" />
              Developer / Supabase Data
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#f0f6fc] sm:text-3xl">
              Application Data Manager
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#8b949e] sm:text-sm">
              Manage runtime feature flags, system settings, localized service options, fee configurations, and global announcements.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-md border border-[#30363d] bg-[#161b22] px-3.5 py-2 text-xs text-[#8b949e]">
              <span className="font-semibold text-[#f0f6fc]">{visibleRows.length}</span> rows
            </div>
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#238636] px-3.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#2ea043] active:scale-95"
            >
              <Plus className="size-4" aria-hidden="true" />
              New Row
            </button>
          </div>
        </div>

        {/* Collection Selector Tabs */}
        <div className="mt-6 flex flex-wrap gap-2">
          {resources.map((resource) => {
            const isSelected = resource.id === resourceId;
            return (
              <button
                key={resource.id}
                type="button"
                onClick={() => void loadResource(resource.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors",
                  isSelected
                    ? "border-[#7CA8D0] bg-[#7CA8D0]/15 text-[#f0f6fc] shadow-sm"
                    : "border-[#30363d] bg-[#161b22] text-[#8b949e] hover:border-[#8b949e] hover:text-[#f0f6fc]",
                )}
              >
                <span>{resource.label}</span>
                {isSelected && <Check className="size-3.5 text-[#7CA8D0]" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Table Container */}
      <div className="mx-auto mt-6 max-w-7xl">
        <div className="rounded-xl border border-[#30363d] bg-[#161b22] shadow-sm">
          {/* Table Toolbar */}
          <div className="flex flex-col gap-3 border-b border-[#30363d] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#f0f6fc]">{definition.label}</h2>
              <p className="text-xs text-[#8b949e]">{definition.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#8b949e]" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search keys or values..."
                  className="h-8.5 w-52 rounded-md border border-[#30363d] bg-[#0d1117] pl-8 pr-3 text-xs text-[#f0f6fc] outline-none placeholder:text-[#6e7681] focus:border-[#58a6ff]"
                />
              </div>
              <button
                type="button"
                onClick={() => void loadResource(resourceId)}
                disabled={isLoading}
                className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-[#30363d] px-3 text-xs font-semibold text-[#c9d1d9] transition-colors hover:border-[#8b949e] hover:text-[#f0f6fc] disabled:opacity-50"
              >
                <RefreshCw className={cn("size-3", isLoading && "animate-spin")} aria-hidden="true" />
                Refresh
              </button>
            </div>
          </div>

          {/* Table */}
          <AdminBulkActionBar
            selectedCount={selection.selectedCount}
            visibleCount={visibleRows.length}
            allVisibleSelected={selection.allVisibleSelected}
            someVisibleSelected={selection.someVisibleSelected}
            onToggleVisible={selection.toggleVisible}
            onClear={selection.clear}
            isPending={isLoading}
            actions={[{
              id: "delete",
              label: "Delete",
              icon: Trash2,
              tone: "danger",
              onClick: () => void removeSelected(),
            }]}
            className="mx-4 mt-4"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#30363d] bg-[#0d1117]/80 text-[10px] uppercase tracking-[0.12em] text-[#8b949e]">
                <tr>
                  <th className="w-14 px-4 py-3 font-semibold">
                    <AdminSelectionCheckbox
                      checked={selection.allVisibleSelected}
                      indeterminate={selection.someVisibleSelected}
                      disabled={visibleRows.length === 0 || isLoading}
                      label="Select all visible application data rows"
                      onChange={selection.toggleVisible}
                    />
                  </th>
                  <th className="w-56 min-w-[200px] px-4 py-3 font-semibold">Key / ID</th>
                  <th className="min-w-[320px] px-4 py-3 font-semibold">Values</th>
                  <th className="w-40 min-w-[140px] px-4 py-3 font-semibold">Updated</th>
                  <th className="w-28 min-w-[110px] px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]">
                {visibleRows.map((item) => (
                  <tr key={item.id} className="group transition-colors hover:bg-[#21262d]/40">
                    <td className="px-4 py-3.5 align-top">
                      <AdminSelectionCheckbox
                        checked={selection.isSelected(item.id)}
                        disabled={isLoading}
                        label={`Select application data row ${item.id}`}
                        onChange={() => selection.toggle(item.id)}
                      />
                    </td>
                    {/* ID / Key Column */}
                    <td className="px-4 py-3.5 align-top">
                      <span className="inline-block max-w-[220px] break-words font-mono text-xs font-semibold text-[#7CA8D0]">
                        {item.id}
                      </span>
                    </td>

                    {/* Values Column */}
                    <td className="px-4 py-3.5 align-top">
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {Object.entries(item.values).map(([key, value]) => {
                          const isBool = typeof value === "boolean";
                          return (
                            <div key={key} className="flex items-baseline gap-1.5">
                              <span className="text-[11px] font-medium text-[#8b949e]">{key}:</span>
                              {isBool ? (
                                <span
                                  className={cn(
                                    "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                                    value ? "bg-[#238636]/20 text-[#3fb950]" : "bg-slate-700/40 text-slate-400",
                                  )}
                                >
                                  {String(value)}
                                </span>
                              ) : (
                                <span className="max-w-md break-words font-sans text-xs text-[#c9d1d9]">
                                  {displayValue(value)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>

                    {/* Updated At Column */}
                    <td className="px-4 py-3.5 align-top text-[#8b949e]">
                      {item.updatedAt ? (
                        <div className="flex items-center gap-1 text-[11px]">
                          <Clock className="size-3 shrink-0" aria-hidden="true" />
                          <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
                        </div>
                      ) : (
                        <span className="text-[11px]">—</span>
                      )}
                    </td>

                    {/* Actions Column */}
                    <td className="px-4 py-3.5 align-top text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="inline-flex h-7 items-center gap-1 rounded border border-[#30363d] px-2 text-[11px] font-semibold text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#58a6ff]"
                        >
                          <Edit3 className="size-3" aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(item)}
                          className="inline-flex h-7 items-center gap-1 rounded border border-[#6e2a35] px-2 text-[11px] font-semibold text-[#C58F61] transition-colors hover:bg-[#6e2a35]/20"
                        >
                          <Trash2 className="size-3" aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {visibleRows.length === 0 && (
              <div className="py-16 text-center text-sm text-[#8b949e]">
                No rows match this collection.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Slide-over Drawer / Editor Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs">
          <div className="relative flex h-full w-full max-w-lg flex-col border-l border-[#30363d] bg-[#161b22] shadow-2xl">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-[#30363d] px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-[#f0f6fc]">
                  {editing ? `Edit: ${editing.id}` : `New ${definition.label} Row`}
                </h3>
                <p className="text-xs text-[#8b949e]">Fill in the fields below to update the dataset.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="rounded-md p-1.5 text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]"
                aria-label="Close editor"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            {/* Form Fields */}
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {definition.fields.map((field) => {
                const value = form[field.key] ?? defaultValue(field);
                if (field.kind === "boolean") {
                  return (
                    <label key={field.key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#30363d] bg-[#0d1117] p-3 text-xs font-semibold text-[#c9d1d9]">
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(event) => updateField(field, event.target.checked)}
                        className="size-4 accent-[#7CA8D0]"
                      />
                      <span>{field.label}</span>
                    </label>
                  );
                }
                return (
                  <label key={field.key} className="block space-y-1.5">
                    <span className="block text-xs font-semibold text-[#c9d1d9]">
                      {field.label}
                      {field.required && <span className="ml-1 text-[#C58F61]">*</span>}
                    </span>
                    {field.kind === "textarea" || field.kind === "json" ? (
                      <textarea
                        value={String(value)}
                        onChange={(event) => updateField(field, event.target.value)}
                        rows={field.kind === "json" ? 6 : 4}
                        className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 font-mono text-xs leading-relaxed text-[#f0f6fc] outline-none focus:border-[#58a6ff]"
                      />
                    ) : (
                      <input
                        type={field.kind === "number" ? "number" : "text"}
                        value={String(value)}
                        onChange={(event) =>
                          updateField(field, field.kind === "number" ? Number(event.target.value) : event.target.value)
                        }
                        className="h-9 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-xs text-[#f0f6fc] outline-none focus:border-[#58a6ff]"
                      />
                    )}
                  </label>
                );
              })}
            </div>

            {/* Drawer Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-[#30363d] bg-[#0d1117] px-6 py-4">
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="rounded-md px-4 py-2 text-xs font-semibold text-[#8b949e] hover:text-[#f0f6fc]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={isSaving}
                className="inline-flex h-9 items-center justify-center rounded-md bg-[#238636] px-5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#2ea043] disabled:opacity-60"
              >
                {isSaving ? "Saving..." : editing ? "Save Changes" : "Create Row"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
