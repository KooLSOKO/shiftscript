import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { FirebaseStore, hydrate, collections } from "../server/store.js";
import { runReadScope } from "../server/read-scope.js";
import { createApp } from "../server/app.js";
import { applyTaskPatch } from "../src/features/workspace-sync.js";
import { countingFirestore } from "./fixtures/firestore-counting.js";

const at = "2026-10-12T10:00:00.000Z";
function fixture(overrides = {}) {
  const workspace = {
    id: "w",
    name: "The Interns",
    ownerUid: "soko",
    ownerName: "Victor",
    members: [
      {
        uid: "soko",
        name: "Victor",
        email: "soko@example.test",
        role: "owner",
      },
      {
        uid: "kopano",
        name: "Kopano",
        email: "kopano@example.test",
        role: "member",
      },
    ],
    invites: [],
    memberUids: ["soko", "kopano"],
    inviteEmails: [],
  };
  const initial = [
    [
      "workspaces/w",
      {
        workspace,
        dataRevision: "initial",
        logsCompactedAt: Date.now(),
        quota: { count: 2 },
      },
    ],
  ];
  const sizes = {
    tasks: 40,
    projects: 20,
    meetings: 15,
    notes: 80,
    activity: 200,
    undoRecords: 80,
    agendas: 20,
    drafts: 5,
  };
  for (const [name, number] of Object.entries(sizes))
    for (let i = 0; i < number; i++) {
      const id = name === "tasks" ? "t" + i : name + i;
      initial.push([
        `workspaces/w/${name}/${id}`,
        {
          id,
          title: "Work " + i,
          name: "Project " + i,
          createdAt: at,
          updatedAt: at,
          ...(name === "tasks"
            ? {
                description: "Review",
                owner: "Victor",
                ownerUid: "soko",
                dueDate: null,
                deadline: "Not specified",
                priority: "Med",
                status: "To Do",
                projectId: null,
                meetingId: i === 0 ? "meetings0" : null,
                notes: [],
                checklist: [],
                dependencyIds: [],
              }
            : {}),
          ...(name === "meetings"
            ? {
                proposals: [],
                date: "2026-10-12",
                transcript: "A meeting",
                summary: "Summary",
                discussionPoints: [],
                decisions: [],
                followUps: [],
              }
            : {}),
          ...(name === "undoRecords" ? { expires: Date.now() + 300000 } : {}),
        },
      ]);
    }
  const mock = countingFirestore(initial);
  const store = new FirebaseStore(() => ({ db: mock.db }));
  const app = createApp({
    storage: "firebase",
    provider: "sample",
    signupEnabled: true,
    store,
    verifyToken: async (uid) => ({
      uid,
      name: uid,
      email: uid + "@example.test",
      email_verified: true,
    }),
    memberIdentity: async (uid) => ({
      uid,
      displayName: uid,
      email: uid + "@example.test",
      emailVerified: true,
    }),
    ...overrides,
  });
  const call = (method, path, uid = "soko") =>
    request(app)
      [method]("/api" + path)
      .set("Authorization", "Bearer " + uid)
      .set("X-Workspace-Id", "w");
  return { mock, store, app, call };
}

test("unchanged workspace sync reads two documents, no collections, and checks current membership", async () => {
  const { mock, call } = fixture();
  const first = await call("get", "/workspace").expect(200);
  const fullCount = mock.count();
  assert(fullCount > 350);
  assert.equal(first.body.tasks.length, 40);
  assert.equal(first.body.meetings.length, 15);
  assert.equal(first.body.notes.length, 80);
  mock.reset();
  const unchanged = await call(
    "get",
    "/workspace?since=" + first.body.revision,
  ).expect(200);
  assert.equal(unchanged.body.unchanged, true);
  assert.equal(mock.count(), 2);
  assert.equal(mock.reads.filter((r) => r.kind === "query").length, 0);
  const root = structuredClone(mock.docs.get("workspaces/w"));
  root.workspace.members = root.workspace.members.filter(
    (m) => m.uid !== "kopano",
  );
  mock.put("workspaces/w", root);
  await call("get", "/workspace?since=" + first.body.revision, "kopano").expect(
    403,
  );
});

test("first load establishes one durable revision without replacing legacy quota, membership or meetings", async () => {
  const { mock, call } = fixture();
  const root = structuredClone(mock.docs.get("workspaces/w"));
  delete root.dataRevision;
  mock.put("workspaces/w", root);
  const loaded = await call("get", "/workspace").expect(200);
  assert.match(loaded.body.revision, /^[a-f0-9-]{36}$/);
  assert.equal(mock.docs.get("workspaces/w").quota.count, 2);
  assert.equal(loaded.body.meetings.length, 15);
  mock.reset();
  await call("get", "/workspace?since=" + loaded.body.revision).expect(200);
  assert.equal(mock.writes.length, 0);
  assert.equal(mock.count(), 2);
});

test("task updates read only required collections and return a patch preserving meeting versions and undo", async () => {
  const { mock, call } = fixture();
  const previous = (await call("get", "/workspace")).body;
  const task = previous.tasks.find((t) => t.id === "t0");
  mock.reset();
  const fields = Object.fromEntries(
    [
      "title",
      "description",
      "owner",
      "ownerUid",
      "deadline",
      "dueDate",
      "priority",
      "projectId",
      "checklist",
      "dependencyIds",
    ].map((key) => [key, task[key]]),
  );
  const saved = (
    await call("patch", "/tasks/t0")
      .send({
        ...fields,
        expectedUpdatedAt: task.updatedAt,
        status: "In Progress",
      })
      .expect(200)
  ).body;
  const queried = mock.reads
    .filter((r) => r.kind === "query")
    .map((r) => r.path);
  assert.deepEqual(queried.sort(), [
    "workspaces/w/meetings",
    "workspaces/w/projects",
    "workspaces/w/tasks",
  ]);
  assert(mock.count() < 100);
  assert(saved.undoToken);
  const current = applyTaskPatch(previous, saved.taskPatch, "w");
  assert.equal(current.tasks.find((t) => t.id === "t0").status, "In Progress");
  assert.notEqual(
    current.meetings.find((m) => m.id === "meetings0").deletionVersion,
    previous.meetings.find((m) => m.id === "meetings0").deletionVersion,
  );
  assert.equal(
    current.revision,
    previous.revision,
    "a partial patch must not hide unseen changes elsewhere",
  );
  assert(mock.docs.has("workspaces/w/notes/notes79"));
  assert(mock.docs.has("workspaces/w/activity/activity199"));
  assert(mock.docs.has("workspaces/w/undoRecords/undoRecords79"));
  const refreshed = (
    await call("get", "/workspace?since=" + previous.revision).expect(200)
  ).body;
  assert(!refreshed.unchanged);
  assert.deepEqual(current.tasks, refreshed.tasks);
  assert.deepEqual(current.meetings, refreshed.meetings);
  await call("post", "/undo/" + saved.undoToken).expect(200);
  assert.equal(mock.docs.get("workspaces/w/tasks/t0").status, "To Do");
});

test("quota reservations and profile reads do not scan workspace collections", async () => {
  const { mock, store, call } = fixture();
  await call("get", "/profile").expect(200);
  assert.equal(mock.count(), 1);
  mock.reset();
  const revision = mock.docs.get("workspaces/w").dataRevision;
  await store.mutate(
    "w",
    (s) => {
      s.quota.count++;
    },
    { collections: [] },
  );
  assert.equal(mock.count(), 1);
  assert.equal(mock.docs.get("workspaces/w").dataRevision, revision);
  assert.equal(mock.docs.get("workspaces/w").quota.count, 3);
});

test("request-local collection reuse is revision-aware, isolated and does not mutate cached records", async () => {
  const { mock, store } = fixture();
  await runReadScope(async () => {
    const first = await store.list("w", { collections: ["tasks"] });
    first.tasks[0].title = "Do not cache this edit";
    const second = await store.list("w", {
      collections: ["tasks", "projects"],
    });
    assert.notEqual(second.tasks[0].title, first.tasks[0].title);
    assert.equal(
      mock.reads.filter((r) => r.path === "workspaces/w/tasks").length,
      1,
    );
    const root = mock.docs.get("workspaces/w");
    mock.put("workspaces/w", { ...root, dataRevision: "newer" });
    mock.put("workspaces/w/tasks/t0", {
      ...mock.docs.get("workspaces/w/tasks/t0"),
      title: "Other person's edit",
    });
    const third = await store.list("w", { collections: ["tasks"] });
    assert.equal(
      third.tasks.find((t) => t.id === "t0").title,
      "Other person's edit",
    );
  });
  await runReadScope(() => store.list("w", { collections: ["tasks"] }));
  assert.equal(
    mock.reads.filter((r) => r.path === "workspaces/w/tasks").length,
    3,
  );
});

test("scoped transactions reject writes to unread collections and retry concurrent membership revocation", async () => {
  const { mock, store, call } = fixture();
  await assert.rejects(
    store.mutate(
      "w",
      (s) => {
        s.notes.push({ id: "bad" });
      },
      { collections: ["projects"] },
    ),
    /unread collection/,
  );
  assert(!mock.docs.has("workspaces/w/notes/bad"));
  mock.conflictOnce(() => {
    const root = structuredClone(mock.docs.get("workspaces/w"));
    root.workspace.members = root.workspace.members.filter(
      (member) => member.uid !== "kopano",
    );
    root.dataRevision = "revoked";
    mock.put("workspaces/w", root);
  });
  await call("post", "/projects", "kopano")
    .send({
      name: "Blocked",
      description: "No access",
      color: "blue",
      status: "active",
    })
    .expect(403);
  assert.equal(
    [...mock.docs].filter(([key]) => key.startsWith("workspaces/w/projects/"))
      .length,
    20,
  );
});

test("append-only logs are compacted transactionally and full history reads are limited to the latest 200", async () => {
  const { mock, store } = fixture();
  const root = mock.docs.get("workspaces/w");
  mock.put("workspaces/w", { ...root, logsCompactedAt: 0 });
  for (let i = 200; i < 220; i++)
    mock.put("workspaces/w/activity/a" + i, {
      id: "a" + i,
      createdAt: "2026-10-13T10:00:00.000Z",
    });
  await store.mutate(
    "w",
    (s) => {
      s.activity = s.activity.slice(-200);
      s.undoRecords = s.undoRecords
        .filter((r) => r.expires > Date.now())
        .slice(-100);
    },
    {
      collections: ["activity", "undoRecords"],
      appendOnly: ["activity", "undoRecords"],
    },
  );
  assert.equal(
    [...mock.docs].filter(([key]) => key.startsWith("workspaces/w/activity/"))
      .length,
    200,
  );
  mock.reset();
  await store.mutate(
    "w",
    (s) => {
      s.activity.push({ id: "latest", createdAt: "2026-10-14T10:00:00.000Z" });
    },
    {
      collections: ["activity", "undoRecords"],
      appendOnly: ["activity", "undoRecords"],
    },
  );
  assert.equal(mock.count(), 1);
  const data = await store.list("w", { collections: ["activity"] });
  assert.equal(data.activity.length, 200);
  assert.equal(data.activity.at(-1).id, "latest");
});

test("Firestore quota exhaustion returns a clear retryable error without exposing raw diagnostics", async () => {
  const store = {
    getProfile: async () => {
      throw Object.assign(Error("8 RESOURCE_EXHAUSTED: Quota exceeded."), {
        code: 8,
      });
    },
  };
  const app = createApp({
    storage: "firebase",
    signupEnabled: true,
    store,
    verifyToken: async () => ({
      uid: "soko",
      email: "soko@example.test",
      email_verified: true,
    }),
  });
  const response = await request(app)
    .get("/api/profile")
    .set("Authorization", "Bearer token")
    .expect(503);
  assert.match(response.body.error, /database.*usage limit/);
  assert.match(response.body.error, /saved data is retained/);
  assert.equal(response.headers["retry-after"], "300");
});

test("late task patches preserve newer edits, deletions and meeting versions, and cannot cross workspaces", () => {
  const previous = {
    tasks: [
      {
        id: "t",
        createdAt: at,
        updatedAt: "2026-10-13T10:00:00.000Z",
        title: "Newer",
      },
    ],
    activity: [],
    meetings: [{ id: "m", deletionVersion: "newer", title: "New meeting" }],
    revision: "full",
  };
  const patch = {
    workspaceId: "w",
    tasks: [{ id: "t", createdAt: at, updatedAt: at, title: "Old" }],
    deletedTasks: [],
    activity: [],
    meetings: [
      {
        previousVersion: "older",
        meeting: { id: "m", deletionVersion: "old", title: "Old meeting" },
      },
    ],
    meetingVersions: [{ id: "m", previousVersion: "older", version: "old" }],
  };
  assert.deepEqual(applyTaskPatch(previous, patch, "w"), previous);
  assert.deepEqual(
    applyTaskPatch({ ...previous, tasks: [] }, patch, "w").tasks,
    [],
  );
  assert.equal(applyTaskPatch(previous, patch, "other"), previous);
  const deleted = {
    ...previous,
    tasks: [],
    activity: [
      {
        id: "deleted",
        action: "deleted a task",
        targetType: "task",
        targetId: "t",
        createdAt: "2026-10-13T10:00:00.000Z",
      },
    ],
  };
  assert.deepEqual(
    applyTaskPatch(deleted, { ...patch, createdTaskIds: ["t"] }, "w").tasks,
    [],
  );
  const legacy = { ...previous, tasks: [{ id: "old", title: "Legacy" }] };
  assert.equal(applyTaskPatch(legacy, patch, "w").tasks.length, 1);
});

test("scoped Firestore workflows preserve drafts, projects, notes, agendas, approvals, duplicate prevention, bulk work, board moves and deletion links", async () => {
  const transcript =
    "Victor: I will check the portfolio mobile layout by 15 October 2026. Kiya: Keep the current blue.";
  const { call, mock } = fixture({
    analyzer: async () => ({
      summary: "Review the portfolio",
      discussionPoints: ["Mobile review"],
      decisions: ["Keep blue"],
      followUps: [],
      actions: [
        {
          title: "Check portfolio mobile layout",
          description: "Review the mobile layout",
          owner: "Victor",
          deadline: "2026-10-15",
          priority: "Med",
          evidence:
            "I will check the portfolio mobile layout by 15 October 2026.",
        },
      ],
    }),
  });
  const project = (
    await call("post", "/projects")
      .send({ name: "Website launch", color: "blue", status: "active" })
      .expect(201)
  ).body.project;
  await call("patch", "/projects/" + project.id)
    .send({ name: "Portfolio launch", color: "teal", status: "active" })
    .expect(200);
  const meetingInput = {
    title: "Portfolio review",
    transcript,
    date: "2026-10-13",
    type: "Planning",
    projectId: project.id,
  };
  const draft = (
    await call("put", "/drafts/current")
      .send({ ...meetingInput, expectedVersion: 0 })
      .expect(200)
  ).body.draft;
  await call("delete", "/drafts/current")
    .send({ expectedVersion: draft.version })
    .expect(200);
  const noteInput = {
    title: "Notebook review",
    text: transcript,
    date: "2026-10-13",
    projectId: project.id,
    meetingId: null,
    photo: null,
  };
  const note = (
    await call("post", "/notes")
      .send({ ...noteInput, clientId: randomUUID() })
      .expect(201)
  ).body.note;
  const edited = (
    await call("put", "/notes/" + note.id)
      .send({ ...noteInput, expectedVersion: note.version })
      .expect(200)
  ).body.note;
  const agenda = (
    await call("post", "/agendas")
      .send({
        title: "Portfolio review",
        date: "2026-10-13",
        type: "Planning",
        projectId: project.id,
        parentMeetingId: null,
        agenda: "Review the mobile experience",
        clientId: randomUUID(),
      })
      .expect(201)
  ).body.agenda;
  const imported = (
    await call("post", "/notes/" + note.id + "/process")
      .send({
        expectedVersion: edited.version,
        title: "Portfolio review",
        date: "2026-10-13",
        type: "Planning",
        projectId: project.id,
      })
      .expect(201)
  ).body.meeting;
  const duplicate = (
    await call("post", "/notes/" + note.id + "/process")
      .send({
        expectedVersion: edited.version,
        title: "Portfolio review",
        date: "2026-10-13",
        type: "Planning",
        projectId: project.id,
      })
      .expect(200)
  ).body;
  assert.equal(duplicate.cached, true);
  assert.equal(duplicate.meeting.id, imported.id);
  const proposal = imported.proposals[0];
  const review = {
    decision: "approved",
    title: proposal.title,
    description: proposal.description,
    owner: "Victor",
    ownerUid: "soko",
    deadline: proposal.deadline,
    dueDate: proposal.dueDate,
    priority: proposal.priority,
  };
  const approved = (
    await call(
      "post",
      `/meetings/${imported.id}/proposals/${proposal.id}/review`,
    )
      .send(review)
      .expect(200)
  ).body.meeting;
  const taskId = approved.proposals[0].taskId;
  await call("post", `/meetings/${imported.id}/reviews`)
    .send({ reviews: [{ ...review, proposalId: proposal.id }] })
    .expect(200);
  assert.equal(
    [...mock.docs].filter(
      ([key, task]) =>
        key.includes("/tasks/") && task.meetingId === imported.id,
    ).length,
    1,
  );
  let task = mock.docs.get("workspaces/w/tasks/" + taskId);
  const move = (
    await call("post", `/tasks/${taskId}/move`)
      .send({
        status: "In Progress",
        position: "end",
        anchorId: null,
        anchorUpdatedAt: null,
        expectedUpdatedAt: task.updatedAt,
      })
      .expect(200)
  ).body;
  assert(move.taskPatch);
  task = mock.docs.get("workspaces/w/tasks/" + taskId);
  await call("post", "/tasks/bulk")
    .send({
      tasks: [{ id: taskId, expectedUpdatedAt: task.updatedAt }],
      changes: { priority: "High" },
    })
    .expect(200);
  await call("post", `/tasks/${taskId}/notes`)
    .send({ text: "Mobile testing is underway." })
    .expect(201);
  const invite = (
    await call("post", "/members/invitations")
      .send({ email: "johannes@example.test", role: "viewer" })
      .expect(201)
  ).body.invitation;
  await call(
    "post",
    `/workspaces/w/invitations/${invite.id}/accept`,
    "johannes",
  ).expect(200);
  await call("post", "/projects", "johannes")
    .send({ name: "No write access" })
    .expect(403);
  const current = (await call("get", "/workspace")).body;
  const meeting = current.meetings.find((item) => item.id === imported.id);
  await call("delete", "/meetings/" + meeting.id)
    .send({ confirm: true, expectedVersion: meeting.deletionVersion })
    .expect(200);
  assert(!mock.docs.has("workspaces/w/tasks/" + taskId));
  assert(!mock.docs.has("workspaces/w/meetings/" + imported.id));
  assert.equal(
    mock.docs.get("workspaces/w/notes/" + note.id).processed.length,
    0,
  );
  assert(mock.docs.has("workspaces/w/agendas/" + agenda.id));
  await call("delete", "/notes/" + note.id)
    .send({
      expectedVersion: mock.docs.get("workspaces/w/notes/" + note.id).version,
    })
    .expect(200);
});
