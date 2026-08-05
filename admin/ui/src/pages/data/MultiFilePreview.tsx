import { DataTable, type Column } from "../../components/Table";
import { EmptyState } from "../../components/States";
import { FilePreviewChip } from "./FieldPreview";

interface MultiFileEntry {
  label?: string;
  fileid: string;
}

/** MULTIFILE preview — a real Label/File table (point 3), not the raw JSON
 *  the editable form still uses. The value is already inline on the row
 *  (a JSONB column), so no fetch is needed here beyond resolving each
 *  fileid's filename for display (FilePreviewChip, shared with FILE
 *  fields). Same ~10-visible-rows-then-scroll cap as ChildTablePreview. */
export function MultiFilePreview({
  value,
  onOpenFile,
}: {
  value: unknown;
  onOpenFile: (fileId: string) => void;
}) {
  const entries: MultiFileEntry[] = Array.isArray(value)
    ? value.filter((e): e is MultiFileEntry => !!e && typeof e === "object" && typeof (e as MultiFileEntry).fileid === "string")
    : [];

  if (entries.length === 0) {
    return <EmptyState title="No files" bordered={false} />;
  }

  const columns: Column<MultiFileEntry>[] = [
    { key: "label", header: "Label", render: (e) => e.label || <span className="text-text-faint">—</span> },
    {
      key: "file",
      header: "File",
      render: (e) => <FilePreviewChip fileId={e.fileid} onOpen={onOpenFile} />,
    },
  ];

  // No onRowClick here (unlike ChildTablePreview) — the File cell is
  // already its own clickable chip; making the WHOLE row clickable too
  // would double-fire on every click (the chip's own onClick bubbles up
  // to the row's), which with togglePanel's open/close-on-repeat-click
  // semantics silently opens the panel and then immediately closes it
  // again in the same click — found live, not by inspection.
  return (
    <div className="scrollbar-thin max-h-[22rem] overflow-y-auto rounded-lg">
      <DataTable columns={columns} rows={entries} rowKey={(e) => e.fileid} />
    </div>
  );
}
