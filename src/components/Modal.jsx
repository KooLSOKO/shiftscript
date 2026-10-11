import { useEffect, useRef, useId } from "react";
import { X } from "./Icons.jsx";
let openDialogs = 0;
let restoreScroll;
export default function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
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
    return () => {
      d.close();
      if (--openDialogs === 0) restoreScroll?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
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
