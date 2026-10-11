import { useEffect, useRef, useState } from "react";
import { api, today, types, formatDate } from "../lib.js";
import {
  Plus,
  Search,
  FileText,
  Upload,
  RefreshCw,
  Trash,
  Save,
  Camera,
} from "./Icons.jsx";
import Modal from "./Modal.jsx";
import ProcessingLoader from "./ProcessingLoader.jsx";
import {
  prepareNotePhoto,
  defaultPhotoOptions,
} from "../features/note-photo.js";
import { MAX_NOTE_CHARS } from "../../shared/limits.js";
const blank = () => ({
  title: "",
  text: "",
  date: today(),
  projectId: null,
  meetingId: null,
  photo: null,
});
const editable = (note) =>
  Object.fromEntries(
    Object.keys(blank()).map((k) => [k, note[k] ?? blank()[k]]),
  );
function NoteEditor({
  note,
  workspaceId,
  projects,
  meetings,
  config,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(note ? editable(note) : blank),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [warnings, setWarnings] = useState([]),
    [file, setFile] = useState(null),
    [options, setOptions] = useState(defaultPhotoOptions),
    [photo, setPhoto] = useState(null),
    [preview, setPreview] = useState(""),
    [append, setAppend] = useState(true);
  const mounted = useRef(true),
    saving = useRef(false),
    workLock = useRef(false),
    clientId = useRef(crypto.randomUUID()),
    photoGeneration = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      photoGeneration.current++;
    };
  }, []);
  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(photo.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const change = (k, v) => setForm((old) => ({ ...old, [k]: v }));
  const dirty =
    JSON.stringify(form) !== JSON.stringify(note ? editable(note) : blank());
  function close() {
    if (busy || saving.current) return;
    if (!dirty || window.confirm("Discard the unsaved changes to this note?"))
      onClose();
  }
  async function prepare(chosen = file, settings = options) {
    if (!chosen || busy || workLock.current) return;
    workLock.current = true;
    const ticket = ++photoGeneration.current;
    setBusy("compress");
    setError("");
    try {
      const result = await prepareNotePhoto(chosen, settings);
      if (mounted.current && ticket === photoGeneration.current)
        setPhoto(result);
    } catch (e) {
      if (mounted.current) {
        setPhoto(null);
        setError(e.message);
      }
    } finally {
      workLock.current = false;
      if (mounted.current) setBusy("");
    }
  }
  async function scan() {
    if (
      !photo ||
      busy ||
      workLock.current ||
      photo.options !== JSON.stringify(options)
    )
      return;
    workLock.current = true;
    setBusy("scan");
    setError("");
    setWarnings([]);
    try {
      const result = await api("/notes/scan", {
        workspace: workspaceId,
        method: "POST",
        body: JSON.stringify({
          name: photo.name,
          mimeType: photo.mimeType,
          data: photo.data,
        }),
      });
      if (!mounted.current) return;
      const combined =
        append && form.text.trim()
          ? form.text.trimEnd() + "\n\n" + result.text
          : result.text;
      if (combined.length > MAX_NOTE_CHARS)
        throw new Error(
          "The combined note exceeds 20,000 characters. Save this page as a separate note; your existing text is kept.",
        );
      setForm((old) => ({
        ...old,
        text: combined,
        photo: result.photo,
        title: old.title || file.name.replace(/\.[^.]+$/, "").slice(0, 120),
      }));
      setWarnings(result.warnings || []);
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      workLock.current = false;
      if (mounted.current) setBusy("");
    }
  }
  async function save(e) {
    e.preventDefault();
    if (busy || saving.current) return;
    saving.current = true;
    setBusy("save");
    setError("");
    try {
      const result = await api(note ? "/notes/" + note.id : "/notes", {
        workspace: workspaceId,
        method: note ? "PUT" : "POST",
        body: JSON.stringify({
          ...form,
          ...(note
            ? { expectedVersion: note.version }
            : { clientId: clientId.current }),
        }),
      });
      if (mounted.current) await onSaved(result.note);
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      saving.current = false;
      if (mounted.current) setBusy("");
    }
  }
  return (
    <Modal title={note ? "Edit note" : "New note"} onClose={close}>
      <p className="hint mb-4">
        Shared with members of this workspace. Photos are sent to Gemini when
        you choose Extract text. Only the saved text and photo filename are
        kept.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="note-photo" aria-label="Photo to text">
        <div className="note-photo-actions">
          <label className="button">
            <Upload size={19} />
            Upload photo
            <input
              className="sr-only"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.heic,.heif"
              disabled={Boolean(busy)}
              onChange={(e) => {
                const f = e.target.files[0];
                e.target.value = "";
                if (!f) return;
                const initial = defaultPhotoOptions();
                setFile(f);
                setOptions(initial);
                setWarnings([]);
                prepare(f, initial);
              }}
            />
          </label>
          <label className="button">
            <Camera size={19} />
            Take photo
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              capture="environment"
              disabled={Boolean(busy)}
              onChange={(e) => {
                const f = e.target.files[0];
                e.target.value = "";
                if (!f) return;
                const initial = defaultPhotoOptions();
                setFile(f);
                setOptions(initial);
                prepare(f, initial);
              }}
            />
          </label>
        </div>
        <p className="hint">
          Good light, a flat page and one page per photo work best. Compression
          is automatic; no 200 KB limit.
        </p>
        {preview && (
          <>
            <img
              className="note-photo-preview"
              src={preview}
              alt="Notebook photo prepared for text extraction"
            />
            <p className="hint">
              {Math.round(photo.originalBytes / 1000)} KB →{" "}
              {Math.round(photo.bytes / 1000)} KB · {photo.width} ×{" "}
              {photo.height}
            </p>
          </>
        )}
        {file && (
          <details className="note-crop">
            <summary>Rotate or crop the page</summary>
            <p className="hint">
              Crop percentages refer to the edges of the original photo. Apply
              changes to update the preview.
            </p>
            <button
              className="button"
              disabled={Boolean(busy)}
              onClick={() => {
                const next = {
                  ...options,
                  rotation: (options.rotation + 90) % 360,
                };
                setOptions(next);
                prepare(file, next);
              }}
            >
              <RefreshCw size={18} />
              Rotate 90°
            </button>
            <div className="note-fields">
              {["top", "right", "bottom", "left"].map((edge) => (
                <label key={edge}>
                  Crop {edge} (%)
                  <input
                    type="number"
                    min="0"
                    max="40"
                    value={options[edge]}
                    disabled={Boolean(busy)}
                    onChange={(e) =>
                      setOptions((old) => ({ ...old, [edge]: e.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
            <button
              className="button"
              disabled={Boolean(busy)}
              onClick={() => prepare()}
            >
              Apply crop
            </button>
          </details>
        )}
        {form.text && (
          <label className="check-option">
            <input
              type="checkbox"
              checked={append}
              disabled={Boolean(busy)}
              onChange={(e) => setAppend(e.target.checked)}
            />
            Append scanned writing to this note
          </label>
        )}
        <button
          className="button primary"
          disabled={
            !photo ||
            Boolean(busy) ||
            !config.aiReady ||
            config.provider !== "gemini" ||
            photo.options !== JSON.stringify(options)
          }
          onClick={scan}
        >
          <FileText size={18} />
          Extract text
        </button>
        {config.provider !== "gemini" && (
          <p className="hint">
            Configure Gemini to scan photos. You can type and save notes now.
          </p>
        )}
        {busy && (
          <div className="note-working" role="status">
            <ProcessingLoader />
            <p>
              {busy === "scan"
                ? "Reading your photo…"
                : busy === "compress"
                  ? "Preparing your photo…"
                  : "Saving your note…"}
            </p>
          </div>
        )}
        {warnings.length > 0 && (
          <div className="note-scan-warning" role="status">
            <strong>Check this writing before saving.</strong>
            <ul>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <form className="note-editor" onSubmit={save}>
        <label>
          Note title
          <input
            required
            minLength="2"
            maxLength="120"
            value={form.title}
            disabled={Boolean(busy)}
            onChange={(e) => change("title", e.target.value)}
          />
        </label>
        <div className="note-fields">
          <label>
            Note date
            <input
              type="date"
              required
              value={form.date}
              disabled={Boolean(busy)}
              onChange={(e) => change("date", e.target.value)}
            />
          </label>
          <label>
            Project
            <select
              value={form.projectId || ""}
              disabled={Boolean(busy)}
              onChange={(e) => change("projectId", e.target.value || null)}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Related meeting
            <select
              value={form.meetingId || ""}
              disabled={Boolean(busy)}
              onChange={(e) => change("meetingId", e.target.value || null)}
            >
              <option value="">No related meeting</option>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Note text
          <textarea
            aria-label="Note text"
            required
            rows="12"
            maxLength={MAX_NOTE_CHARS}
            value={form.text}
            disabled={Boolean(busy)}
            onChange={(e) => change("text", e.target.value)}
            placeholder="Write your notes here, or extract them from a photo…"
          />
        </label>
        <p className="hint">
          {form.text.length.toLocaleString()} / 20,000 characters · Review
          names, dates and [unclear] sections. Saving creates no tasks.
        </p>
        <button className="button primary" disabled={Boolean(busy)}>
          <Save size={19} />
          Save note
        </button>
      </form>
    </Modal>
  );
}
function ProcessNote({
  note,
  workspaceId,
  projects,
  meetings,
  onClose,
  onCreated,
}) {
  const prior = meetings.find((m) =>
    note.processed.some(
      (p) => p.version === note.version && p.meetingId === m.id,
    ),
  );
  const [form, setForm] = useState({
      title: prior?.title || note.title,
      date: prior?.date || note.date,
      type: prior?.type || "Internal",
      projectId: prior ? prior.projectId : note.projectId,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(e) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await api("/notes/" + note.id + "/process", {
        workspace: workspaceId,
        method: "POST",
        body: JSON.stringify({ ...form, expectedVersion: note.version }),
      });
      if (mounted.current) await onCreated(r.meeting, { cached: r.cached });
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Modal title="Process note with Gemini" onClose={() => !busy && onClose()}>
      <p className="hint mb-4">
        This creates a meeting summary and proposed tasks from the saved note.
        You approve tasks before they enter the dashboard. The note is kept.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <form className="note-editor" onSubmit={submit}>
        <label>
          Meeting title
          <input
            required
            minLength="3"
            maxLength="120"
            value={form.title}
            disabled={busy}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <div className="note-fields">
          <label>
            Meeting date
            <input
              required
              type="date"
              value={form.date}
              disabled={busy}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </label>
          <label>
            Meeting type
            <select
              value={form.type}
              disabled={busy}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {types.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Project
            <select
              value={form.projectId || ""}
              disabled={busy}
              onChange={(e) =>
                setForm({ ...form, projectId: e.target.value || null })
              }
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details>
          <summary>Saved text to process</summary>
          <pre className="note-text">{note.text}</pre>
        </details>
        <button
          className="button primary"
          disabled={busy || note.text.trim().length < 40}
        >
          {busy ? "Processing…" : "Generate summary and proposals"}
        </button>
        {note.text.trim().length < 40 && (
          <p className="hint">Add at least 40 characters before processing.</p>
        )}
        {busy && (
          <div className="note-working" role="status">
            <ProcessingLoader />
            <p>Preparing your summary and proposed tasks…</p>
          </div>
        )}
      </form>
    </Modal>
  );
}
export default function Notes({
  notes = [],
  projects = [],
  meetings = [],
  workspaceId,
  config,
  readOnly,
  onChange,
  onMeeting,
  onProcessed,
  openId,
  onOpenConsumed,
}) {
  const [query, setQuery] = useState(""),
    [editor, setEditor] = useState(null),
    [selected, setSelected] = useState(null),
    [processing, setProcessing] = useState(null),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!openId) return;
    const note = notes.find((n) => n.id === openId);
    if (note) setSelected(note.id);
    else setError("That note is no longer available.");
    onOpenConsumed?.();
  }, [openId, notes]);
  const note = notes.find((n) => n.id === selected),
    filtered = notes.filter((n) =>
      (n.title + " " + n.text).toLowerCase().includes(query.toLowerCase()),
    );
  async function remove() {
    if (deleting || !note) return;
    setDeleting(true);
    setError("");
    try {
      await api("/notes/" + note.id, {
        workspace: workspaceId,
        method: "DELETE",
        body: JSON.stringify({ expectedVersion: note.version }),
      });
      setSelected(null);
      setConfirmDelete(false);
      await onChange();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  }
  return (
    <div className="notes-page">
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="notes-toolbar">
        <label className="notes-search">
          <Search size={21} />
          <span className="sr-only">Search notes</span>
          <input
            type="search"
            placeholder="Search notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {!readOnly && (
          <button className="button primary" onClick={() => setEditor({})}>
            <Plus size={20} />
            New note
          </button>
        )}
      </div>
      <p className="hint">
        Shared workspace notes · Keep a thought, scan a notebook page or turn
        agreed next steps into task proposals.
      </p>
      {!filtered.length ? (
        <section className="panel notes-empty">
          <img
            src="/art/clay/meeting-notes-small.png"
            alt=""
            width="160"
            height="160"
          />
          <h2>
            {query
              ? "No matching notes."
              : "A home for the things you jot down."}
          </h2>
          <p>
            {query
              ? "Try another word."
              : "Type a note or capture your notebook. Save it as-is, then process it when you’re ready."}
          </p>
          {!query && !readOnly && (
            <button className="button" onClick={() => setEditor({})}>
              Create your first note
            </button>
          )}
        </section>
      ) : (
        <div className="notes-grid">
          {filtered.map((n) => (
            <button
              className="panel note-card"
              key={n.id}
              onClick={() => {
                setSelected(n.id);
                setConfirmDelete(false);
              }}
            >
              <FileText size={28} />
              <h2>{n.title}</h2>
              <p className="hint">
                {formatDate(n.date)}
                {n.photo ? " · Photo scan" : " · Typed note"}
              </p>
              <p className="note-excerpt">
                {n.text.slice(0, 180)}
                {n.text.length > 180 ? "…" : ""}
              </p>
              <span className="badge">
                {n.processed.some((p) => p.version === n.version)
                  ? "Processed"
                  : "Saved note"}
              </span>
            </button>
          ))}
        </div>
      )}
      {note && (
        <Modal
          title={note.title}
          onClose={() => {
            if (!deleting) {
              setSelected(null);
              setConfirmDelete(false);
            }
          }}
        >
          <p className="hint mb-4">
            {formatDate(note.date)} · Version {note.version} · Shared workspace
            note
          </p>
          <pre className="note-text">{note.text}</pre>
          {note.photo && (
            <p className="hint">
              Latest photo scan: {note.photo.name}. Original image is not
              stored.
            </p>
          )}
          <div className="note-detail-actions">
            {!readOnly && (
              <>
                <button
                  className="button"
                  onClick={() => {
                    setEditor(note);
                    setSelected(null);
                  }}
                >
                  Edit note
                </button>
                <button
                  className="button primary"
                  disabled={note.text.trim().length < 40 || !config.aiReady}
                  onClick={() => {
                    setProcessing(note);
                    setSelected(null);
                  }}
                >
                  Process with Gemini
                </button>
                <button
                  className="text-button"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash size={18} />
                  Delete note
                </button>
              </>
            )}
            {note.meetingId &&
              meetings.some((m) => m.id === note.meetingId) && (
                <button
                  className="button"
                  onClick={() => onMeeting(note.meetingId)}
                >
                  Open related meeting
                </button>
              )}
            {note.processed
              .filter((p) => meetings.some((m) => m.id === p.meetingId))
              .map((p) => (
                <button
                  className="button"
                  key={p.meetingId}
                  onClick={() => onMeeting(p.meetingId)}
                >
                  Open processed meeting · v{p.version}
                </button>
              ))}
          </div>
          {confirmDelete && (
            <div className="note-delete">
              <p>
                Delete this note? Existing meeting summaries and approved tasks
                will remain.
              </p>
              <button className="button" disabled={deleting} onClick={remove}>
                Confirm delete note
              </button>
              <button
                className="text-button"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
              >
                Keep note
              </button>
            </div>
          )}
        </Modal>
      )}
      {editor && !readOnly && (
        <NoteEditor
          key={editor.id || "new"}
          note={editor.id ? editor : null}
          workspaceId={workspaceId}
          projects={projects}
          meetings={meetings}
          config={config}
          onClose={() => setEditor(null)}
          onSaved={async (n) => {
            setEditor(null);
            await onChange();
            setSelected(n.id);
          }}
        />
      )}
      {processing && !readOnly && (
        <ProcessNote
          note={processing}
          meetings={meetings}
          workspaceId={workspaceId}
          projects={projects}
          onClose={() => setProcessing(null)}
          onCreated={async (m, result) => {
            setProcessing(null);
            await onChange();
            onProcessed(m, result);
          }}
        />
      )}
    </div>
  );
}
