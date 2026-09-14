import { getKnowledgeBaseConfigAction } from "@/app/actions/support";
import KnowledgeBaseConfigClient from "./KnowledgeBaseConfigClient";

export const metadata = {
  title: "Knowledge Base Config | Admin | SolarDream",
  description: "Manage public FAQs, instructional videos, and system troubleshooting guides.",
};

export default async function KnowledgeBaseConfigPage() {
  "use cache";
  const kbConfig = await getKnowledgeBaseConfigAction();
  return <KnowledgeBaseConfigClient initialConfig={kbConfig} />;
}
