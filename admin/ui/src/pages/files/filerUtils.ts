/** Shared formatting helpers for the File Manager pages. */

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—";
  if (bytes === 0) return "0 B";
  const i = Math.min(UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${i === 0 ? value : value.toFixed(1)} ${UNITS[i]}`;
}

// Must match filer/__init__.py's _INLINE_ALLOWLIST exactly — the backend
// serve endpoint sends `Content-Disposition: attachment` for anything NOT
// in that set (deliberately: it never trusts a browser to render an
// uploaded text/html/svg/json inline, to keep an uploaded file from ever
// executing as same-origin content — see filer/__init__.py §9/§12). A
// broader client-side guess like "any image/*" or "any text/*" would
// render an <img>/<iframe> pointing at a URL the server force-downloads
// instead — the preview silently turns into a download with nothing
// showing, which is exactly the bug this set exists to avoid.
const INLINE_ALLOWLIST = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

export function canPreviewInline(contentType: string | null | undefined): boolean {
  return !!contentType && INLINE_ALLOWLIST.has(contentType);
}

export function isImageType(contentType: string | null | undefined): boolean {
  return contentType === "image/png" || contentType === "image/jpeg" || contentType === "image/gif" || contentType === "image/webp";
}
