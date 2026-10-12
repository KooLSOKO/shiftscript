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
  const [drag, setDrag] = useState(null);
  const chosen = modes.find((m) => m.id === (preview || value)) || modes[0];
  const SelectedIcon = chosen.Icon;
  useEffect(() => {
    if (disabled) {
      gesture.current = null;
      setPreview(null);
      setDrag(null);
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
    if (Math.hypot(dx, dy) < start.threshold) return null;
    const next = directionFrom(dx, dy);
    // Keep a near-diagonal movement from repeatedly flipping between modes.
    if (start.candidate && start.candidate !== next) {
      const horizontal = ["voice", "previous"].includes(start.candidate);
      const nextHorizontal = ["voice", "previous"].includes(next);
      if (
        horizontal !== nextHorizontal &&
        Math.abs(Math.abs(dx) - Math.abs(dy)) < 8
      )
        return start.candidate;
    }
    start.candidate = next;
    return next;
  }
  return (
    <section
      className="meeting-source-picker"
      aria-label="Choose how to add your meeting"
    >
      <div className="source-picker-heading">
        <h3>Start with your conversation</h3>
        <p id="source-picker-help">
          <span className="desktop-source-help">Choose a source below.</span>
          <span className="mobile-source-help">
            Tap a mode, or drag the dial and release.
          </span>
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
            data-preview={preview === id || undefined}
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
          data-dragging={Boolean(drag) || undefined}
          data-disabled={disabled || undefined}
          style={
            drag
              ? {
                  "--drag-x": `${drag.x}px`,
                  "--drag-y": `${drag.y}px`,
                  "--drag-tilt-x": `${(-drag.y / 26) * 12}deg`,
                  "--drag-tilt-y": `${(drag.x / 26) * 12}deg`,
                }
              : undefined
          }
          onPointerDown={(e) => {
            if (
              disabled ||
              !e.isPrimary ||
              gesture.current ||
              (e.pointerType === "mouse" && e.button !== 0)
            )
              return;
            gesture.current = {
              x: e.clientX,
              y: e.clientY,
              pointerId: e.pointerId,
              threshold: e.pointerType === "mouse" ? 10 : 18,
              candidate: null,
              baseX: value === "voice" ? 17 : value === "previous" ? -17 : 0,
              baseY: value === "google" ? 17 : value === "text" ? -17 : 0,
            };
            setDrag({ x: gesture.current.baseX, y: gesture.current.baseY });
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!disabled && gesture.current?.pointerId === e.pointerId) {
              const start = gesture.current;
              const x = start.baseX + e.clientX - start.x;
              const y = start.baseY + e.clientY - start.y;
              const scale = Math.min(1, 26 / Math.max(1, Math.hypot(x, y)));
              setDrag({ x: x * scale, y: y * scale });
              setPreview(offset(e));
            }
          }}
          onPointerUp={(e) => {
            if (gesture.current?.pointerId !== e.pointerId) return;
            const id = offset(e);
            gesture.current = null;
            setPreview(null);
            setDrag(null);
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
            if (id) select(id, true);
          }}
          onPointerCancel={(e) => {
            if (gesture.current?.pointerId !== e.pointerId) return;
            gesture.current = null;
            setPreview(null);
            setDrag(null);
          }}
          onLostPointerCapture={(e) => {
            if (gesture.current?.pointerId !== e.pointerId) return;
            gesture.current = null;
            setPreview(null);
            setDrag(null);
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
