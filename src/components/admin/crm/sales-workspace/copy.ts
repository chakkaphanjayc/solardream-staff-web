export type SalesWorkspaceCopy = {
  backToCrm: string;
  caseLabel: string;
  statusLabel: string;
  primaryAction: string;
  metrics: {
    quotationPrice: string;
    systemSize: string;
    panelQuantity: string;
    estimatedSaving: string;
  };
  tabs: Record<"overview" | "boq" | "quotation" | "documents" | "payment" | "handoff" | "activity", string>;
  stages: Record<"lead" | "design" | "quote" | "sign" | "payment" | "handoff" | "installation", string>;
  overview: string;
  nextAction: string;
  currentStage: string;
  commercialSnapshot: string;
  internalOnly: string;
  internalCost: string;
  recommendedPrice: string;
  agreedPrice: string;
  margin: string;
  marginPercent: string;
  customer: string;
  erpNext: string;
  activity: string;
  handoffReadiness: string;
  readyForOperations: string;
  notReadyForOperations: string;
  noActivity: string;
  noDocuments: string;
  openTab: string;
  openErpNext: string;
  sync: string;
  createCustomer: string;
  connected: string;
  syncing: string;
  notConnected: string;
  error: string;
  lastSynced: string;
  missing: string;
  completed: string;
  inProgress: string;
  upcoming: string;
  caseClosed: string;
  installationIncluded: string;
  supplyOnly: string;
};

const english: SalesWorkspaceCopy = {
  backToCrm: "Back to CRM",
  caseLabel: "Sales case",
  statusLabel: "Current status",
  primaryAction: "Primary action",
  metrics: {
    quotationPrice: "Quotation price",
    systemSize: "System size",
    panelQuantity: "Panel quantity",
    estimatedSaving: "Estimated saving",
  },
  tabs: {
    overview: "Overview",
    boq: "BOQ",
    quotation: "Quotation",
    documents: "Documents",
    payment: "Payment",
    handoff: "Handoff",
    activity: "Activity",
  },
  stages: {
    lead: "Lead",
    design: "Design",
    quote: "Quote",
    sign: "Sign",
    payment: "Payment",
    handoff: "Handoff",
    installation: "Installation",
  },
  overview: "Case overview",
  nextAction: "Next action",
  currentStage: "Current stage",
  commercialSnapshot: "Commercial snapshot",
  internalOnly: "Internal only",
  internalCost: "Internal cost",
  recommendedPrice: "Recommended price",
  agreedPrice: "Agreed selling price",
  margin: "Margin",
  marginPercent: "Margin %",
  customer: "Customer",
  erpNext: "ERPNext",
  activity: "Activity",
  handoffReadiness: "Handoff readiness",
  readyForOperations: "Ready for operations",
  notReadyForOperations: "Not ready for operations",
  noActivity: "No activity has been recorded for this case yet.",
  noDocuments: "No customer documents have been requested or uploaded yet.",
  openTab: "Open tab",
  openErpNext: "Open in ERPNext",
  sync: "Sync",
  createCustomer: "Create ERPNext customer",
  connected: "Connected",
  syncing: "Syncing",
  notConnected: "Not connected",
  error: "Error",
  lastSynced: "Last synchronized",
  missing: "Missing",
  completed: "Completed",
  inProgress: "In progress",
  upcoming: "Upcoming",
  caseClosed: "Case closed",
  installationIncluded: "Installation included",
  supplyOnly: "Supply only",
};

const thai: SalesWorkspaceCopy = {
  ...english,
  backToCrm: "กลับไป CRM",
  caseLabel: "เคสการขาย",
  statusLabel: "สถานะปัจจุบัน",
  primaryAction: "การดำเนินการหลัก",
  metrics: {
    quotationPrice: "ราคาขาย",
    systemSize: "ขนาดระบบ",
    panelQuantity: "จำนวนแผง",
    estimatedSaving: "ประหยัดโดยประมาณ",
  },
  tabs: {
    overview: "ภาพรวม",
    boq: "BOQ",
    quotation: "ใบเสนอราคา",
    documents: "เอกสาร",
    payment: "การชำระเงิน",
    handoff: "ส่งต่องาน",
    activity: "กิจกรรม",
  },
  stages: {
    lead: "ลีด",
    design: "ออกแบบ",
    quote: "เสนอราคา",
    sign: "ลงนาม",
    payment: "ชำระเงิน",
    handoff: "ส่งต่องาน",
    installation: "ติดตั้ง",
  },
  overview: "ภาพรวมเคส",
  nextAction: "ขั้นตอนถัดไป",
  currentStage: "ขั้นตอนปัจจุบัน",
  commercialSnapshot: "สรุปเชิงพาณิชย์",
  internalOnly: "สำหรับทีมภายใน",
  internalCost: "ต้นทุนภายใน",
  recommendedPrice: "ราคาที่แนะนำ",
  agreedPrice: "ราคาขายที่ตกลง",
  margin: "กำไรขั้นต้น",
  marginPercent: "กำไร %",
  customer: "ลูกค้า",
  erpNext: "ERPNext",
  activity: "กิจกรรม",
  handoffReadiness: "ความพร้อมส่งต่องาน",
  readyForOperations: "พร้อมสำหรับฝ่ายปฏิบัติการ",
  notReadyForOperations: "ยังไม่พร้อมส่งต่องาน",
  noActivity: "ยังไม่มีกิจกรรมของเคสนี้",
  noDocuments: "ยังไม่มีการร้องขอหรืออัปโหลดเอกสารลูกค้า",
  openTab: "เปิดแท็บ",
  openErpNext: "เปิดใน ERPNext",
  sync: "ซิงก์",
  createCustomer: "สร้างลูกค้าใน ERPNext",
  connected: "เชื่อมต่อแล้ว",
  syncing: "กำลังซิงก์",
  notConnected: "ยังไม่เชื่อมต่อ",
  error: "ผิดพลาด",
  lastSynced: "ซิงก์ล่าสุด",
  missing: "ยังขาด",
  completed: "เสร็จแล้ว",
  inProgress: "กำลังดำเนินการ",
  upcoming: "ถัดไป",
  caseClosed: "ปิดเคสแล้ว",
  installationIncluded: "รวมบริการติดตั้ง",
  supplyOnly: "ซื้อสินค้าอย่างเดียว",
};

export function getSalesWorkspaceCopy(locale: string): SalesWorkspaceCopy {
  return locale.toLowerCase().startsWith("th") ? thai : english;
}

