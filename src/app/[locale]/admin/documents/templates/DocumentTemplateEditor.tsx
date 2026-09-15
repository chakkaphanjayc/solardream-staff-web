"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Minus,
  Plus,
  Save,
  Trash2,
  Undo2,
  Upload,
} from "@/components/ui/icons";
import {
  getDocumentTemplateSourceAction,
  publishDocumentTemplateAction,
  saveDocumentTemplateAction,
} from "@/app/actions/documentTemplates";
import type { DocumentServiceTemplate, DocumentServiceTemplateField } from "@/lib/document-service/client";

if (typeof window !== "undefined" && pdfjs?.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version || "5.4.296"}/legacy/build/pdf.worker.min.mjs`;
}

type EditorField = Omit<DocumentServiceTemplateField, "id"> & { localId: string };
type PageSize = { width: number; height: number; rotation: number };
type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    rotate?: number;
    getViewport: (options: { scale: number; rotation: number }) => { width: number; height: number };
  }>;
};
type PreviewField = Pick<EditorField, "x" | "y" | "width" | "height"> & { localId: string };
type PointerMode = "move" | "resize";

const DEFAULT_PAGE_SIZE: PageSize = { width: 595.27, height: 841.89, rotation: 0 };
const MIN_FIELD_WIDTH = 24;
const MIN_FIELD_HEIGHT = 18;

function fieldLabel(fieldType: EditorField["fieldType"]): string {
  return fieldType.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function defaultField(pageNumber: number, pageSize: PageSize, index: number): EditorField {
  return {
    localId: crypto.randomUUID(),
    fieldKey: `field.${index + 1}`,
    fieldType: "signature",
    recipientRole: "customer",
    pageNumber,
    x: pageSize.width * 0.12,
    y: pageSize.height * 0.2,
    width: Math.min(180, pageSize.width * 0.36),
    height: 42,
    pageRotation: pageSize.rotation,
    required: true,
    anchorKey: null,
  };
}

function fromTemplateField(field: DocumentServiceTemplateField): EditorField {
  return { ...field, localId: crypto.randomUUID() };
}

function toPdfFields(fields: EditorField[]): Array<Omit<DocumentServiceTemplateField, "id">> {
  return fields.map((field) => ({
    fieldKey: field.fieldKey,
    fieldType: field.fieldType,
    recipientRole: field.recipientRole,
    pageNumber: field.pageNumber,
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
    pageRotation: field.pageRotation,
    required: field.required,
    anchorKey: field.anchorKey,
  }));
}

function clampField(field: EditorField, pageSize: PageSize): EditorField {
  const width = Math.min(Math.max(MIN_FIELD_WIDTH, field.width), pageSize.width);
  const height = Math.min(Math.max(MIN_FIELD_HEIGHT, field.height), pageSize.height);
  return {
    ...field,
    width,
    height,
    x: Math.min(Math.max(0, field.x), Math.max(0, pageSize.width - width)),
    y: Math.min(Math.max(0, field.y), Math.max(0, pageSize.height - height)),
  };
}

function fileFromBase64(base64: string, name: string): File {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new File([bytes], name, { type: "application/pdf" });
}

export default function DocumentTemplateEditor({
  initialTemplates,
  initialError,
}: {
  initialTemplates: DocumentServiceTemplate[];
  initialError?: string;
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [file, setFile] = useState<File | null>(null);
  const [templateKey, setTemplateKey] = useState("quotation.default");
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});
  const [zoom, setZoom] = useState(1);
  const [fieldsHistory, setFieldsHistory] = useState<EditorField[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [previewField, setPreviewField] = useState<PreviewField | null>(null);
  const [error, setError] = useState<string | null>(initialError || null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [latestDraft, setLatestDraft] = useState<DocumentServiceTemplate | null>(null);
  const pointerRef = useRef<{
    localId: string;
    mode: PointerMode;
    startX: number;
    startY: number;
    field: EditorField;
    surface: DOMRect;
    pageSize: PageSize;
  } | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const fields = useMemo(() => fieldsHistory[historyIndex] || [], [fieldsHistory, historyIndex]);
  const selectedField = fields.find((field) => field.localId === selectedFieldId) || null;
  const currentPageSize = pageSizes[pageNumber] || DEFAULT_PAGE_SIZE;
  const pageWidth = Math.min(900, Math.max(420, currentPageSize.width * zoom));
  const currentPageFields = useMemo(
    () => fields.filter((field) => field.pageNumber === pageNumber),
    [fields, pageNumber],
  );
  const filePreview = useMemo(() => file, [file]);

  function commit(next: EditorField[]): void {
    setFieldsHistory((current) => [...current.slice(0, historyIndex + 1), next]);
    setHistoryIndex((current) => current + 1);
    setPreviewField(null);
  }

  function updateField(localId: string, patch: Partial<EditorField>): void {
    commit(fields.map((field) => field.localId === localId ? clampField({ ...field, ...patch }, pageSizes[field.pageNumber] || DEFAULT_PAGE_SIZE) : field));
  }

  function undo(): void {
    setHistoryIndex((current) => Math.max(0, current - 1));
    setPreviewField(null);
  }

  function redo(): void {
    setHistoryIndex((current) => Math.min(fieldsHistory.length - 1, current + 1));
    setPreviewField(null);
  }

  function removeSelectedField(): void {
    if (!selectedFieldId) return;
    commit(fields.filter((field) => field.localId !== selectedFieldId));
    setSelectedFieldId(null);
  }

  function addField(): void {
    const next = defaultField(pageNumber, currentPageSize, fields.length);
    commit([...fields, next]);
    setSelectedFieldId(next.localId);
  }

  function setPdf(fileValue: File | null, template?: DocumentServiceTemplate): void {
    if (!fileValue) return;
    setFile(fileValue);
    setNumPages(0);
    setPageNumber(1);
    setPageSizes({});
    setZoom(1);
    setSelectedFieldId(null);
    setLatestDraft(template?.status === "draft" ? template : null);
    setFieldsHistory([template ? template.fields.map(fromTemplateField) : []]);
    setHistoryIndex(0);
    setError(null);
    setNotice(null);
  }

  async function loadTemplate(template: DocumentServiceTemplate): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await getDocumentTemplateSourceAction(template.id);
      if (!result.success || !result.base64) throw new Error(result.error || "Template source could not be loaded.");
      setTemplateKey(template.templateKey);
      setPdf(fileFromBase64(result.base64, `${template.templateKey}-v${template.versionNumber}.pdf`), template);
      setNotice(`Loaded ${template.templateKey} v${template.versionNumber}. Saving creates a new immutable version.`);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Template source could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  function validate(): string | null {
    if (!file) return "Choose a PDF template before saving.";
    if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/.test(templateKey.trim())) return "Template key must use letters, numbers, dot, underscore, colon, or hyphen.";
    if (fields.length === 0) return "Add at least one required or optional field before saving.";
    const keys = new Set<string>();
    for (const field of fields) {
      if (keys.has(field.fieldKey)) return `Field key ${field.fieldKey} is duplicated.`;
      keys.add(field.fieldKey);
      if (field.pageNumber > numPages) return `${field.fieldKey} points to a page outside this PDF.`;
      const size = pageSizes[field.pageNumber] || DEFAULT_PAGE_SIZE;
      if (field.x < 0 || field.y < 0 || field.x + field.width > size.width || field.y + field.height > size.height) {
        return `${field.fieldKey} is outside the PDF crop box.`;
      }
    }
    return null;
  }

  async function save(publish = false): Promise<void> {
    const validationError = validate();
    if (validationError || !file) {
      setError(validationError || "Choose a PDF template before saving.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.set("templateKey", templateKey.trim());
      formData.set("sourcePdf", file);
      formData.set("fields", JSON.stringify(toPdfFields(fields)));
      formData.set("definition", JSON.stringify({ coordinateSystem: "pdf-crop-box-points", editor: "staff-template-editor-v1" }));
      const result = await saveDocumentTemplateAction(formData);
      if (!result.success || !result.template) throw new Error(result.error || "Template could not be saved.");
      let saved = result.template;
      if (publish) {
        const published = await publishDocumentTemplateAction(saved.id);
        if (!published.success || !published.template) throw new Error(published.error || "Template could not be published.");
        saved = published.template;
      }
      setLatestDraft(saved.status === "draft" ? saved : null);
      setTemplates((current) => [saved, ...current.filter((template) => template.id !== saved.id)]);
      setNotice(publish ? `${saved.templateKey} v${saved.versionNumber} is published and immutable.` : `${saved.templateKey} v${saved.versionNumber} is saved as a draft.`);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Template could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function startPointer(event: ReactPointerEvent<HTMLElement>, field: EditorField, mode: PointerMode): void {
    const surface = surfaceRef.current?.getBoundingClientRect();
    if (!surface) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedFieldId(field.localId);
    pointerRef.current = {
      localId: field.localId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      field,
      surface,
      pageSize: currentPageSize,
    };
  }

  function movePointer(event: ReactPointerEvent<HTMLElement>): void {
    const origin = pointerRef.current;
    if (!origin) return;
    const scaleX = origin.pageSize.width / origin.surface.width;
    const scaleY = origin.pageSize.height / origin.surface.height;
    const dx = (event.clientX - origin.startX) * scaleX;
    const dy = (origin.startY - event.clientY) * scaleY;
    const next = origin.mode === "move"
      ? clampField({ ...origin.field, x: origin.field.x + dx, y: origin.field.y + dy }, origin.pageSize)
      : clampField({ ...origin.field, width: origin.field.width + dx, height: origin.field.height - dy }, origin.pageSize);
    setPreviewField({ localId: next.localId, x: next.x, y: next.y, width: next.width, height: next.height });
  }

  function endPointer(event: ReactPointerEvent<HTMLElement>): void {
    const origin = pointerRef.current;
    if (!origin) return;
    const preview = previewField;
    if (preview) commit(fields.map((field) => field.localId === preview.localId ? { ...field, ...preview } : field));
    event.currentTarget.releasePointerCapture(event.pointerId);
    pointerRef.current = null;
  }

  function keyboardMove(event: React.KeyboardEvent<HTMLDivElement>, field: EditorField): void {
    const step = event.shiftKey ? 10 : 1;
    const deltas: Record<string, Partial<EditorField>> = {
      ArrowLeft: { x: field.x - step },
      ArrowRight: { x: field.x + step },
      ArrowUp: { y: field.y + step },
      ArrowDown: { y: field.y - step },
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    updateField(field.localId, delta);
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      }
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  async function handleDocumentLoadSuccess(document: PdfDocument): Promise<void> {
    setNumPages(document.numPages);
    const sizes: Record<number, PageSize> = {};
    for (let index = 1; index <= document.numPages; index += 1) {
      const page = await document.getPage(index);
      const viewport = page.getViewport({ scale: 1, rotation: 0 });
      sizes[index] = { width: viewport.width, height: viewport.height, rotation: (page.rotate || 0) % 360 };
    }
    setPageSizes(sizes);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-xl border border-[#30363d] bg-[#161b22]" aria-labelledby="template-editor-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#30363d] p-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#58a6ff]">Versioned template editor</p>
              <h2 id="template-editor-heading" className="mt-1 text-lg font-semibold text-[#f0f6fc]">Place fields in PDF coordinates</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={undo} disabled={historyIndex === 0 || busy} className="editor-tool-button" aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
              <button type="button" onClick={redo} disabled={historyIndex >= fieldsHistory.length - 1 || busy} className="editor-tool-button" aria-label="Redo"><Undo2 className="h-4 w-4 rotate-180" /></button>
              <button type="button" onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))} className="editor-tool-button" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
              <span className="min-w-12 text-center text-xs text-[#8b949e]">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))} className="editor-tool-button" aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="grid min-h-[620px] lg:grid-cols-[96px_minmax(0,1fr)]">
            <aside className="border-b border-[#30363d] bg-[#0d1117] p-2 lg:border-r lg:border-b-0" aria-label="Page thumbnails">
              <div className="flex gap-2 overflow-x-auto lg:block lg:space-y-2">
                {file && numPages > 0 ? Array.from({ length: numPages }, (_, index) => index + 1).map((page) => (
                  <button key={page} type="button" onClick={() => setPageNumber(page)} className={`block shrink-0 rounded-md border p-1 ${page === pageNumber ? "border-[#58a6ff] bg-[#58a6ff]/10" : "border-[#30363d] bg-[#161b22]"}`} aria-label={`Open page ${page}`}>
                    <Page pageNumber={page} width={72} height={100} renderTextLayer={false} renderAnnotationLayer={false} rotate={0} />
                    <span className="mt-1 block text-center text-[10px] text-[#8b949e]">{page}</span>
                  </button>
                )) : <p className="p-2 text-[10px] leading-4 text-[#8b949e]">Upload a PDF to see page thumbnails.</p>}
              </div>
            </aside>

            <div className="min-w-0 overflow-auto bg-[#0d1117] p-4 sm:p-6">
              {!filePreview ? (
                <label className="mx-auto flex min-h-[520px] max-w-xl cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#30363d] bg-[#161b22] p-8 text-center hover:border-[#58a6ff]">
                  <Upload className="h-8 w-8 text-[#58a6ff]" aria-hidden="true" />
                  <span className="mt-4 text-sm font-semibold text-[#f0f6fc]">Choose a quotation PDF</span>
                  <span className="mt-2 text-xs leading-5 text-[#8b949e]">The source stays in the private Document Service storage after save.</span>
                  <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => setPdf(event.target.files?.[0] || null)} />
                </label>
              ) : (
                <Document
                  file={filePreview}
                  onLoadSuccess={(loaded) => void handleDocumentLoadSuccess(loaded)}
                  loading={<div className="flex min-h-[520px] items-center justify-center text-sm text-[#8b949e]">Loading PDF…</div>}
                  error={<div className="flex min-h-[520px] items-center justify-center text-sm text-rose-300">PDF.js could not render this source.</div>}
                >
                  <div ref={surfaceRef} className="relative mx-auto w-max bg-white shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
                    <Page pageNumber={pageNumber} width={pageWidth} renderTextLayer={false} renderAnnotationLayer={false} rotate={0} />
                    {currentPageFields.map((field) => {
                      const active = previewField?.localId === field.localId ? { ...field, ...previewField } : field;
                      return (
                        <div
                          key={field.localId}
                          tabIndex={0}
                          role="button"
                          aria-label={`${fieldLabel(field.fieldType)} field ${field.fieldKey}`}
                          onClick={() => setSelectedFieldId(field.localId)}
                          onKeyDown={(event) => keyboardMove(event, active)}
                          onPointerDown={(event) => startPointer(event, active, "move")}
                          onPointerMove={movePointer}
                          onPointerUp={endPointer}
                          onPointerCancel={endPointer}
                          className={`absolute touch-none border-2 text-left text-[10px] font-semibold shadow-sm outline-none ${selectedFieldId === field.localId ? "border-[#0969da] bg-[#58a6ff]/20 text-[#0969da] ring-2 ring-[#58a6ff]/40" : "border-[#8250df] bg-[#8250df]/15 text-[#6639ba]"}`}
                          style={{
                            left: `${(active.x / currentPageSize.width) * 100}%`,
                            top: `${((currentPageSize.height - active.y - active.height) / currentPageSize.height) * 100}%`,
                            width: `${(active.width / currentPageSize.width) * 100}%`,
                            height: `${(active.height / currentPageSize.height) * 100}%`,
                          }}
                        >
                          <span className="pointer-events-none truncate px-1">{field.fieldKey}</span>
                          {selectedFieldId === field.localId ? (
                            <span onPointerDown={(event) => startPointer(event, active, "resize")} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} className="absolute bottom-[-5px] right-[-5px] h-3 w-3 cursor-se-resize rounded-sm border border-white bg-[#0969da]" aria-label="Resize field" />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </Document>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#30363d] bg-[#161b22] p-3">
            <div className="flex items-center gap-2 text-xs text-[#8b949e]">
              <button type="button" onClick={() => setPageNumber((value) => Math.max(1, value - 1))} disabled={pageNumber <= 1} className="editor-tool-button"><ChevronLeft className="h-4 w-4" /></button>
              <span>Page {numPages ? pageNumber : 0} / {numPages}</span>
              <button type="button" onClick={() => setPageNumber((value) => Math.min(numPages, value + 1))} disabled={!numPages || pageNumber >= numPages} className="editor-tool-button"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <button type="button" onClick={addField} disabled={!file || busy} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-[#238636] px-3 text-xs font-semibold text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />Add field</button>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
            <div className="flex items-center gap-2 text-[#f0f6fc]"><FileText className="h-4 w-4 text-[#58a6ff]" /><h2 className="text-sm font-semibold">Template properties</h2></div>
            <label className="mt-4 block text-xs font-semibold text-[#8b949e]">Template key<input value={templateKey} onChange={(event) => setTemplateKey(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#f0f6fc] outline-none focus:border-[#58a6ff]" /></label>
            <p className="mt-2 text-[11px] leading-4 text-[#8b949e]">Published versions are immutable. Saving the same key creates the next version.</p>
          </section>

          <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-4" aria-labelledby="field-properties-heading">
            <div className="flex items-center justify-between gap-2"><h2 id="field-properties-heading" className="text-sm font-semibold text-[#f0f6fc]">Field properties</h2><button type="button" onClick={removeSelectedField} disabled={!selectedFieldId} className="editor-tool-button text-rose-300" aria-label="Remove field"><Trash2 className="h-4 w-4" /></button></div>
            {selectedField ? (
              <div className="mt-4 space-y-3">
                <label className="block text-xs text-[#8b949e]">Field key<input value={selectedField.fieldKey} onChange={(event) => updateField(selectedField.localId, { fieldKey: event.target.value })} className="editor-input" /></label>
                <label className="block text-xs text-[#8b949e]">Type<select value={selectedField.fieldType} onChange={(event) => updateField(selectedField.localId, { fieldType: event.target.value as EditorField["fieldType"] })} className="editor-input"><option value="signature">Signature</option><option value="printed_name">Printed name</option><option value="date">Date</option><option value="text">Text</option><option value="checkbox">Checkbox</option></select></label>
                <label className="block text-xs text-[#8b949e]">Recipient role<input value={selectedField.recipientRole} onChange={(event) => updateField(selectedField.localId, { recipientRole: event.target.value })} className="editor-input" /></label>
                <label className="block text-xs text-[#8b949e]">Anchor key (optional)<input value={selectedField.anchorKey || ""} onChange={(event) => updateField(selectedField.localId, { anchorKey: event.target.value || null })} className="editor-input" placeholder="customer.signature" /></label>
                <label className="flex items-center gap-2 text-xs text-[#c9d1d9]"><input type="checkbox" checked={selectedField.required} onChange={(event) => updateField(selectedField.localId, { required: event.target.checked })} />Required field</label>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#8b949e]"><span>Page {selectedField.pageNumber}</span><span>Rotation {selectedField.pageRotation}°</span><span>X {Math.round(selectedField.x)} pt</span><span>Y {Math.round(selectedField.y)} pt</span><span>W {Math.round(selectedField.width)} pt</span><span>H {Math.round(selectedField.height)} pt</span></div>
                <p className="text-[10px] leading-4 text-[#8b949e]">Arrow keys move 1 pt; Shift + arrow moves 10 pt. Coordinates are stored in PDF crop-box points.</p>
              </div>
            ) : <p className="mt-4 text-xs leading-5 text-[#8b949e]">Select a field on the PDF to edit its properties.</p>}
          </section>

          <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
            <div className="flex items-center gap-2 text-[#f0f6fc]"><Eye className="h-4 w-4 text-[#58a6ff]" /><h2 className="text-sm font-semibold">Validation & publish</h2></div>
            <p className="mt-2 text-xs leading-5 text-[#8b949e]">Preview placement before saving. The service rejects fields outside the crop box and records each source as a new immutable version.</p>
            <div className="mt-4 grid gap-2"><button type="button" onClick={() => void save(false)} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] px-3 text-xs font-semibold text-[#f0f6fc] hover:border-[#58a6ff] disabled:opacity-50"><Save className="h-4 w-4" />{busy ? "Saving…" : "Save draft"}</button><button type="button" onClick={() => void save(true)} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#238636] px-3 text-xs font-semibold text-white hover:bg-[#2ea043] disabled:opacity-50"><Check className="h-4 w-4" />Save & publish</button></div>
            {latestDraft ? <p className="mt-3 text-[11px] text-[#d29922]">Draft v{latestDraft.versionNumber} is ready to publish.</p> : null}
          </section>
        </aside>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-[#f85149]/40 bg-[#f85149]/10 p-3 text-sm text-[#ff7b72]">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-[#3fb950]/40 bg-[#238636]/10 p-3 text-sm text-[#56d364]">{notice}</div> : null}

      <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-4" aria-labelledby="template-history-heading">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="template-history-heading" className="text-sm font-semibold text-[#f0f6fc]">Template history</h2><p className="mt-1 text-xs text-[#8b949e]">Draft, published, and retired versions remain visible for audit.</p></div><label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] px-3 text-xs font-semibold text-[#c9d1d9] hover:border-[#58a6ff]"><Upload className="h-4 w-4" />New source<input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => setPdf(event.target.files?.[0] || null)} /></label></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="border-b border-[#30363d] text-[#8b949e]"><tr><th className="px-3 py-2 font-medium">Template</th><th className="px-3 py-2 font-medium">Version</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Updated</th><th className="px-3 py-2" /></tr></thead><tbody>{templates.map((template) => <tr key={template.id} className="border-b border-[#21262d] text-[#c9d1d9]"><td className="px-3 py-3 font-semibold">{template.templateKey}</td><td className="px-3 py-3">v{template.versionNumber}</td><td className="px-3 py-3"><span className="rounded-full border border-[#30363d] px-2 py-1 text-[10px] uppercase tracking-wide">{template.status}</span></td><td className="px-3 py-3 text-[#8b949e]">{new Date(template.updatedAt).toLocaleString()}</td><td className="px-3 py-3 text-right"><div className="flex justify-end gap-2"><button type="button" onClick={() => void loadTemplate(template)} disabled={busy} className="rounded-md border border-[#30363d] px-2 py-1.5 hover:border-[#58a6ff]">Open</button>{template.status === "draft" ? <button type="button" onClick={async () => { setBusy(true); const result = await publishDocumentTemplateAction(template.id); setBusy(false); if (!result.success || !result.template) setError(result.error || "Publish failed."); else { setTemplates((current) => [result.template as DocumentServiceTemplate, ...current.filter((item) => item.id !== template.id)]); setNotice(`${template.templateKey} v${template.versionNumber} is published.`); } }} disabled={busy} className="rounded-md bg-[#238636] px-2 py-1.5 font-semibold text-white hover:bg-[#2ea043]">Publish</button> : null}</div></td></tr>)}</tbody></table>{templates.length === 0 ? <p className="py-8 text-center text-xs text-[#8b949e]">No versions have been created in this organization.</p> : null}</div>
      </section>
    </div>
  );
}
