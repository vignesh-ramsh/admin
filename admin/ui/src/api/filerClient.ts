import { ApiError } from "./client";

/* filer's own /files/upload takes a raw multipart body — client.ts's
   call() always sends JSON, so this is a small, separate, direct fetch()
   instead, the same "auth flows bypass call()" precedent login()/
   logout() already set in client.ts itself. Duplicates client.ts's tiny
   CSRF-cookie read rather than exporting it — not worth a shared symbol
   for two lines. */
function csrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let code: string | undefined;
  try {
    const body = await res.json();
    message = body.error || body.detail || message;
    code = body.code;
  } catch {
    /* non-JSON body — keep the generic message */
  }
  return new ApiError(message, res.status, code);
}

export interface UploadResult {
  file_id: string;
  status: string;
  private: boolean;
  path: string;
}

export async function uploadFilerFile(
  file: File,
  options: { storage?: string; private?: boolean; path?: string } = {}
): Promise<UploadResult> {
  const params = new URLSearchParams();
  if (options.storage) params.set("storage", options.storage);
  if (options.private !== undefined) params.set("private", String(options.private));
  if (options.path) params.set("path", options.path);
  const qs = params.toString();

  const form = new FormData();
  form.append("file", file);

  const token = csrfToken();
  const res = await fetch(`/files/upload${qs ? `?${qs}` : ""}`, {
    method: "POST",
    credentials: "same-origin",
    headers: token ? { "X-CSRF-Token": token } : {},
    body: form,
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}
