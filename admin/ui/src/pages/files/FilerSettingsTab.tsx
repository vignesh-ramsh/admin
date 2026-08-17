import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Info } from "lucide-react";
import { call, ApiError } from "../../api/client";
import type { FilerSettingEntry, FilerAntivirusStatus } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { TextInput, TextArea, Select, Switch } from "../../components/Field";
import { LoadingBlock, ErrorBlock } from "../../components/States";
import { useToast } from "../../components/Toast";
import { useSaveShortcut } from "../../hooks/useSaveShortcut";

type FormValue = string | boolean;

const BYTES_PER_MB = 1024 * 1024;
const MB_FIELDS = new Set(["filer_max_upload_bytes", "filer_max_request_body_bytes"]);

function initialValue(entry: FilerSettingEntry): FormValue {
  if (entry.kind === "bool") {
    // A "bool"-kind entry backed by a settings.declare(type=bool) key
    // (filer_scan_public/filer_scan_private) comes back as a genuine
    // JSON boolean, not the string "true" — arc.settings.get() coerces a
    // typed setting to a real Python bool before it's ever serialized.
    // `entry.value === "true"` was comparing that boolean against a
    // string literal, which is false unconditionally, for every value —
    // the toggle never reflected the real setting, cache or no cache.
    // Still handle a literal string defensively (kept honest in
    // FilerSettingEntry's own type below) in case anything upstream ever
    // does send "true"/"false" as text instead.
    return typeof entry.value === "boolean" ? entry.value : entry.value === "true";
  }
  return entry.value ?? "";
}

function toDisplay(key: string, raw: string): string {
  if (!MB_FIELDS.has(key) || !raw) return raw;
  const bytes = Number(raw);
  return Number.isFinite(bytes) ? String(bytes / BYTES_PER_MB) : raw;
}

function toStored(key: string, display: string): string {
  if (!MB_FIELDS.has(key) || !display) return display;
  const mb = Number(display);
  return Number.isFinite(mb) ? String(Math.round(mb * BYTES_PER_MB)) : display;
}

export function FilerSettingsTab() {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, FormValue> | null>(null);
  const [initial, setInitial] = useState<Record<string, FormValue>>({});
  const [saving, setSaving] = useState(false);

  const loader = useCallback(
    () =>
      Promise.all([
        call<FilerSettingEntry[]>("list_filer_settings", {}, { method: "GET" }),
        call<FilerAntivirusStatus>("get_filer_antivirus_status", {}, { method: "GET" }),
      ]),
    [],
  );

  const { data, loading, error, reload } = useAsync(loader, []);

  const entries = useMemo(() => {
    const byKey: Record<string, FilerSettingEntry> = {};
    for (const row of data?.[0] ?? []) byKey[row.key] = row;
    return byKey;
  }, [data]);
  const av = data?.[1] ?? null;

  // Sync local form state whenever a fresh load lands, without clobbering
  // in-progress edits on every render.
  const rowsKey = data?.[0]?.map((r) => `${r.key}:${r.value}`).join("|") ?? "";
  useEffect(() => {
    if (!data) return;
    const vals: Record<string, FormValue> = {};
    for (const row of data[0]) {
      const v = initialValue(row);
      vals[row.key] = typeof v === "string" ? toDisplay(row.key, v) : v;
    }
    setValues(vals);
    setInitial(vals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey]);

  const set = (key: string, value: FormValue) => setValues((v) => ({ ...(v ?? {}), [key]: value }));

  const dirtyKeys = values ? Object.keys(values).filter((k) => values[k] !== initial[k]) : [];

  const save = async () => {
    if (!values || dirtyKeys.length === 0) {
      toast.error("Nothing's changed.");
      return;
    }
    const payload: Record<string, FormValue> = {};
    for (const key of dirtyKeys) {
      const v = values[key];
      payload[key] = typeof v === "string" ? toStored(key, v) : v;
    }
    setSaving(true);
    try {
      await call("set_filer_settings", { values: payload });
      toast.success(`Saved ${dirtyKeys.length} setting${dirtyKeys.length === 1 ? "" : "s"}.`);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  useSaveShortcut(save, dirtyKeys.length > 0 && !saving);

  if (loading && !values) return <LoadingBlock label="Loading filer settings…" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!values) return null;

  const text = (key: string, placeholder?: string) => (
    <TextInput
      value={(values[key] as string) ?? ""}
      placeholder={entries[key]?.secret && entries[key]?.is_set ? "•••••••• (configured — leave blank to keep)" : placeholder}
      onChange={(e) => set(key, e.target.value)}
    />
  );

  return (
    <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-1">
      <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-bg px-3.5 py-2.5 text-[13px] text-info">
        <Info size={15} className="mt-0.5 shrink-0" />
        <span>
          Advanced: these keys are also editable under{" "}
          <Link to="/settings" className="cursor-pointer font-medium underline underline-offset-2">
            Settings &amp; Secrets → filer
          </Link>{" "}
          — that view shows raw byte values with no grouping.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text">Antivirus</h3>
            <Badge tone={av?.connected ? "success" : "danger"} dot>
              {av?.connected ? `${av.engine} connected` : `${av?.engine ?? "ClamAV"} not reachable`}
            </Badge>
          </div>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <div className="text-text-faint">Version</div>
                <div className="text-text">{av?.version || "—"}</div>
              </div>
              <div>
                <div className="text-text-faint">Socket</div>
                <div className="truncate font-mono text-[12px] text-text" title={av?.socket}>
                  {av?.socket}
                </div>
              </div>
              <div className="col-span-2">
                <div className="mb-1 text-text-faint">Available engines</div>
                <div className="flex flex-wrap gap-1.5">
                  {(av?.available_engines ?? []).map((e) => (
                    <Badge key={e}>{e}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <Switch checked={Boolean(values["filer_scan_public"])} onChange={(v) => set("filer_scan_public", v)} label="Scan public uploads" />
            <Switch checked={Boolean(values["filer_scan_private"])} onChange={(v) => set("filer_scan_private", v)} label="Scan private uploads" />
            <TextInput
              label="ClamAV socket"
              hint="Unix socket path for clamd — only used when scanning is enabled above."
              value={(values["filer_clamav_socket"] as string) ?? ""}
              placeholder="/var/run/clamav/clamd.ctl"
              onChange={(e) => set("filer_clamav_socket", e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-text">Size &amp; content</h3>
          <div className="flex flex-col gap-3.5">
            <TextInput
              label="Max upload size (MB)"
              hint="Applies only to a file's own bytes. Blank = no extra limit."
              type="number"
              value={(values["filer_max_upload_bytes"] as string) ?? ""}
              placeholder="e.g. 25"
              onChange={(e) => set("filer_max_upload_bytes", e.target.value)}
            />
            <TextArea
              label="Allowed content types"
              hint="Comma-separated MIME types. Blank = every content type allowed."
              rows={3}
              value={(values["filer_allowed_content_types"] as string) ?? ""}
              placeholder="image/png, image/jpeg, application/pdf"
              onChange={(e) => set("filer_allowed_content_types", e.target.value)}
            />
            <TextInput
              label="Purge deleted files after (days)"
              hint="Grace window before a deleted file's bytes are actually removed."
              type="number"
              value={(values["filer_purge_after_days"] as string) ?? ""}
              placeholder="30"
              onChange={(e) => set("filer_purge_after_days", e.target.value)}
            />
            <TextInput
              label="Private link default TTL (seconds)"
              type="number"
              value={(values["filer_default_link_ttl_seconds"] as string) ?? ""}
              placeholder="300"
              onChange={(e) => set("filer_default_link_ttl_seconds", e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-text">Storage</h3>
          <div className="flex flex-col gap-3.5">
            <Select
              label="Default storage provider"
              value={(values["filer_default_storage"] as string) || "local"}
              onChange={(e) => set("filer_default_storage", e.target.value)}
            >
              <option value="local">local</option>
              <option value="s3">s3</option>
            </Select>
            <TextInput
              label="Local storage root"
              hint="Blank = <project root>/files."
              value={(values["filer_local_root"] as string) ?? ""}
              placeholder="/path/to/files"
              onChange={(e) => set("filer_local_root", e.target.value)}
            />
            <TextInput
              label="Max request body (MB)"
              hint="The upload route's own outer size ceiling. Requires a gateway restart to take effect."
              type="number"
              value={(values["filer_max_request_body_bytes"] as string) ?? ""}
              placeholder="e.g. 60"
              onChange={(e) => set("filer_max_request_body_bytes", e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text">S3</h3>
            <Badge>optional</Badge>
          </div>
          <div className="flex flex-col gap-3.5">
            <TextInput label="Bucket" value={(values["filer_s3_bucket"] as string) ?? ""} onChange={(e) => set("filer_s3_bucket", e.target.value)} />
            <TextInput label="Region" value={(values["filer_s3_region"] as string) ?? ""} onChange={(e) => set("filer_s3_region", e.target.value)} />
            <TextInput
              label="Endpoint URL"
              hint="Override for S3-compatible services (MinIO, R2, Backblaze, ...)."
              value={(values["filer_s3_endpoint_url"] as string) ?? ""}
              onChange={(e) => set("filer_s3_endpoint_url", e.target.value)}
            />
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <label className="text-[13px] font-medium text-text-muted">Access key ID</label>
                {entries["filer_s3_access_key_id"]?.is_set && <Badge tone="success">configured</Badge>}
              </div>
              {text("filer_s3_access_key_id")}
            </div>
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <label className="text-[13px] font-medium text-text-muted">Secret access key</label>
                {entries["filer_s3_secret_access_key"]?.is_set && <Badge tone="success">configured</Badge>}
              </div>
              {text("filer_s3_secret_access_key")}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={save} loading={saving} disabled={dirtyKeys.length === 0}>
          Save {dirtyKeys.length > 0 ? `(${dirtyKeys.length} changed)` : "settings"}
        </Button>
        <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={reload}>
          Reset
        </Button>
      </div>
    </div>
  );
}
