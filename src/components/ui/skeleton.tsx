import { cn } from "@/lib/utils";

export default function Skeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-bagui="skeleton"
      className={cn(
        "rounded-lg bg-muted motion-safe:animate-pulse",
        className,
      )}
    />
  );
}
