import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { LocalStore, FirebaseStore } from "../server/store.js";
import { sampleTranscript } from "../server/analyze.js";
const identities = {
  soko: {
    uid: "soko",
    email: "soko@example.test",
    name: "Victor Soko",
    email_verified: true,
  },
  kopano: {
    uid: "kopano",
    email: "kopano@example.test",
    name: "Kopano",
    email_verified: true,
  },
  viewer: {
    uid: "viewer",
    email: "viewer@example.test",
    name: "Client Viewer",
    email_verified: true,
  },
  unverified: {
    uid: "kopano",
    email: "kopano@example.test",
    name: "Kopano",
    email_verified: false,
  },
  stranger: {
    uid: "stranger",
    email: "stranger@example.test",
    name: "Stranger",
    email_verified: true,
  },
};
const meeting = {
  title: "Shared review",
  date: "2026-10-09",
  type: "Client meeting",
  transcript: sampleTranscript,
};
const task = {
  title: "Launch portfolio",
  description: "Review all pages",
  owner: "Unassigned",
  ownerUid: null,
  deadline: "Tomorrow",
  dueDate: "2026-10-10",
  priority: "High",
  status: "To Do",
  projectId: null,
  checklist: [],
};
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "shift-collab-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new LocalStore(join(dir, "db.json")),
    app = createApp({
      storage: "firebase",
      provider: "sample",
      signupEnabled: true,
      store,
      verifyToken: async (token) => {
        if (!identities[token]) throw new Error("Bad token");
        return identities[token];
      },
    });
  await call(app, "post", "/workspace", "soko")
    .send({ name: "Studio", ownerName: "Victor Soko" })
    .expect(201);
  return { app, store, dir };
}
function call(app, method, path, who = "soko", workspace = "soko") {
  return request(app)
    [method]("/api" + path)
    .set("Authorization", "Bearer " + who)
    .set("X-Workspace-Id", workspace);
}
async function joinMember(
  app,
  email = "kopano@example.test",
  role = "member",
  who = "kopano",
) {
  const invite = (
    await call(app, "post", "/members/invitations")
      .send({ email, role })
      .expect(201)
  ).body.invitation;
  await call(
    app,
    "post",
    `/workspaces/soko/invitations/${invite.id}/accept`,
    who,
  )
    .send({})
    .expect(200);
  return invite;
}
const review = (p) => ({
  title: p.title,
  description: p.description,
  owner: p.owner,
  ownerUid: null,
  deadline: p.deadline,
  dueDate: p.dueDate,
  priority: p.priority,
  proposalId: p.id,
  decision: "approved",
});
test("invitations bind verified email, enforce roles and revoke member access", async (t) => {
  const { app } = await fixture(t);
  const invite = (
    await call(app, "post", "/members/invitations")
      .send({ email: "kopano@example.test", role: "member" })
      .expect(201)
  ).body.invitation;
  await call(
    app,
    "post",
    `/workspaces/soko/invitations/${invite.id}/accept`,
    "unverified",
  )
    .send({})
    .expect(403);
  await call(
    app,
    "post",
    `/workspaces/soko/invitations/${invite.id}/accept`,
    "stranger",
  )
    .send({})
    .expect(404);
  assert.equal(
    (await call(app, "get", "/workspaces", "unverified")).body.invitations
      .length,
    0,
  );
  assert.equal(
    (await call(app, "get", "/workspaces", "kopano")).body.invitations.length,
    1,
  );
  await call(
    app,
    "post",
    `/workspaces/soko/invitations/${invite.id}/accept`,
    "kopano",
  )
    .send({})
    .expect(200);
  assert.equal(
    (await call(app, "get", "/workspace", "kopano")).body.role,
    "member",
  );
  await call(app, "post", "/tasks", "kopano").send(task).expect(201);
  await call(app, "post", "/members/invitations", "kopano")
    .send({ email: "viewer@example.test", role: "viewer" })
    .expect(403);
  await call(app, "patch", "/members/kopano")
    .send({ role: "viewer" })
    .expect(200);
  await call(app, "post", "/tasks", "kopano").send(task).expect(403);
  await call(app, "get", "/workspace", "kopano").expect(200);
  await call(app, "delete", "/members/kopano").expect(200);
  await call(app, "get", "/workspace", "kopano").expect(403);
  assert.equal(
    (await call(app, "get", "/workspaces", "kopano")).body.workspaces.length,
    0,
  );
  await call(app, "delete", "/members/soko").expect(400);
  await call(app, "patch", "/members/soko")
    .send({ role: "viewer" })
    .expect(400);
});
test("viewer reads/export data but cannot change any workspace workflow", async (t) => {
  const { app } = await fixture(t);
  await joinMember(app, "viewer@example.test", "viewer", "viewer");
  const m = (await call(app, "post", "/meetings").send(meeting).expect(201))
    .body.meeting;
  const created = (await call(app, "post", "/tasks").send(task).expect(201))
    .body.task;
  for (const [method, path, body] of [
    [
      "post",
      "/projects",
      { name: "New", description: "", color: "blue", status: "active" },
    ],
    ["post", "/meetings", meeting],
    ["post", "/tasks", task],
    ["patch", "/tasks/" + created.id, { ...task, status: "Completed" }],
    ["post", "/tasks/" + created.id + "/notes", { text: "Test" }],
    ["put", "/drafts/current", { ...meeting, expectedVersion: 0 }],
    [
      "post",
      "/meetings/" + m.id + "/reviews",
      { reviews: [review(m.proposals[0])] },
    ],
    ["patch", "/meetings/" + m.id + "/project", { projectId: null }],
    ["patch", "/workspace", { name: "Changed", ownerName: "Viewer" }],
  ])
    await call(app, method, path, "viewer").send(body).expect(403);
  const data = (await call(app, "get", "/workspace", "viewer")).body;
  assert.equal(data.tasks.length, 1);
  assert.equal(data.meetings.length, 1);
  assert.equal(data.workspace.invites.length, 0);
});
test("extra workspaces and projects isolate records; meeting moves preserve task origins", async (t) => {
  const { app } = await fixture(t);
  const extra = (
    await call(app, "post", "/workspaces")
      .send({ name: "Other team", ownerName: "Victor Soko" })
      .expect(201)
  ).body.workspace;
  const project = (
    await call(app, "post", "/projects")
      .send({
        name: "Portfolio",
        description: "Launch",
        color: "teal",
        status: "active",
      })
      .expect(201)
  ).body.project;
  await call(app, "post", "/tasks", "soko", extra.id)
    .send({ ...task, projectId: project.id })
    .expect(400);
  await call(app, "get", "/workspace", "stranger", extra.id).expect(403);
  const m = (
    await call(app, "post", "/meetings")
      .send({ ...meeting, projectId: project.id })
      .expect(201)
  ).body.meeting;
  await call(app, "post", "/meetings/" + m.id + "/reviews")
    .send({ reviews: [review(m.proposals[0])] })
    .expect(200);
  let data = (await call(app, "get", "/workspace")).body;
  assert.equal(data.tasks[0].projectId, project.id);
  assert.equal(data.tasks[0].meetingId, m.id);
  await call(app, "patch", "/meetings/" + m.id + "/project")
    .send({ projectId: null })
    .expect(200);
  data = (await call(app, "get", "/workspace")).body;
  assert.equal(data.tasks[0].projectId, null);
  assert.equal(data.tasks[0].meetingId, m.id);
  assert.equal(data.tasks[0].evidence, m.proposals[0].evidence);
  assert.equal(
    (await call(app, "get", "/workspace", "soko", extra.id)).body.meetings
      .length,
    0,
  );
  assert.equal(
    (await call(app, "get", "/workspaces")).body.workspaces.length,
    2,
  );
});
test("drafts are private, persistent and reject stale save/delete versions", async (t) => {
  const { app, store } = await fixture(t);
  await joinMember(app);
  const draft = {
    ...meeting,
    title: "In progress",
    transcript: "Half a discussion",
    expectedVersion: 0,
  };
  const saved = (
    await call(app, "put", "/drafts/current").send(draft).expect(200)
  ).body.draft;
  assert.equal(saved.version, 1);
  assert.equal(
    (await call(app, "get", "/workspace", "kopano")).body.draft,
    null,
  );
  await call(app, "put", "/drafts/current").send(draft).expect(409);
  await call(app, "delete", "/drafts/current")
    .send({ expectedVersion: 0 })
    .expect(409);
  await call(app, "put", "/drafts/current", "kopano")
    .send({ ...draft, title: "My own draft" })
    .expect(200);
  const reopened = new LocalStore(store.path);
  assert.equal((await reopened.list("soko")).drafts.length, 2);
  await call(app, "delete", "/drafts/current")
    .send({ expectedVersion: 1 })
    .expect(200);
  assert.equal(
    (await call(app, "get", "/workspace", "kopano")).body.draft.title,
    "My own draft",
  );
});
test("bulk review commits edited owners/dates atomically, remains idempotent and never auto-approves", async (t) => {
  const { app } = await fixture(t);
  await joinMember(app);
  const m = (await call(app, "post", "/meetings").send(meeting).expect(201))
    .body.meeting;
  assert.equal((await call(app, "get", "/workspace")).body.tasks.length, 0);
  const reviews = m.proposals.map(review);
  reviews[0] = {
    ...reviews[0],
    title: "Edited commitment",
    ownerUid: "kopano",
    owner: "Wrong free-text name",
    dueDate: "2026-10-16",
  };
  reviews[1].decision = "rejected";
  await call(app, "post", "/meetings/" + m.id + "/reviews")
    .send({ reviews: [reviews[0], { ...reviews[1], proposalId: "missing" }] })
    .expect(404);
  assert.equal((await call(app, "get", "/workspace")).body.tasks.length, 0);
  await call(app, "post", "/meetings/" + m.id + "/reviews")
    .send({ reviews: [reviews[0], reviews[0]] })
    .expect(400);
  const result = await call(app, "post", "/meetings/" + m.id + "/reviews")
    .send({ reviews })
    .expect(200);
  assert.equal(result.body.reviewed, 3);
  const data = (await call(app, "get", "/workspace")).body;
  assert.equal(data.tasks.length, 2);
  const edited = data.tasks.find((t) => t.title === "Edited commitment");
  assert.equal(edited.owner, "Kopano");
  assert.equal(edited.ownerUid, "kopano");
  assert.equal(edited.dueDate, "2026-10-16");
  assert.equal(edited.meetingId, m.id);
  assert.equal(
    (
      await call(app, "post", "/meetings/" + m.id + "/reviews")
        .send({ reviews })
        .expect(200)
    ).body.reviewed,
    0,
  );
  assert.equal((await call(app, "get", "/workspace")).body.tasks.length, 2);
});
test("manual tasks preserve checklists, notes and retries; stale edits fail; removed assignees retain history", async (t) => {
  const { app } = await fixture(t);
  await joinMember(app);
  const input = {
    ...task,
    ownerUid: "kopano",
    clientId: randomUUID(),
    checklist: [{ id: "step-1", text: "Review mobile layout", done: false }],
  };
  const first = (await call(app, "post", "/tasks").send(input).expect(201)).body
    .task;
  const repeat = (await call(app, "post", "/tasks").send(input).expect(201))
    .body.task;
  assert.equal(first.id, repeat.id);
  assert.equal(first.meetingId, null);
  assert.equal(first.sourceType, "manual");
  assert.equal(first.owner, "Kopano");
  await call(app, "patch", "/tasks/" + first.id)
    .send({ ...task, expectedUpdatedAt: "stale" })
    .expect(409);
  await call(app, "post", "/tasks/" + first.id + "/notes", "kopano")
    .send({ text: "Mobile review done" })
    .expect(201);
  let current = (await call(app, "get", "/workspace")).body.tasks[0];
  assert.equal(current.notes[0].authorName, "Kopano");
  await call(app, "delete", "/members/kopano").expect(200);
  const updated = (
    await call(app, "patch", "/tasks/" + first.id)
      .send({
        ...task,
        ownerUid: "kopano",
        checklist: [{ ...input.checklist[0], done: true }],
        expectedUpdatedAt: current.updatedAt,
      })
      .expect(200)
  ).body.task;
  assert.equal(updated.owner, "Kopano");
  assert.equal(updated.checklist[0].done, true);
  await call(app, "post", "/tasks")
    .send({ ...task, ownerUid: "stranger" })
    .expect(400);
  await call(app, "post", "/tasks")
    .send({
      ...task,
      checklist: [
        { id: "same", text: "First", done: false },
        { id: "same", text: "Second", done: false },
      ],
    })
    .expect(400);
});
test("legacy local data migrates in place without losing meetings, tasks or quota", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "shift-legacy-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "legacy.json");
  await writeFile(
    path,
    JSON.stringify({
      workspace: {
        name: "Old Studio",
        ownerName: "Victor",
        ownerUid: "local-demo",
      },
      meetings: [{ id: "old-m", title: "Old meeting" }],
      tasks: [{ id: "old-t", title: "Old task" }],
      quota: { count: 7 },
    }),
  );
  const store = new LocalStore(path);
  let data = await store.list();
  assert.equal(data.meetings.length, 1);
  assert.equal(data.workspace.members[0].role, "owner");
  await store.mutate("local-demo", (s) => {
    s.projects.push({ id: "p_new", name: "New project" });
  });
  data = await store.list();
  assert.equal(data.quota.count, 7);
  assert.equal(data.tasks[0].id, "old-t");
  assert.equal(JSON.parse(await readFile(path)).schemaVersion, 2);
});
test("Firestore membership migration and transactions read before writes and preserve unrelated documents", async () => {
  const docs = new Map([
    [
      "workspaces/soko",
      {
        workspace: { name: "Legacy", ownerName: "Victor", ownerUid: "soko" },
        quota: { count: 2 },
      },
    ],
    ["workspaces/soko/meetings/old", { id: "old", title: "Meeting" }],
  ]);
  const events = [];
  const doc = (path) => ({
    path,
    id: path.split("/").at(-1),
    collection: (name) => collection(path + "/" + name),
    get: async () => ({
      id: path.split("/").at(-1),
      data: () => structuredClone(docs.get(path)),
    }),
  });
  const collection = (path, filter) => ({
    path,
    doc: (id) => doc(path + "/" + id),
    where: (field, _op, val) => collection(path, [field, val]),
    limit() {
      return this;
    },
    get: async () => ({
      docs: [...docs]
        .filter(
          ([key, value]) =>
            key.startsWith(path + "/") &&
            !key.slice(path.length + 1).includes("/") &&
            (!filter ||
              filter[0]
                .split(".")
                .reduce((v, k) => v?.[k], value)
                ?.includes(filter[1])),
        )
        .map(([key]) => ({
          id: key.split("/").at(-1),
          data: () => structuredClone(docs.get(key)),
        })),
    }),
  });
  const db = {
    collection,
    runTransaction: async (fn) => {
      const staged = [];
      const result = await fn({
        get: (ref) => {
          events.push("read");
          assert.equal(staged.length, 0);
          return ref.get();
        },
        set: (ref, value, options) => {
          events.push("write");
          staged.push(() =>
            docs.set(
              ref.path,
              options?.merge ? { ...docs.get(ref.path), ...value } : value,
            ),
          );
        },
        delete: (ref) => {
          events.push("write");
          staged.push(() => docs.delete(ref.path));
        },
      });
      staged.forEach((commit) => commit());
      return result;
    },
  };
  const store = new FirebaseStore(() => ({ db }));
  const catalog = await store.catalog({
    ...identities.soko,
    emailVerified: true,
  });
  assert.equal(catalog.workspaces.length, 1);
  assert.deepEqual(docs.get("workspaces/soko").workspace.memberUids, ["soko"]);
  assert.equal(
    docs.get("workspaces/soko").workspace.members[0].email,
    "soko@example.test",
  );
  assert.equal(docs.get("workspaces/soko").quota.count, 2);
  await store.mutate("soko", (s) => {
    s.drafts.push({ id: "soko", ownerUid: "soko", title: "Private" });
  });
  assert.equal((await store.list("soko")).meetings[0].id, "old");
  assert.ok(events.includes("write"));
});
test("revocation during analysis prevents the result from being saved", async (t) => {
  const { app, store } = await fixture(t);
  await joinMember(app);
  let release, entered;
  const gate = new Promise((resolve) => {
      release = resolve;
    }),
    started = new Promise((resolve) => {
      entered = resolve;
    });
  const slow = createApp({
    storage: "firebase",
    provider: "sample",
    signupEnabled: true,
    store,
    verifyToken: async (token) => identities[token],
    analyzer: async (input) => {
      entered();
      await gate;
      return {
        summary: "A clear next step",
        discussionPoints: [],
        decisions: [],
        followUps: [],
        actions: [],
      };
    },
  });
  const processing = call(slow, "post", "/meetings", "kopano")
    .send(meeting)
    .then((response) => response);
  await started;
  await call(app, "delete", "/members/kopano").expect(200);
  release();
  assert.equal((await processing).status, 403);
  assert.equal((await store.list("soko")).meetings.length, 0);
});
