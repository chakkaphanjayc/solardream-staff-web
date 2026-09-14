/**
 * Canonical field execution stages. Keep this list shared by the technician
 * portal, server validation, ERPNext projection, and customer progress views.
 */
export const INSTALLATION_STAGE_CODES = [
  "RAIL_MOUNTING",
  "PV_DC_WIRING",
  "PANEL_PLACEMENT",
  "INVERTER_WIRING",
  "SYSTEM_TIE_IN",
  "COMMISSIONING_TEST",
  "PERMIT_APPLICATION",
] as const;

export type InstallationStageCode = (typeof INSTALLATION_STAGE_CODES)[number];

/** Historical phase codes remain accepted for already-running version 1 jobs. */
export const LEGACY_TECH_PORTAL_PHASE_CODES = [
  "STRUCTURAL",
  "DC_WIRING",
  "AC_INVERTER",
  "COMMISSIONING",
] as const;

export const TECH_PORTAL_PHASE_CODES = [
  ...INSTALLATION_STAGE_CODES,
  ...LEGACY_TECH_PORTAL_PHASE_CODES,
] as const;

export type TechPortalPhaseCode = (typeof TECH_PORTAL_PHASE_CODES)[number];

export type TechOperationSource = "PWA_ONLINE" | "PWA_OFFLINE";

export type TechTestValueDefinition = {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  valueType?: "number" | "text";
};

export type TechPortalPhaseDefinition = {
  code: TechPortalPhaseCode;
  title: string;
  titleTh: string;
  itemCode: string;
  aliases: readonly string[];
  sequence: number;
  evidenceRequired: boolean;
  requiredTestValues: readonly TechTestValueDefinition[];
};

export const INSTALLATION_FIELD_STAGES: readonly TechPortalPhaseDefinition[] = [
  {
    code: "RAIL_MOUNTING",
    title: "Rail mounting",
    titleTh: "\u0e15\u0e34\u0e14\u0e23\u0e32\u0e07",
    itemCode: "TECH_RAIL_MOUNTING",
    aliases: ["STRUCTURAL", "ROOF_MOUNTING", "TECH_STRUCTURAL"],
    sequence: 1,
    evidenceRequired: true,
    requiredTestValues: [],
  },
  {
    code: "PV_DC_WIRING",
    title: "PV / DC wiring",
    titleTh: "\u0e40\u0e14\u0e34\u0e19\u0e2a\u0e32\u0e22",
    itemCode: "TECH_PV_DC_WIRING",
    aliases: ["DC_WIRING", "COMBINER_BOX", "TECH_DC_WIRING"],
    sequence: 2,
    evidenceRequired: true,
    requiredTestValues: [
      {
        key: "dcOpenCircuitVoltage",
        label: "DC open-circuit voltage",
        unit: "V",
        min: 0,
        max: 2_000,
      },
    ],
  },
  {
    code: "PANEL_PLACEMENT",
    title: "Panel placement",
    titleTh: "\u0e27\u0e32\u0e07\u0e41\u0e1c\u0e07",
    itemCode: "TECH_PANEL_PLACEMENT",
    aliases: ["ARRAY_INSTALLED", "PANEL_INSTALLATION"],
    sequence: 3,
    evidenceRequired: true,
    requiredTestValues: [],
  },
  {
    code: "INVERTER_WIRING",
    title: "Wiring to inverter",
    titleTh: "\u0e40\u0e14\u0e34\u0e19\u0e2a\u0e32\u0e22\u0e2b\u0e32 INVERTER",
    itemCode: "TECH_INVERTER_WIRING",
    aliases: ["AC_INVERTER", "INVERTER_WIRING", "TECH_AC_INVERTER"],
    sequence: 4,
    evidenceRequired: true,
    requiredTestValues: [
      {
        key: "acVoltage",
        label: "AC voltage",
        unit: "V",
        min: 0,
        max: 500,
      },
    ],
  },
  {
    code: "SYSTEM_TIE_IN",
    title: "AC tie-in / grid connection",
    titleTh: "\u0e08\u0e31\u0e21\u0e1b\u0e4c\u0e40\u0e02\u0e49\u0e32\u0e23\u0e30\u0e1a\u0e1a",
    itemCode: "TECH_SYSTEM_TIE_IN",
    aliases: ["GRID_INTERCONNECTION", "SYSTEM_CONNECTION"],
    sequence: 5,
    evidenceRequired: true,
    requiredTestValues: [
      {
        key: "acTieInVoltage",
        label: "AC tie-in voltage",
        unit: "V",
        min: 0,
        max: 500,
      },
    ],
  },
  {
    code: "COMMISSIONING_TEST",
    title: "Commissioning + test",
    titleTh: "Commissioning + TEST (\u0e1b\u0e34\u0e14\u0e07\u0e32\u0e19)",
    itemCode: "TECH_COMMISSIONING_TEST",
    aliases: ["COMMISSIONING", "SAFETY_GROUNDING", "COMMISSIONING_TEST", "TECH_COMMISSIONING"],
    sequence: 6,
    evidenceRequired: true,
    requiredTestValues: [
      {
        key: "groundingResistance",
        label: "Grounding resistance",
        unit: "\u03a9",
        min: 0,
        max: 100,
      },
      {
        key: "inverterOutputVoltage",
        label: "Inverter output voltage",
        unit: "V",
        min: 0,
        max: 500,
      },
    ],
  },
  {
    code: "PERMIT_APPLICATION",
    title: "Permit application",
    titleTh: "\u0e02\u0e2d\u0e43\u0e1a\u0e2d\u0e19\u0e38\u0e0d\u0e32\u0e15",
    itemCode: "TECH_PERMIT_APPLICATION",
    aliases: ["PERMIT", "AUTHORITY_SUBMISSION"],
    sequence: 7,
    evidenceRequired: true,
    requiredTestValues: [
      {
        key: "permitAuthority",
        label: "Permit authority",
        unit: "",
        min: 1,
        max: 120,
        valueType: "text",
      },
      {
        key: "permitApplicationNumber",
        label: "Application number",
        unit: "",
        min: 1,
        max: 120,
        valueType: "text",
      },
    ],
  },
] as const;

export const LEGACY_TECH_PORTAL_PHASES: readonly TechPortalPhaseDefinition[] = [
  {
    code: "STRUCTURAL",
    title: "Structural",
    titleTh: "\u0e07\u0e32\u0e19\u0e42\u0e04\u0e23\u0e07\u0e2a\u0e23\u0e49\u0e32\u0e07",
    itemCode: "TECH_STRUCTURAL",
    aliases: ["ROOF_MOUNTING"],
    sequence: 1,
    evidenceRequired: true,
    requiredTestValues: [],
  },
  {
    code: "DC_WIRING",
    title: "DC Wiring",
    titleTh: "\u0e40\u0e14\u0e34\u0e19\u0e2a\u0e32\u0e22 DC",
    itemCode: "TECH_DC_WIRING",
    aliases: ["COMBINER_BOX"],
    sequence: 2,
    evidenceRequired: true,
    requiredTestValues: [
      {
        key: "dcOpenCircuitVoltage",
        label: "DC open-circuit voltage",
        unit: "V",
        min: 0,
        max: 2_000,
      },
    ],
  },
  {
    code: "AC_INVERTER",
    title: "AC / Inverter",
    titleTh: "AC / Inverter",
    itemCode: "TECH_AC_INVERTER",
    aliases: ["INVERTER_WIRING"],
    sequence: 3,
    evidenceRequired: true,
    requiredTestValues: [
      {
        key: "acVoltage",
        label: "AC voltage",
        unit: "V",
        min: 0,
        max: 500,
      },
    ],
  },
  {
    code: "COMMISSIONING",
    title: "Commissioning",
    titleTh: "Commissioning",
    itemCode: "TECH_COMMISSIONING",
    aliases: ["SAFETY_GROUNDING", "COMMISSIONING_TEST"],
    sequence: 4,
    evidenceRequired: true,
    requiredTestValues: [
      {
        key: "groundingResistance",
        label: "Grounding resistance",
        unit: "\u03a9",
        min: 0,
        max: 100,
      },
    ],
  },
] as const;

/** Compatibility name retained for existing imports. New jobs use seven stages. */
export const TECH_PORTAL_PHASES = INSTALLATION_FIELD_STAGES;

export const TECH_PRE_FLIGHT_VERSION = "JSA-ISO-45001-v1" as const;

export const TECH_PRE_FLIGHT_CHECKS = [
  { key: "safetyHarnessChecked", label: "Safety harness checked" },
  { key: "ppeChecked", label: "PPE checked" },
  { key: "roofAccessChecked", label: "Roof access and fall protection checked" },
  { key: "workAreaIsolated", label: "Work area isolated and signed" },
  { key: "weatherSafe", label: "Weather and site conditions are safe" },
  { key: "inverterMatchesBom", label: "Inverter matches the approved BOM" },
  { key: "panelsAndRailsCounted", label: "Panels and rails counted against the BOM" },
  { key: "cablesAndConnectorsChecked", label: "Cables and connectors checked" },
] as const;

export type TechPreFlightCheckKey = (typeof TECH_PRE_FLIGHT_CHECKS)[number]["key"];

export type TechnicianGps = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  capturedAt: string;
};

export type TechTestValues = Record<string, string | number | boolean>;

export type TechPhaseState = {
  code: TechPortalPhaseCode;
  title: string;
  checklistItemId: string;
  evidenceRequired: boolean;
  evidenceReady: boolean;
  evidence: Array<{
    id: string;
    status: string;
    sha256: string;
    byteSize: number;
    contentType: string;
    capturedAt: string | null;
    fileUrl: string | null;
  }>;
  completed: boolean;
  completedAt: string | null;
  qualityInspectionId: string | null;
  testValues: TechTestValues;
};

export type TechTaskState = {
  taskId: string;
  projectId: string;
  fieldVisitId: string | null;
  erpnextTaskId: string | null;
  projectCode: string;
  taskCode: string;
  title: string;
  status: string;
  erpnextSync: {
    projectStatus: string;
    taskStatus: string;
    error: string | null;
    lastSyncedAt: string | null;
  };
  permit: {
    status: string;
    authority: string | null;
    applicationNumber: string | null;
    submittedAt: string | null;
    approvedAt: string | null;
  };
  customer: {
    name: string;
    email: string;
    phone: string | null;
    address: string;
    mapsUrl: string | null;
  };
  phases: TechPhaseState[];
  preflight: {
    version: string;
    checks: Record<string, boolean>;
    timesheetId: string | null;
    gps: TechnicianGps | null;
    startedAt: string;
  } | null;
  handover: {
    completedAt: string;
    pdfUrl: string | null;
    sha256: string | null;
  } | null;
};

export type TechDashboardTask = TechTaskState & {
  scheduledDate: string | null;
  assignedUserId: string | null;
  isScheduledToday: boolean;
};

export type TechDashboardResponse = {
  success: true;
  date: string;
  cacheScope: string;
  readOnly: boolean;
  tasks: TechDashboardTask[];
};
