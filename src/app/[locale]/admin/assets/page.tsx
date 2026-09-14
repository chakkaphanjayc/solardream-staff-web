import { connection } from "next/server";
import { getAdminAssetRegistrationData } from "@/app/actions/assets";
import AssetsClient from "./AssetsClient";

export const instant = false;

export default async function AdminAssetsPage() {
  await connection();

  const result = await getAdminAssetRegistrationData();

  return (
    <AssetsClient
      initialAssets={result.success ? result.assets || [] : []}
      initialRegistrations={result.success ? result.registrations || [] : []}
      users={result.success ? result.users || [] : []}
      products={result.success ? result.products || [] : []}
      initialError={result.error || ""}
    />
  );
}
