export type SolarJourneyCopy = Readonly<{
  nav: Readonly<{
    explore: string;
    projects: string;
    knowledge: string;
  }>;
  progress: Readonly<{
    ariaLabel: string;
    goTo: string;
    sun: string;
    roof: string;
    energy: string;
    battery: string;
    system: string;
    projects: string;
  }>;
  hero: Readonly<{
    kicker: string;
    title: string;
    description: string;
    imageAlt: string;
    explore: string;
    design: string;
    scroll: string;
    simulation: string;
    firstLight: string;
  }>;
  sun: Readonly<{
    title: string;
    description: string;
    simulation: string;
    production: string;
    example: string;
    peak: string;
    times: ReadonlyArray<string>;
  }>;
  roof: Readonly<{
    title: string;
    description: string;
    direction: string;
    north: string;
    east: string;
    south: string;
    west: string;
    tilt: string;
    shade: string;
    clear: string;
    partial: string;
    potential: string;
    note: string;
  }>;
  size: Readonly<{
    title: string;
    description: string;
    systemSize: string;
    solar: string;
    home: string;
    excess: string;
    direct: string;
    grid: string;
    stored: string;
    note: string;
  }>;
  flow: Readonly<{
    title: string;
    description: string;
    solar: string;
    home: string;
    battery: string;
    grid: string;
    appliances: string;
    airConditioner: string;
    evCharger: string;
    waterHeater: string;
    poolPump: string;
    directUse: string;
    excess: string;
    importing: string;
    exporting: string;
    simulation: string;
  }>;
  battery: Readonly<{
    title: string;
    description: string;
    battery: string;
    off: string;
    on: string;
    daytime: string;
    evening: string;
    stored: string;
    grid: string;
    note: string;
  }>;
  inspect: Readonly<{
    label: string;
    title: string;
    description: string;
    tap: string;
    items: Readonly<Record<string, Readonly<{ title: string; description: string }>>>;
  }>;
  system: Readonly<{
    title: string;
    description: string;
    panel: string;
    mounting: string;
    inverter: string;
    protection: string;
    monitoring: string;
    battery: string;
    engineering: string;
    installation: string;
    warranty: string;
    complete: string;
  }>;
  decision: Readonly<{
    title: string;
    description: string;
    buildTitle: string;
    buildDescription: string;
    buildCta: string;
    wizardTitle: string;
    wizardDescription: string;
    wizardCta: string;
  }>;
  projects: Readonly<{
    intro: string;
    title: string;
    description: string;
    viewProject: string;
    viewAll: string;
    empty: string;
    residential: string;
    villa: string;
    commercial: string;
    simulation: string;
  }>;
  finale: Readonly<{
    title: string;
    description: string;
    cta: string;
    build: string;
    wizard: string;
    night: string;
  }>;
  labels: Readonly<{
    relative: string;
    illustrative: string;
    kWp: string;
    kW: string;
    kWh: string;
    home: string;
    sun: string;
    grid: string;
  }>;
}>;

const english: SolarJourneyCopy = {
  nav: { explore: "Explore solar", projects: "Projects", knowledge: "Knowledge" },
  progress: {
    ariaLabel: "Solar Journey progress",
    goTo: "Go to",
    sun: "Sun",
    roof: "Roof",
    energy: "Energy",
    battery: "Battery",
    system: "System",
    projects: "Projects",
  },
  hero: {
    kicker: "A day in the life of your roof",
    title: "Your roof.\nYour power.",
    description: "Before choosing a system, see how sunlight moves through a home, a battery, and the grid.",
    imageAlt: "Contemporary Thai home with solar panels at sunrise",
    explore: "Explore solar",
    design: "Design my system",
    scroll: "Scroll to follow the light",
    simulation: "Illustrative journey",
    firstLight: "First light",
  },
  sun: {
    title: "Solar follows the sun.",
    description: "Production starts quietly, reaches its strongest point around midday, then softens with the evening light.",
    simulation: "Illustrative simulation",
    production: "Solar production",
    example: "Example output",
    peak: "Midday peak",
    times: ["06:00", "09:00", "12:00", "15:00", "18:00"],
  },
  roof: {
    title: "Same sun. Different roof.",
    description: "Direction, angle, and shade change how much sunlight reaches the panels. Try the variables, then let an engineer confirm the real roof.",
    direction: "Roof direction",
    north: "North",
    east: "East",
    south: "South",
    west: "West",
    tilt: "Roof tilt",
    shade: "Shade",
    clear: "Clear",
    partial: "Partial shade",
    potential: "Relative solar potential",
    note: "Illustrative production difference, not an engineering estimate.",
  },
  size: {
    title: "More panels do not always mean more value.",
    description: "A larger system can make more electricity, but your home may not use all of it at the moment it is produced.",
    systemSize: "System size",
    solar: "Solar",
    home: "Home",
    excess: "Excess",
    direct: "Used directly by home",
    grid: "Sent to grid",
    stored: "Potential stored energy",
    note: "The right size depends on the roof and how the home uses power. The Wizard can help work that out.",
  },
  flow: {
    title: "Your solar energy has somewhere to go.",
    description: "Solar production and household demand happen at the same time. Turn on a few loads to see the balance shift.",
    solar: "Solar production",
    home: "Home consumption",
    battery: "Battery",
    grid: "Grid",
    appliances: "Add a household load",
    airConditioner: "Air conditioner",
    evCharger: "EV charger",
    waterHeater: "Water heater",
    poolPump: "Pool pump",
    directUse: "Used directly",
    excess: "Excess to grid",
    importing: "Grid import",
    exporting: "Grid export",
    simulation: "Illustrative energy flow",
  },
  battery: {
    title: "What happens when the sun goes down?",
    description: "A battery does not create electricity. It moves solar energy from the bright part of the day into the hours when the roof is quiet.",
    battery: "Battery",
    off: "Off",
    on: "On",
    daytime: "Daylight",
    evening: "Evening",
    stored: "Stored solar",
    grid: "Grid support",
    note: "A battery can increase self-consumption, but whether it is worthwhile depends on your usage pattern and system design.",
  },
  inspect: {
    label: "Things worth knowing",
    title: "A good solar system starts before the panels.",
    description: "Tap the house to see the details that shape an installation. They are part of the design, not fine print.",
    tap: "Select a detail",
    items: {
      roof: { title: "Roof condition", description: "The structure and surface need a safe, serviceable foundation." },
      space: { title: "Roof area", description: "Available space sets the practical limit for panel placement." },
      shade: { title: "Shade", description: "Trees and neighboring buildings can change the sunlight pattern." },
      electrical: { title: "Electrical system", description: "The connection and phase affect how the system is integrated." },
      meter: { title: "Meter", description: "The electricity connection determines how energy moves to and from the grid." },
      inverter: { title: "Inverter", description: "The inverter converts panel electricity into power your home can use." },
      monitoring: { title: "Monitoring", description: "A clear view of production makes the system easier to understand." },
      warranty: { title: "Warranty", description: "Equipment and installation coverage keep the record clear after handover." },
    },
  },
  system: {
    title: "Solar is more than the panel.",
    description: "A considered system brings together equipment, electrical work, engineering, and the people who install it.",
    panel: "Solar panel",
    mounting: "Mounting",
    inverter: "Inverter",
    protection: "Protection",
    monitoring: "Monitoring",
    battery: "Battery",
    engineering: "Engineering",
    installation: "Installation",
    warranty: "Warranty",
    complete: "A complete system",
  },
  decision: {
    title: "Ready to find your system?",
    description: "You can continue in the way that fits what you know today. Both paths lead to a considered solar design.",
    buildTitle: "I know what I want",
    buildDescription: "Already know roughly how many kWp you want? Configure the system, equipment, and add-ons.",
    buildCta: "Build my system",
    wizardTitle: "Help me choose",
    wizardDescription: "Not sure what fits your home? Share your usage and installation conditions for a recommendation.",
    wizardCta: "Start smart Wizard",
  },
  projects: {
    intro: "From simulation to real life",
    title: "Every roof has its own rhythm.",
    description: "These SolarDream installations show the final translation from sunlight to a working home.",
    viewProject: "View project",
    viewAll: "See all projects",
    empty: "Project stories are being prepared.",
    residential: "Residential",
    villa: "Villa",
    commercial: "Commercial",
    simulation: "Real installation",
  },
  finale: {
    title: "Your roof can be part of this story.",
    description: "Start with the light you already have. We will help you understand the rest.",
    cta: "Design your Solar Dream",
    build: "Build",
    wizard: "Wizard",
    night: "Energy kept moving after sunset",
  },
  labels: {
    relative: "Relative",
    illustrative: "Illustrative",
    kWp: "kWp",
    kW: "kW",
    kWh: "kWh",
    home: "Home",
    sun: "Sun",
    grid: "Grid",
  },
};

const thai: SolarJourneyCopy = {
  ...english,
  nav: { explore: "สำรวจพลังงานแสงอาทิตย์", projects: "ผลงาน", knowledge: "ความรู้" },
  progress: {
    ariaLabel: "ความคืบหน้าการเดินทางพลังงานแสงอาทิตย์",
    goTo: "ไปยัง",
    sun: "ดวงอาทิตย์",
    roof: "หลังคา",
    energy: "พลังงาน",
    battery: "แบตเตอรี่",
    system: "ระบบ",
    projects: "ผลงาน",
  },
  hero: {
    ...english.hero,
    kicker: "หนึ่งวันของหลังคาที่สร้างพลังงาน",
    title: "หลังคาของคุณ\nพลังงานของคุณ",
    description: "ก่อนเลือกระบบ ลองดูว่าแสงอาทิตย์เดินทางผ่านบ้าน แบตเตอรี่ และโครงข่ายไฟฟ้าอย่างไร",
    imageAlt: "บ้านร่วมสมัยในประเทศไทยพร้อมแผงโซลาร์ยามพระอาทิตย์ขึ้น",
    explore: "สำรวจพลังงานแสงอาทิตย์",
    design: "ออกแบบระบบของฉัน",
    scroll: "เลื่อนเพื่อเดินทางไปกับแสง",
    simulation: "ประสบการณ์จำลอง",
    firstLight: "แสงแรกของวัน",
  },
  sun: {
    ...english.sun,
    title: "พลังงานแสงอาทิตย์เดินทางไปกับดวงอาทิตย์",
    description: "การผลิตไฟฟ้าเริ่มต้นอย่างค่อยเป็นค่อยไป เพิ่มขึ้นสูงสุดช่วงเที่ยง แล้วลดลงเมื่อแสงเย็นลง",
    simulation: "การจำลองเพื่อการเรียนรู้",
    production: "การผลิตไฟฟ้า",
    example: "ตัวอย่างกำลังผลิต",
    peak: "จุดสูงสุดช่วงเที่ยง",
  },
  roof: {
    ...english.roof,
    title: "แสงเดียวกัน หลังคาต่างกัน",
    description: "ทิศทาง มุม และเงาเปลี่ยนปริมาณแสงที่ตกถึงแผง ลองปรับตัวแปร แล้วให้วิศวกรยืนยันกับหลังคาจริง",
    direction: "ทิศทางหลังคา",
    north: "เหนือ",
    east: "ตะวันออก",
    south: "ใต้",
    west: "ตะวันตก",
    tilt: "องศาหลังคา",
    shade: "เงาบัง",
    clear: "ไม่มีเงา",
    partial: "มีเงาบางส่วน",
    potential: "ศักยภาพสัมพัทธ์",
    note: "เป็นความแตกต่างเพื่อการเรียนรู้ ไม่ใช่ผลคำนวณทางวิศวกรรม",
  },
  size: {
    ...english.size,
    title: "แผงมากขึ้น ไม่ได้แปลว่าคุ้มค่ามากขึ้นเสมอไป",
    description: "ระบบที่ใหญ่ขึ้นผลิตไฟฟ้าได้มากขึ้น แต่บ้านอาจใช้ไฟไม่หมดในเวลาที่ผลิตได้",
    systemSize: "ขนาดระบบ",
    direct: "บ้านใช้โดยตรง",
    grid: "ส่งเข้าโครงข่าย",
    stored: "พลังงานที่อาจเก็บไว้",
    note: "ขนาดที่เหมาะสมขึ้นอยู่กับหลังคาและจังหวะการใช้ไฟ Wizard จะช่วยวิเคราะห์ต่อ",
  },
  flow: {
    ...english.flow,
    title: "พลังงานจากหลังคามีที่ไปเสมอ",
    description: "การผลิตไฟฟ้าและการใช้ไฟในบ้านเกิดขึ้นพร้อมกัน เปิดใช้งานบางอย่างเพื่อดูสมดุลที่เปลี่ยนไป",
    solar: "การผลิตจากแสงอาทิตย์",
    home: "การใช้ไฟในบ้าน",
    grid: "โครงข่ายไฟฟ้า",
    appliances: "เพิ่มการใช้ไฟในบ้าน",
    airConditioner: "เครื่องปรับอากาศ",
    evCharger: "เครื่องชาร์จรถไฟฟ้า",
    waterHeater: "เครื่องทำน้ำอุ่น",
    poolPump: "ปั๊มสระว่ายน้ำ",
    directUse: "ใช้ในบ้านโดยตรง",
    excess: "ส่งส่วนเกินเข้าโครงข่าย",
    importing: "ดึงไฟจากโครงข่าย",
    exporting: "ส่งไฟเข้าโครงข่าย",
    simulation: "พลังงานจำลองเพื่อการเรียนรู้",
  },
  battery: {
    ...english.battery,
    title: "เมื่อดวงอาทิตย์ลับฟ้า จะเกิดอะไรขึ้น",
    description: "แบตเตอรี่ไม่ได้สร้างไฟฟ้า แต่ย้ายพลังงานจากช่วงกลางวันที่สว่างไปยังช่วงที่หลังคาเงียบ",
    battery: "แบตเตอรี่",
    off: "ปิด",
    on: "เปิด",
    daytime: "กลางวัน",
    evening: "ช่วงเย็น",
    stored: "พลังงานที่เก็บไว้",
    grid: "ไฟจากโครงข่าย",
    note: "แบตเตอรี่ช่วยเพิ่มการใช้ไฟที่ผลิตเองได้ แต่ความคุ้มค่าขึ้นอยู่กับรูปแบบการใช้ไฟและการออกแบบระบบ",
  },
  inspect: {
    ...english.inspect,
    label: "เรื่องที่ควรรู้",
    title: "ระบบโซลาร์ที่ดีเริ่มก่อนติดตั้งแผง",
    description: "แตะที่บ้านเพื่อดูรายละเอียดที่มีผลต่อการติดตั้ง สิ่งเหล่านี้คือส่วนหนึ่งของการออกแบบ ไม่ใช่รายละเอียดปลีกย่อย",
    tap: "เลือกหัวข้อ",
  },
  system: {
    ...english.system,
    title: "โซลาร์มีมากกว่าแผง",
    description: "ระบบที่คิดมาอย่างดีรวมอุปกรณ์ งานไฟฟ้า วิศวกรรม และทีมติดตั้งเข้าด้วยกัน",
    panel: "แผงโซลาร์",
    mounting: "โครงยึด",
    inverter: "อินเวอร์เตอร์",
    protection: "ระบบป้องกัน",
    monitoring: "ระบบมอนิเตอร์",
    battery: "แบตเตอรี่",
    engineering: "วิศวกรรม",
    installation: "การติดตั้ง",
    warranty: "การรับประกัน",
    complete: "ระบบที่สมบูรณ์",
  },
  decision: {
    ...english.decision,
    title: "พร้อมค้นหาระบบที่เหมาะกับคุณหรือยัง",
    description: "เลือกวิธีไปต่อให้เหมาะกับสิ่งที่คุณรู้ในวันนี้ ทั้งสองเส้นทางนำไปสู่การออกแบบระบบที่คิดมาเพื่อบ้าน",
    buildTitle: "ฉันรู้แล้วว่าต้องการอะไร",
    buildDescription: "รู้คร่าว ๆ แล้วว่าต้องการกี่ kWp ใช่ไหม ปรับระบบ อุปกรณ์ และออปชันได้ด้วยตัวเอง",
    buildCta: "สร้างระบบของฉัน",
    wizardTitle: "ช่วยฉันเลือก",
    wizardDescription: "ยังไม่แน่ใจว่าบ้านเหมาะกับระบบแบบไหน บอกข้อมูลการใช้ไฟและเงื่อนไขติดตั้งเพื่อรับคำแนะนำ",
    wizardCta: "เริ่ม Smart Wizard",
  },
  projects: {
    ...english.projects,
    intro: "จากการจำลองสู่บ้านจริง",
    title: "ทุกหลังคามีจังหวะของตัวเอง",
    description: "ผลงาน SolarDream เหล่านี้แสดงการแปลงแสงอาทิตย์ให้กลายเป็นพลังงานที่ใช้งานได้จริง",
    viewProject: "ดูโครงการ",
    viewAll: "ดูผลงานทั้งหมด",
    empty: "กำลังเตรียมเรื่องราวจากโครงการของเรา",
    residential: "บ้านพักอาศัย",
    villa: "วิลล่า",
    commercial: "ธุรกิจ",
    simulation: "ติดตั้งจริง",
  },
  finale: {
    ...english.finale,
    title: "หลังคาของคุณก็เป็นส่วนหนึ่งของเรื่องนี้ได้",
    description: "เริ่มจากแสงที่บ้านคุณมี แล้วให้เราช่วยทำความเข้าใจส่วนที่เหลือ",
    cta: "ออกแบบ Solar Dream ของคุณ",
    build: "Build",
    wizard: "Wizard",
    night: "พลังงานยังคงเดินทางหลังพระอาทิตย์ตก",
  },
};

export function getSolarJourneyCopy(locale: string): SolarJourneyCopy {
  return locale === "th" ? thai : english;
}
