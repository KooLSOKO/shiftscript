import { useState } from "react";
import {
  calendarEventUrl,
  calendarDurations,
  deviceTimeZone,
} from "../features/calendar.js";
import { CalendarDays, ArrowUpRight } from "./Icons.jsx";
import Modal from "./Modal.jsx";

export default function TaskCalendar({ task, onClose }) {
  const [date, setDate] = useState(task.dueDate || "");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(30);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  function change(setter, value) {
    setter(value);
    setUrl("");
    setError("");
  }
  function open(e) {
    e.preventDefault();
    try {
      const link = calendarEventUrl(
        task,
        { date, time, duration },
        window.location.origin,
      );
      setError("");
      setUrl(link);
      window.open(link, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <Modal title="Add task to Google Calendar" onClose={onClose}>
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
        {task.dueDate
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
          <div className="calendar-zone">
            <span>Time zone</span>
            <strong>{deviceTimeZone().replaceAll("_", " ")}</strong>
            <small>Uses your device's time zone.</small>
          </div>
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
            Open Google Calendar <ArrowUpRight size={17} />
          </button>
        </div>
      </form>
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
            Open event draft again <ArrowUpRight size={15} />
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
