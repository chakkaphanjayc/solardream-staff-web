"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  MapPin,
  Phone,
  CheckSquare,
  Square,
  Upload,
  CheckCircle2,
  Navigation,
  Camera,
  X,
  Inbox,
  ArrowRight,
  Workflow,
} from "@/components/ui/icons";
import { completeJobTicket, uploadJobTicketCompletionPhoto } from "@/app/actions/tickets";
import { GsapSpinner } from "@/components/ui/GsapMotion";

interface JobTicket {
  id: string;
  proposalId: string;
  customerPhone: string | null;
  customerAddress: string | null;
  coordinates: unknown;
  status: string;
  scheduledDate: string | Date | null;
  createdAt: string | Date;
  proposal: {
    systemSizeKwp: number;
    panelCount: number;
    configurationData: unknown;
    user: {
      name: string | null;
      email: string;
      phoneNumber: string | null;
    };
  };
}

interface InstallerPortalClientProps {
  initialTickets: JobTicket[];
  workflowJobs: Array<{
    id: string;
    status: string;
    scheduledDate: string | Date | null;
    quotation: {
      user: {
        name: string | null;
        email: string;
      };
    };
    workflows: Array<{
      id: string;
      status: string;
      template: { name: string };
      currentStage: { stageName: string } | null;
    }>;
  }>;
}

export default function InstallerPortalClient({
  initialTickets,
  workflowJobs,
}: InstallerPortalClientProps) {
  const t = useTranslations("InstallerPortal");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Active ticket selected for status update
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [bomCheckedStates, setBomCheckedStates] = useState<Record<string, boolean>>({});

  const handleToggleCheck = (key: string) => {
    setBomCheckedStates((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleUploadPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    ticketId: string
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const fileUrls: string[] = [...uploadedPhotos];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.set("ticketId", ticketId);
        formData.set("file", file, file.name);
        const result = await uploadJobTicketCompletionPhoto(formData);

        if (!result.success || !result.url) {
          throw new Error(result.error || "Failed to upload installation photo.");
        }

        fileUrls.push(result.url);
      }

      setUploadedPhotos(fileUrls);
    } catch (err: unknown) {
      console.error("Photo upload error:", err);
      setUploadError(err instanceof Error ? err.message : "Failed to upload photos.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setUploadedPhotos((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleMarkAsCompleted = async (ticketId: string) => {
    if (uploadedPhotos.length === 0) {
      setUploadError("Please upload at least one installation photo as proof of work.");
      return;
    }

    setUploadError(null);

    startTransition(async () => {
      const res = await completeJobTicket(ticketId, uploadedPhotos);

      if (res.error) {
        setUploadError(res.error);
      } else {
        setUpdatingTicketId(null);
        setUploadedPhotos([]);
        setBomCheckedStates({});
        router.refresh();
      }
    });
  };

  const getGoogleMapsLink = (ticket: JobTicket) => {
    const address = ticket.customerAddress || "";
    const coords = ticket.coordinates;
    if (
      coords &&
      typeof coords === "object" &&
      !Array.isArray(coords) &&
      "lat" in coords &&
      "lng" in coords &&
      typeof coords.lat === "number" &&
      typeof coords.lng === "number"
    ) {
      return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      address
    )}`;
  };

  const getBOMItems = (ticket: JobTicket) => {
    const configuration = ticket.proposal?.configurationData;
    if (
      !configuration ||
      typeof configuration !== "object" ||
      Array.isArray(configuration) ||
      !("items" in configuration) ||
      !Array.isArray(configuration.items)
    ) {
      return [];
    }
    return configuration.items.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object" && !Array.isArray(item)),
    );
  };

  return (
    <div className="min-h-dvh bg-[#F0EEE9] pb-12 pt-6 px-4">
      {/* Mobile-First Header */}
      <div className="max-w-md mx-auto mb-6">
        <h1 className="text-2xl font-black text-[#2C486A] tracking-tight flex items-center gap-2 uppercase">
          <Camera className="w-6 h-6 text-[#2C486A]" />
          Installer <span className="text-slate-600">Portal</span>
        </h1>
        <p className="text-[10px] font-black tracking-widest text-slate-500 uppercase mt-1">
          Field Installation Dashboard
        </p>
      </div>

      {workflowJobs.length > 0 && (
        <section className="mx-auto mb-6 max-w-md">
          <div className="mb-3 flex items-center gap-2">
            <Workflow className="h-4 w-4 text-[#436A8C]" />
            <h2 className="text-sm font-black text-slate-900">ISO Workflows</h2>
          </div>
          <div className="space-y-3">
            {workflowJobs.map((job) => {
              const workflow = job.workflows[0];
              if (!workflow) return null;
              return (
                <Link
                  key={job.id}
                  href={`/installer/jobs/${job.id}/execute`}
                  className="flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition active:bg-slate-50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#B7D1EA]/40 text-[#315979]">
                    <Workflow className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-slate-950">
                      {job.quotation.user.name || job.quotation.user.email}
                    </span>
                    <span className="mt-1 block truncate text-xs font-semibold text-slate-600">
                      {workflow.currentStage?.stageName ||
                        (workflow.status === "COMPLETED"
                          ? "Workflow complete"
                          : workflow.template.name)}
                    </span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-slate-400" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Tickets List */}
      <div className="max-w-md mx-auto space-y-6">
        {initialTickets.length > 0 ? (
          initialTickets.map((ticket) => {
            const customerName = ticket.proposal?.user?.name || "Unknown Customer";
            const phone =
              ticket.customerPhone ||
              ticket.proposal?.user?.phoneNumber ||
              "N/A";
            const address = ticket.customerAddress || "N/A";
            const bomItems = getBOMItems(ticket);
            const isUpdating = updatingTicketId === ticket.id;

            return (
              <div
                key={ticket.id}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-5"
              >
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-black text-slate-900 text-lg">
                      {customerName}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 font-mono mt-0.5">
                      TICKET ID: #{ticket.id.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-600 border border-blue-150 uppercase">
                    {ticket.status}
                  </span>
                </div>

                {/* Location & Navigation */}
                <div className="space-y-2 text-sm text-slate-600 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-700">{phone}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span className="leading-snug text-slate-600">{address}</span>
                  </div>
                  <a
                    href={getGoogleMapsLink(ticket)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 inline-flex items-center justify-center gap-2 w-full bg-[#B7D1EA]/40 hover:bg-[#B7D1EA]/60 text-[#2C486A] py-2 px-4 rounded-xl text-xs font-black transition-all border border-[#B7D1EA]/30 text-center"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    Open in Google Maps
                  </a>
                </div>

                {/* BOM Checklist Section */}
                <div className="space-y-2.5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Hardware BOM Checklist
                  </p>
                  <div className="space-y-2">
                    {bomItems.length > 0 ? (
                      bomItems.map((item, idx: number) => {
                        const name =
                          String(
                            item.productName ||
                              item.model ||
                              item.name ||
                              item.description ||
                              "",
                          ) ||
                          t("fallbackHardware");
                        const qty = Number(item.quantity || item.qty || 1);
                        const key = `${ticket.id}-${idx}`;
                        const isChecked = !!bomCheckedStates[key];

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleToggleCheck(key)}
                            className="flex items-center gap-3 w-full text-left py-2 px-3 hover:bg-slate-50 rounded-xl transition-all border border-transparent hover:border-slate-150"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-5 h-5 text-[#2C486A] shrink-0" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-300 shrink-0" />
                            )}
                            <div className="flex justify-between items-center w-full min-w-0">
                              <span
                                className={`text-xs font-semibold truncate ${
                                  isChecked
                                    ? "line-through text-slate-400"
                                    : "text-slate-700"
                                }`}
                              >
                                {name}
                              </span>
                              <span className="text-xs font-black text-[#2C486A] bg-[#B7D1EA]/20 px-2 py-0.5 rounded-lg shrink-0 ml-2">
                                x{qty}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-400 italic">
                        No hardware configured. System specs:{" "}
                        {ticket.proposal?.systemSizeKwp} kWp /{" "}
                        {ticket.proposal?.panelCount} Panels
                      </p>
                    )}
                  </div>
                </div>

                {/* Status Execution Button & Panel */}
                <div className="border-t border-slate-100 pt-4">
                  {!isUpdating ? (
                    <button
                      onClick={() => {
                        setUpdatingTicketId(ticket.id);
                        setUploadedPhotos([]);
                        setUploadError(null);
                      }}
                      className="w-full bg-[#B7D1EA] hover:bg-[#B7D1EA]/90 text-[#2C486A] py-3.5 rounded-2xl text-xs font-black transition-all shadow-xs uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      Update Status / Upload Proof
                    </button>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Proof of Work Photos
                        </p>
                        <button
                          onClick={() => setUpdatingTicketId(null)}
                          className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Photo Grid Preview */}
                      {uploadedPhotos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {uploadedPhotos.map((photo, index) => (
                            <div
                              key={index}
                              className="relative aspect-square rounded-xl overflow-hidden border border-slate-200"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photo}
                                alt="Proof of installation"
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemovePhoto(index)}
                                className="absolute top-1 right-1 bg-black/55 text-white p-1 rounded-full hover:bg-black/80 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Photo Upload Box */}
                      <div className="relative">
                        <label className="flex flex-col items-center justify-center w-full aspect-video border-2 border-dashed border-slate-200 hover:border-[#B7D1EA] rounded-2xl cursor-pointer hover:bg-slate-50/50 transition-all">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                            {isUploading ? (
	                              <>
	                                <GsapSpinner className="w-8 h-8 text-[#2C486A] mb-2" />
	                                <p className="text-xs font-bold text-slate-500">
                                  Uploading proof files...
                                </p>
                              </>
                            ) : (
                              <>
                                <Upload className="w-8 h-8 text-slate-400 mb-2" />
                                <p className="text-xs font-bold text-slate-600">
                                  Tap to Upload Photos
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1">
                                  PNG, JPG, JPEG formats accepted
                                </p>
                              </>
                            )}
                          </div>
                          <input
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={(e) => handleUploadPhoto(e, ticket.id)}
                            disabled={isUploading}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {uploadError && (
                        <p className="text-xs font-bold text-rose-500 bg-rose-50 border border-rose-100 rounded-xl p-3">
                          {uploadError}
                        </p>
                      )}

                      {/* Final Completion Action */}
                      <button
                        onClick={() => handleMarkAsCompleted(ticket.id)}
                        disabled={isPending || isUploading}
                        className="w-full bg-[#B7D1EA] hover:bg-[#B7D1EA]/85 disabled:bg-slate-200 text-[#2C486A] disabled:text-slate-400 py-3.5 rounded-2xl text-xs font-black transition-all shadow-xs flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                      >
	                        {isPending ? (
	                          <GsapSpinner className="w-4 h-4" />
	                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        Mark as Completed
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="border-2 border-dashed border-slate-250 bg-white/40 rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-5">
            <div className="p-4 rounded-full bg-white border border-slate-100 shadow-xs">
              <Inbox className="w-12 h-12 text-slate-350" />
            </div>
            <div className="space-y-1">
              <h4 className="text-slate-700 font-bold text-base uppercase tracking-tight">No Jobs Scheduled</h4>
              <p className="text-xs text-slate-450 font-semibold max-w-xs leading-relaxed">
                You currently have no active installations assigned. Tap the button below to check for updates.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="mt-2 inline-flex items-center justify-center gap-1.5 w-full bg-[#B7D1EA] hover:bg-[#B7D1EA]/85 text-[#2C486A] py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs"
            >
              Refresh Job List
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
