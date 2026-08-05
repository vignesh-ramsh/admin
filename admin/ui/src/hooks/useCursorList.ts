import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export interface CursorPage<T> {
  rows: T[];
  next_cursor: string | null;
  total: number;
}

/** Generic cursor/keyset-paginated list — backs every infinite-scroll table
 *  in the admin console (admin._pagination.cursor_page is the matching
 *  server-side half). `fetchPage` should be a useCallback closing over the
 *  page's own table/filters/sort/search state so its identity changes
 *  exactly when a fresh first page is needed; `deps` drives that reload,
 *  same "nonce + deps, loader itself left out of the effect" convention
 *  useAsync already uses. */
export function useCursorList<T>({
  fetchPage,
  limit = 50,
  rowKey,
  deps = [],
}: {
  fetchPage: (cursor: string | null, limit: number) => Promise<CursorPage<T>>;
  limit?: number;
  rowKey: (row: T) => string;
  deps?: unknown[];
}) {
  const { onUnauthorized } = useAuth();
  const [rows, setRows] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards a slow, now-superseded request (table/filters changed again
  // before it resolved) from clobbering newer state when it finally lands —
  // the same class of bug useAsync's own `cancelled` flag guards against.
  const requestSeq = useRef(0);

  const handleErr = useCallback(
    (err: unknown): boolean => {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return true;
      }
      return false;
    },
    [onUnauthorized],
  );

  const load = useCallback(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    fetchPage(null, limit)
      .then((page) => {
        if (seq !== requestSeq.current) return;
        setRows(page.rows);
        setCursor(page.next_cursor);
        setHasMore(page.next_cursor !== null);
        setTotal(page.total);
      })
      .catch((err) => {
        if (seq !== requestSeq.current) return;
        if (!handleErr(err)) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, [fetchPage, limit, handleErr]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore || cursor === null) return;
    const seq = requestSeq.current;
    setLoadingMore(true);
    fetchPage(cursor, limit)
      .then((page) => {
        if (seq !== requestSeq.current) return;
        setRows((cur) => [...cur, ...page.rows]);
        setCursor(page.next_cursor);
        setHasMore(page.next_cursor !== null);
        setTotal(page.total);
      })
      .catch((err) => {
        if (seq !== requestSeq.current) return;
        if (!handleErr(err)) setError(err instanceof Error ? err.message : "Failed to load more");
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoadingMore(false);
      });
  }, [fetchPage, cursor, limit, loading, loadingMore, hasMore, handleErr]);

  // Local, synchronous mutations — no refetch. This is what makes bulk
  // delete/edit feel real-time: the caller's API call succeeds, then it
  // calls one of these directly instead of waiting on a reload.
  const removeByIds = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      setRows((cur) => cur.filter((r) => !idSet.has(rowKey(r))));
      setTotal((t) => (t !== null ? Math.max(0, t - ids.length) : t));
    },
    [rowKey],
  );

  const patchByIds = useCallback(
    (ids: string[], patch: Partial<T>) => {
      const idSet = new Set(ids);
      setRows((cur) => cur.map((r) => (idSet.has(rowKey(r)) ? { ...r, ...patch } : r)));
    },
    [rowKey],
  );

  return { rows, loading, loadingMore, hasMore, total, error, reload: load, loadMore, removeByIds, patchByIds };
}
