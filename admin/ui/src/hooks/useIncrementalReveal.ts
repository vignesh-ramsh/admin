import { useEffect, useRef, useState } from "react";

/**
 * Client-side "infinite scroll" over an already-fetched list — there's no
 * paginated backend for table/schema-file metadata (the real dataset is
 * small, a boot-time-cached list per project), so this just reveals more
 * of an already-complete array as a sentinel element scrolls into view,
 * rather than a real network-paginated feed.
 */
export function useIncrementalReveal<T>(items: T[], pageSize = 30) {
  const [count, setCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset the reveal window whenever the underlying (already filtered/
  // narrowed) list changes — otherwise a new search/filter would still
  // show however far a previous, longer list had been scrolled.
  useEffect(() => {
    setCount(pageSize);
  }, [items, pageSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setCount((c) => Math.min(c + pageSize, items.length));
        }
      },
      { root: el.parentElement, rootMargin: "120px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length, pageSize]);

  return { visible: items.slice(0, count), sentinelRef, hasMore: count < items.length };
}
