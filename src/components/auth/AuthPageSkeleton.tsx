import Skeleton from "@/components/ui/skeleton";

export function AuthFormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-pill" />
      <Skeleton className="h-12 w-full rounded-pill" />
    </div>
  );
}

export default function AuthPageSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading account page"
      className="min-h-dvh bg-background"
    >
      <div className="mx-auto grid min-h-dvh w-full max-w-[90rem] lg:grid-cols-[minmax(0,1fr)_minmax(26rem,0.78fr)]">
        <section className="flex min-h-dvh flex-col bg-[#F5F2EB]">
          <div className="flex min-h-20 items-center justify-between border-b border-border px-4 sm:px-8 lg:px-10">
            <Skeleton className="h-10 w-40" />
            <div className="flex gap-2">
              <Skeleton className="h-11 w-16 rounded-pill" />
              <Skeleton className="h-11 w-24 rounded-pill" />
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
            <div className="w-full max-w-lg space-y-7">
              <div className="space-y-3">
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-4/5" />
              </div>
              <div className="border-t border-border pt-7">
                <AuthFormSkeleton />
              </div>
            </div>
          </div>
        </section>
        <Skeleton className="hidden min-h-dvh rounded-none bg-slate-200 lg:block" />
      </div>
    </div>
  );
}
