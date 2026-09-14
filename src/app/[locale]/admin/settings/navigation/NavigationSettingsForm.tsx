"use client";

import { useMemo, useState, useTransition } from "react";
import { Database, HelpCircle, Plus, Save, Settings, Trash2 } from "@/components/ui/icons";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  createNavigationItem,
  deleteNavigationItem,
  saveNavigationTemplate,
  seedDefaultNavigationItems,
  type NavigationTemplates,
  type NavigationTranslations,
  updateNavigationItem,
} from "@/app/actions/navigation";
import { LocalizationApplyControl } from "@/components/admin/LocalizationApplyControl";
import { LocalizedFieldMarker } from "@/components/admin/LocalizedFieldMarker";
import { localeLabels, type Locale } from "@/i18n/locales";

interface NavigationItem {
  id: string;
  label: string;
  url: string;
  parentId: string | null;
  order: number;
}

interface NavigationSettingsFormProps {
  initialItems: NavigationItem[];
  contentLocale: Locale;
  onLocaleChange: (locale: Locale) => void;
  initialTranslations: NavigationTranslations;
  initialTemplates: NavigationTemplates;
}

interface MenuItemEditorProps {
  item: NavigationItem;
  parentItems: NavigationItem[];
  contentLocale: Locale;
  isPending: boolean;
  onChange: (id: string, patch: Partial<NavigationItem>) => void;
  onSave: (item: NavigationItem) => void;
  onDelete: (item: NavigationItem) => void;
}

interface AddMenuItemInlineProps {
  parentId: string | null;
  contentLocale: Locale;
  isPending: boolean;
  label: string;
  onCreate: (data: { label: string; url: string; parentId: string | null; order: number }) => void;
}

function getActionError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function AddMenuItemInline({ parentId, contentLocale, isPending, label, onCreate }: AddMenuItemInlineProps) {
  const t = useTranslations("AdminNavigation");
  const [isOpen, setIsOpen] = useState(false);
  const [itemLabel, setItemLabel] = useState("");
  const [url, setUrl] = useState("");
  const [order, setOrder] = useState(0);

  if (!isOpen) {
    return <button type="button" onClick={() => setIsOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-full border border-[#B7D1EA]/35 px-4 text-xs font-black text-[#B7D1EA] transition hover:bg-[#B7D1EA]/10"><Plus className="size-4" />{label}</button>;
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); onCreate({ label: itemLabel, url, parentId, order }); setItemLabel(""); setUrl(""); setOrder(0); setIsOpen(false); }} className="grid gap-3 rounded-xl border border-dashed border-[#B7D1EA]/40 bg-[#B7D1EA]/5 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_auto] md:items-start">
      <label className="block space-y-1.5"><span className="text-[10px] font-bold text-slate-300">{t("fields.label")}</span><input value={itemLabel} onChange={(event) => setItemLabel(event.target.value)} required autoFocus className="h-10 w-full rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 text-sm text-gray-100 outline-none focus:border-[#B7D1EA]" /><LocalizedFieldMarker locale={contentLocale} /></label>
      <label className="block space-y-1.5"><span className="text-[10px] font-bold text-slate-300">{t("fields.targetUrl")}</span><input value={url} onChange={(event) => setUrl(event.target.value)} required placeholder={t("fields.urlPlaceholder")} className="h-10 w-full rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 text-sm text-gray-100 outline-none focus:border-[#B7D1EA]" /><LocalizedFieldMarker locale={contentLocale} /></label>
      <label className="block space-y-1.5"><span className="text-[10px] font-bold text-slate-300">{t("fields.displayOrder")}</span><input type="number" min="0" value={order} onChange={(event) => setOrder(Number(event.target.value))} className="h-10 w-full rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 text-sm text-gray-100 outline-none focus:border-[#B7D1EA]" /><LocalizedFieldMarker locale={contentLocale} /></label>
      <div className="flex gap-2 md:pt-5"><button type="submit" disabled={isPending} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#B7D1EA] px-4 text-xs font-black text-slate-950 disabled:opacity-50"><Plus className="size-4" />{t("actions.add")}</button><button type="button" onClick={() => setIsOpen(false)} className="h-10 rounded-full px-3 text-xs font-bold text-slate-300 hover:bg-slate-800">{t("actions.cancel")}</button></div>
    </form>
  );
}

function MenuItemEditor({ item, parentItems, contentLocale, isPending, onChange, onSave, onDelete }: MenuItemEditorProps) {
  const t = useTranslations("AdminNavigation");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(item);
      }}
      className="grid gap-3 rounded-xl border border-[#1E293B] bg-[#0F172A] p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_auto] md:items-start"
    >
      <label className="block min-w-0 space-y-1.5">
        <span className="text-[10px] font-bold text-slate-400">{t("fields.label")}</span>
        <input
          value={item.label}
          onChange={(event) => onChange(item.id, { label: event.target.value })}
          required
          className="h-10 w-full rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 text-sm font-semibold text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
        />
        <LocalizedFieldMarker locale={contentLocale} />
      </label>

      <label className="block min-w-0 space-y-1.5">
        <span className="text-[10px] font-bold text-slate-400">{t("fields.targetUrl")}</span>
        <input
          value={item.url}
          onChange={(event) => onChange(item.id, { url: event.target.value })}
          required
          placeholder={t("fields.urlPlaceholder")}
        />
        <LocalizedFieldMarker locale={contentLocale} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-[10px] font-bold text-slate-400">{t("fields.displayOrder")}</span>
        <input
          type="number"
          min="0"
          value={item.order}
          onChange={(event) => onChange(item.id, { order: Number(event.target.value) })}
          className="h-10 w-full rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 text-sm font-mono font-medium text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
        />
        <LocalizedFieldMarker locale={contentLocale} />
      </label>

      <div className="flex min-h-10 items-end gap-2 md:pt-5">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#B7D1EA] px-4 text-xs font-black text-slate-950 transition hover:bg-[#99BFE3] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="size-3.5" />
          {t("actions.saveItem")}
        </button>
        <button
          type="button"
          onClick={() => onDelete(item)}
          disabled={isPending}
          aria-label={t("actions.deleteItem", { label: item.label })}
          className="inline-flex size-10 items-center justify-center rounded-full border border-rose-400/30 text-rose-300 transition hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <label className="block min-w-0 space-y-1.5 md:col-span-2">
        <span className="text-[10px] font-bold text-slate-400">{t("fields.parentCategory")}</span>
        <select
          value={item.parentId ?? ""}
          onChange={(event) => onChange(item.id, { parentId: event.target.value || null })}
          className="h-10 w-full rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 text-sm font-medium text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
        >
          <option value="">{t("fields.topLevelCategory")}</option>
          {parentItems.filter((parent) => parent.id !== item.id).map((parent) => <option key={parent.id} value={parent.id}>{parent.label}</option>)}
        </select>
        <LocalizedFieldMarker locale={contentLocale} />
      </label>
    </form>
  );
}

export default function NavigationSettingsForm({ initialItems, contentLocale, onLocaleChange, initialTemplates }: NavigationSettingsFormProps) {
  const t = useTranslations("AdminNavigation");
  const [items, setItems] = useState<NavigationItem[]>(initialItems);
  const [templates, setTemplates] = useState<NavigationTemplates>(initialTemplates);
  const [pendingTemplates, setPendingTemplates] = useState<NavigationTemplates>(initialTemplates);
  const [isPending, startTransition] = useTransition();

  const activeItems = contentLocale === "th" ? items : pendingTemplates[contentLocale] ?? items;
  const parentItems = activeItems.filter((item) => item.parentId === null).sort((a, b) => a.order - b.order);
  const hasPendingLocalization = useMemo(
    () => contentLocale !== "th" && JSON.stringify(pendingTemplates[contentLocale] ?? items) !== JSON.stringify(templates[contentLocale] ?? items),
    [contentLocale, items, pendingTemplates, templates],
  );

  const updateDraft = (id: string, patch: Partial<NavigationItem>) => {
    const update = (current: NavigationItem[]) => current.map((item) => item.id === id ? { ...item, ...patch } : item);
    if (contentLocale === "th") {
      setItems(update);
      return;
    }
    setPendingTemplates((current) => ({ ...current, [contentLocale]: update(current[contentLocale] ?? items) }));
  };

  const applyTemplate = () => {
    if (contentLocale === "th") return;
    const template = pendingTemplates[contentLocale] ?? items;
    startTransition(async () => {
      try {
        const result = await saveNavigationTemplate(contentLocale, template);
        if (!result.success) {
          toast.error(result.error || t("feedback.applyFailed"));
          return;
        }
        setTemplates((current) => ({ ...current, [contentLocale]: template }));
        toast.success(t("feedback.presetApplied", { language: localeLabels[contentLocale] }));
      } catch (error) {
        toast.error(getActionError(error, t("feedback.applyFailed")));
      }
    });
  };

  const saveItem = (item: NavigationItem) => {
    if (!item.label.trim() || !item.url.trim()) {
      toast.error(t("feedback.labelAndUrlRequired"));
      return;
    }
    startTransition(async () => {
      try {
        if (contentLocale !== "th") {
          const template = pendingTemplates[contentLocale] ?? items;
          const result = await saveNavigationTemplate(contentLocale, template);
          if (!result.success) {
            toast.error(result.error || t("feedback.savePresetFailed"));
            return;
          }
          setTemplates((current) => ({ ...current, [contentLocale]: template }));
          toast.success(t("feedback.itemSavedForLanguage", { label: item.label, language: localeLabels[contentLocale] }));
          return;
        }
        const result = await updateNavigationItem(item.id, item);
        if (!result.success || !result.item) {
          toast.error(result.error || t("feedback.saveItemFailed"));
          return;
        }
        setItems((current) => current.map((entry) => entry.id === item.id ? result.item as NavigationItem : entry));
        toast.success(t("feedback.itemSaved", { label: item.label }));
      } catch (error) {
        toast.error(getActionError(error, t("feedback.saveItemFailed")));
      }
    });
  };

  const deleteItem = (item: NavigationItem) => {
    if (!confirm(t("confirmDelete", { label: item.label }))) return;
    const withoutItem = (current: NavigationItem[]) => current.filter((entry) => entry.id !== item.id && entry.parentId !== item.id);
    if (contentLocale !== "th") {
      setPendingTemplates((current) => ({ ...current, [contentLocale]: withoutItem(current[contentLocale] ?? items) }));
      return;
    }
    startTransition(async () => {
      try {
        const result = await deleteNavigationItem(item.id);
        if (!result.success) {
          toast.error(result.error || t("feedback.deleteFailed"));
          return;
        }
        setItems(withoutItem);
        toast.success(t("feedback.itemDeleted", { label: item.label }));
      } catch (error) {
        toast.error(getActionError(error, t("feedback.deleteFailed")));
      }
    });
  };

  const createItem = (data: { label: string; url: string; parentId: string | null; order: number }) => {
    if (!data.label.trim() || !data.url.trim()) {
      toast.error(t("feedback.labelAndUrlRequired"));
      return;
    }
    const normalized = { ...data, label: data.label.trim(), url: data.url.trim() };
    startTransition(async () => {
      try {
        if (contentLocale !== "th") {
          const item: NavigationItem = { ...normalized, id: `locale-${crypto.randomUUID()}` };
          setPendingTemplates((current) => ({ ...current, [contentLocale]: [...(current[contentLocale] ?? items), item] }));
          toast.success(t("feedback.itemAdded"));
        } else {
          const result = await createNavigationItem(normalized);
          if (!result.success || !result.item) {
            toast.error(result.error || t("feedback.createFailed"));
            return;
          }
          setItems((current) => [...current, result.item as NavigationItem]);
          toast.success(t("feedback.itemCreated"));
        }
      } catch (error) {
        toast.error(getActionError(error, t("feedback.createFailed")));
      }
    });
  };

  const seedMenu = () => startTransition(async () => {
    try {
      const result = await seedDefaultNavigationItems();
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      if (result.items) setItems(result.items as NavigationItem[]);
      toast.success(t("feedback.defaultCreated"));
    } catch (error) {
      toast.error(getActionError(error, t("feedback.createFailed")));
    }
  });

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-[#0F172A] p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-black text-white">{t("workspace.title")}</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">{t("workspace.description", { language: localeLabels[contentLocale] })}</p>
        </div>
        <LocalizationApplyControl locale={contentLocale} onLocaleChange={onLocaleChange} onApply={applyTemplate} isPending={isPending} isDisabled={contentLocale === "th" || !hasPendingLocalization} label={t("actions.applyPreset")} />
      </section>

      <section className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Settings className="size-4 text-[#B7D1EA]" /><h2 className="text-sm font-black text-gray-100">{t("hierarchy.title")}</h2></div>
            {activeItems.length === 0 && <button type="button" onClick={seedMenu} disabled={isPending} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#B7D1EA] px-4 text-xs font-black text-slate-950 disabled:opacity-50"><Database className="size-4" />{t("actions.createDefault")}</button>}
          </div>

          {activeItems.length === 0 ? (
            <div className="py-14 text-center"><HelpCircle className="mx-auto mb-3 size-10 text-slate-500" /><p className="text-sm font-semibold text-slate-300">{t("empty.title")}</p><p className="mt-1 text-xs text-slate-500">{t("empty.description")}</p></div>
          ) : (
            <div className="space-y-5">
              {parentItems.map((parent) => {
                const children = activeItems.filter((item) => item.parentId === parent.id).sort((a, b) => a.order - b.order);
                return <div key={parent.id} className="space-y-3 rounded-xl border border-[#1E293B] bg-[#0B1121]/50 p-4">
                  <div className="flex items-center gap-2"><span className="rounded-full bg-[#B7D1EA]/15 px-2.5 py-1 text-[10px] font-black text-[#B7D1EA]">{t("hierarchy.category")}</span><span className="text-xs font-semibold text-slate-400">{t("hierarchy.directEdit")}</span></div>
                  <MenuItemEditor item={parent} parentItems={parentItems} contentLocale={contentLocale} isPending={isPending} onChange={updateDraft} onSave={saveItem} onDelete={deleteItem} />
                  <div className="space-y-3 pt-2">
                    {children.map((child) => <MenuItemEditor key={child.id} item={child} parentItems={parentItems} contentLocale={contentLocale} isPending={isPending} onChange={updateDraft} onSave={saveItem} onDelete={deleteItem} />)}
                    {children.length === 0 && <p className="py-2 text-xs text-slate-500">{t("empty.category")}</p>}
                    <AddMenuItemInline parentId={parent.id} contentLocale={contentLocale} isPending={isPending} label={t("actions.addToCategory")} onCreate={createItem} />
                  </div>
                </div>;
              })}
              <AddMenuItemInline parentId={null} contentLocale={contentLocale} isPending={isPending} label={t("actions.addTopLevelCategory")} onCreate={createItem} />
            </div>
          )}
      </section>
    </div>
  );
}
