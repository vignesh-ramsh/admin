import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";

type SaveHandler = () => void;
interface SaveRegistration {
  handler: SaveHandler;
  enabled: boolean;
}

interface SaveShortcutApi {
  register: (id: symbol, handler: SaveHandler, enabled: boolean) => void;
  unregister: (id: symbol) => void;
}

const SaveShortcutContext = createContext<SaveShortcutApi | null>(null);

/** Mounted once near the app root. Owns the one global Ctrl/Cmd+S listener
 *  and a registry of every currently-mounted save action, so pages and the
 *  modals opened on top of them can each declare their own Save without
 *  stepping on one another. */
export function SaveShortcutProvider({ children }: { children: ReactNode }) {
  // A Map preserves insertion order; delete-then-set on every (re)register
  // moves an entry to the end, so the most recently mounted/updated save
  // action is checked first — in practice, a modal's Save opened on top of
  // a page that also has one, since the modal registers after.
  const registryRef = useRef(new Map<symbol, SaveRegistration>());

  const register = useCallback((id: symbol, handler: SaveHandler, enabled: boolean) => {
    registryRef.current.delete(id);
    registryRef.current.set(id, { handler, enabled });
  }, []);

  const unregister = useCallback((id: symbol) => {
    registryRef.current.delete(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "s") return;
      // Always swallow the browser's own "Save Page As" — there is never a
      // reason to want that inside this app.
      e.preventDefault();
      const active = [...registryRef.current.values()].reverse().find((r) => r.enabled);
      active?.handler();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return <SaveShortcutContext.Provider value={{ register, unregister }}>{children}</SaveShortcutContext.Provider>;
}

/** Registers `onSave` as the target of Ctrl/Cmd+S for as long as the
 *  calling component is mounted. Pass `enabled={false}` while a save is
 *  already in flight (or nothing has changed yet) so the shortcut is a
 *  no-op rather than firing a second concurrent save. Safe to call from
 *  several mounted components at once — see SaveShortcutProvider above for
 *  how conflicts resolve. */
export function useSaveShortcut(onSave: SaveHandler, enabled = true): void {
  const ctx = useContext(SaveShortcutContext);
  const idRef = useRef<symbol | null>(null);
  if (idRef.current === null) idRef.current = Symbol("save-shortcut");

  useEffect(() => {
    if (!ctx) return;
    const id = idRef.current!;
    ctx.register(id, onSave, enabled);
    return () => ctx.unregister(id);
  }, [ctx, onSave, enabled]);
}
