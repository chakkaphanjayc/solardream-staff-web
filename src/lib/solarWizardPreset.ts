type PresetOption = {
  id: string;
  questionId: string;
  order: number;
  label: string;
  value: string;
  description: string;
  icon: string;
  isRecommended: boolean;
  tooltipText: string | null;
  tooltipImageUrl: string | null;
};

type PresetQuestion = {
  id: string;
  stepId: string;
  order: number;
  type: "NUMBER" | "RADIO_CARD" | "TOGGLE";
  questionText: string;
  helperText: string;
  stateKey: string;
  tooltipText: string | null;
  tooltipImageUrl: string | null;
  options: PresetOption[];
};

type PresetStep = {
  id: string;
  order: number;
  title: string;
  description: string;
  questions: PresetQuestion[];
};

export type SolarWizardPreset = {
  id: string;
  title: string;
  description: string;
  slug: string;
  steps: PresetStep[];
};

function option(
  questionId: string,
  index: number,
  value: string,
  label: string,
  description: string,
  icon: string,
  isRecommended = false,
): PresetOption {
  return {
    id: `${questionId}-option-${value}`,
    questionId,
    order: index,
    label,
    value,
    description,
    icon,
    isRecommended,
    tooltipText: null,
    tooltipImageUrl: null,
  };
}

export const SOLARDREAM_WIZARD_PRESET: SolarWizardPreset = {
  id: "solar-dream-live-calculator",
  title: "SolarDream Smart Solar Calculator",
  description: "ตอบคำถามสั้น ๆ เพื่อให้ Solia ประเมินรูปแบบระบบ พื้นที่ติดตั้ง และข้อมูลที่ทีมวิศวกรต้องใช้ก่อนออกแบบจริง",
  slug: "advanced-solar-engineering",
  steps: [
    {
      id: "electricity-profile",
      order: 0,
      title: "พฤติกรรมการใช้ไฟฟ้า (Electricity Profiles)",
      description: "เริ่มจากค่าไฟ ช่วงเวลาที่ใช้ไฟ และระบบไฟฟ้าของอาคาร",
      questions: [
        {
          id: "monthly-electricity-bill",
          stepId: "electricity-profile",
          order: 0,
          type: "NUMBER",
          questionText: "ค่าไฟเฉลี่ยรายเดือนเท่าไหร่ (บาท)",
          helperText: "ใช้ค่าไฟเฉลี่ยล่าสุดเพื่อช่วยประเมินขนาดระบบเบื้องต้น",
          stateKey: "monthlyBill",
          tooltipText: null,
          tooltipImageUrl: null,
          options: [],
        },
        {
          id: "peak-usage-time",
          stepId: "electricity-profile",
          order: 1,
          type: "RADIO_CARD",
          questionText: "ช่วงเวลาที่ใช้ไฟฟ้ามากที่สุด",
          helperText: "ช่วยแนะนำระบบ On-grid หรือ Hybrid ให้เหมาะกับพฤติกรรมใช้งาน",
          stateKey: "peakUsageTime",
          tooltipText: null,
          tooltipImageUrl: null,
          options: [
            option("peak-usage-time", 0, "daytime", "กลางวัน (Daytime)", "ใช้ไฟมากช่วงแดดออก เหมาะกับระบบ On-grid ที่เน้นลดค่าไฟทันที", "Sun", true),
            option("peak-usage-time", 1, "nighttime", "กลางคืน (Nighttime)", "ใช้ไฟหนักหลังพระอาทิตย์ตก อาจเหมาะกับ Hybrid และแบตเตอรี่", "Moon"),
          ],
        },
        {
          id: "building-electrical-phase",
          stepId: "electricity-profile",
          order: 2,
          type: "RADIO_CARD",
          questionText: "ระบบไฟฟ้าของอาคาร",
          helperText: "เลือกเฟสไฟฟ้าที่ใช้งานจริงเพื่อให้ทีมออกแบบอินเวอร์เตอร์ถูกประเภท",
          stateKey: "electricalPhase",
          tooltipText: null,
          tooltipImageUrl: null,
          options: [
            option("building-electrical-phase", 0, "1-Phase", "1 เฟส (Single Phase)", "เหมาะกับบ้านพักอาศัยทั่วไปและโหลดขนาดเล็กถึงกลาง", "House"),
            option("building-electrical-phase", 1, "3-Phase", "3 เฟส (Three Phase)", "เหมาะกับบ้านขนาดใหญ่ อาคารพาณิชย์ หรือโรงงาน", "Factory", true),
          ],
        },
      ],
    },
    {
      id: "site-roof-profile",
      order: 1,
      title: "สถานที่ติดตั้ง & โครงสร้างหลังคา (Site & Roof Profile)",
      description: "ระบุประเภทพื้นที่และวัสดุหลังคาเพื่อช่วยเลือกโครงสร้างยึดจับอย่างปลอดภัย",
      questions: [
        {
          id: "installation-site-type",
          stepId: "site-roof-profile",
          order: 0,
          type: "RADIO_CARD",
          questionText: "ประเภทอาคาร / พื้นที่ติดตั้ง",
          helperText: "หากเลือกโซลาร์บนพื้นดิน ระบบจะข้ามคำถามวัสดุหลังคา",
          stateKey: "installationType",
          tooltipText: null,
          tooltipImageUrl: null,
          options: [
            option("installation-site-type", 0, "residential", "บ้านพักอาศัย (Residential)", "ระบบสำหรับบ้านพักอาศัยและหลังคาทั่วไป", "Home", true),
            option("installation-site-type", 1, "commercial_factory", "โรงงาน/อาคารพาณิชย์ (Commercial/Factory)", "เหมาะกับโหลดใช้งานสูงและระบบไฟฟ้า 3 เฟส", "Building2"),
            option("installation-site-type", 2, "ground_mount", "โซลาร์บนพื้นดิน (Ground Mount)", "ติดตั้งบนโครงสร้างภาคพื้น ไม่ต้องระบุวัสดุหลังคา", "MapPinned"),
          ],
        },
        {
          id: "roof-material-type",
          stepId: "site-roof-profile",
          order: 1,
          type: "RADIO_CARD",
          questionText: "ประเภทของวัสดุหลังคา",
          helperText: "คำถามนี้จะแสดงสำหรับบ้านพักอาศัยหรืออาคารพาณิชย์เท่านั้น",
          stateKey: "roofMaterial",
          tooltipText: null,
          tooltipImageUrl: null,
          options: [
            option("roof-material-type", 0, "roman_tile", "ลอนคู่ (Roman Tile)", "ต้องเลือกชุดยึดจับที่รองรับแนวลอนและการกันน้ำ", "Layers3"),
            option("roof-material-type", 1, "metal_sheet", "เมทัลชีท (Metal Sheet)", "ติดตั้งรวดเร็วและเหมาะกับคลิปล็อก/สกรูยึดเฉพาะทาง", "PanelTop", true),
            option("roof-material-type", 2, "flat_roof", "ดาดฟ้าคอนกรีต (Flat Roof)", "เหมาะกับโครงสร้างถ่วงน้ำหนักหรือเจาะยึดตามวิศวกรรม", "Square"),
            option("roof-material-type", 3, "cpac", "กระเบื้องซีแพค (CPAC)", "ต้องประเมินระยะจันทันและอุปกรณ์ยึดจับให้เหมาะสม", "Grid2X2"),
          ],
        },
      ],
    },
    {
      id: "system-objectives",
      order: 2,
      title: "วัตถุประสงค์ของการติดตั้งระบบ (System Objectives)",
      description: "เลือกเป้าหมายหลักและความพร้อมรองรับ EV Charger ในอนาคต",
      questions: [
        {
          id: "main-system-objective",
          stepId: "system-objectives",
          order: 0,
          type: "RADIO_CARD",
          questionText: "วัตถุประสงค์หลัก",
          helperText: "ทีมจะใช้คำตอบนี้ในการจัดสเปกอินเวอร์เตอร์และแบตเตอรี่",
          stateKey: "systemObjective",
          tooltipText: null,
          tooltipImageUrl: null,
          options: [
            option("main-system-objective", 0, "on_grid_daytime_saving", "เน้นลดค่าไฟฟ้าในช่วงเวลากลางวัน (ระบบ On-grid)", "เหมาะกับบ้านหรือธุรกิจที่ใช้ไฟมากช่วงกลางวัน", "SunMedium", true),
            option("main-system-objective", 1, "hybrid_backup_night", "เน้นประหยัดไฟและมีระบบสำรองไฟไว้ใช้ช่วงไฟดับ/กลางคืน (ระบบ Hybrid)", "เหมาะกับผู้ใช้ที่ต้องการแบตเตอรี่และความต่อเนื่องของพลังงาน", "BatteryCharging"),
          ],
        },
      ],
    },
  ],
};

export function withSolarDreamWizardPreset<T extends { id?: string; title?: string | null; description?: string | null; slug?: string | null }>(
  wizard: T | null | undefined,
) {
  return {
    ...(wizard || {}),
    id: wizard?.id || SOLARDREAM_WIZARD_PRESET.id,
    title: SOLARDREAM_WIZARD_PRESET.title,
    description: SOLARDREAM_WIZARD_PRESET.description,
    slug: wizard?.slug || SOLARDREAM_WIZARD_PRESET.slug,
    steps: SOLARDREAM_WIZARD_PRESET.steps,
  };
}
