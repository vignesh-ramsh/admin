import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

/** A sentinel div that calls `onReachEnd` once it scrolls into view — the
 *  "pull more rows on demand" half of every cursor-paginated list. Renders
 *  nothing once `hasMore` is false, so it never becomes an inert dead zone
 *  at the bottom of a fully-loaded table. */
export function InfiniteScroll({
  onReachEnd,
  hasMore,
  loading,
}: {
  onReachEnd: () => void;
  hasMore: boolean;
  loading?: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onReachEnd();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, onReachEnd]);

  if (!hasMore) return null;

  return (
    <div ref={sentinelRef} className="flex items-center justify-center py-3 text-text-faint">
      {loading && <Loader2 size={16} className="animate-spin" />}
    </div>
  );
}
