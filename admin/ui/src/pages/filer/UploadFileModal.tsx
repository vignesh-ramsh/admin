import { useEffect, useRef, useState } from "react";
import { call, ApiError } from "../../api/client";
import { uploadFilerFile } from "../../api/filerClient";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Field, Select, Input } from "../../components/Field";
import { Checkbox } from "../../components/agni/forms/Checkbox";
import { useToast } from "../../components/Toast";

export function UploadFileModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [storage, setStorage] = useState("local");
  const [isPrivate, setIsPrivate] = useState(true);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  // Defaults to whatever filer_default_storage is actually configured to
  // (docs/admin-ui-ux-review.md #5.2 — this always defaulted to "local"
  // regardless of the real setting, visible on File Manager's own
  // Settings tab). Only applied if the user hasn't already touched the
  // dropdown by the time the setting loads.
  const storageTouched = useRef(false);
  useEffect(() => {
    call<{ key: string; value: string | null }[]>("list_filer_settings", {}, { method: "GET" })
      .then((rows) => {
        const configured = rows.find((r) => r.key === "filer_default_storage")?.value;
        if (configured && !storageTouched.current) setStorage(configured);
      })
      .catch(() => {
        /* best-effort — "local" stays the fallback if this fails */
      });
  }, []);

  const submit = async () => {
    if (!file) {
      toast.error("Pick a file first.");
      return;
    }
    setBusy(true);
    try {
      await uploadFilerFile(file, { storage, private: isPrivate, path: path.trim() || undefined });
      toast.success(`Uploaded "${file.name}".`);
      onUploaded();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed", "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Upload file"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!file}>
            Upload
          </Button>
        </>
      }
    >
      <div className="row-gap">
        <Field label="File">
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ width: "100%" }}
          />
        </Field>
        <Field label="Storage provider">
          <Select
            value={storage}
            onChange={(e) => {
              storageTouched.current = true;
              setStorage(e.target.value);
            }}
          >
            <option value="local">local</option>
            <option value="s3">s3</option>
          </Select>
        </Field>
        <Field label="Path" hint="Organizational folder, e.g. idcards or hr/contracts. Leave blank for 'ungrouped'.">
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="ungrouped"
          />
        </Field>
        <Checkbox
          checked={isPrivate}
          onChange={setIsPrivate}
          label="Private — only reachable via a short-lived signed link"
        />
      </div>
    </Modal>
  );
}
