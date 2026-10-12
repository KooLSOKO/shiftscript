import { useEffect, useRef, useState } from "react";

export default function AuthTransition({ ready, onFinished }) {
  const [phase, setPhase] = useState("cover");
  const skip = useRef(null);
  const dialog = useRef(null);
  const completed = useRef(false);
  const finish = () => {
    if (completed.current) return;
    completed.current = true;
    // Close the native top-layer dialog before App restores focus. A later
    // cleanup close could otherwise replace that focus with the old body node.
    dialog.current?.close();
    onFinished();
  };
  useEffect(() => {
    const overlay = dialog.current;
    overlay.showModal();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      finish();
      return () => overlay.close();
    }
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    skip.current?.focus({ preventScroll: true });
    const covered = setTimeout(() => setPhase("hold"), 550);
    // Slow/failed API requests still expose the app's real loading or retry screen.
    const maximumHold = setTimeout(() => setPhase("reveal"), 1600);
    const motionChanged = (event) => {
      if (event.matches) finish();
    };
    media.addEventListener("change", motionChanged);
    return () => {
      clearTimeout(covered);
      clearTimeout(maximumHold);
      media.removeEventListener("change", motionChanged);
      document.body.style.overflow = priorOverflow;
      overlay.close();
    };
  }, [onFinished]);
  useEffect(() => {
    // A dialog can become available when the workspace finishes loading. Keep
    // the transition above it without unmounting that dialog or its draft.
    const overlay = dialog.current;
    if (!overlay?.open || completed.current) return;
    overlay.close();
    overlay.showModal();
    skip.current?.focus({ preventScroll: true });
  }, [ready]);
  useEffect(() => {
    if (phase !== "hold" || !ready) return;
    const timer = setTimeout(() => setPhase("reveal"), 80);
    return () => clearTimeout(timer);
  }, [phase, ready]);
  useEffect(() => {
    if (phase !== "reveal") return;
    const timer = setTimeout(finish, 620);
    return () => clearTimeout(timer);
  }, [phase, onFinished]);
  return (
    <dialog
      ref={dialog}
      className="auth-transition"
      data-phase={phase}
      role="dialog"
      aria-modal="true"
      aria-label="Opening ShiftScript"
      onCancel={(event) => {
        event.preventDefault();
        finish();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish();
        }
        if (event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          skip.current?.focus();
        }
      }}
    >
      <div className="auth-transition-plate" aria-hidden="true" />
      <svg
        className="auth-transition-stroke"
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <path
          pathLength="1"
          d="M-220 930 C120 1020 470 480 210 310 C-90 90 220-140 570 180 C870 520 520 1060 900 880 C1200 660 1030 120 780 460 C520-80 1090-140 1260 250 C1530 880 1150 940 1540 1030 C1790 1100 1890 600 1450 440 C1110 320 1510-210 1810 80"
        />
      </svg>
      <div className="auth-transition-brand">
        <img src="/favicon.svg" alt="" />
        <strong>ShiftScript</strong>
        <p role="status">Opening ShiftScript…</p>
      </div>
      <button
        ref={skip}
        type="button"
        className="auth-transition-skip"
        onClick={finish}
      >
        Skip animation
      </button>
    </dialog>
  );
}
