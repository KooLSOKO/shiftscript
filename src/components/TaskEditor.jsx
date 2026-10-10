import { useRef, useState } from "react";
import { api, fields, statuses } from "../lib.js";
import {
  Check,
  Plus,
  Trash,
  MessageSquare,
  ArrowUpRight,
  CalendarDays,
} from "./Icons.jsx";
import Modal from "./Modal.jsx";
import Fields from "./Fields.jsx";
const editorFields = (task) => ({
  ...fields(task),
  status: task.status,
  projectId: task.projectId || null,
  checklist: task.checklist || [],
});
export default function TaskEditor({
  task,
  projects,
  members,
  readOnly,
  onClose,
  onSaved,
  onSource,
  onCalendar,
}) {
  const [value, setValue] = useState(
    task
      ? {
          ...fields(task),
          status: task.status,
          projectId: task.projectId || null,
          checklist: task.checklist || [],
        }
      : {
          title: "",
          description: "",
          owner: "",
          ownerUid: null,
          deadline: "",
          dueDate: null,
          priority: "Med",
          status: "To Do",
          projectId: null,
          checklist: [],
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [note, setNote] = useState(""),
    [item, setItem] = useState("");
  const baseline = useRef(task ? JSON.stringify(editorFields(task)) : null);
  const version = useRef(task?.updatedAt),
    clientId = useRef(crypto.randomUUID());
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api(task ? "/tasks/" + task.id : "/tasks", {
        method: task ? "PATCH" : "POST",
        body: JSON.stringify({
          ...value,
          ...(task
            ? { expectedUpdatedAt: version.current }
            : { clientId: clientId.current }),
        }),
      });
      version.current = result.task.updatedAt;
      baseline.current = JSON.stringify(editorFields(result.task));
      setValue(editorFields(result.task));
      await onSaved(result.task);
      if (!task) onClose();
      else setSuccess("Changes saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function addNote(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/tasks/" + task.id + "/notes", {
        method: "POST",
        body: JSON.stringify({ text: note }),
      });
      setNote("");
      await onSaved();
      if (JSON.stringify(editorFields(result.task)) === baseline.current)
        version.current = result.task.updatedAt;
      setSuccess("Progress update saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={task ? "Task details" : "A new task"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {task?.meetingId ? (
        <button className="source-link mb-4" onClick={onSource}>
          From: {task.meetingTitle}
          <ArrowUpRight size={14} />
        </button>
      ) : (
        <p className="hint mb-4">
          {task
            ? "Added manually"
            : "Add work that did not come from a meeting."}
        </p>
      )}
      {readOnly && (
        <p className="read-only mb-4">
          You have Viewer access. You can read tasks and progress updates.
        </p>
      )}
      {task && (
        <div className="calendar-editor-action mb-4">
          <button
            type="button"
            className="button"
            onClick={onCalendar}
            disabled={
              busy || JSON.stringify(editorFields(value)) !== baseline.current
            }
          >
            <CalendarDays size={17} />
            Add to Google Calendar
          </button>
          {JSON.stringify(editorFields(value)) !== baseline.current && (
            <p className="hint mt-2">
              Save your changes before scheduling this task.
            </p>
          )}
        </div>
      )}
      <form onSubmit={save}>
        <fieldset disabled={busy || readOnly}>
          <Fields value={value} onChange={setValue} members={members} />
          <div className="field-grid mt-4">
            <label>
              Status
              <select
                aria-label="Status"
                value={value.status}
                onChange={(e) => setValue({ ...value, status: e.target.value })}
              >
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Project
              <select
                aria-label="Project"
                value={value.projectId || ""}
                onChange={(e) =>
                  setValue({ ...value, projectId: e.target.value || null })
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
          <div className="note-section">
            <h3>
              Checklist{" "}
              <span className="muted">
                {value.checklist.filter((c) => c.done).length}/
                {value.checklist.length}
              </span>
            </h3>
            {value.checklist.map((c) => (
              <div className="checklist-row" key={c.id}>
                <input
                  type="checkbox"
                  aria-label={"Complete " + c.text}
                  checked={c.done}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      checklist: value.checklist.map((v) =>
                        v.id === c.id ? { ...v, done: e.target.checked } : v,
                      ),
                    })
                  }
                />
                <span className={c.done ? "done" : ""}>{c.text}</span>
                {!readOnly && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={"Remove " + c.text}
                    onClick={() =>
                      setValue({
                        ...value,
                        checklist: value.checklist.filter((v) => v.id !== c.id),
                      })
                    }
                  >
                    <Trash size={16} />
                  </button>
                )}
              </div>
            ))}
            {!readOnly && (
              <div className="inline-form mt-3">
                <input
                  aria-label="New checklist item"
                  maxLength={200}
                  placeholder="Break the task into a small step"
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                />
                <button
                  type="button"
                  className="button small"
                  disabled={!item.trim() || value.checklist.length >= 30}
                  onClick={() => {
                    setValue({
                      ...value,
                      checklist: [
                        ...value.checklist,
                        {
                          id: crypto.randomUUID(),
                          text: item.trim(),
                          done: false,
                        },
                      ],
                    });
                    setItem("");
                  }}
                >
                  <Plus size={16} />
                  Add step
                </button>
              </div>
            )}
          </div>
          {task?.evidence && (
            <blockquote className="evidence">“{task.evidence}”</blockquote>
          )}
          {!readOnly && (
            <button className="button primary mt-4" disabled={busy}>
              {task ? "Save changes" : "Create task"}
              <Check size={16} />
            </button>
          )}
        </fieldset>
      </form>
      {task && (
        <div className="note-section">
          <h3 className="flex gap-2 items-center">
            <MessageSquare size={17} />
            Progress updates
          </h3>
          {task.notes?.length ? (
            task.notes.map((n) => (
              <div className="progress-note" key={n.id}>
                <p>{n.text}</p>
                <span>
                  {n.authorName || "Workspace member"} ·{" "}
                  {new Date(n.createdAt).toLocaleString("en-ZA")}
                </span>
              </div>
            ))
          ) : (
            <p className="hint">No progress updates yet.</p>
          )}
          {!readOnly && (
            <form onSubmit={addNote}>
              <label className="mt-4 block">
                Add a progress update
                <textarea
                  required
                  rows={2}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button
                className="button small mt-3"
                disabled={busy || !note.trim()}
              >
                Add update
              </button>
            </form>
          )}
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="success-text" role="status">
          {success}
        </p>
      )}
    </Modal>
  );
}
