// A deliberately small Markdown subset. Text stays text: no HTML or URL execution.
export function inlineMessage(text) {
  const parts = [];
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*)/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset)
      parts.push({ type: "text", text: text.slice(offset, match.index) });
    const value = match[0];
    const type = value.startsWith("`")
      ? "code"
      : value.startsWith("**") || value.startsWith("__")
        ? "strong"
        : "em";
    const trim = type === "strong" ? 2 : 1;
    parts.push({ type, text: value.slice(trim, -trim) });
    offset = match.index + value.length;
  }
  if (offset < text.length)
    parts.push({ type: "text", text: text.slice(offset) });
  return parts;
}

export function messageBlocks(text) {
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const blocks = [];
  let list = null,
    paragraph = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraph = null;
      continue;
    }
    const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", text: heading[1] });
      list = paragraph = null;
      continue;
    }
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    const bullet = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ordered) {
      if (!list?.ordered) {
        list = {
          type: "list",
          ordered: true,
          start: Number(ordered[1]),
          items: [],
        };
        blocks.push(list);
      }
      list.items.push({ text: ordered[2], details: [] });
      paragraph = null;
      continue;
    }
    if (bullet) {
      // AI replies often put a task's date/status beneath a numbered task.
      if (list?.ordered && list.items.length)
        list.items.at(-1).details.push(bullet[2]);
      else {
        if (!list || list.ordered) {
          list = { type: "list", ordered: false, items: [] };
          blocks.push(list);
        }
        list.items.push({ text: bullet[2], details: [] });
      }
      paragraph = null;
      continue;
    }
    list = null;
    if (paragraph) paragraph.text += "\n" + trimmed;
    else {
      paragraph = { type: "paragraph", text: trimmed };
      blocks.push(paragraph);
    }
  }
  return blocks;
}
