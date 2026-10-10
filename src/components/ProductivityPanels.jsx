import { useState } from "react";
import Modal from "./Modal.jsx";
import { api, today } from "../lib.js";
import { defaultFilters } from "../features/task-filters.js";
import { taskNotifications, waitingOn } from "../../shared/productivity.js";
import {
  Search,
  ListTodo,
  NotebookPen,
  Folder,
  Check,
  Save,
  Trash,
  Clock,
} from "./Icons.jsx";
export function Notifications({
  data,
  actor,
  personal,
  onRead,
  onTask,
  onClose,
}) {
  const notices = taskNotifications(data.tasks, actor, personal?.preferences),
    read = new Set(personal?.readNotifications || []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function mark(ids) {
    setBusy(true);
    try {
      const result = await api("/notifications/read", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      onRead(result.readNotifications);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Your notifications" onClose={onClose}>
      <p className="hint mb-4">
        Assignments and deadlines in this workspace. Adjust reminders in
        Profile.
      </p>
      <button
        className="button small mb-4"
        disabled={busy || !notices.length}
        onClick={() => mark(notices.slice(0, 100).map((notice) => notice.id))}
      >
        <Check size={16} />
        Mark all read
      </button>
      <div className="notification-list">
        {notices.slice(0, 60).map((notice) => (
          <article
            key={notice.id}
            className={
              "notification-item " +
              (read.has(data.workspace?.id + ":" + notice.id) ? "read" : "")
            }
          >
            <span
              className={"badge " + (notice.kind === "overdue" ? "high" : "")}
            >
              {notice.text}
            </span>
            <button
              className="card-title"
              onClick={() => {
                mark([notice.id]);
                onTask(notice.taskId);
                onClose();
              }}
            >
              {notice.title}
            </button>
            {!read.has(data.workspace?.id + ":" + notice.id) && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => mark([notice.id])}
              >
                Mark read
              </button>
            )}
          </article>
        ))}
      </div>
      {!notices.length && (
        <p className="muted">You're up to date. No task notifications here.</p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
export function GlobalSearch({ data, onTask, onMeeting, onProject, onClose }) {
  const [query, setQuery] = useState(""),
    term = query.trim().toLowerCase();
  const groups = [
    [
      "Tasks",
      ListTodo,
      data.tasks.filter((item) =>
        (item.title + " " + item.description + " " + item.owner)
          .toLowerCase()
          .includes(term),
      ),
      onTask,
    ],
    [
      "Meetings",
      NotebookPen,
      data.meetings.filter((item) =>
        (item.title + " " + item.summary).toLowerCase().includes(term),
      ),
      onMeeting,
    ],
    [
      "Projects",
      Folder,
      data.projects.filter((item) =>
        (item.name + " " + item.description).toLowerCase().includes(term),
      ),
      onProject,
    ],
  ];
  return (
    <Modal title="Search your workspace" onClose={onClose}>
      <label className="block">
        Search meetings, tasks and projects
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for a title, owner or topic"
        />
      </label>
      <div className="global-results">
        {groups.map(([label, Icon, items, open]) => (
          <section key={label}>
            <h3>{label}</h3>
            {items.slice(0, 8).map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  open(item.id);
                  onClose();
                }}
              >
                <Icon size={18} />
                <span>
                  {item.title || item.name}
                  <small>{item.owner || item.type || item.status}</small>
                </span>
              </button>
            ))}
            {!items.length && (
              <p className="hint">No matching {label.toLowerCase()}.</p>
            )}
          </section>
        ))}
      </div>
      <p className="hint mt-4">
        ⌘/Ctrl + K: search · N: new meeting · Escape: close. Search covers this
        workspace.
      </p>
    </Modal>
  );
}
export function ActivityFeed({ activity = [], onTask, onMeeting, onProject }) {
  const [filter, setFilter] = useState("All");
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Workspace activity</h2>
        <select
          aria-label="Activity type"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option>All</option>
          <option value="task">Tasks</option>
          <option value="meeting">Meetings</option>
          <option value="project">Projects</option>
        </select>
      </div>
      <div className="activity-list">
        {activity
          .filter((item) => filter === "All" || item.targetType === filter)
          .slice(0, 80)
          .map((item) => (
            <article key={item.id}>
              <Clock size={17} />
              <div>
                <p>
                  <strong>{item.actorName}</strong> {item.action}
                </p>
                <button
                  className="text-button"
                  onClick={() =>
                    ({ task: onTask, meeting: onMeeting, project: onProject })[
                      item.targetType
                    ]?.(item.targetId)
                  }
                >
                  {item.title}
                </button>
                <small>
                  {new Date(item.createdAt).toLocaleString("en-ZA")}
                </small>
              </div>
            </article>
          ))}
      </div>
      {!activity.length && (
        <p className="muted">
          New task, meeting and project changes will appear here.
        </p>
      )}
    </section>
  );
}
export function SavedViews({
  filters,
  personal,
  workspaceId,
  onChange,
  onSaved,
}) {
  const [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const builtIns = [
    ["My overdue tasks", { owner: "Me", due: "Overdue" }],
    ["Due this week", { due: "Next 7 days" }],
    ["Waiting for review", { status: "In Review" }],
  ];
  return (
    <section className="saved-views" aria-label="Saved task views">
      <div className="saved-view-buttons">
        {builtIns.map(([label, value]) => (
          <button
            key={label}
            className="button small"
            onClick={() => onChange({ ...defaultFilters, ...value })}
          >
            {label}
          </button>
        ))}
        {(personal?.savedViews || [])
          .filter((view) => view.workspaceId === workspaceId)
          .map((view) => (
            <span className="saved-view" key={view.id}>
              <button
                className="button small"
                onClick={() => onChange({ ...defaultFilters, ...view.filters })}
              >
                {view.name}
              </button>
              <button
                className="icon-button"
                aria-label={"Remove saved view " + view.name}
                onClick={async () => {
                  try {
                    const result = await api("/views/" + view.id, {
                      method: "DELETE",
                    });
                    onSaved(result.views);
                  } catch (error) {
                    setError(error.message);
                  }
                }}
              >
                <Trash size={14} />
              </button>
            </span>
          ))}
      </div>
      <form
        className="inline-form mt-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await api("/views", {
              method: "POST",
              body: JSON.stringify({ name: name.trim(), filters }),
            });
            onSaved(result.views);
            setName("");
          } catch (error) {
            setError(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="Saved view name"
          maxLength={40}
          minLength={2}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name this filtered view"
        />
        <button
          className="button small"
          disabled={busy || name.trim().length < 2}
        >
          <Save size={16} />
          Save view
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function NeedsAttention({ data, onTasks, onMeetings }) {
  const pending = data.meetings.reduce(
      (total, meeting) =>
        total +
        meeting.proposals.filter(
          (proposal) => proposal.reviewStatus === "pending",
        ).length,
      0,
    ),
    active = data.tasks.filter((task) => task.status !== "Completed");
  const items = [
    [
      "Missing owners",
      active.filter(
        (task) =>
          !task.ownerUid && (!task.owner || task.owner === "Unassigned"),
      ).length,
      () => onTasks({ owner: "Unassigned", status: "Active" }),
    ],
    [
      "Missing deadlines",
      active.filter((task) => !task.dueDate).length,
      () => onTasks({ due: "No deadline", status: "Active" }),
    ],
    [
      "Waiting on dependencies",
      active.filter((task) => waitingOn(task, data.tasks).length).length,
      () => onTasks({ status: "All", dependency: "waiting" }),
    ],
    [
      "Overdue tasks",
      active.filter((task) => task.dueDate && task.dueDate < today()).length,
      () => onTasks({ due: "Overdue" }),
    ],
    ["Proposals to review", pending, onMeetings],
  ];
  return (
    <section className="panel attention-panel">
      <h2>Needs attention</h2>
      <div>
        {items.map(([label, count, open]) => (
          <button key={label} onClick={open}>
            <strong>{count}</strong>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
