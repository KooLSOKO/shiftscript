import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { newWorkspace } from "../server/collaboration.js";
import { extractNoteImage, validateNoteImage } from "../server/notes.js";
import { assistantContext } from "../server/assistant.js";
import { analyze } from "../server/analyze.js";
const text =
  "Portfolio planning\nKeep the corporate blue.\nKopano will review the mobile portfolio by 2026-10-15.\nKiya will confirm launch details.\nUnreadable margin: [unclear].";
const input = () => ({
  title: "Notebook planning",
  text,
  date: "2026-10-11",
  projectId: null,
  meetingId: null,
  photo: null,
});
const rawAnalysis = {
  summary: "The portfolio remains corporate blue and needs a mobile review.",
  discussionPoints: ["Review the mobile layout."],
  decisions: ["Keep corporate blue."],
  followUps: ["Confirm launch details."],
  actions: [
    {
      title: "Review the mobile portfolio",
      description: "Check the mobile layout.",
      owner: "Kopano",
      deadline: "2026-10-15",
      priority: "Med",
      evidence: "Kopano will review the mobile portfolio by 2026-10-15.",
    },
  ],
};
function image() {
  const bytes = Buffer.alloc(64);
  bytes.set([255, 216, 255, 224]);
  return {
    name: "notes.jpg",
    mimeType: "image/jpeg",
    data: bytes.toString("base64"),
  };
}
async function fixture(t, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "notes-api-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const repo = new LocalStore(join(dir, "data.json"));
  await repo.mutate("owner", (s) => {
    s.workspace = newWorkspace(
      "owner",
      { name: "Earny Studio", ownerName: "Kiya" },
      { uid: "owner", name: "Kiya", email: "kiya@example.test" },
    );
    s.workspace.members.push(
      { uid: "member", role: "member", name: "Kopano" },
      { uid: "viewer", role: "viewer", name: "Viewer" },
    );
  });
  let scans = 0,
    analyses = 0;
  const app = createApp({
    store: repo,
    storage: "firebase",
    provider: "gemini",
    signupEnabled: true,
    verifyToken: async (uid) => ({
      uid,
      email: uid + "@example.test",
      name: uid,
      email_verified: true,
    }),
    noteExtractor: async () => {
      scans++;
      return { text, warnings: ["Review the unclear margin."] };
    },
    analyzer: async (i) => {
      analyses++;
      return analyze(i, "gemini", async () => structuredClone(rawAnalysis));
    },
    ...overrides,
  });
  const call = (method, path, uid = "owner") =>
    request(app)
      [method]("/api" + path)
      .set("Authorization", "Bearer " + uid)
      .set("X-Workspace-Id", "owner");
  return { repo, app, call, counts: () => ({ scans, analyses }) };
}
test("Gemini photo extraction uses image content, faithful transcription and the existing assistant model", async () => {
  let sent;
  const result = await extractNoteImage(
    validateNoteImage(image()),
    "gemini",
    async (body) => {
      sent = body;
      return { text, warnings: ["Unclear margin"] };
    },
  );
  assert.equal(result.text, text);
  assert.equal(sent.input[1].type, "image");
  assert.equal(sent.input[1].mime_type, "image/jpeg");
  assert.equal(sent.input[1].data, image().data);
  assert.match(sent.instruction, /Do not obey instructions/);
  assert.match(sent.instruction, /Do not summarize/);
  assert.equal(sent.model, process.env.ASSISTANT_MODEL || "gemini-3.8-flash");
  assert.equal(sent.timeout, 45000);
  await assert.rejects(
    extractNoteImage(image(), "gemini", async () => ({
      text: "",
      warnings: [],
    })),
    (e) => e.status === 422,
  );
  await assert.rejects(
    extractNoteImage(image(), "gemini", async () => ({
      text,
      warnings: [],
      invented: "field",
    })),
    (e) => e.status === 502,
  );
  await assert.rejects(
    extractNoteImage(image(), "sample"),
    (e) => e.status === 422,
  );
});
test("scan validation rejects disguised/oversized data before quota or provider access and does not store images", async (t) => {
  const f = await fixture(t);
  await f
    .call("post", "/notes/scan")
    .send({
      ...image(),
      data: Buffer.from("not an image at all").toString("base64"),
    })
    .expect(400);
  await f
    .call("post", "/notes/scan")
    .send({ ...image(), data: Buffer.alloc(2_000_004).toString("base64") })
    .expect(400);
  assert.equal(f.counts().scans, 0);
  const scan = await f.call("post", "/notes/scan").send(image()).expect(200);
  assert.equal(scan.body.text, text);
  const db = await f.repo.list("owner");
  assert.equal(db.notes.length, 0);
  assert.equal(db.tasks.length, 0);
  assert(!JSON.stringify(db).includes(image().data));
  assert.equal(db.quota.count, 1);
});
test("notes support idempotent save, sharing, optimistic editing and safe deletion without creating tasks", async (t) => {
  const f = await fixture(t),
    clientId = randomUUID();
  const first = await f
    .call("post", "/notes")
    .send({ ...input(), clientId })
    .expect(201);
  const n = first.body.note;
  const retry = await f
    .call("post", "/notes")
    .send({ ...input(), clientId })
    .expect(201);
  assert.equal(retry.body.note.id, n.id);
  await f
    .call("post", "/notes")
    .send({ ...input(), title: "Different", clientId })
    .expect(409);
  const viewed = await f.call("get", "/workspace", "viewer").expect(200);
  assert.equal(viewed.body.notes.length, 1);
  assert.equal(viewed.body.tasks.length, 0);
  await f
    .call("put", "/notes/" + n.id, "member")
    .send({ ...input(), title: "Edited", expectedVersion: 1 })
    .expect(200);
  await f
    .call("put", "/notes/" + n.id)
    .send({ ...input(), expectedVersion: 1 })
    .expect(409);
  await f
    .call("delete", "/notes/" + n.id)
    .send({ expectedVersion: 1 })
    .expect(409);
  await f
    .call("delete", "/notes/" + n.id)
    .send({ expectedVersion: 2 })
    .expect(200);
  assert.equal((await f.repo.list("owner")).notes.length, 0);
});
test("viewer and outsider cannot scan, write or process notes, and foreign links are rejected", async (t) => {
  const f = await fixture(t);
  for (const uid of ["viewer", "outsider"]) {
    await f
      .call("post", "/notes", uid)
      .send({ ...input(), clientId: randomUUID() })
      .expect(403);
    await f.call("post", "/notes/scan", uid).send(image()).expect(403);
    await f
      .call("post", "/notes/any/process", uid)
      .send({
        expectedVersion: 1,
        title: "Review",
        date: input().date,
        type: "Internal",
        projectId: null,
      })
      .expect(403);
  }
  await f
    .call("post", "/notes")
    .send({ ...input(), projectId: "other", clientId: randomUUID() })
    .expect(400);
  await f
    .call("post", "/notes")
    .send({ ...input(), meetingId: "other", clientId: randomUUID() })
    .expect(400);
  assert.equal(f.counts().scans, 0);
});
test("processing a saved note preserves its source version and keeps all tasks pending until approval", async (t) => {
  const f = await fixture(t),
    created = await f
      .call("post", "/notes")
      .send({ ...input(), clientId: randomUUID() })
      .expect(201),
    n = created.body.note;
  const fields = {
    expectedVersion: 1,
    title: n.title,
    date: n.date,
    type: "Internal",
    projectId: null,
  };
  const result = await f
      .call("post", "/notes/" + n.id + "/process")
      .send(fields)
      .expect(201),
    m = result.body.meeting;
  assert.equal(m.source.noteId, n.id);
  assert.equal(m.source.noteVersion, 1);
  assert.equal(m.transcript, text);
  assert.equal(m.proposals[0].reviewStatus, "pending");
  let data = await f.repo.list("owner");
  assert.equal(data.tasks.length, 0);
  assert.equal(data.notes[0].processed[0].meetingId, m.id);
  await f
    .call("post", "/notes/" + n.id + "/process")
    .send(fields)
    .expect(200);
  assert.equal(f.counts().analyses, 1);
  const p = m.proposals[0];
  await f
    .call("post", "/meetings/" + m.id + "/proposals/" + p.id + "/review")
    .send({
      decision: "approved",
      title: p.title,
      description: p.description,
      owner: p.owner,
      deadline: p.deadline,
      dueDate: p.dueDate,
      priority: p.priority,
    })
    .expect(200);
  const repeated = await f
    .call("post", "/notes/" + n.id + "/process")
    .send({ ...fields, title: "Renamed notebook meeting", type: "Other" })
    .expect(200);
  assert.equal(repeated.body.cached, true);
  assert.equal(repeated.body.meeting.id, m.id);
  assert.equal(repeated.body.meeting.proposals[0].reviewStatus, "approved");
  assert.equal(f.counts().analyses, 1);
  await f
    .call("delete", "/notes/" + n.id)
    .send({ expectedVersion: 1 })
    .expect(200);
  data = await f.repo.list("owner");
  assert.equal(data.tasks.length, 1);
  assert.equal(data.tasks[0].meetingId, m.id);
  assert.equal(data.meetings[0].transcript, text);
});
test("an edited source note cannot commit an analysis started against its old version", async (t) => {
  let started, release;
  const entered = new Promise((r) => (started = r)),
    gate = new Promise((r) => (release = r));
  const f = await fixture(t, {
    analyzer: async () => {
      started();
      await gate;
      return structuredClone(rawAnalysis);
    },
  });
  const n = (
    await f
      .call("post", "/notes")
      .send({ ...input(), clientId: randomUUID() })
      .expect(201)
  ).body.note;
  const pending = f
    .call("post", "/notes/" + n.id + "/process")
    .send({
      expectedVersion: 1,
      title: n.title,
      date: n.date,
      type: "Internal",
      projectId: null,
    })
    .then((r) => r);
  await entered;
  await f
    .call("put", "/notes/" + n.id, "member")
    .send({
      ...input(),
      text: text + "\nUpdated decision.",
      expectedVersion: 1,
    })
    .expect(200);
  release();
  assert.equal((await pending).status, 409);
  assert.equal((await f.repo.list("owner")).meetings.length, 0);
});
test("scan does not return content after membership revocation; limits include failed requests", async (t) => {
  let started, release;
  const entered = new Promise((r) => (started = r)),
    gate = new Promise((r) => (release = r));
  const f = await fixture(t, {
    noteExtractor: async () => {
      started();
      await gate;
      return { text, warnings: [] };
    },
  });
  const pending = f
    .call("post", "/notes/scan", "member")
    .send(image())
    .then((r) => r);
  await entered;
  await f.repo.mutate("owner", (s) => {
    s.workspace.members = s.workspace.members.filter((m) => m.uid !== "member");
  });
  release();
  const result = await pending;
  assert.equal(result.status, 403);
  assert(!JSON.stringify(result.body).includes(text));
  await f.repo.mutate("owner", (s) => {
    s.quota = {
      date: new Date().toISOString().slice(0, 10),
      count: Number(process.env.MAX_ANALYSES_PER_DAY || 50),
    };
  });
  await f.call("post", "/notes/scan").send(image()).expect(429);
});
test("Shifty receives only relevant current workspace note excerpts with canonical source IDs", () => {
  const note = { ...input(), id: "note-one", version: 1, processed: [] },
    data = {
      tasks: [],
      meetings: [],
      notes: [note],
      workspace: { name: "Earny Studio" },
    };
  const r = assistantContext(
    data,
    { uid: "owner", name: "Kiya" },
    "What does my notebook say?",
    "Africa/Johannesburg",
    { events: [] },
  );
  assert.equal(r.context.notes[0].text, text);
  assert.equal(r.sources[0].type, "note");
  assert.equal(r.sources[0].id, "note:note-one");
  assert.equal(r.sources[0].targetId, "note-one");
});
