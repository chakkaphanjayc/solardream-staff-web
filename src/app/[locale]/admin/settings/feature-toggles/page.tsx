import { getFeatureFlags } from "@/app/actions/featureFlags";
import FeatureTogglesClient from "./FeatureTogglesClient";


export default async function FeatureTogglesPage() {
  const initialFlags = await getFeatureFlags();

  return <FeatureTogglesClient initialFlags={initialFlags} />;
}
