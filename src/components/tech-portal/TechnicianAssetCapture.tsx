"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, Loader2, Package, X } from "@/components/ui/icons";
import { enqueueTechOperation } from "@/lib/techPortalOffline";
import type { TechDashboardTask } from "@/types/techPortal";

type Copy = {
  assetRegistration: string;
  assetRegistrationHint: string;
  assetProductName: string;
  assetSerialNumber: string;
  assetWarrantyProvider: string;
  verifySerial: string;
  registerAsset: string;
  bulkScanner: string;
  bulkScannerHint: string;
  serials: string;
  registerBulk: string;
  scanWithCamera: string;
  stopCamera: string;
  cameraUnavailable: string;
  assetVerified: string;
  assetUnverified: string;
  assetSaved: string;
  bulkSaved: string;
  invalidSerials: string;
  reviewOnlyHint: string;
  capturedOffline: string;
  unexpectedError: string;
};

type ERPAssetLookup = {
  found: boolean;
  serialNumber: string;
  item: { code: string | null; name: string } | null;
  warrantyExpiryDate: string | null;
  status: string | null;
  sourceOfTruth: "ERPNext";
};

type SavedAsset = {
  serialNumber: string;
  productName: string;
  status: string;
  replayed: boolean;
};

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getApiMessage(value: unknown, fallback: string) {
  if (!isRecord(value)) return fallback;
  if (typeof value.error === "string" && value.error.trim()) return value.error;
  if (isRecord(value.error) && typeof value.error.message === "string" && value.error.message.trim()) return value.error.message;
  return fallback;
}

function makeIdempotencyKey(prefix: string) {
  const suffix = globalThis.crypto?.randomUUID?.() || String(Date.now()) + "-" + Math.random().toString(36).slice(2);
  return prefix + "-" + suffix;
}

function parseLookup(value: unknown): ERPAssetLookup | null {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  const data = value.data;
  if (typeof data.found !== "boolean" || typeof data.serialNumber !== "string") return null;
  const item = isRecord(data.item) && typeof data.item.name === "string"
    ? { code: typeof data.item.code === "string" ? data.item.code : null, name: data.item.name }
    : null;
  return {
    found: data.found,
    serialNumber: data.serialNumber,
    item,
    warrantyExpiryDate: typeof data.warrantyExpiryDate === "string" ? data.warrantyExpiryDate : null,
    status: typeof data.status === "string" ? data.status : null,
    sourceOfTruth: "ERPNext",
  };
}

function parseSavedAsset(value: unknown, fallback: { serialNumber: string; productName: string }) {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.asset)) {
    return { ...fallback, status: "UNKNOWN", replayed: false };
  }
  const asset = value.data.asset;
  return {
    serialNumber: typeof asset.serialNumber === "string" ? asset.serialNumber : fallback.serialNumber,
    productName: typeof asset.productName === "string" ? asset.productName : fallback.productName,
    status: typeof asset.status === "string" ? asset.status : "UNKNOWN",
    replayed: value.data.replayed === true,
  };
}

export default function TechnicianAssetCapture({
  task,
  isOnline,
  isReadOnly,
  copy,
}: {
  task: TechDashboardTask;
  isOnline: boolean;
  isReadOnly: boolean;
  copy: Copy;
}) {
  const [productName, setProductName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [warrantyProvider, setWarrantyProvider] = useState("");
  const [lookup, setLookup] = useState<ERPAssetLookup | null>(null);
  const [bulkSerials, setBulkSerials] = useState("");
  const [bulkProductName, setBulkProductName] = useState("");
  const [bulkCatalogProductId, setBulkCatalogProductId] = useState("");
  const [savedAssets, setSavedAssets] = useState<SavedAsset[]>([]);
  const [busy, setBusy] = useState<"lookup" | "single" | "bulk" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isCameraOpen) return;
    let disposed = false;
    let frameId = 0;
    const stopStream = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const startScanner = async () => {
      setScannerError(null);
      const detectorConstructor = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
      if (!detectorConstructor || !navigator.mediaDevices?.getUserMedia) {
        setScannerError(copy.cameraUnavailable);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stopStream();
          return;
        }
        video.srcObject = stream;
        await video.play();
        const detector = new detectorConstructor({
          formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e"],
        });
        const scan = async () => {
          if (disposed || !videoRef.current) return;
          try {
            const detected = await detector.detect(videoRef.current);
            const value = detected.find((candidate) => typeof candidate.rawValue === "string" && candidate.rawValue.trim())?.rawValue?.trim();
            if (value) {
              setSerialNumber(value);
              setLookup(null);
              setMessage(null);
              setIsCameraOpen(false);
              return;
            }
          } catch {
            // A frame may be unavailable while the camera is focusing. Continue scanning.
          }
          frameId = window.requestAnimationFrame(() => void scan());
        };
        await scan();
      } catch {
        setScannerError(copy.cameraUnavailable);
      }
    };

    void startScanner();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      stopStream();
    };
  }, [copy.cameraUnavailable, isCameraOpen]);

  if (!task.fieldVisitId) return null;

  const verifySerial = async () => {
    const serial = serialNumber.trim();
    if (!serial || !isOnline) return;
    setBusy("lookup");
    setMessage(null);
    try {
      const response = await fetch(
        "/api/v2/field/visits/" + encodeURIComponent(task.fieldVisitId || "") + "/assets/lookup?serial=" + encodeURIComponent(serial),
        { cache: "no-store", credentials: "same-origin" },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getApiMessage(payload, copy.unexpectedError));
      const nextLookup = parseLookup(payload);
      if (!nextLookup) throw new Error(copy.unexpectedError);
      setLookup(nextLookup);
      if (nextLookup.item?.name) setProductName(nextLookup.item.name);
      if (nextLookup.found) setMessage(copy.assetVerified);
      else setMessage(copy.assetUnverified);
    } catch (error: unknown) {
      setLookup(null);
      setMessage(error instanceof Error ? error.message : copy.unexpectedError);
    } finally {
      setBusy(null);
    }
  };

  const registerSingle = async () => {
    const nextProductName = productName.trim();
    const nextSerialNumber = serialNumber.trim();
    if (!nextProductName || !nextSerialNumber || isReadOnly) {
      if (isReadOnly) setMessage(copy.reviewOnlyHint);
      return;
    }
    setBusy("single");
    setMessage(null);
    const catalogProductId = lookup?.found ? lookup.item?.code || null : null;
    const verificationStatus = lookup?.found ? "VERIFIED" as const : "UNVERIFIED" as const;
    try {
      const idempotencyKey = makeIdempotencyKey("field-asset");
      if (!isOnline) {
        await enqueueTechOperation({
          type: "ASSET_REGISTERED",
          taskId: task.taskId,
          fieldVisitId: task.fieldVisitId,
          idempotencyKey,
          payload: {
            taskId: task.taskId,
            projectId: task.projectId,
            productName: nextProductName,
            serialNumber: nextSerialNumber,
            catalogProductId,
            verificationStatus,
            productWarrantyProvider: warrantyProvider.trim() || null,
          },
        });
        setSavedAssets((current) => [...current, { serialNumber: nextSerialNumber, productName: nextProductName, status: "PENDING_SYNC", replayed: false }]);
        setMessage(copy.capturedOffline);
      } else {
        const response = await fetch("/api/v2/field/visits/" + encodeURIComponent(task.fieldVisitId || "") + "/assets", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
          body: JSON.stringify({
            productName: nextProductName,
            serialNumber: nextSerialNumber,
            catalogProductId,
            verificationStatus,
            productWarrantyProvider: warrantyProvider.trim() || null,
            idempotencyKey,
          }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(getApiMessage(payload, copy.unexpectedError));
        setSavedAssets((current) => [...current, parseSavedAsset(payload, { serialNumber: nextSerialNumber, productName: nextProductName })]);
        setMessage(copy.assetSaved);
      }
      setSerialNumber("");
      setProductName("");
      setWarrantyProvider("");
      setLookup(null);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : copy.unexpectedError);
    } finally {
      setBusy(null);
    }
  };

  const registerBulk = async () => {
    const serialNumbers = Array.from(new Set(
      bulkSerials.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean),
    ));
    const nextProductName = bulkProductName.trim();
    if (!nextProductName || serialNumbers.length === 0 || serialNumbers.length > 200 || isReadOnly) {
      if (serialNumbers.length === 0 || serialNumbers.length > 200) setMessage(copy.invalidSerials);
      else if (isReadOnly) setMessage(copy.reviewOnlyHint);
      return;
    }
    setBusy("bulk");
    setMessage(null);
    try {
      const batchKey = makeIdempotencyKey("field-asset-bulk");
      const catalogProductId = bulkCatalogProductId.trim() || null;
      const verificationStatus = catalogProductId ? "VERIFIED" as const : "UNVERIFIED" as const;
      if (!isOnline) {
        await Promise.all(serialNumbers.map((serial) => enqueueTechOperation({
          type: "ASSET_REGISTERED",
          taskId: task.taskId,
          fieldVisitId: task.fieldVisitId,
          idempotencyKey: makeIdempotencyKey("field-asset"),
          payload: {
            taskId: task.taskId,
            projectId: task.projectId,
            productName: nextProductName,
            serialNumber: serial,
            catalogProductId,
            verificationStatus,
            productWarrantyProvider: warrantyProvider.trim() || null,
          },
        })));
        setSavedAssets((current) => [
          ...current,
          ...serialNumbers.map((serial) => ({ serialNumber: serial, productName: nextProductName, status: "PENDING_SYNC", replayed: false })),
        ]);
        setMessage(copy.capturedOffline);
      } else {
        const response = await fetch("/api/v2/field/visits/" + encodeURIComponent(task.fieldVisitId || "") + "/assets/bulk", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "Idempotency-Key": batchKey },
          body: JSON.stringify({
            productName: nextProductName,
            serialNumbers,
            catalogProductId,
            verificationStatus,
            productWarrantyProvider: warrantyProvider.trim() || null,
            idempotencyKey: batchKey,
          }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok && response.status !== 207) throw new Error(getApiMessage(payload, copy.unexpectedError));
        const data = isRecord(payload) && isRecord(payload.data) ? payload.data : {};
        const succeeded = typeof data.succeeded === "number" ? data.succeeded : 0;
        const failures = Array.isArray(data.failures) ? data.failures.length : 0;
        const items = Array.isArray(data.items) ? data.items : [];
        setSavedAssets((current) => [
          ...current,
          ...items.flatMap((item): SavedAsset[] => {
            if (!isRecord(item)) return [];
            return [{
              serialNumber: typeof item.serialNumber === "string" ? item.serialNumber : "serial",
              productName: nextProductName,
              status: isRecord(item.asset) && typeof item.asset.status === "string" ? item.asset.status : "UNKNOWN",
              replayed: item.replayed === true,
            }];
          }),
        ]);
        setMessage(copy.bulkSaved + ": " + succeeded + (failures ? " (" + failures + " " + copy.invalidSerials + ")" : ""));
      }
      setBulkSerials("");
      setBulkProductName("");
      setBulkCatalogProductId("");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : copy.unexpectedError);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-[#0F172A] bg-[#F5F2EB]" aria-labelledby={"assets-" + task.taskId}>
      <div className="flex flex-col gap-3 border-b border-[#E2E8F0] px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-[#0F172A]" aria-hidden="true" />
            <h2 id={"assets-" + task.taskId} className="text-base font-extrabold text-[#0F172A]">{copy.assetRegistration}</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-[#475569]">{copy.assetRegistrationHint}</p>
        </div>
        <span className="inline-flex min-h-7 items-center rounded-full border border-[#B7D1EA] bg-[#B7D1EA]/55 px-3 text-[11px] font-bold text-[#0F172A]">QR · barcode · serial</span>
      </div>
      <div className="space-y-6 px-5 py-5 sm:px-6 sm:py-6">
        {message ? <div className="flex items-start gap-2 rounded-lg border border-[#B7D1EA] bg-[#B7D1EA]/35 px-3 py-3 text-sm text-[#1e405c]" role="status"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p className="min-w-0 flex-1">{message}</p><button type="button" onClick={() => setMessage(null)} className="rounded p-1 text-current/70 hover:text-current" aria-label={copy.stopCamera}><X className="h-4 w-4" aria-hidden="true" /></button></div> : null}

        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="min-w-0 flex-1">
              <span className="text-xs font-extrabold text-[#0F172A]">{copy.assetSerialNumber}</span>
              <input
                value={serialNumber}
                onChange={(event) => { setSerialNumber(event.target.value); setLookup(null); }}
                autoComplete="off"
                inputMode="text"
                disabled={isReadOnly}
                placeholder={copy.assetSerialNumber}
                className="mt-1 min-h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-[#0F172A] focus:ring-2 focus:ring-[#B7D1EA] disabled:bg-[#F0EEE9]"
              />
            </label>
            <div className="flex items-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setIsCameraOpen(true)} disabled={isReadOnly || isCameraOpen}><Camera className="h-4 w-4" aria-hidden="true" />{copy.scanWithCamera}</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void verifySerial()} disabled={isReadOnly || !isOnline || busy !== null || !serialNumber.trim()}>{busy === "lookup" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{copy.verifySerial}</Button>
            </div>
          </div>
          {isCameraOpen ? <div className="rounded-lg border border-[#0F172A] bg-[#0F172A] p-3"><div className="relative overflow-hidden rounded-md bg-black"><video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" aria-label={copy.scanWithCamera} /><div className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-[#B7D1EA]" /></div><div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-slate-300">{scannerError || copy.assetSerialNumber}</p><Button type="button" variant="secondary" size="sm" onClick={() => setIsCameraOpen(false)}><X className="h-4 w-4" aria-hidden="true" />{copy.stopCamera}</Button></div></div> : null}
          {lookup ? <div className="rounded-lg border border-[#E2E8F0] bg-white/70 p-3 text-sm">{lookup.found ? <><p className="font-extrabold text-emerald-800">{copy.assetVerified}</p><p className="mt-1 text-[#0F172A]">{lookup.item?.name || "ERPNext item"} · {lookup.serialNumber}</p>{lookup.warrantyExpiryDate ? <p className="mt-1 text-xs text-[#475569]">Warranty until {new Date(lookup.warrantyExpiryDate).toLocaleDateString()}</p> : null}</> : <p className="font-extrabold text-[#68411f]">{copy.assetUnverified}</p>}</div> : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label><span className="text-xs font-extrabold text-[#0F172A]">{copy.assetProductName}</span><input value={productName} onChange={(event) => setProductName(event.target.value)} disabled={isReadOnly} placeholder={copy.assetProductName} className="mt-1 min-h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm outline-none focus:border-[#0F172A] focus:ring-2 focus:ring-[#B7D1EA] disabled:bg-[#F0EEE9]" /></label>
            <label><span className="text-xs font-extrabold text-[#0F172A]">{copy.assetWarrantyProvider}</span><input value={warrantyProvider} onChange={(event) => setWarrantyProvider(event.target.value)} disabled={isReadOnly} placeholder={copy.assetWarrantyProvider} className="mt-1 min-h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm outline-none focus:border-[#0F172A] focus:ring-2 focus:ring-[#B7D1EA] disabled:bg-[#F0EEE9]" /></label>
            <Button type="button" size="sm" onClick={() => void registerSingle()} disabled={isReadOnly || busy !== null || !productName.trim() || !serialNumber.trim()} className="self-end">{busy === "single" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{copy.registerAsset}</Button>
          </div>
        </div>

        <div className="border-t border-[#E2E8F0] pt-5">
          <div className="flex items-center gap-2"><Package className="h-4 w-4 text-[#0F172A]" aria-hidden="true" /><h3 className="text-sm font-extrabold text-[#0F172A]">{copy.bulkScanner}</h3></div>
          <p className="mt-1 text-xs leading-5 text-[#475569]">{copy.bulkScannerHint}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label><span className="text-xs font-extrabold text-[#0F172A]">{copy.assetProductName}</span><input value={bulkProductName} onChange={(event) => setBulkProductName(event.target.value)} disabled={isReadOnly} placeholder={copy.assetProductName} className="mt-1 min-h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm outline-none focus:border-[#0F172A] focus:ring-2 focus:ring-[#B7D1EA] disabled:bg-[#F0EEE9]" /></label>
            <label><span className="text-xs font-extrabold text-[#0F172A]">ERP item code (optional)</span><input value={bulkCatalogProductId} onChange={(event) => setBulkCatalogProductId(event.target.value)} disabled={isReadOnly} placeholder="ERP item code" className="mt-1 min-h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm outline-none focus:border-[#0F172A] focus:ring-2 focus:ring-[#B7D1EA] disabled:bg-[#F0EEE9]" /></label>
          </div>
          <label className="mt-3 block"><span className="text-xs font-extrabold text-[#0F172A]">{copy.serials}</span><textarea value={bulkSerials} onChange={(event) => setBulkSerials(event.target.value)} disabled={isReadOnly} rows={5} placeholder={"SN001\nSN002\nSN003"} className="mt-1 block w-full resize-y rounded-lg border border-[#CBD5E1] bg-white px-3 py-3 font-mono text-sm text-[#0F172A] outline-none focus:border-[#0F172A] focus:ring-2 focus:ring-[#B7D1EA] disabled:bg-[#F0EEE9]" /></label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-[#475569]">{bulkSerials.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean).length} / 200</p><Button type="button" variant="secondary" size="sm" onClick={() => void registerBulk()} disabled={isReadOnly || busy !== null || !bulkProductName.trim() || !bulkSerials.trim()}>{busy === "bulk" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{copy.registerBulk}</Button></div>
        </div>

        {savedAssets.length > 0 ? <div className="border-t border-[#E2E8F0] pt-5"><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#475569]">{copy.assetRegistration}</p><ul className="mt-3 grid gap-2 sm:grid-cols-2">{savedAssets.slice(-10).map((asset, index) => <li key={asset.serialNumber + "-" + index} className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-3 text-sm"><span className="min-w-0 truncate font-mono text-xs text-[#0F172A]">{asset.serialNumber}</span><span className={asset.status === "UNKNOWN" || asset.status === "PENDING_SYNC" ? "text-xs font-bold text-[#68411f]" : "text-xs font-bold text-emerald-800"}>{asset.status}</span></li>)}</ul></div> : null}
      </div>
    </section>
  );
}
