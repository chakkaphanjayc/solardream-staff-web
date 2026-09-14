"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  Plus, Trash2, Edit3, Send, X,
  FileText, Globe, EyeOff, Calendar, Download, Upload,
  Save, UserCheck, Loader2
} from "@/components/ui/icons";
import {
  adminCreateArticle,
  adminUpdateArticle,
  adminDeleteArticle,
  adminDeleteArticles,
  adminImportArticles,
  adminUploadArticleImage
} from "@/app/actions/articles";
import ConfirmDeleteModal from "@/components/layout/ConfirmDeleteModal";
import RichTextEditor from "@/components/forum/RichTextEditor";
import ProgressiveImage from "@/components/ui/progressive-image";
import { downloadCsv, readCsvRows } from "@/lib/clientCsv";
import { GsapReveal } from "@/components/ui/GsapMotion";

type ArticleItem = {
  id: string;
  title: string;
  content: string;
  coverImage: string | null;
  writer?: string | null;
  publishedAt?: Date | string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImage?: string | null;
  isPublished: boolean;
  createdAt: Date;
  author: { id: string; name: string | null; email: string };
};

function mergeArticles(current: ArticleItem[], incoming: ArticleItem[]) {
  const incomingIds = new Set(incoming.map((article) => article.id));
  return [
    ...incoming,
    ...current.filter((article) => !incomingIds.has(article.id)),
  ];
}

function formatDatetimeLocal(dateVal?: Date | string | null): string {
  if (!dateVal) return new Date().toISOString().slice(0, 16);
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

export default function AdminArticlesClient({
  initialArticles
}: {
  initialArticles: ArticleItem[];
}) {
  const [mounted, setMounted] = useState(false);
  const [articles, setArticles] = useState<ArticleItem[]>(initialArticles);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const importInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Form states
  const [formOpen, setFormOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<ArticleItem | null>(null);
  const [form, setForm] = useState({
    title: "",
    content: "",
    coverImage: "",
    writer: "",
    publishedAt: new Date().toISOString().slice(0, 16),
    metaTitle: "",
    metaDescription: "",
    ogImage: "",
    isPublished: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  // Delete modal states
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const openNew = () => {
    setEditingArticle(null);
    setForm({
      title: "",
      content: "",
      coverImage: "",
      writer: "",
      publishedAt: formatDatetimeLocal(new Date()),
      metaTitle: "",
      metaDescription: "",
      ogImage: "",
      isPublished: false
    });
    setFormOpen(true);
  };

  const openEdit = (art: ArticleItem) => {
    setEditingArticle(art);
    setForm({
      title: art.title,
      content: art.content,
      coverImage: art.coverImage || "",
      writer: art.writer || "",
      publishedAt: formatDatetimeLocal(art.publishedAt || art.createdAt),
      metaTitle: art.metaTitle || "",
      metaDescription: art.metaDescription || "",
      ogImage: art.ogImage || "",
      isPublished: art.isPublished
    });
    setFormOpen(true);
  };

  const handleCoverUpload = async (file: File) => {
    try {
      setIsUploadingCover(true);
      const formData = new FormData();
      formData.append("file", file);
      const res = await adminUploadArticleImage(formData);
      if (res.error || !res.url) {
        toast.error(res.error || "Failed to upload cover banner image.");
        return;
      }
      setForm(prev => ({ ...prev, coverImage: res.url }));
      toast.success("Cover banner image uploaded!");
    } catch {
      toast.error("Error uploading image file.");
    } finally {
      setIsUploadingCover(false);
    }
  };

  const submitArticleForm = async (shouldPublish: boolean) => {
    const cleanContent = form.content.replace(/<p><\/p>/g, "").trim();
    if (!form.title.trim() || !cleanContent) {
      toast.error("Title and content are required.");
      return;
    }

    setIsSubmitting(true);
    const payload = {
      title: form.title,
      content: form.content,
      coverImage: form.coverImage,
      writer: form.writer,
      publishedAt: form.publishedAt ? new Date(form.publishedAt) : new Date(),
      metaTitle: form.metaTitle,
      metaDescription: form.metaDescription,
      ogImage: form.ogImage,
      isPublished: shouldPublish
    };

    try {
      if (editingArticle) {
        const res = await adminUpdateArticle(editingArticle.id, payload);
        if (res.error) {
          toast.error(res.error);
        } else if (res.article) {
          toast.success(shouldPublish ? "Article published!" : "Saved as draft!");
          setArticles(prev => prev.map(a => a.id === editingArticle.id ? (res.article as ArticleItem) : a));
          setFormOpen(false);
        }
      } else {
        const res = await adminCreateArticle(payload);
        if (res.error) {
          toast.error(res.error);
        } else if (res.article) {
          toast.success(shouldPublish ? "Article published!" : "Saved as draft!");
          setArticles(prev => [(res.article as ArticleItem), ...prev]);
          setFormOpen(false);
        }
      }
    } catch {
      toast.error("Failed to save article.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitArticleForm(form.isPublished);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      const res = await adminDeleteArticle(deleteTargetId);
      if (res.success) {
        setArticles(articles.filter(a => a.id !== deleteTargetId));
        toast.success("Article deleted");
      }
    } catch {
      toast.error("Failed to delete article");
    } finally {
      setIsDeleting(false);
      setDeleteTargetId(null);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === articles.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(articles.map(a => a.id));
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected articles?`)) return;

    const res = await adminDeleteArticles(selectedIds);
    if (res.success) {
      toast.success(res.message || "Articles deleted");
      setArticles(prev => prev.filter(a => !selectedIds.includes(a.id)));
      setSelectedIds([]);
    } else {
      toast.error(res.error || "Failed to delete articles");
    }
  };

  const handleExport = (templateOnly = false) => {
    if (templateOnly) {
      const sample = [{
        Title: "Sample Article Title",
        Content: "<p>Sample article HTML body content...</p>",
        CoverImage: "https://images.unsplash.com/photo-1509391365360-2e959784a276",
        Writer: "Engineer Somchai",
        PublishedAt: new Date().toISOString(),
        MetaTitle: "SEO Meta Title",
        MetaDescription: "SEO Meta Description",
        OgImage: "https://images.unsplash.com/photo-1509391365360-2e959784a276",
        IsPublished: "true"
      }];
      downloadCsv(sample, "articles_import_template");
      return;
    }

    const rows = articles.map(a => ({
      ID: a.id,
      Title: a.title,
      Content: a.content,
      CoverImage: a.coverImage || "",
      Writer: a.writer || "",
      PublishedAt: a.publishedAt ? new Date(a.publishedAt).toISOString() : "",
      MetaTitle: a.metaTitle || "",
      MetaDescription: a.metaDescription || "",
      OgImage: a.ogImage || "",
      IsPublished: a.isPublished ? "true" : "false",
      CreatedAt: a.createdAt ? new Date(a.createdAt).toISOString() : ""
    }));
    downloadCsv(rows, "articles_export");
  };

  const handleImportFile = async (file: File) => {
    try {
      const rawRows = await readCsvRows(file);
      if (rawRows.length === 0) {
        toast.error("CSV file contains no data rows.");
        return;
      }

      const rowsData = rawRows.map(r => ({
        title: r.Title || r.title || "",
        content: r.Content || r.content || "",
        coverImage: r.CoverImage || r.coverImage || undefined,
        writer: r.Writer || r.writer || undefined,
        publishedAt: r.PublishedAt || r.publishedAt || undefined,
        metaTitle: r.MetaTitle || r.metaTitle || undefined,
        metaDescription: r.MetaDescription || r.metaDescription || undefined,
        ogImage: r.OgImage || r.ogImage || undefined,
        isPublished: (r.IsPublished || r.isPublished || "").toLowerCase() === "true"
      })).filter(row => row.title.trim() && row.content.trim());

      if (rowsData.length === 0) {
        toast.error("No valid articles found in CSV file.");
        return;
      }

      const res = await adminImportArticles(rowsData);
      if (res.error) {
        toast.error(res.error);
        return;
      }

      if (res.articles) {
        toast.success(`Imported ${res.articles.length} articles successfully!`);
        setArticles(prev => mergeArticles(prev, res.articles as ArticleItem[]));
      }
    } catch {
      toast.error("Failed to parse CSV file.");
    }
  };

  return (
    <div className="space-y-6">
      <input
        type="file"
        ref={importInputRef}
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleImportFile(file);
        }}
      />

      <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-5 shadow-none flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div>
          <h2 className="text-sm font-black text-gray-100 uppercase tracking-wider">Article Data Import / Export</h2>
          <p className="text-xs text-gray-400 font-semibold mt-1">Export, import CSV, or delete selected CMS articles.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => handleExport(true)} className="px-3 py-2 rounded-xl border border-[#1E293B] text-gray-400 text-[10px] font-black uppercase tracking-wider">Template</button>
          <button onClick={() => handleExport()} className="px-3 py-2 rounded-xl border border-[#1E293B] text-gray-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-2"><Download className="w-4 h-4" />CSV</button>
          <button onClick={() => importInputRef.current?.click()} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2"><Upload className="w-4 h-4" />Import</button>
          <button disabled={selectedIds.length === 0} onClick={handleBulkDelete} className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-200 text-rose-600 text-[10px] font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40"><Trash2 className="w-4 h-4" />Delete {selectedIds.length || ""}</button>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={toggleSelectAll}
          className="text-xs font-bold text-gray-400 hover:text-white transition-colors"
        >
          {selectedIds.length === articles.length ? "Deselect All" : "Select All"}
        </button>

        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-[#B7D1EA] hover:bg-[#99BFE3] text-[#0F172A] px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-none cursor-pointer"
        >
          <Plus className="w-4 h-4" /> New Article
        </button>
      </div>

      {formOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-[#0B1121]/90 backdrop-blur-md flex justify-center p-4 sm:p-6 md:p-10 overflow-y-auto w-screen h-screen top-0 left-0 animate-in fade-in duration-200">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-7xl bg-[#0F172A] border border-[#1E293B] rounded-3xl p-6 sm:p-8 md:p-10 space-y-6 shadow-2xl my-auto text-left"
          >
            <div className="flex items-center justify-between border-b border-[#1E293B] pb-5">
              <div className="space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#B7D1EA] bg-[#B7D1EA]/10 border border-[#B7D1EA]/25 px-3 py-1 rounded-full">
                  Article Authoring Workspace
                </span>
                <h3 className="text-2xl font-black text-white tracking-tight">
                  {editingArticle ? `Edit Article: ${editingArticle.title}` : "Create New Article"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-2.5 text-slate-400 hover:text-white rounded-2xl hover:bg-slate-800/80 transition-colors cursor-pointer border border-[#1E293B]"
                title="Close Editor"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Columns: Main Title & Enterprise Content Editor */}
              <div className="lg:col-span-2 space-y-5">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">
                    Article Title
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. Navigating Solar Rebates in 2026"
                    className="w-full bg-[#0B1121] border border-[#1E293B] rounded-2xl px-5 py-4 text-lg font-bold text-white focus:outline-none focus:border-[#B7D1EA] shadow-inner"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">
                    Article Body (Enterprise TipTap Block Editor)
                  </label>
                  <RichTextEditor
                    content={form.content}
                    onChange={html => setForm({ ...form, content: html })}
                  />
                </div>
              </div>

              {/* Right Column: Cover Image, Writer & SEO Metadata */}
              <div className="lg:col-span-1 space-y-5">
                {/* Cover Banner Image Box with Direct Upload */}
                <div className="rounded-2xl border border-[#1E293B] bg-[#0B1121] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-black text-[#B7D1EA] uppercase tracking-wider">
                      Cover Banner Image
                    </label>

                    <input
                      type="file"
                      ref={coverFileInputRef}
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) void handleCoverUpload(file);
                        e.target.value = "";
                      }}
                    />

                    <button
                      type="button"
                      disabled={isUploadingCover}
                      onClick={() => coverFileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#B7D1EA]/10 hover:bg-[#B7D1EA]/20 border border-[#B7D1EA]/30 text-[#B7D1EA] text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isUploadingCover ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{isUploadingCover ? "Uploading..." : "Upload File"}</span>
                    </button>
                  </div>

                  <input
                    type="url"
                    value={form.coverImage}
                    onChange={e => setForm({ ...form, coverImage: e.target.value })}
                    placeholder="Upload image file or paste CDN URL..."
                    className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
                  />

                  {form.coverImage && form.coverImage.trim() !== "" && (
                    <div className="mt-2 relative w-full h-44 rounded-xl overflow-hidden border border-[#1E293B]">
                      <ProgressiveImage
                        src={form.coverImage}
                        alt="Preview"
                        fill
                        sizes="100vw"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>

                {/* Writer & Publishing Schedule Card */}
                <div className="rounded-2xl border border-[#1E293B] bg-[#0B1121] p-5 space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#B7D1EA] flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-[#B7D1EA]" />
                    <span>Writer & Schedule</span>
                  </h4>

                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                      Writer / Author Name
                    </label>
                    <input
                      type="text"
                      value={form.writer}
                      onChange={e => setForm({ ...form, writer: e.target.value })}
                      placeholder="e.g. Engineer Somchai, SolarTech Editorial"
                      className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-[#B7D1EA]" />
                      <span>Publish Date & Time</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={form.publishedAt}
                      onChange={e => setForm({ ...form, publishedAt: e.target.value })}
                      className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
                    />
                  </div>
                </div>

                {/* SEO Metadata Box */}
                <div className="rounded-2xl border border-[#1E293B] bg-[#0B1121] p-5 space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#B7D1EA]">
                    SEO & Open Graph Metadata
                  </h4>

                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                      Meta Title (SEO)
                    </label>
                    <input
                      type="text"
                      value={form.metaTitle}
                      onChange={e => setForm({ ...form, metaTitle: e.target.value })}
                      placeholder="Defaults to Title if empty"
                      className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                      Social Share Image URL (OG Image)
                    </label>
                    <input
                      type="url"
                      value={form.ogImage}
                      onChange={e => setForm({ ...form, ogImage: e.target.value })}
                      placeholder="Defaults to Cover Image if empty"
                      className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                      Meta Description (Search Snippet)
                    </label>
                    <textarea
                      rows={3}
                      value={form.metaDescription}
                      onChange={e => setForm({ ...form, metaDescription: e.target.value })}
                      placeholder="Summary snippet for search engines..."
                      className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#B7D1EA] resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#1E293B] pt-5 mt-6">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="w-full sm:w-auto px-5 py-3 text-xs font-black uppercase tracking-wider text-gray-400 hover:text-white border border-[#1E293B] rounded-xl transition-all cursor-pointer hover:bg-slate-800"
              >
                Cancel & Discard
              </button>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                {/* Save as Draft Button */}
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void submitArticleForm(false)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-[#1E293B] hover:bg-[#334155] text-gray-200 border border-[#334155] px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4 text-amber-400" />
                  <span>{isSubmitting ? "Saving..." : "Save as Draft"}</span>
                </button>

                {/* Publish Article Button */}
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void submitArticleForm(true)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-[#B7D1EA] hover:bg-[#99BFE3] text-[#0F172A] px-7 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 shadow-md cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmitting ? "Saving..." : editingArticle ? "Update & Publish" : "Publish Article"}</span>
                </button>
              </div>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Articles Grid / List */}
      <div className="grid grid-cols-1 gap-4">
        {articles.map((art) => (
          <div
            key={art.id}
            className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between shadow-none hover:shadow-none transition-all"
          >
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <input
                type="checkbox"
                checked={selectedIds.includes(art.id)}
                onChange={() => toggleSelected(art.id)}
                className="w-4 h-4 rounded border-[#1E293B] text-[#B7D1EA] focus:ring-[#B7D1EA]"
              />
              {art.coverImage && art.coverImage.trim() !== "" ? (
                <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-[#1E293B]">
                  <ProgressiveImage
                    src={art.coverImage}
                    alt={art.title}
                    fill
                    sizes="64px"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl bg-[#0B1121] border border-[#1E293B] flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 text-gray-500" />
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                      art.isPublished
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}
                  >
                    {art.isPublished ? <Globe className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    {art.isPublished ? "Published" : "Draft"}
                  </span>

                  {art.writer && (
                    <span className="text-[10px] font-bold text-gray-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                      By {art.writer}
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-gray-100 truncate">{art.title}</h3>

                <p className="text-[10px] text-gray-400 font-medium">
                  {new Date(art.publishedAt || art.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                  {" · "}
                  Author: {art.author.name || art.author.email}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end border-t md:border-t-0 pt-3 md:pt-0 border-[#1E293B]">
              <button
                onClick={() => openEdit(art)}
                className="p-2 text-gray-400 hover:text-[#B7D1EA] hover:bg-[#B7D1EA]/10 rounded-xl transition-all cursor-pointer"
                title="Edit"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDeleteTargetId(art.id);
                }}
                className="p-2 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {articles.length === 0 && (
          <div className="text-center py-16 bg-[#0B1121] rounded-2xl border border-dashed border-[#1E293B]">
            <FileText className="w-10 h-10 text-slate-500 mx-auto mb-3" />
            <p className="text-sm font-bold text-gray-400">No articles yet.</p>
            <p className="text-xs text-gray-500 mt-1">Start writing guides and announcements above!</p>
          </div>
        )}
      </div>

      <ConfirmDeleteModal
        isOpen={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={confirmDelete}
        isDeleting={isDeleting}
        title="Delete Article"
        message="Are you sure you want to delete this article? This action cannot be undone."
      />
    </div>
  );
}
