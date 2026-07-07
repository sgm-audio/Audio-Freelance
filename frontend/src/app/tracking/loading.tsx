import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-80 mt-1" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-3 animate-pulse">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-6 w-8 mt-1" />
          </div>
        ))}
      </div>
      <div>
        <Skeleton className="h-4 w-40 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3 animate-pulse">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-3 w-32 mt-0.5" />
                  <div className="flex items-center gap-3 mt-1">
                    <Skeleton className="h-5 w-20 rounded" />
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-3 w-10 shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4 animate-pulse">
        <Skeleton className="h-4 w-24 mb-3" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Skeleton className="h-4 w-8 mb-1" />
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-3 w-32 mb-1" />
            ))}
          </div>
          <div>
            <Skeleton className="h-4 w-8 mb-1" />
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-3 w-32 mb-1" />
            ))}
          </div>
        </div>
      </div>
      <div>
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="space-y-1">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="flex items-center gap-3 py-1 animate-pulse">
              <Skeleton className="h-3 w-16 shrink-0" />
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
