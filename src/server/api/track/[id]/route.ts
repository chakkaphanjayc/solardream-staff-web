import { eq, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { consultationLeads, proposals, serviceOrders } from "@/db/schema";
import { normalizeTrackingReference } from "@/lib/trackingReference";
import { enforcePortalRateLimit, getPortalClientAddress } from "@/lib/portalRateLimit";

// Helper to return standardized JSON
function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function referenceWithoutKnownPrefix(value: string) {
  return value
    .trim()
    .replace(/^(QT|QTN|TRK|REF)-/i, "")
    .trim();
}

function proposalReferenceConditions(reference: string) {
  const cleanReference = normalizeTrackingReference(reference);
  const shortReference = referenceWithoutKnownPrefix(cleanReference);
  const conditions = [
    eq(proposals.id, cleanReference),
    eq(proposals.erpnextQuotationId, cleanReference),
    eq(proposals.magicTokenSlug, cleanReference),
    sql`${proposals.configurationData}->>'trackingRef' = ${cleanReference}`,
    sql`${proposals.configurationData}->>'trackingId' = ${cleanReference}`,
    sql`${proposals.configurationData}->>'orderReference' = ${cleanReference}`,
    sql`('SD-QT-' || upper(substr(translate(replace(${proposals.id}::text, '-', ''), '01ILO', '23444'), 1, 6))) = ${cleanReference}`,
  ];

  if (/^[a-z0-9]{6,16}$/i.test(shortReference)) {
    conditions.push(
      sql`upper(substring(${proposals.id}::text from 1 for ${shortReference.length})) = ${shortReference.toUpperCase()}`,
    );
  }

  return conditions;
}

function consultationLeadReferenceConditions(reference: string) {
  const cleanReference = normalizeTrackingReference(reference);
  const shortReference = referenceWithoutKnownPrefix(cleanReference);
  const conditions = [
    eq(consultationLeads.id, cleanReference),
    sql`${consultationLeads.rawPayload}->>'trackingRef' = ${cleanReference}`,
    sql`${consultationLeads.rawPayload}->>'trackingId' = ${cleanReference}`,
    sql`${consultationLeads.dynamicCalculations}->>'trackingRef' = ${cleanReference}`,
    sql`('SD-QT-' || upper(substr(translate(replace(${consultationLeads.id}::text, '-', ''), '01ILO', '23444'), 1, 6))) = ${cleanReference}`,
  ];

  if (/^[a-z0-9]{6,16}$/i.test(shortReference)) {
    conditions.push(
      sql`upper(substring(${consultationLeads.id}::text from 1 for ${shortReference.length})) = ${shortReference.toUpperCase()}`,
    );
  }

  return conditions;
}

/** PDPA Name Masking: e.g. "Somchai Thongchai" -> "คุณ S*** T***" */
function maskCustomerName(name?: string | null): string {
  if (!name || !name.trim()) return "คุณลูกค้า (Solar Customer)";
  const parts = name.trim().split(/\s+/);
  const maskedParts = parts.map((p) => (p.length <= 1 ? p : `${p[0]}${"*".repeat(Math.min(p.length - 1, 4))}`));
  return `คุณ ${maskedParts.join(" ")}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return json({ success: false, error: "Missing tracking ID" }, 400);
    }
    const cleanRef = normalizeTrackingReference(id);
    const clientAddress = getPortalClientAddress(request.headers);
    const [ipRate, referenceRate] = await Promise.all([
      enforcePortalRateLimit({
        namespace: "anonymous-track-lookup-ip",
        identity: clientAddress,
        limit: 30,
        windowSeconds: 60,
      }),
      enforcePortalRateLimit({
        namespace: "anonymous-track-lookup-reference",
        identity: cleanRef,
        limit: 10,
        windowSeconds: 60,
      }),
    ]);

    if (!ipRate.allowed || !referenceRate.allowed) {
      return json({ success: false, error: "Too many tracking attempts. Please try again shortly." }, 429);
    }

    // 1. Try to find a service order
    const serviceOrder = await db.query.serviceOrders.findFirst({
      where: eq(serviceOrders.trackingRef, cleanRef),
    });

    if (serviceOrder) {
      const isCompletedStep2 = serviceOrder.erpPaymentSyncStatus === "SYNCED" || ["CONFIRMED", "IN_PROGRESS", "COMPLETED", "CLOSED"].includes(serviceOrder.status.toUpperCase());
      const isCompletedStep3 = ["COMPLETED", "CLOSED"].includes(serviceOrder.status.toUpperCase());
      const isCompletedStep4 = ["COMPLETED", "CLOSED"].includes(serviceOrder.status.toUpperCase());

      let step1Status: "completed" | "active" | "upcoming" = "completed";
      let step2Status: "completed" | "active" | "upcoming" = "upcoming";
      let step3Status: "completed" | "active" | "upcoming" = "upcoming";
      let step4Status: "completed" | "active" | "upcoming" = "upcoming";

      if (isCompletedStep4) {
        step1Status = "completed";
        step2Status = "completed";
        step3Status = "completed";
        step4Status = "completed";
      } else if (isCompletedStep3) {
        step1Status = "completed";
        step2Status = "completed";
        step3Status = "completed";
        step4Status = "active";
      } else if (isCompletedStep2) {
        step1Status = "completed";
        step2Status = "completed";
        step3Status = "active";
        step4Status = "upcoming";
      } else {
        step1Status = "completed";
        step2Status = "active";
        step3Status = "upcoming";
        step4Status = "upcoming";
      }

      const milestones = [
        {
          label: "Service Requirement Captured",
          labelTh: "บันทึกความต้องการบริการเรียบร้อย",
          desc: "Your service requirements and equipment details are on file.",
          descTh: "ระบบจัดเก็บรายละเอียดอุปกรณ์และคำขอรับบริการ",
          status: step1Status,
        },
        {
          label: "Engineering Dispatch & Assessment",
          labelTh: "จัดสรรวิศวกรเข้าประเมินหน้างาน",
          desc: "An engineer is reviewing your roof, electrical setup, and system needs.",
          descTh: "วิศวกรตรวจสอบโครงสร้างและวิเคราะห์ระบบไฟฟ้า",
          status: step2Status,
        },
        {
          label: "Quotation & Customer Review",
          labelTh: "ลูกค้าพิจารณาใบเสนอราคาและอนุมัติ",
          desc: "Your system scope and estimated costs are being prepared for review.",
          descTh: "ส่งสรุปรายละเอียดงานและค่าใช้จ่ายให้ลูกค้าพิจารณา",
          status: step3Status,
        },
        {
          label: "Service Completed & Handover",
          labelTh: "ส่งมอบงานบริการเสร็จสมบูรณ์",
          desc: "Installation testing and service handover will be completed.",
          descTh: "ทดสอบการทำงานของระบบและออกใบรับรองบริการ",
          status: step4Status,
        },
      ];

      const completedCount = milestones.filter((m) => m.status === "completed").length;
      const percent = Math.round((completedCount / milestones.length) * 100);

      const activeStepIdx = milestones.findIndex((m) => m.status === "active");
      const currentStep = milestones[activeStepIdx !== -1 ? activeStepIdx : (completedCount === 4 ? 3 : 0)];

      return json({
        success: true,
        reference: cleanRef,
        type: "SERVICE_ORDER",
        status: serviceOrder.status,
        percent,
        current_step: currentStep.label,
        current_step_th: currentStep.labelTh,
        steps: milestones,
      });
    }

    // 2. Try to find a proposal (Quotation Lifecycle)
    const proposal = await db.query.proposals.findFirst({
      where: or(...proposalReferenceConditions(cleanRef)),
      with: { user: true },
    });

    if (proposal) {
      const pStatus = (proposal.status || "DRAFT").toUpperCase();

      const isStep2Done = ["SENT", "REVIEW", "SIGNED", "APPROVED", "CONFIRMED", "PAID", "COMPLETED"].includes(pStatus);
      const isStep3Done = ["SIGNED", "APPROVED", "CONFIRMED", "PAID", "COMPLETED"].includes(pStatus);
      const isStep4Done = ["PAID", "COMPLETED"].includes(pStatus);
      const isStep5Done = ["COMPLETED"].includes(pStatus);

      let s1: "completed" | "active" | "upcoming" = "completed";
      let s2: "completed" | "active" | "upcoming" = "upcoming";
      let s3: "completed" | "active" | "upcoming" = "upcoming";
      let s4: "completed" | "active" | "upcoming" = "upcoming";
      let s5: "completed" | "active" | "upcoming" = "upcoming";

      if (isStep5Done) {
        s1 = s2 = s3 = s4 = s5 = "completed";
      } else if (isStep4Done) {
        s1 = s2 = s3 = s4 = "completed";
        s5 = "active";
      } else if (isStep3Done) {
        s1 = s2 = s3 = "completed";
        s4 = "active";
      } else if (isStep2Done) {
        s1 = s2 = "completed";
        s3 = "active";
      } else {
        s1 = "completed";
        s2 = "active";
      }

      const milestones = [
        {
          label: "Quotation Drafted & System Sizing",
          labelTh: "ร่างใบเสนอราคาและออกแบบระบบโซลาร์",
          desc: "Your energy use has been sized into a preliminary solar proposal.",
          descTh: "วิเคราะห์การใช้ไฟฟ้า คำนวณขนาดกำลังผลิต (kWp) และอุปกรณ์",
          status: s1,
        },
        {
          label: "Engineering Review & Specification Audit",
          labelTh: "ตรวจสอบทางวิศวกรรมและรับรองสเปค",
          desc: "Engineering is checking the electrical phase, roof structure, and safety details.",
          descTh: "วิศวกรตรวจสอบเฟสไฟฟ้า โครงสร้างหลังคา และความปลอดภัย",
          status: s2,
        },
        {
          label: "Customer Proposal Review & E-Signature",
          labelTh: "ลูกค้าพิจารณาเอกสารและลงนามสัญญา",
          desc: "Review the proposal and sign securely when you are ready.",
          descTh: "พิจารณาข้อเสนอและลงลายมือชื่ออิเล็กทรอนิกส์ผ่านลิงก์ปลอดภัย",
          status: s3,
        },
        {
          label: "Deposit Payment & Slip Verification",
          labelTh: "ชำระเงินมัดจำและยืนยันการชำระเงิน",
          desc: "Your deposit and payment evidence are being verified.",
          descTh: "ตรวจสอบหลักฐานการชำระเงินและสำรองคิวอุปกรณ์ติดตั้ง",
          status: s4,
        },
        {
          label: "Project Execution & Grid Sync Handover",
          labelTh: "เข้าดำเนินการติดตั้งและส่งมอบโครงการ",
          desc: "Installation, utility coordination, and project handover are being arranged.",
          descTh: "ทีมช่างเข้าติดตั้ง ยื่นขออนุญาต กฟน./กฟภ. และออกใบรับรอง PDF",
          status: s5,
        },
      ];

      const completedCount = milestones.filter((m) => m.status === "completed").length;
      const percent = Math.min(100, Math.round(((completedCount + (s2 === "active" || s3 === "active" || s4 === "active" || s5 === "active" ? 0.5 : 0)) / milestones.length) * 100));

      const activeStepIdx = milestones.findIndex((m) => m.status === "active");
      const currentStep = milestones[activeStepIdx !== -1 ? activeStepIdx : (completedCount === 5 ? 4 : 0)];

      return json({
        success: true,
        reference: cleanRef,
        type: "QUOTATION",
        status: proposal.status,
        systemSizeKwp: proposal.systemSizeKwp || 5.5,
        maskedCustomerName: maskCustomerName(proposal.user?.fullName || proposal.user?.name),
        updatedAt: proposal.updatedAt.toISOString(),
        percent,
        current_step: currentStep.label,
        current_step_th: currentStep.labelTh,
        steps: milestones,
      });
    }

    // 3. Try to find a consultation lead
    const consultationLead = await db.query.consultationLeads.findFirst({
      where: or(...consultationLeadReferenceConditions(cleanRef)),
      with: { user: true },
    });

    if (consultationLead) {
      const cStatus = (consultationLead.status || "NEW_LEAD").toUpperCase();
      const isCompletedStep2 = ["IN_PROGRESS", "REVIEW", "APPROVED", "COMPLETED"].includes(cStatus);
      const isCompletedStep3 = ["APPROVED", "COMPLETED"].includes(cStatus);
      const isCompletedStep4 = ["COMPLETED"].includes(cStatus);

      let s1: "completed" | "active" | "upcoming" = "completed";
      let s2: "completed" | "active" | "upcoming" = "upcoming";
      let s3: "completed" | "active" | "upcoming" = "upcoming";
      let s4: "completed" | "active" | "upcoming" = "upcoming";

      if (isCompletedStep4) {
        s1 = s2 = s3 = s4 = "completed";
      } else if (isCompletedStep3) {
        s1 = s2 = s3 = "completed";
        s4 = "active";
      } else if (isCompletedStep2) {
        s1 = s2 = "completed";
        s3 = "active";
      } else {
        s1 = "completed";
        s2 = "active";
      }

      const milestones = [
        {
          label: "Design Consultation Requested",
          labelTh: "บันทึกคำขอประเมินและออกแบบระบบ",
          desc: "Your design goals, initial sizing, and contact details are recorded.",
          descTh: "ระบบบันทึกความต้องการ สเปกเบื้องต้น และข้อมูลติดต่อเรียบร้อยแล้ว",
          status: s1,
        },
        {
          label: "Engineering Review & Sizing Audit",
          labelTh: "วิศวกรประเมินโหลดและจัดเตรียมใบเสนอราคา",
          desc: "An engineer is reviewing production, electrical requirements, and the proposal.",
          descTh: "ทีมวิศวกรวิเคราะห์กำลังผลิต ระบบไฟฟ้า และจัดเตรียมข้อเสนอราคาฉบับสมบูรณ์",
          status: s2,
        },
        {
          label: "Quotation Issuance & Verification",
          labelTh: "ออกใบเสนอราคาอย่างเป็นทางการ",
          desc: "Your formal quotation is being prepared for approval and signature.",
          descTh: "จัดส่งใบเสนอราคาอย่างเป็นทางการเพื่ออนุมัติและลงนามสัญญา",
          status: s3,
        },
        {
          label: "Project Execution & Installation Handover",
          labelTh: "ดำเนินการติดตั้งและส่งมอบโครงการ",
          desc: "Installation, grid connection, and handover will follow approval.",
          descTh: "ทีมช่างเข้าดำเนินการติดตั้ง เชื่อมต่อโครงข่ายไฟฟ้า และส่งมอบงาน",
          status: s4,
        },
      ];

      const completedCount = milestones.filter((m) => m.status === "completed").length;
      const percent = Math.min(100, Math.round(((completedCount + (s2 === "active" || s3 === "active" ? 0.5 : 0)) / milestones.length) * 100));

      const activeStepIdx = milestones.findIndex((m) => m.status === "active");
      const currentStep = milestones[activeStepIdx !== -1 ? activeStepIdx : (completedCount === 4 ? 3 : 0)];

      return json({
        success: true,
        reference: cleanRef,
        type: "CONSULTATION_LEAD",
        status: consultationLead.status,
        systemSizeKwp: parseFloat(String(consultationLead.targetSystemSize || 5)),
        maskedCustomerName: maskCustomerName(consultationLead.customerName || consultationLead.user?.fullName),
        updatedAt: consultationLead.updatedAt.toISOString(),
        percent,
        current_step: currentStep.label,
        current_step_th: currentStep.labelTh,
        steps: milestones,
      });
    }

    return json({ success: false, error: "Tracking record not found" }, 404);
  } catch (error) {
    console.error("[Anonymous Tracking GET Error]", error);
    return json({ success: false, error: "Failed to resolve tracking information" }, 500);
  }
}
