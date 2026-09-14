import { cn } from "@/lib/utils";
import LoadingProgress from "./loading-progress";
import { SolarRouteShell } from "./solar-route-shell";

type SolarRouteLoadingProps = Readonly<{
  className?: string;
}>;

/** Shared route transition so customer pages enter the same atmosphere. */
export function SolarRouteLoading({ className }: SolarRouteLoadingProps) {
  return (
    <SolarRouteShell
      className={cn("solar-route-loading px-4 sm:px-6 lg:px-8", className)}
    >
      <LoadingProgress mode="route" />
    </SolarRouteShell>
  );
}
