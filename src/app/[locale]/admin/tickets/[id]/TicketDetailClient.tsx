"use client";

import React, { useRef, useState } from "react";
import { Save, CheckCircle2, RotateCcw, ArrowLeft } from "@/components/ui/icons";
import SignaturePad from "react-signature-canvas";
import { updateOperationsTicket } from "@/app/actions/tickets";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import ProgressiveImage from "@/components/ui/progressive-image";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import SmartBackButton from "@/components/ui/SmartBackButton";

interface FormField {
  id: string;
  label: string;
  type: "text" | "checkbox" | "textarea" | "select" | "number";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface TicketData {
  id: string;
  ticketNumber: string;
  documentCode: number;
  documentTitle: string;
  phase: string;
  assignedRole: string;
  status: string;
  formData?: any;
  proposal?: {
    user?: {
      name: string | null;
    };
  };
}

const DOCUMENT_FORMS: Record<number, FormField[]> = {
  9: [
    {
      id: "order_number",
      label: "Order Number",
      type: "text",
      placeholder: "Enter purchase order number...",
      required: true,
    },
    {
      id: "supplier",
      label: "Supplier Name",
      type: "text",
      placeholder: "Enter supplier name...",
      required: true,
    },
    {
      id: "total_amount",
      label: "Total Amount (THB)",
      type: "number",
      required: true,
    },
  ],
  11: [
    {
      id: "hazard_identification",
      label: "Hazard Identification",
      type: "textarea",
      placeholder: "Describe identified hazards...",
      required: true,
    },
    {
      id: "safety_measures",
      label: "Safety Measures Applied",
      type: "textarea",
      placeholder: "List safety measures taken...",
      required: true,
    },
    {
      id: "emergency_contacts",
      label: "Emergency Contact Number",
      type: "text",
      placeholder: "+66...",
      required: true,
    },
    {
      id: "approved",
      label: "Safety Approved",
      type: "checkbox",
      required: true,
    },
  ],
  12: [
    {
      id: "roof_type",
      label: "Roof Type",
      type: "select",
      options: [
        { value: "concrete", label: "Concrete" },
        { value: "metal", label: "Metal" },
        { value: "tile", label: "Tile" },
        { value: "asphalt", label: "Asphalt Shingle" },
      ],
      required: true,
    },
    {
      id: "azimuth_angle",
      label: "Azimuth Angle (degrees)",
      type: "number",
      required: true,
    },
    {
      id: "shading_eval",
      label: "Shading Evaluation",
      type: "textarea",
      placeholder: "Describe shading conditions...",
      required: true,
    },
    {
      id: "inverter_location",
      label: "Inverter Location",
      type: "textarea",
      placeholder: "Specify inverter placement...",
      required: true,
    },
  ],
};

interface TicketDetailClientProps {
  ticket: TicketData;
}

export default function TicketDetailClient({ ticket }: TicketDetailClientProps) {
  const signatureCanvasRef = useRef<SignaturePad>(null);
  const router = useRouter();
  const [formData, setFormData] = useState<Record<string, any>>(
    ticket.formData || {}
  );
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const formFields =
    DOCUMENT_FORMS[ticket.documentCode as keyof typeof DOCUMENT_FORMS] || [];
  const customerName = ticket.proposal?.user?.name || "Unknown Customer";

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  const handleClearSignature = () => {
    signatureCanvasRef.current?.clear();
    setSignatureImage(null);
  };

  const handleLockSignature = () => {
    const pad = signatureCanvasRef.current;
    if (pad && !pad.isEmpty()) {
      const canvas = pad.getCanvas();
      const imageData = canvas.toDataURL("image/png");
      setSignatureImage(imageData);
      toast.success("Signature locked");
    } else {
      toast.error("Please draw a signature first");
    }
  };

  const handleSaveTicket = async () => {
    if (!signatureImage) {
      toast.error("Please capture and lock your signature");
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateOperationsTicket(ticket.id, {
        formData,
        signatures: { authorizedSignature: signatureImage },
        status: "COMPLETED",
      });

      if (result.success) {
        toast.success("Ticket saved successfully!");
        setTimeout(() => {
          router.push("/admin/tickets");
        }, 1500);
      } else {
        toast.error(result.error || "Failed to save ticket");
      }
    } catch (error) {
      toast.error("An error occurred while saving");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="mb-8 border-b border-[#1E293B] pb-6 space-y-4">
        <SmartBackButton fallbackHref="/admin/tickets" label="Back to Tickets" />
        <p className="font-mono text-xs font-bold text-[#B7D1EA] uppercase">
          {ticket.ticketNumber}
        </p>
        <h1 className="text-3xl font-black text-gray-100 mt-2 uppercase tracking-tight">
          {ticket.documentTitle}
        </h1>
        <p className="text-gray-400 text-sm mt-2">
          Customer: <span className="font-bold">{customerName}</span> • Phase:{" "}
          <span className="font-bold">{ticket.phase}</span>
        </p>
      </div>

      {/* Form Fields */}
      {formFields.length > 0 && (
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-8 mb-8 shadow-none">
          <h2 className="text-lg font-bold text-gray-100 mb-6 uppercase tracking-tight">
            Digital Form
          </h2>

          <div className="space-y-6">
            {formFields.map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-bold text-gray-100 mb-2 uppercase tracking-tight">
                  {field.label}
                  {field.required && (
                    <span className="text-rose-500 ml-1">*</span>
                  )}
                </label>

                {field.type === "text" && (
                  <input
                    type="text"
                    placeholder={field.placeholder}
                    value={formData[field.id] || ""}
                    onChange={(e) =>
                      handleFieldChange(field.id, e.target.value)
                    }
                    className="w-full px-4 py-2.5 border border-[#1E293B] rounded-xl focus:ring-2 focus:ring-[#B7D1EA] outline-none"
                  />
                )}

                {field.type === "number" && (
                  <input
                    type="number"
                    placeholder={field.placeholder}
                    value={formData[field.id] || ""}
                    onChange={(e) =>
                      handleFieldChange(field.id, e.target.value)
                    }
                    className="w-full px-4 py-2.5 border border-[#1E293B] rounded-xl focus:ring-2 focus:ring-[#B7D1EA] outline-none"
                  />
                )}

                {field.type === "textarea" && (
                  <textarea
                    placeholder={field.placeholder}
                    value={formData[field.id] || ""}
                    onChange={(e) =>
                      handleFieldChange(field.id, e.target.value)
                    }
                    className="w-full px-4 py-2.5 border border-[#1E293B] rounded-xl focus:ring-2 focus:ring-[#B7D1EA] outline-none min-h-24 resize-none"
                  />
                )}

                {field.type === "select" && (
                  <select
                    value={formData[field.id] || ""}
                    onChange={(e) =>
                      handleFieldChange(field.id, e.target.value)
                    }
                    className="w-full px-4 py-2.5 border border-[#1E293B] rounded-xl focus:ring-2 focus:ring-[#B7D1EA] outline-none"
                  >
                    <option value="">Select option...</option>
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}

                {field.type === "checkbox" && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData[field.id] || false}
                      onChange={(e) =>
                        handleFieldChange(field.id, e.target.checked)
                      }
                      className="w-4 h-4 rounded border-[#1E293B]"
                    />
                    <span className="text-sm text-gray-300">Confirm</span>
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signature Pad */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-8 mb-8 shadow-none">
        <h2 className="text-lg font-bold text-gray-100 mb-6 uppercase tracking-tight">
          Digital Signature
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Sign below using your touchscreen, mouse, or stylus
        </p>

        <div className="border-2 border-[#1E293B] rounded-xl overflow-hidden bg-[#0B1121] mb-4">
          <SignaturePad
            ref={signatureCanvasRef}
            canvasProps={{
              width: 600,
              height: 200,
              className: "w-full cursor-crosshair",
            }}
          />
        </div>

        {signatureImage && (
          <div className="mb-4">
            <p className="text-xs font-bold text-emerald-600 uppercase mb-2">
              ✓ Signature Locked
            </p>
            <div className="relative w-full max-w-sm overflow-hidden rounded-lg border border-emerald-300 bg-[#0F172A] p-2">
              <ProgressiveImage
                src={signatureImage}
                alt="Signature"
                fill
                sizes="(max-width: 640px) 100vw, 384px"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleClearSignature}
            className="px-6 py-2.5 bg-[#0B1121] hover:bg-[#1E293B] text-gray-300 font-bold rounded-xl transition-all flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Clear
          </button>
          <button
            onClick={handleLockSignature}
            className="px-6 py-2.5 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white font-bold rounded-xl transition-all flex items-center gap-2 disabled:bg-slate-300"
          >
            <CheckCircle2 className="w-4 h-4" />
            Lock Signature
          </button>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-4">
        <SmartBackButton
          fallbackHref="/admin/tickets"
          label="Cancel"
          className="rounded-xl px-8 py-3 bg-[#1E293B] hover:bg-slate-300 text-gray-100 font-bold border-0 shadow-none text-sm"
        />
        <button
          onClick={handleSaveTicket}
          disabled={isSaving}
          className="px-8 py-3 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white font-bold rounded-xl transition-all flex items-center gap-2 disabled:bg-slate-300"
        >
          {isSaving ? (
            <>
              <GsapSpinner className="h-4 w-4" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save & Complete
            </>
          )}
        </button>
      </div>
    </div>
  );
}
