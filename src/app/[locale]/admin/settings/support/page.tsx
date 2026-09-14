import { getSupportConfigAction } from "@/app/actions/support";
import SupportConfigClient from "./SupportConfigClient";

export const metadata = {
  title: "Support Configuration | Admin | SolarDream",
  description: "Configure support portal channels, SLAs, hero text, and feature flags.",
};

export default async function SupportConfigPage() {
  const config = await getSupportConfigAction();
  return <SupportConfigClient initialConfig={config} />;
}
