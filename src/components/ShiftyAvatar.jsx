// Original transparent clay artwork. State reflects real UI activity only.
export default function ShiftyAvatar({ state = "ready", className = "" }) {
  const expression = ["ready", "thinking", "replying", "error"].includes(state)
    ? state
    : "ready";
  return (
    <span
      className={"shifty-avatar shifty-avatar-" + expression + " " + className}
      data-shifty-state={expression}
      aria-hidden="true"
    >
      <img
        src={"/art/shifty/" + expression + ".png"}
        alt=""
        width="256"
        height="256"
        decoding="async"
        draggable="false"
      />
    </span>
  );
}
