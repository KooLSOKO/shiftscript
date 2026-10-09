import { useState } from "react";
import { api } from "../lib.js";
import { Folder, Plus, Edit, ArrowUpRight } from "./Icons.jsx";
import Modal from "./Modal.jsx";
export default function Projects({
  projects,
  tasks,
  meetings,
  readOnly,
  onSaved,
  onOpen,
}) {
  const [edit, setEdit] = useState(undefined),
    [value, setValue] = useState({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const open = (p) => {
    setEdit(p || null);
    setValue(
      p
        ? {
            name: p.name,
            description: p.description,
            color: p.color,
            status: p.status,
          }
        : { name: "", description: "", color: "blue", status: "active" },
    );
    setError("");
  };
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/projects" + (edit ? "/" + edit.id : ""), {
        method: edit ? "PATCH" : "POST",
        body: JSON.stringify(value),
      });
      await onSaved();
      setEdit(undefined);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-heading mb-5">
        <p className="muted">
          Group related meetings and tasks without losing their source.
        </p>
        {!readOnly && (
          <button className="button primary" onClick={() => open(null)}>
            <Plus size={17} />
            New project
          </button>
        )}
      </div>
      {!projects.length && (
        <section className="panel empty">
          <Folder size={32} />
          <h3>A place for the bigger picture.</h3>
          <p>Create a project for a client, launch or ongoing piece of work.</p>
        </section>
      )}
      <div className="project-grid">
        {projects.map((p) => {
          const work = tasks.filter((t) => t.projectId === p.id),
            done = work.filter((t) => t.status === "Completed").length;
          return (
            <article
              className={"panel project-card project-" + p.color}
              key={p.id}
            >
              <div className="section-heading">
                <span className="project-icon">
                  <Folder size={26} />
                </span>
                <span className="badge">
                  {p.status === "completed" ? "Completed" : "Active"}
                </span>
                {!readOnly && (
                  <button
                    className="icon-button"
                    aria-label={"Edit " + p.name}
                    onClick={() => open(p)}
                  >
                    <Edit size={17} />
                  </button>
                )}
              </div>
              <h2>{p.name}</h2>
              <p className="muted project-description">
                {p.description || "Meetings and next steps, together."}
              </p>
              <div className="project-counts">
                <span>
                  {meetings.filter((m) => m.projectId === p.id).length} meetings
                </span>
                <span>{work.length} tasks</span>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-label={p.name + " task progress"}
                aria-valuemin={0}
                aria-valuemax={work.length || 1}
                aria-valuenow={done}
              >
                <span
                  style={{
                    width: (work.length ? (100 * done) / work.length : 0) + "%",
                  }}
                />
              </div>
              <p className="hint">
                {done} of {work.length} tasks completed
              </p>
              <button className="text-button mt-4" onClick={() => onOpen(p.id)}>
                Open project work
                <ArrowUpRight size={16} />
              </button>
            </article>
          );
        })}
      </div>
      {edit !== undefined && (
        <Modal
          title={edit ? "Edit project" : "A new project"}
          onClose={() => {
            if (!busy) setEdit(undefined);
          }}
        >
          <form onSubmit={save}>
            <fieldset disabled={busy}>
              <label className="block mb-4">
                Project name
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={value.name}
                  onChange={(e) => setValue({ ...value, name: e.target.value })}
                />
              </label>
              <label className="block mb-4">
                Description
                <textarea
                  rows={3}
                  maxLength={700}
                  value={value.description}
                  onChange={(e) =>
                    setValue({ ...value, description: e.target.value })
                  }
                />
              </label>
              <div className="field-grid">
                <label>
                  Accent colour
                  <select
                    aria-label="Accent colour"
                    value={value.color}
                    onChange={(e) =>
                      setValue({ ...value, color: e.target.value })
                    }
                  >
                    {["blue", "teal", "coral", "amber", "purple"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Project status
                  <select
                    aria-label="Project status"
                    value={value.status}
                    onChange={(e) =>
                      setValue({ ...value, status: e.target.value })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                </label>
              </div>
              <p className="hint mt-3">
                Completing a project keeps its meetings and tasks available.
              </p>
              <button className="button primary mt-5">Save project</button>
            </fieldset>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}
