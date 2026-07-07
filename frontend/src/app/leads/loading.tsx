import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-4 w-48 mt-1" />
        </div>
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 11 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-14 rounded-md" />
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 animate-pulse">
            <div className="flex items-center gap-2">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-5 w-3/4" />
            </div>
            <Skeleton className="h-3 w-32 mt-1" />
            <Skeleton className="h-3 w-full mt-1" />
            <div className="flex gap-4 mt-2">
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
