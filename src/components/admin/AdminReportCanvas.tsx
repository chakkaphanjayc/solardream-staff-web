"use client";

import { useEffect, useState } from "react";
import { useReportStore, ReportFilters } from "@/store/useReportStore";
import { formatPrice } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { 
  Users, 
  Package, 
  Cpu, 
  DollarSign, 
  RefreshCw, 
  Save, 
  Download, 
  Layers, 
  Calendar, 
  Target, 
  UserCheck, 
  Eye, 
  Filter,
  ArrowRight,
  Database,
  Briefcase,
  Activity,
  Clock
} from "@/components/ui/icons";
import Sparkline from "./visuals/Sparkline";
import DonutChart from "./visuals/DonutChart";
import TreemapChart from "./visuals/TreemapChart";
import FunnelChart from "./visuals/FunnelChart";
import { GsapReveal } from "@/components/ui/GsapMotion";

interface TopProduct {
  name: string;
  views: number;
}

interface PageEngagement {
  path: string;
  views: number;
  avgTimeSeconds: number;
}

interface AdminReportCanvasProps {
  initialData: {
    id: string;
    userId: string;
    totalPrice: number;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    createdAt: string;
    user: {
      email: string;
      name: string | null;
    };
    products: {
      id: string;
      name: string;
      price: number;
      category: {
        name: string;
      };
    }[];
  }[];
  totalUsersCount: number;
  totalProductsCount: number;
  realTopProducts: TopProduct[];
  realPageEngagement: PageEngagement[];
}

export default function AdminReportCanvas({ 
  initialData, 
  totalUsersCount, 
  totalProductsCount,
  realTopProducts,
  realPageEngagement
}: AdminReportCanvasProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setInitialData = useReportStore((state) => state.setInitialData);
  const filteredConfigs = useReportStore((state) => state.filteredConfigs);
  const filters = useReportStore((state) => state.filters);
  const setFilter = useReportStore((state) => state.setFilter);
  const resetFilters = useReportStore((state) => state.resetFilters);
  
  const activeMetricHighlight = useReportStore((state) => state.activeMetricHighlight);
  const setMetricHighlight = useReportStore((state) => state.setMetricHighlight);

  // Tab State: 'sales' | 'traffic'
  const [activeTab, setActiveTab] = useState<'sales' | 'traffic'>('sales');

  // Synchronize initial data to Zustand on mount
  useEffect(() => {
    const mapped = initialData.map(item => ({
      id: item.id,
      userEmail: item.user.email,
      userName: item.user.name || "Anonymous User",
      totalPrice: item.totalPrice,
      utmSource: item.utm_source,
      utmMedium: item.utm_medium,
      utmCampaign: item.utm_campaign,
      createdAt: new Date(item.createdAt),
      products: item.products.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        category: p.category.name
      }))
    }));
    setInitialData(mapped);

    // Hydrate Slicer UI values from URL parameters on initialization
    const urlRange = searchParams.get("range");
    const urlCategory = searchParams.get("category");
    if (urlRange) setFilter("dateRange", urlRange);
    if (urlCategory) setFilter("category", urlCategory);
  }, [initialData, setInitialData, searchParams, setFilter]);

  // Push Slicer update to URL Query Parameters
  const updateUrlSlicer = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Handle Slicer Dropdown adjustments
  const handleSlicerChange = (key: keyof ReportFilters, value: string) => {
    setFilter(key, value);
    const urlKey = key === "dateRange" ? "range" : key === "category" ? "category" : null;
    if (urlKey) {
      updateUrlSlicer(urlKey, value);
    }
  };

  // Handle Reset Filters
  const handleResetFilters = () => {
    resetFilters();
    router.push(pathname, { scroll: false });
    toast.success("Slicers and URL tracking parameters reset!");
  };

  // Aggregate metrics
  const currentBuildsCount = filteredConfigs.length;
  const currentTotalValue = filteredConfigs.reduce((sum, c) => sum + c.totalPrice, 0);

  // Sparkline Trends (Mock 7-day arrays)
  const usersTrend = [totalUsersCount - 4, totalUsersCount - 3, totalUsersCount - 2, totalUsersCount - 2, totalUsersCount - 1, totalUsersCount, totalUsersCount];
  const productsTrend = [totalProductsCount, totalProductsCount, totalProductsCount, totalProductsCount, totalProductsCount, totalProductsCount, totalProductsCount];
  const buildsTrend = [14, 18, 15, 24, 28, 32, currentBuildsCount];
  const valueTrend = [16000, 22000, 18000, 29000, 39000, 44000, currentTotalValue || 500];

  const handleMetricClick = (metric: string) => {
    if (activeMetricHighlight === metric) {
      setMetricHighlight(null);
    } else {
      setMetricHighlight(metric);
      toast.info(`Highlighted visual metrics related to '${metric.toUpperCase()}'`);
    }
  };

  const handleExportData = () => {
    const dataStr = JSON.stringify(filteredConfigs, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'solar-filtered-bi-report.json');
    linkElement.click();
    toast.success(`Exported ${filteredConfigs.length} customer solar estimates successfully!`);
  };

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return mins > 0 ? `${mins}m ${remainingSecs}s` : `${remainingSecs}s`;
  };

  const maxViews = realTopProducts.length > 0 ? Math.max(...realTopProducts.map(p => p.views)) : 100;

  return (
    <div className="space-y-8">
      {/* Slicer & Report Control Toolbar */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-none">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 flex items-center justify-center text-[#B7D1EA]">
            <Filter className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-sm text-gray-100 tracking-wide uppercase">Interactive Slicers</h3>
            <p className="text-[10px] text-gray-400 font-semibold leading-relaxed">Appends browser queries dynamically for server-side reloading.</p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2.5 md:self-auto self-start">
          <button 
            onClick={handleResetFilters}
            className="px-4 py-2 bg-[#0F172A] hover:bg-[#0B1121] text-gray-300 hover:text-gray-100 rounded-xl border border-[#1E293B] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer shadow-none"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Filters
          </button>
          <button 
            onClick={() => toast.success("Active report canvas state locked successfully!")}
            className="px-4 py-2 bg-[#0F172A] hover:bg-[#0B1121] text-gray-300 hover:text-gray-100 rounded-xl border border-[#1E293B] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer shadow-none"
          >
            <Save className="w-3.5 h-3.5" />
            Save View
          </button>
          <button 
            onClick={handleExportData}
            className="px-4 py-2 bg-[#0F172A] hover:bg-[#0B1121] text-gray-300 hover:text-gray-100 rounded-xl border border-[#1E293B] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer shadow-none"
          >
            <Download className="w-3.5 h-3.5" />
            Export Context
          </button>
        </div>
      </div>

      {/* Slicers Filters Panel Grid */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-3xl p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 shadow-none">
        {/* Date Range Slicer */}
        <div className="space-y-2">
          <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#B7D1EA]" />
            Date Horizon
          </label>
          <select 
            value={filters.dateRange}
            onChange={(e) => handleSlicerChange("dateRange", e.target.value)}
            className="w-full bg-[#0B1121] border border-[#1E293B] rounded-2xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 transition-all cursor-pointer font-semibold"
          >
            <option value="all">All Recorded Time</option>
            <option value="7d">Last 7 Days (range=7d)</option>
            <option value="30d">Last 30 Days (range=30d)</option>
          </select>
        </div>

        {/* Product Category Slicer */}
        <div className="space-y-2">
          <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-purple-500" />
            Category Slicer
          </label>
          <select 
            value={filters.category}
            onChange={(e) => handleSlicerChange("category", e.target.value)}
            className="w-full bg-[#0B1121] border border-[#1E293B] rounded-2xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 transition-all cursor-pointer font-semibold"
          >
            <option value="all">All Categories</option>
            <option value="Solar Panels">Solar Panels Only</option>
            <option value="Smart Inverters">Smart Inverters Only</option>
            <option value="Battery Storage">Battery Storage Only</option>
          </select>
        </div>

        {/* Campaign Source Slicer */}
        <div className="space-y-2">
          <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-rose-500" />
            Campaign Slicer
          </label>
          <select 
            value={filters.marketingSource}
            onChange={(e) => handleSlicerChange("marketingSource", e.target.value)}
            className="w-full bg-[#0B1121] border border-[#1E293B] rounded-2xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 transition-all cursor-pointer font-semibold"
          >
            <option value="all">All Marketing Channels</option>
            <option value="Google Adwords">Google Adwords (38%)</option>
            <option value="Instagram Feed">Instagram Feed (27%)</option>
            <option value="Newsletter/Email">Newsletter/Email (15%)</option>
            <option value="Direct/Organic">Direct/Organic (20%)</option>
          </select>
        </div>

        {/* User Segment Slicer */}
        <div className="space-y-2">
          <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
            User Segment Slicer
          </label>
          <select 
            value={filters.userSegment}
            onChange={(e) => handleSlicerChange("userSegment", e.target.value)}
            className="w-full bg-[#0B1121] border border-[#1E293B] rounded-2xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 transition-all cursor-pointer font-semibold"
          >
            <option value="all">All Customer Ranges</option>
            <option value="New">Residential Tier (&lt; $5,000)</option>
            <option value="Returning">Commercial Tier (&ge; $5,000)</option>
          </select>
        </div>
      </div>

      {/* Tabs Selector Navigation */}
      <div className="flex border-b border-[#1E293B] gap-2">
        <button
          onClick={() => setActiveTab("sales")}
          className={`
            px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all duration-300 border-b-2 flex items-center gap-2 cursor-pointer
            ${activeTab === "sales" 
              ? "border-[#B7D1EA] text-[#B7D1EA] bg-[#0B1121]" 
              : "border-transparent text-gray-400 hover:text-slate-850"
            }
          `}
        >
          <Briefcase className="w-4 h-4 text-[#B7D1EA]" />
          Section A: Solar ROI & Sizing
        </button>
        <button
          onClick={() => setActiveTab("traffic")}
          className={`
            px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all duration-300 border-b-2 flex items-center gap-2 cursor-pointer
            ${activeTab === "traffic" 
              ? "border-[#B7D1EA] text-[#B7D1EA] bg-[#0B1121]" 
              : "border-transparent text-gray-400 hover:text-slate-850"
            }
          `}
        >
          <Activity className="w-4 h-4 text-emerald-500" />
          Section B: Traffic & Sizing Wizard
        </button>
      </div>

      {/* RENDER ACTIVE TAB */}
      {activeTab === "sales" ? (
        <GsapReveal className="space-y-8">
          {/* Enhanced Metric Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Metric 1: Users */}
            <div 
              onClick={() => handleMetricClick("users")}
              className={`
                bg-[#0F172A] border border-[#1E293B] rounded-3xl p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-[#B7D1EA]/20 shadow-none cursor-pointer
                ${activeMetricHighlight === "users" ? "ring-2 ring-[#B7D1EA] bg-[#B7D1EA]/5" : ""}
              `}
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
              <div className="flex justify-between items-start">
                <div className="space-y-0.5">
                  <span className="text-[9px] uppercase tracking-widest text-gray-400 font-black">Total Users</span>
                  <h3 className="text-3xl font-black text-gray-100 tracking-tight mt-0.5">{totalUsersCount}</h3>
                </div>
                <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl border border-blue-500/20">
                  <Users className="w-4.5 h-4.5" />
                </div>
              </div>
              <div className="mt-6 flex items-end justify-between">
                <span className="text-xs text-emerald-500 font-bold font-mono">+12% vs last week</span>
                <Sparkline data={usersTrend} colorClass="stroke-blue-500" fillColorClass="fill-blue-500/5" />
              </div>
            </div>

            {/* Metric 2: Products */}
            <div 
              onClick={() => handleMetricClick("products")}
              className={`
                bg-[#0F172A] border border-[#1E293B] rounded-3xl p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-[#B7D1EA]/20 shadow-none cursor-pointer
                ${activeMetricHighlight === "products" ? "ring-2 ring-[#B7D1EA] bg-[#B7D1EA]/5" : ""}
              `}
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
              <div className="flex justify-between items-start">
                <div className="space-y-0.5">
                  <span className="text-[9px] uppercase tracking-widest text-gray-400 font-black">Active Products</span>
                  <h3 className="text-3xl font-black text-gray-100 tracking-tight mt-0.5">{totalProductsCount}</h3>
                </div>
                <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl border border-emerald-500/20">
                  <Package className="w-4.5 h-4.5" />
                </div>
              </div>
              <div className="mt-6 flex items-end justify-between">
                <span className="text-xs text-emerald-500 font-bold font-mono">Stable inventory</span>
                <Sparkline data={productsTrend} colorClass="stroke-emerald-500" fillColorClass="fill-emerald-500/5" />
              </div>
            </div>

            {/* Metric 3: Builds */}
            <div 
              onClick={() => handleMetricClick("builds")}
              className={`
                bg-[#0F172A] border border-[#1E293B] rounded-3xl p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-[#B7D1EA]/20 shadow-none cursor-pointer
                ${activeMetricHighlight === "builds" ? "ring-2 ring-[#B7D1EA] bg-[#B7D1EA]/5" : ""}
              `}
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-fuchsia-500" />
              <div className="flex justify-between items-start">
                <div className="space-y-0.5">
                  <span className="text-[9px] uppercase tracking-widest text-gray-400 font-black">Completed Solar Designs</span>
                  <h3 className="text-3xl font-black text-gray-100 tracking-tight mt-0.5">{currentBuildsCount}</h3>
                </div>
                <div className="p-2 bg-purple-500/10 text-purple-500 rounded-xl border border-purple-500/20">
                  <Cpu className="w-4.5 h-4.5" />
                </div>
              </div>
              <div className="mt-6 flex items-end justify-between">
                <span className="text-xs text-emerald-500 font-bold font-mono">+8% vs last week</span>
                <Sparkline data={buildsTrend} colorClass="stroke-purple-500" fillColorClass="fill-purple-500/5" />
              </div>
            </div>

            {/* Metric 4: Configured Value */}
            <div 
              onClick={() => handleMetricClick("value")}
              className={`
                bg-[#0F172A] border border-[#1E293B] rounded-3xl p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-[#B7D1EA]/20 shadow-none cursor-pointer
                ${activeMetricHighlight === "value" ? "ring-2 ring-[#B7D1EA] bg-[#B7D1EA]/5" : ""}
              `}
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
              <div className="flex justify-between items-start">
                <div className="space-y-0.5">
                  <span className="text-[9px] uppercase tracking-widest text-gray-400 font-black">Calculated ROI Savings</span>
                  <h3 className="text-3xl font-black text-gray-100 tracking-tight mt-0.5">{formatPrice(currentTotalValue)}</h3>
                </div>
                <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl border border-amber-500/20">
                  <DollarSign className="w-4.5 h-4.5" />
                </div>
              </div>
              <div className="mt-6 flex items-end justify-between">
                <span className="text-xs text-rose-500 font-bold font-mono">-3.4% vs last week</span>
                <Sparkline data={valueTrend} colorClass="stroke-amber-500" fillColorClass="fill-amber-400/5" />
              </div>
            </div>
          </div>

          {/* Interconnected Visualizations Canvas Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none space-y-6">
              <div>
                <h3 className="text-base font-black text-gray-100 uppercase tracking-wide">Acquisition ROI</h3>
                <p className="text-[11px] text-gray-400 font-semibold leading-relaxed mt-0.5">Interactive campaign acquisition sectors filter global metrics.</p>
              </div>
              <DonutChart />
            </div>

            <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none space-y-6">
              <div>
                <h3 className="text-base font-black text-gray-100 uppercase tracking-wide">Solar Component Interest</h3>
                <p className="text-[11px] text-gray-400 font-semibold leading-relaxed mt-0.5">Proportional weight maps category views. Click to segment.</p>
              </div>
              <TreemapChart />
            </div>

            <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none space-y-6">
              <div>
                <h3 className="text-base font-black text-gray-100 uppercase tracking-wide">Conversion Funnel</h3>
                <p className="text-[11px] text-gray-400 font-semibold leading-relaxed mt-0.5">Track user retention drop-off from session start to checkout.</p>
              </div>
              <FunnelChart />
            </div>
          </div>
        </GsapReveal>
      ) : (
        <GsapReveal className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Top Products by Views */}
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none space-y-6 lg:col-span-2">
            <div>
              <h3 className="text-base font-black text-gray-100 uppercase tracking-wide flex items-center gap-2">
                <Eye className="w-5 h-5 text-[#B7D1EA]" />
                Top Catalog Products By Views (Real Data)
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5 font-semibold">Exact views tracked per product in the PostgreSQL database.</p>
            </div>

            {realTopProducts.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-500 font-semibold">
                No product views recorded yet. Trigger views inside your product list!
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                {realTopProducts.map((p, idx) => {
                  const pct = Math.max(5, Math.round((p.views / maxViews) * 100));
                  return (
                     <div key={p.name} className="space-y-2">
                       <div className="flex justify-between text-xs font-bold text-gray-100 tracking-wide">
                         <span className="flex items-center gap-2">
                           <span className="w-5 h-5 rounded-lg bg-[#0B1121] border border-[#1E293B] flex items-center justify-center text-[10px] text-gray-500 font-black">
                             {idx + 1}
                           </span>
                           {p.name}
                         </span>
                         <span className="font-mono text-[#B7D1EA] font-bold">{p.views} views</span>
                       </div>
                       <div className="h-4 bg-[#0B1121] rounded-full overflow-hidden border border-[#1E293B] relative">
                         <div 
                           style={{ width: `${pct}%` }} 
                           className="h-full bg-gradient-to-r from-[#B7D1EA] to-[#99BFE3] rounded-full transition-all duration-500" 
                         />
                       </div>
                     </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Page Engagement and Time Spent */}
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none space-y-6">
            <div>
              <h3 className="text-base font-black text-gray-100 uppercase tracking-wide flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-500" />
                Page Engagement Time
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5 font-semibold">Average time spent per unique application pathway.</p>
            </div>

            {realPageEngagement.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-500 font-semibold">
                No active engagement records available.
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                {realPageEngagement.map((page) => (
                  <div 
                    key={page.path}
                    className="p-4 rounded-2xl bg-[#0B1121] border border-[#1E293B] flex items-center justify-between hover:bg-[#0B1121] transition-all"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-xs font-black text-gray-100 tracking-wider">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        {page.path}
                      </div>
                      <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{page.views} pageviews logged</p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-mono font-black text-[#B7D1EA]">
                        {formatDuration(page.avgTimeSeconds)}
                      </span>
                      <span className="text-[9px] text-gray-500 block font-bold mt-0.5">avg duration</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GsapReveal>
      )}

      {/* Drill-through Table Scope (Bottom Area) */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0B1121] border border-[#1E293B] flex items-center justify-center text-gray-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-100 uppercase tracking-wide">Drill-Through Target</h3>
              <p className="text-xs text-gray-400 font-semibold leading-relaxed">Currently active scope contains {filteredConfigs.length} configurations.</p>
            </div>
          </div>

          <button 
            onClick={() => toast.info(`Drilling down into context of range: ${filters.dateRange}, category: ${filters.category}`)}
            className="px-5 py-3 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white font-black rounded-2xl text-[10px] flex items-center justify-center gap-1.5 transition-all shadow-none shadow-[#B7D1EA]/10 cursor-pointer self-start sm:self-auto uppercase tracking-widest"
          >
            Launch Drill-Through
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Current Active Context Badge Summary */}
        <div className="flex flex-wrap gap-2.5 p-4 rounded-2xl bg-[#0B1121] border border-[#1E293B]">
          <div className="text-[10px] text-gray-300 flex items-center gap-2 mr-2 font-black uppercase tracking-widest">
            <span>Query Filters:</span>
          </div>
          <span className="px-2.5 py-1 rounded-xl bg-[#0F172A] border border-[#1E293B] text-[10px] font-mono text-gray-400 font-bold">
            range={filters.dateRange}
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-[#0F172A] border border-[#1E293B] text-[10px] font-mono text-gray-400 font-bold">
            category={filters.category}
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-[#0F172A] border border-[#1E293B] text-[10px] font-mono text-gray-400 font-bold">
            utm_source={filters.marketingSource}
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-[#0F172A] border border-[#1E293B] text-[10px] font-mono text-gray-400 font-bold">
            segment={filters.userSegment}
          </span>
        </div>
      </div>
    </div>
  );
}
