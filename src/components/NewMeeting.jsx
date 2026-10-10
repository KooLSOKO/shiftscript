import { useEffect, useRef, useState } from "react";
import { api, today, types } from "../lib.js";
import { Save, Upload, Video, FileText, NotebookPen } from "./Icons.jsx";
import GoogleMeet from "./GoogleMeet.jsx";
import Modal from "./Modal.jsx";
import AudioInput from "./AudioInput.jsx";
import ProcessingLoader from "./ProcessingLoader.jsx";
import {
  MAX_TRANSCRIPT_CHARS,
  MAX_TRANSCRIPT_FILE_BYTES,
} from "../../shared/limits.js";
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
  meetings = [],
  workspace,
  draft,
  onClose,
  onCreated,
  onOpenExisting,
  agendas = [],
  preparedAgenda,
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
            "preparation",
          ].includes(k),
        ),
      ),
      modifiedAt: draft.updatedAt,
    };
    initial.current = preparedAgenda
      ? {
          ...blank(),
          title: preparedAgenda.title,
          date: preparedAgenda.date,
          type: preparedAgenda.type,
          projectId: preparedAgenda.projectId,
          preparation: {
            agendaId: preparedAgenda.id,
            parentMeetingId: preparedAgenda.parentMeetingId,
            agenda: preparedAgenda.agenda,
          },
        }
      : local && (!server || local.modifiedAt > server.modifiedAt)
        ? local.form
        : server?.form || blank();
  }
  const [form, setForm] = useState(initial.current),
    [busy, setBusy] = useState(false),
    [audioBusy, setAudioBusy] = useState(false),
    [error, setError] = useState(""),
    [saveState, setSaveState] = useState("Draft ready");
  const [sourceMode, setSourceMode] = useState("text"),
    [importBusy, setImportBusy] = useState(false),
    [previousSearch, setPreviousSearch] = useState(""),
    [previousId, setPreviousId] = useState(null);
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
                  "preparation",
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
    if (latest.current.transcript.length > MAX_TRANSCRIPT_CHARS) {
      message("Shorten the transcript to save this draft");
      return Promise.resolve();
    }
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
    if (busy || audioBusy || importBusy) return;
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
    if (latest.current.transcript.length > MAX_TRANSCRIPT_CHARS)
      return setError(
        "Transcript must be no longer than 100,000 characters. Split it into separate meetings before processing.",
      );
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
    if (
      !file.name.toLowerCase().endsWith(".txt") ||
      file.size > MAX_TRANSCRIPT_FILE_BYTES
    )
      return setError(
        "Choose a .txt transcript up to 400 KB (100,000 characters).",
      );
    try {
      const transcript = await file.text();
      if (transcript.length > MAX_TRANSCRIPT_CHARS)
        throw new Error(
          "Transcript must be no longer than 100,000 characters. No text has been truncated.",
        );
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
  const previousMeetings = meetings.filter((m) =>
    (m.title + " " + m.date + " " + m.type)
      .toLowerCase()
      .includes(previousSearch.toLowerCase()),
  );
  const previousMeeting = meetings.find((m) => m.id === previousId);
  function usePrevious() {
    if (!previousMeeting) return;
    if (
      form.transcript &&
      !window.confirm(
        "Replace the text in this draft with the selected meeting transcript?",
      )
    )
      return;
    setForm({
      title: (previousMeeting.title + " — follow-up").slice(0, 120),
      date: previousMeeting.date,
      type: previousMeeting.type,
      projectId: projects.some((p) => p.id === previousMeeting.projectId)
        ? previousMeeting.projectId
        : null,
      transcript: previousMeeting.transcript,
      source: {
        kind: "text",
        name: ("Copied from " + previousMeeting.title).slice(0, 160),
      },
    });
    setSourceMode("text");
    setError("");
  }
  async function importedCreated(meeting) {
    // A Google import must not delete an unrelated text draft. Clear only an
    // empty draft created while opening this modal.
    if (!latest.current.transcript.trim() && !latest.current.title.trim()) {
      processed.current = true;
      clearTimeout(timer.current);
      try {
        await queue.current;
        await api("/drafts/current", {
          workspace: workspaceId,
          method: "DELETE",
          body: JSON.stringify({ expectedVersion: version.current }),
        });
        localStorage.removeItem(key);
      } catch {
        /* Existing local drafts remain available on failure. */
      }
    }
    await onCreated(meeting);
  }
  async function openSaved(meeting) {
    try {
      await save();
    } catch {
      /* Keep the local draft if saving is unavailable. */
    }
    await onOpenExisting?.(meeting);
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
      {agendas.length > 0 && (
        <label className="block mb-4">
          Saved agenda
          <select
            aria-label="Saved agenda"
            value={form.preparation?.agendaId || ""}
            onChange={(e) => {
              const agenda = agendas.find((item) => item.id === e.target.value);
              if (!agenda) return setForm(({ preparation, ...rest }) => rest);
              setForm((p) => ({
                ...p,
                preparation: {
                  agendaId: agenda.id,
                  parentMeetingId: agenda.parentMeetingId,
                  agenda: agenda.agenda,
                },
              }));
            }}
          >
            <option value="">No agenda attached</option>
            {agendas.map((agenda) => (
              <option key={agenda.id} value={agenda.id}>
                {agenda.title} · {agenda.date}
              </option>
            ))}
          </select>
        </label>
      )}
      {form.preparation && (
        <details className="agenda-preview mb-4">
          <summary>View meeting agenda</summary>
          <pre>{form.preparation.agenda}</pre>
          <p className="hint">
            The agenda is context for follow-up review. Paste the actual meeting
            transcript below for processing.
          </p>
        </details>
      )}
      <div
        className="meeting-source-tabs"
        role="group"
        aria-label="Meeting source"
      >
        {[
          ["text", "Text or voice", FileText],
          ["google", "Recent Google Meet", Video],
          ["previous", "Previous meeting", NotebookPen],
        ].map(([mode, label, Icon]) => (
          <button
            key={mode}
            type="button"
            className={"button small " + (sourceMode === mode ? "primary" : "")}
            aria-pressed={sourceMode === mode}
            disabled={busy || audioBusy || importBusy}
            onClick={() => setSourceMode(mode)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>
      {sourceMode !== "text" && (
        <p className="hint mb-4">
          Your text/voice draft is kept while you browse other sources.
        </p>
      )}
      {sourceMode === "google" && (
        <GoogleMeet
          embedded
          autoLoad
          config={config}
          projects={projects}
          workspace={workspace}
          initialForm={form}
          existingMeetings={meetings}
          onBeforeConnect={save}
          onBusyChange={setImportBusy}
          onCreated={importedCreated}
          onOpenExisting={openSaved}
          readOnly={false}
        />
      )}
      {sourceMode === "previous" && (
        <section className="previous-meetings">
          <label>
            Search saved meetings
            <input
              aria-label="Search saved meetings"
              placeholder="Search title, date or meeting type"
              value={previousSearch}
              onChange={(e) => setPreviousSearch(e.target.value)}
            />
          </label>
          <p className="hint mt-2">
            Reuse a transcript as a starting point. Its original meeting date is
            kept so relative deadlines stay accurate. Update the text and date
            for a new discussion. Existing tasks stay with their meeting.
          </p>
          <div className="previous-meeting-list">
            {previousMeetings.length ? (
              previousMeetings.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  aria-pressed={previousId === m.id}
                  className={
                    "previous-meeting-option " +
                    (previousId === m.id ? "selected" : "")
                  }
                  onClick={() => setPreviousId(m.id)}
                >
                  <FileText size={19} />
                  <span>
                    <strong>{m.title}</strong>
                    <small>
                      {m.date} · {m.type}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <p className="hint mt-4">No saved meetings match this view.</p>
            )}
          </div>
          {previousMeeting && (
            <>
              <details className="transcript">
                <summary>
                  Preview selected transcript ·{" "}
                  {previousMeeting.transcript.length.toLocaleString()}{" "}
                  characters
                </summary>
                <pre>{previousMeeting.transcript}</pre>
              </details>
              {busy && <ProcessingLoader label="Reading the conversation…" />}
              <div className="modal-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => openSaved(previousMeeting)}
                >
                  Open saved meeting
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={usePrevious}
                >
                  Use this transcript
                </button>
              </div>
            </>
          )}
        </section>
      )}
      {sourceMode === "text" && (
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
            <p className="hint mt-4 mb-4">
              Audio and live transcript processing send your content to Gemini.
              Confirm participant permission and{" "}
              <a
                className="text-button"
                href="/privacy#ai"
                target="_blank"
                rel="noopener noreferrer"
              >
                check AI data handling
              </a>{" "}
              before using private information. Use fictional or anonymised test
              content with unpaid Gemini.
            </p>
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
                      ...(p.preparation ? { preparation: p.preparation } : {}),
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
              rows={10}
              value={form.transcript}
              onChange={(e) => change("transcript", e.target.value)}
              placeholder="Paste a transcript here. Speaker names help identify owners."
            />
            <p className="hint mt-2">
              {form.transcript.length.toLocaleString()} /{" "}
              {MAX_TRANSCRIPT_CHARS.toLocaleString()} characters · Check speaker
              names and dates before processing.
            </p>
            {form.transcript.length > MAX_TRANSCRIPT_CHARS && (
              <p className="form-error" role="alert">
                This transcript exceeds 100,000 characters. Shorten it or split
                it into separate meetings before processing.
              </p>
            )}
          </fieldset>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {busy && <ProcessingLoader label="Reading the conversation…" />}
          <div className="modal-actions">
            <button
              type="button"
              className="button"
              disabled={busy || audioBusy}
              onClick={close}
            >
              Save & close
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                audioBusy ||
                form.transcript.length > MAX_TRANSCRIPT_CHARS
              }
            >
              {busy ? "Processing…" : "Process transcript"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
