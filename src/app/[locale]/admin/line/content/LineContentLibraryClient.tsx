"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Archive, ChevronDown, ChevronUp, Code2, Copy, ImageIcon, Plus, Save, Send, Trash2, Type, Undo2 } from "@/components/ui/icons";
import {
  archiveLineContent,
  duplicateLineContent,
  getLineContentHistory,
  getLineContentUsageReferences,
  listLineContent,
  publishLineContent,
  saveLineContentDraft,
  type LineContentItemDto,
} from "@/app/actions/lineContent";
import {
  DEFAULT_LINE_CONTENT_DOCUMENT,
  lineContentDocumentSchema,
  type LineAction,
  type LineContentComponent,
  type LineContentDocument,
  type LineContentType,
} from "@/lib/lineContentSchema";
import { AdminDataTable, AdminEmptyState, AdminErrorState, AdminFilterToolbar, AdminPublishSummary, AdminSaveStatus, AdminStatusBadge } from "@/components/admin/AdminPrimitives";

type ContentLocale = "th" | "en";
type SaveState = "saved" | "saving" | "unsaved" | "error";
type HistoryItem = { id: string; version: number; state: string; createdAt: string; createdByUserId: string | null };
type UsageReference = { kind: "automation" | "difyFallback"; id: string; label: string; status: string };

const componentTypeLabels: Record<LineContentComponent["type"], string> = {
  text: "textComponent",
  image: "imageComponent",
  button: "buttonComponent",
  quickReplies: "quickRepliesComponent",
  carousel: "carouselComponent",
};

function newId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`;
}

function createComponent(type: LineContentComponent["type"]): LineContentComponent {
  if (type === "text") return { id: newId("text"), type, text: "New text", weight: "regular" };
  if (type === "image") return { id: newId("image"), type, url: "https://example.com/image.jpg", altText: "Describe this image" };
  if (type === "button") return { id: newId("button"), type, label: "Open", action: { type: "uri", uri: "https://example.com" } };
  if (type === "quickReplies") return { id: newId("quick-replies"), type, items: [{ id: newId("reply"), label: "Tell me more", action: { type: "message", text: "Tell me more" } }] };
  return { id: newId("carousel"), type, columns: [{ id: newId("card"), title: "Example card", text: "Replace this example with approved content.", button: { label: "Open", action: { type: "uri", uri: "https://example.com" } } }] };
}

function emptyEditor(locale: ContentLocale): LineContentItemDto {
  const now = new Date().toISOString();
  return { id: "", internalName: "New content draft", contentType: "TEXT", category: "General", tags: [], locale, status: "DRAFT", thumbnailUrl: null, draftDocument: DEFAULT_LINE_CONTENT_DOCUMENT, publishedDocument: null, draftVersion: 1, publishedVersion: null, rowVersion: 1, createdAt: now, updatedAt: now };
}

function actionValue(action: LineAction) {
  if (action.type === "message") return action.text;
  if (action.type === "uri") return action.uri;
  return action.data;
}

export default function LineContentLibraryClient({
  locale,
  initialItems,
  initialError,
}: {
  locale: ContentLocale;
  initialItems: LineContentItemDto[];
  initialError: string | null;
}) {
  const t = useTranslations("AdminLineContent");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState(searchParams.get("query") || "");
  const [status, setStatus] = useState<"all" | "DRAFT" | "PUBLISHED" | "ARCHIVED">((searchParams.get("status") as "all" | "DRAFT" | "PUBLISHED" | "ARCHIVED") || "all");
  const [selected, setSelected] = useState<LineContentItemDto | null>(null);
  const [document, setDocument] = useState<LineContentDocument | null>(null);
  const [contentType, setContentType] = useState<LineContentType>("TEXT");
  const [internalName, setInternalName] = useState("");
  const [category, setCategory] = useState("General");
  const [tags, setTags] = useState("");
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<LineContentDocument[]>([]);
  const [redoStack, setRedoStack] = useState<LineContentDocument[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [usageReferences, setUsageReferences] = useState<UsageReference[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedJson, setAdvancedJson] = useState("");
  const [advancedError, setAdvancedError] = useState<string | null>(null);
  const [isFiltering, startFiltering] = useTransition();
  const [isSaving, startSaving] = useTransition();

  const selectedComponent = useMemo(() => document?.components.find((component) => component.id === selectedComponentId) ?? document?.components[0] ?? null, [document, selectedComponentId]);

  const loadItems = useCallback((nextQuery: string, nextStatus: typeof status) => {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("query", nextQuery.trim());
    if (nextStatus !== "all") params.set("status", nextStatus);
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
    startFiltering(async () => {
      const result = await listLineContent({ query: nextQuery, status: nextStatus, locale });
      if (result.success) setItems(result.items);
      else toast.error(result.error);
    });
  }, [locale, pathname, router, startFiltering]);

  const selectItem = useCallback((item: LineContentItemDto) => {
    setSelected(item);
    setDocument(item.draftDocument);
    setContentType(item.contentType);
    setInternalName(item.internalName);
    setCategory(item.category);
    setTags(item.tags.join(", "));
    setSelectedComponentId(item.draftDocument.components[0]?.id ?? null);
    setUndoStack([]);
    setRedoStack([]);
    setSaveState("saved");
    setAdvancedJson(JSON.stringify(item.draftDocument, null, 2));
    setAdvancedError(null);
    if (item.id) {
      void getLineContentHistory(item.id).then((result) => setHistory(result.success ? result.versions : []));
      void getLineContentUsageReferences(item.id).then((result) => setUsageReferences(result.success ? result.references : []));
    } else {
      setHistory([]);
      setUsageReferences([]);
    }
  }, []);

  const createNew = () => selectItem(emptyEditor(locale));

  const updateDocument = useCallback((updater: (current: LineContentDocument) => LineContentDocument) => {
    setDocument((current) => {
      if (!current) return current;
      setUndoStack((stack) => [...stack.slice(-19), current]);
      setRedoStack([]);
      const next = updater(current);
      setAdvancedJson(JSON.stringify(next, null, 2));
      setSaveState("unsaved");
      return next;
    });
  }, []);

  const replaceSelectedComponent = useCallback((next: LineContentComponent) => {
    updateDocument((current) => ({ ...current, components: current.components.map((component) => component.id === next.id ? next : component) }));
  }, [updateDocument]);

  const moveComponent = (direction: -1 | 1) => {
    if (!document || !selectedComponent) return;
    const index = document.components.findIndex((component) => component.id === selectedComponent.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= document.components.length) return;
    updateDocument((current) => {
      const components = [...current.components];
      [components[index], components[nextIndex]] = [components[nextIndex], components[index]];
      return { ...current, components };
    });
  };

  const removeSelectedComponent = () => {
    if (!document || !selectedComponent || document.components.length <= 1) return;
    const remaining = document.components.filter((component) => component.id !== selectedComponent.id);
    updateDocument((current) => ({ ...current, components: remaining }));
    setSelectedComponentId(remaining[0]?.id ?? null);
  };

  const saveDraft = useCallback(async (silent = false) => {
    if (!document) return;
    setSaveState("saving");
    const result = await saveLineContentDraft({ id: selected?.id || undefined, internalName, contentType, category, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), locale, document, expectedRowVersion: selected?.id ? selected.rowVersion : undefined });
    if (!result.success) {
      setSaveState("error");
      if (!silent) toast.error(result.error);
      return;
    }
    setSelected(result.item);
    setItems((current) => current.some((item) => item.id === result.item.id) ? current.map((item) => item.id === result.item.id ? result.item : item) : [result.item, ...current]);
    setSaveState("saved");
    if (!silent) toast.success(t("saved"));
  }, [category, contentType, document, internalName, locale, selected, t, tags]);

  useEffect(() => {
    if (!selected?.id || saveState !== "unsaved") return;
    const timer = window.setTimeout(() => { void saveDraft(true); }, 1200);
    return () => window.clearTimeout(timer);
  }, [saveDraft, saveState, selected?.id]);

  const publish = () => {
    if (!selected?.id) {
      toast.error(t("save"));
      return;
    }
    startSaving(async () => {
      const result = await publishLineContent(selected.id, selected.rowVersion);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSelected(result.item);
      setItems((current) => current.map((item) => item.id === result.item.id ? result.item : item));
      setSaveState("saved");
      toast.success(t("published"));
    });
  };

  const duplicate = () => {
    if (!selected?.id) return;
    startSaving(async () => {
      const result = await duplicateLineContent(selected.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setItems((current) => [result.item, ...current]);
      selectItem(result.item);
      toast.success(t("duplicate"));
    });
  };

  const archive = () => {
    if (!selected?.id || !window.confirm(t("archiveConfirm"))) return;
    startSaving(async () => {
      const result = await archiveLineContent(selected.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setItems((current) => current.filter((item) => item.id !== selected.id));
      setSelected(null);
      setDocument(null);
      toast.success(t("archive"));
    });
  };

  const applyAdvancedJson = () => {
    try {
      const parsed = lineContentDocumentSchema.safeParse(JSON.parse(advancedJson) as unknown);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || t("invalidJson"));
      updateDocument(() => parsed.data);
      setAdvancedError(null);
    } catch (error: unknown) {
      setAdvancedError(error instanceof Error ? error.message : t("invalidJson"));
    }
  };

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!document || !previous) return;
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, document]);
    setDocument(previous);
    setAdvancedJson(JSON.stringify(previous, null, 2));
    setSaveState("unsaved");
  };

  const redo = () => {
    const next = redoStack.at(-1);
    if (!document || !next) return;
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, document]);
    setDocument(next);
    setAdvancedJson(JSON.stringify(next, null, 2));
    setSaveState("unsaved");
  };

  return (
    <div data-bagui="line-content-library" className="space-y-4">
      {initialError ? <AdminErrorState title={t("saveError")} description={initialError} /> : null}
      <AdminFilterToolbar resultLabel={t("results", { count: items.length })} onClear={() => { setQuery(""); setStatus("all"); loadItems("", "all"); }} clearLabel={t("all")}>
        <label className="min-w-[14rem] flex-1 text-xs font-semibold text-[var(--solar-ops-body)]">
          <span className="mb-1.5 block">{t("search")}</span>
          <input value={query} onChange={(event) => { setQuery(event.target.value); loadItems(event.target.value, status); }} placeholder={t("searchPlaceholder")} className="w-full px-3 text-sm" />
        </label>
        <label className="min-w-40 text-xs font-semibold text-[var(--solar-ops-body)]">
          <span className="mb-1.5 block">{t("status")}</span>
          <select value={status} onChange={(event) => { const next = event.target.value as typeof status; setStatus(next); loadItems(query, next); }} className="w-full px-3 text-sm">
            <option value="all">{t("all")}</option><option value="DRAFT">{t("unsaved")}</option><option value="PUBLISHED">{t("published")}</option><option value="ARCHIVED">{t("archive")}</option>
          </select>
        </label>
        <span className="text-xs text-[var(--solar-ops-muted)]" aria-live="polite">{isFiltering ? t("saving") : ""}</span>
      </AdminFilterToolbar>

      <div className="flex justify-end">
        <button type="button" onClick={createNew} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--solar-ops-green)] px-3.5 text-sm font-semibold text-white hover:bg-[var(--solar-ops-green-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--solar-ops-blue)]"><Plus className="size-4" aria-hidden="true" />{t("newContent")}</button>
      </div>

      {!items.length && !selected ? <AdminEmptyState title={t("emptyTitle")} description={t("emptyDescription")} action={<button type="button" onClick={createNew} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--solar-ops-green)] px-3.5 text-sm font-semibold text-white hover:bg-[var(--solar-ops-green-hover)]"><Plus className="size-4" aria-hidden="true" />{t("newContent")}</button>} /> : null}
      {items.length ? (
        <AdminDataTable
          rows={items}
          caption={t("library")}
          columns={[
            { key: "name", label: t("internalName"), render: (item) => <button type="button" onClick={() => selectItem(item)} className="text-left font-semibold text-[var(--solar-ops-text)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--solar-ops-blue)]">{item.internalName}</button> },
            { key: "type", label: t("contentType"), render: (item) => <span>{t(`types.${item.contentType}`)}</span> },
            { key: "locale", label: t("locale"), render: (item) => <span className="font-mono uppercase">{item.locale}</span> },
            { key: "status", label: t("status"), render: (item) => <AdminStatusBadge value={item.status === "DRAFT" ? t("unsaved") : item.status === "PUBLISHED" ? t("published") : t("archive")} /> },
            { key: "updated", label: t("history"), render: (item) => <time dateTime={item.updatedAt} className="text-xs text-[var(--solar-ops-muted)]">{new Date(item.updatedAt).toLocaleString(locale)}</time> },
          ]}
        />
      ) : null}

      {selected && document ? (
        <section aria-labelledby="line-content-editor-heading" className="grid gap-4 xl:grid-cols-[minmax(12rem,0.22fr)_minmax(18rem,0.44fr)_minmax(18rem,0.34fr)]">
          <aside className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-3">
            <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("components")}</h2><button type="button" onClick={() => updateDocument((current) => ({ ...current, components: [...current.components, createComponent("text")] }))} className="rounded-md p-2 text-[var(--solar-ops-blue)] hover:bg-[var(--solar-ops-hover)]" aria-label={t("addComponent")}><Plus className="size-4" aria-hidden="true" /></button></div>
            <div className="mt-3 space-y-1">
              {document.components.map((component) => {
                const Icon = component.type === "text" ? Type : component.type === "image" ? ImageIcon : component.type === "button" ? Send : component.type === "carousel" ? Copy : Plus;
                return <button key={component.id} type="button" onClick={() => setSelectedComponentId(component.id)} className={`flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium ${selectedComponent?.id === component.id ? "bg-[var(--solar-ops-hover)] text-[var(--solar-ops-text)]" : "text-[var(--solar-ops-muted)] hover:bg-[var(--solar-ops-hover)] hover:text-[var(--solar-ops-body)]"}`}><Icon className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{t(componentTypeLabels[component.type])}</span></button>;
              })}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-1 border-t border-[var(--solar-ops-border)] pt-3">
              <button type="button" onClick={() => moveComponent(-1)} className="flex min-h-9 items-center justify-center rounded-md border border-[var(--solar-ops-border)] text-[var(--solar-ops-muted)] hover:bg-[var(--solar-ops-hover)]" aria-label={t("moveUp")}><ChevronUp className="size-4" aria-hidden="true" /></button>
              <button type="button" onClick={() => moveComponent(1)} className="flex min-h-9 items-center justify-center rounded-md border border-[var(--solar-ops-border)] text-[var(--solar-ops-muted)] hover:bg-[var(--solar-ops-hover)]" aria-label={t("moveDown")}><ChevronDown className="size-4" aria-hidden="true" /></button>
              <button type="button" onClick={removeSelectedComponent} className="flex min-h-9 items-center justify-center rounded-md border border-[#f85149]/40 text-[#ff7b72] hover:bg-[#f85149]/10" aria-label={t("remove")}><Trash2 className="size-4" aria-hidden="true" /></button>
            </div>
          </aside>

          <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4">
            <div className="flex items-start justify-between gap-3"><div><h2 id="line-content-editor-heading" className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("editor")}</h2><p className="mt-1 text-xs text-[var(--solar-ops-muted)]">{t("exampleNotice")}</p></div><AdminSaveStatus state={saveState} label={saveState === "saving" ? t("saving") : saveState === "saved" ? t("saved") : saveState === "error" ? t("saveError") : t("unsaved")} /></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("internalName")}</span><input value={internalName} onChange={(event) => { setInternalName(event.target.value); setSaveState("unsaved"); }} placeholder={t("internalNamePlaceholder")} className="w-full px-3 text-sm" /></label>
              <label className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("contentType")}</span><select value={contentType} onChange={(event) => { setContentType(event.target.value as LineContentType); setSaveState("unsaved"); }} className="w-full px-3 text-sm">{(["TEXT", "IMAGE", "RICH_FLEX", "CAROUSEL", "QUICK_REPLY"] as const).map((type) => <option key={type} value={type}>{t(`types.${type}`)}</option>)}</select></label>
              <label className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("category")}</span><input value={category} onChange={(event) => { setCategory(event.target.value); setSaveState("unsaved"); }} placeholder={t("categoryPlaceholder")} className="w-full px-3 text-sm" /></label>
              <label className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("tags")}</span><input value={tags} onChange={(event) => { setTags(event.target.value); setSaveState("unsaved"); }} placeholder={t("tagsPlaceholder")} className="w-full px-3 text-sm" /></label>
            </div>
            <div className="mt-5 border-t border-[var(--solar-ops-border)] pt-4">
              <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold text-[var(--solar-ops-muted)]">{t("variables")}</h3><button type="button" onClick={() => updateDocument((current) => ({ ...current, variables: [...current.variables, { name: `variable_${current.variables.length + 1}`, fallback: "", description: "" }] }))} className="text-xs font-semibold text-[var(--solar-ops-blue)]">+ {t("addVariable")}</button></div>
              <div className="mt-3 space-y-2">{document.variables.map((variable, index) => <div key={`${variable.name}-${index}`} className="grid gap-2 rounded-md border border-[var(--solar-ops-border)] p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto]"><label className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1 block">{t("variableName")}</span><input value={variable.name} onChange={(event) => updateDocument((current) => ({ ...current, variables: current.variables.map((entry, entryIndex) => entryIndex === index ? { ...entry, name: event.target.value } : entry) }))} className="w-full px-2.5 text-sm" /></label><label className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1 block">{t("variableFallback")}</span><input value={variable.fallback} onChange={(event) => updateDocument((current) => ({ ...current, variables: current.variables.map((entry, entryIndex) => entryIndex === index ? { ...entry, fallback: event.target.value } : entry) }))} className="w-full px-2.5 text-sm" /></label><button type="button" onClick={() => updateDocument((current) => ({ ...current, variables: current.variables.filter((_entry, entryIndex) => entryIndex !== index) }))} className="self-end rounded-md p-2 text-[#ff7b72] hover:bg-[#f85149]/10" aria-label={t("removeVariable")}><Trash2 className="size-4" aria-hidden="true" /></button></div>)}</div>
              <p className="mt-2 text-[11px] leading-5 text-[var(--solar-ops-muted)]">{t("variableHint")}</p>
            </div>
            <div className="mt-5 border-t border-[var(--solar-ops-border)] pt-4">
              <h3 className="text-xs font-semibold text-[var(--solar-ops-muted)]">{t("properties")}</h3>
              {selectedComponent?.type === "text" ? <div className="mt-3 space-y-3"><label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("text")}</span><textarea value={selectedComponent.text} onChange={(event) => replaceSelectedComponent({ ...selectedComponent, text: event.target.value })} className="w-full px-3 py-2 text-sm" rows={5} /></label><label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("weight")}</span><select value={selectedComponent.weight} onChange={(event) => replaceSelectedComponent({ ...selectedComponent, weight: event.target.value as "regular" | "bold" })} className="w-full px-3 text-sm"><option value="regular">{t("regular")}</option><option value="bold">{t("bold")}</option></select></label></div> : null}
              {selectedComponent?.type === "image" ? <div className="mt-3 space-y-3"><label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("imageUrl")}</span><input value={selectedComponent.url} onChange={(event) => replaceSelectedComponent({ ...selectedComponent, url: event.target.value })} className="w-full px-3 text-sm" /></label><label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("altText")}</span><input value={selectedComponent.altText} onChange={(event) => replaceSelectedComponent({ ...selectedComponent, altText: event.target.value })} className="w-full px-3 text-sm" /></label></div> : null}
              {selectedComponent?.type === "button" ? <div className="mt-3 space-y-3"><label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("buttonLabel")}</span><input value={selectedComponent.label} onChange={(event) => replaceSelectedComponent({ ...selectedComponent, label: event.target.value })} className="w-full px-3 text-sm" /></label><ActionEditor action={selectedComponent.action} onChange={(action) => replaceSelectedComponent({ ...selectedComponent, action })} t={t} /></div> : null}
              {selectedComponent?.type === "quickReplies" ? <QuickRepliesEditor component={selectedComponent} onChange={replaceSelectedComponent} t={t} /> : null}
              {selectedComponent?.type === "carousel" ? <CarouselEditor component={selectedComponent} onChange={replaceSelectedComponent} t={t} /> : null}
            </div>
            <div className="mt-5 border-t border-[var(--solar-ops-border)] pt-4"><button type="button" onClick={() => setAdvancedOpen((open) => !open)} className="flex min-h-9 items-center gap-2 text-xs font-semibold text-[var(--solar-ops-muted)] hover:text-[var(--solar-ops-text)]"><Code2 className="size-3.5" aria-hidden="true" />{t("advanced")}</button>{advancedOpen ? <div className="mt-3 space-y-2"><textarea value={advancedJson} onChange={(event) => setAdvancedJson(event.target.value)} className="min-h-56 w-full rounded-md border border-[var(--solar-ops-border)] bg-[var(--solar-ops-workspace)] p-3 font-mono text-xs text-[var(--solar-ops-body)]" aria-label={t("advanced")} />{advancedError ? <p className="text-xs text-[#ff7b72]" role="alert">{advancedError}</p> : null}<button type="button" onClick={applyAdvancedJson} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-xs font-semibold text-[var(--solar-ops-body)] hover:bg-[var(--solar-ops-hover)]">{t("applyJson")}</button></div> : null}</div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("preview")}</h2><div className="mx-auto mt-4 max-w-[290px] rounded-[2rem] border-4 border-[#30363d] bg-[#0d1117] p-2 shadow-lg"><div className="rounded-[1.5rem] bg-[#f6f8fa] p-3 text-[#1f2328]"><div className="mb-3 h-1 w-12 rounded-full bg-[#8c959f] mx-auto" />{document.components.map((component) => <PreviewComponent key={component.id} component={component} t={t} />)}</div></div></div>
            <AdminPublishSummary draftVersion={selected.draftVersion} publishedVersion={selected.publishedVersion} status={selected.status === "PUBLISHED" ? t("published") : t("notPublished")} note={t("publishNote")} />
            <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><div className="flex flex-wrap gap-2"><button type="button" onClick={undo} disabled={!undoStack.length} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-xs font-semibold text-[var(--solar-ops-body)] disabled:opacity-40"><Undo2 className="size-3.5" aria-hidden="true" />Undo</button><button type="button" onClick={redo} disabled={!redoStack.length} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-xs font-semibold text-[var(--solar-ops-body)] disabled:opacity-40"><Undo2 className="size-3.5 rotate-180" aria-hidden="true" />Redo</button><button type="button" onClick={() => startSaving(() => { void saveDraft(false); })} disabled={isSaving} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--solar-ops-green)] px-3 text-xs font-semibold text-white disabled:opacity-50"><Save className="size-3.5" aria-hidden="true" />{t("save")}</button><button type="button" onClick={publish} disabled={isSaving || !selected.id} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#3fb950]/50 px-3 text-xs font-semibold text-[#7ee787] disabled:opacity-50"><Send className="size-3.5" aria-hidden="true" />{t("publish")}</button></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={duplicate} disabled={!selected.id || isSaving} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-xs font-semibold text-[var(--solar-ops-muted)] disabled:opacity-50"><Copy className="size-3.5" aria-hidden="true" />{t("duplicate")}</button><button type="button" onClick={archive} disabled={!selected.id || isSaving} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#f85149]/40 px-3 text-xs font-semibold text-[#ff7b72] disabled:opacity-50"><Archive className="size-3.5" aria-hidden="true" />{t("archive")}</button></div></div>
             <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("history")}</h2>{history.length ? <ul className="mt-3 space-y-2">{history.map((version) => <li key={version.id} className="flex items-center justify-between gap-3 text-xs text-[var(--solar-ops-muted)]"><span>v{version.version} · {version.state}</span><time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleDateString(locale)}</time></li>)}</ul> : <p className="mt-2 text-xs leading-5 text-[var(--solar-ops-muted)]">{t("historyUnavailable")}</p>}</div>
             <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("usageReferences")}</h2>{usageReferences.length ? <ul className="mt-3 space-y-2">{usageReferences.map((reference) => <li key={`${reference.kind}-${reference.id}`} className="flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate text-[var(--solar-ops-body)]">{reference.label}<span className="ml-1 text-[var(--solar-ops-muted)]">· {t(`usageKinds.${reference.kind}`)}</span></span><AdminStatusBadge value={reference.status} /></li>)}</ul> : <p className="mt-2 text-xs leading-5 text-[var(--solar-ops-muted)]">{t("noUsageReferences")}</p>}</div>
          </div>
        </section>
      ) : null}
      {!selected && items.length ? <AdminEmptyState title={t("selectItem")} description={t("selectItemDescription")} action={<button type="button" onClick={createNew} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-sm font-semibold text-[var(--solar-ops-body)] hover:bg-[var(--solar-ops-hover)]"><Plus className="size-4" aria-hidden="true" />{t("newContent")}</button>} /> : null}
    </div>
  );
}

function ActionEditor({ action, onChange, t }: { action: LineAction; onChange: (action: LineAction) => void; t: (key: string) => string }) {
  return <div className="space-y-3"><label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("actionType")}</span><select value={action.type} onChange={(event) => { const type = event.target.value as LineAction["type"]; onChange(type === "message" ? { type, text: "New message" } : type === "uri" ? { type, uri: "https://example.com" } : { type, data: "event" }); }} className="w-full px-3 text-sm"><option value="message">{t("messageAction")}</option><option value="uri">{t("uriAction")}</option><option value="postback">{t("postbackAction")}</option></select></label><label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("actionValue")}</span><input value={actionValue(action)} onChange={(event) => { const value = event.target.value; onChange(action.type === "message" ? { ...action, text: value } : action.type === "uri" ? { ...action, uri: value } : { ...action, data: value }); }} className="w-full px-3 text-sm" /></label></div>;
}

function QuickRepliesEditor({ component, onChange, t }: { component: Extract<LineContentComponent, { type: "quickReplies" }>; onChange: (component: LineContentComponent) => void; t: (key: string) => string }) {
  return <div className="mt-3 space-y-3"><h4 className="text-xs font-semibold text-[var(--solar-ops-body)]">{t("quickReplyItems")}</h4>{component.items.map((item, index) => <div key={item.id} className="space-y-2 rounded-md border border-[var(--solar-ops-border)] p-3"><input value={item.label} onChange={(event) => onChange({ ...component, items: component.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, label: event.target.value } : entry) })} className="w-full px-3 text-sm" aria-label={`${t("buttonLabel")} ${index + 1}`} /><ActionEditor action={item.action} onChange={(action) => onChange({ ...component, items: component.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, action } : entry) })} t={t} /></div>)}<button type="button" onClick={() => onChange({ ...component, items: [...component.items, { id: newId("reply"), label: "New reply", action: { type: "message", text: "New reply" } }] })} className="text-xs font-semibold text-[var(--solar-ops-blue)]">+ {t("addQuickReply")}</button></div>;
}

function CarouselEditor({ component, onChange, t }: { component: Extract<LineContentComponent, { type: "carousel" }>; onChange: (component: LineContentComponent) => void; t: (key: string) => string }) {
  return <div className="mt-3 space-y-3"><h4 className="text-xs font-semibold text-[var(--solar-ops-body)]">{t("carouselColumns")}</h4>{component.columns.map((column, index) => <div key={column.id} className="space-y-2 rounded-md border border-[var(--solar-ops-border)] p-3"><input value={column.title} onChange={(event) => onChange({ ...component, columns: component.columns.map((entry, itemIndex) => itemIndex === index ? { ...entry, title: event.target.value } : entry) })} placeholder={t("cardTitle")} className="w-full px-3 text-sm" /><textarea value={column.text} onChange={(event) => onChange({ ...component, columns: component.columns.map((entry, itemIndex) => itemIndex === index ? { ...entry, text: event.target.value } : entry) })} placeholder={t("cardText")} className="w-full px-3 py-2 text-sm" rows={3} /></div>)}<button type="button" onClick={() => onChange({ ...component, columns: [...component.columns, { id: newId("card"), title: "New card", text: "Replace this example with approved content." }] })} className="text-xs font-semibold text-[var(--solar-ops-blue)]">+ {t("addCarouselColumn")}</button></div>;
}

function PreviewComponent({ component, t }: { component: LineContentComponent; t: (key: string) => string }) {
  if (component.type === "text") return <p className={`mb-2 whitespace-pre-wrap text-sm ${component.weight === "bold" ? "font-bold" : "font-normal"}`}>{component.text || " "}</p>;
  if (component.type === "image") return <div role="img" aria-label={component.altText} className="mb-2 flex min-h-24 items-center justify-center rounded-lg bg-[#d0d7de] p-3 text-center text-xs text-[#57606a]">{component.altText}<span className="mt-1 block truncate">{component.url}</span></div>;
  if (component.type === "button") return <div className="mb-2 rounded-md bg-[#238636] px-3 py-2 text-center text-xs font-semibold text-white">{component.label}</div>;
  if (component.type === "quickReplies") return <div className="mb-2 flex flex-wrap gap-1">{component.items.map((item) => <span key={item.id} className="rounded-full border border-[#0969da] px-2 py-1 text-[10px] text-[#0969da]">{item.label}</span>)}</div>;
  return <div className="mb-2 grid gap-2">{component.columns.map((column) => <div key={column.id} className="rounded-md border border-[#d0d7de] p-2"><p className="text-xs font-bold">{column.title}</p><p className="mt-1 text-[11px] text-[#57606a]">{column.text}</p>{column.button ? <div className="mt-2 rounded bg-[#0969da] px-2 py-1 text-center text-[10px] font-semibold text-white">{column.button.label}</div> : null}</div>)}<span className="sr-only">{t("carouselComponent")}</span></div>;
}
