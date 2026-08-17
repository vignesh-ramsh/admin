import { useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { call, ApiError } from "../../api/client";
import { uploadFilerFile } from "../../api/filerClient";
import type { FilerSettingEntry } from "../../api/types";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { TextInput, Select, Switch } from "../../components/Field";
import { useToast } from "../../components/Toast";
import type { FilesOutletContext } from "./FilerFilesTab";

export function UploadFileRoute() {
  const navigate = useNavigate();
  const { reload } = useOutletContext<FilesOutletContext>();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [storage, setStorage] = useState("local");
  const [isPrivate, setIsPrivate] = useState(true);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);

  // Default the Storage dropdown to whatever filer_default_storage is
  // actually configured to (docs/admin-ui-ux-review.md §5.2), instead of
  // hardcoding "local" — only applied if the user hasn't already touched
  // the dropdown by the time the setting loads.
  const storageTouched = useRef(false);
  useEffect(() => {
    call<FilerSettingEntry[]>("list_filer_settings", {}, { method: "GET" })
      .then((rows) => {
        const configured = rows.find((r) => r.key === "filer_default_storage")?.value;
        // filer_default_storage is a "select"-kind entry, never a bool
        // one — always a real string at runtime — but FilerSettingEntry
        // .value is honestly typed as string | boolean | null now (a
        // bool-kind entry really can be a boolean), so this needs an
        // explicit narrow rather than relying on the type alone.
        if (typeof configured === "string" && configured && !storageTouched.current) {
          setStorage(configured);
        }
      })
      .catch(() => {
        /* best-effort — "local" stays the fallback if this fails */
      });
  }, []);

  const close = () => navigate("/files/browse");

  const submit = async () => {
    if (!file) {
      toast.error("Pick a file first.");
      return;
    }
    setBusy(true);
    try {
      await uploadFilerFile(file, { storage, private: isPrivate, path: path.trim() || undefined });
      toast.success(`Uploaded "${file.name}".`);
      reload();
      close();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Upload file"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!file}>
            Upload
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-text-muted">File</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="cursor-pointer text-sm text-text file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent-action file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-fg hover:file:brightness-95"
          />
        </div>
        <Select
          label="Storage provider"
          value={storage}
          onChange={(e) => {
            storageTouched.current = true;
            setStorage(e.target.value);
          }}
        >
          <option value="local">local</option>
          <option value="s3">s3</option>
        </Select>
        <TextInput
          label="Path"
          hint="Organizational folder, e.g. idcards or hr/contracts. Leave blank for 'ungrouped'."
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="ungrouped"
        />
        <Switch checked={isPrivate} onChange={setIsPrivate} label="Private — only reachable via a short-lived signed link" />
      </div>
    </Modal>
  );
}
