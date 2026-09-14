import { getServiceCatalogAdminData } from "@/app/actions/adminServiceCatalog";
import ServiceCatalogAdminClient from "./ServiceCatalogAdminClient";


export default async function AdminServicesPage() {
  const data = await getServiceCatalogAdminData();
  return (
    <ServiceCatalogAdminClient
      data={
        JSON.parse(JSON.stringify(data)) as Parameters<
          typeof ServiceCatalogAdminClient
        >[0]["data"]
      }
    />
  );
}
