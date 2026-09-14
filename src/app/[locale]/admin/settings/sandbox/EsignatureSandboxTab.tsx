"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck,
  FileCode,
  FileText,
  Globe,
  LoaderCircle,
  PenTool,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Upload,
  User,
  X,
} from "@/components/ui/icons";
import { toast } from "sonner";
import { generateTestStampedPdf } from "@/app/actions/testEsignature";

function generateSampleSignatureDataUrl(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 150;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#0F172A";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Draw smooth signature curve
  ctx.beginPath();
  ctx.moveTo(40, 100);
  ctx.bezierCurveTo(80, 20, 120, 140, 160, 60);
  ctx.bezierCurveTo(180, 20, 220, 120, 260, 80);
  ctx.bezierCurveTo(280, 60, 310, 110, 360, 70);
  ctx.stroke();

  // Cross stroke
  ctx.beginPath();
  ctx.moveTo(80, 70);
  ctx.lineTo(240, 70);
  ctx.stroke();

  return canvas.toDataURL("image/png");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function EsignatureSandboxTab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // PDF Document Mode
  const [pdfSourceMode, setPdfSourceMode] = useState<"sample" | "upload">("sample");
  const [uploadedPdfFile, setUploadedPdfFile] = useState<File | null>(null);
  const [uploadedPdfBase64, setUploadedPdfBase64] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Metadata Inputs
  const [signerName, setSignerName] = useState("Chakkaphan Chaiwong");
  const [signerIp, setSignerIp] = useState("127.0.0.1");
  const [signerUserAgent, setSignerUserAgent] = useState(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  );
  const [verificationUrl, setVerificationUrl] = useState("https://solar-dream.org/verify/QTN-2026-DEV-TEST");

  // Output States
  const [isGenerating, setIsGenerating] = useState(false);
  const [stampedPdfUrl, setStampedPdfUrl] = useState<string | null>(null);
  const [sha256Hash, setSha256Hash] = useState<string | null>(null);

  // Canvas Drawing Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    ctx.strokeStyle = "#0F172A";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);

    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleUseSampleSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      setHasDrawn(true);
      toast.success("Loaded sample signature onto pad.");
    };
    img.src = generateSampleSignatureDataUrl();
  };

  // PDF File Upload Handler
  const processPdfFile = (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Invalid file type. Please upload a valid PDF document.");
      return;
    }
    const maxBytes = 20 * 1024 * 1024; // 20 MB
    if (file.size > maxBytes) {
      toast.error("PDF file exceeds 20 MB size limit.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = typeof reader.result === "string" ? reader.result : "";
      setUploadedPdfFile(file);
      setUploadedPdfBase64(base64);
      setPdfSourceMode("upload");
      toast.success(`Loaded PDF document "${file.name}" (${formatFileSize(file.size)})`);
    };
    reader.onerror = () => {
      toast.error("Failed to read PDF file.");
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processPdfFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processPdfFile(e.dataTransfer.files[0]);
    }
  };

  const handleClearUploadedPdf = () => {
    setUploadedPdfFile(null);
    setUploadedPdfBase64(null);
    setPdfSourceMode("sample");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Stamp PDF Trigger
  const handleGeneratePdf = async () => {
    let signatureDataUrl = "";
    const canvas = canvasRef.current;
    if (canvas && hasDrawn) {
      signatureDataUrl = canvas.toDataURL("image/png");
    } else {
      signatureDataUrl = generateSampleSignatureDataUrl();
    }

    setIsGenerating(true);
    try {
      const result = await generateTestStampedPdf({
        signatureDataUrl,
        signerName: signerName.trim(),
        signerIpAddress: signerIp.trim(),
        signerUserAgent: signerUserAgent.trim(),
        verificationUrl: verificationUrl.trim(),
        customPdfBase64: pdfSourceMode === "upload" && uploadedPdfBase64 ? uploadedPdfBase64 : undefined,
      });

      if (!result.success || !result.dataUrl) {
        toast.error(result.error || "Failed to stamp test PDF.");
        return;
      }

      setStampedPdfUrl(result.dataUrl);
      setSha256Hash(result.sha256Hash || null);
      toast.success(
        pdfSourceMode === "upload" && uploadedPdfFile
          ? `Successfully stamped uploaded PDF "${uploadedPdfFile.name}"!`
          : "Stamped test PDF generated successfully!",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error stamping test PDF.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="rounded-2xl border border-slate-800 bg-[#0F172A] p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              <h2 className="text-lg font-black text-white">E-Signature Audit Trail Sandbox</h2>
            </div>
            <p className="text-xs font-semibold text-slate-400">
              Upload any PDF document or use sample templates to test and inspect the redesigned E-Signature audit trail stamp.
            </p>
          </div>
          <button
            type="button"
            onClick={handleUseSampleSignature}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-4 text-xs font-bold text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <PenTool className="h-3.5 w-3.5 text-[#B7D1EA]" />
            Load Sample Signature
          </button>
        </div>

        {/* 2-Column Cockpit Layout */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left Column: PDF Source, Signature Pad, Inputs */}
          <div className="space-y-5">
            {/* Section 1: PDF Document Source Picker */}
            <div className="space-y-2.5">
              <label className="text-xs font-extrabold text-white flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-sky-400" />
                  PDF Target Document Source
                </span>
                <span className="text-[11px] font-normal text-slate-400">
                  {pdfSourceMode === "upload" && uploadedPdfFile ? "Custom PDF Loaded" : "Sample Template"}
                </span>
              </label>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPdfSourceMode("sample")}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                    pdfSourceMode === "sample"
                      ? "border-[#B7D1EA] bg-[#B7D1EA]/20 text-white"
                      : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="text-xs font-black">Sample 2-Page Quotation</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">Built-in test layout</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPdfSourceMode("upload");
                    if (!uploadedPdfFile && fileInputRef.current) {
                      fileInputRef.current.click();
                    }
                  }}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                    pdfSourceMode === "upload"
                      ? "border-[#B7D1EA] bg-[#B7D1EA]/20 text-white"
                      : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="text-xs font-black">Upload Custom PDF</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">Use your own PDF file</span>
                </button>
              </div>

              {/* Upload Dropzone when in Upload Mode or File Loaded */}
              {pdfSourceMode === "upload" && (
                <div className="space-y-2">
                  {!uploadedPdfFile ? (
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`relative flex flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition ${
                        dragActive
                          ? "border-[#B7D1EA] bg-[#B7D1EA]/10"
                          : "border-slate-700 bg-[#0B1121] hover:border-slate-600 hover:bg-slate-900/60"
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <Upload className="h-8 w-8 text-sky-400 mb-2" />
                      <p className="text-xs font-bold text-white">Drag & drop your PDF file here</p>
                      <p className="mt-1 text-[10px] text-slate-400">or click to browse local files (PDF up to 20 MB)</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border border-sky-500/40 bg-sky-500/10 p-3.5 text-xs text-white">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileText className="h-5 w-5 text-sky-400 shrink-0" />
                        <div className="truncate space-y-0.5">
                          <p className="font-extrabold truncate text-sky-200">{uploadedPdfFile.name}</p>
                          <p className="text-[10px] text-slate-400">{formatFileSize(uploadedPdfFile.size)} • PDF Document</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearUploadedPdf}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition shrink-0"
                        title="Remove uploaded PDF"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Section 2: Signature Drawing Pad */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-white flex items-center gap-1.5">
                  <PenTool className="h-4 w-4 text-sky-400" />
                  Interactive Signature Canvas
                </label>
                {hasDrawn && (
                  <button
                    type="button"
                    onClick={handleClearCanvas}
                    className="flex items-center gap-1 text-[11px] font-bold text-rose-400 hover:underline"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Clear Pad
                  </button>
                )}
              </div>
              <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-white p-2">
                <canvas
                  ref={canvasRef}
                  width={450}
                  height={140}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full touch-none cursor-crosshair rounded-lg bg-white"
                />
                {!hasDrawn && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-400">
                    Draw test signature here with mouse or touch
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: Audit Metadata Inputs */}
            <div className="space-y-3 rounded-xl border border-slate-800 bg-[#0B1121] p-4">
              <p className="text-xs font-black uppercase text-slate-400 tracking-wider">
                Signer & Audit Metadata Configuration
              </p>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Signer Name</label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">IP Address</label>
                  <input
                    type="text"
                    value={signerIp}
                    onChange={(e) => setSignerIp(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white font-mono focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Verification Reference</label>
                  <input
                    type="text"
                    value={verificationUrl}
                    onChange={(e) => setVerificationUrl(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">User Agent Header</label>
                <input
                  type="text"
                  value={signerUserAgent}
                  onChange={(e) => setSignerUserAgent(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 font-mono text-[10px] focus:border-sky-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Stamp Trigger Button */}
            <button
              type="button"
              onClick={() => void handleGeneratePdf()}
              disabled={isGenerating}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-6 text-xs font-black text-slate-950 hover:bg-white shadow-lg transition disabled:opacity-60 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin text-slate-950" />
                  Stamping PDF Document…
                </>
              ) : (
                <>
                  <FileCheck className="h-4 w-4 text-slate-950" />
                  {pdfSourceMode === "upload" && uploadedPdfFile
                    ? `Stamp Uploaded PDF (${uploadedPdfFile.name})`
                    : "Generate & Stamp Test PDF"}
                </>
              )}
            </button>
          </div>

          {/* Right Column: PDF Viewer Frame & Hash Verification */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-[#B7D1EA]" />
                Stamped PDF Preview & Audit Verification
              </span>
              {sha256Hash && (
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-mono font-bold text-emerald-400">
                  SHA-256 Verified
                </span>
              )}
            </div>

            {stampedPdfUrl ? (
              <div className="space-y-3">
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-inner">
                  <iframe
                    src={stampedPdfUrl}
                    title="Stamped PDF Sandbox Preview"
                    className="h-full w-full border-none"
                  />
                </div>

                {sha256Hash && (
                  <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-3 text-[11px] font-mono text-slate-400 break-all space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block font-sans">
                      Document Security Hash (SHA-256)
                    </span>
                    <span className="text-emerald-400 font-bold block">{sha256Hash}</span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <a
                    href={stampedPdfUrl}
                    download={uploadedPdfFile ? `stamped-${uploadedPdfFile.name}` : "stamped-quotation-audit-test.pdf"}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 text-xs font-bold text-white hover:bg-slate-700 transition"
                  >
                    <Download className="h-4 w-4 text-[#B7D1EA]" />
                    Download Stamped PDF
                  </a>
                  <a
                    href={stampedPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-4 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open PDF
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex aspect-[3/4] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-[#0B1121] p-6 text-center text-slate-500">
                <ShieldCheck className="h-10 w-10 text-slate-600 mb-2" />
                <p className="text-xs font-bold text-slate-300">No Stamped PDF Generated Yet</p>
                <p className="mt-1 text-[11px] text-slate-500 max-w-xs">
                  Upload a PDF document or use the sample template, draw a test signature, and click &quot;Stamp PDF Document&quot; to inspect the result.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
