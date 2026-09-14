"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
import { signOut as signOutAction } from "@/app/actions/auth";
import {
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  CloudOff,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  HardDrive,
  HardHat,
  Loader2,
  LockKeyhole,
  LogOut,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Upload,
  Wifi,
  WifiOff,
  X,
} from "@/components/ui/icons";

import { cn } from "@/lib/utils";
import {
  cacheTechnicianDashboard,
  clearTechTaskDraft,
  enqueueTechOperation,
  getCachedTechnicianDashboard,
  getTechOfflineSummary,
  getTechStorageStatus,
  getPendingTechHandoverTaskIds,
  getTechTaskDraft,
  retryTechConflicts,
  saveTechTaskDraft,
  setTechPortalActiveActor,
  syncTechOutbox,
  TechOfflineStorageError,
  updateCachedTechnicianTask,
  type TechOfflineSummary,
  type TechStorageStatus,
} from "@/lib/techPortalOffline";
import { createClient } from "@/utils/supabase/client";
import {
  LEGACY_TECH_PORTAL_PHASES,
  TECH_PORTAL_PHASES,
  TECH_PRE_FLIGHT_CHECKS,
  TECH_PRE_FLIGHT_VERSION,
  type TechDashboardTask,
  type TechDashboardResponse,
  type TechPhaseState,
  type TechPortalPhaseCode,
  type TechPreFlightCheckKey,
  type TechnicianGps,
  type TechTestValueDefinition,
} from "@/types/techPortal";
import TechnicianAssetCapture from "./TechnicianAssetCapture";

type Copy = {
  portal: string;
  fieldOperations: string;
  todayRoute: string;
  routeDate: string;
  assignedJobs: string;
  refresh: string;
  installApp: string;
  installHint: string;
  installAndroid: string;
  installIos: string;
  syncNow: string;
  syncPending: string;
  syncInProgress: string;
  syncFailed: string;
  syncConflict: string;
  storageNearFull: string;
  storageFull: string;
  signOut: string;
  signOutPending: string;
  signOutWarning: string;
  signOutFailed: string;
  erpSync: string;
  erpSyncPending: string;
  erpSyncInProgress: string;
  erpSyncSynced: string;
  erpSyncFailed: string;
  erpSyncHint: string;
  workflowOverview: string;
  workflowOverviewHint: string;
  permit: string;
  permitNotStarted: string;
  permitSubmitted: string;
  permitApproved: string;
  permitAuthority: string;
  applicationNumber: string;
  retryConflicts: string;
  capturedOffline: string;
  handoverPending: string;
  loading: string;
  online: string;
  offline: string;
  readOnlyOffline: string;
  reviewOnly: string;
  reviewOnlyHint: string;
  accessRequired: string;
  accessRequiredHint: string;
  accessDenied: string;
  accessDeniedHint: string;
  signIn: string;
  retry: string;
  noJobs: string;
  noJobsHint: string;
  customerSite: string;
  navigate: string;
  callCustomer: string;
  project: string;
  task: string;
  started: string;
  readyToStart: string;
  completed: string;
  preflightTitle: string;
  preflightHint: string;
  required: string;
  checksComplete: string;
  startJob: string;
  starting: string;
  preflightComplete: string;
  executionTitle: string;
  executionHint: string;
  phase: string;
  phaseComplete: string;
  phaseLocked: string;
  completePrevious: string;
  evidence: string;
  evidenceHint: string;
  capturePhoto: string;
  uploadPhoto: string;
  uploading: string;
  viewPhoto: string;
  noEvidence: string;
  testReadings: string;
  requiredReading: string;
  range: string;
  markComplete: string;
  markingComplete: string;
  continuePhase: string;
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
  handoverTitle: string;
  handoverReady: string;
  handoverHint: string;
  handoverCompleted: string;
  summary: string;
  customerSignature: string;
  signatureHint: string;
  clearSignature: string;
  notes: string;
  optional: string;
  completeHandover: string;
  finalizing: string;
  downloadCertificate: string;
  emailed: string;
  emailWarning: string;
  certificateHash: string;
  locationRequired: string;
  locationDenied: string;
  photoInvalid: string;
  photoTooLarge: string;
  networkError: string;
  unexpectedError: string;
  startRequired: string;
  evidenceRequired: string;
  readingRequired: string;
  phaseReady: string;
  allPhasesComplete: string;
  reviewHandover: string;
  handoverDoneAction: string;
  clear: string;
  gpsCaptured: string;
  capturedAt: string;
  certificate: string;
  status: string;
  close: string;
  phases: Partial<Record<TechPortalPhaseCode, string>>;
};

const EN_COPY: Copy = {
  portal: "TECHNICIAN PORTAL",
  fieldOperations: "Field operations",
  todayRoute: "Today’s route",
  routeDate: "Scheduled installation work",
  assignedJobs: "assigned jobs",
  refresh: "Refresh route",
  installApp: "Install app",
  installHint: "Add Engineer Console to this device for faster access in the field.",
  installAndroid: "Android / Chrome: use the browser menu, then choose Install app.",
  installIos: "iPhone / Safari: use Share, then Add to Home Screen.",
  syncNow: "Sync now",
  syncPending: "actions waiting to sync",
  syncInProgress: "Syncing field records…",
  syncFailed: "Some records need attention before they can sync.",
  syncConflict: "A server conflict needs review.",
  storageNearFull: "Device storage is nearly full. Sync confirmed work or free space before capturing more photos.",
  storageFull: "Device storage is full for this evidence file. Sync pending work or free device storage, then try again.",
  signOut: "Sign out",
  signOutPending: "Signing out…",
  signOutWarning: "There is technician work that has not been fully synchronized. Sign out and keep it on this device for the same technician to resume later?",
  signOutFailed: "The session could not be closed. Your offline work remains on this device.",
  erpSync: "ERPNext connection",
  erpSyncPending: "Queued for ERPNext",
  erpSyncInProgress: "Sending to ERPNext",
  erpSyncSynced: "Synced to ERPNext",
  erpSyncFailed: "ERPNext sync needs attention",
  erpSyncHint: "Field records are saved in SolarDream first. ERPNext updates continue in the background.",
  workflowOverview: "Installation route",
  workflowOverviewHint: "Seven ordered stages. The active stage is highlighted and later stages stay locked until the sequence is complete.",
  permit: "Permit",
  permitNotStarted: "Not started",
  permitSubmitted: "Submitted",
  permitApproved: "Approved",
  permitAuthority: "Authority",
  applicationNumber: "Application number",
  retryConflicts: "Retry after refresh",
  capturedOffline: "Captured on this device. It will sync when the connection returns.",
  handoverPending: "Signature captured locally. The certificate will be sealed after sync.",
  loading: "Loading your route…",
  online: "Online",
  offline: "Offline",
  readOnlyOffline: "Offline mode saves field records on this device. Server verification and final handover happen after sync.",
  reviewOnly: "Read-only review mode",
  reviewOnlyHint: "You are reviewing installation progress. Field actions are available only to the assigned installer.",
  accessRequired: "Technician access required",
  accessRequiredHint: "Sign in with an active installer account to view assigned work.",
  accessDenied: "Technician access is restricted",
  accessDeniedHint: "This account is not an installer or installation reviewer. Ask an administrator to assign the correct role.",
  signIn: "Sign in",
  retry: "Try again",
  noJobs: "No installation jobs today",
  noJobsHint: "When a task is assigned to your installer account, it will appear here.",
  customerSite: "Customer & site",
  navigate: "Navigate with Google Maps",
  callCustomer: "Call customer",
  project: "Project",
  task: "Task",
  started: "In progress",
  readyToStart: "Ready to start",
  completed: "Completed",
  preflightTitle: "JSA & inventory gate",
  preflightHint: "Complete every ISO 45001 safety and BOM check before entering the site workflow.",
  required: "Required",
  checksComplete: "checks complete",
  startJob: "Start job",
  starting: "Capturing location & starting…",
  preflightComplete: "Pre-flight completed",
  executionTitle: "Installation evidence",
  executionHint: "Follow the sequence. Each phase needs its evidence and measured values before it can close.",
  phase: "Phase",
  phaseComplete: "Phase complete",
  phaseLocked: "Locked until the previous phase is complete",
  completePrevious: "Complete the previous phase to unlock this step.",
  evidence: "Required evidence",
  evidenceHint: "Use the rear camera. Photos are timestamped, GPS-tagged, hashed, and stored for audit.",
  capturePhoto: "Capture QC photo",
  uploadPhoto: "Upload photo",
  uploading: "Uploading evidence…",
  viewPhoto: "View evidence",
  noEvidence: "No evidence captured yet",
  testReadings: "Test readings",
  requiredReading: "Required reading",
  range: "Range",
  markComplete: "Mark phase complete",
  markingComplete: "Syncing QC…",
  continuePhase: "Continue current phase",
  assetRegistration: "Installed assets",
  assetRegistrationHint: "Scan or enter equipment serials, verify them with ERPNext, and keep unknown products clearly marked for review.",
  assetProductName: "Product name",
  assetSerialNumber: "Serial number",
  assetWarrantyProvider: "Warranty provider",
  verifySerial: "Verify",
  registerAsset: "Register asset",
  bulkScanner: "Bulk scanner",
  bulkScannerHint: "Paste one serial per line or use a USB/Bluetooth scanner. Unmatched serials remain UNKNOWN until an operator resolves them.",
  serials: "Serial numbers",
  registerBulk: "Register serials",
  scanWithCamera: "Scan with camera",
  stopCamera: "Close scanner",
  cameraUnavailable: "Camera scanning is unavailable in this browser. Enter a serial or connect a hardware scanner.",
  assetVerified: "ERPNext product found",
  assetUnverified: "Product not found. This asset will be saved as UNKNOWN for later review.",
  assetSaved: "Asset saved",
  bulkSaved: "Bulk registration complete",
  invalidSerials: "Enter between 1 and 200 serial numbers.",
  handoverTitle: "Customer handover",
  handoverReady: "Ready for customer sign-off",
  handoverHint: "Review the evidence trail, then have the customer sign the commissioning certificate on this device.",
  handoverCompleted: "Handover completed",
  summary: "Commissioning summary",
  customerSignature: "Customer signature",
  signatureHint: "Ask the customer to sign inside the box using a finger or stylus.",
  clearSignature: "Clear signature",
  notes: "Handover notes",
  optional: "Optional",
  completeHandover: "Complete handover",
  finalizing: "Sealing certificate & closing task…",
  downloadCertificate: "Download certificate",
  emailed: "Certificate email sent to customer.",
  emailWarning: "Handover is complete, but the customer email was not sent.",
  certificateHash: "Certificate SHA-256",
  locationRequired: "Location permission is required for this audit step.",
  locationDenied: "Location access was denied. Allow GPS in browser settings and try again.",
  photoInvalid: "Choose a valid image file.",
  photoTooLarge: "Images must be 10 MB or smaller.",
  networkError: "The route could not be loaded. Check your connection and retry.",
  unexpectedError: "Something went wrong. Please retry.",
  startRequired: "Complete all pre-flight checks before starting the job.",
  evidenceRequired: "Capture at least one QC photo before closing this phase.",
  readingRequired: "Enter every required test reading before closing this phase.",
  phaseReady: "Ready to close",
  allPhasesComplete: "All seven stages complete",
  reviewHandover: "Review & sign handover",
  handoverDoneAction: "Handover complete",
  clear: "Clear",
  gpsCaptured: "GPS captured",
  capturedAt: "Captured",
  certificate: "Certificate of Commissioning & Handover",
  status: "Status",
  close: "Close",
  phases: {
    RAIL_MOUNTING: "Rail mounting",
    PV_DC_WIRING: "PV / DC wiring",
    PANEL_PLACEMENT: "Panel placement",
    INVERTER_WIRING: "Inverter wiring",
    SYSTEM_TIE_IN: "System tie-in",
    COMMISSIONING_TEST: "Commissioning & test",
    PERMIT_APPLICATION: "Permit application",
    STRUCTURAL: "Structural",
    DC_WIRING: "DC wiring",
    AC_INVERTER: "AC / inverter",
    COMMISSIONING: "Commissioning",
  },
};

const TH_COPY: Copy = {
  ...EN_COPY,
  workflowOverview: "ลำดับงานติดตั้ง",
  workflowOverviewHint: "งานมี 7 ขั้นตามลำดับ ขั้นปัจจุบันจะเด่นชัด และขั้นถัดไปจะปลดล็อกเมื่อทำขั้นก่อนหน้าเสร็จ",
  permit: "ใบอนุญาต",
  permitNotStarted: "ยังไม่เริ่ม",
  permitSubmitted: "ยื่นแล้ว",
  permitApproved: "อนุมัติแล้ว",
  permitAuthority: "หน่วยงาน",
  applicationNumber: "เลขที่คำขอ",
  portal: "TECHNICIAN PORTAL",
  fieldOperations: "งานภาคสนาม",
  todayRoute: "งานของวันนี้",
  routeDate: "รายการติดตั้งที่ได้รับมอบหมาย",
  assignedJobs: "งานที่ได้รับมอบหมาย",
  refresh: "รีเฟรชรายการงาน",
  installApp: "ติดตั้งแอป",
  installHint: "เพิ่ม Engineer Console ไว้บนอุปกรณ์เพื่อเปิดใช้งานหน้างานได้เร็วขึ้น",
  installAndroid: "Android / Chrome: เปิดเมนูเบราว์เซอร์ แล้วเลือกติดตั้งแอป",
  installIos: "iPhone / Safari: กดแชร์ แล้วเลือกเพิ่มไปยังหน้าจอโฮม",
  syncNow: "ซิงค์ตอนนี้",
  syncPending: "รายการรอซิงค์",
  syncInProgress: "กำลังซิงค์ข้อมูลหน้างาน…",
  syncFailed: "มีรายการที่ต้องตรวจสอบก่อนซิงค์ต่อ",
  syncConflict: "มีข้อมูลขัดแย้งกับเซิร์ฟเวอร์ กรุณาตรวจสอบ",
  storageNearFull: "พื้นที่จัดเก็บในอุปกรณ์ใกล้เต็ม ซิงค์งานที่ยืนยันแล้วหรือลบไฟล์ที่ไม่ใช้ก่อนถ่ายรูปเพิ่ม",
  storageFull: "พื้นที่ในอุปกรณ์ไม่พอสำหรับไฟล์หลักฐานนี้ ซิงค์งานค้างหรือลดการใช้พื้นที่แล้วลองใหม่",
  signOut: "ออกจากระบบ",
  signOutPending: "กำลังออกจากระบบ…",
  signOutWarning: "มีงานช่างที่ยังซิงค์ไม่ครบ ต้องการออกจากระบบและเก็บงานไว้ในอุปกรณ์เพื่อให้ช่างคนเดิมกลับมาซิงค์ภายหลังหรือไม่",
  signOutFailed: "ปิดเซสชันไม่ได้ งานออฟไลน์ยังคงเก็บไว้ในอุปกรณ์",
  retryConflicts: "รีเฟรชแล้วลองซิงค์อีกครั้ง",
  capturedOffline: "บันทึกไว้ในอุปกรณ์แล้ว จะซิงค์เมื่อกลับมาออนไลน์",
  handoverPending: "บันทึกลายเซ็นไว้ในอุปกรณ์แล้ว ระบบจะซีลใบรับรองหลังซิงค์",
  loading: "กำลังโหลดงานของคุณ…",
  online: "ออนไลน์",
  offline: "ออฟไลน์",
  readOnlyOffline: "โหมดออฟไลน์จะบันทึกข้อมูลหน้างานไว้ในอุปกรณ์ การตรวจสอบจากเซิร์ฟเวอร์และการส่งมอบจะเกิดขึ้นหลังซิงค์",
  reviewOnly: "โหมดตรวจสอบแบบอ่านอย่างเดียว",
  reviewOnlyHint: "คุณกำลังตรวจสอบความคืบหน้าการติดตั้ง การดำเนินงานหน้างานทำได้เฉพาะช่างที่ได้รับมอบหมาย",
  accessRequired: "ต้องเข้าสู่ระบบช่างติดตั้ง",
  accessRequiredHint: "เข้าสู่ระบบด้วยบัญชีช่างติดตั้งที่ยังใช้งานอยู่เพื่อดูงานที่ได้รับมอบหมาย",
  accessDenied: "จำกัดสิทธิ์การเข้าถึงพอร์ทัลช่าง",
  accessDeniedHint: "บัญชีนี้ไม่ใช่ช่างติดตั้งหรือผู้ตรวจสอบงานติดตั้ง กรุณาติดต่อผู้ดูแลระบบเพื่อกำหนดสิทธิ์ที่ถูกต้อง",
  signIn: "เข้าสู่ระบบ",
  retry: "ลองอีกครั้ง",
  noJobs: "วันนี้ไม่มีงานติดตั้ง",
  noJobsHint: "เมื่องานถูกมอบหมายให้บัญชีช่างของคุณ งานจะแสดงที่นี่",
  customerSite: "ลูกค้าและสถานที่",
  navigate: "นำทางด้วย Google Maps",
  callCustomer: "โทรหาลูกค้า",
  project: "โครงการ",
  task: "งาน",
  started: "กำลังดำเนินการ",
  readyToStart: "พร้อมเริ่มงาน",
  completed: "เสร็จสิ้น",
  preflightTitle: "ด่าน JSA และตรวจอุปกรณ์",
  preflightHint: "ตรวจความปลอดภัยตาม ISO 45001 และ BOM ให้ครบก่อนเข้าสู่ขั้นตอนติดตั้ง",
  required: "จำเป็น",
  checksComplete: "รายการครบ",
  startJob: "เริ่มงาน",
  starting: "กำลังบันทึกพิกัดและเริ่มงาน…",
  preflightComplete: "ตรวจสอบก่อนเริ่มงานแล้ว",
  executionTitle: "หลักฐานการติดตั้ง",
  executionHint: "ทำตามลำดับ แต่ละเฟสต้องมีรูปหลักฐานและค่าที่วัดได้ก่อนปิดเฟส",
  phase: "เฟส",
  phaseComplete: "ปิดเฟสแล้ว",
  phaseLocked: "ล็อกจนกว่าเฟสก่อนหน้าจะเสร็จ",
  completePrevious: "ปิดเฟสก่อนหน้าเพื่อปลดล็อกขั้นตอนนี้",
  evidence: "หลักฐานที่ต้องมี",
  evidenceHint: "ใช้กล้องหลัง รูปจะถูกบันทึกเวลา พิกัด GPS ค่าแฮช และจัดเก็บเพื่อการตรวจสอบ",
  capturePhoto: "ถ่ายรูป QC",
  uploadPhoto: "อัปโหลดรูป",
  uploading: "กำลังอัปโหลดหลักฐาน…",
  viewPhoto: "ดูหลักฐาน",
  noEvidence: "ยังไม่มีรูปหลักฐาน",
  testReadings: "ค่าทดสอบ",
  requiredReading: "ค่าที่ต้องกรอก",
  range: "ช่วงที่ยอมรับ",
  markComplete: "ปิดเฟส",
  markingComplete: "กำลังซิงค์ QC…",
  continuePhase: "ไปยังเฟสปัจจุบัน",
  handoverTitle: "ส่งมอบงานให้ลูกค้า",
  handoverReady: "พร้อมให้ลูกค้าลงนาม",
  handoverHint: "ตรวจสอบหลักฐาน แล้วให้ลูกค้าลงนามในใบรับรองการทดสอบระบบบนอุปกรณ์นี้",
  handoverCompleted: "ส่งมอบงานแล้ว",
  summary: "สรุปการทดสอบระบบ",
  customerSignature: "ลายเซ็นลูกค้า",
  signatureHint: "ให้ลูกค้าเซ็นในกรอบด้วยนิ้วหรือปากกา",
  clearSignature: "ล้างลายเซ็น",
  notes: "หมายเหตุส่งมอบงาน",
  optional: "ไม่บังคับ",
  completeHandover: "ยืนยันส่งมอบงาน",
  finalizing: "กำลังซีลใบรับรองและปิดงาน…",
  downloadCertificate: "ดาวน์โหลดใบรับรอง",
  emailed: "ส่งใบรับรองทางอีเมลให้ลูกค้าแล้ว",
  emailWarning: "ส่งมอบงานแล้ว แต่ยังส่งอีเมลให้ลูกค้าไม่ได้",
  certificateHash: "SHA-256 ใบรับรอง",
  locationRequired: "ขั้นตอนตรวจสอบนี้ต้องได้รับอนุญาตให้ใช้ตำแหน่ง",
  locationDenied: "ไม่สามารถเข้าถึงตำแหน่งได้ อนุญาต GPS ในการตั้งค่าเบราว์เซอร์แล้วลองใหม่",
  photoInvalid: "เลือกไฟล์รูปภาพที่ถูกต้อง",
  photoTooLarge: "รูปภาพต้องมีขนาดไม่เกิน 10 MB",
  networkError: "โหลดรายการงานไม่ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่",
  unexpectedError: "เกิดข้อผิดพลาด กรุณาลองใหม่",
  startRequired: "ตรวจสอบรายการก่อนเริ่มงานให้ครบทุกข้อ",
  evidenceRequired: "ถ่ายรูป QC อย่างน้อยหนึ่งรูปก่อนปิดเฟส",
  readingRequired: "กรอกค่าทดสอบที่จำเป็นให้ครบก่อนปิดเฟส",
  phaseReady: "พร้อมปิดเฟส",
  allPhasesComplete: "ครบทั้ง 7 เฟสแล้ว",
  reviewHandover: "ตรวจสอบและเซ็นส่งมอบ",
  handoverDoneAction: "ส่งมอบงานแล้ว",
  clear: "ล้าง",
  gpsCaptured: "บันทึก GPS แล้ว",
  capturedAt: "บันทึกเมื่อ",
  certificate: "ใบรับรองการทดสอบและส่งมอบระบบ",
  status: "สถานะ",
  close: "ปิด",
  phases: {
    STRUCTURAL: "โครงสร้าง",
    DC_WIRING: "เดินสาย DC",
    AC_INVERTER: "AC / อินเวอร์เตอร์",
    COMMISSIONING: "ทดสอบระบบ",
  },
};

type Notice = {
  tone: "success" | "error" | "info";
  message: string;
};

type TechPreFlightChecks = Record<TechPreFlightCheckKey, boolean>;
type PhaseTestValues = Partial<Record<TechPortalPhaseCode, Record<string, string>>>;

class PortalRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "PortalRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getApiMessage(value: unknown, fallback: string) {
  if (isRecord(value) && typeof value.error === "string" && value.error.trim()) {
    return value.error;
  }
  return fallback;
}

function isDashboardPayload(value: unknown): value is TechDashboardResponse {
  if (!isRecord(value) || value.success !== true || typeof value.date !== "string" || typeof value.cacheScope !== "string" || typeof value.readOnly !== "boolean" || !Array.isArray(value.tasks)) {
    return false;
  }
  return value.tasks.every((task) => {
    if (!isRecord(task) || typeof task.taskId !== "string" || typeof task.projectCode !== "string" || !Array.isArray(task.phases)) {
      return false;
    }
    const customer = task.customer;
    return isRecord(customer) && typeof customer.name === "string" && typeof customer.address === "string";
  });
}

function makeIdempotencyKey(prefix: string) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function makeLocalEvidenceId() {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `local-evidence-${suffix}`;
}

function isEvidenceLocallyAvailable(status: string) {
  return status === "READY" || status === "PENDING_SYNC";
}

function createEmptyChecks(): TechPreFlightChecks {
  return Object.fromEntries(TECH_PRE_FLIGHT_CHECKS.map((check) => [check.key, false])) as TechPreFlightChecks;
}

function checksForTask(task: TechDashboardTask): TechPreFlightChecks {
  const checks = createEmptyChecks();
  if (!task.preflight) return checks;
  for (const check of TECH_PRE_FLIGHT_CHECKS) {
    checks[check.key] = task.preflight.checks[check.key] === true;
  }
  return checks;
}

function captureGps(): Promise<TechnicianGps> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GEOLOCATION_UNAVAILABLE"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        capturedAt: new Date().toISOString(),
      }),
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

function getLocationError(error: unknown, copy: Copy) {
  if ((typeof GeolocationPositionError !== "undefined" && error instanceof GeolocationPositionError) || (isRecord(error) && typeof error.code === "number")) {
    return copy.locationDenied;
  }
  if (error instanceof Error && error.message === "GEOLOCATION_UNAVAILABLE") {
    return copy.locationRequired;
  }
  return copy.locationRequired;
}

function getPhaseValues(task: TechDashboardTask, phase: TechPhaseState, localValues: PhaseTestValues) {
  const fromServer = Object.fromEntries(
    Object.entries(phase.testValues).map(([key, value]) => [key, String(value)]),
  );
  return {
    ...fromServer,
    ...(localValues[phase.code] || {}),
  };
}

async function compressEvidenceForOffline(file: File) {
  if (file.size <= 1_500_000 || !file.type.startsWith("image/") || file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 2_560;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!compressed || compressed.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^./]+$/, "") || "qc-evidence";
    return new File([compressed], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    // Some mobile browsers cannot decode HEIC or camera-specific formats in
    // the page. Keep the original and let the server perform validation.
    return file;
  }
}

async function hashOfflineEvidence(file: Blob) {
  if (!globalThis.crypto?.subtle) return "pending";
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const TH_PHASE_LABELS: Partial<Record<TechPortalPhaseCode, string>> = {
  RAIL_MOUNTING: "\u0e15\u0e34\u0e14\u0e23\u0e32\u0e07",
  PV_DC_WIRING: "\u0e40\u0e14\u0e34\u0e19\u0e2a\u0e32\u0e22 DC",
  PANEL_PLACEMENT: "\u0e27\u0e32\u0e07\u0e41\u0e1c\u0e07",
  INVERTER_WIRING: "\u0e40\u0e14\u0e34\u0e19\u0e2a\u0e32\u0e22\u0e2b\u0e32 Inverter",
  SYSTEM_TIE_IN: "\u0e08\u0e31\u0e21\u0e1b\u0e4c\u0e40\u0e02\u0e49\u0e32\u0e23\u0e30\u0e1a\u0e1a",
  COMMISSIONING_TEST: "\u0e17\u0e14\u0e2a\u0e2d\u0e1a\u0e41\u0e25\u0e30\u0e1b\u0e34\u0e14\u0e07\u0e32\u0e19",
  PERMIT_APPLICATION: "\u0e02\u0e2d\u0e43\u0e1a\u0e2d\u0e19\u0e38\u0e0d\u0e32\u0e15",
};

function getPhaseDefinition(code: TechPortalPhaseCode) {
  return [...TECH_PORTAL_PHASES, ...LEGACY_TECH_PORTAL_PHASES].find((phase) => phase.code === code) || null;
}

function getPhaseLabel(copy: Copy, code: TechPortalPhaseCode, locale: string) {
  return copy.phases[code]
    || (locale === "th" ? TH_PHASE_LABELS[code] : null)
    || getPhaseDefinition(code)?.title
    || code;
}

function getErpSyncLabel(copy: Copy, status: string) {
  if (status === "SYNCED") return copy.erpSyncSynced;
  if (status === "SYNCING") return copy.erpSyncInProgress;
  if (status === "FAILED" || status === "DEAD") return copy.erpSyncFailed;
  return copy.erpSyncPending;
}

function getPermitLabel(copy: Copy, status: string) {
  if (status === "APPROVED") return copy.permitApproved;
  if (status === "SUBMITTED") return copy.permitSubmitted;
  return copy.permitNotStarted;
}

function formatDate(value: string | null, locale: string, fallback: string) {
  if (!value) return fallback;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function formatDateTime(value: string | null, locale: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function getEvidenceThumbnailUrl(fileUrl: string) {
  const driveMatch = fileUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  return driveMatch
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveMatch[1])}&sz=w480`
    : fileUrl;
}

function statusTone(task: TechDashboardTask): "success" | "warning" | "info" | "neutral" {
  if (task.handover) return "success";
  if (task.preflight) return "info";
  if (task.status === "OPEN") return "warning";
  return "neutral";
}

function subscribeToOnlineStatus(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getOnlineStatus() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function getServerOnlineStatus() {
  return true;
}

async function getBrowserSessionUserId(supabase: ReturnType<typeof createClient>) {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

function StatusChip({ tone, children }: { tone: "success" | "warning" | "info" | "neutral"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "warning" && "border-[#D8A87B]/50 bg-[#F1D6B8]/60 text-[#0F172A]",
        tone === "info" && "border-[#B7D1EA] bg-[#B7D1EA] text-[#0F172A]",
        tone === "neutral" && "border-slate-300 bg-white/70 text-slate-700",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

function SectionHeader({
  icon,
  id,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  id?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[#E2E8F0] px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#B7D1EA]/55 text-[#0F172A]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 id={id} className="text-base font-extrabold tracking-[-0.01em] text-[#0F172A]">{title}</h2>
          {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-[#475569]">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function WorkflowStageRail({
  phases,
  preflight,
  activePhaseIndex,
  firstIncompleteIndex,
  copy,
  locale,
}: {
  phases: TechPhaseState[];
  preflight: TechDashboardTask["preflight"];
  activePhaseIndex: number;
  firstIncompleteIndex: number;
  copy: Copy;
  locale: string;
}) {
  const completed = phases.filter((phase) => phase.completed).length;
  const progress = phases.length > 0 ? Math.round((completed / phases.length) * 100) : 0;

  return (
    <div className="mt-5 rounded-xl border border-white/15 bg-white/[0.06] p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-extrabold text-white">{copy.workflowOverview}</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">{copy.workflowOverviewHint}</p>
        </div>
        <span className="inline-flex min-h-7 items-center self-start rounded-full bg-[#B7D1EA] px-3 text-xs font-extrabold text-[#0F172A] sm:self-auto">
          {completed}/{phases.length} · {progress}%
        </span>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label={copy.workflowOverview} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <div className="h-full rounded-full bg-[#B7D1EA] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
      </div>

      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-7" aria-label={copy.workflowOverview}>
        {phases.map((phase, index) => {
          const locked = !preflight || (firstIncompleteIndex >= 0 && index > firstIncompleteIndex);
          const current = !phase.completed && (index === firstIncompleteIndex || index === activePhaseIndex);
          return (
            <li key={phase.code} className={cn("min-w-0 rounded-lg border px-2.5 py-2", phase.completed ? "border-emerald-300/50 bg-emerald-400/15" : current ? "border-[#B7D1EA] bg-[#B7D1EA]/20" : "border-white/10 bg-white/[0.04]")}>
              <div className="flex items-center gap-2">
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold", phase.completed ? "bg-emerald-400 text-emerald-950" : current ? "bg-[#B7D1EA] text-[#0F172A]" : "bg-white/15 text-slate-300")}>
                  {phase.completed ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : locked ? <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold text-slate-400">{copy.phase} {index + 1}</span>
                  <span className={cn("mt-0.5 block truncate text-xs font-extrabold", phase.completed ? "text-emerald-100" : current ? "text-white" : "text-slate-300")} title={getPhaseLabel(copy, phase.code, locale)}>{getPhaseLabel(copy, phase.code, locale)}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function LoadingShell({ copy }: { copy: Copy }) {
  return (
    <div className="space-y-4" aria-live="polite" aria-busy="true">
      <div className="rounded-xl border border-[#E2E8F0] bg-[#F5F2EB] p-5 sm:p-6">
        <div className="h-3 w-28 rounded bg-slate-200 motion-safe:animate-pulse" />
        <div className="mt-4 h-8 max-w-sm rounded bg-slate-200 motion-safe:animate-pulse" />
        <div className="mt-3 h-4 max-w-lg rounded bg-slate-200 motion-safe:animate-pulse" />
      </div>
      <div className="rounded-xl border border-[#E2E8F0] bg-[#F5F2EB] p-5 sm:p-6">
        <div className="h-5 w-48 rounded bg-slate-200 motion-safe:animate-pulse" />
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-14 rounded-lg bg-slate-100 motion-safe:animate-pulse" />
          ))}
        </div>
      </div>
      <p className="flex items-center gap-2 text-sm text-[#475569]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {copy.loading}
      </p>
    </div>
  );
}

export default function TechnicianPortalClient({ locale, assetCaptureEnabled = false }: { locale: string; assetCaptureEnabled?: boolean }) {
  const copy = useMemo(() => (locale === "th" ? TH_COPY : EN_COPY), [locale]);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [dashboard, setDashboard] = useState<TechDashboardResponse | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedPhaseByTask, setSelectedPhaseByTask] = useState<Record<string, TechPortalPhaseCode>>({});
  const [preflightChecks, setPreflightChecks] = useState<Record<string, TechPreFlightChecks>>({});
  const [testValuesByTask, setTestValuesByTask] = useState<Record<string, PhaseTestValues>>({});
  const [isLoading, setIsLoading] = useState(true);
  const isOnline = useSyncExternalStore(subscribeToOnlineStatus, getOnlineStatus, getServerOnlineStatus);
  const [authRequired, setAuthRequired] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyAction, setBusyAction] = useState<"start" | "evidence" | "qc" | "handover" | null>(null);
  const [busyPhase, setBusyPhase] = useState<TechPortalPhaseCode | null>(null);
  const [handoverNotes, setHandoverNotes] = useState("");
  const [syncSummary, setSyncSummary] = useState<TechOfflineSummary>({
    pending: 0,
    pendingAuth: 0,
    syncing: 0,
    failed: 0,
    retryAvailable: 0,
    conflicts: 0,
    rejected: 0,
    pendingServer: 0,
    pendingErp: 0,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [storageStatus, setStorageStatus] = useState<TechStorageStatus | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [pendingHandoverByTask, setPendingHandoverByTask] = useState<Record<string, boolean>>({});
  const signatureRef = useRef<SignatureCanvas | null>(null);
  const handoverRef = useRef<HTMLElement | null>(null);
  const syncInFlightRef = useRef(false);
  const isReadOnly = dashboard?.readOnly ?? false;

  const applyDashboardPayload = useCallback(async (payload: TechDashboardResponse) => {
    setDashboard(payload);
    setAuthRequired(false);
    setAccessDenied(false);
    setError(null);
    setPreflightChecks((current) => {
      const next = { ...current };
      for (const task of payload.tasks) {
        if (!next[task.taskId]) next[task.taskId] = checksForTask(task);
      }
      return next;
    });
    setSelectedTaskId((current) => current && payload.tasks.some((task) => task.taskId === current)
      ? current
      : payload.tasks[0]?.taskId || null);
    const drafts = await Promise.all(payload.tasks.map((task) => getTechTaskDraft(task.taskId)));
    await Promise.all(payload.tasks.filter((task) => task.handover).map((task) => clearTechTaskDraft(task.taskId)));
    setPreflightChecks((current) => {
      const next = { ...current };
      payload.tasks.forEach((task, index) => {
        const draft = drafts[index];
        if (draft) next[task.taskId] = { ...checksForTask(task), ...draft.preflightChecks };
      });
      return next;
    });
    setTestValuesByTask((current) => {
      const next = { ...current };
      payload.tasks.forEach((task, index) => {
        const draft = drafts[index];
        if (draft) next[task.taskId] = draft.testValues;
      });
      return next;
    });
    setPendingHandoverByTask((current) => {
      const next = { ...current };
      payload.tasks.forEach((task) => {
        if (task.handover) delete next[task.taskId];
      });
      return next;
    });
    const pendingHandoverTaskIds = await getPendingTechHandoverTaskIds();
    setPendingHandoverByTask((current) => {
      const next = { ...current };
      payload.tasks.forEach((task) => {
        if (!task.handover) next[task.taskId] = pendingHandoverTaskIds.includes(task.taskId);
      });
      return next;
    });
  }, []);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAuthRequired(false);
    setAccessDenied(false);
    try {
      const currentActorUserId = await getBrowserSessionUserId(supabase);
      await setTechPortalActiveActor(currentActorUserId);
      if (!isOnline) {
        const cached = await getCachedTechnicianDashboard(currentActorUserId);
        if (!cached) throw new PortalRequestError(copy.networkError, 503);
        await applyDashboardPayload({ success: true, ...cached });
        return;
      }
      const response = await fetch("/api/tech/tasks", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new PortalRequestError(getApiMessage(payload, copy.networkError), response.status);
      }
      if (!isDashboardPayload(payload)) {
        throw new PortalRequestError(copy.networkError, 503);
      }
      await cacheTechnicianDashboard(payload).catch(() => undefined);
      await applyDashboardPayload(payload);
    } catch (requestError: unknown) {
      if (requestError instanceof PortalRequestError && requestError.status === 401) {
        setAuthRequired(true);
        setAccessDenied(false);
        setDashboard(null);
      } else if (requestError instanceof PortalRequestError && requestError.status === 403) {
        setAuthRequired(false);
        setAccessDenied(true);
        setDashboard(null);
        setError(null);
      } else {
        const cached = await getCachedTechnicianDashboard(await getBrowserSessionUserId(supabase)).catch(() => null);
        if (cached) {
          await applyDashboardPayload({ success: true, ...cached });
        } else {
          setError(requestError instanceof Error ? requestError.message : copy.networkError);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [applyDashboardPayload, copy.networkError, isOnline, supabase]);

  const refreshSyncSummary = useCallback(async () => {
    const [summary, storage] = await Promise.all([getTechOfflineSummary(), getTechStorageStatus()]);
    setSyncSummary(summary);
    setStorageStatus(storage);
  }, []);

  useEffect(() => {
    let disposed = false;
    const applyActor = (actorUserId: string | null) => {
      void setTechPortalActiveActor(actorUserId).then(() => {
        if (!disposed) void refreshSyncSummary();
      });
    };
    void supabase.auth.getSession()
      .then(({ data }) => applyActor(data.session?.user.id ?? null))
      .catch(() => applyActor(null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applyActor(session?.user.id ?? null);
    });
    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  }, [refreshSyncSummary, supabase]);

  const syncNow = useCallback(async (options: { forceRetry?: boolean } = {}) => {
    if (!isOnline || syncInFlightRef.current || isReadOnly) return;
    syncInFlightRef.current = true;
    setIsSyncing(true);
    try {
      const result = await syncTechOutbox(options);
      await refreshSyncSummary();
      if (result.authRequired) {
        setNotice({ tone: "error", message: copy.accessRequiredHint });
      }
      if (result.synced > 0) await loadDashboard();
      if (result.lastError && result.conflicts > 0) {
        setNotice({ tone: "error", message: copy.syncConflict });
      }
    } finally {
      syncInFlightRef.current = false;
      setIsSyncing(false);
    }
  }, [copy.accessRequiredHint, copy.syncConflict, isOnline, isReadOnly, loadDashboard, refreshSyncSummary]);

  const handleRetryConflicts = useCallback(async () => {
    if (!isOnline || syncInFlightRef.current || isReadOnly) return;
    await loadDashboard();
    await retryTechConflicts();
    await refreshSyncSummary();
    await syncNow({ forceRetry: true });
  }, [isOnline, isReadOnly, loadDashboard, refreshSyncSummary, syncNow]);

  const handleSignOut = useCallback(async () => {
    const summary = await getTechOfflineSummary();
    const unsyncedCount = summary.pending
      + summary.pendingAuth
      + summary.syncing
      + summary.failed
      + summary.conflicts
      + summary.rejected
      + summary.pendingServer
      + summary.pendingErp;
    if (unsyncedCount > 0 && !window.confirm(copy.signOutWarning)) return;

    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
      const result = await signOutAction();
      if ("error" in result) {
        setNotice({ tone: "error", message: copy.signOutFailed });
        return;
      }
      await setTechPortalActiveActor(null);
      router.replace(`/${locale}/login`);
    } catch {
      setNotice({ tone: "error", message: copy.signOutFailed });
    } finally {
      setIsSigningOut(false);
    }
  }, [copy.signOutFailed, copy.signOutWarning, locale, router, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDashboard(), 0);
    return () => window.clearTimeout(timer);
  }, [isOnline, loadDashboard]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshSyncSummary(), 0);
    const timer = window.setInterval(() => void refreshSyncSummary(), 2000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
    };
  }, [refreshSyncSummary]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (isRecord(event.data) && event.data.type === "TECH_PORTAL_SYNC_REQUEST") void syncNow();
    };
    const onOnline = () => void syncNow();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMessage);
      void navigator.serviceWorker.register("/tech-portal-sw.js", { updateViaCache: "none" }).then(() => void syncNow()).catch(() => undefined);
    }
    return () => {
      if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [syncNow]);

  const tasks = useMemo(() => dashboard?.tasks || [], [dashboard]);
  const activeTask = useMemo(
    () => tasks.find((task) => task.taskId === selectedTaskId) || tasks[0] || null,
    [selectedTaskId, tasks],
  );

  const activeChecks = activeTask
    ? preflightChecks[activeTask.taskId] || checksForTask(activeTask)
    : createEmptyChecks();
  const completedCheckCount = Object.values(activeChecks).filter(Boolean).length;
  const allChecksComplete = completedCheckCount === TECH_PRE_FLIGHT_CHECKS.length;

  const firstIncompleteIndex = activeTask
    ? activeTask.phases.findIndex((phase) => !phase.completed)
    : -1;
  const allPhasesComplete = Boolean(activeTask && firstIncompleteIndex === -1);
  const fallbackPhaseCode = activeTask
    ? activeTask.phases[firstIncompleteIndex === -1 ? activeTask.phases.length - 1 : firstIncompleteIndex]?.code
    : undefined;
  const selectedPhaseCode = activeTask
    ? selectedPhaseByTask[activeTask.taskId] || fallbackPhaseCode
    : undefined;
  const activePhase = activeTask?.phases.find((phase) => phase.code === selectedPhaseCode) || null;
  const activePhaseIndex = activeTask && activePhase
    ? activeTask.phases.findIndex((phase) => phase.code === activePhase.code)
    : -1;
  const activePhaseLocked = !activeTask?.preflight || (firstIncompleteIndex >= 0 && activePhaseIndex > firstIncompleteIndex);
  const activePhaseValues = activeTask && activePhase
    ? getPhaseValues(activeTask, activePhase, testValuesByTask[activeTask.taskId] || {})
    : {};
  const activePhaseDefinition = activePhase
    ? getPhaseDefinition(activePhase.code)
    : null;

  const activeTaskId = activeTask?.taskId;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!activeTaskId) {
        setHandoverNotes("");
        return;
      }
      void getTechTaskDraft(activeTaskId).then((draft) => {
        setHandoverNotes(draft?.handoverNotes || "");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTaskId]);

  const refreshAfterMutation = useCallback(async () => {
    await loadDashboard();
  }, [loadDashboard]);

  const updateNotice = (tone: Notice["tone"], message: string) => {
    setNotice({ tone, message });
  };

  const updateTaskLocally = useCallback((taskId: string, update: (task: TechDashboardTask) => TechDashboardTask) => {
    setDashboard((current) => current
      ? { ...current, tasks: current.tasks.map((task) => task.taskId === taskId ? update(task) : task) }
      : current);
    void updateCachedTechnicianTask(taskId, update);
  }, []);

  const persistTaskDraft = useCallback((taskId: string, checks: TechPreFlightChecks, values: PhaseTestValues, notes = "") => {
    void saveTechTaskDraft({
      taskId,
      preflightChecks: checks,
      testValues: values,
      handoverNotes: notes,
    });
  }, []);

  const handlePreflightCheckChange = (taskId: string, key: TechPreFlightCheckKey, value: boolean) => {
    if (isReadOnly) return;
    const nextChecks = {
      ...(preflightChecks[taskId] || createEmptyChecks()),
      [key]: value,
    };
    setPreflightChecks((current) => ({ ...current, [taskId]: nextChecks }));
    persistTaskDraft(taskId, nextChecks, testValuesByTask[taskId] || {});
  };

  const handleStartJob = async () => {
    if (isReadOnly) {
      updateNotice("info", copy.reviewOnlyHint);
      return;
    }
    if (!activeTask) return;
    if (!allChecksComplete) {
      updateNotice("error", copy.startRequired);
      return;
    }
    setBusyAction("start");
    setNotice(null);
    try {
      const gps = await captureGps();
      const idempotencyKey = makeIdempotencyKey("tech-start");
      if (!isOnline) {
        await enqueueTechOperation({
          type: "JOB_STARTED",
          taskId: activeTask.taskId,
          fieldVisitId: activeTask.fieldVisitId,
          idempotencyKey,
          payload: {
            taskId: activeTask.taskId,
            preflightVersion: TECH_PRE_FLIGHT_VERSION,
            checks: activeChecks,
            gps,
          },
        });
        updateTaskLocally(activeTask.taskId, (task) => ({
          ...task,
          status: "IN_PROGRESS",
          preflight: {
            version: TECH_PRE_FLIGHT_VERSION,
            checks: activeChecks,
            timesheetId: null,
            gps,
            startedAt: gps.capturedAt,
          },
        }));
        updateNotice("success", copy.capturedOffline);
        await refreshSyncSummary();
        return;
      }
      const response = await fetch("/api/tech/start-job", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          taskId: activeTask.taskId,
          fieldVisitId: activeTask.fieldVisitId,
          preflightVersion: TECH_PRE_FLIGHT_VERSION,
          checks: activeChecks,
          gps,
          source: "PWA_ONLINE",
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new PortalRequestError(getApiMessage(payload, copy.unexpectedError), response.status);
      updateNotice("success", copy.preflightComplete);
      await refreshAfterMutation();
    } catch (requestError: unknown) {
      updateNotice("error", requestError instanceof TechOfflineStorageError
        ? copy.storageFull
        : requestError instanceof PortalRequestError
          ? requestError.message
          : getLocationError(requestError, copy));
    } finally {
      setBusyAction(null);
    }
  };

  const handleEvidenceSelected = async (
    event: ChangeEvent<HTMLInputElement>,
    task: TechDashboardTask,
    phase: TechPhaseState,
  ) => {
    if (isReadOnly) {
      updateNotice("info", copy.reviewOnlyHint);
      return;
    }
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      updateNotice("error", copy.photoTooLarge);
      return;
    }
    if (file.type && !file.type.startsWith("image/")) {
      updateNotice("error", copy.photoInvalid);
      return;
    }
    setBusyAction("evidence");
    setBusyPhase(phase.code);
    setNotice(null);
    try {
      const gps = await captureGps();
      const idempotencyKey = makeIdempotencyKey("tech-evidence");
      if (!isOnline) {
        const offlineFile = await compressEvidenceForOffline(file);
        const clientSha256 = await hashOfflineEvidence(offlineFile);
        const localEvidenceId = makeLocalEvidenceId();
        await enqueueTechOperation({
          type: "QC_EVIDENCE_UPLOADED",
          taskId: task.taskId,
          fieldVisitId: task.fieldVisitId,
          idempotencyKey,
          payload: {
            taskId: task.taskId,
            phase: phase.code,
            gps,
            capturedAt: gps.capturedAt,
            localEvidenceId,
            clientSha256,
          },
          file: offlineFile,
          fileName: offlineFile.name || "qc-evidence.jpg",
          contentType: offlineFile.type || "image/jpeg",
        });
        updateTaskLocally(task.taskId, (currentTask) => ({
          ...currentTask,
          phases: currentTask.phases.map((candidate) => candidate.code === phase.code
            ? {
                ...candidate,
                evidenceReady: true,
                evidence: [...candidate.evidence, {
                  id: localEvidenceId,
                  status: "PENDING_SYNC",
                  sha256: clientSha256,
                  byteSize: offlineFile.size,
                  contentType: offlineFile.type || "image/jpeg",
                  capturedAt: gps.capturedAt,
                  fileUrl: null,
                }],
              }
            : candidate),
        }));
        updateNotice("success", copy.capturedOffline);
        await refreshSyncSummary();
        return;
      }
      const form = new FormData();
      form.set("taskId", task.taskId);
      if (task.fieldVisitId) form.set("fieldVisitId", task.fieldVisitId);
      form.set("phase", phase.code);
      form.set("idempotencyKey", idempotencyKey);
      form.set("source", "PWA_ONLINE");
      form.set("latitude", String(gps.latitude));
      form.set("longitude", String(gps.longitude));
      form.set("capturedAt", gps.capturedAt);
      form.set("file", file, file.name || "qc-evidence.jpg");
      const response = await fetch("/api/tech/qc/evidence", {
        method: "POST",
        body: form,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new PortalRequestError(getApiMessage(payload, copy.unexpectedError), response.status);
      updateNotice("success", copy.gpsCaptured);
      await refreshAfterMutation();
    } catch (requestError: unknown) {
      updateNotice("error", requestError instanceof TechOfflineStorageError
        ? copy.storageFull
        : requestError instanceof PortalRequestError
          ? requestError.message
          : getLocationError(requestError, copy));
    } finally {
      setBusyAction(null);
      setBusyPhase(null);
    }
  };

  const handleTestValueChange = (taskId: string, phaseCode: TechPortalPhaseCode, key: string, value: string) => {
    if (isReadOnly) return;
    const nextValues = {
      ...(testValuesByTask[taskId] || {}),
      [phaseCode]: {
        ...(testValuesByTask[taskId]?.[phaseCode] || {}),
        [key]: value,
      },
    };
    setTestValuesByTask((current) => ({
      ...current,
      [taskId]: nextValues,
    }));
    persistTaskDraft(taskId, preflightChecks[taskId] || createEmptyChecks(), nextValues);
  };

  const handleCompletePhase = async (task: TechDashboardTask, phase: TechPhaseState) => {
    if (isReadOnly) {
      updateNotice("info", copy.reviewOnlyHint);
      return;
    }
    if (!task.preflight) {
      updateNotice("error", copy.startRequired);
      return;
    }
    const phaseIndex = task.phases.findIndex((candidate) => candidate.code === phase.code);
    if (phaseIndex > 0 && task.phases.slice(0, phaseIndex).some((candidate) => !candidate.completed)) {
      updateNotice("error", copy.completePrevious);
      return;
    }
    const definition = getPhaseDefinition(phase.code);
    if (!definition) return;
    if (definition.evidenceRequired && !phase.evidence.some((evidence) => isEvidenceLocallyAvailable(evidence.status))) {
      updateNotice("error", copy.evidenceRequired);
      return;
    }
    const values = getPhaseValues(task, phase, testValuesByTask[task.taskId] || {});
    const missingReading = definition.requiredTestValues.some((reading) => {
      const value = values[reading.key];
      return value === undefined || value.trim() === "";
    });
    if (missingReading) {
      updateNotice("error", copy.readingRequired);
      return;
    }

    setBusyAction("qc");
    setBusyPhase(phase.code);
    setNotice(null);
    try {
      const idempotencyKey = makeIdempotencyKey("tech-qc");
      const evidenceIds = phase.evidence.filter((evidence) => evidence.status === "READY").map((evidence) => evidence.id);
      const evidenceLocalIds = phase.evidence.filter((evidence) => evidence.status === "PENDING_SYNC").map((evidence) => evidence.id);
      if (!isOnline) {
        await enqueueTechOperation({
          type: "QC_PHASE_COMPLETED",
          taskId: task.taskId,
          fieldVisitId: task.fieldVisitId,
          idempotencyKey,
          payload: {
            taskId: task.taskId,
            phase: phase.code,
            testValues: values,
            evidenceIds,
            evidenceLocalIds,
          },
        });
        const completedAt = new Date().toISOString();
        updateTaskLocally(task.taskId, (currentTask) => ({
          ...currentTask,
          phases: currentTask.phases.map((candidate) => candidate.code === phase.code
            ? { ...candidate, completed: true, completedAt, qualityInspectionId: null, testValues: values }
            : candidate),
        }));
        const nextPhase = task.phases[phaseIndex + 1];
        if (nextPhase) setSelectedPhaseByTask((current) => ({ ...current, [task.taskId]: nextPhase.code }));
        updateNotice("success", copy.capturedOffline);
        await refreshSyncSummary();
        return;
      }
      const response = await fetch("/api/tech/qc/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          taskId: task.taskId,
          fieldVisitId: task.fieldVisitId,
          phase: phase.code,
          testValues: values,
          evidenceIds,
          source: "PWA_ONLINE",
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new PortalRequestError(getApiMessage(payload, copy.unexpectedError), response.status);
      const nextPhase = task.phases[phaseIndex + 1];
      if (nextPhase) {
        setSelectedPhaseByTask((current) => ({ ...current, [task.taskId]: nextPhase.code }));
      }
      updateNotice("success", `${copy.phaseComplete}: ${getPhaseLabel(copy, phase.code, locale)}`);
      await refreshAfterMutation();
    } catch (requestError: unknown) {
      updateNotice("error", requestError instanceof PortalRequestError ? requestError.message : copy.unexpectedError);
    } finally {
      setBusyAction(null);
      setBusyPhase(null);
    }
  };

  const handleHandover = async () => {
    if (isReadOnly) {
      updateNotice("info", copy.reviewOnlyHint);
      return;
    }
    if (!activeTask || !allPhasesComplete) return;
    if (signatureRef.current?.isEmpty()) {
      updateNotice("error", copy.customerSignature);
      return;
    }
    const signatureBase64 = signatureRef.current?.getTrimmedCanvas().toDataURL("image/png");
    if (!signatureBase64) {
      updateNotice("error", copy.customerSignature);
      return;
    }

    setBusyAction("handover");
    setNotice(null);
    try {
      const gps = await captureGps();
      const idempotencyKey = makeIdempotencyKey("tech-handover");
      if (!isOnline) {
        await enqueueTechOperation({
          type: "HANDOVER_CAPTURED",
          taskId: activeTask.taskId,
          fieldVisitId: activeTask.fieldVisitId,
          idempotencyKey,
          payload: {
            taskId: activeTask.taskId,
            signatureBase64,
            gps,
            notes: handoverNotes.trim() || undefined,
          },
        });
        setPendingHandoverByTask((current) => ({ ...current, [activeTask.taskId]: true }));
        await saveTechTaskDraft({
          taskId: activeTask.taskId,
          preflightChecks: preflightChecks[activeTask.taskId] || createEmptyChecks(),
          testValues: testValuesByTask[activeTask.taskId] || {},
          handoverNotes,
        });
        updateNotice("success", copy.handoverPending);
        signatureRef.current?.clear();
        setHandoverNotes("");
        await refreshSyncSummary();
        return;
      }
      const response = await fetch("/api/tech/handover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          taskId: activeTask.taskId,
          fieldVisitId: activeTask.fieldVisitId,
          signatureBase64,
          gps,
          notes: handoverNotes.trim() || undefined,
          source: "PWA_ONLINE",
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new PortalRequestError(getApiMessage(payload, copy.unexpectedError), response.status);
      updateNotice("success", copy.handoverCompleted);
      await refreshAfterMutation();
      signatureRef.current?.clear();
      setHandoverNotes("");
    } catch (requestError: unknown) {
      updateNotice("error", requestError instanceof PortalRequestError
        ? requestError.message
        : getLocationError(requestError, copy));
    } finally {
      setBusyAction(null);
    }
  };

  const selectPhase = (task: TechDashboardTask, phase: TechPhaseState, phaseIndex: number) => {
    if (!task.preflight) {
      updateNotice("info", copy.startRequired);
      return;
    }
    if (firstIncompleteIndex >= 0 && phaseIndex > firstIncompleteIndex) {
      updateNotice("info", copy.completePrevious);
      return;
    }
    setSelectedPhaseByTask((current) => ({ ...current, [task.taskId]: phase.code }));
  };

  const handlePrimaryAction = () => {
    if (isReadOnly) return;
    if (!activeTask) return;
    if (!activeTask.preflight) {
      void handleStartJob();
      return;
    }
    if (allPhasesComplete) {
      handoverRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (firstIncompleteIndex >= 0 && activePhaseIndex !== firstIncompleteIndex) {
      const nextPhase = activeTask.phases[firstIncompleteIndex];
      if (nextPhase) setSelectedPhaseByTask((current) => ({ ...current, [activeTask.taskId]: nextPhase.code }));
      return;
    }
    if (activePhase) void handleCompletePhase(activeTask, activePhase);
  };

  const primaryActionLabel = !activeTask
    ? copy.loading
    : isReadOnly
      ? copy.reviewOnly
    : busyAction === "start"
      ? copy.starting
      : busyAction === "qc"
        ? copy.markingComplete
        : !activeTask.preflight
          ? copy.startJob
          : activeTask.handover
            ? copy.handoverDoneAction
            : allPhasesComplete
              ? copy.reviewHandover
              : activePhase && activePhase.completed
                ? copy.continuePhase
                : copy.markComplete;
  const primaryActionDisabled = !activeTask
    || isReadOnly
    || busyAction !== null
    || (!activeTask.preflight && !allChecksComplete)
    || (activeTask.preflight && !allPhasesComplete && activePhaseIndex === firstIncompleteIndex && Boolean(activePhase?.completed));

  return (
    <div className="tech-portal min-h-dvh bg-[#F0EEE9] text-[#0F172A]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0F172A] text-white">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/asset/sd-logo.png"
              alt="SolarDream"
              className="h-9 w-9 rounded-lg bg-white object-contain p-1"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold tracking-[-0.01em]">SolarDream</p>
              <p className="truncate text-[10px] font-bold tracking-[0.16em] text-[#B7D1EA]">{copy.portal}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs font-semibold text-slate-300 sm:flex" aria-live="polite">
              {isOnline ? <Wifi className="h-3.5 w-3.5 text-[#B7D1EA]" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5 text-[#F1D6B8]" aria-hidden="true" />}
              {isOnline ? copy.online : copy.offline}
            </span>
            <PwaInstallControl copy={copy} />
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-bold text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={copy.signOut}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{isSigningOut ? copy.signOutPending : copy.signOut}</span>
            </button>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={isLoading}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/15 text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={copy.refresh}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="sd-safe-pb-28-add mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6 sm:pb-32 sm:pt-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold tracking-[0.12em] text-[#475569]">{copy.fieldOperations}</p>
            <h1 className="text-[clamp(1.8rem,5vw,2.75rem)] font-extrabold leading-tight tracking-[-0.03em] text-[#0F172A]">{copy.todayRoute}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-[#475569]">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {formatDate(dashboard?.date || null, locale, copy.routeDate)}
            </p>
          </div>
          {dashboard ? <p className="hidden text-right text-xs font-semibold text-[#475569] sm:block">{tasks.length} {copy.assignedJobs}</p> : null}
        </div>

        {!isOnline || syncSummary.pending > 0 || syncSummary.pendingAuth > 0 || syncSummary.syncing > 0 || syncSummary.failed > 0 || syncSummary.conflicts > 0 || syncSummary.rejected > 0 || syncSummary.pendingServer > 0 || syncSummary.pendingErp > 0 ? (
          <div className={cn("mb-5 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm", !isOnline ? "border-[#D8A87B]/60 bg-[#F1D6B8]/55 text-[#68411f]" : syncSummary.conflicts > 0 || syncSummary.failed > 0 || syncSummary.rejected > 0 ? "border-rose-200 bg-rose-50 text-rose-900" : syncSummary.pendingAuth > 0 ? "border-[#D8A87B]/60 bg-[#F1D6B8]/55 text-[#68411f]" : "border-[#B7D1EA] bg-[#B7D1EA]/35 text-[#1e405c]")} role="status" aria-live="polite">
            {!isOnline ? <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : isSyncing ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : syncSummary.pendingAuth > 0 ? <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <p>{!isOnline ? copy.readOnlyOffline : isSyncing ? copy.syncInProgress : syncSummary.pendingAuth > 0 ? copy.accessRequiredHint : syncSummary.conflicts > 0 ? copy.syncConflict : syncSummary.rejected > 0 ? copy.syncFailed : syncSummary.failed > 0 ? copy.syncFailed : syncSummary.pendingErp > 0 ? copy.erpSyncPending : syncSummary.pendingServer > 0 ? copy.erpSyncHint : `${syncSummary.pending} ${copy.syncPending}`}</p>
              {isOnline && syncSummary.pending > 0 ? <p className="mt-1 text-xs opacity-80">{syncSummary.pending} {copy.syncPending}</p> : null}
              {isOnline && syncSummary.pendingErp > 0 ? <p className="mt-1 text-xs opacity-80">{copy.erpSyncHint}</p> : null}
            </div>
            {isOnline && !isSyncing && syncSummary.conflicts > 0 ? <button type="button" onClick={() => void handleRetryConflicts()} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#0F172A] px-3 text-xs font-extrabold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A] focus-visible:ring-offset-2"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{copy.retryConflicts}</button> : null}
            {isOnline && !isSyncing && syncSummary.conflicts === 0 && syncSummary.pendingAuth === 0 && (syncSummary.pending > 0 || syncSummary.failed > 0) ? <button type="button" onClick={() => void syncNow({ forceRetry: true })} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#0F172A] px-3 text-xs font-extrabold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A] focus-visible:ring-offset-2"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{copy.syncNow}</button> : null}
          </div>
        ) : null}

        {storageStatus?.warning !== undefined && storageStatus.warning !== "NONE" ? (
          <div
            className={cn(
              "mb-5 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
              storageStatus.warning === "FULL"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-[#D8A87B]/60 bg-[#F1D6B8]/55 text-[#68411f]",
            )}
            role="alert"
          >
            <HardDrive className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{storageStatus.warning === "FULL" ? copy.storageFull : copy.storageNearFull}</p>
          </div>
        ) : null}

        {dashboard?.readOnly ? (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-[#B7D1EA] bg-[#B7D1EA]/35 px-4 py-3 text-sm text-[#1e405c]" role="status">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-extrabold">{copy.reviewOnly}</p>
              <p className="mt-1 text-xs leading-5">{copy.reviewOnlyHint}</p>
            </div>
          </div>
        ) : null}

        {notice ? (
          <div
            className={cn(
              "mb-5 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
              notice.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
              notice.tone === "error" && "border-rose-200 bg-rose-50 text-rose-900",
              notice.tone === "info" && "border-[#B7D1EA] bg-[#B7D1EA]/35 text-[#1e405c]",
            )}
            role={notice.tone === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {notice.tone === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <p className="min-w-0 flex-1">{notice.message}</p>
            <button type="button" onClick={() => setNotice(null)} className="min-h-6 min-w-6 rounded text-current/70 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current" aria-label={copy.close}>
              <X className="mx-auto h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {isLoading && !dashboard ? <LoadingShell copy={copy} /> : null}

        {!isLoading && (authRequired || accessDenied) ? (
          <section className="rounded-xl border border-[#E2E8F0] bg-[#F5F2EB] p-6 text-center sm:p-10" aria-labelledby="tech-access-title">
            <ShieldCheck className="mx-auto h-9 w-9 text-[#0F172A]" aria-hidden="true" />
            <h2 id="tech-access-title" className="mt-4 text-xl font-extrabold tracking-[-0.02em]">{accessDenied ? copy.accessDenied : copy.accessRequired}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#475569]">{accessDenied ? copy.accessDeniedHint : copy.accessRequiredHint}</p>
            {authRequired ? (
              <a href={`/login?next=${encodeURIComponent(`/${locale}/tech-portal`)}`} className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0F172A] px-5 text-sm font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2">
                {copy.signIn}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : null}
          </section>
        ) : null}

        {!isLoading && !authRequired && !accessDenied && error && !dashboard ? (
          <section className="rounded-xl border border-rose-200 bg-[#F5F2EB] p-6 text-center sm:p-10" role="alert">
            <CircleAlert className="mx-auto h-9 w-9 text-rose-700" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-extrabold tracking-[-0.02em]">{copy.networkError}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#475569]">{error}</p>
            <button type="button" onClick={() => void loadDashboard()} className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0F172A] px-5 text-sm font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {copy.retry}
            </button>
          </section>
        ) : null}

        {!isLoading && !authRequired && dashboard && tasks.length === 0 ? (
          <section className="rounded-xl border border-[#E2E8F0] bg-[#F5F2EB] p-6 text-center sm:p-10">
            <FileText className="mx-auto h-9 w-9 text-[#475569]" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-extrabold tracking-[-0.02em]">{copy.noJobs}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#475569]">{copy.noJobsHint}</p>
          </section>
        ) : null}

        {activeTask ? (
          <div className="space-y-5">
            {tasks.length > 1 ? (
              <section aria-label={copy.assignedJobs}>
                <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-1" tabIndex={0} aria-label={copy.assignedJobs}>
                  {tasks.map((task) => {
                    const selected = task.taskId === activeTask.taskId;
                    return (
                      <button
                        key={task.taskId}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setSelectedTaskId(task.taskId);
                          setNotice(null);
                          setHandoverNotes("");
                          signatureRef.current?.clear();
                        }}
                        className={cn(
                          "flex min-h-14 min-w-[190px] items-center gap-3 rounded-lg border px-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A] focus-visible:ring-offset-2",
                          selected ? "border-[#0F172A] bg-[#0F172A] text-white" : "border-[#E2E8F0] bg-[#F5F2EB] text-[#0F172A] hover:border-slate-300",
                        )}
                      >
                        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold", selected ? "bg-[#B7D1EA] text-[#0F172A]" : "bg-[#B7D1EA]/55 text-[#0F172A]")}>{tasks.indexOf(task) + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-extrabold">{task.customer.name}</span>
                          <span className={cn("mt-0.5 block truncate text-[11px] font-semibold", selected ? "text-slate-300" : "text-[#475569]")}>{task.projectCode}</span>
                        </span>
                        {selected ? <Check className="h-4 w-4 shrink-0 text-[#B7D1EA]" aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <article className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#F5F2EB]" aria-labelledby="active-task-title">
              <div className="bg-[#0F172A] px-5 py-5 text-white sm:px-6 sm:py-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-bold tracking-[0.12em] text-[#B7D1EA]">{activeTask.projectCode} · {activeTask.taskCode}</p>
                  <StatusChip tone={statusTone(activeTask)}>
                    {activeTask.handover ? copy.completed : activeTask.preflight ? copy.started : copy.readyToStart}
                  </StatusChip>
                </div>
                <h2 id="active-task-title" className="mt-4 max-w-3xl text-[clamp(1.35rem,4vw,2rem)] font-extrabold leading-tight tracking-[-0.025em]">{activeTask.title}</h2>
                <div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#B7D1EA]" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400">{copy.customerSite}</p>
                      <p className="mt-1 leading-6 text-white">{activeTask.customer.name}</p>
                      <p className="leading-6">{activeTask.customer.address}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#B7D1EA]" aria-hidden="true" />
                    <div>
                      <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400">{copy.status}</p>
                      <p className="mt-1 leading-6 text-white">{activeTask.scheduledDate ? formatDateTime(activeTask.scheduledDate, locale) : copy.todayRoute}</p>
                      <p className="leading-6 text-slate-400">{activeTask.phases.filter((phase) => phase.completed).length} / {activeTask.phases.length} {copy.phase.toLowerCase()}</p>
                    </div>
                  </div>
                </div>
                <WorkflowStageRail
                  phases={activeTask.phases}
                  preflight={activeTask.preflight}
                  activePhaseIndex={activePhaseIndex}
                  firstIncompleteIndex={firstIncompleteIndex}
                  copy={copy}
                  locale={locale}
                />
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-xs text-slate-300">
                  <span className="inline-flex items-center gap-2">
                    <FileCheck2 className="h-4 w-4 text-[#B7D1EA]" aria-hidden="true" />
                    <span className="font-bold text-white">{copy.permit}</span>
                    <StatusChip tone={(activeTask.permit?.status || "NOT_STARTED") === "APPROVED" ? "success" : (activeTask.permit?.status || "NOT_STARTED") === "SUBMITTED" ? "info" : "warning"}>
                      {getPermitLabel(copy, activeTask.permit?.status || "NOT_STARTED")}
                    </StatusChip>
                  </span>
                  {activeTask.permit?.authority ? <span><span className="font-bold text-slate-400">{copy.permitAuthority}:</span> {activeTask.permit.authority}</span> : null}
                  {activeTask.permit?.applicationNumber ? <span><span className="font-bold text-slate-400">{copy.applicationNumber}:</span> {activeTask.permit.applicationNumber}</span> : null}
                </div>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <a
                    href={activeTask.customer.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeTask.customer.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[#B7D1EA] px-4 text-sm font-extrabold text-[#0F172A] transition hover:bg-[#99BFE3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A]"
                  >
                    <Navigation className="h-4 w-4" aria-hidden="true" />
                    {copy.navigate}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                  {activeTask.customer.phone ? (
                    <a href={`tel:${activeTask.customer.phone}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/20 px-4 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]">
                      <Phone className="h-4 w-4 text-[#B7D1EA]" aria-hidden="true" />
                      {copy.callCustomer}
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-3 border-t border-[#E2E8F0] px-5 py-4 text-xs text-[#475569] sm:grid-cols-3 sm:px-6">
                <p><span className="font-bold text-[#0F172A]">{copy.project}:</span> {activeTask.projectCode}</p>
                <p><span className="font-bold text-[#0F172A]">{copy.task}:</span> {activeTask.taskCode}</p>
                <p><span className="font-bold text-[#0F172A]">{copy.phase}:</span> {activeTask.phases.filter((phase) => phase.completed).length} / {activeTask.phases.length}</p>
              </div>
            </article>

            <div
              className={cn(
                "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
                activeTask.erpnextSync.taskStatus === "FAILED" || activeTask.erpnextSync.projectStatus === "FAILED"
                  ? "border-rose-200 bg-rose-50 text-rose-900"
                  : activeTask.erpnextSync.taskStatus === "SYNCED" && activeTask.erpnextSync.projectStatus === "SYNCED"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-[#B7D1EA] bg-[#B7D1EA]/35 text-[#1e405c]",
              )}
              role="status"
              aria-live="polite"
            >
              {activeTask.erpnextSync.taskStatus === "SYNCED" && activeTask.erpnextSync.projectStatus === "SYNCED"
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                : activeTask.erpnextSync.taskStatus === "FAILED" || activeTask.erpnextSync.projectStatus === "FAILED"
                  ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  : <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              <div className="min-w-0">
                <p className="font-extrabold">{copy.erpSync}: {getErpSyncLabel(copy, activeTask.erpnextSync.taskStatus)}</p>
                <p className="mt-1 text-xs leading-5 opacity-85">{activeTask.erpnextSync.error || copy.erpSyncHint}</p>
              </div>
            </div>

            <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#F5F2EB]" aria-labelledby="preflight-title">
              <SectionHeader
                icon={<HardHat className="h-5 w-5" aria-hidden="true" />}
                id="preflight-title"
                title={copy.preflightTitle}
                description={copy.preflightHint}
                action={<StatusChip tone={activeTask.preflight ? "success" : "warning"}>{activeTask.preflight ? copy.preflightComplete : copy.required}</StatusChip>}
              />
              <div className="px-5 py-5 sm:px-6 sm:py-6">
                {activeTask.preflight ? (
                  <div className="flex flex-col gap-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-extrabold text-emerald-950">{copy.preflightComplete}</p>
                        <p className="mt-1 text-xs leading-5 text-emerald-800">{formatDateTime(activeTask.preflight.startedAt, locale)} · {activeTask.preflight.version}</p>
                      </div>
                    </div>
                    <p className="text-xs font-bold text-emerald-800">{copy.gpsCaptured}</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-4 flex items-center justify-between gap-3 text-xs font-bold text-[#475569]">
                      <span>{completedCheckCount} / {TECH_PRE_FLIGHT_CHECKS.length} {copy.checksComplete}</span>
                      <span>{TECH_PRE_FLIGHT_VERSION}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {TECH_PRE_FLIGHT_CHECKS.map((check) => (
                        <label
                          key={check.key}
                          className={cn(
                            "flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-4 transition focus-within:ring-2 focus-within:ring-[#0F172A] focus-within:ring-offset-2",
                            activeChecks[check.key] ? "border-emerald-300 bg-emerald-50" : "border-[#E2E8F0] bg-white/60 hover:border-slate-300",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={activeChecks[check.key]}
                            onChange={(event) => handlePreflightCheckChange(activeTask.taskId, check.key, event.target.checked)}
                            disabled={isReadOnly}
                            className="h-5 w-5 shrink-0 accent-[#0F172A]"
                          />
                          <span className={cn("text-sm font-semibold leading-5", activeChecks[check.key] ? "text-emerald-950" : "text-[#0F172A]")}>{check.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-5 flex flex-col gap-3 border-t border-[#E2E8F0] pt-5 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-[#475569]">{copy.locationRequired}</p>
                      <button
                        type="button"
                        onClick={() => void handleStartJob()}
                        disabled={!allChecksComplete || busyAction !== null || isReadOnly}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0F172A] px-5 text-sm font-extrabold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busyAction === "start" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                        {busyAction === "start" ? copy.starting : copy.startJob}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#F5F2EB]" aria-labelledby="execution-title">
              <SectionHeader
                icon={<FileCheck2 className="h-5 w-5" aria-hidden="true" />}
                id="execution-title"
                title={copy.executionTitle}
                description={copy.executionHint}
                action={<span className="text-xs font-bold text-[#475569]">{activeTask.phases.filter((phase) => phase.completed).length} / {activeTask.phases.length}</span>}
              />
              <div className="px-5 py-5 sm:px-6 sm:py-6">
                <div className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="list" tabIndex={0} aria-label={copy.executionTitle}>
                  {activeTask.phases.map((phase, index) => {
                    const isSelected = phase.code === activePhase?.code;
                    const locked = !activeTask.preflight || (firstIncompleteIndex >= 0 && index > firstIncompleteIndex);
                    return (
                      <div key={phase.code} className="shrink-0" role="listitem">
                        <button
                        key={phase.code}
                        type="button"
                        aria-current={isSelected ? "step" : undefined}
                        disabled={locked}
                        onClick={() => selectPhase(activeTask, phase, index)}
                        className={cn(
                          "flex min-h-16 min-w-[148px] items-center gap-3 rounded-lg border px-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                          isSelected ? "border-[#0F172A] bg-[#0F172A] text-white" : phase.completed ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-[#E2E8F0] bg-white/60 text-[#0F172A] hover:border-slate-300",
                        )}
                      >
                        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold", isSelected ? "bg-[#B7D1EA] text-[#0F172A]" : phase.completed ? "bg-emerald-600 text-white" : "bg-slate-200 text-[#475569]")}>{phase.completed ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}</span>
                        <span className="min-w-0">
                          <span className={cn("block text-[10px] font-bold tracking-[0.1em]", isSelected ? "text-slate-300" : "text-[#475569]")}>{copy.phase} {index + 1}</span>
                          <span className="mt-0.5 block truncate text-sm font-extrabold">{getPhaseLabel(copy, phase.code, locale)}</span>
                        </span>
                        {locked ? <LockKeyhole className="ml-auto h-4 w-4 shrink-0" aria-label={copy.phaseLocked} /> : null}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {activePhase ? (
                  <div className="mt-5 rounded-lg border border-[#E2E8F0] bg-white/65">
                    <div className="flex flex-col gap-3 border-b border-[#E2E8F0] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                      <div>
                        <p className="text-xs font-bold tracking-[0.1em] text-[#475569]">{copy.phase} {activePhaseIndex + 1}</p>
                        <h3 className="mt-1 text-lg font-extrabold tracking-[-0.02em] text-[#0F172A]">{getPhaseLabel(copy, activePhase.code, locale)}</h3>
                      </div>
                      <StatusChip tone={activePhase.completed ? "success" : activePhaseLocked ? "neutral" : "warning"}>
                        {activePhase.completed ? copy.phaseComplete : activePhaseLocked ? copy.phaseLocked : copy.phaseReady}
                      </StatusChip>
                    </div>

                    <div className="space-y-6 px-4 py-5 sm:px-5">
                      {activePhaseLocked ? (
                        <div className="flex items-start gap-3 rounded-lg border border-[#E2E8F0] bg-[#F0EEE9] px-4 py-4 text-sm text-[#475569]">
                          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          <p>{!activeTask.preflight ? copy.startRequired : copy.completePrevious}</p>
                        </div>
                      ) : null}

                      <div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h4 className="text-sm font-extrabold text-[#0F172A]">{copy.evidence}</h4>
                            <p className="mt-1 max-w-2xl text-xs leading-5 text-[#475569]">{copy.evidenceHint}</p>
                          </div>
                          <span className="text-xs font-bold text-[#475569]">{activePhase.evidence.filter((evidence) => isEvidenceLocallyAvailable(evidence.status)).length} {copy.uploadPhoto.toLowerCase()}</span>
                        </div>
                        <div className="mt-4 flex flex-col gap-3">
                          <label
                            htmlFor={`evidence-${activeTask.taskId}-${activePhase.code}`}
                            className={cn(
                              "flex min-h-20 cursor-pointer items-center gap-4 rounded-lg border border-[#B7D1EA] bg-[#B7D1EA]/25 px-4 transition hover:bg-[#B7D1EA]/40 focus-within:outline-none focus-within:ring-2 focus-within:ring-[#0F172A] focus-within:ring-offset-2",
                              (isReadOnly || activePhaseLocked || activePhase.completed || busyAction !== null) && "cursor-not-allowed opacity-50",
                            )}
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0F172A] text-[#B7D1EA]">
                              {busyAction === "evidence" && busyPhase === activePhase.code ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Camera className="h-5 w-5" aria-hidden="true" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-extrabold text-[#0F172A]">{busyAction === "evidence" && busyPhase === activePhase.code ? copy.uploading : copy.capturePhoto}</span>
                              <span className="mt-1 block text-xs text-[#475569]">{copy.uploadPhoto} · JPG, PNG, WEBP · max 10 MB</span>
                            </span>
                            <Upload className="h-5 w-5 shrink-0 text-[#0F172A]" aria-hidden="true" />
                            <input
                              id={`evidence-${activeTask.taskId}-${activePhase.code}`}
                              type="file"
                              accept="image/*"
                              capture="environment"
                              disabled={isReadOnly || activePhaseLocked || activePhase.completed || busyAction !== null}
                              onChange={(event) => void handleEvidenceSelected(event, activeTask, activePhase)}
                              className="sr-only"
                            />
                          </label>
                          {activePhase.evidence.length > 0 ? (
                            <ul className="grid gap-2 sm:grid-cols-2" aria-label={copy.evidence}>
                              {activePhase.evidence.map((evidence) => (
                                <li key={evidence.id} className="flex items-center gap-3 rounded-lg border border-[#E2E8F0] bg-[#F5F2EB] p-3">
                                  {evidence.fileUrl ? <img src={getEvidenceThumbnailUrl(evidence.fileUrl)} alt={`${copy.evidence} ${formatDateTime(evidence.capturedAt, locale)}`} className="h-12 w-12 shrink-0 rounded-md object-cover" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#B7D1EA]/40 text-[#0F172A]"><Camera className="h-5 w-5" aria-hidden="true" /></span>}
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-extrabold text-[#0F172A]">{evidence.status === "READY" ? copy.phaseReady : evidence.status}</span>
                                    <span className="mt-1 block truncate text-[11px] text-[#475569]">{copy.capturedAt} {formatDateTime(evidence.capturedAt, locale)}</span>
                                  </span>
                                  {evidence.fileUrl ? <a href={evidence.fileUrl} aria-label={copy.viewPhoto} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md px-2 text-xs font-bold text-[#1e405c] hover:bg-[#B7D1EA]/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]"><ExternalLink className="h-4 w-4" aria-hidden="true" /></a> : null}
                                </li>
                              ))}
                            </ul>
                          ) : <p className="text-xs text-[#475569]">{copy.noEvidence}</p>}
                        </div>
                      </div>

                      {activePhaseDefinition?.requiredTestValues.length ? (
                        <div className="border-t border-[#E2E8F0] pt-5">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <h4 className="text-sm font-extrabold text-[#0F172A]">{copy.testReadings}</h4>
                              <p className="mt-1 text-xs leading-5 text-[#475569]">{copy.requiredReading}</p>
                            </div>
                            <span className="text-xs text-[#475569]">{copy.range}</span>
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {activePhaseDefinition.requiredTestValues.map((reading) => (
                              <TestReadingInput
                                key={reading.key}
                                definition={reading}
                                value={activePhaseValues[reading.key] || ""}
                                disabled={isReadOnly || activePhaseLocked || activePhase.completed || busyAction !== null}
                                onChange={(value) => handleTestValueChange(activeTask.taskId, activePhase.code, reading.key, value)}
                                copy={copy}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="flex flex-col gap-3 border-t border-[#E2E8F0] pt-5 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs leading-5 text-[#475569]">
                          {activePhase.completed ? `${copy.phaseComplete} · ${formatDateTime(activePhase.completedAt, locale)}` : activePhaseLocked ? copy.phaseLocked : `${copy.evidence} + ${copy.testReadings}`}
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleCompletePhase(activeTask, activePhase)}
                          disabled={isReadOnly || activePhaseLocked || activePhase.completed || busyAction !== null}
                          className="hidden min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0F172A] px-5 text-sm font-extrabold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 sm:inline-flex"
                        >
                          {busyAction === "qc" && busyPhase === activePhase.code ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                          {busyAction === "qc" && busyPhase === activePhase.code ? copy.markingComplete : copy.markComplete}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {assetCaptureEnabled && activeTask.preflight && activeTask.status === "IN_PROGRESS" ? (
              <TechnicianAssetCapture
                task={activeTask}
                isOnline={isOnline}
                isReadOnly={isReadOnly}
                copy={copy}
              />
            ) : null}

            {allPhasesComplete ? (
              <section ref={handoverRef} className="scroll-mt-24 overflow-hidden rounded-xl border border-[#0F172A] bg-[#F5F2EB]" aria-labelledby="handover-title">
                <SectionHeader
                  icon={<FileCheck2 className="h-5 w-5" aria-hidden="true" />}
                  id="handover-title"
                  title={copy.handoverTitle}
                  description={copy.handoverHint}
                  action={<StatusChip tone={activeTask.handover ? "success" : "info"}>{activeTask.handover ? copy.handoverCompleted : copy.handoverReady}</StatusChip>}
                />
                <div className="space-y-6 px-5 py-5 sm:px-6 sm:py-6">
                  {pendingHandoverByTask[activeTask.taskId] ? <div className="flex items-start gap-3 rounded-lg border border-[#B7D1EA] bg-[#B7D1EA]/35 px-4 py-4 text-sm text-[#1e405c]" role="status"><CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>{copy.handoverPending}</p></div> : null}
                  {activeTask.handover ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                        <div className="min-w-0">
                          <h3 className="text-base font-extrabold text-emerald-950">{copy.handoverCompleted}</h3>
                          <p className="mt-1 text-sm text-emerald-800">{formatDateTime(activeTask.handover.completedAt, locale)}</p>
                          {activeTask.handover.pdfUrl ? <a href={activeTask.handover.pdfUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-extrabold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"><FileText className="h-4 w-4" aria-hidden="true" />{copy.downloadCertificate}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a> : null}
                          {activeTask.handover.sha256 ? <p className="mt-4 break-all text-[11px] font-semibold text-emerald-800"><span className="font-extrabold">{copy.certificateHash}:</span> {activeTask.handover.sha256}</p> : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-lg border border-[#E2E8F0] bg-white/65 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-extrabold text-[#0F172A]">{copy.summary}</h3>
                          <span className="text-xs font-bold text-emerald-700">{copy.allPhasesComplete}</span>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3" role="list" aria-label={copy.summary}>
                          {activeTask.phases.map((phase) => (
                            <div key={phase.code} className="rounded-lg bg-[#F0EEE9] px-3 py-3" role="listitem">
                              <p className="text-xs font-bold text-[#475569]">{getPhaseLabel(copy, phase.code, locale)}</p>
                              <p className="mt-1 text-sm font-extrabold text-[#0F172A]">{formatDateTime(phase.completedAt, locale)}</p>
                              {Object.entries(phase.testValues).map(([key, value]) => <p key={key} className="mt-1 text-xs text-[#475569]">{key}: {String(value)}</p>)}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h3 className="text-sm font-extrabold text-[#0F172A]">{copy.evidence}</h3>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {activeTask.phases.flatMap((phase) => phase.evidence.filter((evidence) => evidence.fileUrl).slice(0, 2).map((evidence) => ({ ...evidence, phase: phase.code }))).map((evidence) => (
                            <a key={evidence.id} href={evidence.fileUrl || "#"} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-lg border border-[#E2E8F0] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A] focus-visible:ring-offset-2">
                              <img src={evidence.fileUrl ? getEvidenceThumbnailUrl(evidence.fileUrl) : ""} alt={`${getPhaseLabel(copy, evidence.phase, locale)} ${copy.evidence}`} className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" />
                              <span className="block truncate px-2 py-2 text-[11px] font-bold text-[#475569]">{getPhaseLabel(copy, evidence.phase, locale)}</span>
                            </a>
                          ))}
                        </div>
                      </div>

                      <div className={cn("border-t border-[#E2E8F0] pt-5", isReadOnly && "pointer-events-none opacity-60")}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="text-sm font-extrabold text-[#0F172A]">{copy.customerSignature}</h3>
                            <p className="mt-1 text-xs leading-5 text-[#475569]">{copy.signatureHint}</p>
                          </div>
                          <button type="button" onClick={() => signatureRef.current?.clear()} disabled={isReadOnly} className="inline-flex min-h-9 items-center gap-2 self-start rounded-md px-2 text-xs font-bold text-[#475569] hover:bg-[#F0EEE9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A] disabled:cursor-not-allowed"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{copy.clearSignature}</button>
                        </div>
                        <div className="mt-3 overflow-hidden rounded-lg border border-[#94A3B8] bg-white">
                          <SignatureCanvas
                            ref={signatureRef}
                            penColor="#0F172A"
                            backgroundColor="#FFFFFF"
                            canvasProps={{ className: "h-48 w-full touch-none", "aria-label": copy.customerSignature }}
                          />
                        </div>
                      </div>

                      <label className="block">
                        <span className="flex items-center justify-between gap-3 text-sm font-extrabold text-[#0F172A]">
                          <span>{copy.notes}</span>
                          <span className="text-xs font-semibold text-[#475569]">{copy.optional}</span>
                        </span>
                        <textarea
                          value={handoverNotes}
                          onChange={(event) => {
                            const value = event.target.value;
                            setHandoverNotes(value);
                            persistTaskDraft(activeTask.taskId, preflightChecks[activeTask.taskId] || createEmptyChecks(), testValuesByTask[activeTask.taskId] || {}, value);
                          }}
                          disabled={isReadOnly}
                          rows={3}
                          maxLength={4000}
                          className="mt-2 block w-full resize-y rounded-lg border border-[#CBD5E1] bg-white px-3 py-3 text-sm text-[#0F172A] outline-none placeholder:text-[#64748B] focus:border-[#0F172A] focus:ring-2 focus:ring-[#B7D1EA] disabled:cursor-not-allowed disabled:bg-[#F0EEE9]"
                          placeholder={copy.notes}
                        />
                      </label>

                      <div className="flex flex-col gap-3 border-t border-[#E2E8F0] pt-5 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs leading-5 text-[#475569]">{copy.certificate} · UTC, IP, GPS, evidence hashes</p>
                        <button type="button" onClick={() => void handleHandover()} disabled={isReadOnly || busyAction !== null || Boolean(pendingHandoverByTask[activeTask.taskId])} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0F172A] px-5 text-sm font-extrabold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40">
                          {busyAction === "handover" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                          {busyAction === "handover" ? copy.finalizing : copy.completeHandover}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </main>

      {activeTask ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#CBD5E1] bg-[#F5F2EB]/95 shadow-[0_-4px_12px_rgba(15,23,42,0.08)] backdrop-blur-sm" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-[#475569]">{activeTask.handover ? copy.handoverCompleted : !activeTask.preflight ? copy.preflightTitle : allPhasesComplete ? copy.allPhasesComplete : `${copy.phase} ${activePhaseIndex + 1} / ${activeTask.phases.length}`}</p>
              <p className="truncate text-sm font-extrabold text-[#0F172A]">{primaryActionLabel}</p>
            </div>
            {!isReadOnly ? (
              <button type="button" onClick={handlePrimaryAction} disabled={primaryActionDisabled || Boolean(activeTask.handover)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#0F172A] px-4 text-sm font-extrabold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5">
                {busyAction === "start" || busyAction === "qc" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : allPhasesComplete ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                <span className="hidden sm:inline">{primaryActionLabel}</span>
                <span className="sm:hidden">{activeTask.handover ? copy.completed : allPhasesComplete ? copy.reviewHandover : copy.continuePhase}</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function PwaInstallControl({ copy }: { copy: Copy }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const updateDisplayMode = () => setIsStandalone(media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };
    updateDisplayMode();
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    media.addEventListener("change", updateDisplayMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      media.removeEventListener("change", updateDisplayMode);
    };
  }, []);

  if (isStandalone) return null;

  const handleInstall = async () => {
    if (!installPrompt) {
      setShowHelp((current) => !current);
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void handleInstall()}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-extrabold text-slate-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
        aria-haspopup="dialog"
        aria-expanded={showHelp}
        aria-label={copy.installApp}
      >
        <Download className="h-3.5 w-3.5 text-[#B7D1EA]" aria-hidden="true" />
        <span className="hidden sm:inline">{copy.installApp}</span>
      </button>
      {showHelp ? (
        <div role="dialog" aria-label={copy.installApp} className="absolute right-0 top-12 z-50 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-[#CBD5E1] bg-[#F5F2EB] p-4 text-left text-[#0F172A] shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-extrabold">{copy.installApp}</p>
            <button type="button" onClick={() => setShowHelp(false)} className="min-h-7 min-w-7 rounded-md text-[#475569] hover:bg-[#F0EEE9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]" aria-label={copy.close}><X className="mx-auto h-4 w-4" aria-hidden="true" /></button>
          </div>
          <p className="mt-2 text-xs leading-5 text-[#475569]">{copy.installHint}</p>
          <p className="mt-3 text-xs font-semibold leading-5 text-[#0F172A]">{copy.installAndroid}</p>
          <p className="mt-2 text-xs font-semibold leading-5 text-[#0F172A]">{copy.installIos}</p>
        </div>
      ) : null}
    </div>
  );
}

function TestReadingInput({
  definition,
  value,
  disabled,
  onChange,
  copy,
}: {
  definition: TechTestValueDefinition;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  copy: Copy;
}) {
  const isText = definition.valueType === "text";
  return (
    <label className="block">
      <span className="text-sm font-bold text-[#0F172A]">{definition.label}</span>
      <span className="mt-1 flex min-h-12 overflow-hidden rounded-lg border border-[#CBD5E1] bg-white focus-within:border-[#0F172A] focus-within:ring-2 focus-within:ring-[#B7D1EA]">
        <input
          type={isText ? "text" : "number"}
          inputMode={isText ? "text" : "decimal"}
          min={isText ? undefined : definition.min}
          max={isText ? undefined : definition.max}
          maxLength={isText ? definition.max : undefined}
          step={isText ? undefined : "any"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-label={`${definition.label} (${definition.unit})`}
          className="min-w-0 flex-1 bg-transparent px-3 text-base font-bold text-[#0F172A] outline-none disabled:cursor-not-allowed disabled:bg-[#F0EEE9]"
        />
        {definition.unit ? <span className="flex items-center border-l border-[#E2E8F0] bg-[#F0EEE9] px-3 text-sm font-extrabold text-[#475569]">{definition.unit}</span> : null}
      </span>
      <span className="mt-1 block text-[11px] text-[#475569]">
        {copy.range}: {isText ? `${definition.min}-${definition.max} characters` : `${definition.min}-${definition.max} ${definition.unit}`}
      </span>
    </label>
  );
}
