import { useState } from "react";
import {
  calendarEventUrl,
  calendarDurations,
  deviceTimeZone,
} from "../features/calendar.js";
import { CalendarDays } from "./Icons.jsx";
import { api } from "../lib.js";
import Modal from "./Modal.jsx";

export default function TaskCalendar({
  task,
  onClose,
  readOnly,
  onSaved,
  personal,
  workspaceId,
  onMarks,
}) {
  const [date, setDate] = useState(task.schedule?.date || task.dueDate || "");
  const [time, setTime] = useState(task.schedule?.time || "");
  const [duration, setDuration] = useState(task.schedule?.duration || 30);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [timeZone, setTimeZone] = useState(
      task.schedule?.timeZone || deviceTimeZone(),
    ),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const schedule = { date, time, duration, timeZone },
    fingerprint = JSON.stringify(schedule);
  const marked = personal?.calendarMarks?.some(
    (mark) =>
      mark.workspaceId === workspaceId &&
      mark.taskId === task.id &&
      mark.fingerprint === fingerprint,
  );
  function change(setter, value) {
    setter(value);
    setUrl("");
    setError("");
  }
  function open(e) {
    e.preventDefault();
    try {
      const link = calendarEventUrl(task, schedule, window.location.origin);
      if (
        marked &&
        !window.confirm(
          "You marked this event as added. Opening and saving another draft can create a duplicate. Continue?",
        )
      )
        return;
      setError("");
      setUrl(link);
      window.open(link, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <Modal
      title="Add task to Google Calendar"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="calendar-task-preview">
        <CalendarDays size={24} />
        <div>
          <h3>{task.title}</h3>
          <p className="hint">
            {task.owner || "Unassigned"}
            {task.meetingTitle ? " · " + task.meetingTitle : ""}
          </p>
        </div>
      </div>
      <p className="muted mb-4">
        {task.schedule
          ? "Your saved schedule is filled in. Adjust it or open your event draft."
          : task.dueDate
            ? "Your due date is filled in. Choose a time to block out this work."
            : "This task needs a date and start time before you can add it to your calendar."}
      </p>
      <form onSubmit={open}>
        <div className="field-grid">
          <label>
            Calendar date
            <input
              type="date"
              required
              min="1000-01-01"
              max="9999-12-31"
              value={date}
              onChange={(e) => change(setDate, e.target.value)}
            />
          </label>
          <label>
            Start time
            <input
              type="time"
              required
              value={time}
              onChange={(e) => change(setTime, e.target.value)}
            />
          </label>
          <label>
            Duration
            <select
              aria-label="Duration"
              value={duration}
              onChange={(e) => change(setDuration, Number(e.target.value))}
            >
              {calendarDurations.map((value) => (
                <option key={value} value={value}>
                  {value < 60
                    ? `${value} minutes`
                    : `${value / 60} ${value === 60 ? "hour" : "hours"}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Time zone
            <input
              aria-label="Time zone"
              value={timeZone}
              onChange={(event) => change(setTimeZone, event.target.value)}
            />
            <small className="hint">Defaults to your device's time zone.</small>
          </label>
        </div>
        <p className="hint mt-4">
          Includes the description, owner and source meeting. Click Save in
          Google Calendar. Your task's deadline stays unchanged.
        </p>
        <div className="modal-actions calendar-actions">
          <button
            className="button primary calendar-open"
            type="submit"
            disabled={!date || !time}
          >
            Open Google Calendar
          </button>
        </div>
      </form>
      {!readOnly && (
        <button
          className="button mt-4"
          disabled={busy || !date || !time}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              calendarEventUrl(task, schedule, window.location.origin);
              const result = await api("/tasks/schedules", {
                method: "POST",
                body: JSON.stringify({
                  tasks: [
                    {
                      id: task.id,
                      expectedUpdatedAt: task.updatedAt,
                      schedule,
                    },
                  ],
                }),
              });
              await onSaved(result);
              setNotice("Schedule saved to this task.");
            } catch (error) {
              setError(error.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save schedule to task
        </button>
      )}
      {marked && <p className="badge mt-3">Marked added to your calendar</p>}
      {(url || marked) && (
        <button
          className="text-button mt-3"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await api("/calendar/mark", {
                method: "POST",
                body: JSON.stringify({
                  taskId: task.id,
                  fingerprint,
                  saved: !marked,
                }),
              });
              onMarks(result.calendarMarks);
              setNotice(
                marked
                  ? "Calendar mark removed."
                  : "Marked added. ShiftScript cannot check your Google Calendar.",
              );
            } catch (error) {
              setError(error.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {marked
            ? "Remove calendar mark"
            : "I saved this event in Google Calendar"}
        </button>
      )}
      {notice && (
        <p className="success-text mt-3" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {url && (
        <div className="calendar-handoff" role="status">
          <p>
            Your event draft is ready. Save it in Google Calendar to add it.
          </p>
          <a
            className="text-button"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open event draft again
          </a>
          <p className="hint">
            Use this link if your browser blocked the new tab. Reopening and
            saving again can create another event.
          </p>
        </div>
      )}
    </Modal>
  );
}
