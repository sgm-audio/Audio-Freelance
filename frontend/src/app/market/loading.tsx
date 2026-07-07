import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-56 mt-1" />
        </div>
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>
      <Skeleton className="h-20 rounded-lg" />
      <div>
        <Skeleton className="h-6 w-40 mb-4" />
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex p-3 border-b border-border">
            <Skeleton className="h-4 w-24" />
          </div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex p-3 border-b border-border last:border-0">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-12 ml-auto" />
              <Skeleton className="h-4 w-20 ml-16" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-6 w-44 mb-4" />
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex p-3 border-b border-border">
            <Skeleton className="h-4 w-16" />
          </div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex p-3 border-b border-border last:border-0">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24 ml-auto" />
              <Skeleton className="h-4 w-20 ml-12" />
              <Skeleton className="h-4 w-8 ml-16" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-6 w-36 mb-4" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4 animate-pulse">
              <div className="flex items-center gap-2 mb-1">
                <Skeleton className="h-4 w-16 rounded" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-full mt-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
