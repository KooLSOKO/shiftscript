import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { meetingDeletionVersion } from "../server/deletion.js";
import { sampleTranscript } from "../server/analyze.js";
const call = (app, method, path, user = "owner", workspace = "owner") =>
  request(app)
    [method]("/api" + path)
    .set("Authorization", "Bearer " + user)
    .set("X-Workspace-Id", workspace);
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "shift-deletion-"));
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
  await store.mutate("owner", (s) => {
    s.workspace.members.push(
      { uid: "member", name: "Kopano", role: "member" },
      { uid: "viewer", name: "Viewer", role: "viewer" },
    );
  });
  const meeting = (
    await call(app, "post", "/meetings")
      .send({
        title: "Portfolio review",
        date: "2026-10-11",
        type: "Planning",
        transcript: sampleTranscript,
      })
      .expect(201)
  ).body.meeting;
  const reviews = meeting.proposals
    .slice(0, 2)
    .map((p) => ({
      title: p.title,
      description: p.description,
      owner: p.owner,
      ownerUid: null,
      deadline: p.deadline,
      dueDate: p.dueDate,
      priority: p.priority,
      decision: "approved",
      proposalId: p.id,
    }));
  await call(app, "post", `/meetings/${meeting.id}/reviews`)
    .send({ reviews })
    .expect(200);
  const snapshot = async () =>
    (await call(app, "get", "/workspace").expect(200)).body.meetings.find(
      (m) => m.id === meeting.id,
    );
  const remove = (expectedVersion, who = "owner", workspace = "owner") =>
    call(app, "delete", `/meetings/${meeting.id}`, who, workspace).send({
      confirm: true,
      expectedVersion,
    });
  return { app, store, meeting, snapshot, remove };
}
test("meeting deletion atomically cascades tasks, preserves notes and follow-ups, cleans dependencies and invalidates orphan-restoring undo", async (t) => {
  const { app, store, meeting, snapshot, remove } = await fixture(t);
  const linked = (await store.list("owner")).tasks;
  // A deleted task's earlier undo must also be invalidated when its source disappears.
  const undo = (
    await call(app, "delete", `/tasks/${linked[0].id}`)
      .send({ expectedUpdatedAt: linked[0].updatedAt })
      .expect(200)
  ).body.undoToken;
  await store.mutate("owner", (s) => {
    s.tasks.push({
      ...linked[1],
      id: "independent",
      meetingId: null,
      proposalId: null,
      title: "Launch after review",
      dependencyIds: [linked[1].id],
      updatedAt: "2026-10-11T00:00:00.000Z",
    });
    s.notes.push({
      id: "note",
      title: "Handwritten notes",
      text: "Keep this original text",
      version: 1,
      updatedAt: "2026-10-11T00:00:00.000Z",
      meetingId: meeting.id,
      processed: [{ meetingId: meeting.id, version: 1 }],
    });
    s.agendas.push({
      id: "agenda",
      agenda: "Keep this agenda",
      meetingId: meeting.id,
      parentMeetingId: meeting.id,
    });
    s.meetings.push({
      ...meeting,
      id: "followup",
      title: "Follow-up",
      proposals: [],
      preparation: {
        parentMeetingId: meeting.id,
        agenda: "Keep follow-up agenda",
      },
    });
  });
  const version = (await snapshot()).deletionVersion;
  const result = (await remove(version, "member").expect(200)).body;
  assert.equal(result.deletedTaskCount, 1);
  assert.deepEqual(result.deletedTaskIds, [linked[1].id]);
  const state = await store.list("owner");
  assert.deepEqual(
    state.tasks.map((task) => task.id),
    ["independent"],
  );
  assert.deepEqual(state.tasks[0].dependencyIds, []);
  assert.notEqual(state.tasks[0].updatedAt, "2026-10-11T00:00:00.000Z");
  assert.equal(state.notes[0].text, "Keep this original text");
  assert.equal(state.notes[0].meetingId, null);
  assert.equal(state.notes[0].version, 2);
  assert.deepEqual(state.notes[0].processed, []);
  assert.equal(state.agendas[0].parentMeetingId, null);
  assert.equal(state.agendas[0].meetingId, null);
  assert.equal(state.meetings[0].preparation.parentMeetingId, null);
  assert.equal(state.meetings[0].preparation.agenda, "Keep follow-up agenda");
  assert(
    state.activity.some(
      (item) =>
        item.action === "deleted a meeting" && item.targetId === meeting.id,
    ),
  );
  await call(app, "post", "/undo/" + undo)
    .send({})
    .expect(410);
  await remove(version).expect(404);
  const restarted = new LocalStore(store.path);
  assert.equal(
    (await restarted.list("owner")).meetings.some((m) => m.id === meeting.id),
    false,
  );
});
test("stale meeting or task changes require a fresh deletion review and leave all data intact", async (t) => {
  const { store, snapshot, remove } = await fixture(t);
  for (const change of [
    (s) => {
      s.tasks[0].notes = [{ text: "New progress" }];
    },
    (s) => {
      s.meetings[0].summary += " New decision.";
    },
    (s) => {
      s.tasks.push({ ...s.tasks[0], id: "new-approval" });
    },
  ]) {
    const version = (await snapshot()).deletionVersion;
    await store.mutate("owner", change);
    const before = await store.list("owner");
    const result = await remove(version).expect(409);
    assert.match(result.body.error, /changed/);
    assert.deepEqual(await store.list("owner"), before);
  }
  await remove((await snapshot()).deletionVersion).expect(200);
});
test("deletion enforces workspace access, writer permissions and explicit confirmation", async (t) => {
  const { app, store, meeting, snapshot, remove } = await fixture(t);
  const version = (await snapshot()).deletionVersion;
  await remove(version, "viewer").expect(403);
  await remove(version, "outsider").expect(403);
  await remove(version, "owner", "foreign-workspace").expect(403);
  await call(app, "delete", `/meetings/${meeting.id}`)
    .send({ expectedVersion: version })
    .expect(400);
  await call(app, "delete", `/meetings/${meeting.id}`)
    .send({ confirm: false, expectedVersion: version })
    .expect(400);
  assert.equal((await store.list("owner")).tasks.length, 2);
});
test("a recap send in flight blocks deletion until its external result has been saved", async (t) => {
  const { store, snapshot, remove } = await fixture(t);
  await store.mutate("owner", (s) => {
    s.meetings[0].emailSends = [{ id: "send", status: "sending" }];
  });
  const result = await remove((await snapshot()).deletionVersion).expect(409);
  assert.match(result.body.error, /email is being sent/);
  await store.mutate("owner", (s) => {
    s.meetings[0].emailSends[0].status = "accepted";
  });
  await remove((await snapshot()).deletionVersion).expect(200);
});
test("meeting revisions ignore storage key ordering, yet capture task content changes", () => {
  const first = {
    id: "m",
    summary: "Review",
    source: { kind: "text", name: "notes" },
  };
  const reordered = {
    source: { name: "notes", kind: "text" },
    summary: "Review",
    id: "m",
  };
  const tasks = [{ id: "t", meetingId: "m", title: "Publish" }];
  assert.equal(
    meetingDeletionVersion(first, tasks),
    meetingDeletionVersion(reordered, tasks),
  );
  assert.equal(
    meetingDeletionVersion(first, tasks),
    meetingDeletionVersion({ ...first, deletionVersion: "ignored" }, tasks),
  );
  assert.notEqual(
    meetingDeletionVersion(first, tasks),
    meetingDeletionVersion(first, [{ ...tasks[0], title: "Review" }]),
  );
});
