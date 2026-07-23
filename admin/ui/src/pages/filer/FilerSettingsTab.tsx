import { useCallback, useEffect, useState } from "react";
import { call, ApiError } from "../../api/client";
import type { FilerSettingEntry, FilerAntivirusStatus } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Field, Input, Select, Textarea } from "../../components/Field";
import { Checkbox } from "../../components/agni/forms/Checkbox";
import { Loading, ErrorState } from "../../components/States";
import { useToast } from "../../components/Toast";
import { IconRefresh } from "../../layout/icons";
import "./filer.css";

type FormValue = string | boolean;

const BYTES_PER_MB = 1024 * 1024;

function initialValue(entry: FilerSettingEntry): FormValue {
  if (entry.kind === "bool") return entry.value === "true";
  return entry.value ?? "";
}

// filer_max_upload_bytes / filer_max_request_body_bytes are stored (and
// sent to the backend) in bytes — this app shows/edits them in MB, since
// nobody thinks in raw byte counts for a file-size limit. Conversion is
// purely a display-layer concern; the wire payload is still bytes.
const MB_FIELDS = new Set(["filer_max_upload_bytes", "filer_max_request_body_bytes"]);

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
  const { onUnauthorized } = useAuth();
  const toast = useToast();
  const [entries, setEntries] = useState<Record<string, FilerSettingEntry>>({});
  const [values, setValues] = useState<Record<string, FormValue>>({});
  const [initial, setInitial] = useState<Record<string, FormValue>>({});
  const [av, setAv] = useState<FilerAntivirusStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleErr = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return true;
      }
      return false;
    },
    [onUnauthorized]
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      call<FilerSettingEntry[]>("list_filer_settings", {}, { method: "GET" }),
      call<FilerAntivirusStatus>("get_filer_antivirus_status", {}, { method: "GET" }),
    ])
      .then(([rows, status]) => {
        const byKey: Record<string, FilerSettingEntry> = {};
        const vals: Record<string, FormValue> = {};
        for (const row of rows) {
          byKey[row.key] = row;
          const v = initialValue(row);
          vals[row.key] = typeof v === "string" ? toDisplay(row.key, v) : v;
        }
        setEntries(byKey);
        setValues(vals);
        setInitial(vals);
        setAv(status);
      })
      .catch((err) => {
        if (!handleErr(err)) setError(err instanceof ApiError ? err.message : "Failed to load filer settings");
      })
      .finally(() => setLoading(false));
  }, [handleErr]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key: string, value: FormValue) => setValues((v) => ({ ...v, [key]: value }));

  // Only ever send fields the user actually touched — sending the whole
  // form back on every save is what silently wiped out already-configured
  // values before (an untouched field's blank display would round-trip
  // back to the server as "", which set_filer_settings correctly treats
  // as "clear this key" for a non-secret field, exactly as it should for
  // a field genuinely being cleared, but wrongly for one nobody meant to
  // touch at all). Diffing against `initial` is what actually fixes that.
  const dirtyKeys = Object.keys(values).filter((k) => values[k] !== initial[k]);

  const save = async () => {
    if (dirtyKeys.length === 0) {
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
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading message="Loading filer settings…" />;
  if (error) return <ErrorState message={error} />;

  const text = (key: string, placeholder?: string) => (
    <Input
      value={(values[key] as string) ?? ""}
      placeholder={entries[key]?.secret && entries[key]?.is_set ? "•••••••• (configured — leave blank to keep)" : placeholder}
      onChange={(e) => set(key, e.target.value)}
    />
  );

  const number = (key: string, placeholder?: string) => (
    <Input
      type="number"
      value={(values[key] as string) ?? ""}
      placeholder={placeholder}
      onChange={(e) => set(key, e.target.value)}
    />
  );

  const bool = (key: string, label: string) => (
    <Checkbox checked={Boolean(values[key])} onChange={(v) => set(key, v)} label={label} />
  );

  return (
    <div className="row-gap">
      <div className="filer-settings-grid">
        <div className="card">
          <div className="card__header">
            <div className="card__title">Antivirus</div>
            <Badge tone={av?.connected ? "success" : "danger"} dot>
              {av?.connected ? `${av.engine} connected` : `${av?.engine ?? "ClamAV"} not reachable`}
            </Badge>
          </div>
          <div className="card__body row-gap">
            <div className="filer-av-status">
              <div>
                <span className="muted">Version</span>
                <div>{av?.version || <span className="muted">—</span>}</div>
              </div>
              <div>
                <span className="muted">Socket</span>
                <div className="mono" style={{ fontSize: 12 }}>{av?.socket}</div>
              </div>
              <div>
                <span className="muted">Available engines</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(av?.available_engines ?? []).map((e) => (
                    <Badge key={e} tone="neutral">{e}</Badge>
                  ))}
                </div>
              </div>
            </div>
            {bool("filer_scan_public", "Scan public uploads")}
            {bool("filer_scan_private", "Scan private uploads")}
            <Field label="ClamAV socket" hint="Unix socket path for clamd — only used when scanning is enabled above.">
              {text("filer_clamav_socket", "/var/run/clamav/clamd.ctl")}
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <div className="card__title">Size &amp; content</div>
          </div>
          <div className="card__body row-gap">
            <Field label="Max upload size (MB)" hint="Applies only to a file's own bytes, never the request as a whole — a JSON API call elsewhere stays bounded by gateway's own, much smaller default. Blank = no extra limit.">
              {number("filer_max_upload_bytes", "e.g. 25")}
            </Field>
            <Field label="Allowed content types" hint="Comma-separated MIME types. Blank = every content type allowed.">
              <Textarea
                rows={3}
                value={(values["filer_allowed_content_types"] as string) ?? ""}
                placeholder="image/png, image/jpeg, application/pdf"
                onChange={(e) => set("filer_allowed_content_types", e.target.value)}
              />
            </Field>
            <Field label="Purge deleted files after (days)" hint="Grace window before a deleted file's bytes are actually removed.">
              {number("filer_purge_after_days", "30")}
            </Field>
            <Field label="Private link default TTL (seconds)">
              {number("filer_default_link_ttl_seconds", "300")}
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <div className="card__title">Storage</div>
          </div>
          <div className="card__body row-gap">
            <Field label="Default storage provider">
              <Select value={(values["filer_default_storage"] as string) || "local"} onChange={(e) => set("filer_default_storage", e.target.value)}>
                <option value="local">local</option>
                <option value="s3">s3</option>
              </Select>
            </Field>
            <Field label="Local storage root" hint="Blank = <project root>/files.">
              {text("filer_local_root", "/path/to/files")}
            </Field>
            <Field label="Max request body (MB)" hint="The upload route's own outer size ceiling — separate from, and larger than, the max upload size above (which needs headroom for multipart framing). Requires a gateway restart to take effect.">
              {number("filer_max_request_body_bytes", "e.g. 60")}
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <div className="card__title">
              S3 <Badge tone="neutral">optional</Badge>
            </div>
          </div>
          <div className="card__body row-gap">
            <Field label="Bucket">{text("filer_s3_bucket")}</Field>
            <Field label="Region">{text("filer_s3_region")}</Field>
            <Field label="Endpoint URL" hint="Override for S3-compatible services (MinIO, R2, Backblaze, ...).">
              {text("filer_s3_endpoint_url")}
            </Field>
            <Field label="Access key ID">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {text("filer_s3_access_key_id")}
                {entries["filer_s3_access_key_id"]?.is_set && <Badge tone="success">configured</Badge>}
              </div>
            </Field>
            <Field label="Secret access key">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {text("filer_s3_secret_access_key")}
                {entries["filer_s3_secret_access_key"]?.is_set && <Badge tone="success">configured</Badge>}
              </div>
            </Field>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button variant="primary" onClick={save} loading={saving} disabled={dirtyKeys.length === 0}>
          Save {dirtyKeys.length > 0 ? `(${dirtyKeys.length} changed)` : "settings"}
        </Button>
        <Button variant="secondary" onClick={load}>
          <IconRefresh /> Reset
        </Button>
      </div>
    </div>
  );
}
