import { useEffect, useRef, useId } from "react";
import { X } from "./Icons.jsx";
let openDialogs = 0;
let restoreScroll;
const stack = [];
export default function Modal({ title, children, onClose, className = "" }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    const opener = document.activeElement;
    if (openDialogs++ === 0) {
      const root = document.documentElement;
      const body = document.body;
      const previous = [root.style.overflow, body.style.overflow];
      root.style.overflow = "hidden";
      body.style.overflow = "hidden";
      restoreScroll = () => {
        root.style.overflow = previous[0];
        body.style.overflow = previous[1];
      };
    }
    d.showModal();
    stack.push(d);
    return () => {
      const index = stack.indexOf(d);
      if (index >= 0) stack.splice(index, 1);
      d.close();
      queueMicrotask(() => {
        if (
          opener?.isConnected &&
          (!stack.length || stack.at(-1).contains(opener))
        )
          opener.focus({ preventScroll: true });
      });
      if (--openDialogs === 0) restoreScroll?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + className}
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (
          e.key !== "Escape" ||
          e.defaultPrevented ||
          stack.at(-1) !== ref.current
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (stack.at(-1) === ref.current) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading flex items-center justify-between mb-5">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
