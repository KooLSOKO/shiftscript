import Modal from "./Modal.jsx";
import { Trash } from "./Icons.jsx";
import { useEffect, useRef } from "react";

export default function ConfirmDelete({
  title,
  children,
  label,
  busy,
  error,
  onClose,
  onConfirm,
}) {
  const cancel = useRef(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => cancel.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="delete-confirm-content">{children}</div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="delete-confirm-actions">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={onClose}
          ref={cancel}
          autoFocus
        >
          Cancel
        </button>
        <button
          type="button"
          className="button delete-primary"
          disabled={busy}
          onClick={onConfirm}
        >
          <Trash size={18} /> {busy ? "Deleting…" : label}
        </button>
      </div>
    </Modal>
  );
}
