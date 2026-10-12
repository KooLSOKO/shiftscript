import test from "node:test";
import assert from "node:assert/strict";
import {
  previewBoardMove,
  overlayBoardMove,
  rollbackBoardMove,
  mergeSavedBoardTasks,
} from "../src/features/board-updates.js";
const fixture = () => [
  {
    id: "a",
    title: "Write notes",
    status: "To Do",
    boardRank: 0,
    updatedAt: "2026-10-12T01:00:00.000Z",
    meetingId: "meeting-a",
  },
  {
    id: "b",
    title: "Review notes",
    status: "In Progress",
    boardRank: 1024,
    updatedAt: "2026-10-12T01:00:00.000Z",
    owner: "Kiya",
  },
];
test("board previews move immediately without changing versions, source links or the input snapshot", () => {
  const tasks = fixture(),
    changes = previewBoardMove(tasks, "a", {
      status: "In Progress",
      position: "end",
    });
  const preview = overlayBoardMove(tasks, changes);
  assert.equal(preview[0].status, "In Progress");
  assert(preview[0].boardRank > preview[1].boardRank);
  assert.equal(preview[0].updatedAt, tasks[0].updatedAt);
  assert.equal(preview[0].meetingId, tasks[0].meetingId);
  assert.equal(tasks[0].status, "To Do");
  assert.deepEqual(rollbackBoardMove(preview, changes), tasks);
});
test("board rollback preserves newer server edits, other content and deleted tasks", () => {
  const tasks = fixture(),
    changes = previewBoardMove(tasks, "a", {
      status: "Blocked",
      position: "end",
    });
  const preview = overlayBoardMove(tasks, changes);
  preview[0] = { ...preview[0], title: "Edited while saving" };
  assert.equal(
    rollbackBoardMove(preview, changes)[0].title,
    "Edited while saving",
  );
  const newer = {
    ...preview[0],
    updatedAt: "2026-10-12T01:00:01.000Z",
    status: "In Review",
  };
  assert.deepEqual(rollbackBoardMove([newer], changes), [newer]);
  assert.deepEqual(overlayBoardMove([newer], changes), [newer]);
  assert.deepEqual(rollbackBoardMove([], changes), []);
});
test("saved board patches merge all rebalanced cards without overwriting newer data", () => {
  const tasks = fixture();
  const saved = tasks.map((t) => ({
    ...t,
    boardRank: 100 + t.boardRank,
    updatedAt: "2026-10-12T01:00:01.000Z",
  }));
  assert.deepEqual(mergeSavedBoardTasks(tasks, saved), saved);
  const newer = {
    ...saved[0],
    title: "Newest edit",
    updatedAt: "2026-10-12T01:00:02.000Z",
  };
  assert.equal(
    mergeSavedBoardTasks([newer, tasks[1]], saved)[0].title,
    "Newest edit",
  );
  assert.deepEqual(mergeSavedBoardTasks([], saved), []);
});
test("dense rank previews can be rolled back completely and stale destinations do not move anything", () => {
  const tasks = fixture();
  tasks[0].status = "In Progress";
  tasks[0].boardRank = 1;
  tasks[1].boardRank = 1 + Number.EPSILON;
  tasks.push({ id: "c", status: "To Do", updatedAt: tasks[0].updatedAt });
  const changes = previewBoardMove(tasks, "c", {
    status: "In Progress",
    position: "before",
    anchorId: "b",
  });
  assert.deepEqual(
    rollbackBoardMove(overlayBoardMove(tasks, changes), changes),
    tasks,
  );
  assert.throws(() =>
    previewBoardMove(tasks, "c", {
      status: "In Progress",
      position: "before",
      anchorId: "gone",
    }),
  );
});
