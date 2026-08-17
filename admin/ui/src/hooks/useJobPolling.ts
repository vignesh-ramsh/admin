import { useEffect, useRef, useState } from "react";

/** Polls `fetchFn` on an interval until `isTerminal(job)` says to stop —
 *  the shared piece between Import and Export's progress steps. This
 *  codebase has no polling anywhere else (every other list/detail view
 *  refetches on a user action — a filter change, a manual Refresh click
 *  — never on a timer), so this is genuinely new, small infrastructure,
 *  not a variant of something that already existed.
 *
 *  setTimeout-chained, not a raw setInterval: the next poll is only
 *  scheduled once the current one resolves, so a slow request can never
 *  overlap the next tick and race it. Stops immediately once terminal,
 *  and on unmount — a `mounted` ref guards every state update after
 *  either, since `fetch()` itself isn't cancelled mid-flight (client.ts's
 *  call() takes no AbortSignal), only its *effect* on this hook's state
 *  is suppressed. */
export function useJobPolling<T extends { status: string }>(
  fetchFn: () => Promise<T>,
  isTerminal: (job: T) => boolean,
  intervalMs = 1500,
): { job: T | null; error: string | null } {
  const [job, setJob] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  useEffect(() => {
    mountedRef.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const next = await fetchFnRef.current();
        if (!mountedRef.current) return;
        setJob(next);
        setError(null);
        if (!isTerminal(next)) {
          timer = setTimeout(tick, intervalMs);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to check job status");
        timer = setTimeout(tick, intervalMs);
      }
    };

    tick();
    return () => {
      mountedRef.current = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  return { job, error };
}
