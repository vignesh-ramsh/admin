import { useEffect, useState } from "react";
import { call } from "../../api/client";
import type { Row, RowPage } from "../../api/types";
import { Combobox, type ComboOption } from "../../components/Combobox";
import { useDebounce } from "../../hooks/useDebounce";

/** A REFERENCE-picker-style combobox over the `filerfile` table — the same
 *  search-as-you-type pattern ReferencePicker already uses for a real
 *  REFERENCE field, applied to FILE/MULTIFILE's own file_id value. Shows
 *  BOTH the filename and the file_id (the label the user asked for) so a
 *  file can be told apart from another one with the same name. */
export function FilePicker({
  value,
  onChange,
  disabled,
  placeholder = "Search files…",
  error,
}: {
  value: string;
  onChange: (fileId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
}) {
  // The current value's own label, resolved once so a closed picker never
  // just shows a bare file_id.
  const [resolvedOption, setResolvedOption] = useState<ComboOption | null>(null);
  useEffect(() => {
    if (!value) {
      setResolvedOption(null);
      return;
    }
    let cancelled = false;
    call<RowPage>("list_rows", { table: "filerfile", filters: { file_id: { eq: value } }, limit: 1 }, { method: "QUERY" })
      .then((page) => {
        if (cancelled) return;
        const row = page.rows[0];
        setResolvedOption({
          value,
          label: row ? String(row.original_filename) : value,
          sublabel: value,
        });
      })
      .catch(() => {
        if (!cancelled) setResolvedOption({ value, label: value });
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [searchResults, setSearchResults] = useState<ComboOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const filters = debouncedQuery.trim() ? { original_filename: { contains: debouncedQuery.trim() } } : null;
    call<RowPage>("list_rows", { table: "filerfile", filters, order_by: ["-created_at"], limit: 20 }, { method: "QUERY" })
      .then((page) => {
        if (cancelled) return;
        setSearchResults(
          (page.rows as Row[]).map((r) => ({
            value: String(r.file_id),
            label: String(r.original_filename ?? r.file_id),
            sublabel: String(r.file_id),
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const options: ComboOption[] =
    resolvedOption && !searchResults.some((o) => o.value === resolvedOption.value) ? [resolvedOption, ...searchResults] : searchResults;

  const picker = (
    <Combobox
      value={value || null}
      onChange={(v) => onChange(v ?? "")}
      options={options}
      query={query}
      onQueryChange={setQuery}
      loading={loading}
      placeholder={placeholder}
      error={error}
      clearable
    />
  );

  if (!disabled) return picker;
  return <div className="pointer-events-none opacity-60">{picker}</div>;
}
