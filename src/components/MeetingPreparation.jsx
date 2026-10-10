import { useState } from "react";
import { api, today, types } from "../lib.js";
import Modal from "./Modal.jsx";
import { Save, Copy } from "./Icons.jsx";
import { followUpReport } from "../../shared/productivity.js";
export default function MeetingPreparation({
  data,
  initialMeetingId,
  onClose,
  onSaved,
  onUse,
}) {
  const [previousId, setPreviousId] = useState(initialMeetingId || ""),
    [projectId, setProjectId] = useState(""),
    [title, setTitle] = useState(""),
    [date, setDate] = useState(today()),
    [type, setType] = useState("Project review"),
    [agenda, setAgenda] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(null),
    [notice, setNotice] = useState("");
  function generate() {
    const previous = data.meetings.find((meeting) => meeting.id === previousId),
      report = followUpReport(previous, data.tasks),
      open = previous
        ? report.open
        : data.tasks.filter(
            (task) =>
              task.status !== "Completed" &&
              (!projectId || task.projectId === projectId),
          );
    const lines = [
      "Meeting agenda",
      "",
      "1. Review progress",
      ...open
        .slice(0, 30)
        .map(
          (task) =>
            `• ${task.title} — ${task.owner}; due ${task.dueDate || "not set"}; ${task.status}`,
        ),
      "",
      "2. Decisions to revisit",
      ...(previous?.decisions || []).map((decision) => "• " + decision),
      "",
      "3. Follow-up topics",
      ...(previous?.followUps || []).map((item) => "• " + item),
      "",
      "4. New decisions and next steps",
    ];
    setAgenda(lines.join("\n").slice(0, 4000));
    if (!title)
      setTitle(
        previous
          ? ("Follow-up: " + previous.title).slice(0, 120)
          : "Project planning",
      );
    if (previous?.projectId) setProjectId(previous.projectId);
    setSaved(null);
  }
  async function save(use = false) {
    setBusy(true);
    setError("");
    try {
      const result = await api("/agendas", {
        method: "POST",
        body: JSON.stringify({
          title,
          date,
          type,
          projectId: projectId || null,
          parentMeetingId: previousId || null,
          agenda,
          clientId: saved?.clientId || crypto.randomUUID(),
        }),
      });
      setSaved(result.agenda);
      await onSaved();
      setNotice("Agenda saved to this workspace.");
      if (use) onUse(result.agenda);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Prepare your next meeting" onClose={onClose}>
      <p className="muted mb-4">
        Build an agenda from unfinished work and previous decisions. Review and
        edit it with your team.
      </p>
      <div className="field-grid">
        <label>
          Previous meeting
          <select
            aria-label="Previous meeting for agenda"
            value={previousId}
            onChange={(event) => {
              setPreviousId(event.target.value);
              setSaved(null);
            }}
          >
            <option value="">Start from workspace tasks</option>
            {data.meetings.map((meeting) => (
              <option key={meeting.id} value={meeting.id}>
                {meeting.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Agenda project
          <select
            aria-label="Agenda project"
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setSaved(null);
            }}
          >
            <option value="">All projects</option>
            {data.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Agenda title
          <input
            value={title}
            minLength={3}
            maxLength={120}
            onChange={(event) => {
              setTitle(event.target.value);
              setSaved(null);
            }}
          />
        </label>
        <label>
          Agenda date
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setSaved(null);
            }}
          />
        </label>
        <label>
          Agenda meeting type
          <select
            aria-label="Agenda meeting type"
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setSaved(null);
            }}
          >
            {types.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
      </div>
      <button className="button mt-4" onClick={generate}>
        Generate agenda from existing work
      </button>
      <label className="block mt-4">
        Meeting agenda
        <textarea
          aria-label="Meeting agenda"
          rows={10}
          maxLength={4000}
          value={agenda}
          onChange={(event) => {
            setAgenda(event.target.value);
            setSaved(null);
          }}
        />
      </label>
      <div className="flex flex-wrap gap-2 mt-4">
        <button
          className="button"
          disabled={!agenda}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(agenda);
              setNotice("Agenda copied.");
            } catch {
              setError("Copy is unavailable. Select and copy the agenda text.");
            }
          }}
        >
          <Copy size={16} />
          Copy agenda
        </button>
        <button
          className="button"
          disabled={busy || title.trim().length < 3 || !agenda.trim()}
          onClick={() => save()}
        >
          <Save size={16} />
          Save agenda
        </button>
        <button
          className="button primary"
          disabled={busy || title.trim().length < 3 || !agenda.trim()}
          onClick={() => save(true)}
        >
          Use for new meeting
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success-text">
          {notice}
        </p>
      )}
    </Modal>
  );
}
export function MeetingFollowUp({
  meeting,
  meetings,
  tasks,
  onTask,
  onMeeting,
}) {
  const previous = meetings.find(
    (item) => item.id === meeting.preparation?.parentMeetingId,
  );
  if (!previous) return null;
  const report = followUpReport(previous, tasks, meeting);
  return (
    <section className="panel follow-up-panel mb-5">
      <h2>Follow-through from the previous meeting</h2>
      <button
        className="text-button mt-2"
        onClick={() => onMeeting(previous.id)}
      >
        {previous.title}
      </button>
      <p className="hint mt-2">
        Current progress on earlier commitments. Decision mentions are
        text-matching hints for human review.
      </p>
      <div className="field-grid mt-4">
        <div>
          <h3>Completed commitments · {report.completed.length}</h3>
          {report.completed.map((task) => (
            <button
              className="text-button block mt-2"
              key={task.id}
              onClick={() => onTask(task.id)}
            >
              {task.title}
            </button>
          ))}
        </div>
        <div>
          <h3>Still open · {report.open.length}</h3>
          {report.open.map((task) => (
            <button
              className="text-button block mt-2"
              key={task.id}
              onClick={() => onTask(task.id)}
            >
              {task.title} · {task.status}
            </button>
          ))}
        </div>
      </div>
      <h3 className="mt-4">Earlier decisions</h3>
      {report.decisions.map(({ text, discussed }, index) => (
        <p className="follow-up-decision" key={index}>
          <span className="badge">
            {discussed ? "Mentioned in this summary" : "Review in follow-up"}
          </span>
          {text}
        </p>
      ))}
      {report.followUps.length > 0 && (
        <>
          <h3 className="mt-4">Earlier follow-up topics</h3>
          <ul>
            {report.followUps.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
