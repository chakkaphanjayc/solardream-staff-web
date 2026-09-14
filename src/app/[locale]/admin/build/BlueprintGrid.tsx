"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { 
  Plus, 
  Folder, 
  Search, 
  X, 
  ChevronRight, 
  Layers, 
  Settings 
} from "@/components/ui/icons";
import { createBlueprint } from "./actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GsapReveal } from "@/components/ui/GsapMotion";

interface BlueprintWithStats {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  stepsCount: number;
  componentsCount: number;
}

interface BlueprintGridProps {
  initialBlueprints: BlueprintWithStats[];
}

export default function BlueprintGrid({ initialBlueprints }: BlueprintGridProps) {
  const [blueprints, setBlueprints] = useState<BlueprintWithStats[]>(initialBlueprints);
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form states
  const [bpName, setBpName] = useState("");
  const [bpSlug, setBpSlug] = useState("");
  const [bpDescription, setBpDescription] = useState("");

  const handleNameChange = (val: string) => {
    setBpName(val);
    const generatedSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_]+/g, "-");
    setBpSlug(generatedSlug);
  };

  const handleCreateBlueprint = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await createBlueprint({
          name: bpName,
          slug: bpSlug,
          description: bpDescription
        });

        if (res.success && res.data) {
          toast.success(res.message);

          // Add new blueprint locally to avoid full page refresh delay
          const newBp: BlueprintWithStats = {
            id: res.data.id,
            name: res.data.name,
            slug: res.data.slug,
            description: res.data.description,
            isActive: res.data.isActive,
            stepsCount: 0,
            componentsCount: 0
          };
          setBlueprints(prev => [...prev, newBp]);

          // Reset form & close
          setBpName("");
          setBpSlug("");
          setBpDescription("");
          setIsAddOpen(false);
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Failed to create blueprint:", error);
        toast.error("Could not create the blueprint. Please try again.");
      }
    });
  };

  const filteredBlueprints = blueprints.filter(bp => 
    bp.name.toLowerCase().includes(search.toLowerCase()) || 
    bp.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0F172A] border border-[#1E293B] p-4 rounded-[2rem] shadow-none">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-3.5 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Blueprints by name or slug..."
            className="w-full bg-[#0B1121] border border-[#1E293B] rounded-2xl py-3 pl-11 pr-4 text-xs font-semibold text-gray-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all"
          />
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="px-6 py-3 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white text-xs font-black uppercase tracking-widest rounded-2xl flex items-center gap-1.5 transition-all shadow-none shadow-[#B7D1EA]/10 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Blueprint
        </button>
      </div>

      {/* Blueprints Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredBlueprints.map((bp) => (
          <Link
            key={bp.id}
            href={`/admin/build/${bp.id}`}
            className="group block bg-[#0F172A] border border-[#1E293B] rounded-[2.5rem] p-6 hover:border-[#B7D1EA] hover:shadow-none transition-all duration-300 relative overflow-hidden"
          >
            {/* Hover subtle teal gradient card background glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#B7D1EA]/5 to-transparent rounded-bl-full pointer-events-none transition-all duration-300 group-hover:scale-110" />

            <div className="flex justify-between items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#0B1121] border border-[#1E293B] group-hover:bg-[#B7D1EA]/10 group-hover:border-[#B7D1EA]/20 flex items-center justify-center text-gray-400 group-hover:text-[#B7D1EA] transition-all duration-300">
                <Folder className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-1.5 py-1 px-3.5 bg-[#0B1121] rounded-full border border-[#1E293B] text-[10px] font-black uppercase tracking-wider text-gray-400">
                Active
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <h3 className="text-base font-black text-gray-100 group-hover:text-[#B7D1EA] transition-colors font-sans flex items-center gap-1.5">
                {bp.name}
              </h3>
              <p className="text-[11px] font-semibold text-gray-400 leading-relaxed line-clamp-2">
                {bp.description || "No description provided for this configurator blueprint design layout."}
              </p>
            </div>

            {/* Statistics */}
            <div className="mt-6 pt-5 border-t border-[#1E293B] flex items-center justify-between text-gray-500">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-gray-500" />
                  <span className="text-[11px] font-bold text-gray-400">{bp.stepsCount} {bp.stepsCount === 1 ? "Step" : "Steps"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-gray-500" />
                  <span className="text-[11px] font-bold text-gray-400">{bp.componentsCount} {bp.componentsCount === 1 ? "Part" : "Parts"}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-350 transform group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        ))}

        {/* Dash/Add Blueprint Card */}
        <button
          onClick={() => setIsAddOpen(true)}
          className="group text-left h-full min-h-[220px] bg-[#0B1121]/70 border-2 border-dashed border-[#1E293B] hover:border-[#B7D1EA] rounded-[2.5rem] p-6 flex flex-col justify-center items-center gap-3 transition-all duration-300 cursor-pointer"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#0F172A] border border-[#1E293B] flex items-center justify-center text-gray-400 group-hover:text-[#B7D1EA] group-hover:border-[#B7D1EA]/30 transition-all duration-300 shadow-none">
            <Plus className="w-5 h-5" />
          </div>
          <div className="text-center">
            <h4 className="text-xs font-black text-gray-100 uppercase tracking-widest group-hover:text-[#B7D1EA] transition-colors">Create New Build</h4>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 max-w-[200px] mx-auto leading-normal">
              Setup a new solar configurator engine with branching tree rules.
            </p>
          </div>
        </button>
      </div>

      {/* Blueprint Create dialog modal */}
      {isAddOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90]" onClick={() => setIsAddOpen(false)} />
          
          <GsapReveal from="none" className="relative z-[100] w-full max-w-md rounded-[2.5rem] border border-[#1E293B] bg-[#0F172A] p-8 shadow-none">
            <button 
              onClick={() => setIsAddOpen(false)}
              className="absolute right-6 top-6 p-2 hover:bg-[#0B1121] rounded-xl border border-[#1E293B] text-gray-500 hover:text-slate-650 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-black text-gray-100 uppercase tracking-widest flex items-center gap-2">
              <Folder className="w-5 h-5 text-[#B7D1EA]" />
              New Configurator
            </h3>
            <p className="text-[10px] text-gray-400 mt-1 uppercase font-black tracking-wider">Initialize a new independent configuration blueprint.</p>

            <form onSubmit={handleCreateBlueprint} className="flex flex-col gap-5 mt-6">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-100 mb-2">Build Name</label>
                <input
                  type="text"
                  required
                  value={bpName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Smart Commercial Solar"
                  className="w-full bg-[#0B1121] border border-[#1E293B] rounded-xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-100 mb-2">Build Slug</label>
                <input
                  type="text"
                  required
                  value={bpSlug}
                  onChange={(e) => setBpSlug(e.target.value)}
                  placeholder="e.g. smart-commercial"
                  className="w-full bg-[#0B1121] border border-[#1E293B] rounded-xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-mono font-semibold"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-100 mb-2">Description</label>
                <textarea
                  value={bpDescription}
                  onChange={(e) => setBpDescription(e.target.value)}
                  placeholder="Introduce the purpose of this configurator engine..."
                  rows={3}
                  className="w-full bg-[#0B1121] border border-[#1E293B] rounded-xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#1E293B] mt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-5 py-3 border border-slate-350 text-gray-400 hover:text-gray-100 rounded-xl text-xs font-black hover:bg-[#0B1121] cursor-pointer uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-3 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer uppercase tracking-widest disabled:opacity-40 shadow-none shadow-[#B7D1EA]/10"
                >
                  {isPending ? "Creating..." : "Create Build"}
                </button>
              </div>
            </form>
          </GsapReveal>
        </div>,
        document.body
      )}
    </div>
  );
}
