import { useEffect, useRef, useState } from "react";
import { api, types } from "../lib.js";
import { FileText, Plus, Trash, CheckCircle2, RefreshCw } from "./Icons.jsx";
import ProcessingLoader from "./ProcessingLoader.jsx";
import {
  batchCandidates,
  processMeetBatch,
  sourceLabel,
  MAX_MEET_BATCH,
} from "../../shared/meet-batch.js";

const states = {
  ready: "Ready for review",
  reading: "Refreshing source…",
  processing: "Processing…",
  done: "Processed",
  failed: "Needs another try",
  changed: "Review updated source",
};
export default function MeetBatch({
  items,
  busy,
  setItems,
  activeId,
  setActiveId,
  projects,
  workspace,
  readOnly,
  config,
  onBusyChange,
  onComplete,
  onOpen,
  onChooseAnother,
  reviewRef,
}) {
  const [running, setRunning] = useState(false),
    [error, setError] = useState(""),
    [paused, setPaused] = useState(false),
    [stopping, setStopping] = useState(false);
  const alive = useRef(true),
    lock = useRef(false),
    stop = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop.current = true;
    };
  }, []);
  const update = (id, patch) => {
    if (alive.current)
      setItems((old) =>
        old.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
  };
  const ready = items.filter((item) =>
      ["ready", "failed"].includes(item.status),
    ),
    completed = items.filter((item) => item.status === "done").length;
  async function process(e) {
    e.preventDefault();
    if (lock.current || busy || readOnly || config.provider !== "gemini")
      return;
    try {
      batchCandidates(items);
    } catch (e) {
      setError(e.message);
      if (e.itemId) {
        setActiveId(e.itemId);
        requestAnimationFrame(() =>
          reviewRef.current?.querySelector(".is-expanded input")?.focus(),
        );
      }
      return;
    }
    if (!ready.length) return;
    lock.current = true;
    stop.current = false;
    setRunning(true);
    setStopping(false);
    setPaused(false);
    setError("");
    onBusyChange(true);
    try {
      const outcome = await processMeetBatch({
        items,
        request: (path, options) =>
          api(path, { ...options, workspace: workspace?.id }),
        onUpdate: update,
        isActive: () => alive.current,
        shouldStop: () => stop.current,
      });
      if (alive.current) {
        setPaused(outcome.paused);
        if (outcome.results.length) await onComplete?.(outcome.results);
      }
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      lock.current = false;
      if (alive.current) {
        setRunning(false);
        setStopping(false);
        onBusyChange(false);
      }
    }
  }
  const edit = (item, key, value) =>
    update(item.id, {
      form: { ...item.form, [key]: value },
      status: "ready",
      error: "",
    });
  return (
    <section
      ref={reviewRef}
      className="panel meet-batch"
      aria-label="Meeting batch"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">SEPARATE MEETINGS. ONE QUEUE.</p>
          <h2 tabIndex={-1}>Review your batch</h2>
        </div>
        <span className="badge">
          {items.length}/{MAX_MEET_BATCH} selected
        </span>
      </div>
      <p className="summary">
        Each source gets its own summary and proposed tasks. Review the details
        below, then process up to three together.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {paused && (
        <p className="meet-batch-notice" role="status">
          Batch paused. Completed meetings are saved. Process remaining sources
          when you are ready.
        </p>
      )}
      {!items.length ? (
        <div className="meet-batch-empty">
          <FileText size={30} />
          <strong>Your next meetings start here.</strong>
          <p>
            Choose a recent meeting’s notes or transcript, or paste a Google
            Docs link.
          </p>
          <button
            type="button"
            className="button"
            disabled={busy || readOnly}
            onClick={onChooseAnother}
          >
            <Plus size={18} />
            Choose a source
          </button>
        </div>
      ) : (
        <form onSubmit={process}>
          <ol className="meet-batch-list">
            {items.map((item, index) => {
              const expanded = activeId === item.id,
                done = item.status === "done",
                changed = item.status === "changed",
                inFlight = ["reading", "processing"].includes(item.status);
              return (
                <li
                  key={item.id}
                  className={
                    "meet-batch-item state-" +
                    item.status +
                    (expanded ? " is-expanded" : "")
                  }
                >
                  <div className="meet-batch-item-heading">
                    <span className="meet-batch-number">
                      {done ? <CheckCircle2 size={20} /> : index + 1}
                    </span>
                    <button
                      type="button"
                      className="meet-batch-expand"
                      aria-expanded={expanded}
                      onClick={() => setActiveId(expanded ? null : item.id)}
                    >
                      <strong>{item.form.title}</strong>
                      <small>
                        {sourceLabel(item.preview.source)} · {item.form.date}
                      </small>
                    </button>
                    <span
                      className="meet-batch-state"
                      role={inFlight ? "status" : undefined}
                    >
                      {states[item.status]}
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={"Remove source: " + item.form.title}
                      title="Remove from this batch"
                      disabled={busy}
                      onClick={() =>
                        setItems((old) => old.filter((v) => v.id !== item.id))
                      }
                    >
                      <Trash size={18} />
                    </button>
                  </div>
                  {item.error && (
                    <p className="form-error" role="alert">
                      {item.error}
                    </p>
                  )}
                  {expanded && (
                    <div className="meet-batch-details">
                      <div className="field-grid">
                        <label>
                          Meeting title
                          <input
                            aria-label={"Meeting title " + (index + 1)}
                            minLength={3}
                            maxLength={120}
                            value={item.form.title}
                            onChange={(e) =>
                              edit(item, "title", e.target.value)
                            }
                            disabled={busy || done || changed}
                          />
                        </label>
                        <label>
                          Meeting date
                          <input
                            aria-label={"Meeting date " + (index + 1)}
                            type="date"
                            value={item.form.date}
                            onChange={(e) => edit(item, "date", e.target.value)}
                            disabled={busy || done || changed}
                          />
                        </label>
                        <label>
                          Meeting type
                          <select
                            aria-label={"Meeting type " + (index + 1)}
                            value={item.form.type}
                            onChange={(e) => edit(item, "type", e.target.value)}
                            disabled={busy || done || changed}
                          >
                            {types.map((type) => (
                              <option key={type}>{type}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Project
                          <select
                            aria-label={"Project " + (index + 1)}
                            value={item.form.projectId}
                            onChange={(e) =>
                              edit(item, "projectId", e.target.value)
                            }
                            disabled={busy || done || changed}
                          >
                            <option value="">No project</option>
                            {projects.map((p) => (
                              <option value={p.id} key={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <details
                        className="transcript import-text"
                        open={changed}
                      >
                        <summary>
                          {changed ? "Updated source" : "Source text"} ·{" "}
                          {(
                            item.changedPreview || item.preview
                          ).transcript.length.toLocaleString()}{" "}
                          characters
                        </summary>
                        <pre>
                          {(item.changedPreview || item.preview).transcript}
                        </pre>
                      </details>
                      {changed && (
                        <button
                          type="button"
                          className="button"
                          disabled={busy}
                          onClick={() =>
                            update(item.id, {
                              preview: item.changedPreview,
                              changedPreview: null,
                              status: "ready",
                              error: "",
                            })
                          }
                        >
                          Use this reviewed source
                        </button>
                      )}
                    </div>
                  )}
                  {inFlight && (
                    <ProcessingLoader
                      label={
                        item.status === "reading"
                          ? "Checking the current Google source…"
                          : "Creating this meeting’s summary and tasks…"
                      }
                    />
                  )}
                  {done && (
                    <div className="meet-batch-result">
                      <p>
                        <strong>
                          {item.result.cached
                            ? "Already saved"
                            : "Ready to review"}
                        </strong>{" "}
                        ·{" "}
                        {item.result.meeting.proposals?.filter(
                          (p) => p.reviewStatus === "pending",
                        ).length || 0}{" "}
                        proposed tasks awaiting review
                      </p>
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() => onOpen?.(item.result.meeting)}
                      >
                        Open summary &amp; tasks
                      </button>
                    </div>
                  )}
                  {changed && !expanded && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setActiveId(item.id)}
                    >
                      Review updated text
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="meet-batch-progress" role="status" aria-live="polite">
            <span>
              {completed} of {items.length} processed
            </span>
            <div
              role="progressbar"
              aria-label="Meetings processed"
              aria-valuemin={0}
              aria-valuemax={items.length}
              aria-valuenow={completed}
            >
              <span style={{ width: `${(completed / items.length) * 100}%` }} />
            </div>
          </div>
          <p className="hint">
            Processing shares each source with{" "}
            {workspace?.name || "this workspace"}. Tasks stay proposed until
            approved. Keep this tab open; each completed meeting is saved
            immediately.
          </p>
          {config.provider !== "gemini" && (
            <p className="form-error">
              Google imports need live Gemini analysis.
            </p>
          )}
          <div className="meet-batch-actions">
            <button
              type="button"
              className="button"
              disabled={
                busy ||
                (items.length >= MAX_MEET_BATCH &&
                  completed !== items.length) ||
                readOnly
              }
              onClick={() => {
                if (completed === items.length) {
                  setItems([]);
                  setActiveId(null);
                  setPaused(false);
                  setError("");
                }
                onChooseAnother();
              }}
            >
              <Plus size={18} />
              {completed === items.length
                ? "Start another batch"
                : "Add another source"}
            </button>
            {running ? (
              <button
                type="button"
                className="button"
                disabled={stopping}
                onClick={() => {
                  stop.current = true;
                  setStopping(true);
                }}
              >
                {stopping
                  ? "Stopping after this meeting…"
                  : "Stop after current meeting"}
              </button>
            ) : (
              <button
                type="submit"
                className="button primary"
                disabled={
                  busy ||
                  !ready.length ||
                  readOnly ||
                  config.provider !== "gemini"
                }
              >
                {completed === items.length ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <RefreshCw size={18} />
                )}
                {completed === items.length
                  ? "All meetings processed"
                  : !ready.length
                    ? "Review changed sources"
                    : completed || items.some((i) => i.status === "failed")
                      ? `Process ${ready.length} remaining`
                      : `Process ${ready.length} meeting${ready.length === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
