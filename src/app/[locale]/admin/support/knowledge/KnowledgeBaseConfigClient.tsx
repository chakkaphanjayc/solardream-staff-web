"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Plus,
  Trash2,
  Edit2,
  Save,
  Video,
  HelpCircle,
  Sparkles,
  ArrowUpRight,
  Eye,
  RefreshCw,
  X,
  Check,
} from "@/components/ui/icons";
import { updateKnowledgeBaseConfigAction } from "@/app/actions/support";
import type { KnowledgeBaseConfig, FAQItem, TutorialItem, TicketCategory } from "@/schemas/support";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

interface KnowledgeBaseConfigClientProps {
  initialConfig: KnowledgeBaseConfig;
}

export default function KnowledgeBaseConfigClient({ initialConfig }: KnowledgeBaseConfigClientProps) {
  const [kbConfig, setKbConfig] = useState<KnowledgeBaseConfig>(initialConfig);
  const [activeTab, setActiveTab] = useState<"faqs" | "tutorials">("faqs");
  const [isSaving, setIsSaving] = useState(false);

  // FAQ Modal state
  const [editingFaq, setEditingFaq] = useState<FAQItem | null>(null);
  const [isFaqModalOpen, setIsFaqModalOpen] = useState(false);

  // Tutorial Modal state
  const [editingTutorial, setEditingTutorial] = useState<TutorialItem | null>(null);
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState(false);
  const faqSelection = useAdminSelection(kbConfig.faqs.map((faq) => faq.id));
  const tutorialSelection = useAdminSelection(kbConfig.tutorials.map((tutorial) => tutorial.id));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await updateKnowledgeBaseConfigAction(kbConfig);
      if (res.success) {
        toast.success("Knowledge Base configuration published successfully!");
      } else {
        toast.error(res.error || "Failed to publish Knowledge Base.");
      }
    } catch {
      toast.error("Unexpected error saving KB config.");
    } finally {
      setIsSaving(false);
    }
  };

  // FAQ Actions
  const handleSaveFaq = () => {
    if (!editingFaq || !editingFaq.question.trim() || !editingFaq.answer.trim()) {
      toast.error("Please fill in question and answer.");
      return;
    }

    setKbConfig((prev) => {
      const exists = prev.faqs.some((f) => f.id === editingFaq.id);
      const updatedFaqs = exists
        ? prev.faqs.map((f) => (f.id === editingFaq.id ? editingFaq : f))
        : [...prev.faqs, editingFaq];
      return { ...prev, faqs: updatedFaqs };
    });

    setIsFaqModalOpen(false);
    setEditingFaq(null);
  };

  const handleDeleteFaq = (id: string) => {
    setKbConfig((prev) => ({
      ...prev,
      faqs: prev.faqs.filter((f) => f.id !== id),
    }));
    faqSelection.remove([id]);
    toast.success("FAQ removed.");
  };

  const handleBulkDeleteFaqs = () => {
    const ids = new Set(faqSelection.selectedIds);
    if (ids.size === 0 || !window.confirm(`Remove ${ids.size} selected FAQs?`)) return;
    setKbConfig((prev) => ({ ...prev, faqs: prev.faqs.filter((faq) => !ids.has(faq.id)) }));
    faqSelection.clear();
    toast.success(`${ids.size} FAQs removed.`);
  };

  // Tutorial Actions
  const handleSaveTutorial = () => {
    if (!editingTutorial || !editingTutorial.title.trim() || !editingTutorial.videoUrl.trim()) {
      toast.error("Please fill in title and video URL.");
      return;
    }

    setKbConfig((prev) => {
      const exists = prev.tutorials.some((t) => t.id === editingTutorial.id);
      const updatedTutorials = exists
        ? prev.tutorials.map((t) => (t.id === editingTutorial.id ? editingTutorial : t))
        : [...prev.tutorials, editingTutorial];
      return { ...prev, tutorials: updatedTutorials };
    });

    setIsTutorialModalOpen(false);
    setEditingTutorial(null);
  };

  const handleDeleteTutorial = (id: string) => {
    setKbConfig((prev) => ({
      ...prev,
      tutorials: prev.tutorials.filter((t) => t.id !== id),
    }));
    tutorialSelection.remove([id]);
    toast.success("Video tutorial removed.");
  };

  const handleBulkDeleteTutorials = () => {
    const ids = new Set(tutorialSelection.selectedIds);
    if (ids.size === 0 || !window.confirm(`Remove ${ids.size} selected video tutorials?`)) return;
    setKbConfig((prev) => ({ ...prev, tutorials: prev.tutorials.filter((tutorial) => !ids.has(tutorial.id)) }));
    tutorialSelection.clear();
    toast.success(`${ids.size} video tutorials removed.`);
  };

  return (
    <div className="space-y-6 font-urbanist pb-12">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-[#0F172A] p-6 text-white shadow-md">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#B7D1EA]/30 bg-[#B7D1EA]/10 px-3 py-1 text-xs font-bold text-[#B7D1EA]">
            <BookOpen className="h-3.5 w-3.5" />
            Knowledge Base Manager
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl text-white">
            Knowledge Base & FAQ Config
          </h1>
          <p className="mt-1 text-xs font-semibold text-slate-300 sm:text-sm">
            Configure popular FAQs, instructional video guides, and inverter diagnostic guides.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-xl bg-[#B7D1EA] px-5 py-3 text-sm font-black text-[#0F172A] shadow-md transition-all hover:bg-[#99BFE3] hover:shadow-lg active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSaving ? "Publishing..." : "Publish Knowledge Base"}
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("faqs")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === "faqs"
                ? "bg-[#0F172A] text-white shadow-xs"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <HelpCircle className="h-4 w-4" />
            FAQs ({kbConfig.faqs.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("tutorials")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === "tutorials"
                ? "bg-[#0F172A] text-white shadow-xs"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <Video className="h-4 w-4" />
            Video Tutorials ({kbConfig.tutorials.length})
          </button>
        </div>

        {activeTab === "faqs" ? (
          <button
            type="button"
            onClick={() => {
              setEditingFaq({
                id: `faq-${Date.now()}`,
                question: "",
                answer: "",
                category: "INVERTER",
                isFeatured: true,
                order: kbConfig.faqs.length + 1,
              });
              setIsFaqModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F172A] px-4 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add New FAQ
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingTutorial({
                id: `tut-${Date.now()}`,
                title: "",
                description: "",
                duration: "5 mins",
                videoUrl: "https://www.youtube.com/results?search_query=solar+inverter+troubleshooting",
                category: "INVERTER",
                tone: "bg-[#B7D1EA]/30 text-[#0F172A]",
                isPublished: true,
              });
              setIsTutorialModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F172A] px-4 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Video Tutorial
          </button>
        )}
      </div>

      {/* Tab 1: FAQs Management */}
      {activeTab === "faqs" && (
        <div className="space-y-4">
          <AdminBulkActionBar
            selectedCount={faqSelection.selectedCount}
            visibleCount={kbConfig.faqs.length}
            allVisibleSelected={faqSelection.allVisibleSelected}
            someVisibleSelected={faqSelection.someVisibleSelected}
            onToggleVisible={faqSelection.toggleVisible}
            onClear={faqSelection.clear}
            actions={[{ id: "delete", label: "Remove selected", icon: Trash2, tone: "danger", onClick: handleBulkDeleteFaqs }]}
          />
          {kbConfig.faqs.map((faq, index) => (
            <div
              key={faq.id}
              className="flex items-start justify-between gap-4 rounded-md border border-[#30363d] bg-[#161b22] p-5 shadow-sm transition-all hover:border-[#8b949e]"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <AdminSelectionCheckbox
                  checked={faqSelection.isSelected(faq.id)}
                  onChange={() => faqSelection.toggle(faq.id)}
                  label={`Select FAQ ${faq.question}`}
                  className="mt-1 shrink-0"
                />
                <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-[#21262d] border border-[#30363d] px-2 py-0.5 text-[10px] font-mono text-[#8b949e]">
                    {faq.category}
                  </span>
                  {faq.isFeatured && (
                    <span className="inline-flex items-center gap-1 rounded bg-[#238636]/10 border border-[#238636]/30 px-2 py-0.5 text-[10px] font-mono text-[#3fb950]">
                      <Sparkles className="h-3 w-3" /> Featured on Support Portal
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-[#f0f6fc]">{faq.question}</h3>
                <p className="text-xs leading-relaxed text-[#c9d1d9] line-clamp-2">{faq.answer}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingFaq(faq);
                    setIsFaqModalOpen(true);
                  }}
                  className="rounded-md border border-[#30363d] bg-[#21262d] p-2 text-[#c9d1d9] hover:bg-[#30363d] hover:text-[#f0f6fc] cursor-pointer"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteFaq(faq.id)}
                  className="rounded-md border border-[#f85149]/30 bg-[#f85149]/10 p-2 text-[#f85149] hover:bg-[#f85149]/20 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: Video Tutorials Management */}
      {activeTab === "tutorials" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <AdminBulkActionBar
              selectedCount={tutorialSelection.selectedCount}
              visibleCount={kbConfig.tutorials.length}
              allVisibleSelected={tutorialSelection.allVisibleSelected}
              someVisibleSelected={tutorialSelection.someVisibleSelected}
              onToggleVisible={tutorialSelection.toggleVisible}
              onClear={tutorialSelection.clear}
              actions={[{ id: "delete", label: "Remove selected", icon: Trash2, tone: "danger", onClick: handleBulkDeleteTutorials }]}
            />
          </div>
          {kbConfig.tutorials.map((tut) => (
            <div
              key={tut.id}
              className="flex flex-col justify-between rounded-md border border-[#30363d] bg-[#161b22] p-5 shadow-sm space-y-4"
            >
              <div className="flex items-start gap-3">
                <AdminSelectionCheckbox
                  checked={tutorialSelection.isSelected(tut.id)}
                  onChange={() => tutorialSelection.toggle(tut.id)}
                  label={`Select tutorial ${tut.title}`}
                  className="mt-1 shrink-0"
                />
                <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-[#21262d] border border-[#30363d] px-2 py-0.5 text-[10px] font-mono text-[#8b949e]">
                    {tut.category} • {tut.duration}
                  </span>
                  <span className="text-xs font-mono text-[#8b949e]">
                    {tut.isPublished ? "Published" : "Draft"}
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#f0f6fc]">{tut.title}</h3>
                <p className="text-xs font-semibold text-slate-600 line-clamp-2">{tut.description}</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                <a
                  href={tut.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-black text-[#0F172A] hover:underline"
                >
                  View Link <ArrowUpRight className="h-3.5 w-3.5" />
                </a>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTutorial(tut);
                      setIsTutorialModalOpen(true);
                    }}
                    className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTutorial(tut.id)}
                    className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Edit FAQ */}
      {isFaqModalOpen && editingFaq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-[#0F172A]">Edit FAQ Entry</h3>
              <button
                type="button"
                onClick={() => setIsFaqModalOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Category</label>
                <select
                  value={editingFaq.category}
                  onChange={(e) => setEditingFaq({ ...editingFaq, category: e.target.value as TicketCategory })}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                >
                  <option value="INVERTER">Inverter Diagnostic</option>
                  <option value="BATTERY">Battery Care</option>
                  <option value="BILLING_PEA">PEA Billing</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="WARRANTY">Warranty Claim</option>
                  <option value="GENERAL">General Support</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Question</label>
                <input
                  type="text"
                  value={editingFaq.question}
                  onChange={(e) => setEditingFaq({ ...editingFaq, question: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-bold text-[#0F172A]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Answer</label>
                <textarea
                  rows={4}
                  value={editingFaq.answer}
                  onChange={(e) => setEditingFaq({ ...editingFaq, answer: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-bold text-[#0F172A]"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isFeatured"
                  checked={editingFaq.isFeatured}
                  onChange={(e) => setEditingFaq({ ...editingFaq, isFeatured: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-[#0F172A]"
                />
                <label htmlFor="isFeatured" className="text-xs font-bold text-slate-700">
                  Feature this FAQ on Support Portal Main Cards
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setIsFaqModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveFaq}
                className="rounded-xl bg-[#0F172A] px-5 py-2 text-xs font-black text-white hover:bg-slate-800"
              >
                Save FAQ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Tutorial */}
      {isTutorialModalOpen && editingTutorial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-[#0F172A]">Edit Video Guide</h3>
              <button
                type="button"
                onClick={() => setIsTutorialModalOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Title</label>
                <input
                  type="text"
                  value={editingTutorial.title}
                  onChange={(e) => setEditingTutorial({ ...editingTutorial, title: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-bold text-[#0F172A]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Video URL (YouTube/Vimeo)</label>
                <input
                  type="text"
                  value={editingTutorial.videoUrl}
                  onChange={(e) => setEditingTutorial({ ...editingTutorial, videoUrl: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-bold text-[#0F172A]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editingTutorial.description}
                  onChange={(e) => setEditingTutorial({ ...editingTutorial, description: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2 text-xs font-bold text-[#0F172A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Duration Badge</label>
                  <input
                    type="text"
                    value={editingTutorial.duration}
                    onChange={(e) => setEditingTutorial({ ...editingTutorial, duration: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2 text-xs font-bold text-[#0F172A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Category</label>
                  <select
                    value={editingTutorial.category}
                    onChange={(e) => setEditingTutorial({ ...editingTutorial, category: e.target.value as TicketCategory })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs font-bold"
                  >
                    <option value="INVERTER">Inverter</option>
                    <option value="BATTERY">Battery</option>
                    <option value="BILLING_PEA">PEA Billing</option>
                    <option value="MAINTENANCE">Maintenance</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setIsTutorialModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTutorial}
                className="rounded-xl bg-[#0F172A] px-5 py-2 text-xs font-black text-white hover:bg-slate-800"
              >
                Save Video Guide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
