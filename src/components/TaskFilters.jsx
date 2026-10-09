import { defaultFilters } from "../features/task-filters.js";
import { statuses, priorities } from "../lib.js";
import { Filter, Search } from "./Icons.jsx";
export default function TaskFilters({
  value,
  onChange,
  tasks,
  projects,
  count,
}) {
  const change = (key, v) => onChange({ ...value, [key]: v });
  return (
    <section className="panel filter-panel" aria-label="Task filters">
      <div className="section-heading">
        <h2 className="flex items-center gap-2">
          <Filter size={18} />
          Find the next step
        </h2>
        <span className="badge">
          {count} {count === 1 ? "task" : "tasks"}
        </span>
        <button
          className="text-button"
          onClick={() => onChange({ ...defaultFilters })}
        >
          Clear filters
        </button>
      </div>
      <div className="filter-grid">
        <label className="filter-search">
          Search tasks
          <div className="search-field">
            <Search size={16} />
            <input
              placeholder="Task, owner or meeting"
              value={value.search}
              onChange={(e) => change("search", e.target.value)}
            />
          </div>
        </label>
        <label>
          Status
          <select
            aria-label="Status"
            value={value.status}
            onChange={(e) => change("status", e.target.value)}
          >
            <option>All</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select
            aria-label="Priority"
            value={value.priority}
            onChange={(e) => change("priority", e.target.value)}
          >
            <option>All</option>
            {priorities.map((s) => (
              <option key={s} value={s}>
                {s === "Med" ? "Medium" : s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Owner
          <select
            aria-label="Owner"
            value={value.owner}
            onChange={(e) => change("owner", e.target.value)}
          >
            <option>All</option>
            <option value="Me">Assigned to me</option>
            {[...new Set(tasks.map((t) => t.owner))].sort().map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Project
          <select
            aria-label="Project"
            value={value.project}
            onChange={(e) => change("project", e.target.value)}
          >
            <option value="All">All projects</option>
            <option value="None">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Due date
          <select
            aria-label="Due date"
            value={value.due}
            onChange={(e) => change("due", e.target.value)}
          >
            {[
              "All",
              "Overdue",
              "Today",
              "Next 7 days",
              "No deadline",
              "Custom range",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Source
          <select
            aria-label="Source"
            value={value.source}
            onChange={(e) => change("source", e.target.value)}
          >
            <option value="All">All sources</option>
            <option value="meeting">From meetings</option>
            <option value="manual">Added manually</option>
          </select>
        </label>
        <label>
          Sort by
          <select
            aria-label="Sort by"
            value={value.sort}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="due">Due date</option>
            <option value="priority">Priority</option>
            <option value="title">Title</option>
          </select>
        </label>
        {value.due === "Custom range" && (
          <>
            <label>
              From
              <input
                type="date"
                value={value.from}
                onChange={(e) => change("from", e.target.value)}
              />
            </label>
            <label>
              Until
              <input
                type="date"
                min={value.from}
                value={value.to}
                onChange={(e) => change("to", e.target.value)}
              />
            </label>
          </>
        )}
      </div>
    </section>
  );
}
