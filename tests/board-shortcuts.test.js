import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { boardSort, boardStatuses } from "../shared/board.js";
import { shortcutAction } from "../src/features/shortcuts.js";
const base = {
  description: "Prepare work",
  owner: "Kiya",
  ownerUid: null,
  deadline: "Not specified",
  dueDate: null,
  priority: "Med",
  status: "To Do",
  projectId: null,
  checklist: [],
};
const call = (app, method, path, user = "owner", workspace = "owner") =>
  request(app)
    [method]("/api" + path)
    .set("Authorization", "Bearer " + user)
    .set("X-Workspace-Id", workspace);
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "shift-board-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new LocalStore(join(dir, "db.json"));
  const app = createApp({
    store,
    storage: "firebase",
    provider: "sample",
    verifyToken: async (uid) => ({
      uid,
      name: uid,
      email: uid + "@example.test",
      email_verified: true,
    }),
  });
  await call(app, "post", "/workspace")
    .send({ name: "Earny", ownerName: "Kiya" })
    .expect(201);
  await store.mutate("owner", (s) =>
    s.workspace.members.push(
      { uid: "member", role: "member", name: "Kopano" },
      { uid: "viewer", role: "viewer", name: "Client" },
    ),
  );
  const tasks = [];
  for (const title of ["First card", "Second card", "Third card"])
    tasks.push(
      (
        await call(app, "post", "/tasks")
          .send({ ...base, title, clientId: crypto.randomUUID() })
          .expect(201)
      ).body.task,
    );
  const move = (task, extra = {}, user = "owner", workspace = "owner") =>
    call(app, "post", `/tasks/${task.id}/move`, user, workspace).send({
      status: "To Do",
      position: "end",
      expectedUpdatedAt: task.updatedAt,
      ...extra,
    });
  return { app, store, tasks, move };
}
test("board moves save status/order, preserve content/source links and support the existing Undo", async (t) => {
  const { app, store, tasks, move } = await fixture(t);
  const first = tasks[0],
    second = tasks[1];
  await move(
    first,
    {
      position: "before",
      anchorId: second.id,
      anchorUpdatedAt: second.updatedAt,
    },
    "member",
  ).expect(200);
  let state = await store.list("owner");
  const sorted = state.tasks.sort(boardSort);
  assert(
    sorted.findIndex((t) => t.id === first.id) <
      sorted.findIndex((t) => t.id === second.id),
  );
  const changed = state.tasks.find((t) => t.id === first.id);
  assert.equal(changed.description, first.description);
  assert.equal(changed.meetingId, first.meetingId);
  const moved = (await move(changed, { status: "In Progress" }).expect(200))
    .body;
  assert.equal(moved.task.status, "In Progress");
  assert.deepEqual(
    moved.tasks.map((task) => task.id),
    [first.id],
  );
  assert(
    moved.activity.some(
      (item) =>
        item.targetId === first.id &&
        item.action === "changed status to In Progress",
    ),
  );
  assert(moved.undoToken);
  await call(app, "post", "/undo/" + moved.undoToken)
    .send({})
    .expect(200);
  state = await new LocalStore(store.path).list("owner");
  assert.equal(state.tasks.find((t) => t.id === first.id).status, "To Do");
  assert.equal(
    state.tasks.find((t) => t.id === first.id).boardRank,
    changed.boardRank,
  );
});
test("board prevents stale moves, cross-workspace anchors and viewer writes without partial changes", async (t) => {
  const { store, tasks, move } = await fixture(t);
  const [first, second] = tasks;
  await move(first, { status: "Blocked" }).expect(200);
  await move(first, { status: "In Review" }).expect(409);
  const current = (await store.list("owner")).tasks.find(
    (t) => t.id === first.id,
  );
  await move(current, {}, "viewer").expect(403);
  await move(current, {}, "outsider").expect(403);
  await move(current, {}, "owner", "foreign").expect(403);
  await move(current, {
    position: "before",
    anchorId: "foreign",
    anchorUpdatedAt: second.updatedAt,
  }).expect(409);
  await store.mutate("owner", (s) => {
    s.tasks.find((t) => t.id === second.id).updatedAt = "changed";
  });
  const before = await store.list("owner");
  await move(current, {
    position: "after",
    anchorId: second.id,
    anchorUpdatedAt: second.updatedAt,
  }).expect(409);
  assert.deepEqual(await store.list("owner"), before);
});
test("blocked dependencies cannot be completed by dragging; all five status columns remain supported", async (t) => {
  const { store, tasks, move } = await fixture(t);
  assert.equal(boardStatuses.length, 5);
  await store.mutate("owner", (s) => {
    s.tasks.find((t) => t.id === tasks[1].id).dependencyIds = [tasks[0].id];
  });
  await move(tasks[1], { status: "Completed" }).expect(409);
  assert.equal(
    (await store.list("owner")).tasks.find((t) => t.id === tasks[1].id).status,
    "To Do",
  );
  for (const status of ["Blocked", "In Review", "In Progress"]) {
    const current = (await store.list("owner")).tasks.find(
      (t) => t.id === tasks[2].id,
    );
    await move(current, { status }).expect(200);
  }
});
test("dense board ranks rebalance without dropping cards or losing content", async (t) => {
  const { store, tasks, move } = await fixture(t);
  await store.mutate("owner", (s) => {
    s.tasks.find((t) => t.id === tasks[0].id).boardRank = 1e16;
    s.tasks.find((t) => t.id === tasks[1].id).boardRank = 1e16 + 2;
  });
  const third = (await store.list("owner")).tasks.find(
    (t) => t.id === tasks[2].id,
  );
  await move(third, {
    position: "before",
    anchorId: tasks[1].id,
    anchorUpdatedAt: tasks[1].updatedAt,
  }).expect(200);
  const saved = (await store.list("owner")).tasks.sort(boardSort);
  assert.deepEqual(
    saved.map((t) => t.id),
    [tasks[0].id, tasks[2].id, tasks[1].id],
  );
  assert(
    saved.every(
      (t) => Number.isFinite(t.boardRank) && t.description === base.description,
    ),
  );
});
test("tutorial completion is private per account, persists across restart and cannot overwrite identity", async (t) => {
  const { app, store } = await fixture(t);
  assert.equal(
    (await call(app, "get", "/profile")).body.profile.tutorialVersion,
    0,
  );
  await call(app, "patch", "/profile").send({ tutorialVersion: 1 }).expect(200);
  assert.equal(
    (await call(app, "get", "/profile")).body.profile.tutorialVersion,
    1,
  );
  assert.equal(
    (await call(app, "get", "/profile", "member")).body.profile.tutorialVersion,
    0,
  );
  assert.equal(
    (await new LocalStore(store.path).getProfile("owner")).tutorialVersion,
    1,
  );
  await call(app, "patch", "/profile").send({ tutorialVersion: 2 }).expect(400);
  await call(app, "patch", "/profile")
    .send({ tutorialVersion: 1, uid: "member" })
    .expect(400);
});
test("shortcuts support Mac/Windows and suppress repeats, IME, dialog actions and destructive typing conflicts", () => {
  const event = (key, extra = {}) => ({ key, ...extra });
  for (const modifier of ["metaKey", "ctrlKey"]) {
    assert.equal(
      shortcutAction(event("k", { [modifier]: true }), { typing: true }),
      "search",
    );
    assert.equal(shortcutAction(event("/", { [modifier]: true })), "help");
    assert.equal(
      shortcutAction(event("z", { [modifier]: true }), {
        typing: true,
        hasUndo: true,
      }),
      null,
    );
    assert.equal(
      shortcutAction(event("z", { [modifier]: true }), { hasUndo: true }),
      "undo",
    );
    assert.equal(shortcutAction(event("z", { [modifier]: true })), null);
  }
  for (const key of ["n", "t", "b", "m", "d", "a", "r", "?"]) {
    assert(shortcutAction(event(key)));
    assert.equal(shortcutAction(event(key), { typing: true }), null);
    assert.equal(shortcutAction(event(key), { blocked: true }), null);
    assert.equal(shortcutAction(event(key, { repeat: true })), null);
    assert.equal(shortcutAction(event(key, { isComposing: true })), null);
  }
  assert.equal(shortcutAction(event("n"), { readOnly: true }), null);
  assert.equal(shortcutAction(event("t"), { readOnly: true }), null);
  assert.equal(shortcutAction(event("b"), { readOnly: true }), "board");
});
test("single-key shortcut preference is private, persisted and strictly boolean", async (t) => {
  const { app, store } = await fixture(t);
  assert.equal(
    (await call(app, "get", "/profile")).body.profile.singleKeyShortcuts,
    true,
  );
  await call(app, "patch", "/profile")
    .send({ singleKeyShortcuts: false })
    .expect(200);
  assert.equal(
    (await call(app, "get", "/profile")).body.profile.singleKeyShortcuts,
    false,
  );
  assert.equal(
    (await call(app, "get", "/profile", "member")).body.profile
      .singleKeyShortcuts,
    true,
  );
  assert.equal(
    (await new LocalStore(store.path).getProfile("owner")).singleKeyShortcuts,
    false,
  );
  await call(app, "patch", "/profile")
    .send({ singleKeyShortcuts: "false" })
    .expect(400);
  await call(app, "patch", "/profile")
    .send({ singleKeyShortcuts: true })
    .expect(200);
  assert.equal(
    (await call(app, "get", "/profile")).body.profile.singleKeyShortcuts,
    true,
  );
});
test("turning off single keys preserves modifier and board controls; handled keys are ignored", () => {
  for (const key of ["n", "t", "b", "m", "d", "a", "r", "?"])
    assert.equal(shortcutAction({ key }, { singleKeys: false }), null);
  for (const modifier of ["metaKey", "ctrlKey"]) {
    for (const [key, action] of [
      ["k", "search"],
      ["/", "help"],
      ["z", "undo"],
    ]) {
      assert.equal(
        shortcutAction(
          { key, [modifier]: true },
          { singleKeys: false, hasUndo: true },
        ),
        action,
      );
      assert.equal(
        shortcutAction(
          { key, [modifier]: true, defaultPrevented: true },
          { hasUndo: true },
        ),
        null,
      );
    }
  }
});
