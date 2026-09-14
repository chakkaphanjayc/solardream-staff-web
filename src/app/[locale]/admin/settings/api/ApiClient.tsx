"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  MessageCircle, 
  Settings2, 
  Terminal, 
  Copy, 
  Check, 
  Globe, 
  BookOpen, 
  KeyRound,
  Cpu 
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import CatalogSettingsClient from "../CatalogSettingsClient";
import LineClient from "../line/LineClient";
import ApiSetupPanel, { type ApiSetupEnvStatus, type ApiSetupValues } from "./ApiSetupPanel";
import type { LineConversationConfig, LineQuickButton, LineTriggerConfig } from "@/lib/lineAutomationConfig";

interface ApiClientProps {
  apiSetupValues: ApiSetupValues;
  apiSetupEnvStatus: ApiSetupEnvStatus;
  // ERPNext Settings
  initialEndpoint: string;
  webhookEnabled: boolean;
  // LINE Settings
  initialEnvStatus: LineEnvStatus;
  defaultWebhookEndpoint: string;
  systemUsers: SystemUser[];
  initialTriggerConfigs: LineTriggerConfig[];
  initialQuickButtons: LineQuickButton[];
  initialLoginUrl: string;
  initialConversation: LineConversationConfig;
  productsList: ProductOption[];
  proposalsList: ProposalOption[];
}

type ApiTab = "setup" | "web-api" | "erpnext" | "line";

type SystemUser = {
  id: string;
  name: string | null;
  fullName: string;
  email: string;
  lineUserId: string | null;
};

type LineEnvStatus = {
  LINE_CHANNEL_ACCESS_TOKEN: boolean;
  LINE_CHANNEL_SECRET: boolean;
  LINE_MEMBER_RICH_MENU_ID: string | null;
  LINE_CHANNEL_ACCESS_TOKEN_PREVIEW: string | null;
  LINE_CHANNEL_SECRET_PREVIEW: string | null;
  LINE_CHANNEL_ACCESS_TOKEN_SOURCE: "system_settings" | "environment" | "missing";
  LINE_CHANNEL_SECRET_SOURCE: "system_settings" | "environment" | "missing";
  LINE_MEMBER_RICH_MENU_ID_SOURCE: "system_settings" | "environment" | "missing";
};

type ProductOption = {
  id: string;
  brand: string;
  model: string;
  stock: number;
};

type ProposalOption = {
  id: string;
  userId: string;
  shippingTrackingNumber: string | null;
  status: string;
};

function isApiTab(value: string | null): value is ApiTab {
  return value === "setup" || value === "web-api" || value === "erpnext" || value === "line";
}

const WEB_API_ENDPOINTS = [
  {
    path: "/api/v1/admin/sync-quotation",
    method: "POST",
    description: "Synchronizes generated quotation PDF and customer portal access with the local Proposal model.",
    headers: {
      "Content-Type": "application/json",
    },
    payload: {
      pdfUrl: "https://solardream-bucket.s3.amazonaws.com/proposals/qtn_123.pdf",
      customerEmail: "user@domain.com",
      proposalId: "prop_8f3d64c2-9e8a",
      erpnextQuotationId: "SAL-QTN-2026-00892",
    },
    response: {
      success: true,
      message: "Quotation synchronized and customer portal access prepared.",
      proposalId: "prop_8f3d64c2-9e8a",
      status: "AWAITING_CLIENT_SIGNATURE",
      portalUrl: "https://solar-dream.org/th/portal/prop_8f3d64c2-9e8a",
    },
  },
  {
    path: "/api/catalog/sync",
    method: "POST",
    description: "Webhook callback or scheduler trigger to invoke ERPNext catalog item updates.",
    headers: {
      Authorization: "Bearer [CRON_SECRET]",
    },
    payload: {},
    response: {
      success: true,
      paused: true,
      message: "Sync engine is temporarily paused due to business pivot",
      newItems: [],
      modifiedItems: [],
      archivedItems: [],
      logs: ["Sync engine is temporarily paused due to business pivot."],
    },
  },
  {
    path: "/api/webhook",
    method: "POST",
    description: "Webhook receiver for incoming LINE messaging platform events (follow, messages, account links).",
    headers: {
      "x-line-signature": "SIGNATURE_HASH",
      "Content-Type": "application/json",
    },
    payload: {
      destination: "U1234567890abcdef...",
      events: [
        {
          type: "message",
          message: {
            type: "text",
            text: "เช็คสต็อก",
          },
          source: {
            type: "user",
            userId: "U9988776655...",
          },
          replyToken: "nH70DqbB1b2a...",
        },
      ],
    },
    response: {
      success: true,
    },
  },
  {
    path: "/api/crm/webhook",
    method: "POST",
    description: "Webhook callback endpoint used by CRM to update Proposal or Lead statuses asynchronously.",
    headers: {
      "Content-Type": "application/json",
    },
    payload: {
      proposalId: "prop_a73b12ef",
      status: "COMPLETED",
      remarks: "Field inspection passed, structural load verified.",
    },
    response: {
      success: true,
    },
  },
  {
    path: "/api/analyze-roof",
    method: "POST",
    description: "Calculates solar panel capacity, optimal layout weight, and kWp output based on rooftop coordinates.",
    headers: {
      "Content-Type": "application/json",
    },
    payload: {
      coordinates: [
        [13.7563, 100.5018],
        [13.7567, 100.5022],
        [13.7561, 100.5024],
      ],
      yaw: 180,
      pitch: 15,
    },
    response: {
      success: true,
      kWpEstimate: 5.4,
      panelsCount: 12,
      annualYieldKWh: 7800,
    },
  },
];

export default function ApiClient(props: ApiClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab: ApiTab = isApiTab(requestedTab) ? requestedTab : "setup";
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const localePrefix = (() => {
    const firstSegment = pathname.split("/").filter(Boolean)[0];
    return firstSegment && firstSegment !== "admin" ? `/${firstSegment}` : "";
  })();

  const handleTabChange = (tab: ApiTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    router.replace(`?${params.toString()}`);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getCurlCommand = (endpoint: typeof WEB_API_ENDPOINTS[0]) => {
    const headersString = Object.entries(endpoint.headers)
      .map(([k, v]) => `-H "${k}: ${v}"`)
      .join(" ");
    
    const base = `curl -X ${endpoint.method} https://solardream.in.th${endpoint.path} ${headersString}`;
    if (endpoint.method === "POST" && Object.keys(endpoint.payload).length > 0) {
      return `${base} -d '${JSON.stringify(endpoint.payload)}'`;
    }
    return base;
  };

  return (
    <div className="space-y-6 text-gray-200">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#B7D1EA]/30 bg-[#B7D1EA]/15 px-3.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#B7D1EA]">
            <Cpu className="h-4 w-4 text-[#B7D1EA]" />
            API & Integrations Hub
          </div>
          <h1 className="font-urbanist text-2xl font-black tracking-tight text-white sm:text-3xl">
            API Settings & Connections
          </h1>
          <p className="max-w-3xl text-sm font-medium leading-6 text-slate-300">
            Control external system integrations, execute sandbox webhook tests, and read Web API specifications.
          </p>
        </div>

        <Link
          href={`${localePrefix}/admin/settings`}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white md:self-auto"
        >
          <ArrowLeft className="h-4 w-4" />
          Settings Hub
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto rounded-xl border border-slate-800 bg-[#0F172A] p-1.5">
        <button
          onClick={() => handleTabChange("setup")}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-xs transition-all cursor-pointer",
            activeTab === "setup"
              ? "bg-[#B7D1EA] text-[#0F172A] font-bold shadow-xs"
              : "text-slate-300 font-semibold hover:bg-slate-800 hover:text-white"
          )}
        >
          <KeyRound className="h-4 w-4" />
          API Setup
        </button>
        <button
          onClick={() => handleTabChange("web-api")}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-xs transition-all cursor-pointer",
            activeTab === "web-api"
              ? "bg-[#B7D1EA] text-[#0F172A] font-bold shadow-xs"
              : "text-slate-300 font-semibold hover:bg-slate-800 hover:text-white"
          )}
        >
          <Globe className="h-4 w-4" />
          Web API Reference
        </button>
        <button
          onClick={() => handleTabChange("erpnext")}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-xs transition-all cursor-pointer",
            activeTab === "erpnext"
              ? "bg-[#B7D1EA] text-[#0F172A] font-bold shadow-xs"
              : "text-slate-300 font-semibold hover:bg-slate-800 hover:text-white"
          )}
        >
          <Settings2 className="h-4 w-4" />
          ERPNext Sync
        </button>
        <button
          onClick={() => handleTabChange("line")}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-xs transition-all cursor-pointer",
            activeTab === "line"
              ? "bg-[#B7D1EA] text-[#0F172A] font-bold shadow-xs"
              : "text-slate-300 font-semibold hover:bg-slate-800 hover:text-white"
          )}
        >
          <MessageCircle className="h-4 w-4" />
          LINE Operations
        </button>
      </div>

      {/* Tab Contents */}
      <div className="mt-6">
        {activeTab === "setup" && (
          <ApiSetupPanel
            initialValues={props.apiSetupValues}
            envStatus={props.apiSetupEnvStatus}
          />
        )}

        {activeTab === "web-api" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-[#1E293B] bg-[#0B1121] p-5">
              <div className="flex items-start gap-4">
                <div className="rounded-lg border border-[#1E293B] bg-[#0B1121]/60 p-2 text-blue-300">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-100">Developer Web API Directory</h3>
                  <p className="mt-1 text-sm leading-6 text-gray-400">
                    SolarDream exposes versioned endpoints and webhook ingestion listener paths. Use these templates to configure integrations on ERPNext, custom scripts, or external automation setups.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {WEB_API_ENDPOINTS.map((endpoint, index) => {
                const curlCmd = getCurlCommand(endpoint);
                const isPost = endpoint.method === "POST";
                
                return (
                  <div
                    key={endpoint.path}
                    className="overflow-hidden rounded-xl border border-[#1E293B] bg-[#0B1121]"
                  >
                    {/* Item Title Bar */}
                    <div className="flex flex-col gap-3 border-b border-[#1E293B] bg-[#232631] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "rounded border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
                            isPost
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                              : "border-indigo-500/20 bg-indigo-500/10 text-indigo-300"
                          )}
                        >
                          {endpoint.method}
                        </span>
                        <code className="font-mono text-sm font-semibold text-gray-200">
                          {endpoint.path}
                        </code>
                      </div>

                      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        LOCAL ENDPOINT
                      </span>
                    </div>

                    {/* Specifications */}
                    <div className="p-5 space-y-4">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Description
                        </span>
                        <p className="mt-1 text-sm leading-6 text-gray-300">
                          {endpoint.description}
                        </p>
                      </div>

                      {/* Request Headers */}
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Required Headers
                        </span>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {Object.entries(endpoint.headers).map(([k, v]) => (
                            <div
                              key={k}
                              className="rounded-md border border-[#1E293B] bg-[#0F172A] px-2.5 py-1 font-mono text-xs text-gray-400"
                            >
                              <span className="font-semibold text-gray-300">{k}:</span> {v}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        {/* Request Body Payload */}
                        {isPost && Object.keys(endpoint.payload).length > 0 && (
                          <div className="space-y-1.5">
                            <span className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                              Example Payload
                              <button
                                type="button"
                                onClick={() =>
                                  copyToClipboard(
                                    JSON.stringify(endpoint.payload, null, 2),
                                    `payload-${index}`
                                  )
                                }
                                className="flex items-center gap-1 text-blue-300 transition hover:text-blue-200 normal-case"
                              >
                                {copiedId === `payload-${index}` ? (
                                  <Check className="w-3.5 h-3.5" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                                Copy
                              </button>
                            </span>
                            <pre className="max-h-48 overflow-auto rounded-lg border border-[#1E293B] bg-[#151720] p-3.5 font-mono text-xs text-gray-200">
                              {JSON.stringify(endpoint.payload, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Response Schema */}
                        <div className="space-y-1.5 md:col-start-2">
                          <span className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                            Success Response
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  JSON.stringify(endpoint.response, null, 2),
                                  `response-${index}`
                                )
                              }
                              className="flex items-center gap-1 text-blue-300 transition hover:text-blue-200 normal-case"
                            >
                              {copiedId === `response-${index}` ? (
                                  <Check className="w-3.5 h-3.5" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              Copy
                            </button>
                          </span>
                          <pre className="max-h-48 overflow-auto rounded-lg border border-[#1E293B] bg-[#151720] p-3.5 font-mono text-xs text-gray-200">
                            {JSON.stringify(endpoint.response, null, 2)}
                          </pre>
                        </div>
                      </div>

                      {/* cURL Generation */}
                      <div className="space-y-1.5 border-t border-[#1E293B] pt-3">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                            <Terminal className="w-3.5 h-3.5" />
                            Copy cURL Command
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(curlCmd, `curl-${index}`)}
                            className="flex items-center gap-1.5 rounded-lg border border-blue-400/20 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/20"
                          >
                            {copiedId === `curl-${index}` ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                Copy Command
                              </>
                            )}
                          </button>
                        </div>
                        <div className="break-all rounded-lg border border-[#1E293B] bg-[#0F172A] p-3 font-mono text-[11px] text-gray-400 select-all">
                          {curlCmd}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "erpnext" && (
          <CatalogSettingsClient
            initialEndpoint={props.initialEndpoint}
            webhookEnabled={props.webhookEnabled}
          />
        )}

        {activeTab === "line" && (
          <LineClient
            initialEnvStatus={props.initialEnvStatus}
            defaultWebhookEndpoint={props.defaultWebhookEndpoint}
            systemUsers={props.systemUsers}
            initialTriggerConfigs={props.initialTriggerConfigs}
            initialQuickButtons={props.initialQuickButtons}
            initialLoginUrl={props.initialLoginUrl}
            initialConversation={props.initialConversation}
            productsList={props.productsList}
            proposalsList={props.proposalsList}
          />
        )}
      </div>
    </div>
  );
}
