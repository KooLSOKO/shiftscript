import { useState } from "react";
import Modal from "./Modal.jsx";
import TaskBoard from "./TaskBoard.jsx";
import { shortcuts } from "../features/shortcuts.js";
import { placeOnBoard } from "../../shared/board.js";
export function KeyboardIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="M5 9h2m2 0h2m2 0h2m2 0h2M5 12h2m2 0h2m2 0h2m2 0h2M7 16h10" />
    </svg>
  );
}
export function ShortcutTable({ readOnly = false }) {
  return (
    <>
      <div className="shortcut-table-wrap">
        <table className="shortcut-table">
          <caption>Keyboard shortcuts for Mac and Windows</caption>
          <thead>
            <tr>
              <th scope="col">Action</th>
              <th scope="col">Mac</th>
              <th scope="col">Windows</th>
            </tr>
          </thead>
          <tbody>
            {shortcuts
              .filter((s) => !readOnly || !s.writes)
              .map((s) => (
                <tr key={s.action}>
                  <th scope="row">{s.label}</th>
                  <td>
                    <kbd>{s.mac}</kbd>
                  </td>
                  <td>
                    <kbd>{s.windows}</kbd>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Single-letter shortcuts work outside text fields and dialogs. Undo
        applies only when an Undo action is available. In a dialog, use Tab /
        Shift Tab to move focus and Escape to close.
      </p>
    </>
  );
}
function ShortcutPreference({ enabled, busy, error, onChange }) {
  return (
    <div className="shortcut-preference">
      <label className="shortcut-preference-label">
        <input type="checkbox" checked={enabled} disabled={busy} onChange={(event) => onChange(event.target.checked)} />
        <span><strong>Enable single-key shortcuts</strong><span>N, T, B, M, D, A, R and ?. Saved to your account.</span></span>
      </label>
      <p className="hint">{busy ? "Saving preference…" : enabled ? "Single-key shortcuts are on." : "Single-key shortcuts are off."} Command/Ctrl K, Z and /, plus board keyboard controls, remain available.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
const demo = [
  {
    id: "practice-review",
    title: "Review the portfolio",
    status: "To Do",
    priority: "High",
    boardRank: 0,
  },
  {
    id: "practice-notes",
    title: "Share meeting notes",
    status: "To Do",
    priority: "Med",
    boardRank: 1024,
  },
].map((t) => ({
  ...t,
  updatedAt: "practice",
  dependencyIds: [],
  owner: "You",
}));
const titles = [
  "Welcome to your workspace",
  "A meeting becomes a plan",
  "Make the board your own",
  "A few keys. A faster day.",
];
export default function ShortcutsTour({
  mode = "tour",
  readOnly = false,
  busy = false,
  error = "",
  onClose,
  onFinish,
  onRestart,
  onDismiss,
  singleKeys = true,
  shortcutBusy = false,
  shortcutError = "",
  onShortcutChange,
}) {
  const [step, setStep] = useState(0),
    [tasks, setTasks] = useState(() => structuredClone(demo));
  return (
    <Modal
      title={mode === "help" ? "Shortcuts and controls" : titles[step]}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="workspace-tour">
        {mode === "help" ? (
          <>
            <ShortcutPreference enabled={singleKeys} busy={shortcutBusy} error={shortcutError} onChange={onShortcutChange} />
            <ShortcutTable readOnly={readOnly} />
            <p className="tour-board-help">
              Board controls: drag the grab handle, or focus it and press Space.
              Left / Right selects a column; Up / Down selects a position; Space
              / Enter drops; Escape cancels. On touch screens, drag the handle
              or choose the Status menu.
            </p>
            <button className="button primary" onClick={onRestart}>
              Replay workspace tutorial
            </button>
          </>
        ) : (
          <>
            <p className="eyebrow">GET TO KNOW SHIFTSCRIPT · {step + 1} OF 4</p>
            <div
              className="tour-progress"
              aria-label={`Tutorial step ${step + 1} of 4`}
            >
              {titles.map((title, i) => (
                <span key={title} className={i <= step ? "active" : ""} />
              ))}
            </div>
            {step === 0 && (
              <div className="tour-intro">
                <img src="/art/shifty/ready.png" alt="" />
                <div>
                  <h3>Good meetings go somewhere.</h3>
                  <p>
                    Capture the conversation, review what needs doing, and keep
                    responsibilities clear. This short tour shows you how to get
                    around.
                  </p>
                  <p>
                    Use the sidebar on desktop, or the menu and bottom bar on
                    mobile.
                  </p>
                  <p>
                    Your tutorial progress is saved to your account. You can
                    replay it from the keyboard button or your profile.
                  </p>
                </div>
              </div>
            )}
            {step === 1 && (
              <>
                <p>
                  Start with a transcript, voice recording, a saved note or an
                  available Google Meet source.
                </p>
                <ol className="tour-meeting-steps">
                  <li>
                    <strong>Capture</strong>
                    <span>
                      Choose New meeting. Give it a title, then add your source.
                    </span>
                  </li>
                  <li>
                    <strong>Review</strong>
                    <span>
                      Read the summary and decisions. Check each proposed owner
                      and deadline before approving tasks.
                    </span>
                  </li>
                  <li>
                    <strong>Track</strong>
                    <span>
                      Approved tasks appear in the tracker and board, linked to
                      their original meeting.
                    </span>
                  </li>
                </ol>
                {readOnly && (
                  <p className="read-only">
                    You have Viewer access: you can read meetings and task
                    details. A workspace Owner or Member approves and updates
                    work.
                  </p>
                )}
              </>
            )}
            {step === 2 && (
              <>
                <p>
                  These are <strong>practice cards</strong>. Moving them does
                  not change your workspace.
                </p>
                <div className="tour-practice-board">
                  <TaskBoard
                    tasks={tasks}
                    practice
                    onMove={async (task, target) => {
                      setTasks((previous) => {
                        const next = structuredClone(previous),
                          moving = next.find((t) => t.id === task.id);
                        const { column } = placeOnBoard(next, moving, target);
                        moving.status = target.status;
                        column.forEach((t, i) => (t.boardRank = i * 1024));
                        return next;
                      });
                    }}
                  />
                </div>
                <p className="hint">
                  Mouse or touch: drag the grab handle. Keyboard: Space to pick
                  up, arrows to move, Space to drop. The Status menu is another
                  way to change columns. Your real board saves positions for
                  your team.
                </p>
              </>
            )}
            {step === 3 && <><ShortcutPreference enabled={singleKeys} busy={shortcutBusy} error={shortcutError} onChange={onShortcutChange} /><ShortcutTable readOnly={readOnly} /></>}
            {error && (
              <div>
                <p className="form-error" role="alert">
                  {error}
                </p>
                <button className="button" onClick={onDismiss}>
                  Continue for now
                </button>
              </div>
            )}
            <div className="tour-navigation">
              <button className="text-button" disabled={busy} onClick={onClose}>
                Skip tutorial
              </button>
              <div>
                {step > 0 && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => setStep(step - 1)}
                  >
                    Back
                  </button>
                )}
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => (step === 3 ? onFinish() : setStep(step + 1))}
                >
                  {busy ? "Saving…" : step === 3 ? "Let's get started" : "Next"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
