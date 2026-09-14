import type { ProjectCaseStudy } from "@/types/portfolio";

const PORTFOLIO_PROJECTS_SOURCE: ProjectCaseStudy[] = [
  {
    id: "chiang-mai-modern-villa",
    title: "Modern Tropical Villa Solar Sizing & Installation",
    clientName: "คุณชัยวัฒน์ & ครอบครัว",
    location: "อ.หางดง, เชียงใหม่",
    province: "chiangmai",
    category: "villa",
    solarSizeKw: 5.0,
    panelCount: 10,
    inverterModel: "Huawei SUN2000-5KTL-L1",
    batteryBackup: "LUNA2000 5kWh Smart String Energy",
    monthlySavingsThb: 3150,
    annualCo2SavedTons: 3.8,
    completionYear: "2026",
    heroImage: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
    galleryImages: [
      {
        url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
        caption: "มุมมองระบบแผงโซลาร์เซลล์บนหลังคาพรีเมียม (Rooftop View)",
      },
      {
        url: "https://images.unsplash.com/photo-1613665813446-82a78c468a1d?auto=format&fit=crop&w=1200&q=80",
        caption: "งานติดตั้งตู้ควบคุม Inverter และแบตเตอรี่ Smart Battery",
      },
      {
        url: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80",
        caption: "ตัวบ้านโมเดิร์นทรอปิคอลบรรยากาศยามแดดจัด",
      },
    ],
    tags: ["5.0 kW", "หางดง เชียงใหม่", "Smart Battery", "บ้านเดี่ยว 2 ชั้น"],
    summary: "ระบบโซลาร์เซลล์ขนาด 5 kW ยอดนิยม ออกแบบเข้ากับหลังคาพรีเมียมของบ้านโมเดิร์นทรอปิคอล พร้อมแบตเตอรี่สำรองไฟตอนกลางคืน ลดค่าไฟจากเดือนละ 4,800 เหลือเพียง 1,650 บาท",
    quote: {
      text: "ทีม SolarDream วิเคราะห์แสงแดดตรงพื้นที่เชียงใหม่ได้แม่นยำมาก ตั้งแต่ติดตั้งมาค่าไฟลดลงเห็นได้ชัด เครื่องปรับอากาศเปิดทั้งวันอย่างสบายใจ",
      author: "คุณชัยวัฒน์",
      role: "เจ้าของบ้าน อ.หางดง",
    },
    beforeAfter: {
      beforeBillThb: 4800,
      afterBillThb: 1650,
      paybackYears: 4.2,
    },
  },
  {
    id: "bangkok-luxury-smart-residence",
    title: "Luxury Smart Home 10 kW Full Solar Solution",
    clientName: "คุณปรียาพร",
    location: "ราชพฤกษ์, กรุงเทพมหานคร",
    province: "bangkok",
    category: "residential",
    solarSizeKw: 10.0,
    panelCount: 18,
    inverterModel: "SMA Sunny Tripower 10.0 Smart Energy",
    batteryBackup: "BYD Battery-Box Premium HVS 10.2kWh",
    monthlySavingsThb: 6450,
    annualCo2SavedTons: 7.9,
    completionYear: "2026",
    heroImage: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80",
    galleryImages: [
      {
        url: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80",
        caption: "ภาพรวมอาคารบ้านหรู 3 ชั้น และแนวแผงโซลาร์รับแสงตลอดวัน",
      },
      {
        url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
        caption: "แผงโซลาร์ Mono-Crystalline ประสิทธิภาพสูง 18 แผง",
      },
    ],
    tags: ["10.0 kW", "กรุงเทพมหานคร", "Max Output", "EV Charging Integrated"],
    summary: "บ้านเดี่ยวขนาดใหญ่ 3 ชั้น ติดตั้งระบบ 10 kW พร้อมตู้ชาร์จรถยนต์ไฟฟ้า EV Charger และระบบสลับไฟอัตโนมัติ ช่วยเซฟค่าไฟบ้านและค่าชาร์จรถไฟฟ้าได้สูงสุด",
    quote: {
      text: "ประทับใจความเรียบร้อยของงานเดินท่อสายไฟและการมอนิเตอร์ผ่านแอพ SolarDream สัญญาณไฟแสดงผลตรงสเปกอย่างน่าประทับใจ",
      author: "คุณปรียาพร",
      role: "เจ้าของบ้าน โครงการราชพฤกษ์",
    },
    beforeAfter: {
      beforeBillThb: 9800,
      afterBillThb: 3350,
      paybackYears: 3.8,
    },
  },
  {
    id: "mae-rim-eco-resort-villa",
    title: "Private Mountain Eco-Villa 8 kW Clean System",
    clientName: "คุณกิตติศักดิ์",
    location: "อ.แม่ริม, เชียงใหม่",
    province: "chiangmai",
    category: "villa",
    solarSizeKw: 8.0,
    panelCount: 15,
    inverterModel: "Fronius Primo GEN24 8.0 Plus",
    monthlySavingsThb: 5100,
    annualCo2SavedTons: 6.2,
    completionYear: "2025",
    heroImage: "https://images.unsplash.com/photo-1613665813446-82a78c468a1d?auto=format&fit=crop&w=1200&q=80",
    galleryImages: [
      {
        url: "https://images.unsplash.com/photo-1613665813446-82a78c468a1d?auto=format&fit=crop&w=1200&q=80",
        caption: "พูลวิลล่ากลางธรรมชาติ อ.แม่ริม รับแสงอาทิตย์เต็มประสิทธิภาพ",
      },
      {
        url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
        caption: "การจัดวางโครงสร้างยึดแผงโซลาร์ไร้การเจาะหลังคารั่วซึม",
      },
    ],
    tags: ["8.0 kW", "แม่ริม เชียงใหม่", "Eco Villa", "High Irradiance Yield"],
    summary: "วิลล่าส่วนตัวบนเนินเขาแม่ริม ใช้ประโยชน์จากดวงอาทิตย์เชียงใหม่ตลอดปี ระบบสว่างไสว จ่ายพลังงานสะอาดคลอบคลุมทั้งปั๊มน้ำ สระว่ายน้ำ และแอร์ทุกห้อง",
    quote: {
      text: "บ้านอยู่บนเนินเขาค่าไฟเคยแพงมาก พอเปลี่ยนมาใช้ SolarDream แล้วสบายใจขึ้นเยอะ ไม่ต้องกังวลเรื่องการผลิตไฟในวันแดดแรง",
      author: "คุณกิตติศักดิ์",
      role: "เจ้าของพูลวิลล่า อ.แม่ริม",
    },
    beforeAfter: {
      beforeBillThb: 7600,
      afterBillThb: 2500,
      paybackYears: 4.0,
    },
  },
  {
    id: "san-sai-compact-home",
    title: "San Sai Smart Starter 3 kW Solar System",
    clientName: "คุณนลินี",
    location: "อ.สันทราย, เชียงใหม่",
    province: "chiangmai",
    category: "residential",
    solarSizeKw: 3.0,
    panelCount: 6,
    inverterModel: "Huawei SUN2000-3KTL-L1",
    monthlySavingsThb: 1950,
    annualCo2SavedTons: 2.3,
    completionYear: "2025",
    heroImage: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
    galleryImages: [
      {
        url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
        caption: "ชุดแผงโซลาร์ขนาด 3 kW บนหลังคาซิงเกิ้ล รูปร่างกะทัดรัด",
      },
    ],
    tags: ["3.0 kW Compact", "สันทราย เชียงใหม่", "Starter Pack", "คืนทุนไว"],
    summary: "ระบบขนาดกะทัดรัดสำหรับบ้านพักอาศัยเริ่มต้น ติดตั้งง่ายบนหลังคาซิงเกิ้ล ลดภาระค่าไฟกลางวันสำหรับผู้ทำงาน WFH ได้คุ้มค่าที่สุด",
    quote: {
      text: "ทำงาน WFH เปิดแอร์ตัวเดียวทั้งวัน แต่ก่อนค่าไฟ 3,000 เดี๋ยวนี้เหลือไม่ถึงพัน เป็นการลงทุนที่เห็นผลเร็วมาก",
      author: "คุณนลินี",
      role: "เจ้าของบ้าน อ.สันทราย",
    },
    beforeAfter: {
      beforeBillThb: 3100,
      afterBillThb: 1150,
      paybackYears: 3.9,
    },
  },
  {
    id: "phuket-sea-view-villa",
    title: "Kamala Sea View Villa 10 kW Off-Grid System",
    clientName: "คุณภัทรา",
    location: "กมลา, ภูเก็ต",
    province: "phuket",
    category: "villa",
    solarSizeKw: 10.0,
    panelCount: 18,
    inverterModel: "Huawei SUN2000-10KTL-M1",
    batteryBackup: "LUNA2000 15kWh High Capacity Battery",
    monthlySavingsThb: 7200,
    annualCo2SavedTons: 8.5,
    completionYear: "2026",
    heroImage: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
    galleryImages: [
      {
        url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
        caption: "วิลล่าหรูริมทะเลรับแสงอาทิตย์อันดามันตลอดปี",
      },
    ],
    tags: ["10.0 kW", "กมลา ภูเก็ต", "Sea View Villa", "Battery Storage"],
    summary: "ระบบโซลาร์เซลล์ประสิทธิภาพสูงพร้อมแบตเตอรี่สำรองไฟขนาดใหญ่ เหมาะสำหรับวิลล่าตากอากาศติดชายหาดในภูเก็ต",
    quote: {
      text: "มั่นใจได้แม้ช่วงมรสุมหรือไฟดับในพื้นที่เกาะ ระบบสลับไฟทำงานได้ทันที สมบูรณ์แบบสำหรับบ้านพักตากอากาศ",
      author: "คุณภัทรา",
      role: "เจ้าของวิลล่า กมลา",
    },
    beforeAfter: {
      beforeBillThb: 11000,
      afterBillThb: 3800,
      paybackYears: 3.6,
    },
  },
  {
    id: "bangkok-sukhumvit-townhome",
    title: "Sukhumvit Urban Townhome 5 kW Rooftop",
    clientName: "คุณอนันต์",
    location: "สุขุมวิท, กรุงเทพมหานคร",
    province: "bangkok",
    category: "residential",
    solarSizeKw: 5.0,
    panelCount: 9,
    inverterModel: "SMA Sunny Boy 5.0",
    monthlySavingsThb: 3300,
    annualCo2SavedTons: 4.1,
    completionYear: "2025",
    heroImage: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
    galleryImages: [
      {
        url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
        caption: "ทาวน์โฮมดีไซน์โมเดิร์นใจกลางเมืองสุขุมวิท",
      },
    ],
    tags: ["5.0 kW", "สุขุมวิท กรุงเทพฯ", "Urban Townhome", "Zero Export Clean"],
    summary: "ติดแผงโซลาร์เต็มพื้นที่หลังคาทาวน์โฮม 4 ชั้น เพื่อลดค่าไฟฟ้าจากการใช้เครื่องปรับอากาศและเครื่องใช้ไฟฟ้าในเวลากลางวัน",
    quote: {
      text: "ทีมช่างของ SolarDream ทำงานเร็ว สะอาด และระวังโครงสร้างหลังคาบ้านอย่างดีมาก",
      author: "คุณอนันต์",
      role: "เจ้าของทาวน์โฮม สุขุมวิท",
    },
    beforeAfter: {
      beforeBillThb: 5200,
      afterBillThb: 1900,
      paybackYears: 4.1,
    },
  },
  {
    id: "hang-dong-family-estate",
    title: "Hang Dong Family Estate 8 kW Solar System",
    clientName: "คุณสุรชัย",
    location: "อ.หางดง, เชียงใหม่",
    province: "chiangmai",
    category: "villa",
    solarSizeKw: 8.0,
    panelCount: 14,
    inverterModel: "Huawei SUN2000-8KTL-M1",
    monthlySavingsThb: 5300,
    annualCo2SavedTons: 6.4,
    completionYear: "2026",
    heroImage: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80",
    galleryImages: [
      {
        url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80",
        caption: "บ้านเดี่ยวหลังใหญ่ท่ามกลางสวนธรรมชาติในหางดง",
      },
    ],
    tags: ["8.0 kW", "หางดง เชียงใหม่", "Family Estate", "High Savings"],
    summary: "บ้านเดี่ยวครอบครัวใหญ่ 2 ชั้น จ่ายไฟครอบคลุมทั้งบ้านและโรงรถ ผลผลิตไฟสม่ำเสมอตลอดปี",
    quote: {
      text: "คุ้มค่ามากๆ ครับ ค่าไฟลดไปเกินครึ่งทุกเดือน ตัวแอพแจ้งเตือนสถานะการทำงานชัดเจน",
      author: "คุณสุรชัย",
      role: "เจ้าของบ้าน อ.หางดง",
    },
    beforeAfter: {
      beforeBillThb: 8200,
      afterBillThb: 2900,
      paybackYears: 3.9,
    },
  },
  {
    id: "nonthaburi-smart-residence",
    title: "Pak Kret Smart Home 5 kW Clean Energy",
    clientName: "คุณวิสาขา",
    location: "ปากเกร็ด, นนทบุรี",
    province: "other",
    category: "residential",
    solarSizeKw: 5.0,
    panelCount: 9,
    inverterModel: "Fronius Primo 5.0-1",
    monthlySavingsThb: 3250,
    annualCo2SavedTons: 4.0,
    completionYear: "2025",
    heroImage: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80",
    galleryImages: [
      {
        url: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80",
        caption: "บ้านสมาร์ตโฮมดีไซน์มินิมอล ปากเกร็ด นนทบุรี",
      },
    ],
    tags: ["5.0 kW", "นนทบุรี", "Smart Home", "Fast Payback"],
    summary: "ติดตั้งโซลาร์เซลล์ขนาด 5 kW บนบ้านเดี่ยวโครงการใหม่ เพิ่มคุณค่าการอยู่อาศัยแบบเป็นมิตรต่อสิ่งแวดล้อม",
    quote: {
      text: "บริการครบวงจรจริงๆ ตั้งแต่ช่วยประเมิน ออกแบบ ยันยื่นขออนุญาตกับการไฟฟ้า",
      author: "คุณวิสาขา",
      role: "เจ้าของบ้าน ปากเกร็ด",
    },
    beforeAfter: {
      beforeBillThb: 4900,
      afterBillThb: 1650,
      paybackYears: 4.0,
    },
  },
  {
    id: "chiang-mai-do-suthep-view",
    title: "Doi Suthep View Residence 10 kW Solar Roof",
    clientName: "คุณดนัย",
    location: "อ.เมือง, เชียงใหม่",
    province: "chiangmai",
    category: "villa",
    solarSizeKw: 10.0,
    panelCount: 18,
    inverterModel: "Huawei SUN2000-10KTL-M1",
    batteryBackup: "LUNA2000 10kWh Battery",
    monthlySavingsThb: 6700,
    annualCo2SavedTons: 8.1,
    completionYear: "2026",
    heroImage: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1200&q=80",
    galleryImages: [
      {
        url: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1200&q=80",
        caption: "วิลล่าหลังใหญ่ทอดตัวมองเห็นวิวดอยสุเทพ",
      },
    ],
    tags: ["10.0 kW", "เมือง เชียงใหม่", "Doi Suthep View", "Max Efficiency"],
    summary: "บ้านตากอากาศวิวภูเขา ติดตั้งระบบโซลาร์ 10 kW พร้อมแบตเตอรี่เต็มระบบ จ่ายไฟให้สระน้ำและระบบปรับอากาศตลอด 24 ชั่วโมง",
    quote: {
      text: "ระบบทำงานสมบูรณ์แบบ แสงแดดเชียงใหม่ช่วงกลางวันผลิตไฟได้เกินความต้องการ คุ้มค่าที่สุด",
      author: "คุณดนัย",
      role: "เจ้าของวิลล่า อ.เมือง เชียงใหม่",
    },
    beforeAfter: {
      beforeBillThb: 10200,
      afterBillThb: 3500,
      paybackYears: 3.7,
    },
  },
  {
    id: "bangkok-thonglor-minimal",
    title: "Thonglor Eco Modern 3 kW Solar System",
    clientName: "คุณกวิน",
    location: "ทองหล่อ, กรุงเทพมหานคร",
    province: "bangkok",
    category: "residential",
    solarSizeKw: 3.0,
    panelCount: 6,
    inverterModel: "SMA Sunny Boy 3.0",
    monthlySavingsThb: 2100,
    annualCo2SavedTons: 2.5,
    completionYear: "2025",
    heroImage: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=80",
    galleryImages: [
      {
        url: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=80",
        caption: "บ้านเดี่ยวมินิมอล 2 ชั้นในซอยทองหล่อ",
      },
    ],
    tags: ["3.0 kW Compact", "ทองหล่อ กรุงเทพฯ", "Minimal Design", "Eco Living"],
    summary: "ระบบขนาดเล็กกะทัดรัด ติดตั้งเพื่อรองรับการใช้งานโฮมออฟฟิศและเครื่องปรับอากาศส่วนตัวช่วงกลางวัน",
    quote: {
      text: "ดีไซน์แผงเรียบไปกับหลังคาบ้าน ไม่เสียทัศนียภาพบ้าน และประหยัดค่าไฟได้จริงทุกเดือน",
      author: "คุณกวิน",
      role: "เจ้าของบ้าน ทองหล่อ",
    },
    beforeAfter: {
      beforeBillThb: 3400,
      afterBillThb: 1300,
      paybackYears: 3.8,
    },
  },
];

const FEATURED_PROJECT_IDS = new Set([
  "chiang-mai-modern-villa",
  "bangkok-luxury-smart-residence",
  "mae-rim-eco-resort-villa",
  "san-sai-compact-home",
]);

export const PORTFOLIO_PROJECTS: ProjectCaseStudy[] = PORTFOLIO_PROJECTS_SOURCE.map((project, sortOrder) => ({
  ...project,
  isFeatured: FEATURED_PROJECT_IDS.has(project.id),
  sortOrder,
}));

export function getFeaturedPortfolioProjects(limit = 10): ProjectCaseStudy[] {
  const safeLimit = Number.isFinite(limit)
    ? Math.min(10, Math.max(0, Math.floor(limit)))
    : 10;

  return PORTFOLIO_PROJECTS
    .filter((project) => project.isFeatured === true)
    .sort((left, right) => {
      const sortOrderDifference = (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER);
      if (sortOrderDifference !== 0) return sortOrderDifference;

      return right.completionYear.localeCompare(left.completionYear);
    })
    .slice(0, safeLimit);
}

export const FEATURED_PORTFOLIO_PROJECTS = getFeaturedPortfolioProjects();
