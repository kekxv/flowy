import { useEffect } from "react";
import { holdRouteProgress, finishRouteProgress } from "../../utils/routeProgress";

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton block ${className}`} aria-hidden="true" />;
}

/** Generic list skeleton used while page data loads. */
export function ListSkeleton({ rows = 6, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`panel divide-y divide-[var(--border-light)] overflow-hidden ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-[13px]">
          <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="hidden h-3 w-20 sm:block" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="panel p-4">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="mt-2.5 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-4/5" />
          <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Suspense fallback shown inside the app shell while a route chunk loads. */
export default function PageFallback() {
  useEffect(() => {
    holdRouteProgress();
    return () => finishRouteProgress();
  }, []);

  return (
    <div className="page-enter" aria-busy="true" aria-label="Loading">
      <div className="page-head">
        <div>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2.5 h-3 w-56" />
        </div>
        <Skeleton className="h-7 w-24 rounded-[8px]" />
      </div>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel px-4 py-3.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="mt-2.5 h-5 w-12" />
            </div>
          ))}
        </div>
        <div className="panel p-4">
          <Skeleton className="h-3 w-28" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-5 shrink-0 rounded-[6px]" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
