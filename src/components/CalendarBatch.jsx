import { useState } from "react";
import Modal from "./Modal.jsx";
import { api } from "../lib.js";
import {
  calendarEventUrl,
  calendarDurations,
  deviceTimeZone,
} from "../features/calendar.js";
import { Save } from "./Icons.jsx";
export default function CalendarBatch({
  tasks,
  readOnly,
  onSaved,
  onClose,
  personal,
  workspaceId,
  onMarks,
}) {
  const [schedules, setSchedules] = useState(
      Object.fromEntries(
        tasks.map((task) => [
          task.id,
          task.schedule || {
            date: task.dueDate || "",
            time: "",
            duration: 30,
            timeZone: deviceTimeZone(),
          },
        ]),
      ),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [notice, setNotice] = useState("");
  const set = (id, key, value) => {
    setSchedules((previous) => ({
      ...previous,
      [id]: { ...previous[id], [key]: value },
    }));
    setReady(false);
    setError("");
  };
  function validate() {
    tasks.forEach((task) =>
      calendarEventUrl(task, schedules[task.id], window.location.origin),
    );
  }
  return (
    <Modal
      title="Schedule selected tasks"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="muted mb-4">
        Set a date and time for every task. Open each event draft and save it in
        Google Calendar.
      </p>
      {tasks.map((task) => (
        <section key={task.id} className="batch-calendar-task">
          <h3>{task.title}</h3>
          <div className="field-grid mt-3">
            <label>
              Date for {task.title}
              <input
                type="date"
                value={schedules[task.id].date}
                onChange={(event) => set(task.id, "date", event.target.value)}
              />
            </label>
            <label>
              Time for {task.title}
              <input
                type="time"
                value={schedules[task.id].time}
                onChange={(event) => set(task.id, "time", event.target.value)}
              />
            </label>
            <label>
              Duration for {task.title}
              <select
                aria-label={"Duration for " + task.title}
                value={schedules[task.id].duration}
                onChange={(event) =>
                  set(task.id, "duration", Number(event.target.value))
                }
              >
                {calendarDurations.map((value) => (
                  <option key={value} value={value}>
                    {value} minutes
                  </option>
                ))}
              </select>
            </label>
            <label>
              Time zone for {task.title}
              <input
                value={schedules[task.id].timeZone}
                onChange={(event) =>
                  set(task.id, "timeZone", event.target.value)
                }
              />
            </label>
          </div>
          {ready && (
            <button
              className="text-button mt-3"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const fingerprint = JSON.stringify(schedules[task.id]);
                  const saved = !personal?.calendarMarks?.some(
                    (mark) =>
                      mark.workspaceId === workspaceId &&
                      mark.taskId === task.id &&
                      mark.fingerprint === fingerprint,
                  );
                  const result = await api("/calendar/mark", {
                    method: "POST",
                    body: JSON.stringify({
                      taskId: task.id,
                      fingerprint,
                      saved,
                    }),
                  });
                  onMarks(result.calendarMarks);
                } catch (error) {
                  setError(error.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {personal?.calendarMarks?.some(
                (mark) =>
                  mark.workspaceId === workspaceId &&
                  mark.taskId === task.id &&
                  mark.fingerprint === JSON.stringify(schedules[task.id]),
              )
                ? "Marked added · remove mark"
                : "I saved this event in Google Calendar"}
            </button>
          )}
          {ready && (
            <a
              className="button mt-3"
              href={calendarEventUrl(
                task,
                schedules[task.id],
                window.location.origin,
              )}
              onClick={(event) => {
                if (
                  personal?.calendarMarks?.some(
                    (mark) =>
                      mark.workspaceId === workspaceId &&
                      mark.taskId === task.id &&
                      mark.fingerprint === JSON.stringify(schedules[task.id]),
                  ) &&
                  !window.confirm(
                    "You marked this event as added. Saving another draft can create a duplicate. Continue?",
                  )
                )
                  event.preventDefault();
              }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open event draft
            </a>
          )}
        </section>
      ))}
      <div className="modal-actions">
        <button
          className="button"
          onClick={() => {
            try {
              validate();
              setReady(true);
            } catch (error) {
              setError(error.message);
            }
          }}
        >
          Prepare calendar drafts
        </button>
        {!readOnly && (
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                validate();
                const result = await api("/tasks/schedules", {
                  method: "POST",
                  body: JSON.stringify({
                    tasks: tasks.map((task) => ({
                      id: task.id,
                      expectedUpdatedAt: task.updatedAt,
                      schedule: schedules[task.id],
                    })),
                  }),
                });
                await onSaved(result);
                setReady(true);
                setNotice(
                  "Schedules saved. Open each draft and save the event in Google Calendar.",
                );
              } catch (error) {
                setError(error.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Save size={16} />
            Save schedules
          </button>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-text" role="status">
          {notice}
        </p>
      )}
    </Modal>
  );
}
