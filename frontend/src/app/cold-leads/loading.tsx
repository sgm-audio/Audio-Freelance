import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-64 mt-1" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-7 w-10 rounded-md" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-3 animate-pulse">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-6 w-8 mt-1" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-3 animate-pulse">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-3 w-6 shrink-0" />
                </div>
                <Skeleton className="h-3 w-32 mt-0.5" />
                <Skeleton className="h-3 w-full mt-1" />
              </div>
              <div className="text-right shrink-0">
                <Skeleton className="h-4 w-8 ml-auto" />
                <Skeleton className="h-3 w-20 mt-1 ml-auto" />
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
