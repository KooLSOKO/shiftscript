import { useState } from "react";
import { api, statuses, priorities } from "../lib.js";
import { Check, CalendarDays, X } from "./Icons.jsx";
export default function TaskBulkActions({
  selected,
  filtered,
  members,
  projects,
  onSelect,
  onClear,
  onSaved,
  onCalendar,
}) {
  const [changes, setChanges] = useState({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (key, value) =>
    setChanges((previous) => {
      const next = { ...previous };
      if (value === "") delete next[key];
      else next[key] = value;
      return next;
    });
  return (
    <section className="panel bulk-task-actions" aria-label="Bulk task actions">
      <div className="section-heading">
        <h3>{selected.length} task(s) selected</h3>
        <div className="flex gap-2">
          <button
            className="text-button"
            onClick={() =>
              onSelect(filtered.slice(0, 25).map((task) => task.id))
            }
          >
            Select this view (up to 25)
          </button>
          {selected.length > 0 && (
            <button
              className="icon-button"
              aria-label="Clear selected tasks"
              onClick={onClear}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      {selected.length > 0 && (
        <>
          <div className="field-grid">
            <label>
              Bulk status
              <select
                aria-label="Bulk task status"
                value={changes.status || ""}
                onChange={(event) => set("status", event.target.value)}
              >
                <option value="">Keep current status</option>
                {statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              Bulk priority
              <select
                aria-label="Bulk task priority"
                value={changes.priority || ""}
                onChange={(event) => set("priority", event.target.value)}
              >
                <option value="">Keep current priority</option>
                {priorities.map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
            </label>
            <label>
              Bulk assignee
              <select
                aria-label="Bulk task assignee"
                value={
                  changes.ownerUid === null ? "none" : changes.ownerUid || ""
                }
                onChange={(event) => {
                  const value = event.target.value;
                  setChanges((previous) => {
                    const next = { ...previous };
                    if (!value) {
                      delete next.ownerUid;
                      delete next.owner;
                    } else if (value === "none") {
                      next.ownerUid = null;
                      next.owner = "Unassigned";
                    } else {
                      next.ownerUid = value;
                      next.owner =
                        members.find((member) => member.uid === value)?.name ||
                        "Unassigned";
                    }
                    return next;
                  });
                }}
              >
                <option value="">Keep current assignee</option>
                <option value="none">Unassigned</option>
                {members.map((member) => (
                  <option key={member.uid} value={member.uid}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Bulk project
              <select
                aria-label="Bulk task project"
                value={
                  changes.projectId === null ? "none" : changes.projectId || ""
                }
                onChange={(event) =>
                  set(
                    "projectId",
                    event.target.value === "none" ? null : event.target.value,
                  )
                }
              >
                <option value="">Keep current project</option>
                <option value="none">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              className="button primary"
              disabled={busy || !Object.keys(changes).length}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await api("/tasks/bulk", {
                    method: "POST",
                    body: JSON.stringify({
                      tasks: selected.map((task) => ({
                        id: task.id,
                        expectedUpdatedAt: task.updatedAt,
                      })),
                      changes,
                    }),
                  });
                  await onSaved(result);
                  setChanges({});
                  onClear();
                } catch (error) {
                  setError(error.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Check size={16} />
              {busy ? "Updating…" : "Apply to selected tasks"}
            </button>
            <button className="button" onClick={onCalendar}>
              <CalendarDays size={16} />
              Schedule selected tasks
            </button>
          </div>
          <p className="hint mt-3">
            Changes apply together. If any task changed or is blocked by a
            dependency, refresh before retrying.
          </p>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
