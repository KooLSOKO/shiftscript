import { useState } from "react";
import { api, fields, formatDate, exportFile } from "../lib.js";
import { exportPdf, meetingReport } from "../features/exports.js";
import {
  Check,
  X,
  FilePdf,
  Download,
  Quote,
  ChevronDown,
  Layers,
  Mail,
} from "./Icons.jsx";
import Fields from "./Fields.jsx";
import { ownerCandidates } from "../../shared/identity.js";
import { MeetingFollowUp } from "./MeetingPreparation.jsx";
import Priority from "./Priority.jsx";
import RecapEmail from "./RecapEmail.jsx";
export default function MeetingDetail({
  meeting: m,
  emailReady,
  workspace,
  projects,
  readOnly,
  reload,
  onBack,
  onTask,
  onError,
  tasks = [],
  meetings = [],
  onPrepare,
  onMeeting,
}) {
  const [email, setEmail] = useState(false);
  const [edits, setEdits] = useState({}),
    [selected, setSelected] = useState([]),
    [editing, setEditing] = useState({}),
    [busy, setBusy] = useState(false),
    [bulkOwner, setBulkOwner] = useState(""),
    [bulkPriority, setBulkPriority] = useState(""),
    [bulkDue, setBulkDue] = useState("");
  const pending = m.proposals.filter((p) => p.reviewStatus === "pending"),
    value = (p) =>
      p.reviewStatus === "pending" ? edits[p.id] || fields(p) : fields(p);
  async function review(ids, decision) {
    setBusy(true);
    try {
      const reviews = pending
        .filter((p) => ids.includes(p.id))
        .map((p) => ({ ...value(p), proposalId: p.id, decision }));
      if (!reviews.length) return;
      await api("/meetings/" + m.id + "/reviews", {
        method: "POST",
        body: JSON.stringify({ reviews }),
      });
      setSelected([]);
      await reload();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function applyBulk() {
    const next = { ...edits };
    for (const p of pending.filter((p) => selected.includes(p.id))) {
      let v = { ...value(p) };
      if (bulkOwner) {
        const member = workspace?.members.find((m) => m.uid === bulkOwner);
        v = {
          ...v,
          ownerUid: member?.uid || null,
          owner: member?.name || "Unassigned",
        };
      }
      if (bulkPriority) v.priority = bulkPriority;
      if (bulkDue) v.dueDate = bulkDue;
      next[p.id] = v;
    }
    setEdits(next);
    setEditing(Object.fromEntries(selected.map((id) => [id, true])));
  }
  async function pdf() {
    setBusy(true);
    try {
      await exportPdf(meetingReport(m, workspace, projects));
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="flex flex-wrap gap-3 mb-5">
        <button className="button small" onClick={onBack}>
          ← Meeting history
        </button>
        <button className="button small" disabled={busy} onClick={pdf}>
          <FilePdf size={16} />
          Export PDF
        </button>
        <button
          className="button small"
          onClick={() => exportFile("shiftscript-meeting-" + m.id + ".json", m)}
        >
          <Download size={16} />
          Export JSON
        </button>
        {!readOnly && (
          <button
            className="button small"
            disabled={!emailReady || busy}
            title={
              emailReady
                ? "Review and send the recap"
                : "Earny email setup is required"
            }
            onClick={() => setEmail(true)}
          >
            <Mail size={16} /> Email recap
          </button>
        )}
        <span className="badge">
          {m.provider === "sample"
            ? "Fictional sample · preset results"
            : "Gemini analysis"}
        </span>
        {m.source?.kind === "audio" && (
          <span className="badge">Voice source · {m.source.name}</span>
        )}
      </div>
      {!readOnly && (
        <button className="button small mb-4" onClick={() => onPrepare(m.id)}>
          Prepare follow-up meeting
        </button>
      )}
      <MeetingFollowUp
        meeting={m}
        meetings={meetings}
        tasks={tasks}
        onTask={onTask}
        onMeeting={onMeeting}
      />
      {m.preparation?.agenda && (
        <details className="panel agenda-preview mb-5">
          <summary>Meeting agenda</summary>
          <pre>{m.preparation.agenda}</pre>
        </details>
      )}
      {m.source?.kind?.startsWith("google-") && (
        <div className="source-banner">
          <span className="badge">
            {m.source.kind === "google-transcript"
              ? "Google Meet transcript"
              : m.source.kind === "google-notes"
                ? "Meet Gemini notes"
                : "Google document"}
          </span>
          <p className="hint">
            {m.source.kind === "google-transcript"
              ? "Speaker labels were provided by Google. Unknown speakers stay unassigned."
              : "Processed from notes or a document. Evidence refers to this source, rather than verbatim meeting speech."}
          </p>
          {m.source.url && (
            <a
              className="text-button"
              href={m.source.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open source document
            </a>
          )}
        </div>
      )}
      {email && (
        <RecapEmail
          meeting={m}
          onClose={() => setEmail(false)}
          reload={reload}
        />
      )}
      <label className="meeting-project">
        Project
        <select
          aria-label="Project"
          disabled={readOnly || busy}
          value={m.projectId || ""}
          onChange={async (e) => {
            setBusy(true);
            try {
              await api("/meetings/" + m.id + "/project", {
                method: "PATCH",
                body: JSON.stringify({ projectId: e.target.value || null }),
              });
              await reload();
            } catch (e) {
              onError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <p className="hint mb-5">
        Moving a meeting also moves its approved tasks into that project.
      </p>
      <div className="meeting-detail-grid">
        <div>
          <section className="panel notes">
            <p className="eyebrow">THE MEETING, AT A GLANCE</p>
            <h2>Meeting summary</h2>
            <p className="summary">{m.summary}</p>
            {[
              ["Key discussion points", m.discussionPoints],
              ["Decisions", m.decisions],
              ["Follow-ups", m.followUps],
            ].map(([label, items]) => (
              <div className="note-section" key={label}>
                <h3>{label}</h3>
                {items.length ? (
                  <ul>
                    {items.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">None identified.</p>
                )}
              </div>
            ))}
          </section>
          <details className="panel transcript mt-5">
            <summary>
              {m.source?.kind === "google-notes" ||
              m.source?.kind === "google-document"
                ? "Original source document"
                : "Original transcript"}
            </summary>
            <pre>{m.transcript}</pre>
          </details>
        </div>
        <section className="panel proposals">
          <div className="section-heading">
            <h2>Proposed tasks</h2>
            <span className="badge">{pending.length} pending</span>
          </div>
          <p className="hint mb-4">
            Confirm owners and dates before approval. Every approved task keeps
            its source meeting.
          </p>
          {!readOnly && pending.length > 0 && (
            <div className="bulk-toolbar">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={pending.every((p) => selected.includes(p.id))}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? pending.map((p) => p.id) : [],
                    )
                  }
                />
                Select all pending
              </label>
              {selected.length > 0 && (
                <>
                  <p className="hint">{selected.length} selected</p>
                  <div className="field-grid">
                    <label>
                      Set assignee
                      <select
                        aria-label="Set assignee"
                        value={bulkOwner}
                        onChange={(e) => setBulkOwner(e.target.value)}
                      >
                        <option value="">Keep individual owners</option>
                        <option value="unassigned">Unassigned</option>
                        {workspace?.members.map((member) => (
                          <option key={member.uid} value={member.uid}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Set priority
                      <select
                        aria-label="Set priority"
                        value={bulkPriority}
                        onChange={(e) => setBulkPriority(e.target.value)}
                      >
                        <option value="">Keep individual priorities</option>
                        <option>High</option>
                        <option value="Med">Medium</option>
                        <option>Low</option>
                      </select>
                    </label>
                    <label>
                      Set due date
                      <input
                        type="date"
                        value={bulkDue}
                        onChange={(e) => setBulkDue(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      className="button small"
                      disabled={busy}
                      onClick={applyBulk}
                    >
                      <Layers size={16} />
                      Apply details
                    </button>
                    <button
                      className="button primary small"
                      disabled={busy}
                      onClick={() => review(selected, "approved")}
                    >
                      <Check size={16} />
                      Approve selected
                    </button>
                    <button
                      className="button small"
                      disabled={busy}
                      onClick={() => review(selected, "rejected")}
                    >
                      Reject selected
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {!m.proposals.length && (
            <p className="empty">No actionable commitments identified.</p>
          )}
          {m.proposals.map((p) => {
            const v = value(p),
              isPending = p.reviewStatus === "pending";
            return (
              <article
                className={"proposal " + (!isPending ? "reviewed" : "")}
                key={p.id}
              >
                <div className="flex gap-3 items-start">
                  {isPending && !readOnly ? (
                    <input
                      className="proposal-check"
                      type="checkbox"
                      aria-label={"Select " + p.title}
                      checked={selected.includes(p.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, p.id]
                            : selected.filter((id) => id !== p.id),
                        )
                      }
                    />
                  ) : (
                    <span className="status-mark">
                      {isPending ? (
                        <Quote size={17} />
                      ) : p.reviewStatus === "approved" ? (
                        <Check size={17} />
                      ) : (
                        <X size={17} />
                      )}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3>{v.title}</h3>
                    <div className="task-meta">
                      <span>{v.owner || "Unassigned"}</span>
                      <span>
                        {v.dueDate ? formatDate(v.dueDate) : v.deadline}
                      </span>
                      <Priority value={v.priority} />
                    </div>
                  </div>
                  {!isPending && (
                    <span className="badge">{p.reviewStatus}</span>
                  )}
                </div>
                {isPending &&
                  !v.ownerUid &&
                  ownerCandidates(v.owner, workspace?.members || []).length >
                    0 && (
                    <div className="owner-suggestion mb-3">
                      {ownerCandidates(v.owner, workspace?.members || [])
                        .length === 1 ? (
                        <button
                          className="text-button"
                          disabled={busy || readOnly}
                          onClick={() => {
                            const member = ownerCandidates(
                              v.owner,
                              workspace.members,
                            )[0];
                            setEdits({
                              ...edits,
                              [p.id]: {
                                ...v,
                                ownerUid: member.uid,
                                owner: member.name,
                              },
                            });
                          }}
                        >
                          Suggested account:{" "}
                          {ownerCandidates(v.owner, workspace.members)[0].name}{" "}
                          · Confirm owner
                        </button>
                      ) : (
                        <p className="form-error">
                          More than one member matches “{v.owner}”. Review
                          details and choose the correct account before
                          approval.
                        </p>
                      )}
                    </div>
                  )}
                <blockquote className="evidence">“{p.evidence}”</blockquote>
                {isPending && !readOnly && (
                  <>
                    <button
                      className="text-button"
                      aria-expanded={!!editing[p.id]}
                      onClick={() =>
                        setEditing({ ...editing, [p.id]: !editing[p.id] })
                      }
                    >
                      {editing[p.id] ? "Hide fields" : "Review & edit details"}
                      <ChevronDown size={15} />
                    </button>
                    {editing[p.id] && (
                      <fieldset disabled={busy} className="mt-4">
                        <Fields
                          value={v}
                          members={workspace?.members || []}
                          onChange={(v) => setEdits({ ...edits, [p.id]: v })}
                        />
                      </fieldset>
                    )}
                    <div className="flex gap-2 mt-4">
                      <button
                        className="button primary small"
                        disabled={busy || v.title.trim().length < 3}
                        onClick={() => review([p.id], "approved")}
                      >
                        <Check size={16} />
                        Approve task
                      </button>
                      <button
                        className="button small"
                        disabled={busy}
                        onClick={() => review([p.id], "rejected")}
                      >
                        Reject
                      </button>
                    </div>
                  </>
                )}
                {p.taskId && (
                  <button
                    className="text-button mt-3"
                    onClick={() => onTask(p.taskId)}
                  >
                    Open approved task
                  </button>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </>
  );
}
