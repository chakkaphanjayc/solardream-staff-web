import Skeleton from "@/components/ui/skeleton";

type AdminPageSkeletonProps = {
  variant?: "dashboard" | "table";
  rows?: number;
};

function PageHeading() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-64 sm:w-80" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="h-11 w-36 rounded-full" />
    </div>
  );
}

export default function AdminPageSkeleton({ variant = "table", rows = 7 }: AdminPageSkeletonProps) {
  if (variant === "dashboard") {
    return (
      <div className="space-y-8" role="status" aria-label="Loading admin dashboard">
        <PageHeading />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-md" />)}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <Skeleton className="h-48 rounded-md" />
          <Skeleton className="h-48 rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" role="status" aria-label="Loading admin workspace">
      <PageHeading />
      <section className="rounded-xl border border-slate-800 bg-[#0F172A] p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_9rem]">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-800 bg-[#0F172A]">
        <div className="grid grid-cols-[minmax(12rem,1.5fr)_minmax(9rem,1fr)_8rem_7rem] gap-5 border-b border-slate-800 px-5 py-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-3" />)}
        </div>
        <div className="divide-y divide-slate-800">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="grid grid-cols-[minmax(12rem,1.5fr)_minmax(9rem,1fr)_8rem_7rem] items-center gap-5 px-5 py-4">
              <div className="space-y-2"><Skeleton className="h-4 w-3/5" /><Skeleton className="h-3 w-4/5" /></div>
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="ml-auto h-9 w-9 rounded-md" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
