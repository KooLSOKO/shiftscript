import { useEffect, useRef, useState } from "react";
import { FileText, Mic, Video, NotebookPen } from "./Icons.jsx";

const modes = [
  {
    id: "text",
    direction: "up",
    label: "Text",
    detail: "Paste or upload",
    Icon: FileText,
  },
  {
    id: "voice",
    direction: "right",
    label: "Voice",
    detail: "Record or upload",
    Icon: Mic,
  },
  {
    id: "google",
    direction: "down",
    label: "Recent Google Meet",
    detail: "Import a source",
    Icon: Video,
  },
  {
    id: "previous",
    direction: "left",
    label: "Previous meeting",
    detail: "Reuse a transcript",
    Icon: NotebookPen,
  },
];
const arrowModes = {
  ArrowUp: "text",
  ArrowRight: "voice",
  ArrowDown: "google",
  ArrowLeft: "previous",
};
const directionFrom = (dx, dy) =>
  Math.abs(dx) > Math.abs(dy)
    ? dx > 0
      ? "voice"
      : "previous"
    : dy > 0
      ? "google"
      : "text";

export default function MeetingSourcePicker({ value, onChange, disabled }) {
  const buttons = useRef({});
  const gesture = useRef(null);
  const [preview, setPreview] = useState(null);
  const chosen = modes.find((m) => m.id === (preview || value)) || modes[0];
  const SelectedIcon = chosen.Icon;
  useEffect(() => {
    if (disabled) {
      gesture.current = null;
      setPreview(null);
    }
  }, [disabled]);
  function select(id, focus = false) {
    if (disabled) return;
    onChange(id);
    if (focus) buttons.current[id]?.focus();
  }
  function offset(e) {
    const start = gesture.current;
    if (!start || e.pointerId !== start.pointerId) return null;
    const dx = e.clientX - start.x,
      dy = e.clientY - start.y;
    return Math.hypot(dx, dy) >= 18 ? directionFrom(dx, dy) : null;
  }
  return (
    <section
      className="meeting-source-picker"
      aria-label="Choose how to add your meeting"
    >
      <div className="source-picker-heading">
        <h3>Start with your conversation</h3>
        <p id="source-picker-help">
          Tap a mode, drag the dial or use arrow keys.
        </p>
      </div>
      <div
        className="source-direction-grid"
        role="radiogroup"
        aria-label="Meeting source"
        aria-describedby="source-picker-help"
        onKeyDown={(e) => {
          const id = arrowModes[e.key];
          if (!id) return;
          e.preventDefault();
          select(id, true);
        }}
      >
        {modes.map(({ id, direction, label, detail, Icon }) => (
          <button
            type="button"
            role="radio"
            aria-label={label}
            aria-checked={value === id}
            tabIndex={value === id ? 0 : -1}
            disabled={disabled}
            key={id}
            ref={(el) => {
              buttons.current[id] = el;
            }}
            className={"source-direction source-direction-" + direction}
            onClick={() => select(id)}
          >
            <Icon size={22} />
            <strong>{label}</strong>
            <small>{detail}</small>
          </button>
        ))}
        {/* Dial inspired by Uiverse.io / GreyD097. Pointer capture is scoped to
            the dial, so dragging never covers the rest of the form. */}
        <div
          className="source-stick"
          aria-hidden="true"
          data-direction={chosen.direction}
          data-disabled={disabled || undefined}
          onPointerDown={(e) => {
            if (disabled || (e.pointerType === "mouse" && e.button !== 0))
              return;
            gesture.current = {
              x: e.clientX,
              y: e.clientY,
              pointerId: e.pointerId,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!disabled && gesture.current) setPreview(offset(e));
          }}
          onPointerUp={(e) => {
            const id = offset(e);
            gesture.current = null;
            setPreview(null);
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
            if (id) select(id, true);
          }}
          onPointerCancel={() => {
            gesture.current = null;
            setPreview(null);
          }}
          onLostPointerCapture={() => {
            gesture.current = null;
            setPreview(null);
          }}
        >
          <div className="source-stick-around">
            <div className="source-stick-handle">
              <div className="source-stick-knob">
                <div className="source-stick-inside">
                  {["up", "right", "down", "left"].map((d) => (
                    <span key={d} className={"source-stick-dot dot-" + d} />
                  ))}
                  <SelectedIcon size={27} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
