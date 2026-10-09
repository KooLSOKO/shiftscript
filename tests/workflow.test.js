import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { sampleTranscript, sampleAnalysis } from "../server/analyze.js";
import { groundAnalysis, resolveDeadline } from "../server/schema.js";
const input = {
  title: "Dashboard project review",
  date: "2026-10-09",
  type: "Project review",
  transcript: sampleTranscript,
};
const review = (p) => ({
  title: p.title,
  description: p.description,
  owner: p.owner,
  deadline: p.deadline,
  dueDate: p.dueDate,
  priority: p.priority,
  decision: "approved",
});
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "shiftscript-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "workspace.json");
  const app = createApp({
    store: new LocalStore(path),
    storage: "local",
    provider: "sample",
  });
  return { app, path };
}
test("full workflow: notes, approval, editing, status, progress, refresh and duplicate prevention", async (t) => {
  const { app, path } = await fixture(t);
  const created = await request(app)
      .post("/api/meetings")
      .send(input)
      .expect(201),
    m = created.body.meeting;
  assert.equal(m.proposals.length, 3);
  assert.equal(m.proposals[0].owner, "Stephen");
  assert.equal(m.proposals[0].dueDate, "2026-10-12");
  assert.equal(m.proposals[1].deadline, "Not specified");
  assert.equal(m.proposals[2].owner, "Unassigned");
  assert.equal(m.proposals[2].dueDate, null);
  assert.equal(m.decisions.length, 1);
  assert.equal((await request(app).get("/api/workspace")).body.tasks.length, 0);
  const p = m.proposals[0],
    url = `/api/meetings/${m.id}/proposals/${p.id}/review`;
  await Promise.all([
    request(app).post(url).send(review(p)).expect(200),
    request(app).post(url).send(review(p)).expect(200),
  ]);
  let workspace = (await request(app).get("/api/workspace")).body;
  assert.equal(workspace.tasks.length, 1);
  const task = workspace.tasks[0];
  assert.equal(task.meetingId, m.id);
  assert.equal(task.evidence, p.evidence);
  const { decision, ...patch } = review(p);
  await request(app)
    .patch("/api/tasks/" + task.id)
    .send({ ...patch, owner: "Victor", priority: "High", status: "Blocked" })
    .expect(200);
  await request(app)
    .post("/api/tasks/" + task.id + "/notes")
    .send({ text: "Waiting for mobile screenshots." })
    .expect(201);
  const reopened = createApp({
    store: new LocalStore(path),
    storage: "local",
    provider: "sample",
  });
  workspace = (await request(reopened).get("/api/workspace")).body;
  assert.equal(workspace.tasks[0].status, "Blocked");
  assert.equal(workspace.tasks[0].owner, "Victor");
  assert.equal(workspace.tasks[0].notes.length, 1);
  const repeat = await request(reopened)
    .post("/api/meetings")
    .send(input)
    .expect(200);
  assert.equal(repeat.body.cached, true);
  assert.equal(repeat.body.meeting.proposals[0].reviewStatus, "approved");
  const reject = m.proposals[1];
  await request(app)
    .post(`/api/meetings/${m.id}/proposals/${reject.id}/review`)
    .send({ ...review(reject), decision: "rejected" })
    .expect(200);
  workspace = (await request(app).get("/api/workspace")).body;
  assert.equal(workspace.tasks.length, 1);
  assert.equal(workspace.meetings.length, 1);
});
test("invalid inputs, missing records and unsupported sample transcript", async (t) => {
  const { app } = await fixture(t);
  await request(app)
    .post("/api/meetings")
    .send({ ...input, date: "2026-02-30" })
    .expect(400);
  await request(app)
    .post("/api/meetings")
    .send({ ...input, transcript: "too short" })
    .expect(400);
  await request(app)
    .post("/api/meetings")
    .send({
      ...input,
      transcript:
        "Stephen: This is a different fictional transcript which is not the fixed sample.",
    })
    .expect(422);
  await request(app)
    .post("/api/tasks/no-such-task/notes")
    .send({ text: "Update" })
    .expect(404);
});
test("ambiguous dates remain unresolved; explicit dates and tomorrow are anchored", () => {
  assert.equal(resolveDeadline("by Friday", "2026-10-09"), null);
  assert.equal(resolveDeadline("next week", "2026-10-09"), null);
  assert.equal(resolveDeadline("tomorrow", "2026-12-31"), "2027-01-01");
  assert.equal(resolveDeadline("2026-10-12", "2026-10-09"), "2026-10-12");
});
test("fabricated evidence fails; unknown owners and unsupported deadlines are cleared", () => {
  const bad = structuredClone(sampleAnalysis);
  bad.actions[0].evidence = "This sentence never appeared in the transcript.";
  assert.throws(() => groundAnalysis(bad, input), /excerpt/);
  const raw = structuredClone(sampleAnalysis);
  raw.actions[0].owner = "Unmentioned Person";
  raw.actions[0].deadline = "2099-12-31";
  const parsed = groundAnalysis(raw, input);
  assert.equal(parsed.actions[0].owner, null);
  assert.equal(parsed.actions[0].deadline, null);
});
test("hosted mode cannot use ephemeral local storage", async (t) => {
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  t.after(() => {
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  });
  const app = createApp({ storage: "local", provider: "sample" });
  await request(app).get("/api/workspace").expect(503);
});
