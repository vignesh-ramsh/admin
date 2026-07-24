/** Shared formatting helpers for the File Manager pages. */

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—";
  if (bytes === 0) return "0 B";
  const i = Math.min(UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${i === 0 ? value : value.toFixed(1)} ${UNITS[i]}`;
}

export function isImageType(contentType: string | null | undefined): boolean {
  return !!contentType && contentType.startsWith("image/");
}

export function isTextType(contentType: string | null | undefined): boolean {
  return !!contentType && (contentType.startsWith("text/") || contentType === "application/json");
}
