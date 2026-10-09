import { priorities } from "../lib.js";
export default function Fields({ value, onChange, members = [] }) {
  const change = (key, v) => onChange({ ...value, [key]: v });
  return (
    <div className="field-grid">
      <label className="col-span-full">
        Task title
        <input
          required
          minLength={3}
          maxLength={160}
          value={value.title}
          onChange={(e) => change("title", e.target.value)}
        />
      </label>
      <label className="col-span-full">
        Description
        <textarea
          rows={2}
          maxLength={1500}
          value={value.description}
          onChange={(e) => change("description", e.target.value)}
        />
      </label>
      <label>
        Assigned to
        <input
          maxLength={100}
          value={value.owner}
          onChange={(e) =>
            onChange({ ...value, owner: e.target.value, ownerUid: null })
          }
          placeholder="Unassigned"
        />
      </label>
      {members.length > 0 && (
        <label>
          Workspace assignee
          <select
            aria-label="Workspace assignee"
            value={value.ownerUid || ""}
            onChange={(e) => {
              const member = members.find((m) => m.uid === e.target.value);
              onChange({
                ...value,
                ownerUid: member?.uid || null,
                owner: member?.name || value.owner,
              });
            }}
          >
            <option value="">Name only / unassigned</option>
            {value.ownerUid &&
              !members.some((m) => m.uid === value.ownerUid) && (
                <option value={value.ownerUid}>
                  {value.owner} (former member)
                </option>
              )}
            {members.map((m) => (
              <option key={m.uid} value={m.uid}>
                {m.name} · {m.role}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Priority
        <select
          aria-label="Priority"
          value={value.priority}
          onChange={(e) => change("priority", e.target.value)}
        >
          {priorities.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label>
        Original deadline
        <input
          maxLength={150}
          value={value.deadline}
          onChange={(e) => change("deadline", e.target.value)}
          placeholder="Not specified"
        />
      </label>
      <label>
        Confirmed due date
        <input
          type="date"
          value={value.dueDate || ""}
          onChange={(e) => change("dueDate", e.target.value || null)}
        />
      </label>
    </div>
  );
}
