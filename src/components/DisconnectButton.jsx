import { LogOut } from "./Icons.jsx";

// Sliding icon panel inspired by Uiverse.io / AKAspidey01.
export default function DisconnectButton({ disabled, onClick }) {
  return (
    <button
      type="button"
      className="disconnect-button"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="disconnect-button-icon" aria-hidden="true">
        <LogOut size={25} />
      </span>
      <span className="disconnect-button-label">Disconnect</span>
    </button>
  );
}
