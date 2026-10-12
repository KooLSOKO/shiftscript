export const shortcuts = [
  {
    action: "search",
    label: "Search meetings and tasks",
    mac: "⌘ K",
    windows: "Ctrl K",
  },
  {
    action: "meeting",
    label: "New meeting",
    mac: "N",
    windows: "N",
    writes: true,
  },
  { action: "task", label: "New task", mac: "T", windows: "T", writes: true },
  { action: "board", label: "Open board", mac: "B", windows: "B" },
  { action: "meetings", label: "Meeting history", mac: "M", windows: "M" },
  { action: "dashboard", label: "Overview", mac: "D", windows: "D" },
  { action: "assistant", label: "Ask Shifty", mac: "A", windows: "A" },
  { action: "refresh", label: "Refresh workspace", mac: "R", windows: "R" },
  {
    action: "undo",
    label: "Undo the last available task change",
    mac: "⌘ Z",
    windows: "Ctrl Z",
    writes: true,
  },
  {
    action: "help",
    label: "Shortcuts and tutorial",
    mac: "⌘ / or ?",
    windows: "Ctrl / or ?",
  },
];
export function shortcutAction(
  event,
  {
    typing = false,
    blocked = false,
    readOnly = false,
    hasUndo = false,
    singleKeys = true,
  } = {},
) {
  if (
    event.defaultPrevented ||
    blocked ||
    event.repeat ||
    event.isComposing ||
    event.altKey
  )
    return null;
  const key = event.key.toLowerCase(),
    modifier = event.metaKey || event.ctrlKey;
  let action = null;
  if (modifier && !event.shiftKey) {
    if (key === "k") action = "search";
    if (key === "/") action = "help";
    if (key === "z" && !typing && hasUndo) action = "undo";
  } else if (!modifier && !typing && singleKeys) {
    if (key === "?") action = "help";
    else if (!event.shiftKey)
      action =
        {
          n: "meeting",
          t: "task",
          b: "board",
          m: "meetings",
          d: "dashboard",
          a: "assistant",
          r: "refresh",
        }[key] || null;
  }
  return action &&
    !(readOnly && shortcuts.find((s) => s.action === action)?.writes)
    ? action
    : null;
}
export function isTypingTarget(target) {
  return Boolean(
    target?.closest?.(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]',
    ),
  );
}
