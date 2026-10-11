import { useEffect, useRef, useState } from "react";
import { api, statuses } from "../lib.js";
import {
  Compass,
  CalendarDays,
  CheckCircle2,
  RefreshCw,
  Send,
  Trash,
  FileText,
  ListTodo,
  Mail,
} from "./Icons.jsx";
import { calendarDurations } from "../../shared/scheduling.js";
import ProcessingLoader from "./ProcessingLoader.jsx";
import ShiftyAvatar from "./ShiftyAvatar.jsx";

function Proposal({
  action,
  connected,
  emailReady,
  onApprove,
  onDismiss,
  onEmail,
  busy,
}) {
  const [review, setReview] = useState(false),
    [date, setDate] = useState(action.schedule?.date || action.dueDate || ""),
    [time, setTime] = useState(action.schedule?.time || ""),
    [duration, setDuration] = useState(action.schedule?.duration || 60),
    [zone, setZone] = useState(
      action.schedule?.timeZone || "Africa/Johannesburg",
    ),
    [status, setStatus] = useState(action.status || "To Do");
  const scheduled = action.kind === "schedule_task",
    email = action.kind === "email_recap";
  if (action.state === "dismissed")
    return (
      <p className="assistant-action-ended">
        Proposal dismissed · {action.title}
      </p>
    );
  return (
    <section
      className="assistant-proposal"
      aria-label={"Proposed action: " + action.title}
    >
      <div className="assistant-proposal-heading">
        {scheduled ? (
          <CalendarDays size={21} />
        ) : email ? (
          <Mail size={21} />
        ) : (
          <ListTodo size={21} />
        )}
        <span>
          {scheduled
            ? "Calendar block"
            : email
              ? "Meeting recap"
              : "Task change"}
        </span>
        <span className="badge">
          {action.state === "done"
            ? "Done"
            : action.state === "uncertain"
              ? "Check result"
              : "For review"}
        </span>
      </div>
      <h4>{action.title}</h4>
      {action.state === "done" ? (
        <div role="status">
          <p>
            {scheduled
              ? "Added to your ShiftScript task calendar."
              : email
                ? "Recap accepted by the email server."
                : "Task updated."}
          </p>
          {action.result?.href && (
            <a
              className="button"
              href={action.result.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Google Calendar
            </a>
          )}
        </div>
      ) : action.state === "uncertain" || action.state === "executing" ? (
        <p className="hint">
          {action.error ||
            "The result is pending. Refresh this conversation and check Google Calendar before making another proposal."}
        </p>
      ) : (
        <>
          {action.error && <p className="form-error">{action.error}</p>}
          {email ? (
            <>
              <p className="hint">
                Choose recipients and review the current meeting recap. Pending
                tasks are excluded.
              </p>
              <button
                className="button"
                disabled={busy || !emailReady}
                onClick={() => onEmail(action)}
              >
                <Mail size={18} />
                Review email recap
              </button>
              {!emailReady && (
                <p className="hint">
                  Earny email needs its existing Zoho configuration.
                </p>
              )}
            </>
          ) : !review ? (
            <>
              <p className="hint">
                {scheduled
                  ? "Choose the date and time, then confirm. Your task deadline stays unchanged."
                  : "Review the proposed status and deadline before updating the task."}
              </p>
              <button
                className="button"
                disabled={busy}
                onClick={() => setReview(true)}
              >
                {scheduled ? "Review calendar block" : "Review task change"}
              </button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onApprove(
                  action,
                  scheduled
                    ? {
                        schedule: {
                          date,
                          time,
                          duration: Number(duration),
                          timeZone: zone,
                        },
                      }
                    : { status, dueDate: date || null },
                );
              }}
            >
              <div className="assistant-review-fields">
                <label>
                  {scheduled ? "Block date" : "Task deadline"}
                  <input
                    type="date"
                    required={scheduled}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    disabled={busy}
                  />
                </label>
                {scheduled ? (
                  <>
                    <label>
                      Start time
                      <input
                        type="time"
                        required
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        disabled={busy}
                      />
                    </label>
                    <label>
                      Duration
                      <select
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        disabled={busy}
                      >
                        {calendarDurations.map((d) => (
                          <option key={d} value={d}>
                            {d} minutes
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Time zone
                      <input
                        required
                        value={zone}
                        onChange={(e) => setZone(e.target.value)}
                        disabled={busy}
                      />
                    </label>
                  </>
                ) : (
                  <label>
                    Task status
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      disabled={busy}
                    >
                      {statuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <p className="hint">
                {scheduled
                  ? "Availability is checked again against selected calendars when you confirm. No guests are invited."
                  : "An empty deadline removes the task's due date. Existing dependency rules still apply."}
              </p>
              {scheduled && !connected && (
                <p className="hint">
                  Connect Google Calendar before confirming this block.
                </p>
              )}
              <button
                className="button primary"
                disabled={busy || (scheduled && !connected)}
              >
                {busy
                  ? "Confirming…"
                  : scheduled
                    ? "Confirm calendar block"
                    : "Confirm task change"}
              </button>
            </form>
          )}
          <button
            className="text-button assistant-dismiss"
            disabled={busy}
            onClick={() => onDismiss(action)}
          >
            Dismiss proposal
          </button>
        </>
      )}
    </section>
  );
}
export default function Assistant({
  actor,
  workspaceId,
  config,
  readOnly,
  onTask,
  onMeeting,
  onEmail,
  onChange,
  revision = 0,
  timeZone = "Africa/Johannesburg",
}) {
  const [messages, setMessages] = useState([]),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [operation, setOperation] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [calendarError, setCalendarError] = useState(""),
    [connection, setConnection] = useState(null),
    [calendars, setCalendars] = useState([]),
    [selected, setSelected] = useState([]),
    [zone, setZone] = useState(timeZone),
    [clearConfirm, setClearConfirm] = useState(false);
  const generation = useRef(0),
    mounted = useRef(true),
    end = useRef(null),
    inputRef = useRef(null),
    sendLock = useRef(false);
  useEffect(() => {
    // Small local assets are warmed up so switching expression never flashes.
    ["ready", "thinking", "replying", "error"].forEach((state) => {
      const image = new Image();
      image.src = "/art/shifty/" + state + ".png";
    });
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.allSettled([
      api("/assistant/history"),
      api("/calendar/status"),
    ]).then(async ([history, status]) => {
      if (!active) return;
      if (history.status === "fulfilled") setMessages(history.value.messages);
      else setError(history.reason.message);
      if (status.status === "fulfilled") {
        setConnection(status.value);
        setSelected(status.value.selectedIds || ["primary"]);
        if (status.value.connected) {
          try {
            const data = await api("/calendar/calendars");
            if (active) {
              setCalendars(data.calendars);
              setSelected((old) =>
                old.map((id) =>
                  id === "primary"
                    ? data.calendars.find((c) => c.primary)?.id || id
                    : id,
                ),
              );
            }
          } catch (e) {
            if (active) setCalendarError(e.message);
          }
        }
      } else setCalendarError(status.reason.message);
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [workspaceId, actor.uid, revision]);
  useEffect(() => {
    if (messages.length || busy)
      end.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [messages.length, busy]);
  async function run(kind, fn) {
    if (busy || operation) return;
    const ticket = ++generation.current;
    setOperation(kind);
    setError("");
    try {
      await fn(ticket);
    } catch (e) {
      if (mounted.current && ticket === generation.current) setError(e.message);
    } finally {
      if (mounted.current && ticket === generation.current) setOperation("");
    }
  }
  const current = (ticket) => mounted.current && ticket === generation.current;
  async function ask(e) {
    e?.preventDefault();
    if (busy || operation || sendLock.current || question.trim().length < 2)
      return;
    const text = question.trim(),
      ticket = ++generation.current,
      id = crypto.randomUUID();
    sendLock.current = true;
    setBusy(true);
    setError("");
    setQuestion("");
    setMessages((old) => [
      ...old,
      {
        id,
        role: "user",
        text,
        at: new Date().toISOString(),
        optimistic: true,
      },
    ]);
    try {
      const result = await api("/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ question: text, requestId: id, timeZone: zone }),
      });
      if (current(ticket))
        setMessages((old) => [
          ...old.map((m) => (m.id === id ? { ...m, optimistic: false } : m)),
          result.message,
        ]);
    } catch (e) {
      if (current(ticket)) {
        setMessages((old) => old.filter((m) => m.id !== id));
        setQuestion(text);
        setError(e.message);
      }
    } finally {
      sendLock.current = false;
      if (current(ticket)) {
        setBusy(false);
        inputRef.current?.focus({ preventScroll: true });
      }
    }
  }
  const updateAction = (action) =>
    setMessages((old) =>
      old.map((m) => ({
        ...m,
        actions: m.actions?.map((a) => (a.id === action.id ? action : a)),
      })),
    );
  function approve(action, edits) {
    run("action:" + action.id, async (ticket) => {
      try {
        const result = await api(
          "/assistant/actions/" + action.id + "/approve",
          {
            method: "POST",
            body: JSON.stringify(edits),
          },
        );
        if (current(ticket)) {
          updateAction(result.action);
          await onChange();
        }
      } catch (e) {
        try {
          const result = await api("/assistant/history");
          if (current(ticket)) setMessages(result.messages);
        } catch {
          /* Retain the original action error. */
        }
        throw e;
      }
    });
  }
  function dismiss(action) {
    run("action:" + action.id, async (ticket) => {
      await api("/assistant/actions/" + action.id + "/dismiss", {
        method: "POST",
      });
      if (current(ticket)) updateAction({ ...action, state: "dismissed" });
    });
  }
  let displayZone = zone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
  } catch {
    displayZone = "UTC";
  }
  const disabled = busy || Boolean(operation) || loading;
  const shiftyState =
    busy || operation || loading
      ? "thinking"
      : error
        ? "error"
        : messages.at(-1)?.role === "assistant"
          ? "replying"
          : "ready";
  const shiftyStatus = busy
    ? "Checking your work…"
    : loading
      ? "Opening our conversation…"
      : operation
        ? "Working on that…"
        : error
          ? "Let’s try that again."
          : shiftyState === "replying"
            ? "Your next step is ready."
            : "Ready when you are.";
  return (
    <div className="assistant-layout">
      <section
        className="panel assistant-chat"
        aria-label="ShiftScript assistant"
      >
        <div className="assistant-chat-heading">
          <div className="assistant-brand">
            <ShiftyAvatar
              state={shiftyState}
              className="shifty-avatar-heading"
            />
            <div>
              <h2>Shifty</h2>
              <p>Your meeting &amp; planning assistant.</p>
              <p className="shifty-status" role="status">
                {shiftyStatus}
              </p>
            </div>
          </div>
          <button
            className="icon-button"
            aria-label="Clear assistant conversation"
            disabled={disabled || !messages.length}
            onClick={() => setClearConfirm(true)}
          >
            <Trash size={20} />
          </button>
        </div>
        {clearConfirm && (
          <div className="assistant-clear">
            <p>
              Clear your conversation in this workspace? Tasks, meetings and
              calendar blocks will stay.
            </p>
            <button
              className="button"
              disabled={disabled}
              onClick={() =>
                run("clear", async (ticket) => {
                  await api("/assistant/history", { method: "DELETE" });
                  if (current(ticket)) {
                    setMessages([]);
                    setClearConfirm(false);
                  }
                })
              }
            >
              Clear conversation
            </button>
            <button
              className="text-button"
              onClick={() => setClearConfirm(false)}
            >
              Keep it
            </button>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div
          className="assistant-messages"
          role="log"
          aria-label="Assistant conversation"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={busy}
        >
          {loading ? (
            <p className="hint">Opening your conversation…</p>
          ) : !messages.length ? (
            <div className="assistant-empty">
              <ShiftyAvatar
                state={error ? "error" : "ready"}
                className="shifty-avatar-welcome"
              />
              <h3>Hi {actor.name.split(" ")[0]}, I’m Shifty.</h3>
              <p>
                Let’s get your next step sorted. Ask me about a deadline, a
                meeting decision or time for your next task.
              </p>
              <div className="assistant-prompts">
                {[
                  "What tasks are assigned to me and when are they due?",
                  "Help me plan my next working day.",
                  "What decisions and follow-ups came from our latest meeting?",
                ].map((text) => (
                  <button
                    key={text}
                    className="button"
                    disabled={disabled}
                    onClick={() => {
                      setQuestion(text);
                      inputRef.current?.focus();
                    }}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <article
                className={
                  "assistant-message assistant-message-" + message.role
                }
                key={message.id}
              >
                <p className="assistant-speaker">
                  {message.role !== "user" && (
                    <ShiftyAvatar
                      state="replying"
                      className="shifty-avatar-message"
                    />
                  )}
                  {message.role === "user" ? "You" : "Shifty"}
                  {message.optimistic ? " · Sending…" : ""}
                </p>
                <div className="assistant-message-text">{message.text}</div>
                {!!message.sources?.length && (
                  <div
                    className="assistant-sources"
                    aria-label="Answer sources"
                  >
                    {message.sources.map((source) =>
                      source.type === "event" && source.href ? (
                        <a
                          className="assistant-source"
                          key={source.id}
                          href={source.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <CalendarDays size={17} />
                          {source.label}
                        </a>
                      ) : source.type !== "event" ? (
                        <button
                          className="assistant-source"
                          key={source.id}
                          onClick={() =>
                            source.type === "task"
                              ? onTask(source.targetId)
                              : onMeeting(source.targetId)
                          }
                        >
                          {source.type === "task" ? (
                            <ListTodo size={17} />
                          ) : (
                            <FileText size={17} />
                          )}{" "}
                          {source.label}
                        </button>
                      ) : (
                        <span className="assistant-source" key={source.id}>
                          <CalendarDays size={17} />
                          {source.label}
                        </span>
                      ),
                    )}
                  </div>
                )}
                {message.calendar?.warning && (
                  <p className="assistant-context-note">
                    {message.calendar.warning}
                  </p>
                )}
                {message.calendar?.checkedAt && (
                  <p className="assistant-context-note">
                    Calendar checked{" "}
                    {new Date(message.calendar.checkedAt).toLocaleTimeString(
                      "en-ZA",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: displayZone,
                      },
                    )}{" "}
                    · {message.calendar.selectedCount} calendar(s) · next 14
                    days
                    {message.calendar.truncated ? " · some events omitted" : ""}
                  </p>
                )}
                {message.actions?.map((action) => (
                  <Proposal
                    key={action.id}
                    action={action}
                    connected={connection?.connected}
                    emailReady={config.emailReady && !readOnly}
                    onApprove={approve}
                    onDismiss={dismiss}
                    onEmail={onEmail}
                    busy={busy || Boolean(operation) || loading}
                  />
                ))}
              </article>
            ))
          )}
          {busy && (
            <div className="assistant-thinking" role="status">
              <ShiftyAvatar
                state="thinking"
                className="shifty-avatar-working"
              />
              <ProcessingLoader />
              <p>
                Shifty is checking your tasks, notes and available calendar
                information…
              </p>
            </div>
          )}
          <div ref={end} />
        </div>
        <form className="assistant-compose" onSubmit={ask}>
          <label className="sr-only" htmlFor="assistant-question">
            Ask Shifty
          </label>
          <textarea
            ref={inputRef}
            id="assistant-question"
            rows="2"
            maxLength="2000"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={disabled || !config.assistantReady}
            placeholder="Ask Shifty about your tasks, meetings or calendar…"
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                e.currentTarget.form.requestSubmit();
              }
            }}
          />
          <button
            className="button primary"
            disabled={
              disabled || !config.assistantReady || question.trim().length < 2
            }
            aria-label="Send assistant question"
          >
            <Send size={20} />
            <span>Ask</span>
          </button>
          <p className="assistant-compose-note">
            Uses this workspace and your selected calendars. You review actions
            before anything changes.
            {config.provider === "sample"
              ? " Sample assistant: no AI requests."
              : " Replies use Gemini."}
          </p>
        </form>
      </section>
      <aside
        className="assistant-sidebar"
        aria-label="Personal calendar connection"
      >
        <section className="panel assistant-calendar">
          <div className="assistant-calendar-title">
            <CalendarDays size={25} />
            <h2>Your calendar</h2>
          </div>
          <p>
            Bring your upcoming events into the conversation. This connection
            and your chat belong to you.
          </p>
          {calendarError && (
            <p className="form-error" role="alert">
              {calendarError}
            </p>
          )}
          {!connection ? (
            <p className="hint">Checking Calendar…</p>
          ) : !connection.ready ? (
            <p className="hint">
              Your administrator needs to finish the existing Google integration
              setup.
            </p>
          ) : !connection.connected ? (
            <button
              className="button primary"
              disabled={disabled}
              onClick={() =>
                run("connect", async () => {
                  const result = await api("/calendar/connect", {
                    method: "POST",
                  });
                  window.location.assign(result.url);
                })
              }
            >
              <CalendarDays size={18} />
              Connect Google Calendar
            </button>
          ) : (
            <>
              <span className="badge">
                <CheckCircle2 size={16} />
                Connected
              </span>
              <details className="assistant-calendar-settings">
                <summary>Choose calendars · {selected.length} selected</summary>
                <p className="hint">
                  Select up to five calendars. ShiftScript task blocks are
                  included automatically.
                </p>
                {calendars.length ? (
                  calendars.map((calendar) => (
                    <label
                      className="assistant-calendar-option"
                      key={calendar.id}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(calendar.id)}
                        disabled={
                          disabled ||
                          (!selected.includes(calendar.id) &&
                            selected.length >= 5)
                        }
                        onChange={(e) =>
                          setSelected((old) =>
                            e.target.checked
                              ? [...old, calendar.id]
                              : old.filter((id) => id !== calendar.id),
                          )
                        }
                      />
                      <span>
                        {calendar.name}
                        {calendar.primary ? " · Primary" : ""}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="hint">Refresh to load your calendars.</p>
                )}
                <button
                  className="button"
                  disabled={disabled || !selected.length}
                  onClick={() =>
                    run("selection", async (ticket) => {
                      const result = await api("/calendar/selection", {
                        method: "PUT",
                        body: JSON.stringify({ ids: selected }),
                      });
                      if (current(ticket)) {
                        setConnection(result);
                        setCalendarError("");
                      }
                    })
                  }
                >
                  Save calendar selection
                </button>
              </details>
              <div className="assistant-calendar-actions">
                <button
                  className="button"
                  disabled={disabled}
                  onClick={() =>
                    run("refresh", async (ticket) => {
                      const result = await api("/calendar/calendars");
                      if (current(ticket)) {
                        setCalendars(result.calendars);
                        setCalendarError("");
                      }
                    })
                  }
                >
                  <RefreshCw size={18} />
                  Refresh calendars
                </button>
                <button
                  className="text-button"
                  disabled={disabled}
                  onClick={() =>
                    run("disconnect", async (ticket) => {
                      await api("/calendar/connection", { method: "DELETE" });
                      if (current(ticket)) {
                        setConnection({ ...connection, connected: false });
                        setCalendars([]);
                        setSelected([]);
                        setCalendarError("");
                      }
                    })
                  }
                >
                  Disconnect Calendar
                </button>
              </div>
            </>
          )}
          <label className="assistant-zone">
            Planning time zone
            <input
              value={zone}
              disabled={disabled}
              maxLength="80"
              onChange={(e) => setZone(e.target.value)}
            />
          </label>
          <p className="hint">
            Suggested working hours: weekdays, 08:00–17:00. Calendar answers
            cover the next 14 days.
          </p>
        </section>
        <section className="panel assistant-capabilities">
          <Compass size={29} />
          <h3>A clear plan. Your say.</h3>
          <ul>
            <li>Find task owners and deadlines.</li>
            <li>Revisit discussion points and decisions.</li>
            <li>Suggest time around your events.</li>
            <li>Review task changes and calendar blocks.</li>
            <li>Prepare meeting recaps from Earny.</li>
          </ul>
          <p className="hint">
            Task proposals still need approval. A calendar block reserves time;
            it does not finish the task.
          </p>
        </section>
      </aside>
    </div>
  );
}
