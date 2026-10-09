import { useEffect, useRef, useState } from "react";
import { api, today, types } from "../lib.js";
import { Save, Upload, ArrowRight, RefreshCw } from "./Icons.jsx";
import Modal from "./Modal.jsx";
import AudioInput from "./AudioInput.jsx";
const blank = () => ({
  title: "",
  date: today(),
  type: "Project review",
  transcript: "",
  projectId: null,
});
export default function NewMeeting({
  config,
  workspaceId,
  actorId,
  projects,
  draft,
  onClose,
  onCreated,
}) {
  const key = `shiftscript:draft:${actorId}:${workspaceId}`;
  const initial = useRef(null);
  if (!initial.current) {
    let local;
    try {
      local = JSON.parse(localStorage.getItem(key));
    } catch {
      /* Unavailable storage is harmless. */
    }
    const server = draft && {
      form: Object.fromEntries(
        Object.entries(draft).filter(([k]) =>
          [
            "title",
            "date",
            "type",
            "transcript",
            "source",
            "projectId",
          ].includes(k),
        ),
      ),
      modifiedAt: draft.updatedAt,
    };
    initial.current =
      local && (!server || local.modifiedAt > server.modifiedAt)
        ? local.form
        : server?.form || blank();
  }
  const [form, setForm] = useState(initial.current),
    [busy, setBusy] = useState(false),
    [audioBusy, setAudioBusy] = useState(false),
    [error, setError] = useState(""),
    [saveState, setSaveState] = useState("Draft ready");
  const latest = useRef(form),
    version = useRef(draft?.version || 0),
    queue = useRef(Promise.resolve()),
    saved = useRef(
      draft
        ? JSON.stringify(
            Object.fromEntries(
              Object.entries(draft).filter(([k]) =>
                [
                  "title",
                  "date",
                  "type",
                  "transcript",
                  "source",
                  "projectId",
                ].includes(k),
              ),
            ),
          )
        : "",
    ),
    timer = useRef(),
    processed = useRef(false),
    mounted = useRef(true),
    localFailure = useRef(false);
  latest.current = form;
  const message = (text) => {
    if (mounted.current) setSaveState(text);
  };
  function save() {
    clearTimeout(timer.current);
    const snapshot = JSON.stringify(latest.current);
    if (processed.current) return queue.current;
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (processed.current || saved.current === snapshot) return;
        message("Saving draft…");
        try {
          const result = await api("/drafts/current", {
            workspace: workspaceId,
            method: "PUT",
            body: JSON.stringify({
              ...JSON.parse(snapshot),
              expectedVersion: version.current,
            }),
          });
          version.current = result.draft.version;
          saved.current = snapshot;
          message(localFailure.current ? "Saved to workspace" : "Draft saved");
        } catch (e) {
          message(
            (localFailure.current ? "Draft not saved. " : "Local copy kept. ") +
              e.message,
          );
          throw e;
        }
      });
    return queue.current;
  }
  useEffect(() => {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ form, modifiedAt: new Date().toISOString() }),
      );
    } catch {
      localFailure.current = true;
    }
    if (JSON.stringify(form) !== saved.current) {
      setSaveState("Saving draft…");
      timer.current = setTimeout(() => {
        save().catch(() => {});
      }, 650);
    }
    return () => clearTimeout(timer.current);
  }, [form]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  async function close() {
    if (busy || audioBusy) return;
    try {
      await save();
    } catch {
      /* Local copy remains available. */
    }
    onClose();
  }
  const change = (k, v) => setForm((previous) => ({ ...previous, [k]: v }));
  async function submit(e) {
    e.preventDefault();
    if (audioBusy) return;
    setBusy(true);
    setError("");
    try {
      try {
        await save();
      } catch {
        /* Processing still works with the visible draft. */
      }
      const result = await api("/meetings", {
        workspace: workspaceId,
        method: "POST",
        body: JSON.stringify(latest.current),
      });
      processed.current = true;
      clearTimeout(timer.current);
      try {
        await api("/drafts/current", {
          workspace: workspaceId,
          method: "DELETE",
          body: JSON.stringify({ expectedVersion: version.current }),
        });
      } catch {
        /* Keep a newer draft from another tab. */
      }
      try {
        localStorage.removeItem(key);
      } catch {
        /* Storage unavailable. */
      }
      await onCreated(result.meeting);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt") || file.size > 60000)
      return setError("Choose a .txt transcript under 60 KB.");
    try {
      const transcript = await file.text();
      if (transcript.length > 15000)
        throw new Error("Transcript must be under 15,000 characters.");
      setForm((p) => ({
        ...p,
        transcript,
        source: { kind: "text", name: file.name },
      }));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <Modal title="A new conversation" onClose={close}>
      <p className="muted mb-3">
        Your draft is private to you in this workspace. Audio recordings are not
        saved in drafts.
      </p>
      <p className="draft-status" role="status">
        <Save size={16} />
        {saveState}
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <div className="field-grid">
            <label className="col-span-full">
              Meeting title
              <input
                required
                minLength={3}
                maxLength={120}
                value={form.title}
                onChange={(e) => change("title", e.target.value)}
                placeholder="e.g. Portfolio launch review"
              />
            </label>
            <label>
              Meeting date
              <input
                required
                type="date"
                value={form.date}
                onChange={(e) => change("date", e.target.value)}
              />
            </label>
            <label>
              Meeting type
              <select
                aria-label="Meeting type"
                value={form.type}
                onChange={(e) => change("type", e.target.value)}
              >
                {types.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="col-span-full">
              Project
              <select
                aria-label="Project"
                value={form.projectId || ""}
                onChange={(e) => change("projectId", e.target.value || null)}
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.status === "completed" ? " (completed)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <AudioInput
            config={config}
            disabled={busy}
            onBusy={setAudioBusy}
            onTranscript={(transcript, source) =>
              setForm((p) => ({ ...p, transcript, source }))
            }
          />
          <div className="flex flex-wrap gap-3 justify-between mt-5 mb-2">
            <span className="field-label">Transcript</span>
            <div className="flex gap-3">
              <button
                type="button"
                className="text-button"
                disabled={audioBusy}
                onClick={() => {
                  setForm((p) => ({
                    title: "Dashboard project review",
                    date: "2026-10-09",
                    type: "Project review",
                    projectId: p.projectId,
                    transcript: config.sampleTranscript,
                  }));
                  setError("");
                }}
              >
                Load sample
              </button>
              <label className="text-button upload">
                <Upload size={14} />
                Upload .txt
                <input
                  aria-label="Upload transcript"
                  type="file"
                  accept=".txt,text/plain"
                  disabled={audioBusy}
                  onChange={(e) => upload(e.target.files?.[0])}
                />
              </label>
            </div>
          </div>
          <textarea
            aria-label="Meeting transcript"
            required
            minLength={40}
            maxLength={15000}
            rows={10}
            value={form.transcript}
            onChange={(e) => change("transcript", e.target.value)}
            placeholder="Paste a transcript here. Speaker names help identify owners."
          />
          <p className="hint mt-2">
            {form.transcript.length.toLocaleString()} / 15,000 characters ·
            Check speaker names and dates before processing.
          </p>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button"
            disabled={busy || audioBusy}
            onClick={close}
          >
            Save & close
          </button>
          <button className="button primary" disabled={busy || audioBusy}>
            {busy ? (
              <>
                <RefreshCw className="spin" size={16} />
                Reading the conversation…
              </>
            ) : (
              <>
                Process transcript
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
