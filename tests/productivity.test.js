import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import {
  validateDependencies,
  recordChanges,
  MemoryProfiles,
} from "../server/productivity.js";
import { ownerCandidates, isAssignedTo } from "../shared/identity.js";
import {
  dateInZone,
  taskNotifications,
  followUpReport,
} from "../shared/productivity.js";
import { calendarRange } from "../shared/scheduling.js";
import { defaultFilters, filterTasks } from "../src/features/task-filters.js";
import { sampleTranscript } from "../server/analyze.js";
const people = {
  soko: {
    uid: "soko",
    name: "Victor Soko",
    email: "soko@example.test",
    email_verified: true,
  },
  kopano: {
    uid: "kopano",
    name: "Kopano",
    email: "kopano@example.test",
    email_verified: true,
  },
  viewer: {
    uid: "viewer",
    name: "Client",
    email: "viewer@example.test",
    email_verified: true,
  },
  unverified: {
    uid: "unverified",
    name: "New Member",
    email: "new@example.test",
    email_verified: false,
  },
};
const base = {
  title: "Prepare portfolio",
  description: "Review pages",
  owner: "Victor Soko",
  ownerUid: "soko",
  deadline: "Not specified",
  dueDate: null,
  priority: "Med",
  status: "To Do",
  projectId: null,
  checklist: [],
};
const schedule = {
  date: "2026-10-15",
  time: "09:00",
  duration: 30,
  timeZone: "Africa/Johannesburg",
};
function call(app, method, path, who = "soko", workspace = "soko") {
  return request(app)
    [method]("/api" + path)
    .set("Authorization", "Bearer " + who)
    .set("X-Workspace-Id", workspace);
}
async function fixture(t, extra = {}) {
  const dir = await mkdtemp(join(tmpdir(), "shift-productivity-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new LocalStore(join(dir, "db.json"));
  const app = createApp({
    storage: "firebase",
    provider: "sample",
    signupEnabled: true,
    store,
    verifyToken: async (token) => {
      if (!people[token]) throw new Error("Invalid token");
      return people[token];
    },
    ...extra,
  });
  await call(app, "post", "/workspace")
    .send({ name: "Earny studio", ownerName: "Victor Soko" })
    .expect(201);
  await store.mutate("soko", (s) => {
    s.workspace.members.push(
      {
        uid: "kopano",
        name: "Kopano",
        email: "kopano@example.test",
        role: "member",
      },
      {
        uid: "viewer",
        name: "Client",
        email: "viewer@example.test",
        role: "viewer",
      },
    );
    s.workspace.memberUids = s.workspace.members.map((m) => m.uid);
  });
  return { app, store, dir };
}
async function create(app, extra = {}) {
  return (
    await call(app, "post", "/tasks")
      .send({ ...base, clientId: randomUUID(), ...extra })
      .expect(201)
  ).body.task;
}
const patch = (task, extra) => ({
  title: task.title,
  description: task.description,
  owner: task.owner,
  ownerUid: task.ownerUid,
  deadline: task.deadline,
  dueDate: task.dueDate,
  priority: task.priority,
  status: task.status,
  projectId: task.projectId,
  checklist: task.checklist,
  dependencyIds: task.dependencyIds || [],
  expectedUpdatedAt: task.updatedAt,
  ...extra,
});
test("personal profile persists privately, syncs name aliases and rejects unsafe avatars and unverified reminders", async (t) => {
  const { app, store, dir } = await fixture(t);
  const preferences = {
    inAppNotifications: true,
    emailReminders: false,
    remindBeforeDays: 2,
    timeZone: "Africa/Johannesburg",
  };
  const result = await call(app, "patch", "/profile")
    .send({ name: "Kiya Soko", aliases: ["Kiya", "VS"], preferences })
    .expect(200);
  assert.deepEqual(result.body.profile.aliases, ["Kiya", "VS"]);
  const restarted = new LocalStore(join(dir, "db.json"));
  assert.equal((await restarted.getProfile("soko")).name, "Kiya Soko");
  assert.equal(
    (await store.list("soko")).workspace.members[0].name,
    "Kiya Soko",
  );
  assert.equal(
    (await call(app, "get", "/profile", "kopano")).body.profile.name,
    "Kopano",
  );
  await call(app, "patch", "/profile")
    .send({ avatar: "data:image/svg+xml;base64,PHN2Zz4=" })
    .expect(400);
  await call(app, "patch", "/profile")
    .send({ preferences: { ...preferences, emailReminders: true } })
    .expect(400);
  await call(app, "patch", "/profile", "unverified")
    .send({ preferences: { ...preferences, emailReminders: true } })
    .expect(400);
  await call(app, "patch", "/profile")
    .send({ uid: "kopano", name: "Other" })
    .expect(400);
});
test("owner suggestions preserve ambiguous names and explicit account ownership wins aliases", () => {
  const members = [
    { uid: "a", name: "Victor Soko", aliases: ["Kiya"] },
    { uid: "b", name: "Kiya Dlamini" },
  ];
  assert.equal(ownerCandidates("Soko", members)[0].uid, "a");
  assert.equal(ownerCandidates("Kiya", members).length, 2);
  assert.equal(
    isAssignedTo({ owner: "Kiya", ownerUid: "b" }, members[0]),
    false,
  );
  assert.equal(isAssignedTo({ owner: "Kiya" }, members[0]), true);
});
test("dependencies reject cycles, foreign ids, deletion and premature completion; bulk is atomic and versioned", async (t) => {
  const { app, store } = await fixture(t);
  const a = await create(app, { title: "Draft portfolio" }),
    b = await create(app, { title: "Review portfolio", dependencyIds: [a.id] });
  await call(app, "patch", "/tasks/" + b.id)
    .send(patch(b, { status: "Completed" }))
    .expect(409);
  await call(app, "patch", "/tasks/" + a.id)
    .send(patch(a, { dependencyIds: [b.id] }))
    .expect(400);
  await call(app, "patch", "/tasks/" + a.id)
    .send(patch(a, { dependencyIds: ["other-workspace-task"] }))
    .expect(400);
  await call(app, "delete", "/tasks/" + a.id)
    .send({ expectedUpdatedAt: a.updatedAt })
    .expect(409);
  await call(app, "post", "/tasks/bulk")
    .send({
      tasks: [
        { id: a.id, expectedUpdatedAt: a.updatedAt },
        { id: b.id, expectedUpdatedAt: "stale" },
      ],
      changes: { priority: "High" },
    })
    .expect(409);
  assert.equal((await store.list("soko")).tasks[0].priority, "Med");
  const both = await call(app, "post", "/tasks/bulk")
    .send({
      tasks: [a, b].map((task) => ({
        id: task.id,
        expectedUpdatedAt: task.updatedAt,
      })),
      changes: { status: "Completed", priority: "High" },
    })
    .expect(200);
  assert.ok(both.body.undoToken);
  assert.ok(
    (await store.list("soko")).tasks.every(
      (task) => task.status === "Completed",
    ),
  );
  await call(app, "post", "/undo/" + both.body.undoToken)
    .send({})
    .expect(200);
  assert.ok(
    (await store.list("soko")).tasks.every((task) => task.status === "To Do"),
  );
  await call(app, "post", "/tasks/bulk", "viewer")
    .send({
      tasks: [{ id: a.id, expectedUpdatedAt: a.updatedAt }],
      changes: { status: "Completed" },
    })
    .expect(403);
});
test("undo is author-only, expires, rejects concurrent edits and restores deleted source links", async (t) => {
  const { app, store } = await fixture(t);
  const task = await create(app);
  const update = (
    await call(app, "patch", "/tasks/" + task.id)
      .send(patch(task, { status: "In Progress" }))
      .expect(200)
  ).body;
  await call(app, "post", "/undo/" + update.undoToken, "kopano")
    .send({})
    .expect(410);
  const newer = (
    await call(app, "patch", "/tasks/" + task.id, "kopano")
      .send(patch(update.task, { priority: "High" }))
      .expect(200)
  ).body;
  await call(app, "post", "/undo/" + update.undoToken)
    .send({})
    .expect(409);
  const deletion = await call(app, "delete", "/tasks/" + task.id)
    .send({ expectedUpdatedAt: newer.task.updatedAt })
    .expect(200);
  await call(app, "post", "/undo/" + deletion.body.undoToken)
    .send({})
    .expect(200);
  assert.equal((await store.list("soko")).tasks[0].priority, "High");
  await store.mutate("soko", (s) => {
    for (const record of s.undoRecords) record.expires = 0;
  });
  await call(app, "post", "/undo/" + newer.undoToken, "kopano")
    .send({})
    .expect(410);
});
test("saved schedules validate wall time and persist atomically without changing deadlines; calendar marks are private", async (t) => {
  const { app, store } = await fixture(t);
  const a = await create(app, { dueDate: "2026-10-16" }),
    b = await create(app, { title: "Write copy" });
  await call(app, "post", "/tasks/schedules")
    .send({
      tasks: [
        { id: a.id, expectedUpdatedAt: a.updatedAt, schedule },
        { id: b.id, expectedUpdatedAt: "stale", schedule },
      ],
    })
    .expect(409);
  assert.equal((await store.list("soko")).tasks[0].schedule, undefined);
  await call(app, "post", "/tasks/schedules")
    .send({
      tasks: [
        {
          id: a.id,
          expectedUpdatedAt: a.updatedAt,
          schedule: { ...schedule, timeZone: "Fake/Zone" },
        },
      ],
    })
    .expect(400);
  await call(app, "post", "/tasks/schedules")
    .send({ tasks: [{ id: a.id, expectedUpdatedAt: a.updatedAt, schedule }] })
    .expect(200);
  const saved = (await store.list("soko")).tasks.find(
    (task) => task.id === a.id,
  );
  assert.deepEqual(saved.schedule, schedule);
  assert.equal(saved.dueDate, a.dueDate);
  await call(app, "post", "/tasks/schedules", "viewer")
    .send({ tasks: [{ id: b.id, expectedUpdatedAt: b.updatedAt, schedule }] })
    .expect(403);
  await call(app, "post", "/calendar/mark", "viewer")
    .send({ taskId: a.id, fingerprint: JSON.stringify(schedule), saved: true })
    .expect(200);
  assert.equal(
    (await call(app, "get", "/profile", "viewer")).body.profile.calendarMarks
      .length,
    1,
  );
  assert.equal(
    (await call(app, "get", "/profile")).body.profile.calendarMarks.length,
    0,
  );
  assert.equal(
    calendarRange(schedule).start.toISOString(),
    "2026-10-15T07:00:00.000Z",
  );
  assert.throws(() =>
    calendarRange({
      ...schedule,
      date: "2026-03-08",
      time: "02:30",
      timeZone: "America/New_York",
    }),
  );
});
test("task views and notifications are private and workspace-scoped; dependency filters work", async (t) => {
  const { app } = await fixture(t);
  const a = await create(app),
    b = await create(app, {
      title: "Blocked dependency",
      dependencyIds: [a.id],
    });
  await call(app, "post", "/views", "viewer")
    .send({
      name: "Waiting",
      filters: { ...defaultFilters, dependency: "waiting" },
    })
    .expect(200);
  assert.equal(
    (await call(app, "get", "/profile", "viewer")).body.profile.savedViews
      .length,
    1,
  );
  assert.equal(
    (await call(app, "get", "/profile")).body.profile.savedViews.length,
    0,
  );
  await call(app, "post", "/notifications/read")
    .send({ ids: ["assigned:" + a.id] })
    .expect(200);
  assert.deepEqual(
    (await call(app, "get", "/profile")).body.profile.readNotifications,
    ["soko:assigned:" + a.id],
  );
  assert.deepEqual(
    filterTasks(
      [a, b],
      { ...defaultFilters, dependency: "waiting" },
      people.soko,
      "2026-10-10",
    ).map((task) => task.id),
    [b.id],
  );
  const n = taskNotifications(
    [{ ...a, dueDate: "2026-10-09" }],
    people.soko,
    {},
    "2026-10-10",
  );
  assert.equal(n[0].kind, "overdue");
  assert.equal(
    taskNotifications([a], people.soko, { inAppNotifications: false }).length,
    0,
  );
});
test("meeting agendas preserve references, reuse retries and show real progress without approving new tasks", async (t) => {
  const { app, store } = await fixture(t);
  const previous = (
    await call(app, "post", "/meetings")
      .send({
        title: "Prior meeting",
        date: "2026-10-09",
        type: "Planning",
        transcript: sampleTranscript,
      })
      .expect(201)
  ).body.meeting;
  const agendaInput = {
    title: "Follow-up review",
    date: "2026-10-10",
    type: "Planning",
    projectId: null,
    parentMeetingId: previous.id,
    agenda: "Review unfinished commitments and decisions.",
    clientId: randomUUID(),
  };
  const saved = (
    await call(app, "post", "/agendas").send(agendaInput).expect(201)
  ).body.agenda;
  assert.equal(
    (await call(app, "post", "/agendas").send(agendaInput)).body.agenda.id,
    saved.id,
  );
  await call(app, "post", "/agendas", "viewer")
    .send({ ...agendaInput, clientId: randomUUID() })
    .expect(403);
  await call(app, "post", "/agendas")
    .send({
      ...agendaInput,
      clientId: randomUUID(),
      parentMeetingId: "foreign",
    })
    .expect(400);
  const current = (
    await call(app, "post", "/meetings")
      .send({
        title: "Follow-up processing",
        date: "2026-10-10",
        type: "Planning",
        transcript: sampleTranscript,
        preparation: {
          agendaId: saved.id,
          parentMeetingId: previous.id,
          agenda: saved.agenda,
        },
      })
      .expect(201)
  ).body.meeting;
  assert.equal(current.preparation.agendaId, saved.id);
  assert.ok(current.proposals.every((p) => p.reviewStatus === "pending"));
  assert.equal((await store.list("soko")).agendas[0].meetingId, current.id);
  const report = followUpReport(
    previous,
    [
      { id: "1", meetingId: previous.id, status: "Completed" },
      { id: "2", meetingId: previous.id, status: "Blocked" },
    ],
    current,
  );
  assert.equal(report.completed.length, 1);
  assert.equal(report.open.length, 1);
  assert.ok(
    (await call(app, "get", "/workspace")).body.activity.some(
      (item) =>
        item.targetId === current.id && item.actorName === "Victor Soko",
    ),
  );
});
test("ambiguous proposal owners need account confirmation before approval", async (t) => {
  const { app, store } = await fixture(t);
  await store.mutate("soko", (s) =>
    s.workspace.members.push({
      uid: "duplicate",
      name: "Another Soko",
      email: "other@example.test",
      role: "member",
    }),
  );
  const meeting = (
    await call(app, "post", "/meetings")
      .send({
        title: "Duplicate owners",
        date: "2026-10-10",
        type: "Planning",
        transcript: sampleTranscript,
      })
      .expect(201)
  ).body.meeting;
  const proposal = meeting.proposals[0],
    review = {
      title: proposal.title,
      description: proposal.description,
      owner: "Soko",
      ownerUid: null,
      deadline: proposal.deadline,
      dueDate: proposal.dueDate,
      priority: proposal.priority,
      proposalId: proposal.id,
      decision: "approved",
    };
  await call(app, "post", "/meetings/" + meeting.id + "/reviews")
    .send({ reviews: [review] })
    .expect(400);
  await call(app, "post", "/meetings/" + meeting.id + "/reviews")
    .send({ reviews: [{ ...review, ownerUid: "soko" }] })
    .expect(200);
});
test("cron reminders require a secret, verified consent and current membership, send only to self and never replay", async (t) => {
  let deliveries = [];
  const { app, store } = await fixture(t, {
    mailer: {
      ready: true,
      async send(recipients, message) {
        deliveries.push({ recipients, message });
        return { accepted: recipients, rejected: [] };
      },
    },
    cronSecret: "test-secret-long-random",
    appUrl: "https://shiftscript.earny.co.za",
    reminderIdentity: async (uid) => ({
      email: people[uid].email,
      emailVerified: people[uid].email_verified,
      displayName: people[uid].name,
    }),
  });
  const preferences = {
    inAppNotifications: true,
    emailReminders: true,
    remindBeforeDays: 1,
    timeZone: "Africa/Johannesburg",
  };
  await call(app, "patch", "/profile").send({ preferences }).expect(200);
  await create(app, { dueDate: dateInZone() });
  await request(app).get("/api/reminders").expect(401);
  await request(app)
    .get("/api/reminders")
    .set("Authorization", "Bearer test-secret-long-random")
    .expect(200);
  assert.equal(deliveries.length, 1);
  assert.deepEqual(deliveries[0].recipients, ["soko@example.test"]);
  assert.match(deliveries[0].message.text, /Prepare portfolio/);
  await request(app)
    .get("/api/reminders")
    .set("Authorization", "Bearer test-secret-long-random")
    .expect(200);
  assert.equal(deliveries.length, 1);
  assert.equal(
    (await store.getProfile("soko")).emailAttempts[0].status,
    "accepted",
  );
});
test("uncertain cron sends are durable and are not automatically retried", async (t) => {
  let sends = 0;
  const { app, store } = await fixture(t, {
    mailer: {
      ready: true,
      async send() {
        sends++;
        throw new Error("Socket closed after SMTP write");
      },
    },
    cronSecret: "test-secret",
    appUrl: "https://shiftscript.earny.co.za",
    reminderIdentity: async () => ({
      email: "soko@example.test",
      emailVerified: true,
    }),
  });
  await call(app, "patch", "/profile")
    .send({
      preferences: {
        inAppNotifications: true,
        emailReminders: true,
        remindBeforeDays: 1,
        timeZone: "Africa/Johannesburg",
      },
    })
    .expect(200);
  await create(app, { dueDate: dateInZone() });
  await request(app)
    .get("/api/reminders")
    .set("Authorization", "Bearer test-secret")
    .expect(200);
  await request(app)
    .get("/api/reminders")
    .set("Authorization", "Bearer test-secret")
    .expect(200);
  assert.equal(sends, 1);
  assert.equal(
    (await store.getProfile("soko")).emailAttempts[0].status,
    "uncertain",
  );
});

test("deleting and undoing an approved task preserves its original meeting proposal link", async (t) => {
  const { app, store } = await fixture(t);
  const meeting = (
    await call(app, "post", "/meetings")
      .send({
        title: "Deletion review",
        date: "2026-10-10",
        type: "Client meeting",
        transcript: sampleTranscript,
      })
      .expect(201)
  ).body.meeting;
  const p = meeting.proposals[0];
  await call(app, "post", "/meetings/" + meeting.id + "/reviews")
    .send({
      reviews: [
        {
          title: p.title,
          description: p.description,
          owner: "Victor Soko",
          ownerUid: "soko",
          deadline: p.deadline,
          dueDate: p.dueDate,
          priority: p.priority,
          decision: "approved",
          proposalId: p.id,
        },
      ],
    })
    .expect(200);
  const saved = (await store.list("soko")).tasks[0];
  const deletion = (
    await call(app, "delete", "/tasks/" + saved.id)
      .send({ expectedUpdatedAt: saved.updatedAt })
      .expect(200)
  ).body;
  assert.equal(
    (await store.list("soko")).meetings[0].proposals[0].taskId,
    null,
  );
  await call(app, "post", "/undo/" + deletion.undoToken)
    .send({})
    .expect(200);
  const result = await store.list("soko");
  assert.equal(result.tasks[0].meetingId, meeting.id);
  assert.equal(result.meetings[0].proposals[0].taskId, saved.id);
});

test("reminders honour revoked membership, withdrawn consent, current verification and overlapping cron invocations", async (t) => {
  let sends = 0,
    verified = true;
  const { app, store } = await fixture(t, {
    mailer: {
      ready: true,
      async send(recipients) {
        sends++;
        return { accepted: recipients, rejected: [] };
      },
    },
    cronSecret: "test-secret",
    appUrl: "https://shiftscript.earny.co.za",
    reminderIdentity: async (uid) => ({
      email: people[uid].email,
      emailVerified: verified,
    }),
  });
  const preferences = {
    inAppNotifications: true,
    emailReminders: true,
    remindBeforeDays: 1,
    timeZone: "Africa/Johannesburg",
  };
  await call(app, "patch", "/profile", "kopano")
    .send({ preferences })
    .expect(200);
  await create(app, {
    owner: "Kopano",
    ownerUid: "kopano",
    dueDate: dateInZone(),
  });
  verified = false;
  await request(app)
    .get("/api/reminders")
    .set("Authorization", "Bearer test-secret")
    .expect(200);
  assert.equal(sends, 0);
  verified = true;
  await call(app, "patch", "/profile", "kopano")
    .send({ preferences: { ...preferences, emailReminders: false } })
    .expect(200);
  await request(app)
    .get("/api/reminders")
    .set("Authorization", "Bearer test-secret")
    .expect(200);
  assert.equal(sends, 0);
  await call(app, "patch", "/profile", "kopano")
    .send({ preferences })
    .expect(200);
  await store.mutate("soko", (s) => {
    s.workspace.members = s.workspace.members.filter(
      (member) => member.uid !== "kopano",
    );
  });
  await request(app)
    .get("/api/reminders")
    .set("Authorization", "Bearer test-secret")
    .expect(200);
  assert.equal(sends, 0);
  await call(app, "patch", "/profile").send({ preferences }).expect(200);
  await create(app, { dueDate: dateInZone() });
  await Promise.all([
    request(app)
      .get("/api/reminders")
      .set("Authorization", "Bearer test-secret"),
    request(app)
      .get("/api/reminders")
      .set("Authorization", "Bearer test-secret"),
  ]);
  assert.equal(sends, 1);
});

test("Firestore private profiles use per-user documents and preserve unrelated integration records", async () => {
  const { FirebaseStore } = await import("../server/store.js");
  const data = new Map([
    ["privateIntegrations/soko", { ciphertext: "opaque token" }],
  ]);
  const snapshot = (ref) => ({
    data: () => structuredClone(data.get(ref.path)),
  });
  const db = {
    collection(name) {
      return {
        doc(uid) {
          const ref = { path: name + "/" + uid };
          return { ...ref, get: async () => snapshot(ref) };
        },
        where(field, operator, value) {
          assert.equal(name, "privateProfiles");
          assert.equal(field, "preferences.emailReminders");
          assert.equal(operator, "==");
          assert.equal(value, true);
          return {
            limit(count) {
              assert.equal(count, 100);
              return {
                get: async () => ({
                  docs: [...data]
                    .filter(
                      ([path, p]) =>
                        path.startsWith("privateProfiles/") &&
                        p.preferences?.emailReminders,
                    )
                    .map(([path, p]) => ({
                      id: path.split("/")[1],
                      data: () => structuredClone(p),
                    })),
                }),
              };
            },
          };
        },
      };
    },
    async runTransaction(operation) {
      let written = false;
      return operation({
        get: async (ref) => {
          assert.equal(written, false);
          return snapshot(ref);
        },
        set(ref, value) {
          written = true;
          data.set(ref.path, structuredClone(value));
        },
      });
    },
  };
  const store = new FirebaseStore(() => ({ db }));
  await store.mutateProfile("soko", (p) =>
    Object.assign(p, {
      name: "Victor Soko",
      preferences: { emailReminders: true },
    }),
  );
  await store.mutateProfile("kopano", (p) =>
    Object.assign(p, { name: "Kopano" }),
  );
  assert.equal((await store.getProfile("soko")).name, "Victor Soko");
  assert.equal((await store.getProfile("kopano")).name, "Kopano");
  assert.equal((await store.reminderProfiles())[0].uid, "soko");
  assert.deepEqual(data.get("privateIntegrations/soko"), {
    ciphertext: "opaque token",
  });
});
