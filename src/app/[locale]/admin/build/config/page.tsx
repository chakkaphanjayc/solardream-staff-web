import { getBuildConfig } from "./actions";
import BuildConfigClient from "./BuildConfigClient";


export default async function AdminBuildConfigPage() {
  const config = await getBuildConfig();

  return <BuildConfigClient initialConfig={config} />;
}
