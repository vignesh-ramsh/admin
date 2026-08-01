import { useEffect, useRef } from "react";

/** Auto-focuses the returned ref's input as soon as the page mounts, and
 *  refocuses it whenever "/" is pressed anywhere else on the page — the
 *  common "jump to search" convention (GitHub, Slack, Linear, …) — so a
 *  user can start typing a filter immediately after landing on a page, or
 *  jump back into it later, without ever reaching for the mouse. Skipped
 *  while some other input/textarea/contenteditable already has focus, so
 *  "/" still types normally there instead of stealing focus mid-edit. */
export function usePageSearchFocus<T extends HTMLInputElement = HTMLInputElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || active?.isContentEditable) return;
      e.preventDefault();
      ref.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return ref;
}
