import { useEffect, useId, useRef, useState } from "react";
import { boardSort, boardStatuses } from "../../shared/board.js";
import { waitingOn } from "../../shared/productivity.js";
import Priority from "./Priority.jsx";
import { formatDate, overdue } from "../lib.js";
export function GrabIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      {[7, 15].flatMap((x) =>
        [5, 11, 17].map((y) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" rx="1" />
        )),
      )}
    </svg>
  );
}
export default function TaskBoard({
  tasks,
  allTasks = tasks,
  projects = [],
  readOnly = false,
  selectedIds = [],
  onSelect,
  onOpen,
  onMove,
  practice = false,
}) {
  const [preview, setPreview] = useState(null),
    [moving, setMoving] = useState(false),
    [savingId, setSavingId] = useState(null),
    [message, setMessage] = useState("");
  const drag = useRef(null),
    board = useRef(null),
    raf = useRef(null),
    hint = useId();
  const column = (status) =>
    tasks.filter((t) => t.status === status).sort(boardSort);
  const targetAt = (status, index, task) => {
    const items = column(status).filter((t) => t.id !== task.id);
    const anchor = items[Math.max(0, Math.min(index, items.length))];
    return anchor
      ? {
          status,
          position: "before",
          anchorId: anchor.id,
          anchorUpdatedAt: anchor.updatedAt,
        }
      : { status, position: "end", anchorId: null, anchorUpdatedAt: null };
  };
  function stop() {
    cancelAnimationFrame(raf.current);
    raf.current = null;
    drag.current = null;
    setPreview(null);
  }
  useEffect(() => {
    const cancel = () => {
      if (drag.current) {
        stop();
        setMessage("Move cancelled.");
      }
    };
    window.addEventListener("blur", cancel);
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  useEffect(() => {
    if (!drag.current) return;
    const task = tasks.find((task) => task.id === drag.current.task.id);
    if (readOnly || !task || task.updatedAt !== drag.current.task.updatedAt) {
      stop();
      setMessage(
        "This task changed. Pick it up again to use the latest version.",
      );
    }
  }, [tasks, readOnly]);
  async function commit(task, target) {
    if (!target) return;
    setMoving(true);
    setSavingId(task.id);
    setMessage(`Saving ${task.title}…`);
    try {
      await onMove(task, target);
      setMessage(`${task.title} moved to ${target.status}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setMoving(false);
      setSavingId(null);
      requestAnimationFrame(() =>
        board.current
          ?.querySelector(
            `[data-board-task="${CSS.escape(task.id)}"] .board-grab`,
          )
          ?.focus({ preventScroll: true }),
      );
    }
  }
  function inspect() {
    const d = drag.current;
    if (!d || d.keyboard || !d.active) return;
    const hit = document.elementFromPoint(d.x, d.y),
      section = hit?.closest("[data-board-status]");
    let target = null;
    if (section && board.current?.contains(section)) {
      const status = section.dataset.boardStatus,
        card = hit.closest("[data-board-task]");
      if (card && card.dataset.boardTask !== d.task.id) {
        const anchor = tasks.find((t) => t.id === card.dataset.boardTask);
        if (anchor)
          target = {
            status,
            position:
              d.y <
              card.getBoundingClientRect().top +
                card.getBoundingClientRect().height / 2
                ? "before"
                : "after",
            anchorId: anchor.id,
            anchorUpdatedAt: anchor.updatedAt,
          };
      } else if (!card)
        target = {
          status,
          position: "end",
          anchorId: null,
          anchorUpdatedAt: null,
        };
    }
    d.target = target;
    setPreview({ task: d.task, target, x: d.x, y: d.y, keyboard: false });
  }
  function scrolling() {
    const d = drag.current;
    if (!d || !d.active || d.keyboard) return;
    const modal = board.current?.closest("dialog");
    if (modal) {
      const rect = modal.getBoundingClientRect();
      modal.scrollBy(
        0,
        d.y < rect.top + 60 ? -12 : d.y > rect.bottom - 60 ? 12 : 0,
      );
    } else window.scrollBy(0, d.y < 75 ? -12 : d.y > innerHeight - 75 ? 12 : 0);
    const bounds = board.current?.getBoundingClientRect();
    if (bounds)
      board.current.scrollBy(
        d.x < Math.max(bounds.left, 0) + 44
          ? -12
          : d.x > Math.min(bounds.right, innerWidth) - 44
            ? 12
            : 0,
        0,
      );
    inspect();
    raf.current = requestAnimationFrame(scrolling);
  }
  function pointerDown(event, task) {
    if (readOnly || moving || event.button !== 0 || !event.isPrimary) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      task,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
    };
  }
  function pointerMove(event) {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    d.x = event.clientX;
    d.y = event.clientY;
    if (!d.active && Math.hypot(d.x - d.originX, d.y - d.originY) >= 8) {
      d.active = true;
      setMessage(`Moving ${d.task.title}. Release over a column or card.`);
      scrolling();
    }
  }
  function pointerUp(event) {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    d.x = event.clientX;
    d.y = event.clientY;
    if (d.active) inspect();
    const { task, target, active } = d;
    stop();
    if (active) commit(task, target);
  }
  function keyboard(event, task) {
    if (readOnly || moving || event.altKey || event.ctrlKey || event.metaKey)
      return;
    const d = drag.current;
    if (d && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stop();
      setMessage("Move cancelled.");
      return;
    }
    if (!d && [" ", "Enter"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const index = column(task.status).findIndex((t) => t.id === task.id),
        target = targetAt(task.status, index, task);
      drag.current = {
        task,
        keyboard: true,
        status: task.status,
        index,
        target,
      };
      setPreview({ task, target, keyboard: true });
      setMessage(
        `Picked up ${task.title}. Arrow keys choose a position. Space drops; Escape cancels.`,
      );
      return;
    }
    if (!d?.keyboard || d.task.id !== task.id) return;
    if (
      ![
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        " ",
        "Enter",
        "Escape",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      stop();
      setMessage("Move cancelled.");
      return;
    }
    if ([" ", "Enter"].includes(event.key)) {
      const target = d.target;
      stop();
      commit(task, target);
      return;
    }
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      const index = Math.max(
        0,
        Math.min(
          boardStatuses.length - 1,
          boardStatuses.indexOf(d.status) +
            (event.key === "ArrowLeft" ? -1 : 1),
        ),
      );
      d.status = boardStatuses[index];
      d.index = column(d.status).filter((t) => t.id !== task.id).length;
    } else
      d.index = Math.max(
        0,
        Math.min(
          column(d.status).filter((t) => t.id !== task.id).length,
          d.index + (event.key === "ArrowUp" ? -1 : 1),
        ),
      );
    d.target = targetAt(d.status, d.index, task);
    board.current
      ?.querySelector(`[data-board-status="${d.status}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    setPreview({ task, target: d.target, keyboard: true });
    setMessage(`${d.status}, position ${d.index + 1}. Space drops.`);
  }
  return (
    <>
      <p id={hint} className="board-instructions">
        {readOnly ? (
          "Viewer access: open a card to read its details."
        ) : (
          <>
            Drag the grab handle to move or reorder a card.
            <span className="desktop-keyboard-controls">
              {" "}
              Keyboard: focus the handle, press Space, use arrow keys, then
              Space to drop. Escape cancels.
            </span>
          </>
        )}
      </p>
      <div
        ref={board}
        className={
          "kanban task-board" +
          (moving ? " is-saving" : "") +
          (preview ? " is-dragging" : "")
        }
        aria-label={practice ? "Practice task board" : "Task board"}
        aria-busy={moving}
      >
        {boardStatuses.map((status) => (
          <section
            key={status}
            className={
              "kanban-column" +
              (preview?.target?.status === status ? " is-drop-target" : "")
            }
            data-board-status={status}
            aria-label={status + " tasks"}
          >
            <h2>
              <span
                className={"status-dot status-" + status.replaceAll(" ", "-")}
              />
              {status}
              <span>{column(status).length}</span>
            </h2>
            {column(status).map((task) => (
              <article
                key={task.id}
                data-board-task={task.id}
                data-saving={savingId === task.id || undefined}
                className={
                  "task-card" +
                  (task.status === "Completed" ? " task-card-completed" : "") +
                  (preview?.task.id === task.id ? " is-picked-up" : "") +
                  (preview?.target?.anchorId === task.id
                    ? " drop-" + preview.target.position
                    : "")
                }
              >
                <div className="board-card-controls">
                  {savingId === task.id && (
                    <span className="board-saving-badge">Saving…</span>
                  )}
                  {!readOnly && onSelect && (
                    <label className="check-option">
                      <input
                        type="checkbox"
                        aria-label={"Select " + task.title}
                        checked={selectedIds.includes(task.id)}
                        onChange={() => onSelect(task.id)}
                      />
                      <span className="task-select-label">Select</span>
                    </label>
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      className="board-grab"
                      aria-label={"Move " + task.title}
                      aria-describedby={hint}
                      aria-pressed={preview?.task.id === task.id}
                      disabled={moving}
                      onPointerDown={(event) => pointerDown(event, task)}
                      onPointerMove={pointerMove}
                      onPointerUp={pointerUp}
                      onLostPointerCapture={() => {
                        if (drag.current && !drag.current.keyboard) {
                          stop();
                          setMessage("Move cancelled.");
                        }
                      }}
                      onPointerCancel={() => {
                        stop();
                        setMessage("Move cancelled.");
                      }}
                      onKeyDown={(event) => keyboard(event, task)}
                    >
                      <GrabIcon />
                    </button>
                  )}
                </div>
                {task.status !== "Completed" &&
                  waitingOn(task, allTasks).length > 0 && (
                    <span className="badge dependency-badge">
                      Waiting on {waitingOn(task, allTasks).length} task(s)
                    </span>
                  )}
                {task.status !== "Completed" && (
                  <Priority value={task.priority} />
                )}
                <button
                  className="card-title"
                  onClick={() => onOpen?.(task.id)}
                >
                  {task.title}
                </button>
                {task.status !== "Completed" && !practice && (
                  <>
                    <p className="hint">
                      {projects.find((p) => p.id === task.projectId)?.name ||
                        "No project"}
                    </p>
                    <div className="task-card-foot">
                      <span>{task.owner}</span>
                      <span className={overdue(task) ? "late" : ""}>
                        {formatDate(task.dueDate)}
                        <small className="saved-schedule">
                          {task.schedule
                            ? `Scheduled ${task.schedule.date} · ${task.schedule.time}`
                            : "Not scheduled"}
                        </small>
                      </span>
                    </div>
                  </>
                )}
                <select
                  aria-label={"Status for " + task.title}
                  disabled={readOnly || moving}
                  value={task.status}
                  onChange={(event) =>
                    commit(task, {
                      status: event.target.value,
                      position: "end",
                      anchorId: null,
                      anchorUpdatedAt: null,
                    })
                  }
                >
                  {boardStatuses.map((s) => (
                    <option
                      key={s}
                      disabled={
                        s === "Completed" &&
                        waitingOn(task, allTasks).length > 0
                      }
                    >
                      {s}
                    </option>
                  ))}
                </select>
              </article>
            ))}
            {!column(status).length && (
              <p className="board-empty">
                {readOnly ? "No tasks here" : "Drop a task here"}
              </p>
            )}
            {preview?.target?.status === status &&
              preview.target.position === "end" && (
                <div className="board-drop-space" aria-hidden="true">
                  Drop here
                </div>
              )}
          </section>
        ))}
      </div>
      {preview && !preview.keyboard && (
        <div
          className="board-drag-preview"
          style={{
            left: Math.max(8, Math.min(preview.x + 12, innerWidth - 260)),
            top: Math.max(8, Math.min(preview.y + 12, innerHeight - 128)),
          }}
          aria-hidden="true"
        >
          {preview.task.title}
          <small>
            {preview.target
              ? `Move to ${preview.target.status}`
              : "Choose a column"}
          </small>
        </div>
      )}
      <p className="board-feedback" role="status" aria-live="polite">
        {moving ? "Saving board…" : message}
      </p>
    </>
  );
}
