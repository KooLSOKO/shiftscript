import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { sampleTranscript, sampleAnalysis } from "../server/analyze.js";
import { hash, meetingId, groundAnalysis } from "../server/schema.js";

const input = {
  title: "Dashboard review",
  date: "2026-10-09",
  type: "Project review",
  transcript: sampleTranscript,
};
const approval = (p) => ({
  title: p.title,
  description: p.description,
  owner: p.owner,
  deadline: p.deadline,
  dueDate: p.dueDate,
  priority: p.priority,
  decision: "approved",
});
async function fixture(t, analyze) {
  const dir = await mkdtemp(join(tmpdir(), "shiftscript-duplicates-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new LocalStore(join(dir, "workspace.json"));
  let calls = 0;
  const app = createApp({
    store,
    storage: "local",
    provider: "sample",
    analyzer: async (...args) => {
      calls++;
      return analyze ? analyze(...args) : structuredClone(sampleAnalysis);
    },
  });
  return { app, store, calls: () => calls };
}

test("changed labels and filing reuse the meeting, reviews and edited task without another AI call", async (t) => {
  const f = await fixture(t);
  const m = (await request(f.app).post("/api/meetings").send(input).expect(201))
    .body.meeting;
  await request(f.app)
    .post(`/api/meetings/${m.id}/proposals/${m.proposals[0].id}/review`)
    .send(approval(m.proposals[0]))
    .expect(200);
  await request(f.app)
    .post(`/api/meetings/${m.id}/proposals/${m.proposals[1].id}/review`)
    .send({ ...approval(m.proposals[1]), decision: "rejected" })
    .expect(200);
  const task = (await f.store.list()).tasks[0];
  const { decision, ...fields } = approval(m.proposals[0]);
  await request(f.app)
    .patch(`/api/tasks/${task.id}`)
    .send({
      ...fields,
      title: "My reviewed wording",
      owner: "Victor",
      status: "Completed",
      checklist: [{ id: "check-1", text: "Screenshots checked", done: true }],
    })
    .expect(200);
  await request(f.app)
    .post(`/api/tasks/${task.id}/notes`)
    .send({ text: "Reviewed with the team." })
    .expect(201);
  const before = structuredClone((await f.store.list()).tasks[0]);
  const project = (
    await request(f.app)
      .post("/api/projects")
      .send({ name: "Portfolio" })
      .expect(201)
  ).body.project;
  const again = await request(f.app)
    .post("/api/meetings")
    .send({
      ...input,
      title: "Renamed discussion",
      type: "Internal",
      projectId: project.id,
      source: { kind: "text", name: "renamed-file.txt" },
      preparation: {
        parentMeetingId: m.id,
        agenda: "A changed label is not a new discussion.",
      },
      transcript: input.transcript.toUpperCase().replaceAll("\n", "\n\n  "),
    })
    .expect(200);
  assert.equal(again.body.cached, true);
  assert.equal(again.body.meeting.id, m.id);
  assert.equal(again.body.meeting.title, input.title);
  assert.equal(again.body.meeting.proposals[0].reviewStatus, "approved");
  assert.equal(again.body.meeting.proposals[1].reviewStatus, "rejected");
  assert.equal(again.body.meeting.proposals[2].reviewStatus, "pending");
  const data = await f.store.list();
  assert.equal(data.meetings.length, 1);
  assert.deepEqual(data.tasks, [before]);
  assert.equal(f.calls(), 1);
  assert.equal(data.quota.count, 1);
});

test("legacy IDs and source/task links are reused without migrating stored documents", async (t) => {
  const f = await fixture(t);
  const m = (await request(f.app).post("/api/meetings").send(input).expect(201))
    .body.meeting;
  await request(f.app)
    .post(`/api/meetings/${m.id}/proposals/${m.proposals[0].id}/review`)
    .send(approval(m.proposals[0]))
    .expect(200);
  const oldId = hash(
    JSON.stringify([
      input.title.toLowerCase(),
      input.date,
      input.type,
      input.transcript.toLowerCase(),
    ]),
  );
  await f.store.mutate("local-demo", (s) => {
    s.meetings[0].id = oldId;
    delete s.meetings[0].processingFingerprint;
    s.meetings[0].proposals.forEach((p) => delete p.actionKey);
    s.tasks[0].meetingId = oldId;
    delete s.tasks[0].actionKey;
  });
  const savedTask = structuredClone((await f.store.list()).tasks[0]);
  const again = await request(f.app)
    .post("/api/meetings")
    .send({ ...input, title: "New title" })
    .expect(200);
  assert.equal(again.body.meeting.id, oldId);
  assert.equal(again.body.meeting.proposals[0].taskId, savedTask.id);
  assert.deepEqual((await f.store.list()).tasks, [savedTask]);
  assert.equal(f.calls(), 1);
});

test("simultaneous submissions with different metadata return the same meeting and one set of tasks", async (t) => {
  let entered,
    release,
    started = 0;
  const ready = new Promise((r) => (entered = r));
  const gate = new Promise((r) => (release = r));
  const f = await fixture(t, async () => {
    if (++started === 2) entered();
    await gate;
    return structuredClone(sampleAnalysis);
  });
  const requests = [
    input,
    { ...input, title: "Different label", type: "Internal" },
  ].map((body) =>
    request(f.app)
      .post("/api/meetings")
      .send(body)
      .then((r) => r),
  );
  await ready;
  release();
  const responses = await Promise.all(requests);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
  assert.deepEqual(responses.map((r) => r.body.cached).sort(), [false, true]);
  assert.equal(responses[0].body.meeting.id, responses[1].body.meeting.id);
  await Promise.all(
    responses.map(({ body: { meeting: m } }) =>
      request(f.app)
        .post(`/api/meetings/${m.id}/reviews`)
        .send({
          reviews: m.proposals.map((p) => ({
            ...approval(p),
            proposalId: p.id,
          })),
        })
        .expect(200),
    ),
  );
  const data = await f.store.list();
  assert.equal(data.meetings.length, 1);
  assert.equal(data.tasks.length, 3);
});

test("an equivalent proposal links to the existing edited task instead of resetting progress", async (t) => {
  const f = await fixture(t);
  const m = (await request(f.app).post("/api/meetings").send(input).expect(201))
    .body.meeting;
  const p = m.proposals[0];
  await request(f.app)
    .post(`/api/meetings/${m.id}/proposals/${p.id}/review`)
    .send({ ...approval(p), title: "Reviewer wording" })
    .expect(200);
  const task = (await f.store.list()).tasks[0];
  const { decision, ...fields } = approval(p);
  await request(f.app)
    .patch(`/api/tasks/${task.id}`)
    .send({ ...fields, title: "Task edited later", status: "Completed" })
    .expect(200);
  const before = structuredClone((await f.store.list()).tasks[0]);
  await f.store.mutate("local-demo", (s) => {
    s.meetings[0].proposals.push({ ...p, id: "duplicate-proposal" });
  });
  const r = await request(f.app)
    .post(`/api/meetings/${m.id}/proposals/duplicate-proposal/review`)
    .send(approval(p))
    .expect(200);
  assert.equal(r.body.meeting.proposals.at(-1).taskId, task.id);
  assert.deepEqual((await f.store.list()).tasks, [before]);
});

test("a different discussion or meeting date remains separate", async (t) => {
  const f = await fixture(t);
  for (const body of [
    input,
    { ...input, date: "2026-10-10" },
    {
      ...input,
      transcript:
        input.transcript + "\nVictor: We also reviewed the contact form.",
    },
  ])
    await request(f.app).post("/api/meetings").send(body).expect(201);
  assert.equal((await f.store.list()).meetings.length, 3);
  assert.equal(f.calls(), 3);
  assert.notEqual(
    meetingId(input),
    meetingId(input, { kind: "note", noteId: "n-one", noteVersion: 1 }),
  );
  assert.notEqual(
    meetingId(input, { kind: "note", noteId: "n-one", noteVersion: 1 }),
    meetingId(input, { kind: "note", noteId: "n-one", noteVersion: 2 }),
  );
});

test("grounding removes identical actions but retains distinct commitments in one quote", () => {
  const raw = structuredClone(sampleAnalysis);
  raw.actions.push(structuredClone(raw.actions[0]));
  assert.equal(groundAnalysis(raw, input).actions.length, 3);
  const transcript =
    "Stephen and Kiyasha: We will each send feedback by 2026-10-12.";
  raw.actions = ["Stephen", "Kiyasha"].map((owner) => ({
    ...sampleAnalysis.actions[0],
    owner,
    evidence: transcript,
  }));
  assert.equal(groundAnalysis(raw, { ...input, transcript }).actions.length, 2);
});

test("duplicate matching stays inside the selected workspace", async (t) => {
  const f = await fixture(t);
  await request(f.app).post("/api/meetings").send(input).expect(201);
  const workspace = (
    await request(f.app)
      .post("/api/workspaces")
      .send({ name: "Another team", ownerName: "Victor" })
      .expect(201)
  ).body.workspace;
  await request(f.app)
    .post("/api/meetings")
    .set("X-Workspace-Id", workspace.id)
    .send(input)
    .expect(201);
  assert.equal((await f.store.list()).meetings.length, 1);
  assert.equal((await f.store.list(workspace.id)).meetings.length, 1);
  assert.equal(f.calls(), 2);
});
