"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  AlertTriangle,
  Bot,
  Braces,
  MessageCircle, 
  CheckCircle2, 
  Copy,
  Send, 
  Terminal, 
  ExternalLink,
  Webhook,
  Search,
  ShieldCheck,
  Sliders,
  Trash2,
  User,
  Save,
  Activity,
  BookOpen,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  Info,
  RotateCcw,
} from "@/components/ui/icons";
import { toast } from "sonner";
import {
  simulateLineWebhook, 
  testLowStockAlertPush,
  testShippingNotificationPush,
  testToggleUserRichMenu,
  saveLineAutomationConfigAction,
} from "@/app/actions/settings/lineSettings";
import { cn } from "@/lib/utils";
import RichMenuEditor from "@/components/admin/RichMenuEditor";
import { GsapPulse, GsapReveal, GsapSpinner } from "@/components/ui/GsapMotion";
import LineMessageLab from "./LineMessageLab";
import LineOperationsPanel from "./LineOperationsPanel";
import LineRichMenuInventory from "./LineRichMenuInventory";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import {
  createDefaultLineQuickButtons,
  LINE_MAX_QUICK_REPLY_ITEMS,
  LINE_QUICK_REPLY_LABEL_MAX_LENGTH,
  LINE_QUICK_REPLY_MESSAGE_MAX_LENGTH,
  LINE_QUICK_REPLY_URI_MAX_LENGTH,
  resolveQuickButtonValue,
  sortLineQuickButtons,
  type LineConversationConfig,
  type LineQuickButton,
  type LineTriggerConfig,
} from "@/lib/lineAutomationConfig";

interface SystemUser {
  id: string;
  name: string | null;
  fullName: string;
  email: string;
  lineUserId: string | null;
}

interface EnvStatus {
  LINE_CHANNEL_ACCESS_TOKEN: boolean;
  LINE_CHANNEL_SECRET: boolean;
  LINE_MEMBER_RICH_MENU_ID: string | null;
  LINE_CHANNEL_ACCESS_TOKEN_PREVIEW: string | null;
  LINE_CHANNEL_SECRET_PREVIEW: string | null;
  LINE_CHANNEL_ACCESS_TOKEN_SOURCE: "system_settings" | "environment" | "missing";
  LINE_CHANNEL_SECRET_SOURCE: "system_settings" | "environment" | "missing";
  LINE_MEMBER_RICH_MENU_ID_SOURCE: "system_settings" | "environment" | "missing";
}

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  timestamp: string;
  type: "text" | "flex";
  text?: string;
  flexContent?: any;
}

interface DBProduct {
  id: string;
  brand: string;
  model: string;
  stock: number;
}

interface DBProposal {
  id: string;
  userId: string;
  shippingTrackingNumber: string | null;
  status: string;
}

interface LineClientProps {
  initialEnvStatus: EnvStatus;
  defaultWebhookEndpoint: string;
  systemUsers: SystemUser[];
  initialTriggerConfigs: LineTriggerConfig[];
  initialQuickButtons: LineQuickButton[];
  initialLoginUrl: string;
  initialConversation: LineConversationConfig;
  productsList: DBProduct[];
  proposalsList: DBProposal[];
}

type LineFeature = "webhooks" | "messages" | "quick-menu" | "flex";

const LINE_FEATURE_TABS = [
  {
    id: "webhooks",
    label: "Webhooks",
    description: "Connection, ownership, and delivery health",
    icon: Webhook,
  },
  {
    id: "messages",
    label: "Messages & Quick Replies",
    description: "Test replies and edit the highlighted button strip",
    icon: MessageCircle,
  },
  {
    id: "quick-menu",
    label: "Rich Menu",
    description: "Persistent menu artwork, publishing, and inventory",
    icon: LayoutGrid,
  },
  {
    id: "flex",
    label: "Flex",
    description: "Triggers, templates, and live previews",
    icon: Braces,
  },
] as const;

function isLineFeature(value: string | null): value is LineFeature {
  return value === "webhooks" || value === "messages" || value === "quick-menu" || value === "flex";
}

const DEFAULT_FLEX_JSON_STOCK = `{
  "type": "bubble",
  "header": {
    "type": "box",
    "layout": "vertical",
    "backgroundColor": "#0F172A",
    "contents": [
      {
        "type": "text",
        "text": "📦 สต็อกคลังสินค้า ERP",
        "color": "#B7D1EA",
        "weight": "bold",
        "size": "sm"
      },
      {
        "type": "text",
        "text": "รายการสต็อกสินค้าเรียลไทม์",
        "color": "#FFFFFF",
        "weight": "bold",
        "size": "md",
        "margin": "sm"
      }
    ]
  },
  "body": {
    "type": "box",
    "layout": "vertical",
    "backgroundColor": "#0F172A",
    "contents": [
      {
        "type": "text",
        "text": "สถานะรายการสินค้าแนะนำประจำวันนี้:",
        "size": "xs",
        "color": "#475569"
      },
      {
        "type": "separator",
        "margin": "md",
        "color": "#475569"
      },
      "{{products_placeholder}}"
    ]
  },
  "footer": {
    "type": "box",
    "layout": "vertical",
    "backgroundColor": "#0F172A",
    "contents": [
      {
        "type": "button",
        "action": {
          "type": "message",
          "label": "สอบถามสินค้าเพิ่ม",
          "text": "ติดต่อแอดมิน"
        },
        "style": "primary",
        "color": "#B7D1EA"
      }
    ]
  }
}`;

const DEFAULT_FLEX_JSON_PROMO = `{
  "type": "bubble",
  "size": "micro",
  "hero": {
    "type": "image",
    "url": "{{imageUrl}}",
    "size": "full",
    "aspectRatio": "20:13",
    "aspectMode": "cover"
  },
  "body": {
    "type": "box",
    "layout": "vertical",
    "backgroundColor": "#0F172A",
    "contents": [
      {
        "type": "text",
        "text": "{{brand}}",
        "weight": "bold",
        "size": "xxs",
        "color": "#B7D1EA"
      },
      {
        "type": "text",
        "text": "{{model}}",
        "weight": "bold",
        "size": "xs",
        "color": "#FFFFFF",
        "margin": "xs",
        "wrap": true
      },
      {
        "type": "text",
        "text": "{{price}} THB",
        "weight": "bold",
        "size": "xs",
        "color": "#D8A87B",
        "margin": "xs"
      }
    ]
  },
  "footer": {
    "type": "box",
    "layout": "vertical",
    "backgroundColor": "#0F172A",
    "contents": [
      {
        "type": "button",
        "action": {
          "type": "uri",
          "label": "ดูรายละเอียด",
          "uri": "{{detailUrl}}"
        },
        "style": "primary",
        "color": "#B7D1EA",
        "height": "sm"
      }
    ]
  }
}`;

const DEFAULT_FLEX_JSON_ORDER = `{
  "type": "bubble",
  "header": {
    "type": "box",
    "layout": "vertical",
    "backgroundColor": "#0F172A",
    "contents": [
      {
        "type": "text",
        "text": "สถานะคำสั่งซื้อ (ERP)",
        "color": "#B7D1EA",
        "weight": "bold",
        "size": "sm"
      },
      {
        "type": "text",
        "text": "ออเดอร์ #{{orderId}}",
        "color": "#FFFFFF",
        "weight": "bold",
        "size": "xl",
        "margin": "sm"
      }
    ]
  },
  "body": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      {
        "type": "box",
        "layout": "horizontal",
        "contents": [
          {
            "type": "text",
            "text": "สถานะการสั่งซื้อ",
            "color": "#475569",
            "size": "sm"
          },
          {
            "type": "text",
            "text": "{{status}}",
            "color": "#B7D1EA",
            "weight": "bold",
            "size": "sm",
            "align": "end"
          }
        ]
      },
      {
        "type": "box",
        "layout": "horizontal",
        "margin": "md",
        "contents": [
          {
            "type": "text",
            "text": "ผู้ให้บริการขนส่ง",
            "color": "#475569",
            "size": "sm"
          },
          {
            "type": "text",
            "text": "Flash Express",
            "color": "#0F172A",
            "size": "sm",
            "align": "end"
          }
        ]
      },
      {
        "type": "box",
        "layout": "horizontal",
        "margin": "md",
        "contents": [
          {
            "type": "text",
            "text": "เลขติดตามพัสดุ",
            "color": "#475569",
            "size": "sm"
          },
          {
            "type": "text",
            "text": "{{trackingNumber}}",
            "color": "#0F172A",
            "weight": "bold",
            "size": "sm",
            "align": "end"
          }
        ]
      },
      {
        "type": "separator",
        "margin": "lg"
      },
      {
        "type": "box",
        "layout": "vertical",
        "margin": "lg",
        "contents": [
          {
            "type": "text",
            "text": "รายการสินค้าในคำสั่งซื้อ:",
            "size": "xs",
            "color": "#94A3B8",
            "weight": "bold"
          },
          "{{order_items_placeholder}}"
        ]
      }
    ]
  },
  "footer": {
    "type": "box",
    "layout": "vertical",
    "spacing": "sm",
    "contents": [
      {
        "type": "button",
        "action": {
          "type": "uri",
          "label": "เช็คสถานะจากขนส่ง",
          "uri": "{{trackingUrl}}"
        },
        "style": "primary",
        "color": "#B7D1EA"
      }
    ]
  }
}`;

const DEFAULT_FLEX_JSON_POINTS = `{
  "type": "bubble",
  "hero": {
    "type": "image",
    "url": "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&q=80&w=600",
    "size": "full",
    "aspectRatio": "20:13",
    "aspectMode": "cover"
  },
  "body": {
    "type": "box",
    "layout": "vertical",
    "backgroundColor": "#0F172A",
    "contents": [
      {
        "type": "text",
        "text": "🏆 คะแนนสะสม SolarDream",
        "color": "#B7D1EA",
        "weight": "bold",
        "size": "sm"
      },
      {
        "type": "text",
        "text": "{{userName}}",
        "color": "#FFFFFF",
        "weight": "bold",
        "size": "lg",
        "margin": "sm"
      },
      {
        "type": "box",
        "layout": "horizontal",
        "margin": "md",
        "contents": [
          {
            "type": "text",
            "text": "ระดับสมาชิก:",
            "color": "#94A3B8",
            "size": "xs"
          },
          {
            "type": "text",
            "text": "{{userTier}}",
            "color": "#D8A87B",
            "weight": "bold",
            "size": "xs",
            "align": "end"
          }
        ]
      },
      {
        "type": "box",
        "layout": "horizontal",
        "margin": "sm",
        "contents": [
          {
            "type": "text",
            "text": "คะแนนสะสมปัจจุบัน:",
            "color": "#94A3B8",
            "size": "xs"
          },
          {
            "type": "text",
            "text": "{{userPoints}} PTS",
            "color": "#B7D1EA",
            "weight": "bold",
            "size": "xs",
            "align": "end"
          }
        ]
      }
    ]
  },
  "footer": {
    "type": "box",
    "layout": "vertical",
    "backgroundColor": "#0F172A",
    "contents": [
      {
        "type": "button",
        "action": {
          "type": "uri",
          "label": "แลกของรางวัล",
          "uri": "{{couponRedeemUrl}}"
        },
        "style": "primary",
        "color": "#B7D1EA"
      }
    ]
  }
}`;

const DEFAULT_FLEX_JSON_LINK = `{
  "type": "bubble",
  "hero": {
    "type": "image",
    "url": "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&q=80&w=600",
    "size": "full",
    "aspectRatio": "20:13",
    "aspectMode": "cover"
  },
  "body": {
    "type": "box",
    "layout": "vertical",
    "backgroundColor": "#0F172A",
    "contents": [
      {
        "type": "text",
        "text": "SolarDream Account Linking",
        "color": "#B7D1EA",
        "weight": "bold",
        "size": "sm"
      },
      {
        "type": "text",
        "text": "เชื่อมต่อบัญชีของคุณ",
        "color": "#FFFFFF",
        "weight": "bold",
        "size": "lg",
        "margin": "sm"
      },
      {
        "type": "text",
        "text": "ผูกบัญชีสมาชิก SolarDream เข้ากับ LINE เพื่อตรวจเช็คสถานะออเดอร์ในระบบ ERP และรับข่าวสารหรือแต้มสะสมโดยตรงแบบเรียลไทม์",
        "color": "#475569",
        "size": "xs",
        "margin": "md",
        "wrap": true
      }
    ]
  },
  "footer": {
    "type": "box",
    "layout": "vertical",
    "backgroundColor": "#0F172A",
    "contents": [
      {
        "type": "button",
        "action": {
          "type": "uri",
          "label": "เข้าสู่ระบบเพื่อผูกบัญชี",
          "uri": "{{loginUrl}}"
        },
        "style": "primary",
        "color": "#B7D1EA"
      }
    ]
  }
}`;

const DEFAULT_FLEX_JSON_INSTALLATION = `{
  "type": "bubble",
  "header": {
    "type": "box",
    "layout": "vertical",
    "backgroundColor": "#0F172A",
    "contents": [
      { "type": "text", "text": "Installation Tracker", "color": "#B7D1EA", "weight": "bold", "size": "sm" },
      { "type": "text", "text": "{{installationStatus}}", "color": "#FFFFFF", "weight": "bold", "size": "lg", "margin": "sm", "wrap": true }
    ]
  },
  "body": {
    "type": "box",
    "layout": "vertical",
    "backgroundColor": "#FFFFFF",
    "spacing": "md",
    "contents": [
      { "type": "text", "text": "{{orderId}} · {{systemSizeKwp}}", "color": "#475569", "size": "xs", "weight": "bold", "wrap": true },
      { "type": "text", "text": "ขั้นตอนปัจจุบันของโครงการจะอัปเดตจากทีมติดตั้ง", "color": "#64748B", "size": "xs", "wrap": true }
    ]
  },
  "footer": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      { "type": "button", "action": { "type": "uri", "label": "เปิดหน้าติดตามโครงการ", "uri": "{{trackingUrl}}" }, "style": "primary", "color": "#0F172A" }
    ]
  }
}`;


// Deterministic mock calculations for the UI preview matching the backend's logic
function getMockedUserStats(user: SystemUser | null) {
  if (!user) {
    return {
      name: "คุณ สมชาย ใจดี",
      points: 1250,
      tier: "GOLD MEMBER",
      status: "อยู่ระหว่างการจัดส่ง",
      orderNo: "SD-2026-8942",
      trackingNo: "TH26093849202",
      items: [
        "Solar Panels Monocrystalline 550W x 10 แผง",
        "Inverter Huawei SUN2000-5KTL-M1 x 1 เครื่อง"
      ]
    };
  }

  const seedLength = user.email.length;
  const points = (seedLength * 75) + 120;
  
  let tier = "BRONZE MEMBER";
  if (points > 3000) tier = "PLATINUM MEMBER";
  else if (points > 1500) tier = "GOLD MEMBER";
  else if (points > 800) tier = "SILVER MEMBER";

  const statuses = ["อยู่ระหว่างการจัดส่ง", "ชำระเงินมัดจำเรียบร้อยแล้ว", "ลงนามสัญญาแล้ว", "ส่งมอบงานเรียบร้อยแล้ว"];
  const status = statuses[seedLength % statuses.length];
  const orderNo = `SD-${user.id.slice(0, 8).toUpperCase()}`;
  
  const systemSize = (1.5 + (seedLength % 5) * 1.5).toFixed(2);
  const panelCount = (4 + (seedLength % 5) * 4);

  return {
    name: user.fullName || user.name || user.email,
    points,
    tier,
    status,
    orderNo,
    trackingNo: `TH26093${(seedLength * 12345).toString().slice(0, 6)}`,
    items: [
      `• ระบบโซลาร์เซลล์ขนาด ${systemSize} kWp`,
      `• อุปกรณ์แผงโซลาร์เซลล์ x ${panelCount} แผง`
    ]
  };
}

// Side-by-side static Flex Message Renderer for the Simulator Previews
function StaticFlexCard({ 
  type, 
  stats,
  siteUrl
}: { 
  type: "order" | "points"; 
  stats: any;
  siteUrl: string;
}) {
  const trackingUrl = `https://www.flashexpress.co.th/tracking?keyword=${stats.trackingNo}`;
  const couponUrl = `${siteUrl}/profile/coupons`;

  if (type === "order") {
    return (
      <div className="w-full max-w-[280px] bg-[#0F172A] rounded-2xl overflow-hidden border border-[#1E293B] shadow-none text-xs text-gray-100 font-sans mx-auto text-left">
        <div className="bg-[#0F172A] p-4 text-white">
          <p className="text-[10px] font-black tracking-widest text-[#B7D1EA] uppercase">สถานะคำสั่งซื้อ (ERP)</p>
          <h4 className="text-sm font-black mt-1">ออเดอร์ #{stats.orderNo}</h4>
        </div>
        
        <div className="p-4 space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-[11px] font-semibold">สถานะการจัดส่ง</span>
            <span className="text-[#B7D1EA] font-black">{stats.status}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-[11px] font-semibold">ผู้จัดส่ง</span>
            <span className="font-bold text-gray-100">Flash Express</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-[11px] font-semibold">เลขพัสดุ</span>
            <span className="font-mono font-bold text-gray-100">{stats.trackingNo}</span>
          </div>
          <hr className="border-[#1E293B] my-2" />
          <div className="space-y-1">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider">รายการสินค้าใน ERP:</p>
            {stats.items.map((item: string, idx: number) => (
              <p key={idx} className="text-[11px] text-slate-650 leading-relaxed truncate">{item.replace("• ", "")}</p>
            ))}
          </div>
        </div>
        
        <div className="p-3 bg-[#0B1121] border-t border-[#1E293B]">
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2 bg-[#B7D1EA] hover:bg-[#a5c2de] text-[#0F172A] font-black rounded-lg text-[10px] uppercase tracking-[0.12em] transition-all flex items-center justify-center gap-1 shadow-none text-center"
          >
            ติดตามสถานะสินค้า <ExternalLink className="w-3.5 h-3.5 text-slate-750" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[280px] bg-[#0F172A] text-white rounded-2xl p-4 border border-slate-800 shadow-none space-y-4 text-xs font-sans mx-auto text-left">
      <div className="flex justify-between items-center">
        <span className="text-[9px] font-black tracking-widest text-[#B7D1EA] uppercase">SolarDream Card</span>
        <span className="px-2 py-0.5 bg-[#D8A87B]/20 text-[#D8A87B] border border-[#D8A87B]/40 rounded-lg text-[9px] font-black uppercase tracking-widest">{stats.tier}</span>
      </div>

      <div className="space-y-3.5 pt-1">
        <p className="text-sm font-black tracking-wide text-slate-50">{stats.name}</p>
        <div className="flex justify-between items-end">
          <span className="text-gray-500 text-[9px] uppercase font-bold tracking-widest">คะแนนสะสมคงเหลือ</span>
          <span className="text-lg font-mono font-black text-white">{stats.points.toLocaleString()} PTS</span>
        </div>
        <hr className="border-slate-800" />
        <p className="text-[9px] text-gray-500 italic">คะแนนของคุณมีอายุถึงวันที่ 31 ธ.ค. 2026</p>
      </div>

      <div>
        <a
          href={couponUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-2.5 bg-[#B7D1EA] hover:bg-[#a5c2de] text-[#0F172A] font-black rounded-lg text-[10px] uppercase tracking-[0.12em] transition-all flex items-center justify-center gap-1 shadow-none text-center"
        >
          แลกคูปองพิเศษ <ExternalLink className="w-3.5 h-3.5 text-slate-755" />
        </a>
      </div>
    </div>
  );
}

// Conversation Box Flex Message Renderer (Simulated Chat Bubble)
function FlexMessageRenderer({ contents }: { contents: any }) {
  if (!contents) return null;

  const altText = contents.altText || "";
  const bubble = contents.contents || contents;

  // Render using standard mapping
  const isOrder = altText.includes("สถานะคำสั่งซื้อ") || bubble.header?.contents?.[1]?.text?.includes("ออเดอร์");
  const isAccountLink = altText.includes("เชื่อมต่อบัญชี") || bubble.body?.contents?.[0]?.text?.includes("Account Linking");
  const isStock = altText.includes("เช็คสต็อก") || bubble.header?.contents?.[0]?.text?.includes("สต็อกคลังสินค้า");
  const isCarousel = contents.type === "carousel" || bubble.type === "carousel" || altText.includes("โปรโมชั่น");
  const isInstallation = altText.includes("ติดตั้ง") || bubble.header?.contents?.[0]?.text?.includes("Installation");
  const isPoints = altText.includes("คะแนน") || altText.includes("สมาชิก") || bubble.body?.contents?.[0]?.text?.includes("SolarDream Card");

  if (isStock) {
    const productsGroup = bubble.body?.contents || [];
    const productRows = productsGroup.filter((c: any) => c.layout === "horizontal") || [];
    
    return (
      <GsapReveal className="w-full max-w-[230px] overflow-hidden rounded-2xl border border-slate-800 bg-[#0F172A] text-left font-sans text-[10px] text-white shadow-none">
        <div className="bg-[#1E293B] p-3 border-b border-slate-800">
          <p className="text-[8px] font-bold tracking-widest text-[#B7D1EA] uppercase">📦 สต็อกคลังสินค้า ERP</p>
          <h4 className="text-[11px] font-black text-white mt-0.5">สถานะคลังสินค้าคงเหลือ</h4>
        </div>
        <div className="p-3 space-y-2">
          {productRows.length > 0 ? (
            productRows.map((row: any, idx: number) => {
              const name = row.contents?.[0]?.contents?.[0]?.text || "";
              const status = row.contents?.[1]?.contents?.[0]?.text || "";
              const isOut = status.includes("หมด");
              const isLow = status.includes("ต่ำ") || status.includes("คงเหลือต่ำ");
              const color = isOut ? "text-rose-500" : isLow ? "text-amber-500" : "text-emerald-500";
              return (
                <div key={idx} className="flex justify-between items-center gap-1">
                  <span className="font-semibold text-slate-350 truncate max-w-[120px]">{name}</span>
                  <span className={cn("font-bold text-[9px]", color)}>{status}</span>
                </div>
              );
            })
          ) : (
            <p className="text-gray-500 text-center py-2">ไม่มีข้อมูลสต็อกสินค้าคงเหลือ</p>
          )}
        </div>
        <div className="p-2 bg-slate-900 border-t border-slate-800 text-center">
          <span className="w-full py-1 bg-[#B7D1EA] text-[#0F172A] font-black rounded text-[9px] uppercase tracking-wider block">
            {bubble.footer?.contents?.[0]?.action?.label || "สอบถามข้อมูลเพิ่ม"}
          </span>
        </div>
      </GsapReveal>
    );
  }

  if (isCarousel) {
    const cards = bubble.contents || contents.contents || [];
    return (
      <GsapReveal className="flex max-w-[240px] shrink-0 snap-x snap-mandatory gap-2 overflow-x-auto py-1 scrollbar-thin">
        {cards.map((card: any, idx: number) => {
          const item = card.contents || card;
          const brand = item.body?.contents?.[0]?.text || "";
          const model = item.body?.contents?.[1]?.text || "";
          const price = item.body?.contents?.[2]?.text || "";
          const imgUrl = item.hero?.url || "";
          return (
            <div key={idx} className="w-[140px] bg-[#0F172A] border border-slate-850 rounded-xl overflow-hidden shadow-none shrink-0 snap-start text-left text-[9px]">
              {imgUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgUrl} alt="promo" className="w-full h-18 object-cover" />
              )}
              <div className="p-2 space-y-0.5">
                <p className="text-[7px] text-[#B7D1EA] font-black uppercase tracking-wider">{brand}</p>
                <p className="font-extrabold text-white truncate">{model}</p>
                <p className="text-[#D8A87B] font-bold mt-0.5">{price}</p>
              </div>
              <div className="p-1.5 bg-slate-900 border-t border-slate-800 text-center">
                <span className="w-full py-0.5 bg-[#B7D1EA] text-[#0F172A] font-black rounded text-[8px] block">
                  {item.footer?.contents?.[0]?.action?.label || "ดูรายละเอียด"}
                </span>
              </div>
            </div>
          );
        })}
      </GsapReveal>
    );
  }

  if (isOrder) {
    const headerTitle = bubble.header?.contents?.[0]?.text || "สถานะคำสั่งซื้อ";
    const orderNo = bubble.header?.contents?.[1]?.text || "ออเดอร์";
    const statusLabel = bubble.body?.contents?.[0]?.contents?.[0]?.text || "สถานะ";
    const statusVal = bubble.body?.contents?.[0]?.contents?.[1]?.text || "กำลังจัดเตรียมสินค้า";
    const carrierLabel = bubble.body?.contents?.[1]?.contents?.[0]?.text || "ผู้ให้บริการ";
    const carrierVal = bubble.body?.contents?.[1]?.contents?.[1]?.text || "Flash Express";
    const trackingLabel = bubble.body?.contents?.[2]?.contents?.[0]?.text || "เลขพัสดุ";
    const trackingVal = bubble.body?.contents?.[2]?.contents?.[1]?.text || "TH26093849202";
    const itemsGroup = bubble.body?.contents?.[4]?.contents || [];
    const itemRows = itemsGroup.slice(1) || [];

    return (
      <GsapReveal className="w-full max-w-[230px] overflow-hidden rounded-2xl border border-[#1E293B] bg-[#0F172A] font-sans text-[10px] text-gray-100 shadow-none">
        <div className="bg-[#0F172A] p-3 text-white">
          <p className="text-[8px] font-bold tracking-widest text-[#B7D1EA] uppercase">{headerTitle}</p>
          <h4 className="text-[11px] font-black mt-0.5">{orderNo}</h4>
        </div>
        <div className="p-3 space-y-1.5">
          <div className="flex justify-between items-center">
            <span>{statusLabel}</span>
            <span className="text-[#B7D1EA] font-black">{statusVal}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>{carrierLabel}</span>
            <span className="font-bold text-gray-100">{carrierVal}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>{trackingLabel}</span>
            <span className="font-mono font-bold text-gray-100">{trackingVal}</span>
          </div>
          {itemRows.length > 0 && (
            <>
              <hr className="border-[#1E293B] my-1.5" />
              <div className="space-y-0.5">
                {itemRows.map((item: any, idx: number) => (
                  <p key={idx} className="text-[9px] text-gray-400 leading-normal truncate">{item.text}</p>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="p-2 bg-[#0B1121] border-t border-[#1E293B]">
          <span className="w-full py-1 bg-[#B7D1EA] text-[#0F172A] font-black rounded text-[9px] uppercase tracking-wider block text-center shadow-none">
            {bubble.footer?.contents?.[0]?.action?.label || "ติดตามสินค้า"}
          </span>
        </div>
      </GsapReveal>
    );
  }

  if (isAccountLink) {
    const title = bubble.body?.contents?.[1]?.text || "เชื่อมต่อบัญชีของคุณ";
    const desc = bubble.body?.contents?.[2]?.text || "ผูกบัญชีเข้ากับ LINE";
    const btnLabel = bubble.footer?.contents?.[0]?.action?.label || "เข้าสู่ระบบ";
    
    return (
      <GsapReveal className="w-full max-w-[230px] overflow-hidden rounded-2xl border border-slate-800 bg-[#0F172A] text-left font-sans text-[10px] text-white shadow-none">
        {bubble.hero?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bubble.hero.url} alt="hero" className="w-full aspect-[20/13] object-cover" />
        )}
        <div className="p-3.5 space-y-1.5">
          <p className="text-[8px] font-bold tracking-widest text-[#B7D1EA] uppercase">SolarDream Account Linking</p>
          <h4 className="text-[11px] font-black text-white">{title}</h4>
          <p className="text-[9px] text-gray-400 leading-normal">{desc}</p>
        </div>
        <div className="p-2.5 bg-slate-900/60 border-t border-slate-800">
          <span className="w-full py-1 bg-[#B7D1EA] text-[#0F172A] font-black rounded text-[9px] uppercase tracking-wider block text-center shadow-none">
            {btnLabel}
          </span>
        </div>
      </GsapReveal>
    );
  }

  if (isInstallation) {
    const title = bubble.header?.contents?.[0]?.text || "Installation Tracker";
    const status = bubble.header?.contents?.[1]?.text || "สถานะงานติดตั้ง";
    const detail = bubble.body?.contents?.[0]?.text || "ทีมงานกำลังอัปเดตความคืบหน้าโครงการ";
    const buttonLabel = bubble.footer?.contents?.[0]?.action?.label || "เปิดหน้าติดตามโครงการ";
    return (
      <GsapReveal className="w-full max-w-[230px] overflow-hidden rounded-2xl border border-slate-800 bg-white text-left font-sans text-[10px] text-slate-900 shadow-none">
        <div className="bg-[#0F172A] p-3 text-white">
          <p className="text-[8px] font-bold uppercase tracking-widest text-[#B7D1EA]">{title}</p>
          <h4 className="mt-1 text-[12px] font-black">{status}</h4>
        </div>
        <div className="space-y-3 p-3">
          <p className="text-[10px] leading-relaxed text-slate-600">{detail}</p>
          <span className="block rounded-lg bg-[#B7D1EA] py-2 text-center text-[9px] font-black text-[#0F172A]">{buttonLabel}</span>
        </div>
      </GsapReveal>
    );
  }

  if (!isPoints) {
    return (
      <GsapReveal className="w-full max-w-[280px] rounded-2xl border border-slate-800 bg-[#0F172A] p-3 text-left text-[9px] text-slate-300 shadow-none">
        <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-[#B7D1EA]">Custom Flex preview</p>
        <pre
          role="region"
          tabIndex={0}
          aria-label="Custom Flex JSON preview"
          className="max-h-72 overflow-auto whitespace-pre-wrap break-all font-mono leading-relaxed text-emerald-300 scrollbar-thin"
        >
          {JSON.stringify(contents, null, 2)}
        </pre>
      </GsapReveal>
    );
  }

  // Loyalty Card
  const memberName = bubble.body?.contents?.[1]?.text || "คุณ สมชาย ใจดี";
  const pointsVal = bubble.body?.contents?.[2]?.contents?.[1]?.text || "1,250 PTS";
  const tierLabel = bubble.body?.contents?.[0]?.contents?.[1]?.text || "GOLD MEMBER";
  const expText = bubble.body?.contents?.[4]?.contents?.[0]?.text || "คะแนนไม่มีวันหมดอายุ";

  return (
    <GsapReveal className="w-full max-w-[230px] space-y-2.5 rounded-2xl border border-slate-800 bg-[#0F172A] p-3 text-left font-sans text-[10px] text-white shadow-none">
      <div className="flex justify-between items-center">
        <span className="text-[8px] font-bold tracking-widest text-[#B7D1EA] uppercase">SolarDream Card</span>
        <span className="px-1.5 py-0.5 bg-[#D8A87B]/25 text-[#D8A87B] border border-[#D8A87B]/30 rounded text-[8px] font-black uppercase tracking-wider">{tierLabel}</span>
      </div>
      <div className="space-y-2">
        <p className="text-[11px] font-black tracking-wide text-slate-50">{memberName}</p>
        <div className="flex justify-between items-end">
          <span className="text-gray-500 text-[8px] uppercase tracking-wider">คะแนนคงเหลือ</span>
          <span className="text-[14px] font-mono font-black text-white">{pointsVal}</span>
        </div>
        <hr className="border-slate-800" />
        <p className="text-[8px] text-gray-400 italic">{expText}</p>
      </div>
      <div>
        <span className="w-full py-1 bg-[#B7D1EA] text-[#0F172A] font-black rounded text-[9px] uppercase tracking-wider block text-center shadow-none">
          {bubble.footer?.contents?.[0]?.action?.label || "แลกสิทธิ์"}
        </span>
      </div>
    </GsapReveal>
  );
}

function QuickReplyStripPreview({ buttons }: { buttons: readonly LineQuickButton[] }) {
  const visibleButtons = sortLineQuickButtons(buttons)
    .filter((button) => button.enabled)
    .slice(0, LINE_MAX_QUICK_REPLY_ITEMS);

  return (
    <section className="rounded-xl border border-slate-800 bg-[#0B1121] p-4" aria-labelledby="line-quick-reply-preview-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="line-quick-reply-preview-title" className="text-xs font-bold text-slate-100">LINE preview</h3>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">The highlighted strip shown above the message composer.</p>
        </div>
        <span className="shrink-0 rounded-full border border-[#B7D1EA]/25 bg-[#B7D1EA]/10 px-2 py-1 text-[9px] font-semibold text-[#B7D1EA]">
          {visibleButtons.length}/{LINE_MAX_QUICK_REPLY_ITEMS} visible
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-[#8bd7e8]/70 bg-[#eaf8fb] text-slate-900">
        <div className="flex items-center gap-2 bg-[#40bfd9] px-3 py-2 text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0F172A] text-[9px] font-black">SD</span>
          <span className="text-[10px] font-bold">SolarDream</span>
        </div>
        <div className="space-y-3 px-3 py-4">
          <div className="max-w-[92%] rounded-xl border border-[#d4edf2] bg-white px-3 py-2.5 text-[10px] leading-4 text-slate-700">
            Choose an option from the quick reply strip.
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="group" aria-label="Quick Reply buttons preview">
            {visibleButtons.length > 0 ? visibleButtons.map((button) => (
              <button
                key={button.id}
                type="button"
                className="min-h-10 shrink-0 rounded-full border border-[#36b7d2] bg-white px-3 text-[10px] font-semibold text-[#16758b]"
                aria-label={`${button.label}, ${button.action === "uri" ? "opens a URL" : "sends a message"}`}
              >
                {button.label}
              </button>
            )) : (
              <span className="rounded-full border border-dashed border-[#82cdda] px-3 py-2 text-[10px] text-[#397a88]">
                No visible buttons
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#b8dfe7] bg-white/80 px-3 py-2 text-[10px] text-slate-500">
            <span className="h-2 w-2 rounded-full bg-[#40bfd9]" aria-hidden="true" />
            Enter a message
          </div>
        </div>
      </div>
    </section>
  );
}

export default function LineClient({ 
  initialEnvStatus,
  defaultWebhookEndpoint,
  systemUsers,
  initialTriggerConfigs,
  initialQuickButtons,
  initialLoginUrl,
  initialConversation,
  productsList,
  proposalsList
}: LineClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const simulatorSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://solardream.com";
  const [envStatus, setEnvStatus] = useState<EnvStatus>(initialEnvStatus);
  const requestedFeature = searchParams.get("lineFeature");
  const activeTab: LineFeature = isLineFeature(requestedFeature) ? requestedFeature : "webhooks";

  const handleFeatureChange = (feature: LineFeature) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", "line");
    params.set("lineFeature", feature);
    router.replace(`?${params.toString()}`);
  };

  // Dynamic user profile contextual mapping
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  
  // Customize triggers and Quick Reply state
  const [triggerConfigs, setTriggerConfigs] = useState<LineTriggerConfig[]>(initialTriggerConfigs);
  const [quickButtons, setQuickButtons] = useState<LineQuickButton[]>(initialQuickButtons);
  const [selectedTriggerId, setSelectedTriggerId] = useState(initialTriggerConfigs[0]?.id || "");
  const [loginUrl, setLoginUrl] = useState(initialLoginUrl || "");
  const [conversation, setConversation] = useState<LineConversationConfig>(initialConversation);
  const [triggerQuery, setTriggerQuery] = useState("");
  const [triggerFilter, setTriggerFilter] = useState<"all" | "enabled">("all");

  const [savedFingerprint, setSavedFingerprint] = useState(() => JSON.stringify({
    triggerConfigs: initialTriggerConfigs,
    quickButtons: initialQuickButtons,
    loginUrl: initialLoginUrl || "",
    conversation: initialConversation,
  }));

  const [isSaving, startSaveTransition] = useTransition();

  // Chat parameters
  const [userInput, setUserInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const initialQuickReplyButtons = initialQuickButtons;

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: "init",
      sender: "bot",
      timestamp: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
      type: "text",
      text: "สวัสดีครับ ยินดีต้อนรับสู่ระบบทดสอบ LINE API สำหรับ SolarDream! ☀️\n\nกรุณาเลือกเมนูด่วนด้านล่างเพื่อทดสอบบอท หรือพิมพ์สิ่งที่ต้องการสอบถามได้เลยครับ 👇",
      flexContent: {
        quickReply: {
          items: initialQuickReplyButtons.filter((button) => button.enabled).map((button) => ({
            action: button.action === "uri"
              ? { label: button.label, uri: resolveQuickButtonValue(button.value, simulatorSiteUrl) }
              : { label: button.label, text: button.value },
          }))
        }
      }
    }
  ]);

  const [simulationLogs, setSimulationLogs] = useState<{
    requestPayload: any;
    responsePayload: any;
    httpStatus: number | null;
  } | null>(null);

  const handleSimulate = async (inputText: string) => {
    if (!inputText.trim()) return;

    // Add user bubble
    const userMsgId = `user_${Date.now()}`;
    const timestampStr = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    
    setChatMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: "user",
        timestamp: timestampStr,
        type: "text",
        text: inputText,
      }
    ]);

    setUserInput("");

    startTransition(async () => {
      try {
        const response = await simulateLineWebhook(inputText, selectedUser?.lineUserId || undefined);
        
        if (!response.success) {
          toast.error(response.error || "Webhook simulation failed");
          setSimulationLogs({
            requestPayload: response.payload || null,
            responsePayload: { error: response.error, details: response.details },
            httpStatus: response.status || null,
          });
          return;
        }

        setSimulationLogs({
          requestPayload: response.payload,
          responsePayload: response.result,
          httpStatus: response.status || 200,
        });

        const replies = response.result?.replies || [];
        if (replies.length === 0) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: `bot_empty_${Date.now()}`,
              sender: "bot",
              timestamp: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
              type: "text",
              text: "(ไม่มีการตอบกลับจาก Webhook เนื่องจากคำหลักไม่ตรงเงื่อนไข)",
            }
          ]);
        } else {
          setChatMessages((prev) => [
            ...prev,
            ...replies.map((reply: any, idx: number) => ({
              id: `bot_reply_${Date.now()}_${idx}`,
              sender: "bot",
              timestamp: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
              type: reply.message.type,
              text: reply.message.text,
              flexContent: reply.message,
            }))
          ]);
        }
      } catch (err: any) {
        toast.error("ข้อผิดพลาดระบบแชตจำลอง");
        console.error(err);
      }
    });
  };

  const clearChat = () => {
    setChatMessages([
      {
        id: `init_${Date.now()}`,
        sender: "bot",
        timestamp: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
        type: "text",
        text: "รีเซ็ตห้องสนทนาแล้ว ทดลองพิมพ์ข้อความเพื่อทดสอบระบบได้เลยครับ 👇",
        flexContent: {
          quickReply: {
            items: quickButtons.filter((button) => button.enabled).map((button) => ({
              action: button.action === "uri"
                ? { label: button.label, uri: resolveQuickButtonValue(button.value, simulatorSiteUrl) }
                : { label: button.label, text: button.value },
            }))
          }
        }
      }
    ]);
    setSimulationLogs(null);
  };

  const selectedTrigger = triggerConfigs.find((trigger) => trigger.id === selectedTriggerId) || null;

  const draftFingerprint = JSON.stringify({ triggerConfigs, quickButtons, loginUrl, conversation });
  const hasUnsavedChanges = savedFingerprint !== draftFingerprint;
  const visibleTriggers = triggerConfigs
    .filter((trigger) => triggerFilter === "all" || trigger.enabled)
    .filter((trigger) => {
      const query = triggerQuery.trim().toLocaleLowerCase();
      if (!query) return true;
      return [trigger.name, trigger.keyword, trigger.description]
        .some((value) => value.toLocaleLowerCase().includes(query));
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const triggerSelection = useAdminSelection(visibleTriggers.map((trigger) => trigger.id));
  const sortedQuickButtons = sortLineQuickButtons(quickButtons);
  const quickButtonSelection = useAdminSelection(sortedQuickButtons.map((button) => button.id));

  const getDefaultFlexJson = (kind: LineTriggerConfig["kind"]): string => {
    switch (kind) {
      case "stock": return DEFAULT_FLEX_JSON_STOCK;
      case "promo": return DEFAULT_FLEX_JSON_PROMO;
      case "order": return DEFAULT_FLEX_JSON_ORDER;
      case "installation": return DEFAULT_FLEX_JSON_INSTALLATION;
      case "points": return DEFAULT_FLEX_JSON_POINTS;
      case "link": return DEFAULT_FLEX_JSON_LINK;
      case "custom": return `{
  "type": "bubble",
  "body": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      { "type": "text", "text": "Your custom SolarDream message", "weight": "bold", "wrap": true }
    ]
  }
}`;
    }
  };

  const updateTrigger = (id: string, patch: Partial<LineTriggerConfig>) => {
    setTriggerConfigs((previous) => previous.map((trigger) => trigger.id === id ? { ...trigger, ...patch } : trigger));
  };

  const getSelectedJsonText = () => selectedTrigger?.flexJson || (selectedTrigger ? getDefaultFlexJson(selectedTrigger.kind) : "{}");

  const setSelectedJsonText = (value: string) => {
    if (selectedTrigger) updateTrigger(selectedTrigger.id, { flexJson: value });
  };

  const getSelectedKeywordText = () => selectedTrigger?.keyword || "";

  const setSelectedKeywordText = (value: string) => {
    if (selectedTrigger) updateTrigger(selectedTrigger.id, { keyword: value });
  };

  const getSelectedDefaultJson = () => selectedTrigger ? getDefaultFlexJson(selectedTrigger.kind) : "{}";

  const handleAddTrigger = () => {
    const id = `custom-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`;
    const nextTrigger: LineTriggerConfig = {
      id,
      name: "New custom trigger",
      description: "Sends a custom Flex response.",
      keyword: "พิมพ์คำสั่งใหม่",
      kind: "custom",
      enabled: true,
      altText: "SolarDream response",
      flexJson: getDefaultFlexJson("custom"),
      sortOrder: Math.max(0, ...triggerConfigs.map((trigger) => trigger.sortOrder)) + 10,
      aliases: [],
    };
    setTriggerConfigs((previous) => [...previous, nextTrigger]);
    setSelectedTriggerId(id);
    toast.success("เพิ่ม Trigger ใหม่แล้ว");
  };

  const handleDuplicateTrigger = () => {
    if (!selectedTrigger) return;
    const id = `custom-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`;
    const nextTrigger: LineTriggerConfig = {
      ...selectedTrigger,
      id,
      name: `${selectedTrigger.name} copy`,
      keyword: `${selectedTrigger.keyword} copy`,
      sortOrder: Math.max(0, ...triggerConfigs.map((trigger) => trigger.sortOrder)) + 10,
      aliases: [],
    };
    setTriggerConfigs((previous) => [...previous, nextTrigger]);
    setSelectedTriggerId(id);
    toast.success("Duplicated trigger into a new draft");
  };

  const handleDeleteTrigger = () => {
    if (!selectedTrigger) return;
    if (!window.confirm(`ลบ Trigger “${selectedTrigger.name}” หรือไม่?`)) return;
    const remaining = triggerConfigs.filter((trigger) => trigger.id !== selectedTrigger.id);
    setTriggerConfigs(remaining);
    triggerSelection.remove([selectedTrigger.id]);
    setSelectedTriggerId(remaining[0]?.id || "");
    toast.success("ลบ Trigger แล้ว");
  };

  const handleBulkDeleteTriggers = () => {
    const selectedIds = Array.from(triggerSelection.selectedIds);
    if (selectedIds.length === 0) return;
    if (!window.confirm(`ลบ ${selectedIds.length} Triggers ที่เลือกหรือไม่?`)) return;

    const selectedIdSet = new Set(selectedIds);
    const remaining = triggerConfigs.filter((trigger) => !selectedIdSet.has(trigger.id));
    setTriggerConfigs(remaining);
    if (selectedTrigger && selectedIdSet.has(selectedTrigger.id)) {
      setSelectedTriggerId(remaining[0]?.id || "");
    }
    triggerSelection.clear();
    toast.success(`ลบ ${selectedIds.length} Triggers แล้ว`);
  };

  const handleAddQuickButton = () => {
    if (quickButtons.length >= LINE_MAX_QUICK_REPLY_ITEMS) {
      toast.error(`LINE รองรับ Quick Reply สูงสุด ${LINE_MAX_QUICK_REPLY_ITEMS} ปุ่ม`);
      return;
    }
    const id = `quick-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`;
    setQuickButtons((previous) => [...previous, {
      id,
      label: "ปุ่มใหม่",
      action: "message",
      value: selectedTrigger?.keyword || "สวัสดี",
      enabled: true,
      sortOrder: Math.max(0, ...previous.map((button) => button.sortOrder)) + 10,
    }]);
  };

  const handleRestoreDefaultQuickButtons = () => {
    if (!window.confirm("Restore the default Quick Reply buttons for the current triggers?")) return;
    setQuickButtons(createDefaultLineQuickButtons(triggerConfigs));
    quickButtonSelection.clear();
    toast.success("Default Quick Reply buttons restored as a draft");
  };

  const updateQuickButton = (id: string, patch: Partial<LineQuickButton>) => {
    setQuickButtons((previous) => previous.map((button) => button.id === id ? { ...button, ...patch } : button));
  };

  const moveQuickButton = (id: string, direction: "up" | "down") => {
    setQuickButtons((previous) => {
      const ordered = sortLineQuickButtons(previous);
      const currentIndex = ordered.findIndex((button) => button.id === id);
      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return previous;

      const next = ordered.slice();
      const [movedButton] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, movedButton);
      return next.map((button, index) => ({ ...button, sortOrder: (index + 1) * 10 }));
    });
  };

  const deleteQuickButton = (id: string) => {
    setQuickButtons((previous) => previous.filter((button) => button.id !== id));
    quickButtonSelection.remove([id]);
  };

  const handleBulkDeleteQuickButtons = () => {
    const selectedIds = Array.from(quickButtonSelection.selectedIds);
    if (selectedIds.length === 0) return;
    if (!window.confirm(`ลบ Quick Buttons ${selectedIds.length} รายการหรือไม่?`)) return;

    const selectedIdSet = new Set(selectedIds);
    setQuickButtons((previous) => previous.filter((button) => !selectedIdSet.has(button.id)));
    quickButtonSelection.clear();
    toast.success(`ลบ Quick Buttons ${selectedIds.length} รายการแล้ว`);
  };

  const handleSaveConfig = () => {
    const invalidJson = triggerConfigs.find((trigger) => trigger.flexJson.trim() && (() => {
      try {
        JSON.parse(trigger.flexJson);
        return false;
      } catch {
        return true;
      }
    })());
    if (invalidJson) {
      setSelectedTriggerId(invalidJson.id);
      toast.error(`Flex JSON ของ ${invalidJson.name} ไม่ถูกต้อง`);
      return;
    }

    startSaveTransition(async () => {
      const result = await saveLineAutomationConfigAction({ triggers: triggerConfigs, quickButtons, loginUrl, conversation });
      if (result.success) {
        setSavedFingerprint(JSON.stringify({ triggerConfigs, quickButtons, loginUrl, conversation }));
        toast.success("บันทึก Triggers และ Quick Buttons สำเร็จ");
      } else {
        toast.error(result.error || "บันทึกการตั้งค่า LINE ไม่สำเร็จ");
      }
    });
  };

  const currentMockStats = getMockedUserStats(selectedUser);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://solardream.com";
  
  const getResolvedPreviewJson = () => {
    const stats = getMockedUserStats(selectedUser);
    const trackingUrl = `https://www.flashexpress.co.th/tracking?keyword=${stats.trackingNo}`;
    const couponRedeemUrl = `${siteUrl}/profile/coupons`;
    const targetLoginUrl = loginUrl || `${siteUrl}/login`;
    const kind = selectedTrigger?.kind;
    const template = getSelectedJsonText();

    try {
      let resolvedStr = template;
      // Substitutions
      resolvedStr = resolvedStr
        .replaceAll("{{orderId}}", stats.orderNo)
        .replaceAll("{{status}}", stats.status)
        .replaceAll("{{trackingNumber}}", stats.trackingNo)
        .replaceAll("{{trackingUrl}}", trackingUrl)
        .replaceAll("{{userName}}", stats.name)
        .replaceAll("{{userPoints}}", stats.points.toString())
        .replaceAll("{{userTier}}", stats.tier)
        .replaceAll("{{couponRedeemUrl}}", couponRedeemUrl)
        .replaceAll("{{installationStatus}}", stats.status)
        .replaceAll("{{systemSizeKwp}}", "5.00 kWp")
        .replaceAll("{{siteUrl}}", siteUrl)
        .replaceAll("{{loginUrl}}", `${targetLoginUrl}${targetLoginUrl.includes("?") ? "&" : "?"}linkToken=mockLinkToken_preview`);

      // Handle array placeholders
      if (kind === "stock") {
        const mockStockRows = [
          { brand: "Solar Panels", model: "Monocrystalline 550W", stock: 12 },
          { brand: "Inverter", model: "Huawei SUN2000-5KTL", stock: 3 },
          { brand: "Racking", model: "Aluminium Rail 4.2m", stock: 0 }
        ].map((p) => {
          const isLow = p.stock <= 3;
          const isOut = p.stock === 0;
          const stockColor = isOut ? "#EF4444" : isLow ? "#F59E0B" : "#10B981";
          const stockStatus = isOut ? "สินค้าหมด" : isLow ? `คงเหลือต่ำ (${p.stock})` : `มีสินค้า (${p.stock})`;
          return {
            type: "box",
            layout: "horizontal",
            margin: "md",
            contents: [
              {
                type: "box",
                layout: "vertical",
                flex: 3,
                contents: [
                  {
                    type: "text",
                    text: `${p.brand} ${p.model}`,
                    size: "xs",
                    color: "#FFFFFF",
                    weight: "bold",
                    wrap: true
                  }
                ]
              },
              {
                type: "box",
                layout: "vertical",
                flex: 2,
                contents: [
                  {
                    type: "text",
                    text: stockStatus,
                    size: "xs",
                    color: stockColor,
                    weight: "bold",
                    align: "end"
                  }
                ]
              }
            ]
          };
        });

        const productsArrayJson = JSON.stringify(mockStockRows);
        if (resolvedStr.includes('"{{products_placeholder}}"')) {
          resolvedStr = resolvedStr.replace('"{{products_placeholder}}"', productsArrayJson.slice(1, -1));
        } else {
          resolvedStr = resolvedStr.replace("{{products_placeholder}}", productsArrayJson);
        }
      }

      if (kind === "order") {
        const mockOrderRows = [
          { text: `• ระบบโซลาร์เซลล์ขนาด 5.00 kWp` },
          { text: `• อุปกรณ์แผงโซลาร์เซลล์ x 10 แผง` }
        ].map((item) => ({
          type: "text",
          text: item.text,
          size: "xs",
          color: "#0F172A",
          margin: "xs"
        }));
        const orderItemsJson = JSON.stringify(mockOrderRows);
        if (resolvedStr.includes('"{{order_items_placeholder}}"')) {
          resolvedStr = resolvedStr.replace('"{{order_items_placeholder}}"', orderItemsJson.slice(1, -1));
        } else {
          resolvedStr = resolvedStr.replace("{{order_items_placeholder}}", orderItemsJson);
        }
      }

      if (kind === "promo") {
        const p = { id: "p1", brand: "Huawei", model: "SUN2000-5KTL-M1", price: 39900, imageUrl: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&q=80&w=400" };
        const detailUrl = `${siteUrl}/catalog/${p.id}`;
        let singleBubble = resolvedStr
          .replaceAll("{{brand}}", p.brand)
          .replaceAll("{{model}}", p.model)
          .replaceAll("{{price}}", p.price.toLocaleString())
          .replaceAll("{{imageUrl}}", p.imageUrl)
          .replaceAll("{{detailUrl}}", detailUrl);
        
        return {
          type: "flex",
          altText: selectedTrigger?.altText || "โปรโมชั่น 🔥",
          contents: {
            type: "carousel",
            contents: [JSON.parse(singleBubble)]
          }
        };
      }

      const parsed: unknown = JSON.parse(resolvedStr);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "type" in parsed && parsed.type === "flex") {
        return parsed;
      }
      return {
        type: "flex",
        altText: selectedTrigger?.altText || selectedTrigger?.name || "SolarDream response",
        contents: parsed,
      };
    } catch (err) {
      return { error: true, message: err instanceof Error ? err.message : "Invalid JSON format" };
    }
  };

  const previewData = getResolvedPreviewJson();
  const previewError = previewData && "error" in previewData && previewData.error === true
    ? previewData
    : null;
  
  const quickReplies = quickButtons
    .filter((button) => button.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, LINE_MAX_QUICK_REPLY_ITEMS)
    .map((button) => ({
      action: button.action === "uri"
        ? { label: button.label, uri: resolveQuickButtonValue(button.value, simulatorSiteUrl) }
        : { label: button.label, text: button.value },
    }));

  return (
    <div className="space-y-6">
      
      {/* Top Banner: Global User Context Binder */}
      <div className="bg-[#0F172A] border border-slate-800 p-5 rounded-2xl shadow-none flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#B7D1EA]/15 border border-[#B7D1EA]/40 flex items-center justify-center text-white">
            <User className="w-5 h-5 text-[#B7D1EA]" />
          </div>
          <div className="text-left">
            <h3 className="text-xs font-black uppercase tracking-wider text-white leading-tight">Simulated User Context</h3>
            <p className="text-[11px] font-medium text-slate-300 mt-0.5">
              Bind a database customer account to retrieve dynamic points and order records.
            </p>
          </div>
        </div>

        {/* User Selector Dropdown */}
        <div className="flex-1 max-w-sm md:self-center">
          <select
            aria-label="Simulated user context"
            value={selectedUser?.id || ""}
            onChange={(e) => {
              const selected = systemUsers.find(u => u.id === e.target.value) || null;
              setSelectedUser(selected);
              toast.info(
                selected 
                  ? `Switched context to: ${selected.fullName || selected.name || selected.email}`
                  : "Using Default System Guest Mock Profile"
              );
            }}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-white focus:outline-none focus:border-[#B7D1EA]"
          >
            <option value="">👤 [Default Mock] คุณ สมชาย ใจดี (Guest Profile)</option>
            {systemUsers.map((user) => (
              <option key={user.id} value={user.id}>
                👤 {user.fullName || user.name || "Unnamed"} ({user.email})
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0F172A] text-left" aria-labelledby="line-feature-navigation-title">
        <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#B7D1EA]">LINE operations</p>
            <h2 id="line-feature-navigation-title" className="mt-1 text-base font-semibold text-slate-50">Choose a channel feature</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
              Each area has its own controls, so connection settings, Quick Replies, Rich Menu publishing, and Flex templates stay easy to find.
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-slate-700 bg-[#0B1121] px-2.5 py-1 text-[10px] font-medium text-slate-400">
            {LINE_FEATURE_TABS.find((tab) => tab.id === activeTab)?.label}
          </span>
        </div>

        <div className="grid gap-1 p-2 sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="LINE feature sections">
          {LINE_FEATURE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                id={`line-tab-${tab.id}`}
                type="button"
                onClick={() => handleFeatureChange(tab.id)}
                className={cn(
                  "group flex min-h-[76px] items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A]",
                  isActive
                    ? "bg-[#B7D1EA] text-[#0F172A]"
                    : "text-slate-300 hover:bg-slate-800/80 hover:text-white",
                )}
                role="tab"
                aria-selected={isActive}
                aria-controls={`line-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
              >
                <span className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                  isActive ? "border-[#0F172A]/15 bg-white/30" : "border-slate-700 bg-[#0B1121] group-hover:border-slate-600",
                )}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold">{tab.label}</span>
                  <span className={cn("mt-1 block text-[10px] leading-4", isActive ? "text-white" : "text-slate-500 group-hover:text-slate-400")}>
                    {tab.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {activeTab === "messages" && (
        <GsapReveal id="line-message-simulator-panel" className="space-y-6" role="tabpanel" aria-labelledby="line-tab-messages">
          <LineMessageLab
            key={selectedUser?.lineUserId || "default-destination"}
            envStatus={envStatus}
            initialDestination={selectedUser?.lineUserId || ""}
          />
          <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[1fr_400px]">
          {/* Controls */}
          <div className="space-y-6">
            
            {/* Status overview */}
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 shadow-none space-y-4">
              <div>
                <h2 className="text-base font-black text-white font-urbanist flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-[#B7D1EA]" />
                  LINE Webhook Simulator Cockpit
                </h2>
                <p className="text-xs font-medium text-slate-300 mt-0.5">
                  Simulate webhook messaging interactions with the local Route endpoint using the active customer context.
                </p>
                {conversation.owner === "chatwoot" && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#B7D1EA]/25 bg-[#B7D1EA]/10 p-3 text-[10px] leading-4 text-slate-200">
                    <Bot className="mt-0.5 h-4 w-4 shrink-0 text-[#B7D1EA]" aria-hidden="true" />
                    <p>
                      Chatwoot is the reply owner. This simulator only confirms that SolarDream will not send a duplicate response.
                      {conversation.chatwootWorkspaceUrl && (
                        <a href={conversation.chatwootWorkspaceUrl} target="_blank" rel="noreferrer" className="ml-1 font-bold text-[#B7D1EA] hover:text-white">
                          Open Chatwoot <ExternalLink className="inline h-3 w-3" aria-hidden="true" />
                        </a>
                      )}
                    </p>
                  </div>
                )}
                {hasUnsavedChanges && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-[10px] leading-4 text-amber-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                    <p>Save the current draft before testing. The server simulator always runs the last saved configuration.</p>
                  </div>
                )}
              </div>

              {/* Dynamic triggers instructions using configured keywords */}
              <div className="space-y-3 pt-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Quick Simulator Buttons
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {triggerConfigs.filter((trigger) => trigger.enabled).sort((a, b) => a.sortOrder - b.sortOrder).map((trigger) => (
                    <button
                      key={trigger.id}
                      type="button"
                      onClick={() => handleSimulate(trigger.keyword)}
                      disabled={isPending}
                      className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl hover:border-[#B7D1EA] hover:bg-slate-800/80 text-left transition-all text-xs flex flex-col justify-between group disabled:opacity-50 cursor-pointer"
                    >
                      <span className="font-extrabold text-white group-hover:text-[#B7D1EA]">“{trigger.keyword}”</span>
                      <span className="text-[10px] text-slate-400 mt-1 block">{trigger.name}</span>
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => handleSimulate("สวัสดี")}
                    disabled={isPending}
                    className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl hover:border-[#B7D1EA] hover:bg-slate-800/80 text-left transition-all text-xs flex flex-col justify-between group disabled:opacity-50 cursor-pointer"
                  >
                    <span className="font-extrabold text-white group-hover:text-[#B7D1EA]">"สวัสดี"</span>
                    <span className="text-[10px] text-slate-400 mt-1 block">คู่มือปุ่มการทำงาน</span>
                  </button>
                </div>
                
                <div className="flex gap-2.5 flex-wrap pt-1.5 select-none">
                  <span className="text-[9px] text-gray-500 uppercase font-black tracking-widest mt-1">Test aliases:</span>
                  {triggerConfigs.filter((trigger) => trigger.enabled && trigger.kind !== "custom").slice(0, 4).map((trigger) => (
                    <button
                      key={`${trigger.id}-test`}
                      type="button"
                      onClick={() => handleSimulate(`ทดสอบ${trigger.keyword}`)}
                      className="px-2.5 py-0.5 rounded-full border border-[#1E293B] bg-[#0F172A] hover:border-[#B7D1EA] text-[10px] text-gray-400 transition-colors cursor-pointer"
                    >
                      ทดสอบ{trigger.keyword}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom input */}
              <div className="pt-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSimulate(userInput)}
                    disabled={isPending}
                    placeholder="พิมพ์ข้อความทดสอบ..."
                    className="flex-1 px-4 py-2.5 rounded-xl border border-[#1E293B] text-xs bg-[#0B1121] focus:bg-[#0F172A] focus:outline-none transition-all disabled:opacity-60 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => handleSimulate(userInput)}
                    disabled={isPending || !userInput.trim()}
                    className="px-5 py-2.5 bg-[#B7D1EA] hover:bg-[#a5c2de] disabled:bg-[#0B1121] disabled:text-gray-500 text-[#0F172A] rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                  >
	                    {isPending ? (
	                      <GsapSpinner className="w-3.5 h-3.5" />
	                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Diagnostic Logs */}
            {simulationLogs && (
              <GsapReveal className="space-y-4 rounded-[2rem] border border-[#1E293B] bg-[#0F172A] p-6 shadow-none">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-black text-gray-100 uppercase tracking-wider flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-[#B7D1EA]" />
                      Webhook JSON Wire Log
                    </h3>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Trace request envelope and responses payloads directly.
                    </p>
                  </div>
                  <span className={cn(
                    "px-2.5 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-widest",
                    simulationLogs.httpStatus === 200 
                      ? "bg-emerald-500/10 border-emerald-250 text-emerald-800"
                      : "bg-rose-500/10 border-rose-250 text-rose-800"
                  )}>
                    STATUS: {simulationLogs.httpStatus || "ERROR"}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider block">1. Simulated Webhook Request</span>
                    <div
                      role="region"
                      tabIndex={0}
                      aria-label="Simulated webhook request payload"
                      className="bg-slate-950 rounded-2xl p-4 font-mono text-[9px] h-52 overflow-y-auto leading-relaxed border border-slate-800 shadow-none scrollbar-thin"
                    >
                      <pre className="text-sky-300 whitespace-pre-wrap break-all select-text font-mono text-[10px]">
                        <code className="text-sky-300 font-mono">{JSON.stringify(simulationLogs.requestPayload, null, 2)}</code>
                      </pre>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider block">2. Webhook Response Reply Payload</span>
                    <div
                      role="region"
                      tabIndex={0}
                      aria-label="Webhook response reply payload"
                      className="bg-slate-950 rounded-2xl p-4 font-mono text-[9px] h-52 overflow-y-auto leading-relaxed border border-slate-800 shadow-none scrollbar-thin"
                    >
                      <pre className="text-emerald-400 whitespace-pre-wrap break-all select-text font-mono text-[10px]">
                        <code className="text-emerald-400 font-mono">{JSON.stringify(simulationLogs.responsePayload, null, 2)}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              </GsapReveal>
            )}
          </div>

          {/* LINE Chat Room Smartphone simulator */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-full max-w-[320px] aspect-[9/19] rounded-[2.5rem] border-8 border-slate-900 bg-[#E2E8F0] shadow-none overflow-hidden flex flex-col">
              {/* Speaker notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 h-4 w-28 bg-slate-900 rounded-b-xl z-30" />
              
              {/* Mock App Header */}
              <div className="pt-6 pb-3 px-4 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between text-white z-20 shrink-0 select-none">
                <div className="flex items-center gap-2">
                  <div className="relative w-8 h-8 rounded-full bg-cyan-950 border border-cyan-400/20 flex items-center justify-center font-bold text-xs text-[#B7D1EA]">
                    SD
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#0F172A]" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-[11px] font-extrabold leading-tight">SolarDream Bot</p>
                    <p className="text-[8px] text-emerald-400 uppercase tracking-widest leading-none mt-0.5">Online</p>
                  </div>
                </div>
                <button 
                  onClick={clearChat}
                  className="text-[9px] font-black uppercase text-gray-500 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              </div>

              {/* Chat conversations log screen */}
              <div
                role="region"
                tabIndex={0}
                aria-label="LINE simulator conversation"
                className="flex-1 bg-[#0F172A] p-3 overflow-y-auto space-y-4 flex flex-col z-10 select-text scrollbar-thin"
              >
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex items-start gap-1.5 w-full max-w-[90%]",
                      msg.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                    )}
                  >
                    {msg.sender === "bot" && (
                      <div className="w-6 h-6 rounded-full bg-slate-950 flex items-center justify-center font-extrabold text-[8px] text-[#B7D1EA] shrink-0 select-none border border-slate-800 shadow-none">
                        SD
                      </div>
                    )}

                    <div className="space-y-1">
                      {msg.type === "text" ? (
                        <div className={cn(
                          "p-3 rounded-2xl text-[10px] leading-relaxed shadow-none whitespace-pre-wrap max-w-[210px] text-left",
                          msg.sender === "user"
                            ? "bg-[#B7D1EA] text-[#0F172A] rounded-tr-none font-bold"
                            : "bg-[#0F172A] text-gray-100 rounded-tl-none border border-[#1E293B]"
                        )}>
                          {msg.text}
                        </div>
                      ) : (
                        <FlexMessageRenderer contents={msg.flexContent} />
                      )}
                      <span className="text-[8px] text-gray-500 font-bold block px-1 text-right select-none">
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Replies list */}
              {quickReplies.length > 0 && (
                <div className="px-2 py-1.5 bg-[#0B1121] border-t border-[#1E293B]/60 flex gap-1.5 overflow-x-auto shrink-0 z-20 scrollbar-none select-none">
                  {quickReplies.map((item: any, idx: number) => {
                    const label = item.action?.label || item.action?.text || "Option";
                    const actionText = item.action?.text || "";
                    const actionUri = item.action?.uri || "";
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (actionText) {
                            void handleSimulate(actionText);
                          } else if (actionUri) {
                            window.open(actionUri, "_blank", "noopener,noreferrer");
                          }
                        }}
                        className="px-2.5 py-1 bg-[#0F172A] border border-[#B7D1EA] hover:bg-[#B7D1EA]/10 text-[#B7D1EA] rounded-full text-[8px] font-bold shrink-0 transition-colors shadow-none cursor-pointer whitespace-nowrap"
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Input placeholder */}
              <div className="p-3 bg-[#0F172A] border-t border-[#1E293B] flex items-center justify-between text-gray-500 text-[10px] font-bold gap-2 select-none shrink-0 z-20">
                <span className="truncate">Type simulated message...</span>
                <div className="w-7 h-7 bg-[#0B1121] border border-[#1E293B] rounded-full flex items-center justify-center shadow-none">
                  <Send className="w-3 h-3 text-slate-300" />
                </div>
              </div>
            </div>
          </div>
          </div>
        </GsapReveal>
      )}

      {(activeTab === "webhooks" || activeTab === "messages" || activeTab === "flex") && (
        <GsapReveal id={`line-panel-${activeTab}`} className="space-y-6" role="tabpanel" aria-labelledby={`line-tab-${activeTab}`}>
          {activeTab === "webhooks" && (
            <>
              <LineOperationsPanel
                envStatus={envStatus}
                defaultWebhookEndpoint={defaultWebhookEndpoint}
                conversationOwner={conversation.owner}
              />

              <section className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-5 text-left shadow-none sm:p-6 lg:sticky lg:top-4 lg:z-20" aria-labelledby="line-control-room-title">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#B7D1EA]/30 bg-[#B7D1EA]/10 text-[#B7D1EA]">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="line-control-room-title" className="text-base font-black text-gray-100">LINE control room</h2>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-400">
                    One place for ownership, message rules, and operational safeguards. Draft changes are not live until you save them.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold",
                  hasUnsavedChanges
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                    : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
                )}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", hasUnsavedChanges ? "bg-amber-300" : "bg-emerald-300")} />
                  {hasUnsavedChanges ? "Unsaved draft" : "Saved configuration"}
                </span>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={isSaving || !hasUnsavedChanges}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#B7D1EA] px-4 text-xs font-black text-[#0F172A] transition hover:bg-[#a5c2de] disabled:cursor-not-allowed disabled:bg-[#0B1121] disabled:text-gray-500"
                >
                  {isSaving ? <GsapSpinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  {isSaving ? "Saving changes" : "Save changes"}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[#1E293B] bg-[#0B1121] px-3.5 py-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Conversation owner</span>
                <span className="mt-1 flex items-center gap-1.5 text-sm font-black text-gray-100">
                  {conversation.owner === "chatwoot" ? <Bot className="h-4 w-4 text-[#B7D1EA]" /> : <MessageCircle className="h-4 w-4 text-[#B7D1EA]" />}
                  {conversation.owner === "chatwoot" ? "Chatwoot" : "SolarDream"}
                </span>
              </div>
              <div className="rounded-xl border border-[#1E293B] bg-[#0B1121] px-3.5 py-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Active triggers</span>
                <span className="mt-1 block text-sm font-black text-gray-100">{triggerConfigs.filter((trigger) => trigger.enabled).length}<span className="ml-1 text-xs font-medium text-gray-500">/ {triggerConfigs.length}</span></span>
              </div>
              <div className="rounded-xl border border-[#1E293B] bg-[#0B1121] px-3.5 py-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Quick replies</span>
                <span className="mt-1 block text-sm font-black text-gray-100">{quickButtons.filter((button) => button.enabled).length}<span className="ml-1 text-xs font-medium text-gray-500">/ {LINE_MAX_QUICK_REPLY_ITEMS}</span></span>
              </div>
              <div className="rounded-xl border border-[#1E293B] bg-[#0B1121] px-3.5 py-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Channel access</span>
                <span className="mt-1 flex items-center gap-1.5 text-sm font-black text-gray-100">
                  <span className={cn("h-2 w-2 rounded-full", envStatus.LINE_CHANNEL_ACCESS_TOKEN ? "bg-emerald-400" : "bg-rose-400")} />
                  {envStatus.LINE_CHANNEL_ACCESS_TOKEN ? "Connected" : "Needs setup"}
                </span>
              </div>
            </div>
              </section>
            </>
          )}

          <div className={cn("grid grid-cols-1 items-start gap-8", activeTab === "flex" && "xl:grid-cols-2")}>
          {/* Left panel: account linking, triggers, and outbound tests */}
          <div className="space-y-6">
            {activeTab === "webhooks" && (
              <>
                {/* Conversation ownership and Chatwoot handoff */}
                <section className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-5 text-left shadow-none sm:p-6" aria-labelledby="line-conversation-owner-title">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#B7D1EA]/30 bg-[#B7D1EA]/10 text-[#B7D1EA]">
                  <Bot className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="line-conversation-owner-title" className="text-base font-black text-gray-100">Conversation ownership</h2>
                  <p className="mt-1 text-xs leading-5 text-gray-400">
                    Choose exactly one system to reply to LINE messages. Rich menus, account linking, and operational tools stay in SolarDream.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2" role="group" aria-label="Conversation owner">
                <button
                  type="button"
                  aria-pressed={conversation.owner === "chatwoot"}
                  onClick={() => setConversation((current) => ({ ...current, owner: "chatwoot" }))}
                  className={cn(
                    "rounded-xl border p-3 text-left transition",
                    conversation.owner === "chatwoot"
                      ? "border-[#B7D1EA]/70 bg-[#B7D1EA]/10"
                      : "border-[#1E293B] bg-[#0B1121] hover:border-[#B7D1EA]/40",
                  )}
                >
                  <span className="flex items-center gap-2 text-xs font-black text-gray-100"><Bot className="h-4 w-4 text-[#B7D1EA]" /> Chatwoot manages replies</span>
                  <span className="mt-1 block text-[10px] leading-4 text-gray-500">Use your existing bot, inbox rules, agents, and conversation history.</span>
                </button>
                <button
                  type="button"
                  aria-pressed={conversation.owner === "native"}
                  onClick={() => setConversation((current) => ({ ...current, owner: "native" }))}
                  className={cn(
                    "rounded-xl border p-3 text-left transition",
                    conversation.owner === "native"
                      ? "border-[#B7D1EA]/70 bg-[#B7D1EA]/10"
                      : "border-[#1E293B] bg-[#0B1121] hover:border-[#B7D1EA]/40",
                  )}
                >
                  <span className="flex items-center gap-2 text-xs font-black text-gray-100"><MessageCircle className="h-4 w-4 text-[#B7D1EA]" /> SolarDream replies</span>
                  <span className="mt-1 block text-[10px] leading-4 text-gray-500">Use the triggers and Flex templates configured below.</span>
                </button>
              </div>

              {conversation.owner === "chatwoot" ? (
                <div className="mt-4 space-y-4">
                  <div className="flex gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-[10px] leading-4 text-amber-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                    <p>
                      Chatwoot must own the LINE channel webhook. SolarDream will acknowledge incoming messages without sending a second reply, which prevents duplicate bot responses.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Chatwoot workspace URL</span>
                      <input
                        type="url"
                        value={conversation.chatwootWorkspaceUrl}
                        onChange={(event) => setConversation((current) => ({ ...current, chatwootWorkspaceUrl: event.target.value }))}
                        placeholder="https://support.example.com"
                        className="w-full rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 py-2.5 text-xs font-medium text-gray-100 outline-none focus:border-[#B7D1EA]"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">LINE inbox URL (optional)</span>
                      <input
                        type="url"
                        value={conversation.chatwootInboxUrl}
                        onChange={(event) => setConversation((current) => ({ ...current, chatwootInboxUrl: event.target.value }))}
                        placeholder="https://support.example.com/app/accounts/1/inbox/2"
                        className="w-full rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 py-2.5 text-xs font-medium text-gray-100 outline-none focus:border-[#B7D1EA]"
                      />
                    </label>
                  </div>
                  <a
                    href="https://developers.chatwoot.com/contributing-guide/line-channel-setup"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#B7D1EA] transition hover:text-white"
                  >
                    Open Chatwoot LINE channel setup guide <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-[#1E293B] bg-[#0B1121] p-3 text-[10px] leading-4 text-gray-500">
                  Native mode sends replies from the SolarDream webhook. Use this mode only when SolarDream is the configured LINE webhook owner.
                </p>
              )}
                </section>

                {/* Account Linking Settings */}
                <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-6 shadow-none space-y-4 text-left">
              <div>
                <h2 className="text-base font-black text-gray-100 font-sans flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#B7D1EA]" />
                  Account Linking URL Settings
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Set the redirect base URL for the login page when users initiate account linking from LINE.
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Login Redirect URL (ลิงก์หน้าล็อกอินเข้าสู่ระบบ)
                  </label>
                  <input
                    type="text"
                    value={loginUrl}
                    onChange={(e) => setLoginUrl(e.target.value)}
                    placeholder="เช่น https://solardream.onrender.com/th/login"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#1E293B] bg-[#0B1121] text-xs font-bold focus:bg-[#0F172A] focus:outline-none"
                  />
                  <p className="text-[9px] text-gray-400 mt-1 leading-normal">
                    *ระบุ URL ที่ถูกต้องรวมภาษา (locale) เช่น <code className="bg-[#0B1121] px-0.5 border rounded">/th/login</code> เพื่อป้องกันไม่ให้ next-intl รีไดเรกต์ล้างค่าพารามิเตอร์ <code className="bg-[#0B1121] px-0.5 border rounded">linkToken</code> ออก
                  </p>
                </div>
              </div>
                </div>
              </>
            )}

            {activeTab === "flex" && (
              <>
                {/* Trigger and Flex configuration */}
                <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-6 shadow-none space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-base font-black text-gray-100 font-sans flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-[#B7D1EA]" />
                    Customize Triggers &amp; Flex
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5 max-w-xl">
                    Create message commands, attach a business action or custom Flex response, and disable old commands without editing code.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddTrigger}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-[#B7D1EA] px-3 text-[10px] font-black uppercase tracking-wider text-[#0F172A] transition hover:bg-[#a5c2de]"
                >
                  <span className="text-sm leading-none">+</span> Add trigger
                </button>
              </div>

              <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Triggers</span>
                    <span className="text-[10px] text-gray-500">{triggerConfigs.length}/30</span>
                  </div>
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                    <span className="sr-only">Search triggers</span>
                    <input
                      type="search"
                      value={triggerQuery}
                      onChange={(event) => setTriggerQuery(event.target.value)}
                      placeholder="Search by name or keyword"
                      className="w-full rounded-lg border border-[#1E293B] bg-[#0B1121] py-2 pl-8 pr-2.5 text-[10px] text-gray-100 outline-none focus:border-[#B7D1EA]"
                    />
                  </label>
                  <div className="flex gap-1 rounded-lg border border-[#1E293B] bg-[#0B1121] p-1">
                    {(["all", "enabled"] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        aria-pressed={triggerFilter === filter}
                        onClick={() => setTriggerFilter(filter)}
                        className={cn(
                          "min-h-7 flex-1 rounded-md px-2 text-[9px] font-bold transition",
                          triggerFilter === filter ? "bg-[#B7D1EA] text-[#0F172A]" : "text-gray-500 hover:text-gray-200",
                        )}
                      >
                        {filter === "all" ? "All" : "Enabled"}
                      </button>
                    ))}
                  </div>
                  <AdminBulkActionBar
                    selectedCount={triggerSelection.selectedCount}
                    visibleCount={visibleTriggers.length}
                    allVisibleSelected={triggerSelection.allVisibleSelected}
                    someVisibleSelected={triggerSelection.someVisibleSelected}
                    onToggleVisible={triggerSelection.toggleVisible}
                    onClear={triggerSelection.clear}
                    actions={[
                      { id: "delete", label: "Delete selected", icon: Trash2, tone: "danger", onClick: handleBulkDeleteTriggers },
                    ]}
                  />
                  <div className="max-h-[360px] space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
                    {visibleTriggers.map((trigger) => (
                      <div
                        key={trigger.id}
                        className={cn(
                          "flex items-start gap-2 rounded-xl border px-2 py-2 transition",
                          selectedTriggerId === trigger.id
                            ? "border-[#B7D1EA]/70 bg-[#B7D1EA]/10"
                            : "border-[#1E293B] bg-[#0B1121] hover:border-[#B7D1EA]/40",
                        )}
                      >
                        <AdminSelectionCheckbox
                          checked={triggerSelection.isSelected(trigger.id)}
                          onChange={() => triggerSelection.toggle(trigger.id)}
                          label={`Select trigger ${trigger.name}`}
                          className="mt-1 shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedTriggerId(trigger.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-[11px] font-bold text-gray-100">{trigger.name}</span>
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", trigger.enabled ? "bg-emerald-400" : "bg-slate-600")} />
                          </span>
                          <span className="mt-1 block truncate font-mono text-[9px] text-gray-500">{trigger.keyword}</span>
                        </button>
                      </div>
                    ))}
                    {visibleTriggers.length === 0 && (
                      <div className="rounded-xl border border-dashed border-[#1E293B] p-4 text-[10px] leading-relaxed text-gray-500">
                        {triggerConfigs.length === 0 ? "No triggers yet. Add one to start routing LINE messages." : "No triggers match this filter."}
                      </div>
                    )}
                  </div>
                </div>

                {selectedTrigger ? (
                  <div className="space-y-4 rounded-xl border border-[#1E293B] bg-[#0B1121] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#B7D1EA]">Trigger editor</span>
                        <p className="mt-1 text-[10px] text-gray-500">Changes stay in this draft until you save all settings.</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleDuplicateTrigger}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E293B] px-2.5 py-1.5 text-[10px] font-bold text-gray-300 transition hover:border-[#B7D1EA]/50 hover:text-white"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteTrigger}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/30 px-2.5 py-1.5 text-[10px] font-bold text-rose-300 transition hover:bg-rose-400/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Name</span>
                        <input
                          type="text"
                          value={selectedTrigger.name}
                          onChange={(event) => updateTrigger(selectedTrigger.id, { name: event.target.value })}
                          className="w-full rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2.5 text-xs font-bold text-gray-100 outline-none focus:border-[#B7D1EA]"
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Response type</span>
                        <select
                          value={selectedTrigger.kind}
                          onChange={(event) => updateTrigger(selectedTrigger.id, { kind: event.target.value as LineTriggerConfig["kind"] })}
                          className="w-full rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2.5 text-xs font-bold text-gray-100 outline-none focus:border-[#B7D1EA]"
                        >
                          <option value="order">Order status</option>
                          <option value="installation">Installation status</option>
                          <option value="points">Loyalty points</option>
                          <option value="stock">Stock check</option>
                          <option value="promo">Promotions carousel</option>
                          <option value="link">Account linking</option>
                          <option value="custom">Custom Flex</option>
                        </select>
                      </label>
                    </div>

                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2.5">
                      <span>
                        <span className="block text-xs font-bold text-gray-100">Trigger enabled</span>
                        <span className="mt-0.5 block text-[10px] text-gray-500">Disabled triggers stop matching new LINE messages.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={selectedTrigger.enabled}
                        onChange={(event) => updateTrigger(selectedTrigger.id, { enabled: event.target.checked })}
                        className="h-4 w-4 accent-[#B7D1EA]"
                      />
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Message keyword</span>
                      <input
                        type="text"
                        value={selectedTrigger.keyword}
                        onChange={(event) => setSelectedKeywordText(event.target.value)}
                        placeholder="ข้อความที่ผู้ใช้ส่งจาก Rich Menu"
                        className="w-full rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2.5 text-xs font-bold text-gray-100 outline-none focus:border-[#B7D1EA]"
                      />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">LINE alt text</span>
                        <input
                          type="text"
                          value={selectedTrigger.altText}
                          onChange={(event) => updateTrigger(selectedTrigger.id, { altText: event.target.value })}
                          className="w-full rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2.5 text-xs font-bold text-gray-100 outline-none focus:border-[#B7D1EA]"
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Description</span>
                        <input
                          type="text"
                          value={selectedTrigger.description}
                          onChange={(event) => updateTrigger(selectedTrigger.id, { description: event.target.value })}
                          className="w-full rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2.5 text-xs font-bold text-gray-100 outline-none focus:border-[#B7D1EA]"
                        />
                      </label>
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <label htmlFor="line-flex-template" className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Flex JSON template</label>
                        <button
                          type="button"
                          onClick={() => setSelectedJsonText(getSelectedDefaultJson())}
                          className="text-[10px] font-bold text-[#B7D1EA] transition hover:text-white"
                        >
                          Reset template
                        </button>
                      </div>
                      <textarea
                        id="line-flex-template"
                        rows={12}
                        value={getSelectedJsonText()}
                        onChange={(event) => setSelectedJsonText(event.target.value)}
                        className="w-full rounded-lg border border-[#1E293B] bg-slate-950 px-3 py-2.5 font-mono text-[10px] leading-relaxed text-emerald-300 outline-none focus:border-[#B7D1EA]"
                        spellCheck={false}
                      />
                      <p className="mt-1.5 text-[9px] leading-relaxed text-gray-500">
                        {selectedTrigger.kind === "stock" && "Use {{products_placeholder}} for live stock rows."}
                        {selectedTrigger.kind === "order" && "Use {{orderId}}, {{status}}, {{trackingNumber}}, {{trackingUrl}}, and {{order_items_placeholder}}."}
                        {selectedTrigger.kind === "installation" && "Use {{installationStatus}}, {{orderId}}, {{systemSizeKwp}}, and {{trackingUrl}}."}
                        {selectedTrigger.kind === "points" && "Use {{userName}}, {{userPoints}}, {{userTier}}, and {{couponRedeemUrl}}."}
                        {selectedTrigger.kind === "link" && "Use {{loginUrl}} for the secure account-link URL."}
                        {selectedTrigger.kind === "promo" && "Use {{brand}}, {{model}}, {{price}}, {{imageUrl}}, and {{detailUrl}}."}
                        {selectedTrigger.kind === "custom" && "Custom Flex supports {{siteUrl}} and static JSON content."}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
              </>
            )}

            {activeTab === "messages" && (
              <>
                {/* LINE Quick Reply configuration */}
                <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-6 shadow-none space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-base font-black text-gray-100 font-sans flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-[#B7D1EA]" />
                    Quick Reply strip
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5 max-w-xl">
                    Configure the highlighted buttons above the LINE message composer. Message buttons call a trigger, while URL buttons open a page directly.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleRestoreDefaultQuickButtons}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#1E293B] px-3 text-[10px] font-bold text-slate-300 transition hover:border-[#B7D1EA]/50 hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Restore defaults
                  </button>
                  <button
                    type="button"
                    onClick={handleAddQuickButton}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#B7D1EA]/50 px-3 text-[10px] font-black uppercase tracking-wider text-[#B7D1EA] transition hover:bg-[#B7D1EA]/10"
                  >
                    <span className="text-sm leading-none">+</span> Add button
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-[#B7D1EA]/25 bg-[#B7D1EA]/10 p-3 text-[10px] leading-4 text-slate-300">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#B7D1EA]" aria-hidden="true" />
                <p>
                  This controls the highlighted Quick Reply row from your screenshot. It is different from the persistent Rich Menu, which you can edit in the <button type="button" onClick={() => handleFeatureChange("quick-menu")} className="font-bold text-[#B7D1EA] underline decoration-[#B7D1EA]/50 underline-offset-2 hover:text-white">Rich Menu</button> tab. Changes appear on the next bot reply after saving.
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.72fr)] xl:items-start">
                <div className="space-y-3">
                  <AdminBulkActionBar
                    selectedCount={quickButtonSelection.selectedCount}
                    visibleCount={sortedQuickButtons.length}
                    allVisibleSelected={quickButtonSelection.allVisibleSelected}
                    someVisibleSelected={quickButtonSelection.someVisibleSelected}
                    onToggleVisible={quickButtonSelection.toggleVisible}
                    onClear={quickButtonSelection.clear}
                    actions={[
                      { id: "delete", label: "Delete selected", icon: Trash2, tone: "danger", onClick: handleBulkDeleteQuickButtons },
                    ]}
                  />

                  <div className="space-y-2">
                    {sortedQuickButtons.map((button, index) => (
                      <div key={button.id} className="grid gap-2 rounded-xl border border-[#1E293B] bg-[#0B1121] p-3 sm:grid-cols-[24px_24px_minmax(0,1fr)_130px_minmax(0,1.5fr)_auto] sm:items-center">
                        <AdminSelectionCheckbox
                          checked={quickButtonSelection.isSelected(button.id)}
                          onChange={() => quickButtonSelection.toggle(button.id)}
                          label={`Select quick button ${button.label}`}
                        />
                        <input
                          type="checkbox"
                          checked={button.enabled}
                          onChange={(event) => updateQuickButton(button.id, { enabled: event.target.checked })}
                          className="h-4 w-4 accent-[#B7D1EA]"
                          aria-label={`Show ${button.label || `Quick Reply ${index + 1}`}`}
                        />
                        <input
                          type="text"
                          value={button.label}
                          maxLength={LINE_QUICK_REPLY_LABEL_MAX_LENGTH}
                          onChange={(event) => updateQuickButton(button.id, { label: event.target.value })}
                          placeholder="Button label"
                          aria-label={`Label for Quick Reply ${index + 1}`}
                          className="min-w-0 rounded-lg border border-[#1E293B] bg-[#0F172A] px-2.5 py-2 text-xs font-bold text-gray-100 outline-none focus:border-[#B7D1EA]"
                        />
                        <select
                          value={button.action}
                          onChange={(event) => updateQuickButton(button.id, { action: event.target.value as LineQuickButton["action"] })}
                          aria-label={`Action type for ${button.label || `Quick Reply ${index + 1}`}`}
                          className="rounded-lg border border-[#1E293B] bg-[#0F172A] px-2.5 py-2 text-xs font-bold text-gray-100 outline-none focus:border-[#B7D1EA]"
                        >
                          <option value="message">Message</option>
                          <option value="uri">Open URL</option>
                        </select>
                        <input
                          type={button.action === "uri" ? "url" : "text"}
                          value={button.value}
                          maxLength={button.action === "uri" ? LINE_QUICK_REPLY_URI_MAX_LENGTH : LINE_QUICK_REPLY_MESSAGE_MAX_LENGTH}
                          onChange={(event) => updateQuickButton(button.id, { value: event.target.value })}
                          placeholder={button.action === "uri" ? "{{siteUrl}}/wizard" : "Trigger keyword"}
                          aria-label={`Action value for ${button.label || `Quick Reply ${index + 1}`}`}
                          className="min-w-0 rounded-lg border border-[#1E293B] bg-[#0F172A] px-2.5 py-2 font-mono text-[10px] text-gray-100 outline-none focus:border-[#B7D1EA]"
                        />
                        <div className="flex items-center justify-end gap-1.5 sm:justify-self-end">
                          <button
                            type="button"
                            onClick={() => moveQuickButton(button.id, "up")}
                            disabled={index === 0}
                            aria-label={`Move ${button.label || `Quick Reply ${index + 1}`} up`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#1E293B] text-slate-300 transition hover:border-[#B7D1EA]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <ChevronUp className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveQuickButton(button.id, "down")}
                            disabled={index === sortedQuickButtons.length - 1}
                            aria-label={`Move ${button.label || `Quick Reply ${index + 1}`} down`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#1E293B] text-slate-300 transition hover:border-[#B7D1EA]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <ChevronDown className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteQuickButton(button.id)}
                            aria-label={`Delete ${button.label || `Quick Reply ${index + 1}`}`}
                            className="rounded-lg border border-rose-400/30 px-2.5 py-2 text-[10px] font-bold text-rose-300 transition hover:bg-rose-400/10"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                    {quickButtons.length === 0 && (
                      <div className="rounded-xl border border-dashed border-[#1E293B] p-4 text-[10px] text-gray-500">
                        No Quick Reply buttons. Add one or save an empty set to hide Quick Replies.
                      </div>
                    )}
                  </div>
                </div>

                <QuickReplyStripPreview buttons={quickButtons} />
              </div>

              <div className="flex flex-col gap-3 border-t border-[#1E293B] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[10px] leading-relaxed text-gray-500">LINE allows up to {LINE_MAX_QUICK_REPLY_ITEMS} Quick Reply buttons. Order is applied left to right, and disabled buttons are hidden.</p>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={isSaving || !hasUnsavedChanges}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#B7D1EA] px-4 text-xs font-black uppercase tracking-wider text-[#0F172A] transition hover:bg-[#a5c2de] disabled:cursor-not-allowed disabled:bg-[#0B1121] disabled:text-gray-500"
                >
                  {isSaving ? <GsapSpinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  {isSaving ? "Saving..." : "Save all changes"}
                </button>
              </div>
            </div>

            {/* Outbound message tests */}
            <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-6 shadow-none space-y-5">
              <div>
                <h2 className="text-base font-black text-gray-100 font-sans flex items-center gap-2">
                  <Send className="w-5 h-5 text-[#B7D1EA]" />
                  Outbound message tests
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Test controlled shipping updates and low-stock notifications before enabling an automation.
                </p>
              </div>

              <div className="space-y-4 text-left">
                {/* Outbound Shipping Update push */}
                <div className="border border-[#1E293B] p-4 rounded-2xl bg-[#0B1121]/70 space-y-2.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">1. Shipping Status Outbound Notification</span>
                  <div className="flex gap-2">
                    <select
                      id="shipping-test-proposal-select"
                      aria-label="Shipping notification test proposal"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-[#1E293B] bg-[#0F172A] text-xs font-semibold text-gray-100"
                    >
                      <option value="">-- เลือกรายการออเดอร์ --</option>
                      {proposalsList.map((prop) => (
                        <option key={prop.id} value={prop.id}>
                          Order #{prop.id.slice(0, 8).toUpperCase()} ({prop.status})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={async () => {
                        const selectEl = document.getElementById("shipping-test-proposal-select") as HTMLSelectElement;
                        const propId = selectEl?.value;
                        if (!propId) {
                          toast.error("กรุณาเลือกรายการออเดอร์ก่อนดำเนินการ");
                          return;
                        }
                        const res = await testShippingNotificationPush(propId);
                        if (res.success) {
                          toast.success(`ส่งแจ้งเตือนเลขพัสดุสำเร็จ! ผู้รับ: ${res.recipientName}`);
                        } else {
                          toast.error(`ส่งแจ้งเตือนล้มเหลว: ${res.error}`);
                        }
                      }}
                      className="px-4 py-1.5 bg-[#B7D1EA] hover:bg-[#a5c2de] text-[#0F172A] rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap"
                    >
                      Push Notification
                    </button>
                  </div>
                </div>

                {/* Low stock warning push */}
                <div className="border border-[#1E293B] p-4 rounded-2xl bg-[#0B1121]/70 space-y-2.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">2. Low Stock ERP Warning Alert</span>
                  <div className="flex gap-2">
                    <select
                      id="low-stock-test-product-select"
                      aria-label="Low-stock alert test product"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-[#1E293B] bg-[#0F172A] text-xs font-semibold text-gray-100"
                    >
                      <option value="">-- เลือกรายการสินค้า --</option>
                      {productsList.map((prod) => (
                        <option key={prod.id} value={prod.id}>
                          {prod.brand} {prod.model} (คงเหลือ: {prod.stock})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={async () => {
                        const selectEl = document.getElementById("low-stock-test-product-select") as HTMLSelectElement;
                        const prodId = selectEl?.value;
                        if (!prodId) {
                          toast.error("กรุณาเลือกรายการสินค้าก่อนดำเนินการ");
                          return;
                        }
                        const res = await testLowStockAlertPush(prodId);
                        if (res.success) {
                          toast.success(`ส่งแจ้งเตือนสต็อกสินค้าต่ำสำเร็จ! สินค้า: ${res.productName}`);
                        } else {
                          toast.error(`ส่งแจ้งเตือนล้มเหลว: ${res.error}`);
                        }
                      }}
                      className="px-4 py-1.5 bg-[#B7D1EA] hover:bg-[#a5c2de] text-[#0F172A] rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap"
                    >
                      Push Alert
                    </button>
                  </div>
                </div>

              </div>
            </div>
              </>
            )}
          </div>

          {/* Right Panel: Previews & LINE Console Setup Tutorial */}
          {activeTab === "flex" && (
            <div className="space-y-6">
            
            {/* LINE Flex Message Simulator Previews */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 text-center">
                Live Simulator Preview (Trigger: "{getSelectedKeywordText()}")
              </h3>
              
              <div className="flex flex-col items-center justify-center p-4 bg-[#0F172A] border border-[#1E293B] rounded-[2rem] min-h-[380px] overflow-hidden select-text">
                {previewError ? (
	                  <GsapPulse className="p-4 bg-rose-500/10 border border-rose-250 text-rose-800 rounded-2xl text-[10px] space-y-1 w-full max-w-[240px] text-left">
	                    <p className="font-extrabold uppercase text-rose-700">⚠️ JSON Syntax Error</p>
	                    <p className="font-mono break-all leading-normal text-[9px]">{previewError.message}</p>
	                  </GsapPulse>
                ) : previewData ? (
                  <div className="transform scale-[1.02] transition-all select-none">
                    <FlexMessageRenderer contents={previewData} />
                  </div>
                ) : (
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">No preview available</p>
                )}
              </div>
            </div>

            {/* Step-by-Step Developer Setup Guide */}
            <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none space-y-4 text-left select-none">
              <div className="flex items-center gap-2 border-b border-[#1E293B] pb-3">
                <BookOpen className="w-5 h-5 text-[#B7D1EA]" />
                <h3 className="text-sm font-black text-gray-100 uppercase tracking-wider font-sans">
                  LINE Messaging API Setup Guide
                </h3>
              </div>

              <div className="space-y-4 relative pl-3.5 before:absolute before:left-0.5 before:top-2 before:bottom-2 before:w-[1.5px] before:bg-[#1E293B]">
                {/* Step 1 */}
                <div className="relative">
                  <div className="absolute -left-[19.5px] top-0.5 w-3 h-3 rounded-full bg-[#B7D1EA] border-2 border-white ring-2 ring-[#B7D1EA]/50" />
                  <p className="text-[11px] font-extrabold text-gray-100 leading-tight">1. Create LINE Developer Channel</p>
                  <p className="text-[10px] text-gray-400 mt-1 leading-normal">
                    Register a free account on the <a href="https://developers.line.biz/" target="_blank" rel="noopener noreferrer" className="text-gray-100 font-bold hover:underline inline-flex items-center gap-0.5">LINE Developers Console<ExternalLink className="w-2.5 h-2.5" /></a>. Create a Provider and a Messaging API Channel.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="relative">
                  <div className="absolute -left-[19.5px] top-0.5 w-3 h-3 rounded-full bg-[#B7D1EA] border-2 border-white" />
                  <p className="text-[11px] font-extrabold text-gray-100 leading-tight">2. Retrieve Keys & Configure .env</p>
                  <p className="text-[10px] text-gray-400 mt-1 leading-normal">
                    Copy the <b>Channel secret</b> (Basic settings) and issue a <b>Channel access token</b> (Messaging API tab). Save them in API Setup, or use the server's <code>.env</code> values as a fallback.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="relative">
                  <div className="absolute -left-[19.5px] top-0.5 w-3 h-3 rounded-full bg-[#B7D1EA] border-2 border-white" />
                  <p className="text-[11px] font-extrabold text-gray-100 leading-tight">3. Configure Webhook Endpoint</p>
                  <p className="text-[10px] text-gray-400 mt-1 leading-normal">
                    Set the Webhook URL in your LINE channel console pointing to:
                    <code className="block bg-slate-55 border rounded p-1 font-mono text-[9px] text-gray-300 mt-1">https://yourdomain.com/api/webhook</code>
                    *(If testing locally, start ngrok and use your HTTPS tunnel forwarding URL)*
                  </p>
                </div>

                {/* Step 4 */}
                <div className="relative">
                  <div className="absolute -left-[19.5px] top-0.5 w-3 h-3 rounded-full bg-[#B7D1EA] border-2 border-white" />
                  <p className="text-[11px] font-extrabold text-gray-100 leading-tight">4. Enable Webhooks & Disable Auto-Replies</p>
                  <p className="text-[10px] text-gray-400 mt-1 leading-normal font-sans">
                    Enable the webhook in LINE, then open Response settings and turn off default Greeting and Auto-response messages so our bot can handle replies.
                  </p>
                </div>
              </div>
            </div>

            </div>
          )}
          </div>
        </GsapReveal>
      )}

      {activeTab === "quick-menu" && (
        <GsapReveal id="line-panel-quick-menu" className="space-y-6 text-left" role="tabpanel" aria-labelledby="line-tab-quick-menu">
          <LineRichMenuInventory envStatus={envStatus} />
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 shadow-none">
            <RichMenuEditor
              channelAccessTokenConfigured={envStatus.LINE_CHANNEL_ACCESS_TOKEN}
              initialLineRichMenuId={envStatus.LINE_MEMBER_RICH_MENU_ID}
              onMenuCreated={(newId) => {
                setEnvStatus(prev => ({
                  ...prev,
                  LINE_MEMBER_RICH_MENU_ID: newId
                }));
              }}
            />
          </div>
          <section className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-5 text-left shadow-none sm:p-6" aria-labelledby="line-quick-menu-assignment-title">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#B7D1EA]/30 bg-[#B7D1EA]/10 text-[#B7D1EA]">
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h2 id="line-quick-menu-assignment-title" className="text-base font-black text-gray-100">Rich Menu assignment test</h2>
                <p className="mt-1 text-xs leading-5 text-gray-400">
                  Preview the audience switch for the selected LINE user without changing the default menu for everyone.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={async () => {
                  const lineId = selectedUser?.lineUserId || "U1234567890abcdef1234567890abcdef";
                  const result = await testToggleUserRichMenu(lineId, "member");
                  if (result.success) {
                    toast.success("Member Quick Menu assigned successfully.");
                  } else {
                    toast.error(`Quick Menu assignment failed: ${result.error}`);
                  }
                }}
                className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-[#B7D1EA] px-4 text-[10px] font-black uppercase tracking-widest text-[#0F172A] transition hover:bg-[#c7def1]"
              >
                Set Member Menu
              </button>
              <button
                type="button"
                onClick={async () => {
                  const lineId = selectedUser?.lineUserId || "U1234567890abcdef1234567890abcdef";
                  const result = await testToggleUserRichMenu(lineId, "guest");
                  if (result.success) {
                    toast.success("Guest Quick Menu restored successfully.");
                  } else {
                    toast.error(`Quick Menu reset failed: ${result.error}`);
                  }
                }}
                className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-slate-700 px-4 text-[10px] font-black uppercase tracking-widest text-slate-200 transition hover:border-[#B7D1EA]/60 hover:text-white"
              >
                Reset Guest Menu
              </button>
            </div>
          </section>
        </GsapReveal>
      )}

      {/* Footer log */}
      <div className="bg-[#0B1121] border border-[#1E293B] p-4 rounded-[2rem] text-[10px] text-gray-500 flex items-center justify-between font-mono tracking-tight select-none">
        <span>SolarDream LINE API Sandbox Configuration Platform v1.2</span>
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Secure Admin Session
        </span>
      </div>

    </div>
  );
}
