"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { 
  ArrowLeft, 
  Wrench, 
  Trash2, 
  Plus, 
  Check, 
  AlertCircle, 
  FileText, 
  Layers, 
  Activity, 
  ShoppingBag,
  DollarSign
} from "@/components/ui/icons";
import { publishOfficialQuotation } from "@/app/actions/proposals";
import { GsapReveal, GsapSpinner } from "@/components/ui/GsapMotion";

interface ProductRecord {
  id: string;
  name: string;
  brand: string;
  model: string;
  price: number;
}

interface ProposalRecord {
  id: string;
  userId: string;
  totalPrice: number;
  status: string;
  fulfillmentType: string;
  configurationData: any;
  systemSizeKwp: number;
  panelCount: number;
  revisionNumber: number;
  user?: {
    name: string | null;
    email: string;
  } | null;
}

interface AdjustBomClientProps {
  proposal: ProposalRecord;
  availableProducts: ProductRecord[];
  locale: string;
}

export default function AdjustBomClient({
  proposal,
  availableProducts,
  locale,
}: AdjustBomClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 1. Initial State mapping
  const [items, setItems] = useState<any[]>(() => {
    return (proposal.configurationData as any)?.items || [];
  });
  const [systemSizeKwp, setSystemSizeKwp] = useState<number>(proposal.systemSizeKwp || 0);
  const [panelCount, setPanelCount] = useState<number>(proposal.panelCount || 0);

  // Form states for adding items from database catalog
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);

  // Form states for custom ad-hoc hardware items
  const [customName, setCustomName] = useState<string>("");
  const [customPrice, setCustomPrice] = useState<string>("");
  const [customQty, setCustomQty] = useState<number>(1);

  // 2. Computed values
  const computedTotal = items.reduce((sum, item) => {
    const price = item.unitPrice || item.price || 0;
    const qty = item.quantity || item.qty || 1;
    return sum + (price * qty);
  }, 0);

  // Format currency helper
  const formatMoney = (val: number) => {
    return val.toLocaleString("th-TH", {
      style: "currency",
      currency: "THB",
      minimumFractionDigits: 2,
    });
  };

  // Add selected catalog product to list
  const handleAddCatalogProduct = () => {
    if (!selectedProductId) {
      toast.error("กรุณาเลือกอุปกรณ์จากระบบ");
      return;
    }
    const product = availableProducts.find((p) => p.id === selectedProductId);
    if (!product) return;

    // Check if item already exists, if so merge quantity
    const existingIndex = items.findIndex(
      (item) => item.productId === product.id
    );

    if (existingIndex >= 0) {
      const updated = [...items];
      updated[existingIndex].quantity = (updated[existingIndex].quantity || 1) + selectedQuantity;
      setItems(updated);
    } else {
      const newItem = {
        productId: product.id,
        productName: `${product.brand} ${product.model} - ${product.name}`,
        unitPrice: product.price,
        quantity: selectedQuantity,
      };
      setItems([...items, newItem]);
    }

    toast.success(`เพิ่ม ${product.brand} ${product.model} เข้าสู่รายการเรียบร้อย`);
    setSelectedProductId("");
    setSelectedQuantity(1);
  };

  // Add custom ad-hoc item to list
  const handleAddCustomItem = () => {
    if (!customName.trim()) {
      toast.error("กรุณาระบุชื่อวัสดุอุปกรณ์เพิ่มเติม");
      return;
    }
    const parsedPrice = parseFloat(customPrice);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      toast.error("กรุณาระบุราคาต่อหน่วยที่ถูกต้อง");
      return;
    }

    const newItem = {
      productId: `custom-${crypto.randomUUID()}`,
      productName: customName.trim(),
      unitPrice: parsedPrice,
      quantity: customQty,
      isCustom: true,
    };

    setItems([...items, newItem]);
    toast.success("เพิ่มวัสดุอุปกรณ์เพิ่มเติมแบบระบุเองเรียบร้อย");
    setCustomName("");
    setCustomPrice("");
    setCustomQty(1);
  };

  // Update item quantity directly
  const handleUpdateItemQuantity = (index: number, newQty: number) => {
    if (newQty < 1) return;
    const updated = [...items];
    updated[index].quantity = newQty;
    setItems(updated);
  };

  // Remove item from list
  const handleRemoveItem = (index: number) => {
    const updated = [...items];
    const removed = updated.splice(index, 1);
    setItems(updated);
    toast.info(`ลบรายการ ${removed[0].productName || "อุปกรณ์"} ออกจากรายการแล้ว`);
  };

  // Publish updated quotation to client
  const handlePublishQuotation = () => {
    if (items.length === 0) {
      toast.error("ไม่สามารถส่งใบเสนอราคาที่มีรายการวัสดุว่างเปล่าได้");
      return;
    }
    if (systemSizeKwp <= 0) {
      toast.error("กรุณาระบุขนาดกำลังผลิตติดตั้งที่ถูกต้อง");
      return;
    }
    if (panelCount <= 0) {
      toast.error("กรุณาระบุจำนวนแผงโซลาร์เซลล์ที่ถูกต้อง");
      return;
    }

    startTransition(async () => {
      try {
        const res = await publishOfficialQuotation(
          proposal.id,
          items,
          systemSizeKwp,
          panelCount,
          computedTotal
        );

        if (res.success) {
          toast.success("ส่งใบเสนอราคาปรับปรุงทางการไปยังอีเมลลูกค้าเรียบร้อยแล้ว");
          router.push(`/${locale}/admin/crm`);
        } else {
          toast.error(res.error || "เกิดข้อผิดพลาดในการเผยแพร่ใบเสนอราคา");
        }
      } catch (err: any) {
        toast.error(err.message || "เกิดข้อผิดพลาดทางเทคนิคในการเชื่อมต่อเซิร์ฟเวอร์");
      }
    });
  };

  return (
    <GsapReveal className="space-y-8 font-sans pb-24">
      
      {/* Full screen loading state */}
      {isPending && (
        <GsapReveal className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center z-50">
          <GsapSpinner className="w-16 h-16 text-[#B7D1EA] mb-4" />
          <h2 className="text-xl font-black text-white uppercase tracking-wider text-center px-4">
            กำลังบันทึกและเผยแพร่ใบเสนอราคาทางการ...
          </h2>
          <p className="text-xs text-slate-350 font-semibold tracking-wide mt-2 text-center px-4">
            ระบบกำลังบันทึกข้อมูลปรับปรุงและส่งอีเมลแจ้งลูกค้า กรุณารอสักครู่
          </p>
        </GsapReveal>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E293B] pb-6">
        <div className="space-y-1">
          <Link
            href={`/${locale}/admin/crm`}
            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.25em] text-gray-400 hover:text-gray-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> ย้อนกลับไปยังหน้าหลัก
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-gray-100">
            ปรับปรุงงบวัสดุและอุปกรณ์ <span className="text-[#B7D1EA]">BOM Adjustment</span>
          </h1>
          <p className="text-gray-400 text-xs mt-1 uppercase font-black tracking-widest leading-relaxed">
            Adjust quotation equipment list and materials, recalculate specs, and publish revision documents.
          </p>
        </div>
        
        <div className="flex items-center gap-2 bg-[#0B1121] border border-[#1E293B] px-4 py-2.5 rounded-2xl text-[10px] font-mono font-black uppercase text-slate-650 shadow-xs shrink-0">
          <Layers className="w-4 h-4 text-[#B7D1EA]" />
          <span>Revision #{proposal.revisionNumber}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Main interactive panel (Left 2 columns) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Section 1: Materials list table */}
          <div className="bg-[#0F172A] rounded-[2rem] border border-[#1E293B]/80 shadow-xs overflow-hidden">
            <div className="p-6 border-b border-[#1E293B] bg-[#0B1121]/70 flex justify-between items-center gap-4">
              <h3 className="text-sm font-black text-gray-100 uppercase tracking-wider flex items-center gap-2">
                <Wrench className="w-4.5 h-4.5 text-[#B7D1EA]" />
                <span>รายการแผง โครงสร้าง และงานติดตั้ง (BOM Lines)</span>
              </h3>
              <span className="bg-[#B7D1EA]/10 text-[#B7D1EA] border border-[#B7D1EA]/30 text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {items.length} รายการ
              </span>
            </div>

            {items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-[780px] w-full text-left border-collapse text-xs font-semibold text-gray-300">
                  <thead>
                    <tr className="border-b border-[#1E293B] bg-[#0B1121] text-[10px] font-black uppercase text-gray-500">
                      <th className="p-4">รายละเอียดสินค้า (Description)</th>
                      <th className="p-4 text-right">ราคา/หน่วย (Price)</th>
                      <th className="p-4 text-center">จำนวน (Qty)</th>
                      <th className="p-4 text-right">ราคารวม (Total)</th>
                      <th className="p-4 text-center">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, idx) => {
                      const name = item.productName || item.model || item.name || "Solar Equipment";
                      const price = item.unitPrice || item.price || 0;
                      const qty = item.quantity || item.qty || 1;
                      return (
                        <tr key={item.productId || idx} className="hover:bg-[#0B1121]/70 transition-colors">
                          <td className="p-4 font-bold text-gray-100">
                            <div className="flex flex-col gap-0.5">
                              <span>{name}</span>
                              {item.isCustom && (
                                <span className="text-[8px] uppercase font-black text-[#D8A87B] tracking-wider">
                                  * นอกบัญชีสินค้า (Custom Item)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-right font-mono font-bold text-slate-650">
                            {formatMoney(price)}
                          </td>
                          <td className="p-4 text-center">
                            <div className="inline-flex items-center gap-1 rounded-xl border border-[#1E293B] bg-[#0B1121] p-1">
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQuantity(idx, qty - 1)}
                                disabled={qty <= 1}
                                className="flex h-10 w-10 items-center justify-center rounded-lg text-xs font-black text-gray-400 hover:bg-[#1E293B]/50 disabled:opacity-30"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={qty}
                                onChange={(e) => handleUpdateItemQuantity(idx, parseInt(e.target.value) || 1)}
                                className="h-10 w-12 border-none bg-transparent text-center font-mono text-xs font-black text-gray-100 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQuantity(idx, qty + 1)}
                                className="flex h-10 w-10 items-center justify-center rounded-lg text-xs font-black text-gray-400 hover:bg-[#1E293B]/50"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="p-4 text-right font-mono font-bold text-gray-100">
                            {formatMoney(price * qty)}
                          </td>
                          <td className="p-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-rose-500 transition-all hover:bg-rose-500/10 hover:text-rose-700"
                              title="ลบรายการนี้"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-gray-500 font-semibold italic">
                ไม่มีอุปกรณ์ในระบบ กรุณาเลือกอุปกรณ์ด้านล่างเพื่อเพิ่มเข้าไปในใบเสนอราคา
              </div>
            )}
          </div>

          {/* Section 2: Catalog item addition selector */}
          <div className="bg-[#0F172A] rounded-[2rem] border border-[#1E293B]/80 p-6 sm:p-8 shadow-xs space-y-4">
            <h3 className="text-sm font-black text-gray-100 uppercase tracking-wider flex items-center gap-2 border-b border-[#1E293B] pb-3">
              <ShoppingBag className="w-4.5 h-4.5 text-[#B7D1EA]" />
              <span>เลือกสินค้าจากบัญชีระบบ (Add catalog product)</span>
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">
                  เลือกสินค้าในระบบ (Database Catalog)
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0B1121] border border-[#1E293B]/60 focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] focus:bg-[#0F172A] rounded-xl text-xs font-bold text-gray-100 outline-none transition-all cursor-pointer"
                >
                  <option value="">-- กรุณาเลือกสินค้า --</option>
                  {availableProducts.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      [{prod.brand}] {prod.model} - {prod.name} ({formatMoney(prod.price)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">
                  จำนวน (Quantity)
                </label>
                <input
                  type="number"
                  min="1"
                  value={selectedQuantity}
                  onChange={(e) => setSelectedQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-4 py-3 bg-[#0B1121] border border-[#1E293B]/60 focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] focus:bg-[#0F172A] rounded-xl text-xs font-mono font-black text-gray-100 outline-none transition-all"
                />
              </div>

              <button
                type="button"
                onClick={handleAddCatalogProduct}
                className="w-full px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มสินค้า</span>
              </button>
            </div>
          </div>

          {/* Section 3: Ad-hoc hardware addition form */}
          <div className="bg-[#0F172A] rounded-[2rem] border border-[#1E293B]/80 p-6 sm:p-8 shadow-xs space-y-4">
            <h3 className="text-sm font-black text-gray-100 uppercase tracking-wider flex items-center gap-2 border-b border-[#1E293B] pb-3">
              <Activity className="w-4.5 h-4.5 text-[#B7D1EA]" />
              <span>เพิ่มสินค้าเพิ่มเติมระบุเอง (Add custom hardware / labor)</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">
                  ระบุรายละเอียดของสินค้าเพิ่มเติม (Custom Item Description)
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="เช่น สายไฟ DC ยี่ห้อ LINK - เพิ่มเติม 20 เมตร"
                  className="w-full px-4 py-3 bg-[#0B1121] border border-[#1E293B]/60 focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] focus:bg-[#0F172A] rounded-xl text-xs font-bold text-gray-100 outline-none transition-all placeholder:text-gray-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">
                  ราคาต่อหน่วย (Unit Price)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 bg-[#0B1121] border border-[#1E293B]/60 focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] focus:bg-[#0F172A] rounded-xl text-xs font-mono font-black text-gray-100 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">
                    จำนวน (Qty)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={customQty}
                    onChange={(e) => setCustomQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-4 py-3 bg-[#0B1121] border border-[#1E293B]/60 focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] focus:bg-[#0F172A] rounded-xl text-xs font-mono font-black text-gray-100 outline-none transition-all"
                  />
                </div>
                
                <button
                  type="button"
                  onClick={handleAddCustomItem}
                  className="p-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all shadow-xs cursor-pointer active:scale-95 flex items-center justify-center"
                  title="เพิ่มลงรายการ"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Specs and Summary Sticky (Right sidebar) */}
        <div className="space-y-6 lg:sticky lg:top-6">
          
          {/* Spec Adjustments */}
          <div className="bg-[#0F172A] rounded-[2rem] border border-[#1E293B]/80 p-6 sm:p-8 shadow-xs space-y-4">
            <h3 className="text-sm font-black text-gray-100 uppercase tracking-wider flex items-center gap-2 border-b border-[#1E293B] pb-3">
              <FileText className="w-4.5 h-4.5 text-[#B7D1EA]" />
              <span>กำลังติดตั้งและแผง (Quotation Specs)</span>
            </h3>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">
                  ขนาดระบบติดตั้งรวม (System Size kWp)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={systemSizeKwp}
                  onChange={(e) => setSystemSizeKwp(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-[#0B1121] border border-[#1E293B]/60 focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] focus:bg-[#0F172A] rounded-xl text-xs font-mono font-black text-gray-100 outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">
                  จำนวนแผงโซลาร์ (Panel Count Modules)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={panelCount}
                  onChange={(e) => setPanelCount(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-[#0B1121] border border-[#1E293B]/60 focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] focus:bg-[#0F172A] rounded-xl text-xs font-mono font-black text-gray-100 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Pricing & Publication panel */}
          <div className="bg-[#0F172A] rounded-[2rem] border border-[#1E293B]/80 p-6 sm:p-8 shadow-xs space-y-6">
            <div className="space-y-2.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 block">
                คำนวณราคางวดจัดจ้างรวมภาษีมูลค่าเพิ่ม (BOM Subtotal)
              </span>
              <div className="text-3xl font-black text-[#D8A87B] font-mono tracking-tight leading-none">
                {formatMoney(computedTotal)}
              </div>
            </div>

            <div className="border-t border-[#1E293B] pt-4 space-y-4">
              <div className="bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 rounded-2xl p-4 flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-gray-300 shrink-0 mt-0.5" />
                <div className="text-[11px] font-semibold text-slate-650 leading-relaxed">
                  <p className="font-black text-slate-850 mb-0.5">การปรับปรุงใบเสนอราคา</p>
                  เมื่อกดเผยแพร่แล้ว สถานะโครงการจะเปลี่ยนเป็น <span className="font-bold text-[#B7D1EA]">WAITING_SIGNATURE</span> และส่งลิงก์ใบเสนอราคาฉบับที่ปรับปรุงให้ลูกค้าเซ็นออนไลน์โดยอัตโนมัติ
                </div>
              </div>

              <button
                type="button"
                onClick={handlePublishQuotation}
                disabled={items.length === 0 || systemSizeKwp <= 0 || panelCount <= 0 || isPending}
                className="w-full bg-[#B7D1EA] hover:bg-[#99BFE3] disabled:bg-[#1E293B] text-white disabled:text-gray-500 py-4 rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-none flex items-center justify-center gap-2 cursor-pointer shrink-0 active:scale-95 disabled:scale-100 disabled:pointer-events-none"
              >
                <Check className="w-4 h-4" />
                <span>ส่งใบเสนอราคาทางการให้ลูกค้า (Publish Quote)</span>
              </button>
            </div>
          </div>

        </div>

      </div>

    </GsapReveal>
  );
}
