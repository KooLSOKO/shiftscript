import { useEffect, useRef, useState } from "react";
import { api } from "../lib.js";
import Modal from "./Modal.jsx";
import { Mail, CheckCircle2 } from "./Icons.jsx";
import { parseRecipients } from "../../shared/recipients.js";
import { MAX_RECAP_RECIPIENTS } from "../../shared/limits.js";
export default function RecapEmail({ meeting, onClose, reload }) {
  const [preview, setPreview] = useState(null),
    [addresses, setAddresses] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(null);
  const requestId = useRef(crypto.randomUUID());
  const recipientList = parseRecipients(addresses);
  useEffect(() => {
    let active = true;
    api("/meetings/" + meeting.id + "/email-preview")
      .then((v) => {
        if (active) setPreview(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [meeting.id]);
  async function send(e) {
    e.preventDefault();
    if (
      !preview ||
      busy ||
      recipientList.error ||
      !recipientList.recipients.length
    )
      return;
    setBusy(true);
    setError("");
    try {
      const recipients = recipientList.recipients;
      const v = await api("/meetings/" + meeting.id + "/email", {
        method: "POST",
        body: JSON.stringify({
          recipients,
          requestId: requestId.current,
          fingerprint: preview.fingerprint,
        }),
      });
      setSent(v.send);
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Email the meeting recap"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="hint">
        Send from Earny's configured Zoho address. Choose the recipients and
        review the recap before sending.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {sent ? (
        <div className="recap-result" role="status">
          <CheckCircle2 size={30} />
          <h3>
            {sent.status === "accepted"
              ? "Recap accepted by the mail server"
              : "Check the send result"}
          </h3>
          <p>
            {sent.accepted.length} recipient(s) accepted. {sent.rejected.length}{" "}
            rejected.
          </p>
          <p className="hint">
            Mail-server acceptance does not confirm inbox delivery.
          </p>
          <button className="button primary" onClick={onClose}>
            Done
          </button>
        </div>
      ) : preview ? (
        <form onSubmit={send}>
          <h3 className="mt-4">{meeting.title}</h3>
          <label className="recap-recipients">
            Recipients
            <textarea
              aria-label="Recipients"
              rows={2}
              required
              placeholder="name@example.com, another@example.com"
              value={addresses}
              onChange={(e) => setAddresses(e.target.value)}
              disabled={busy}
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="email"
            />
          </label>
          <p className="hint mt-2">
            Up to {MAX_RECAP_RECIPIENTS} addresses, separated by commas or new
            lines. Recipient addresses are hidden from each other.
          </p>
          {addresses.trim() && (
            <p
              className={recipientList.error ? "form-error" : "hint mt-2"}
              role={recipientList.error ? "alert" : "status"}
            >
              {recipientList.error ||
                `${recipientList.recipients.length} recipient(s) · duplicate addresses removed`}
            </p>
          )}
          <p className="badge mt-4">
            {preview.approvedCount} approved task(s) included ·{" "}
            {preview.pendingCount} pending excluded
          </p>
          <details className="transcript recap-preview" open>
            <summary>Review the email content</summary>
            <pre>{preview.text}</pre>
          </details>
          <div className="modal-actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                !!recipientList.error ||
                !recipientList.recipients.length
              }
            >
              <Mail size={17} />
              {busy ? "Sending…" : "Send recap"}
            </button>
          </div>
        </form>
      ) : (
        <p className="hint mt-4" role="status">
          Loading recap…
        </p>
      )}
    </Modal>
  );
}
