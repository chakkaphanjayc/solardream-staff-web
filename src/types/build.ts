import type { BuildConfig } from "@/lib/buildConfig";

export type BuildPanelState = "summary" | "auth-prompt" | "form";

export interface BuildCapacityTier {
  id: string;
  label: string;
  kwp: number;
  helper: string;
}

export type BuildArchitectureId = "on-grid" | "hybrid";

export interface BuildArchitectureOption {
  id: BuildArchitectureId;
  title: string;
  description: string;
}

export interface BuildAddOnOption {
  id: string;
  title: string;
  description: string;
}

export interface BuildConfiguratorProps {
  initialBuildConfig?: BuildConfig;
}
