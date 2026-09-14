export type DocumentRequestType = "FILE" | "LOCATION" | "CONTACT_INFO";

export type CustomerDocumentRequestTemplate = {
  id: string;
  documentName: string;
  descriptionHint: string | null;
  requestType: DocumentRequestType;
  isRequired: boolean;
};

export const CUSTOMER_DOCUMENT_REQUEST_TEMPLATES: CustomerDocumentRequestTemplate[] = [
  {
    id: "latest-electric-bill-photo",
    documentName: "รูปถ่ายบิลค่าไฟฟ้าล่าสุด",
    descriptionHint: "หากมีบิลย้อนหลัง 3-6 เดือน จะช่วยให้วิศวกรวิเคราะห์ค่าพลังงานได้แม่นยำยิ่งขึ้น",
    requestType: "FILE",
    isRequired: true,
  },
  {
    id: "roof-site-photo",
    documentName: "ภาพถ่ายสถานที่ติดตั้งจริง: พื้นที่หลังคา",
    descriptionHint: null,
    requestType: "FILE",
    isRequired: true,
  },
  {
    id: "main-distribution-board-photo",
    documentName: "ภาพถ่ายสถานที่ติดตั้งจริง: ภาพตู้ไฟหลักของบ้าน (Main Distribution Board)",
    descriptionHint: null,
    requestType: "FILE",
    isRequired: true,
  },
  {
    id: "inverter-combiner-location-photo",
    documentName: "ภาพถ่ายสถานที่ติดตั้งจริง: จุดพื้นที่วางสำหรับติดตั้ง Inverter และตู้ Combiner",
    descriptionHint: null,
    requestType: "FILE",
    isRequired: true,
  },
  {
    id: "location-gps",
    documentName: "ข้อมูลพิกัดแผนที่ (Location / GPS)",
    descriptionHint: "กรอกพิกัดหรือแนบลิงก์แผนที่ Google Maps เพื่อช่วยทีมสำรวจวางแผนหน้างาน",
    requestType: "LOCATION",
    isRequired: true,
  },
  {
    id: "contact-info",
    documentName: "ข้อมูลการติดต่อกลับ",
    descriptionHint: "กรอกชื่อ เบอร์โทรศัพท์ และ Line ID สำหรับการนัดหมายสำรวจ/ติดตั้ง",
    requestType: "CONTACT_INFO",
    isRequired: true,
  },
];

export function getDocumentRequestTemplateByName(documentName: string) {
  const normalized = documentName.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
  return CUSTOMER_DOCUMENT_REQUEST_TEMPLATES.find(
    (template) => template.documentName.toLocaleLowerCase("th-TH") === normalized,
  );
}
