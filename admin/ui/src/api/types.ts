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
  status: "Active" | "Inactive" | "Locked";
  has_roles: string[] | null;
  max_sessions: number | null;
  locked_until: string | null;
  last_login_at: string | null;
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
