import { NextResponse } from "next/server";
import { getPostalCode } from "geothai";


type ThaiAddressMatch = {
  postalCode: string;
  province: string;
  district: string;
  subdistrict: string;
  provinceCode: string;
  districtCode: string;
  subdistrictCode: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const postalCode =
    searchParams.get("postalCode")?.replace(/\D/g, "").slice(0, 5) ?? "";

  if (postalCode.length !== 5) {
    return NextResponse.json({ matches: [] satisfies ThaiAddressMatch[] });
  }

  type PostalCodeIndex = Parameters<typeof getPostalCode>[0];
  const record = getPostalCode(postalCode as PostalCodeIndex);
  if (!record?.addresses?.length) {
    return NextResponse.json({ matches: [] satisfies ThaiAddressMatch[] });
  }

  const matches: ThaiAddressMatch[] = record.addresses.map((address) => ({
    postalCode,
    province: address.province_name_th,
    district: address.district_name_th,
    subdistrict: address.subdistrict_name_th,
    provinceCode: String(address.province_code),
    districtCode: String(address.district_code),
    subdistrictCode: String(address.subdistrict_code),
  }));

  return NextResponse.json({ matches });
}
