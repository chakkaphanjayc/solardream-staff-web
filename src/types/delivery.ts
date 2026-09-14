export type DeliveryTaskStatus = "OPEN" | "SCHEDULED" | "IN_PROGRESS" | "HANDOVER_PENDING" | "COMPLETED" | "CANCELLED";
export type DeliveryProjectStatus = "OPEN" | "IN_PROGRESS" | "FINISHED" | "CANCELLED";

export interface DeliveryAssignee {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
}

export interface DeliveryChecklistItem {
  id: string;
  taskId: string;
  itemCode: string;
  label: string;
  sequence: number;
  required: boolean;
  evidenceRequired: boolean;
  allowsNa: boolean;
  completed: boolean;
  completedAt?: string | null;
  isNa?: boolean;
}

export interface DeliveryQcEvidence {
  id: string;
  checklistItemId: string;
  category: "INVERTER_WIRING" | "ROOF_MOUNTING" | "COMBINER_BOX" | "SAFETY_GROUNDING" | "GENERAL";
  fileUrl: string;
  googleDriveFileId?: string | null;
  googleDriveUrl?: string | null;
  uploadedAt: string;
}

export interface DeliveryTask {
  id: string;
  projectId: string;
  projectCode: string;
  /** ERPNext is an asynchronous projection and may not exist yet. */
  erpnextTaskId: string | null;
  taskCode: string;
  title: string;
  description?: string | null;
  sequence: number;
  status: DeliveryTaskStatus;
  scheduledStartDate?: string | null;
  scheduledEndDate?: string | null;
  assignedUserId?: string | null;
  assignee?: DeliveryAssignee | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  installationAddress?: string | null;
  systemSizeKwp?: number | null;
  panelCount?: number | null;
  inverterModel?: string | null;
  googleCalendarEventId?: string | null;
  googleCalendarEventLink?: string | null;
  googleDriveFolderUrl?: string | null;
  checklistItems?: DeliveryChecklistItem[];
  qcEvidences?: DeliveryQcEvidence[];
  completedAt?: string | null;
  completedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryProject {
  id: string;
  proposalId: string;
  /** ERPNext is an asynchronous projection and may not exist yet. */
  erpnextProjectId: string | null;
  projectCode: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  installationAddress?: string | null;
  systemSizeKwp?: number | null;
  status: DeliveryProjectStatus;
  tasks: DeliveryTask[];
  createdAt: string;
  updatedAt: string;
}

export interface SubmitHandoverPayload {
  taskId: string;
  customerSignatureBase64: string;
  technicianNotes?: string;
  verifiedItems: string[];
}
