import { priorities } from "../lib.js";
import { quickDates } from "../../shared/productivity.js";
import { ownerCandidates } from "../../shared/identity.js";
export default function Fields({ value, onChange, members = [] }) {
  const change = (key, v) => onChange({ ...value, [key]: v });
  const candidates = !value.ownerUid
    ? ownerCandidates(value.owner, members)
    : [];
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
      {candidates.length > 0 && (
        <div className="owner-suggestion col-span-full">
          {candidates.length === 1 ? (
            <>
              <p className="hint">
                Suggested workspace member: {candidates[0].name}. Confirm to
                link this task to their account.
              </p>
              <button
                type="button"
                className="button small"
                onClick={() =>
                  onChange({
                    ...value,
                    owner: candidates[0].name,
                    ownerUid: candidates[0].uid,
                  })
                }
              >
                Assign to {candidates[0].name}
              </button>
            </>
          ) : (
            <p className="hint">
              {candidates.length} people match “{value.owner}”. Choose the
              correct Workspace assignee before approving.
            </p>
          )}
        </div>
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
          aria-label="Confirmed due date"
          value={value.dueDate || ""}
          onChange={(e) => change("dueDate", e.target.value || null)}
        />
        <span className="quick-dates">
          {quickDates().map(([label, date]) => (
            <button
              key={label}
              type="button"
              onClick={() => change("dueDate", date)}
            >
              {label}
            </button>
          ))}
        </span>
      </label>
    </div>
  );
}
