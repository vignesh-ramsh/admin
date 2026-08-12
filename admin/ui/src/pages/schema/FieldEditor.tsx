import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import clsx from "clsx";
import { GripVertical, Info, Plus, Rows3, Search, Trash2 } from "lucide-react";
import type { SchemaField, TableMeta } from "../../api/types";
import { Button, IconButton } from "../../components/Button";
import { Checkbox, Select, TextInput } from "../../components/Field";
import { Combobox, type ComboOption } from "../../components/Combobox";
import { useTargetFieldOptions } from "./useTargetFields";
import { blankField, nextFieldId, typesFor, usesDecimal, usesLength, usesOptions, usesReference } from "../data/fieldTypes";

interface Props {
  fields: SchemaField[];
  system: boolean;
  tableMeta: TableMeta[];
  onChange: (fields: SchemaField[]) => void;
}

/** A row in the editor's own display order — either a real field or a
 *  Frappe Section-Break-style separator. A separator is UI-only and never
 *  reaches `onChange`/disk; a field's `.group` is instead recomputed from
 *  whichever separator most recently precedes it in this list, so
 *  dragging a row is the only thing that ever changes grouping — field
 *  ids are never touched by anything in this file, on reorder or
 *  otherwise (`_field_registry.id` is the diff/rename-detection key —
 *  psqldb.fields.Field's own docstring — so it's left alone unconditionally,
 *  whether or not the field has been migrated yet). */
type Row = { kind: "field"; field: SchemaField } | { kind: "divider"; key: string; name: string };

/** Rebuilds the row list from `fields`' own already-saved `.group` values
 *  — one separator per contiguous run's first field. Runs once, at mount,
 *  so an existing file (hand-edited, or saved by this editor before)
 *  opens already segmented. A non-contiguous repeat of the same group
 *  name (only possible via a hand-edited file) just renders as two
 *  same-named separators rather than merging — a display quirk, not data
 *  loss; dragging one segment under the other fixes it. */
function deriveRows(fields: SchemaField[]): Row[] {
  const rows: Row[] = [];
  let prevGroup: string | undefined;
  let n = 0;
  for (const f of fields) {
    const g = f.group || undefined;
    if (g !== undefined && g !== prevGroup) rows.push({ kind: "divider", key: `divider-${n++}`, name: g });
    rows.push({ kind: "field", field: f });
    prevGroup = g;
  }
  return rows;
}

/** The single source of truth for what `.group` each field's onChange
 *  payload carries — walks `rows` in display order, applying whichever
 *  separator was most recently passed. */
function extractFields(rows: Row[]): SchemaField[] {
  const out: SchemaField[] = [];
  let current: string | undefined;
  for (const r of rows) {
    if (r.kind === "divider") {
      current = r.name;
      continue;
    }
    out.push((r.field.group || undefined) === current ? r.field : { ...r.field, group: current });
  }
  return out;
}

/** A Combobox whose options are already known client-side (not server-
 *  searched) — filters `options` locally against its own query state,
 *  matching the design system's Combobox contract (query/onQueryChange
 *  are always controlled by the caller). */
function LocalCombobox({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string | null) => void;
  options: ComboOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q));
  }, [options, query]);
  if (disabled) {
    return (
      <div className="pointer-events-none opacity-60">
        <Combobox size="sm" value={value || null} onChange={() => {}} options={[]} query="" onQueryChange={() => {}} placeholder={placeholder} clearable />
      </div>
    );
  }
  return (
    <Combobox size="sm" value={value || null} onChange={onChange} options={filtered} query={query} onQueryChange={setQuery} placeholder={placeholder} clearable />
  );
}

/** lowercase, digits, and _ only — a schema field name is a physical
 *  Postgres column, and psqldb.fields.parse_field enforces the same
 *  ^[a-z][a-z0-9_]*$ rule server-side (defense in depth for a hand-edited
 *  schema JSON) — sanitizing live here means a user never even sees the
 *  rejection, the field just can't contain anything else in the first
 *  place. */
function sanitizeFieldName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

export function FieldEditor({ fields, system, tableMeta, onChange }: Props) {
  const [rows, setRows] = useState<Row[]>(() => deriveRows(fields));
  const dividerCounter = useRef(0);
  // The one separator currently showing its rename input instead of plain
  // text — either just-inserted (addSeparator sets this directly, no
  // separate "just inserted" state needed) or double-clicked into edit.
  const [editingDivider, setEditingDivider] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const commit = (next: Row[]) => {
    setRows(next);
    onChange(extractFields(next));
  };

  const update = (fieldId: string, patch: Partial<SchemaField>) => {
    commit(rows.map((r) => (r.kind === "field" && r.field.id === fieldId ? { ...r, field: { ...r.field, ...patch } } : r)));
  };
  const removeField = (fieldId: string) => commit(rows.filter((r) => !(r.kind === "field" && r.field.id === fieldId)));
  const addField = () => commit([...rows, { kind: "field", field: blankField(nextFieldId(extractFields(rows))) }]);

  const addSeparator = () => {
    const key = `divider-new-${dividerCounter.current++}`;
    commit([...rows, { kind: "divider", key, name: "New group" }]);
    setEditingDivider(key);
  };
  const renameDivider = (key: string, name: string) => commit(rows.map((r) => (r.kind === "divider" && r.key === key ? { ...r, name } : r)));
  const removeDivider = (key: string) => commit(rows.filter((r) => !(r.kind === "divider" && r.key === key)));

  // Drag-and-drop reorder, index-based (stable within a render since
  // `rows` only actually changes on drop). Never touches a field's id —
  // moving a row only ever changes array position and, as a consequence,
  // recomputed `.group` (extractFields); the id it was created with is
  // preserved unconditionally, migrated or not.
  const moveRow = (from: number, to: number) => {
    const next = rows.slice();
    const [moved] = next.splice(from, 1);
    // Insert at `to`'s post-removal index, unadjusted for direction — this
    // lands the dragged row immediately AFTER the target when dragging
    // down, immediately BEFORE it when dragging up (verified by hand:
    // dragging an adjacent row onto its very next neighbor needs this to
    // actually move it, not round-trip back to where it started).
    next.splice(to, 0, moved);
    commit(next);
  };
  const onRowDragStart = (idx: number) => (e: DragEvent) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };
  const onRowDragOver = (idx: number) => (e: DragEvent) => {
    e.preventDefault();
    if (overIndex !== idx) setOverIndex(idx);
  };
  const onRowDrop = (idx: number) => (e: DragEvent) => {
    e.preventDefault();
    const from = dragIndex;
    setDragIndex(null);
    setOverIndex(null);
    if (from == null || from === idx) return;
    moveRow(from, idx);
  };
  const onRowDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };
  // A divider row's own drag handle — field rows don't use this (the
  // whole ID cell is the drag source there instead, so a second nested
  // draggable icon inside it would just fight the cell over which one
  // wins a press). No extra sizing wrapper around the icon — that's what
  // put it a few pixels off from the field row's own icon before
  // (centered inside a fixed-width box instead of sitting flush).
  const dragHandle = (idx: number) => (
    <span
      draggable
      onDragStart={onRowDragStart(idx)}
      onDragEnd={onRowDragEnd}
      title="Drag to reorder"
      className="inline-flex shrink-0 cursor-grab justify-self-start text-text-faint hover:text-text active:cursor-grabbing"
    >
      <GripVertical size={13} />
    </span>
  );

  // A quick filter, not a real "group" — a wide system table can have 15+
  // fields, so finding one by scanning top to bottom stops scaling. Only
  // shown once there's enough fields for it to matter. Matches a field's
  // CURRENT group name too (groupAt), not just its own name/id/type, so
  // typing a section's label surfaces everything in it. Dragging depends
  // on real, contiguous row position, so filtering (which hides rows)
  // drops to a flat, ungrouped, undraggable list instead of drawing a
  // broken partial section — clear the filter to get both back.
  const [filterQuery, setFilterQuery] = useState("");
  const q = filterQuery.trim().toLowerCase();
  const filtering = q.length > 0;

  const groupAt = useMemo(() => {
    const m: (string | undefined)[] = [];
    let current: string | undefined;
    rows.forEach((r, idx) => {
      if (r.kind === "divider") current = r.name;
      m[idx] = current;
    });
    return m;
  }, [rows]);

  const matchesField = (f: SchemaField, idx: number) =>
    !q ||
    f.name.toLowerCase().includes(q) ||
    f.id.toLowerCase().includes(q) ||
    f.type.toLowerCase().includes(q) ||
    (groupAt[idx] ?? "").toLowerCase().includes(q);

  // Every <td> shares the same padding, and a native <table> stretches
  // every cell in a <tr> to that row's tallest cell automatically — a
  // REFERENCE field's two side-by-side comboboxes or a DECIMAL's
  // precision/scale pair can't make just THEIR row taller than a plain
  // STRING field's row, and every row is guaranteed the same height as
  // every other row by the browser's table layout algorithm itself,
  // rather than by hand-matching an h-11 class on every branch. py-1.5
  // (not py-2) is also what a divider row's own cell uses, so the two
  // row kinds land on the same height without needing to hand-tune one
  // against the other.
  const th = "border-b border-r border-border px-2.5 py-1.5 text-left last:border-r-0";
  const td = "border-b border-r border-border px-2.5 py-1.5 align-middle last:border-r-0";
  const tdCenter = "border-b border-r border-border px-2.5 py-1.5 text-center align-middle last:border-r-0";

  const rowDropTarget = (idx: number, interactive: boolean) =>
    interactive
      ? {
          onDragOver: onRowDragOver(idx),
          onDrop: onRowDrop(idx),
        }
      : {};
  const rowClass = (idx: number, interactive: boolean) =>
    clsx(
      interactive && dragIndex === idx && "opacity-40",
      interactive && overIndex === idx && dragIndex !== idx && "outline outline-2 -outline-offset-2 outline-accent",
    );

  const dividerRow = (r: Extract<Row, { kind: "divider" }>, idx: number) => {
    const editing = editingDivider === r.key;
    return (
      <tr key={r.key} {...rowDropTarget(idx, true)} className={clsx("bg-info-bg/40 dark:bg-info-bg/20", rowClass(idx, true))}>
        <td colSpan={8} className="border-b border-border px-2.5 py-1.5">
          {/* Two equal 1fr side columns (not sized to the handle/delete
              button's own content) is what keeps the center column truly
              centered on the row, regardless of how wide those flanking
              controls are — a plain flex row with a flex-1 label would
              instead center it only between whatever the handle and button
              happen to measure. min-h-8 matches TextInput/Select's own
              "sm" control height (ControlBox, h-8) so this row's content
              is exactly as tall as a field row's, not just its padding. */}
          <div className="grid min-h-8 grid-cols-[1fr_auto_1fr] items-center gap-2">
            {dragHandle(idx)}
            {editing ? (
              <input
                className="min-w-0 bg-transparent text-center text-[12px] font-semibold uppercase tracking-wide text-info outline-none"
                style={{ width: `${Math.max(r.name.length, 6)}ch` }}
                value={r.name}
                autoFocus
                onFocus={(e) => e.target.select()}
                onBlur={() => setEditingDivider(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                }}
                onChange={(e) => renameDivider(r.key, e.target.value)}
              />
            ) : (
              <span
                onDoubleClick={() => setEditingDivider(r.key)}
                title="Double-click to rename"
                className="cursor-text select-none text-center text-[12px] font-semibold uppercase tracking-wide text-info"
              >
                {r.name}
              </span>
            )}
            <div className="justify-self-end">
              <IconButton label="Remove group" icon={<Trash2 size={13} />} onClick={() => removeDivider(r.key)} className="h-6 w-6 shrink-0" />
            </div>
          </div>
        </td>
      </tr>
    );
  };

  const fieldRow = (f: SchemaField, idx: number, interactive: boolean) => (
    <tr key={f.id} {...rowDropTarget(idx, interactive)} className={rowClass(idx, interactive)}>
      <td
        className={clsx(td, interactive && "cursor-grab select-none active:cursor-grabbing")}
        draggable={interactive}
        onDragStart={interactive ? onRowDragStart(idx) : undefined}
        onDragEnd={interactive ? onRowDragEnd : undefined}
        title={interactive ? "Drag to reorder" : undefined}
      >
        <div className="flex items-center gap-1.5">
          {interactive && <GripVertical size={13} className="shrink-0 text-text-faint" />}
          <span className="whitespace-nowrap font-mono text-[11px] text-text-faint">{f.id}</span>
        </div>
      </td>
      <td className={td}>
        <TextInput
          size="sm"
          placeholder="field_name"
          value={f.name}
          onChange={(e) => update(f.id, { name: sanitizeFieldName(e.target.value) })}
        />
      </td>
      <td className={td}>
        <Select
          size="sm"
          value={f.type}
          onChange={(e) =>
            update(f.id, {
              type: e.target.value,
              target: undefined,
              target_field: undefined,
              options: undefined,
              length: undefined,
              precision: undefined,
              scale: undefined,
            })
          }
        >
          {typesFor(system).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </td>
      <td className={td}>
        <FieldConfig field={f} tableMeta={tableMeta} onChange={(patch) => update(f.id, patch)} />
      </td>
      <td className={tdCenter}>
        <Checkbox label="" checked={!!f.required} onChange={(e) => update(f.id, { required: e.target.checked })} aria-label="Required" />
      </td>
      <td className={tdCenter}>
        <Checkbox label="" checked={!!f.unique} onChange={(e) => update(f.id, { unique: e.target.checked })} aria-label="Unique" />
      </td>
      <td className={tdCenter}>
        <Checkbox
          label=""
          checked={f.list !== false}
          onChange={(e) => update(f.id, { list: e.target.checked })}
          aria-label="Show in list view"
          title="Show this column in Data Browser's table/list view — always still editable in the row editor either way"
        />
      </td>
      <td className="px-2.5 py-1.5 text-center align-middle">
        <IconButton label="Remove field" icon={<Trash2 size={15} />} onClick={() => removeField(f.id)} />
      </td>
    </tr>
  );

  const visibleFieldRows = filtering ? rows.filter((r, idx): r is Extract<Row, { kind: "field" }> => r.kind === "field" && matchesField(r.field, idx)) : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-bg/50 px-3 py-2.5">
        <Info size={14} className="mt-0.5 shrink-0 text-warning" />
        <p className="text-[11px] leading-relaxed text-warning">
          Every table needs at least one <strong>Unique</strong> field (or a Unique Together group below). Field names:
          lowercase letters, digits, and underscores only — no spaces, capitals, or symbols. Saving applies the change
          immediately, live — <strong>some type changes can cause data loss, so always take a backup before saving one.</strong>
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {fields.length > 8 && (
          <div className="flex items-center gap-2 border-b border-border bg-neutral-50 px-3 py-2 dark:bg-neutral-900/40">
            <Search size={14} className="text-text-faint" />
            <input
              className="flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-text-faint"
              placeholder={`Filter ${fields.length} fields by name, type, or group…`}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
            />
            {filtering && <span className="shrink-0 text-[11px] text-text-faint">Drag reorder hidden while filtering</span>}
          </div>
        )}

        {fields.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-text-faint">No fields yet — add the table's first field below.</p>}
        {fields.length > 0 && filtering && visibleFieldRows.length === 0 && (
          <p className="px-3 py-6 text-center text-[13px] text-text-faint">No fields match "{filterQuery}".</p>
        )}

        {(fields.length === 0 || !filtering || visibleFieldRows.length > 0) && (
          // table-layout: fixed makes every column's width a fixed
          // contract (the <colgroup> below), independent of any cell's
          // content — the same reason REFERENCE's two comboboxes or a
          // DECIMAL's precision/scale pair used to need a hand-written
          // min-w-0 escape hatch under CSS Grid. Under a table that
          // concern doesn't exist: no cell's content can ever widen its
          // own column relative to any other row's. border-collapse
          // merges every shared cell edge into one crisp 1px line instead
          // of doubling up wherever two bordered boxes used to touch.
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col style={{ width: "84px" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "150px" }} />
              <col />
              <col style={{ width: "44px" }} />
              <col style={{ width: "44px" }} />
              <col style={{ width: "44px" }} />
              <col style={{ width: "52px" }} />
            </colgroup>
            <thead className="bg-neutral-50 text-[11px] font-semibold uppercase tracking-wide text-text-faint dark:bg-neutral-900/40">
              <tr>
                <th className={th}>ID</th>
                <th className={th}>Name</th>
                <th className={th}>Type</th>
                <th className={th}>Configuration</th>
                <th className={`${th} text-center`}>Req</th>
                <th className={`${th} text-center`}>Uniq</th>
                <th className={`${th} text-center`} title="Show this column in Data Browser's table/list view">
                  List
                </th>
                <th className="border-b border-border px-2.5 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {filtering
                ? visibleFieldRows.map((r) => fieldRow(r.field, -1, false))
                : rows.map((r, idx) => (r.kind === "divider" ? dividerRow(r, idx) : fieldRow(r.field, idx, true)))}
            </tbody>
          </table>
        )}

        <div className="flex items-center gap-2 border-t border-border p-2.5">
          <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={addField}>
            Add field
          </Button>
          <Button variant="ghost" size="sm" icon={<Rows3 size={14} />} onClick={addSeparator}>
            Add separator
          </Button>
        </div>
      </div>
    </div>
  );
}

/** N sub-inputs sharing one Configuration cell, evenly split — flex-1
 *  divides available width by however many <ConfigSlot>s are actually
 *  rendered, so this is "evenly distribute by input count" for free: one
 *  slot gets 100%, two slots get 50/50, three would get a third each,
 *  with no per-branch width math to keep in sync. min-w-0 on each slot
 *  is load-bearing (see ConfigSlot). A lone control that skips this
 *  wrapper entirely (OptionsInput, the plain default branch) already
 *  gets the full cell width for free, since ControlBox itself has no
 *  width constraint of its own. */
function ConfigRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1.5">{children}</div>;
}

/** min-w-0 is load-bearing, not decorative: a flex item's default min-
 *  width is its content's min-content size, and a Combobox's own min-
 *  width is "auto" on top of that — neither bottoms out at the inner
 *  input's own min-w-0 the way a plain block child would. Without this,
 *  two side-by-side slots (REFERENCE's pair of comboboxes, DECIMAL's
 *  precision/scale) refuse to shrink below their content size, overflow
 *  the cell, and — since Combobox's root is `position: relative` —
 *  visually and functionally sit on TOP of the Req/Uniq/List checkboxes
 *  to the right (position:relative paints above static siblings
 *  regardless of DOM order), making them unclickable. flex-1 is what
 *  actually claims this slot's even share of ConfigRow's width — w-full
 *  alone on the child would only mean "100% of whatever space this slot
 *  already has," not "an equal share of the row." */
function ConfigSlot({ children }: { children: ReactNode }) {
  return <div className="min-w-0 flex-1">{children}</div>;
}

function FieldConfig({ field, tableMeta, onChange }: { field: SchemaField; tableMeta: TableMeta[]; onChange: (patch: Partial<SchemaField>) => void }) {
  const t = field.type;

  if (usesReference(t)) {
    const isTableType = t === "TABLE";
    // A TABLE field generates/points at a CHILD table — psqldb requires
    // the target to be a "child": true schema, so only those are offered.
    const candidates = isTableType ? tableMeta.filter((m) => m.child) : tableMeta;
    const tableOptions: ComboOption[] = candidates.map((m) => ({
      value: m.name,
      label: m.name,
      sublabel: [m.plugin, m.child ? "child" : m.system ? "system" : null].filter(Boolean).join(" · "),
    }));

    return (
      <ConfigRow>
        <ConfigSlot>
          <LocalCombobox
            value={field.target ?? ""}
            onChange={(v) => onChange({ target: v ?? undefined, target_field: undefined })}
            options={tableOptions}
            placeholder={isTableType ? "child table…" : "target table…"}
          />
        </ConfigSlot>
        {t === "REFERENCE" && (
          <ConfigSlot>
            <TargetFieldPicker field={field} tableMeta={tableMeta} onChange={onChange} />
          </ConfigSlot>
        )}
      </ConfigRow>
    );
  }

  if (usesOptions(t)) {
    return <OptionsInput field={field} onChange={onChange} />;
  }

  if (usesDecimal(t)) {
    return (
      <ConfigRow>
        <ConfigSlot>
          <TextInput
            size="sm"
            type="number"
            placeholder="precision"
            value={field.precision ?? ""}
            onChange={(e) => onChange({ precision: e.target.value ? Number(e.target.value) : undefined })}
          />
        </ConfigSlot>
        <ConfigSlot>
          <TextInput
            size="sm"
            type="number"
            placeholder="scale"
            value={field.scale ?? ""}
            onChange={(e) => onChange({ scale: e.target.value ? Number(e.target.value) : undefined })}
          />
        </ConfigSlot>
      </ConfigRow>
    );
  }

  if (usesLength(t)) {
    return (
      <ConfigRow>
        <ConfigSlot>
          <TextInput
            size="sm"
            type="number"
            placeholder="length"
            value={field.length ?? ""}
            onChange={(e) => onChange({ length: e.target.value ? Number(e.target.value) : undefined })}
          />
        </ConfigSlot>
        <ConfigSlot>
          <TextInput
            size="sm"
            placeholder="default"
            value={field.default != null ? String(field.default) : ""}
            onChange={(e) => onChange({ default: e.target.value || undefined })}
          />
        </ConfigSlot>
      </ConfigRow>
    );
  }

  return (
    <TextInput
      size="sm"
      placeholder="default (optional)"
      value={field.default != null ? String(field.default) : ""}
      onChange={(e) => onChange({ default: e.target.value || undefined })}
    />
  );
}

/* A SELECT/etc. field's `options` array, edited as one comma-separated
   text input. Local text state so a just-typed trailing comma isn't
   immediately dropped by split->filter->join re-deriving the input's own
   displayed value on every keystroke. */
function OptionsInput({ field, onChange }: { field: SchemaField; onChange: (patch: Partial<SchemaField>) => void }) {
  const [text, setText] = useState((field.options ?? []).join(", "));
  return (
    <TextInput
      size="sm"
      placeholder="option1, option2, …"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange({ options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) });
      }}
    />
  );
}

function TargetFieldPicker({ field, tableMeta, onChange }: { field: SchemaField; tableMeta: TableMeta[]; onChange: (patch: Partial<SchemaField>) => void }) {
  const physical = tableMeta.find((m) => m.name === field.target)?.table;
  const { options, loading } = useTargetFieldOptions(physical);
  return (
    <LocalCombobox
      value={field.target_field ?? ""}
      onChange={(v) => onChange({ target_field: v || undefined })}
      options={options}
      disabled={!field.target}
      placeholder={!field.target ? "pick a table first" : loading ? "loading…" : "target field (default: id)"}
    />
  );
}
