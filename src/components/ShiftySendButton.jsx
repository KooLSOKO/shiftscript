import { Send } from "./Icons.jsx";

export default function ShiftySendButton({ busy, disabled }) {
  return (
    <button
      type="submit"
      className="button primary shifty-send"
      disabled={disabled}
      aria-label="Send assistant question"
      aria-busy={busy}
      data-loading={busy || undefined}
    >
      {busy ? (
        <span className="shifty-orbit" aria-hidden="true">
          <span className="shifty-orbit-ring" />
          <span className="shifty-orbit-ring shifty-orbit-ring-inner" />
          <span className="shifty-orbit-core" />
        </span>
      ) : (
        <Send size={23} aria-hidden="true" />
      )}
      <span className="shifty-send-label" aria-hidden="true">
        {busy ? "Thinking…" : "Ask"}
      </span>
    </button>
  );
}
