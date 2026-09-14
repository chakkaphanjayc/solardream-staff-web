export type ThaiProvince = {
  id: string;
  nameTh: string;
  nameEn: string;
};

export const THAI_PROVINCES: readonly ThaiProvince[] = [
  { id: "bangkok", nameTh: "กรุงเทพมหานคร", nameEn: "Bangkok" },
  { id: "krabi", nameTh: "กระบี่", nameEn: "Krabi" },
  { id: "kanchanaburi", nameTh: "กาญจนบุรี", nameEn: "Kanchanaburi" },
  { id: "kalasin", nameTh: "กาฬสินธุ์", nameEn: "Kalasin" },
  { id: "kamphaengphet", nameTh: "กำแพงเพชร", nameEn: "Kamphaeng Phet" },
  { id: "khonkaen", nameTh: "ขอนแก่น", nameEn: "Khon Kaen" },
  { id: "chanthaburi", nameTh: "จันทบุรี", nameEn: "Chanthaburi" },
  { id: "chachoengsao", nameTh: "ฉะเชิงเทรา", nameEn: "Chachoengsao" },
  { id: "chonburi", nameTh: "ชลบุรี", nameEn: "Chon Buri" },
  { id: "chainat", nameTh: "ชัยนาท", nameEn: "Chai Nat" },
  { id: "chaiyaphum", nameTh: "ชัยภูมิ", nameEn: "Chaiyaphum" },
  { id: "chumphon", nameTh: "ชุมพร", nameEn: "Chumphon" },
  { id: "chiangrai", nameTh: "เชียงราย", nameEn: "Chiang Rai" },
  { id: "chiangmai", nameTh: "เชียงใหม่", nameEn: "Chiang Mai" },
  { id: "trang", nameTh: "ตรัง", nameEn: "Trang" },
  { id: "trat", nameTh: "ตราด", nameEn: "Trat" },
  { id: "tak", nameTh: "ตาก", nameEn: "Tak" },
  { id: "nakhonnayok", nameTh: "นครนายก", nameEn: "Nakhon Nayok" },
  { id: "nakhonpathom", nameTh: "นครปฐม", nameEn: "Nakhon Pathom" },
  { id: "nakhonphanom", nameTh: "นครพนม", nameEn: "Nakhon Phanom" },
  { id: "nakhonratchasima", nameTh: "นครราชสีมา", nameEn: "Nakhon Ratchasima" },
  { id: "nakhonsithammarat", nameTh: "นครศรีธรรมราช", nameEn: "Nakhon Si Thammarat" },
  { id: "nakhonsawan", nameTh: "นครสวรรค์", nameEn: "Nakhon Sawan" },
  { id: "nonthaburi", nameTh: "นนทบุรี", nameEn: "Nonthaburi" },
  { id: "narathiwat", nameTh: "นราธิวาส", nameEn: "Narathiwat" },
  { id: "nan", nameTh: "น่าน", nameEn: "Nan" },
  { id: "buengkan", nameTh: "บึงกาฬ", nameEn: "Bueng Kan" },
  { id: "buriram", nameTh: "บุรีรัมย์", nameEn: "Buri Ram" },
  { id: "pathumthani", nameTh: "ปทุมธานี", nameEn: "Pathum Thani" },
  { id: "prachuapkhirikhan", nameTh: "ประจวบคีรีขันธ์", nameEn: "Prachuap Khiri Khan" },
  { id: "prachinburi", nameTh: "ปราจีนบุรี", nameEn: "Prachin Buri" },
  { id: "pattani", nameTh: "ปัตตานี", nameEn: "Pattani" },
  { id: "phranakhonsiayutthaya", nameTh: "พระนครศรีอยุธยา", nameEn: "Phra Nakhon Si Ayutthaya" },
  { id: "phayao", nameTh: "พะเยา", nameEn: "Phayao" },
  { id: "phangnga", nameTh: "พังงา", nameEn: "Phangnga" },
  { id: "phatthalung", nameTh: "พัทลุง", nameEn: "Phatthalung" },
  { id: "phichit", nameTh: "พิจิตร", nameEn: "Phichit" },
  { id: "phitsanulok", nameTh: "พิษณุโลก", nameEn: "Phitsanulok" },
  { id: "phetchaburi", nameTh: "เพชรบุรี", nameEn: "Phetchaburi" },
  { id: "phetchabun", nameTh: "เพชรบูรณ์", nameEn: "Phetchabun" },
  { id: "phrae", nameTh: "แพร่", nameEn: "Phrae" },
  { id: "phuket", nameTh: "ภูเก็ต", nameEn: "Phuket" },
  { id: "mahasarakham", nameTh: "มหาสารคาม", nameEn: "Maha Sarakham" },
  { id: "mukdahan", nameTh: "มุกดาหาร", nameEn: "Mukdahan" },
  { id: "maehongson", nameTh: "แม่ฮ่องสอน", nameEn: "Mae Hong Son" },
  { id: "yasothon", nameTh: "ยโสธร", nameEn: "Yasothon" },
  { id: "yala", nameTh: "ยะลา", nameEn: "Yala" },
  { id: "roiet", nameTh: "ร้อยเอ็ด", nameEn: "Roi Et" },
  { id: "ranong", nameTh: "ระนอง", nameEn: "Ranong" },
  { id: "rayong", nameTh: "ระยอง", nameEn: "Rayong" },
  { id: "ratchaburi", nameTh: "ราชบุรี", nameEn: "Ratchaburi" },
  { id: "lopburi", nameTh: "ลพบุรี", nameEn: "Lop Buri" },
  { id: "lampang", nameTh: "ลำปาง", nameEn: "Lampang" },
  { id: "lamphun", nameTh: "ลำพูน", nameEn: "Lamphun" },
  { id: "loei", nameTh: "เลย", nameEn: "Loei" },
  { id: "sisaket", nameTh: "ศรีสะเกษ", nameEn: "Si Sa Ket" },
  { id: "sakonnakhon", nameTh: "สกลนคร", nameEn: "Sakon Nakhon" },
  { id: "songkhla", nameTh: "สงขลา", nameEn: "Songkhla" },
  { id: "satun", nameTh: "สตูล", nameEn: "Satun" },
  { id: "samutprakan", nameTh: "สมุทรปราการ", nameEn: "Samut Prakan" },
  { id: "samutsongkhram", nameTh: "สมุทรสงคราม", nameEn: "Samut Songkhram" },
  { id: "samutsakhon", nameTh: "สมุทรสาคร", nameEn: "Samut Sakhon" },
  { id: "sakaeo", nameTh: "สระแก้ว", nameEn: "Sa Kaeo" },
  { id: "saraburi", nameTh: "สระบุรี", nameEn: "Saraburi" },
  { id: "singburi", nameTh: "สิงห์บุรี", nameEn: "Sing Buri" },
  { id: "sukhothai", nameTh: "สุโขทัย", nameEn: "Sukhothai" },
  { id: "suphanburi", nameTh: "สุพรรณบุรี", nameEn: "Suphan Buri" },
  { id: "suratthani", nameTh: "สุราษฎร์ธานี", nameEn: "Surat Thani" },
  { id: "surin", nameTh: "สุรินทร์", nameEn: "Surin" },
  { id: "nongkhai", nameTh: "หนองคาย", nameEn: "Nong Khai" },
  { id: "nongbualamphu", nameTh: "หนองบัวลำภู", nameEn: "Nong Bua Lam Phu" },
  { id: "angthong", nameTh: "อ่างทอง", nameEn: "Ang Thong" },
  { id: "amnatcharoen", nameTh: "อำนาจเจริญ", nameEn: "Amnat Charoen" },
  { id: "udonthani", nameTh: "อุดรธานี", nameEn: "Udon Thani" },
  { id: "uttaradit", nameTh: "อุตรดิตถ์", nameEn: "Uttaradit" },
  { id: "uthaithani", nameTh: "อุทัยธานี", nameEn: "Uthai Thani" },
  { id: "ubonratchathani", nameTh: "อุบลราชธานี", nameEn: "Ubon Ratchathani" },
  { id: "other", nameTh: "จังหวัดอื่นๆ", nameEn: "Other Province" },
] as const;

export function getProvinceLabel(provinceId: string, locale = "th"): string {
  if (!provinceId) return "";
  const normalized = provinceId.trim().toLowerCase();
  const match = THAI_PROVINCES.find(
    (p) => p.id === normalized || p.nameEn.toLowerCase() === normalized || p.nameTh === provinceId,
  );
  if (match) {
    return locale === "th" ? match.nameTh : match.nameEn;
  }
  return provinceId;
}
