import { useState } from "react";
import { ApiError } from "../../api/client";
import { uploadFilerFile } from "../../api/filerClient";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Field, Select } from "../../components/Field";
import { Checkbox } from "../../components/agni/forms/Checkbox";
import { useToast } from "../../components/Toast";

export function UploadFileModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [storage, setStorage] = useState("local");
  const [isPrivate, setIsPrivate] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!file) {
      toast.error("Pick a file first.");
      return;
    }
    setBusy(true);
    try {
      await uploadFilerFile(file, { storage, private: isPrivate });
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
          <Select value={storage} onChange={(e) => setStorage(e.target.value)}>
            <option value="local">local</option>
            <option value="s3">s3</option>
          </Select>
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
