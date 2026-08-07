import type { SettingEntry } from "../../api/types";

/** The exact string forms arc.settings._coerce() accepts for a bool
 *  (arc/arc/settings.py) — kept in sync by hand since the frontend has
 *  no way to import that logic directly. Checked case-insensitively,
 *  same as the backend. */
const BOOL_TRUE = ["true", "1", "yes", "on"];
const BOOL_FALSE = ["false", "0", "no", "off"];

/** Client-side mirror of arc.settings._coerce()'s validation — a UX
 *  nicety that catches an obviously-wrong value before the round trip,
 *  never the actual source of truth (the server re-validates and is the
 *  one that can't be bypassed). Returns an error message, or null when
 *  `raw` would pass. `type: null` (nobody ever declared one for this
 *  key) always passes — an untyped setting accepts any string, exactly
 *  like every setting did before typed settings existed. */
export function validateSettingValue(type: SettingEntry["type"], raw: string): string | null {
  if (!type) return null;
  const trimmed = raw.trim();

  if (trimmed === "") {
    // An empty string is NOT "leave it alone" — set_setting("key", "")
    // really does store the literal empty string, and for a typed key
    // that now fails loudly the next time anything reads it (the exact,
    // real bug this validation exists to catch before it ships: two
    // settings in this very project were silently stuck on "" until
    // typed declare() started rejecting it at boot). Guide toward the
    // actual "go back to default" action instead of a value that looks
    // like it cleared the field but didn't.
    return `A typed setting can't be saved empty — use the CLI's "arc settings delete <key>" to clear it back to its default instead.`;
  }

  switch (type) {
    case "int":
      return /^[+-]?\d+$/.test(trimmed) ? null : "Must be a whole number, e.g. 30.";
    case "float":
      return Number.isFinite(Number(trimmed)) ? null : "Must be a number, e.g. 1.5.";
    case "bool": {
      const low = trimmed.toLowerCase();
      return BOOL_TRUE.includes(low) || BOOL_FALSE.includes(low)
        ? null
        : "Must be true/false, 1/0, yes/no, or on/off.";
    }
    case "str":
    default:
      return null;
  }
}

/** Normalizes whatever a bool-typed Switch's own boolean state should
 *  save as — "true"/"false" specifically (not e.g. "on"/"off"), so a
 *  round trip through this form always writes the same canonical
 *  spelling regardless of what the value happened to look like when it
 *  was loaded (an existing "1" or "yes" becomes "true" once re-saved,
 *  same normalize-on-write behavior arc.settings itself has no opinion
 *  on, but a UI can just as well default to). */
export function boolToSettingValue(value: boolean): string {
  return value ? "true" : "false";
}

/** The inverse — used to seed a bool-typed field's initial Switch state
 *  from whatever string is already stored (or the declared default when
 *  nothing is). Defensive default of `false` for a value that somehow
 *  doesn't match any accepted spelling — should never happen for a
 *  value that already passed validateSettingValue, but a form loading
 *  an EXISTING, possibly-hand-edited value hasn't necessarily gone
 *  through that gate yet. */
export function settingValueToBool(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  return BOOL_TRUE.includes(raw.trim().toLowerCase());
}
