import Priority from "./Priority.jsx";
import { useState } from "react";
import { Check, ChevronDown, Quote, X } from "./Icons.jsx";
import Fields from "./Fields.jsx";
import { api, fields, formatDate } from "../lib.js";
export default function Proposal({ proposal, meetingId, onDone, onError }) {
  const [value, setValue] = useState(fields(proposal)),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false);
  async function review(decision) {
    setBusy(true);
    try {
      await api(`/meetings/${meetingId}/proposals/${proposal.id}/review`, {
        method: "POST",
        body: JSON.stringify({ ...value, decision }),
      });
      await onDone();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const pending = proposal.reviewStatus === "pending";
  return (
    <article className={"proposal " + (!pending ? "reviewed" : "")}>
      <div className="flex gap-3 items-start">
        <span
          className={
            "status-mark " +
            (proposal.reviewStatus === "rejected" ? "rejected" : "")
          }
        >
          {pending ? (
            <Quote size={17} />
          ) : proposal.reviewStatus === "approved" ? (
            <Check size={17} />
          ) : (
            <X size={17} />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <h3>{proposal.title}</h3>
          <div className="task-meta">
            <span>{proposal.owner}</span>
            <span>
              {proposal.dueDate
                ? formatDate(proposal.dueDate)
                : proposal.deadline}
            </span>
            <Priority value={proposal.priority}/>
          </div>
        </div>
        {!pending && <span className="badge">{proposal.reviewStatus}</span>}
      </div>
      <blockquote className="evidence">“{proposal.evidence}”</blockquote>
      {pending && (
        <>
          <button
            className="text-button"
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? "Hide fields" : "Review & edit details"}
            <ChevronDown size={15} />
          </button>
          {editing && (
            <div className="mt-4">
              <Fields value={value} onChange={setValue} />
              <p className="hint mt-2">
                Confirm ambiguous dates here. The original wording stays
                visible.
              </p>
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <button
              className="button primary small"
              disabled={busy || value.title.trim().length < 3}
              onClick={() => review("approved")}
            >
              <Check size={16} />
              Approve task
            </button>
            <button
              className="button small"
              disabled={busy}
              onClick={() => review("rejected")}
            >
              Reject
            </button>
          </div>
        </>
      )}
    </article>
  );
}
