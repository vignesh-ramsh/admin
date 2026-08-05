import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "../../components/Button";
import { TextInput } from "../../components/Field";
import { FilePicker } from "./FilePicker";

interface Entry {
  label: string;
  fileid: string;
}

/** MULTIFILE's editable counterpart to MultiFilePreview's read-only table
 *  (point 1: same table shape in edit mode too) — repeatable Label + File
 *  rows, each File cell a real FilePicker (point 2) instead of hand-typing
 *  a fileid into a raw JSON blob. The outer contract stays a JSON STRING
 *  in/out (`raw`/`onChange`) — RowEditorRoute's form state is `Record<
 *  string, string | boolean>` for every field uniformly, and validate.ts's
 *  own MULTIFILE check already parses/serializes the same way — this
 *  component is just a nicer editor over that exact same string value,
 *  not a new storage shape. */
export function MultiFileEditor({
  raw,
  onChange,
  disabled,
  error,
}: {
  raw: string;
  onChange: (raw: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const entries: Entry[] = useMemo(() => {
    if (!raw.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.map((e) => ({ label: String((e as Entry)?.label ?? ""), fileid: String((e as Entry)?.fileid ?? "") }))
        : [];
    } catch {
      return [];
    }
  }, [raw]);

  const emit = (next: Entry[]) => onChange(JSON.stringify(next));
  const update = (i: number, patch: Partial<Entry>) => emit(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const remove = (i: number) => emit(entries.filter((_, idx) => idx !== i));
  const add = () => emit([...entries, { label: "", fileid: "" }]);

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-xs text-danger">{error}</p>}
      {entries.length === 0 ? (
        <p className="text-[13px] text-text-faint">No files yet.</p>
      ) : (
        <div className="scrollbar-thin max-h-[22rem] overflow-y-auto rounded-lg border border-border">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-neutral-50 dark:bg-neutral-900/60">
                <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-text-faint">Label</th>
                <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-text-faint">File</th>
                <th className="w-9 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="w-48 px-3 py-1.5">
                    <TextInput
                      size="sm"
                      value={e.label}
                      onChange={(ev) => update(i, { label: ev.target.value })}
                      disabled={disabled}
                      placeholder="Label"
                    />
                  </td>
                  <td className="min-w-[220px] px-3 py-1.5">
                    <FilePicker value={e.fileid} onChange={(fileId) => update(i, { fileid: fileId })} disabled={disabled} />
                  </td>
                  <td className="px-2 py-1.5">
                    <IconButton label="Remove file" icon={<Trash2 size={14} />} onClick={() => remove(i)} disabled={disabled} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!disabled && (
        <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={add} className="w-fit">
          Add file
        </Button>
      )}
    </div>
  );
}
