import type { FilerFileRow } from "../../api/types";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

export function statusTone(status: FilerFileRow["status"]): "neutral" | "success" | "warning" | "danger" | "accent" {
  switch (status) {
    case "clean":
    case "skipped":
      return "success";
    case "pending":
      return "warning";
    case "infected":
      return "danger";
    case "deleted":
      return "neutral";
    default:
      return "neutral";
  }
}

const INLINE_PREVIEWABLE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

export function isPreviewable(contentType: string): boolean {
  return INLINE_PREVIEWABLE.has(contentType);
}

export function isImage(contentType: string): boolean {
  return contentType.startsWith("image/");
}
