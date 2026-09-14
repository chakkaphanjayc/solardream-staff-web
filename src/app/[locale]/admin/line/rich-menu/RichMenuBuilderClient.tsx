"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ImageIcon,
  Plus,
  Save,
  Send,
  Trash2,
} from "@/components/ui/icons";
import {
  archiveLineRichMenu,
  getLineRichMenuHistory,
  publishLineRichMenu,
  rollbackLineRichMenu,
  saveLineRichMenuDraft,
  uploadLineRichMenuArtwork,
  type LineRichMenuDefinitionDto,
} from "@/app/actions/lineRichMenu";
import {
  DEFAULT_LINE_RICH_MENU_DOCUMENT,
  RICH_MENU_CANVAS,
  type LineRichMenuAction,
  type LineRichMenuArea,
  type LineRichMenuDocument,
} from "@/lib/lineRichMenuSchema";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminErrorState,
  AdminPublishSummary,
  AdminSaveStatus,
  AdminStatusBadge,
} from "@/components/admin/AdminPrimitives";

type SaveState = "saved" | "saving" | "unsaved" | "error";
type HistoryItem = { id: string; version: number; state: string; lineRichMenuId: string | null; createdAt: string };

function newId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`;
}

function emptyDefinition(): LineRichMenuDefinitionDto {
  const now = new Date().toISOString();
  return {
    id: "",
    internalName: "New Rich Menu draft",
    audience: "DEFAULT",
    isDefault: false,
    status: "DRAFT",
    artworkUrl: null,
    draftDocument: DEFAULT_LINE_RICH_MENU_DOCUMENT,
    publishedDocument: null,
    lineRichMenuId: null,
    previousLineRichMenuId: null,
    draftVersion: 1,
    publishedVersion: null,
    rowVersion: 1,
    updatedAt: now,
  };
}

function makeArea(index: number): LineRichMenuArea {
  const placements = [
    { x: 1250, y: 0 },
    { x: 0, y: 843 },
    { x: 1250, y: 843 },
  ];
  const placement = placements[index % placements.length] ?? placements[0];
  return {
    id: newId(`area-${index + 1}`),
    label: "Example action",
    bounds: { x: placement.x, y: placement.y, width: 1250, height: 843 },
    action: { type: "message", text: "Example action" },
  };
}

function actionValue(action: LineRichMenuAction) {
  if (action.type === "message") return action.text;
  if (action.type === "uri") return action.uri;
  if (action.type === "postback") return action.data;
  return action.richMenuAliasId;
}

export default function RichMenuBuilderClient({
  locale,
  timezone,
  initialDefinitions,
  initialError,
}: {
  locale: string;
  timezone: string;
  initialDefinitions: LineRichMenuDefinitionDto[];
  initialError: string | null;
}) {
  const t = useTranslations("AdminRichMenu");
  const [definitions, setDefinitions] = useState(initialDefinitions);
  const [selected, setSelected] = useState<LineRichMenuDefinitionDto | null>(null);
  const [document, setDocument] = useState<LineRichMenuDocument | null>(null);
  const [internalName, setInternalName] = useState("");
  const [audience, setAudience] = useState("DEFAULT");
  const [isDefault, setIsDefault] = useState(false);
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [isSaving, startSaving] = useTransition();
  const [isUploading, startUploading] = useTransition();

  const selectedArea = useMemo(
    () => document?.areas.find((area) => area.id === selectedAreaId) ?? document?.areas[0] ?? null,
    [document, selectedAreaId],
  );

  const selectDefinition = useCallback((definition: LineRichMenuDefinitionDto) => {
    setSelected(definition);
    setDocument(definition.draftDocument);
    setInternalName(definition.internalName);
    setAudience(definition.audience);
    setIsDefault(definition.isDefault);
    setArtworkUrl(definition.artworkUrl);
    setSelectedAreaId(definition.draftDocument.areas[0]?.id ?? null);
    setSaveState("saved");
    void getLineRichMenuHistory(definition.id).then((result) => setHistory(result.success ? result.versions : []));
  }, []);

  const createNew = () => selectDefinition(emptyDefinition());

  const updateDocument = useCallback((updater: (current: LineRichMenuDocument) => LineRichMenuDocument) => {
    setDocument((current) => {
      if (!current) return current;
      setSaveState("unsaved");
      return updater(current);
    });
  }, []);

  const replaceSelectedArea = useCallback((next: LineRichMenuArea) => {
    updateDocument((current) => ({
      ...current,
      areas: current.areas.map((area) => (area.id === next.id ? next : area)),
    }));
  }, [updateDocument]);

  const addArea = () => {
    if (!document || document.areas.length >= 20) return;
    const nextArea = makeArea(document.areas.length);
    updateDocument((current) => ({ ...current, areas: [...current.areas, nextArea] }));
    setSelectedAreaId(nextArea.id);
  };

  const removeArea = () => {
    if (!document || !selectedArea || document.areas.length <= 1) return;
    const remaining = document.areas.filter((area) => area.id !== selectedArea.id);
    updateDocument((current) => ({ ...current, areas: remaining }));
    setSelectedAreaId(remaining[0]?.id ?? null);
  };

  const moveArea = (direction: -1 | 1) => {
    if (!document || !selectedArea) return;
    const index = document.areas.findIndex((area) => area.id === selectedArea.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= document.areas.length) return;
    updateDocument((current) => {
      const areas = [...current.areas];
      [areas[index], areas[nextIndex]] = [areas[nextIndex], areas[index]];
      return { ...current, areas };
    });
  };

  const saveDraft = () => {
    if (!document) return;
    startSaving(async () => {
      setSaveState("saving");
      const result = await saveLineRichMenuDraft({
        id: selected?.id || undefined,
        internalName,
        audience,
        isDefault,
        artworkUrl,
        document,
        expectedRowVersion: selected?.id ? selected.rowVersion : undefined,
      });
      if (!result.success) {
        setSaveState("error");
        toast.error(result.error);
        return;
      }
      setSelected(result.definition);
      setDefinitions((current) => current.some((item) => item.id === result.definition.id)
        ? current.map((item) => (item.id === result.definition.id ? result.definition : item))
        : [result.definition, ...current]);
      setSaveState("saved");
      toast.success(t("saved"));
    });
  };

  const publish = () => {
    if (!selected?.id) {
      toast.error(t("saveBeforePublish"));
      return;
    }
    startSaving(async () => {
      const result = await publishLineRichMenu(selected.id, selected.rowVersion);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSelected(result.definition);
      setDefinitions((current) => current.map((item) => (item.id === result.definition.id ? result.definition : item)));
      toast.success(t("published"));
    });
  };

  const rollback = () => {
    if (!selected?.id || !selected.previousLineRichMenuId || !window.confirm(t("rollbackConfirm"))) return;
    startSaving(async () => {
      const result = await rollbackLineRichMenu(selected.id, selected.rowVersion);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSelected(result.definition);
      setDefinitions((current) => current.map((item) => (item.id === result.definition.id ? result.definition : item)));
      setDocument(result.definition.draftDocument);
      toast.success(t("rolledBack"));
    });
  };

  const archive = () => {
    if (!selected?.id || !window.confirm(t("archiveConfirm"))) return;
    startSaving(async () => {
      const result = await archiveLineRichMenu(selected.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setDefinitions((current) => current.filter((item) => item.id !== selected.id));
      setSelected(null);
      setDocument(null);
      toast.success(t("archived"));
    });
  };

  const uploadArtwork = (file: File | undefined) => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    startUploading(async () => {
      const result = await uploadLineRichMenuArtwork(formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setArtworkUrl(result.url);
      setSaveState("unsaved");
      toast.success(t("artworkUploaded"));
    });
  };

  return (
    <div data-bagui="line-rich-menu-builder" className="space-y-4">
      {initialError ? <AdminErrorState title={t("unavailable")} description={initialError} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[#d29922]/40 bg-[#d29922]/10 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[#e3b341]">{t("safetyTitle")}</p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--solar-ops-body)]">{t("safetyDescription")}</p>
          <p className="mt-1 text-[11px] text-[#e3b341]">{t("timezone", { timezone })}</p>
        </div>
            <Link href={`/${locale}/admin/settings/line/scheduler`} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#d29922]/50 px-3 text-xs font-semibold text-[#e3b341] hover:bg-[#d29922]/15">
          <ExternalLink className="size-3.5" aria-hidden="true" />{t("scheduler")}
        </Link>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={createNew} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--solar-ops-green)] px-3.5 text-sm font-semibold text-white hover:bg-[var(--solar-ops-green-hover)]">
          <Plus className="size-4" aria-hidden="true" />{t("newDraft")}
        </button>
      </div>

      {!definitions.length && !selected ? (
        <AdminEmptyState title={t("emptyTitle")} description={t("emptyDescription")} action={<button type="button" onClick={createNew} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--solar-ops-green)] px-3.5 text-sm font-semibold text-white"><Plus className="size-4" aria-hidden="true" />{t("newDraft")}</button>} />
      ) : null}

      {definitions.length ? (
        <AdminDataTable
          rows={definitions}
          caption={t("library")}
          columns={[
            { key: "name", label: t("internalName"), render: (item) => <button type="button" onClick={() => selectDefinition(item)} className="text-left font-semibold text-[var(--solar-ops-text)] underline-offset-4 hover:underline">{item.internalName}</button> },
            { key: "audience", label: t("audience"), render: (item) => <span className="font-mono text-xs">{item.audience}</span> },
            { key: "status", label: t("status"), render: (item) => <AdminStatusBadge value={t(`statuses.${item.status}`)} /> },
            { key: "external", label: t("externalId"), render: (item) => <span className="font-mono text-xs text-[var(--solar-ops-muted)]">{item.lineRichMenuId || t("notConnected")}</span> },
            { key: "updated", label: t("updated"), render: (item) => <time dateTime={item.updatedAt} className="text-xs text-[var(--solar-ops-muted)]">{new Date(item.updatedAt).toLocaleString()}</time> },
          ]}
        />
      ) : null}

      {selected && document ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(13rem,0.22fr)_minmax(22rem,0.48fr)_minmax(18rem,0.3fr)]" aria-labelledby="rich-menu-editor-heading">
          <aside className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-3">
            <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("areas")}</h2><button type="button" onClick={addArea} className="rounded-md p-2 text-[var(--solar-ops-blue)] hover:bg-[var(--solar-ops-hover)]" aria-label={t("addArea")}><Plus className="size-4" aria-hidden="true" /></button></div>
            <div className="mt-3 space-y-1">
              {document.areas.map((area, index) => <button key={area.id} type="button" onClick={() => setSelectedAreaId(area.id)} className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-xs font-medium ${selectedArea?.id === area.id ? "bg-[var(--solar-ops-hover)] text-[var(--solar-ops-text)]" : "text-[var(--solar-ops-muted)] hover:bg-[var(--solar-ops-hover)]"}`}><span className="min-w-0 truncate">{area.label || `${t("area")} ${index + 1}`}</span><span className="font-mono text-[10px]">{index + 1}</span></button>)}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-1 border-t border-[var(--solar-ops-border)] pt-3">
              <button type="button" onClick={() => moveArea(-1)} className="flex min-h-9 items-center justify-center rounded-md border border-[var(--solar-ops-border)] text-[var(--solar-ops-muted)] hover:bg-[var(--solar-ops-hover)]" aria-label={t("moveUp")}><ChevronUp className="size-4" aria-hidden="true" /></button>
              <button type="button" onClick={() => moveArea(1)} className="flex min-h-9 items-center justify-center rounded-md border border-[var(--solar-ops-border)] text-[var(--solar-ops-muted)] hover:bg-[var(--solar-ops-hover)]" aria-label={t("moveDown")}><ChevronDown className="size-4" aria-hidden="true" /></button>
              <button type="button" onClick={removeArea} className="flex min-h-9 items-center justify-center rounded-md border border-[#f85149]/40 text-[#ff7b72] hover:bg-[#f85149]/10" aria-label={t("removeArea")}><Trash2 className="size-4" aria-hidden="true" /></button>
            </div>
          </aside>

          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4">
              <div className="flex items-start justify-between gap-3"><div><h2 id="rich-menu-editor-heading" className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("editor")}</h2><p className="mt-1 text-xs text-[var(--solar-ops-muted)]">{t("editorDescription")}</p></div><AdminSaveStatus state={saveState} label={saveState === "saving" ? t("saving") : saveState === "saved" ? t("saved") : saveState === "error" ? t("saveError") : t("unsaved")} /></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label={t("internalName")} value={internalName} onChange={(value) => { setInternalName(value); setSaveState("unsaved"); }} />
                <Field label={t("audience")} value={audience} onChange={(value) => { setAudience(value.toUpperCase()); setSaveState("unsaved"); }} />
                <Field label={t("menuName")} value={document.name} onChange={(value) => updateDocument((current) => ({ ...current, name: value }))} />
                <Field label={t("chatBarText")} value={document.chatBarText} onChange={(value) => updateDocument((current) => ({ ...current, chatBarText: value }))} />
              </div>
              <label className="mt-3 flex min-h-10 items-center gap-2 text-xs font-semibold text-[var(--solar-ops-body)]"><input type="checkbox" checked={isDefault} onChange={(event) => { setIsDefault(event.target.checked); setSaveState("unsaved"); }} className="size-4 accent-[#238636]" />{t("defaultMenu")}</label>
              <div className="mt-5 border-t border-[var(--solar-ops-border)] pt-4">
                <h3 className="text-xs font-semibold text-[var(--solar-ops-muted)]">{t("selectedArea")}</h3>
                {selectedArea ? <AreaEditor area={selectedArea} onChange={replaceSelectedArea} t={t} /> : null}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4">
              <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("artwork")}</h2><p className="mt-1 text-xs leading-5 text-[var(--solar-ops-muted)]">{t("artworkDescription", { width: RICH_MENU_CANVAS.width, height: RICH_MENU_CANVAS.height })}</p></div><ImageIcon className="size-5 text-[var(--solar-ops-muted)]" aria-hidden="true" /></div>
              <label className="mt-3 flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-dashed border-[var(--solar-ops-border-strong)] px-3 text-xs font-semibold text-[var(--solar-ops-body)] hover:bg-[var(--solar-ops-hover)]"><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => uploadArtwork(event.target.files?.[0])} disabled={isUploading} />{isUploading ? t("uploading") : t("chooseArtwork")}</label>
              <p className="mt-2 break-all text-xs text-[var(--solar-ops-muted)]">{artworkUrl || t("artworkNotUploaded")}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("preview")}</h2><div className="mt-4 overflow-hidden rounded-md border border-[var(--solar-ops-border)] bg-[#f6f8fa]"><div className="relative aspect-[2500/1686] bg-[#d0d7de]">{artworkUrl ? <div className="absolute inset-0 bg-cover bg-center opacity-70" style={{ backgroundImage: `url(${artworkUrl})` }} role="img" aria-label={t("artworkPreview")} /> : null}{document.areas.map((area) => <button key={area.id} type="button" onClick={() => setSelectedAreaId(area.id)} className={`absolute border-2 p-1 text-[10px] font-semibold transition-colors ${selectedArea?.id === area.id ? "border-[#238636] bg-[#238636]/30 text-[#1f2328]" : "border-[#0969da] bg-[#0969da]/15 text-[#1f2328]"}`} style={{ left: `${(area.bounds.x / RICH_MENU_CANVAS.width) * 100}%`, top: `${(area.bounds.y / RICH_MENU_CANVAS.height) * 100}%`, width: `${(area.bounds.width / RICH_MENU_CANVAS.width) * 100}%`, height: `${(area.bounds.height / RICH_MENU_CANVAS.height) * 100}%` }}><span className="line-clamp-2">{area.label || area.id}</span></button>)}</div></div><p className="mt-2 text-xs text-[var(--solar-ops-muted)]">{t("previewHint")}</p></div>
             <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("impact")}</h2><p className="mt-2 text-xs leading-5 text-[var(--solar-ops-muted)]">{isDefault ? t("defaultImpact") : t("audienceImpact", { audience })}</p>{selected.lineRichMenuId ? <p className="mt-2 break-all font-mono text-[11px] text-[var(--solar-ops-body)]">{t("activeExternalId")}: {selected.lineRichMenuId}</p> : null}{selected.previousLineRichMenuId ? <p className="mt-1 break-all font-mono text-[11px] text-[var(--solar-ops-muted)]">{t("previousExternalId")}: {selected.previousLineRichMenuId}</p> : null}</div>
             <AdminPublishSummary draftVersion={selected.draftVersion} publishedVersion={selected.publishedVersion} status={selected.status === "PUBLISHED" ? t("statuses.PUBLISHED") : t("notPublished")} note={t("publishNote")} />
             <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><div className="flex flex-wrap gap-2"><button type="button" onClick={saveDraft} disabled={isSaving || isUploading} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--solar-ops-green)] px-3 text-xs font-semibold text-white disabled:opacity-50"><Save className="size-3.5" aria-hidden="true" />{t("save")}</button><button type="button" onClick={publish} disabled={isSaving || !selected.id} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#3fb950]/50 px-3 text-xs font-semibold text-[#7ee787] disabled:opacity-50"><Send className="size-3.5" aria-hidden="true" />{t("publish")}</button>{selected.isDefault && selected.previousLineRichMenuId ? <button type="button" onClick={rollback} disabled={isSaving} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#d29922]/50 px-3 text-xs font-semibold text-[#e3b341] disabled:opacity-50">{t("rollback")}</button> : null}</div><button type="button" onClick={archive} disabled={isSaving || !selected.id} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-md border border-[#f85149]/40 px-3 text-xs font-semibold text-[#ff7b72] disabled:opacity-50"><Archive className="size-3.5" aria-hidden="true" />{t("archive")}</button></div>
            <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("history")}</h2>{history.length ? <ul className="mt-3 space-y-2">{history.map((item) => <li key={item.id} className="flex items-center justify-between gap-2 text-xs text-[var(--solar-ops-muted)]"><span>v{item.version} · {item.state}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString()}</time></li>)}</ul> : <p className="mt-2 text-xs leading-5 text-[var(--solar-ops-muted)]">{t("historyUnavailable")}</p>}</div>
          </div>
        </section>
      ) : null}
      {!selected && definitions.length ? <AdminEmptyState title={t("selectDefinition")} description={t("selectDefinitionDescription")} action={<button type="button" onClick={createNew} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-sm font-semibold text-[var(--solar-ops-body)]"><Plus className="size-4" aria-hidden="true" />{t("newDraft")}</button>} /> : null}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="w-full px-3 text-sm" /></label>;
}

function AreaEditor({ area, onChange, t }: { area: LineRichMenuArea; onChange: (area: LineRichMenuArea) => void; t: (key: string) => string }) {
  const updateBounds = (key: keyof LineRichMenuArea["bounds"], value: string) => onChange({ ...area, bounds: { ...area.bounds, [key]: Math.max(0, Number(value) || 0) } });
  return <div className="mt-3 space-y-3"><Field label={t("areaLabel")} value={area.label || ""} onChange={(label) => onChange({ ...area, label })} /><div className="grid grid-cols-2 gap-2">{(["x", "y", "width", "height"] as const).map((key) => <label key={key} className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block font-mono uppercase">{key}</span><input type="number" min={0} value={area.bounds[key]} onChange={(event) => updateBounds(key, event.target.value)} className="w-full px-3 text-sm" /></label>)}</div><label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("actionType")}</span><select value={area.action.type} onChange={(event) => onChange({ ...area, action: actionForType(event.target.value as LineRichMenuAction["type"]) })} className="w-full px-3 text-sm"><option value="message">{t("messageAction")}</option><option value="uri">{t("uriAction")}</option><option value="postback">{t("postbackAction")}</option><option value="richmenu">{t("richMenuAction")}</option></select></label><label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("actionValue")}</span><input value={actionValue(area.action)} onChange={(event) => onChange({ ...area, action: updateActionValue(area.action, event.target.value) })} className="w-full px-3 text-sm" /></label></div>;
}

function actionForType(type: LineRichMenuAction["type"]): LineRichMenuAction {
  if (type === "message") return { type, text: "Example action" };
  if (type === "uri") return { type, uri: "https://example.com" };
  if (type === "postback") return { type, data: "example=1", displayText: "Example" };
  return { type, richMenuAliasId: "menu-alias" };
}

function updateActionValue(action: LineRichMenuAction, value: string): LineRichMenuAction {
  if (action.type === "message") return { ...action, text: value };
  if (action.type === "uri") return { ...action, uri: value };
  if (action.type === "postback") return { ...action, data: value };
  return { ...action, richMenuAliasId: value };
}
