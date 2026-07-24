import { useEffect, useState } from "react";

/** Returns `value`, but only updates after it's stopped changing for
 *  `delayMs` — used to keep search/filter inputs from firing a server
 *  request on every keystroke. */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
