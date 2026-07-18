/* Shared response shapes mirroring admin/api/*.py return values. */

export interface HealthReport {
  [capability: string]: { ok: boolean; [key: string]: unknown };
}

export interface FieldMeta {
  id: string;
  name: string;
  type: string;
  required: boolean;
  unique: boolean;
  primary_key: boolean;
  length: number | null;
  precision: number | null;
  scale: number | null;
  default: unknown;
  options: string[] | null;
  target: string | null;
  target_field: string | null;
  is_column: boolean;
}

export interface TableSchema {
  table: string;
  plugin: string;
  system: boolean;
  audit: boolean;
  child: boolean;
  /** Physical table name of the parent that owns this child table, or null
   *  when `child` is false (or, in principle, an orphaned child schema). */
  parent_table: string | null;
  fields: FieldMeta[];
  system_fields: FieldMeta[];
  indexes: Array<Record<string, unknown>>;
}

export type Row = Record<string, unknown>;

export interface Role {
  id: string;
  name: string;
  description: string | null;
}

export interface User {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  status: "Active" | "Inactive" | "Locked";
  has_roles: string[] | null;
  max_sessions: number | null;
  allowed_ips: string[] | null;
  locked_until: string | null;
  last_login_at: string | null;
  created_by: string | null;
  updated_by: string | null;
}

export interface Session {
  id: string;
  user: string;
  session_type: string;
  expires_at: string;
  revoked_at: string | null;
  ip_address: string | null;
  last_seen_at: string | null;
}

export interface AccessKey {
  id: string;
  user: string;
  key_prefix: string;
  label: string | null;
  scopes: string[] | null;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

/* Editable schema/patch file content — the raw JSON shape on disk
   (docs/arc.MD §3.9), what get_schema_file returns and save_schema_file
   accepts. */
export interface SchemaField {
  id: string;
  name: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  primary_key?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  default?: unknown;
  options?: string[];
  target?: string;
  target_field?: string;
}

export interface SchemaIndex {
  key: string;
  fields: string[];
}

export interface SchemaFileContent {
  system?: boolean;
  audit?: boolean;
  child?: boolean;
  fields: SchemaField[];
  index?: SchemaIndex[];
}

export interface SchemaFileList {
  schemas: string[];
  patches: string[];
}

/** One registered table's metadata (admin.list_table_meta).
 *  `name` is the schema FILE STEM ("Department") — the ONLY valid value for
 *  a REFERENCE/TABLE field's `target`. `table` is the physical, slugified
 *  name ("department"), for display and schema lookups only. Setting
 *  `target` to the physical name does not resolve and breaks every query. */
export interface TableMeta {
  name: string;
  table: string;
  plugin: string;
  system: boolean;
  child: boolean;
  audit: boolean;
  /** For a child table, the physical table name of the parent that owns it
   *  (resolved server-side from the parent's TABLE field). Null otherwise. */
  parent_table: string | null;
}

export interface AuditEntry {
  id: string;
  table: string;
  row_id: string;
  changes: { before: Record<string, unknown> | null; after: Record<string, unknown> | null };
  changed_by: string | null;
  changed_at: string;
}

export interface MigrationOp {
  kind: string;
  table: string;
  plugin: string;
  description: string;
  destructive: boolean;
  source: string;
}

export interface MigrationPlan {
  empty: boolean;
  ops: MigrationOp[];
  warnings: string[];
}

/* apply_schema_file / apply_patch_file — table-scoped "Apply Now" (2026-07-17).
   confirm=false returns this as a dry preview (applied is always false);
   confirm=true either applies for real (applied: true, migration_file +
   process_warning set) or, if the DB already matched, applies nothing. */
export interface ApplySchemaResult {
  ok: boolean;
  table: string;
  empty: boolean;
  applied: boolean;
  ops: MigrationOp[];
  warnings: string[];
  migration_file: string | null;
  process_warning: string | null;
}

/** admin.list_settings() — value is always null for a "secret" row; a
 *  real value is only ever fetched on demand via admin.reveal_secret(). */
export interface SettingEntry {
  key: string;
  kind: "setting" | "secret";
  value: string | null;
}

/** admin.list_scheduled_jobs() — live config (arc.lineup.scheduled_tasks())
 *  paired with the most recent Scheduler-triggered row from _job_log, if any. */
export interface ScheduledJob {
  task_name: string;
  queue: string;
  cron: string;
  last_run_at: string | null;
  last_status: "success" | "failed" | null;
}

/** admin.list_job_log() — one row per execution, regardless of whether it
 *  ran via relay's in-process fallback or a real lineup worker/scheduler. */
export interface JobLogEntry {
  id: string;
  task_name: string;
  queue: string;
  executor: "relay" | "lineup";
  job_type: "Scheduler" | "Task";
  queued_by: string | null;
  status: "success" | "failed";
  error: string | null;
  started_at: string;
  finished_at: string;
  duration_ms: number;
}
