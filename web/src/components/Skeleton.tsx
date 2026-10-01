/**
 * Loading skeletons: shimmer blocks instead of blank screens.
 */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`skeleton-shimmer ${className}`} aria-hidden="true" />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div
      className="divide-y divide-line rounded-lg border border-line bg-navy-900"
      role="status"
      aria-label="Loading cases"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-3.5">
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-64" />
            <SkeletonBlock className="h-3 w-40" />
          </div>
          <SkeletonBlock className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-line bg-navy-900"
      role="status"
      aria-label="Loading audit entries"
    >
      <div className="border-b border-line px-4 py-2.5">
        <SkeletonBlock className="h-3 w-96" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-6 border-b border-line/60 px-4 py-3 last:border-0"
        >
          <SkeletonBlock className="h-3 w-6" />
          <SkeletonBlock className="h-5 w-20 rounded" />
          <SkeletonBlock className="h-3 w-44" />
          <SkeletonBlock className="h-3 flex-1" />
          <SkeletonBlock className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}
