import test from "node:test";
import assert from "node:assert/strict";
import {
  inlineMessage,
  messageBlocks,
} from "../src/features/message-format.js";

test("Shifty bold and emphasis use text tokens without visible formatting markers", () => {
  assert.deepEqual(inlineMessage("Your **portfolio review** is *ready*."), [
    { type: "text", text: "Your " },
    { type: "strong", text: "portfolio review" },
    { type: "text", text: " is " },
    { type: "em", text: "ready" },
    { type: "text", text: "." },
  ]);
  assert.deepEqual(inlineMessage("__Deadline__ and `**literal**`"), [
    { type: "strong", text: "Deadline" },
    { type: "text", text: " and " },
    { type: "code", text: "**literal**" },
  ]);
});
test("numbered tasks group their deadlines/status beneath each task, including blank lines", () => {
  const blocks = messageBlocks(
    "You have two tasks:\n\n1. **Review mobile**\n - Due date: 2026-10-20\n - Status: To Do\n\n2. **Launch post**\n- Due date: No deadline is set.\n- Status: Completed",
  );
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1].ordered, true);
  assert.equal(blocks[1].items.length, 2);
  assert.deepEqual(blocks[1].items[1].details, [
    "Due date: No deadline is set.",
    "Status: Completed",
  ]);
});
test("headings, bullet lists, prose and carriage returns preserve content and sequence", () => {
  const blocks = messageBlocks(
    "## Next steps\r\n* **Check the deadline**\r\n* Ask Kopano\r\n\r\nThere is no calendar connection.\r\nConnect it to plan time.",
  );
  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[1].ordered, false);
  assert.equal(blocks[1].items.length, 2);
  assert.equal(
    blocks[2].text,
    "There is no calendar connection.\nConnect it to plan time.",
  );
  assert.deepEqual(messageBlocks(""), []);
});
test("untrusted HTML, URLs and script-looking content remain inert text", () => {
  const input =
    "<img src=x onerror=alert(1)> **<script>alert(2)</script>** [open](javascript:alert(3))";
  const parts = inlineMessage(input);
  assert.equal(parts[1].type, "strong");
  assert.equal(parts[1].text, "<script>alert(2)</script>");
  assert.equal(
    parts.map((p) => p.text).join(""),
    "<img src=x onerror=alert(1)> <script>alert(2)</script> [open](javascript:alert(3))",
  );
  assert.equal(messageBlocks(input)[0].type, "paragraph");
});
