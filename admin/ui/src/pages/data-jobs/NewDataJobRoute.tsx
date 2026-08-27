import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { call } from "../../api/client";
import type { TableMeta, TableSchema } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { Modal } from "../../components/Modal";
import { Combobox } from "../../components/Combobox";
import { ImportModal } from "../data/ImportModal";
import { ExportModal } from "../data/ExportModal";

const SURFACE = "data_browser";

/* The table+schema picker ImportModal/ExportModal never needed before —
   both were always launched already scoped to one table, from inside
   that table's own Data Browser view (DataTableView.tsx). This route is
   the new, table-agnostic entry point (the standalone Data Import &
   Export page's own "New" action) — same two modals, reused unchanged,
   just fed a table+schema chosen here first instead of inherited from
   the URL. */
export function NewDataJobRoute() {
  const navigate = useNavigate();
  const { reload } = useOutletContext<{ reload: () => void }>();
  const [direction, setDirection] = useState<"Import" | "Export">("Import");
  const [tableQuery, setTableQuery] = useState("");
  const [table, setTable] = useState<string | null>(null);
  const [schema, setSchema] = useState<TableSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const { data: tableMeta } = useAsync(
    () => call<TableMeta[]>("list_table_meta", { surface: SURFACE }, { method: "GET" }),
    [],
  );
  const options = useMemo(
    () =>
      (tableMeta ?? [])
        .filter((t) => t.table.toLowerCase().includes(tableQuery.toLowerCase()))
        .map((t) => ({ value: t.table, label: t.table, sublabel: t.plugin })),
    [tableMeta, tableQuery],
  );

  const close = () => navigate("/data-jobs");

  const pickTable = async (t: string | null) => {
    setTable(t);
    setSchema(null);
    if (!t) return;
    setSchemaLoading(true);
    try {
      const s = await call<TableSchema>("get_table_schema", { table: t }, { method: "GET" });
      setSchema(s);
    } finally {
      setSchemaLoading(false);
    }
  };

  if (table && schema) {
    return direction === "Import" ? (
      <ImportModal
        table={table}
        schema={schema}
        onClose={close}
        onImported={() => {
          reload();
          close();
        }}
      />
    ) : (
      <ExportModal table={table} schema={schema} filters={null} search={[]} hasActiveQuery={false} onClose={close} />
    );
  }

  return (
    <Modal title="New data import/export" onClose={close} size="md">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-text-muted">Direction</span>
          <div className="flex gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
              <input type="radio" checked={direction === "Import"} onChange={() => setDirection("Import")} />
              Import
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
              <input type="radio" checked={direction === "Export"} onChange={() => setDirection("Export")} />
              Export
            </label>
          </div>
        </div>
        <Combobox
          label="Table"
          value={table}
          onChange={pickTable}
          options={options}
          query={tableQuery}
          onQueryChange={setTableQuery}
          loading={schemaLoading}
          placeholder="Search tables…"
          clearable
        />
      </div>
    </Modal>
  );
}
