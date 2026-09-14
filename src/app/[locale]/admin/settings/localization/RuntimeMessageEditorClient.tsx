"use client";

import { type ChangeEvent, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  Languages,
  Lock,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Upload,
  UserCheck,
  X,
} from "@/components/ui/icons";
import { toast } from "sonner";
import {
  importRuntimeMessageOverrides,
  updateRuntimeMessageOverrides,
  type RuntimeMessageEditorData,
  type RuntimeMessageImport,
} from "@/app/actions/systemSettings";
import { ContentLocaleTabs } from "@/components/admin/ContentLocaleTabs";
import { localeLabels, locales, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

type GlobalSearchResult = {
  locale: Locale;
  path: string;
  value: string;
};

function namespaceFor(path: string) {
  return path.split(".")[0] ?? "General";
}

function subCategoryFor(path: string) {
  const parts = path.split(".");
  return parts.length > 2 ? parts[1] : "General";
}

function groupForNamespace(namespace: string) {
  if (/^(Admin|Build|Wizard|Navigation|Localization|Line)/.test(namespace)) return "Admin console";
  if (/^(Catalog|Configurator|Weather|Energy|Home)/.test(namespace)) return "Solar planning";
  if (/^(Proposal|Project|Payment|Checkout|MyAssets|Profile)/.test(namespace)) return "Customer portal";
  if (/^(Auth|Register|Verification|Security)/.test(namespace)) return "Account & security";
  if (/^(Footer|Navbar|Cookie|Global|Agency)/.test(namespace)) return "Shared website";
  return "Website pages";
}

function groupIcon(group: string) {
  switch (group) {
    case "Admin console": return ShieldCheck;
    case "Solar planning": return Sun;
    case "Customer portal": return UserCheck;
    case "Account & security": return Lock;
    case "Shared website": return Globe;
    default: return FileText;
  }
}

function isMessageImport(value: unknown): value is { messages: RuntimeMessageImport } {
  if (value === null || typeof value !== "object" || !("messages" in value)) return false;
  const candidate = value as { messages?: unknown };
  return candidate.messages !== null && typeof candidate.messages === "object";
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim() || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="rounded bg-[#B7D1EA]/25 px-1 py-0.5 font-semibold text-[#B7D1EA] ring-1 ring-[#B7D1EA]/40">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export default function RuntimeMessageEditorClient({
  initialData,
  availableLocales,
}: {
  initialData: RuntimeMessageEditorData;
  availableLocales: readonly Locale[];
}) {
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement>(null);
  const initialLocale = availableLocales.includes("th") ? "th" : availableLocales[0] ?? "th";
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [namespace, setNamespace] = useState(() => namespaceFor(Object.keys(initialData[initialLocale].base)[0] ?? "General"));
  const [search, setSearch] = useState("");
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [collapsedSubCategories, setCollapsedSubCategories] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<Locale, Record<string, string>>>(() => Object.fromEntries(
    locales.map((item) => [item, { ...initialData[item].resolved }]),
  ) as Record<Locale, Record<string, string>>);
  const [changes, setChanges] = useState<Record<Locale, Record<string, string | null>>>(() => Object.fromEntries(
    locales.map((item) => [item, {}]),
  ) as Record<Locale, Record<string, string | null>>);
  const [isPending, startTransition] = useTransition();

  const namespaces = useMemo(
    () => Array.from(new Set(Object.keys(initialData[locale].base).map(namespaceFor))).sort(),
    [initialData, locale],
  );

  const namespaceKeyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    Object.keys(draft[locale]).forEach((path) => {
      const ns = namespaceFor(path);
      counts.set(ns, (counts.get(ns) ?? 0) + 1);
    });
    return counts;
  }, [draft, locale]);

  const namespaceGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    namespaces.forEach((item) => {
      const group = groupForNamespace(item);
      groups.set(group, [...(groups.get(group) ?? []), item]);
    });
    return Array.from(groups.entries());
  }, [namespaces]);

  const groupTotalCounts = useMemo(() => {
    const counts = new Map<string, number>();
    namespaceGroups.forEach(([group, items]) => {
      const total = items.reduce((sum, item) => sum + (namespaceKeyCounts.get(item) ?? 0), 0);
      counts.set(group, total);
    });
    return counts;
  }, [namespaceGroups, namespaceKeyCounts]);

  const entries = useMemo(() => Object.entries(draft[locale])
    .filter(([path]) => namespaceFor(path) === namespace), [draft, locale, namespace]);

  const entriesBySubCategory = useMemo(() => {
    const map = new Map<string, Array<[string, string]>>();
    entries.forEach(([path, value]) => {
      const subCat = subCategoryFor(path);
      map.set(subCat, [...(map.get(subCat) ?? []), [path, value]]);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  const globalResults = useMemo<GlobalSearchResult[]>(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return [];

    return availableLocales.flatMap((item) => Object.entries(draft[item])
      .filter(([path, value]) => path.toLocaleLowerCase().includes(query) || value.toLocaleLowerCase().includes(query))
      .map(([path, value]) => ({ locale: item, path, value })))
      .slice(0, 100);
  }, [availableLocales, draft, search]);

  const pendingCount = Object.keys(changes[locale]).length;

  const switchLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    const nextNamespaces = Array.from(new Set(Object.keys(initialData[nextLocale].base).map(namespaceFor))).sort();
    if (!nextNamespaces.includes(namespace)) setNamespace(nextNamespaces[0] ?? "General");
  };

  const openSearchResult = (result: GlobalSearchResult) => {
    switchLocale(result.locale);
    const targetNs = namespaceFor(result.path);
    setNamespace(targetNs);
    setHighlightedPath(result.path);
    setSearch("");

    const group = groupForNamespace(targetNs);
    setCollapsedGroups((current) => ({ ...current, [group]: false }));

    const subCat = subCategoryFor(result.path);
    setCollapsedSubCategories((current) => ({ ...current, [subCat]: false }));

    setTimeout(() => {
      const cardId = `msg-card-${encodeURIComponent(result.path)}`;
      const el = document.getElementById(cardId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const inputEl = el.querySelector("textarea");
        if (inputEl) {
          inputEl.focus({ preventScroll: true });
        }
      }
    }, 150);

    setTimeout(() => {
      setHighlightedPath((current) => (current === result.path ? null : current));
    }, 4500);
  };

  const updateEntry = (path: string, value: string) => {
    setDraft((current) => ({ ...current, [locale]: { ...current[locale], [path]: value } }));
    setChanges((current) => ({ ...current, [locale]: { ...current[locale], [path]: value } }));
  };

  const resetEntry = (path: string) => {
    setDraft((current) => ({ ...current, [locale]: { ...current[locale], [path]: initialData[locale].base[path] } }));
    setChanges((current) => ({ ...current, [locale]: { ...current[locale], [path]: null } }));
  };

  const expandAllGroups = () => {
    setCollapsedGroups({});
  };

  const collapseAllGroups = () => {
    const activeGroup = groupForNamespace(namespace);
    const nextState: Record<string, boolean> = {};
    namespaceGroups.forEach(([group]) => {
      if (group !== activeGroup) {
        nextState[group] = true;
      }
    });
    setCollapsedGroups(nextState);
  };

  const toggleSubCategory = (subCat: string) => {
    setCollapsedSubCategories((current) => ({ ...current, [subCat]: !current[subCat] }));
  };

  const notifyWebsiteTabs = () => {
    window.localStorage.setItem("solardream_runtime_messages_version", String(Date.now()));
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("solardream_runtime_messages");
      channel.postMessage("updated");
      channel.close();
    }
  };

  const save = () => startTransition(async () => {
    try {
      const result = await updateRuntimeMessageOverrides({ locale, changes: changes[locale] });
      if (!result.success) {
        toast.error(result.error ?? "Unable to save localized text.");
        return;
      }

      setChanges((current) => ({ ...current, [locale]: {} }));
      notifyWebsiteTabs();
      toast.success("Localized text published to the website.");
    } catch (error) {
      console.error("Runtime message save error:", error);
      toast.error("Unable to save localized text. Please try again.");
    }
  });

  const exportMessages = () => {
    const payload = {
      format: "solardream-runtime-messages",
      version: 1,
      exportedAt: new Date().toISOString(),
      messages: draft,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `solardream-localization-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importMessages = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    void file.text().then((text) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        toast.error("Choose a valid JSON localization export.");
        return;
      }
      if (!isMessageImport(parsed)) {
        toast.error("This file is not a SolarDream localization export.");
        return;
      }

      startTransition(async () => {
        try {
          const result = await importRuntimeMessageOverrides({ messages: parsed.messages });
          if (!result.success) {
            toast.error(result.error ?? "Unable to import localized text.");
            return;
          }
          notifyWebsiteTabs();
          toast.success("Localization import published to the website.");
          router.refresh();
        } catch (error) {
          console.error("Runtime message import error:", error);
          toast.error("Unable to import localized text. Please try again.");
        }
      });
    }).catch(() => toast.error("Unable to read the selected file."));
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-[#0F172A] p-5 sm:p-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 border-b border-slate-800 pb-5">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#B7D1EA]/15 text-[#B7D1EA]"><Languages className="size-5" /></span>
          <div>
            <h2 className="text-lg font-black text-white">Website text</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">Search every language and message key, edit page text, then publish changes to newly rendered pages immediately.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportMessages} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-bold text-slate-200 transition hover:border-[#B7D1EA] hover:text-white"><Download className="size-4" /> Export</button>
          <button type="button" onClick={() => importInputRef.current?.click()} disabled={isPending} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-bold text-slate-200 transition hover:border-[#B7D1EA] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"><Upload className="size-4" /> Import</button>
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={importMessages} className="sr-only" />
        </div>
      </div>

      {/* Main 2-Column Sidebar & Editor Layout */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)] gap-6 items-start">
        {/* Left Sidebar Category Navigation Tree */}
        <aside className="sticky top-20 z-10 flex flex-col gap-2 rounded-2xl border border-slate-800 bg-[#0B1121] p-3.5 max-h-[calc(100vh-6rem)] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" aria-label="Message areas">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 px-1">
            <div className="flex items-center gap-2">
              <FolderOpen className="size-4 text-[#B7D1EA]" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-300">Categories</span>
            </div>
            <div className="flex gap-2 text-[10px] font-bold">
              <button type="button" onClick={expandAllGroups} className="text-[#B7D1EA] transition hover:underline">Expand all</button>
              <span className="text-slate-600">|</span>
              <button type="button" onClick={collapseAllGroups} className="text-slate-400 transition hover:underline">Collapse all</button>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            {namespaceGroups.map(([group, items]) => {
              const containsActiveNamespace = items.includes(namespace);
              const isCollapsed = collapsedGroups[group] && !containsActiveNamespace;
              const Icon = groupIcon(group);
              const totalCount = groupTotalCounts.get(group) ?? 0;

              return (
                <div key={group} className="rounded-xl border border-slate-800/80 bg-[#0F172A]/80 p-1.5">
                  <button
                    type="button"
                    onClick={() => setCollapsedGroups((current) => ({ ...current, [group]: !current[group] }))}
                    aria-expanded={!isCollapsed}
                    className="flex min-h-9 w-full items-center justify-between rounded-lg px-2 text-left text-xs font-bold text-slate-300 transition hover:bg-slate-800/80 hover:text-white"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Icon className="size-4 shrink-0 text-[#B7D1EA]" />
                      <span className="truncate">{group}</span>
                      <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-normal text-slate-400">{totalCount}</span>
                    </span>
                    {isCollapsed ? <ChevronRight className="size-4 shrink-0 text-slate-500" /> : <ChevronDown className="size-4 shrink-0 text-slate-500" />}
                  </button>

                  {!isCollapsed && (
                    <div className="my-1 space-y-1 border-l-2 border-slate-800/90 ml-3.5 pl-2">
                      {items.map((item) => {
                        const isSelected = item === namespace;
                        const count = namespaceKeyCounts.get(item) ?? 0;
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              setNamespace(item);
                              setSearch("");
                            }}
                            className={cn(
                              "flex min-h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-xs transition-colors",
                              isSelected
                                ? "bg-[#B7D1EA] font-extrabold text-slate-950 shadow-md"
                                : "font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
                            )}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              {isSelected ? <FolderOpen className="size-3.5 shrink-0 text-slate-900" /> : <Folder className="size-3.5 shrink-0 text-slate-400" />}
                              <span className="truncate">{item}</span>
                            </span>
                            <span className={cn("text-[10px] rounded-full px-1.5 py-0.5", isSelected ? "bg-slate-900/20 font-bold text-slate-900" : "bg-slate-900/60 font-normal text-slate-400")}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right Main Content Area */}
        <div className="min-w-0 space-y-4">
          {/* Combined Floating Anchor Header: Search Input & Language Selector */}
          <div className="sticky top-20 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-[#0F172A]/95 p-3 shadow-2xl backdrop-blur-md">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search all languages, text, or message keys..."
                className="min-h-11 w-full rounded-xl border border-slate-700 bg-[#0B1121] py-2 pl-10 pr-9 text-sm text-white outline-none transition focus:border-[#B7D1EA]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              )}
            </label>
            <ContentLocaleTabs
              locale={locale}
              onChange={switchLocale}
              availableLocales={availableLocales}
              className="shrink-0 rounded-xl bg-[#0B1121] p-1 shadow-inner border border-slate-800"
            />
          </div>

          {/* Search Results View */}
          {search.trim() ? (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {globalResults.length} global result{globalResults.length === 1 ? "" : "s"}{globalResults.length === 100 ? "+" : ""}
              </p>
              {globalResults.map((result) => (
                <button
                  key={`${result.locale}-${result.path}`}
                  type="button"
                  onClick={() => openSearchResult(result)}
                  className="group block w-full rounded-xl border border-slate-800 bg-[#0B1121] px-4 py-3 text-left transition hover:border-[#B7D1EA]/50 hover:bg-slate-800/80"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#B7D1EA]">
                    <span className="flex items-center gap-2">
                      <span className="rounded-full bg-[#B7D1EA]/15 px-2 py-0.5 text-[10px] text-[#B7D1EA]">{localeLabels[result.locale]}</span>
                      <span className="font-mono text-slate-400">
                        <HighlightText text={result.path} query={search} />
                      </span>
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 group-hover:text-[#B7D1EA] transition-colors">Click to locate & edit &rarr;</span>
                  </span>
                  <span className="mt-2 block truncate text-sm text-slate-200">
                    <HighlightText text={result.value} query={search} />
                  </span>
                </button>
              ))}
              {globalResults.length === 0 && (
                <p className="rounded-xl bg-[#0B1121] p-5 text-sm text-slate-300">No text or message keys match this search.</p>
              )}
            </div>
          ) : (
            /* Sub-category Accordions / Message Cards List */
            <div className="space-y-6">
              {entriesBySubCategory.map(([subCat, subEntries]) => {
                const isSubCollapsed = collapsedSubCategories[subCat];
                return (
                  <div key={subCat} className="space-y-3">
                    {/* Subcategory Accordion Header */}
                    <button
                      type="button"
                      onClick={() => toggleSubCategory(subCat)}
                      className="flex w-full items-center justify-between rounded-xl bg-slate-900/90 border border-slate-800 px-3.5 py-2.5 text-left transition hover:bg-slate-800/90"
                    >
                      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-300">
                        <span className="h-2 w-2 rounded-full bg-[#B7D1EA]" />
                        <span>{namespace} &rsaquo; {subCat}</span>
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-normal text-slate-400">{subEntries.length} items</span>
                      </span>
                      {isSubCollapsed ? <ChevronRight className="size-4 text-slate-500" /> : <ChevronDown className="size-4 text-slate-500" />}
                    </button>

                    {!isSubCollapsed && (
                      <div className="space-y-4">
                        {subEntries.map(([path, value]) => {
                          const isOverridden = changes[locale][path] !== undefined || value !== initialData[locale].base[path];
                          const sourceValue = initialData.en.resolved[path] ?? initialData.en.base[path] ?? "";
                          const isHighlighted = highlightedPath === path;

                          return (
                            <label
                              id={`msg-card-${encodeURIComponent(path)}`}
                              key={path}
                              className={cn(
                                "block rounded-xl border p-4 transition-all duration-300",
                                isHighlighted
                                  ? "border-[#B7D1EA] bg-[#B7D1EA]/10 ring-2 ring-[#B7D1EA]/60 shadow-xl shadow-[#B7D1EA]/15"
                                  : "border-slate-800 bg-[#0B1121] hover:border-slate-700"
                              )}
                            >
                              <span className="flex items-center justify-between gap-3 text-xs font-bold text-slate-300">
                                <span className="flex items-center gap-2 truncate">
                                  <span className="font-mono text-slate-300 truncate">{path}</span>
                                  {isHighlighted && (
                                    <span className="inline-flex items-center gap-1 rounded bg-[#B7D1EA] px-2 py-0.5 text-[10px] font-black uppercase text-slate-950 shadow">
                                      <Sparkles className="size-3" /> Target
                                    </span>
                                  )}
                                </span>
                                {isOverridden && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      resetEntry(path);
                                    }}
                                    className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-[#B7D1EA] hover:bg-slate-800"
                                  >
                                    <RotateCcw className="size-3.5" /> Reset
                                  </button>
                                )}
                              </span>

                              <div className="mt-2 grid gap-3 xl:grid-cols-2">
                                <div className="rounded-lg bg-slate-900/70 px-3 py-2 text-sm leading-6 text-slate-300">
                                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">English source</span>
                                  {sourceValue}
                                </div>
                                <div>
                                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#B7D1EA]">{localeLabels[locale]} text</span>
                                  <textarea
                                    value={value}
                                    onChange={(event) => updateEntry(path, event.target.value)}
                                    rows={Math.min(6, Math.max(2, Math.ceil(value.length / 88)))}
                                    className="w-full rounded-lg border border-slate-700 bg-[#0F172A] px-3 py-2 text-sm leading-6 text-white outline-none transition focus:border-[#B7D1EA]"
                                  />
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {entries.length === 0 && <p className="rounded-xl bg-[#0B1121] p-5 text-sm text-slate-300">No text is available in this area.</p>}
            </div>
          )}

          <div className="sticky bottom-4 z-10 mt-5 flex justify-end">
            <button
              type="button"
              disabled={isPending || pendingCount === 0}
              onClick={save}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#B7D1EA] px-5 text-sm font-bold text-slate-950 shadow-lg shadow-black/20 transition hover:bg-[#a5c2de] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="size-4" /> {isPending ? "Publishing…" : `Publish ${pendingCount || ""} change${pendingCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
