import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server/app.js";
import { LocalStore, FirebaseStore } from "../server/store.js";
import { sampleTranscript } from "../server/analyze.js";

export class AccountStore {
  constructor() {
    this.users = new Map();
  }
  async list(uid) {
    return structuredClone(
      this.users.get(uid) || {
        meetings: [],
        tasks: [],
        quota: {},
        workspace: null,
      },
    );
  }
  async mutate(uid, operation) {
    const s = await this.list(uid),
      result = operation(s);
    this.users.set(uid, s);
    return result;
  }
}
export const verify = async (token) => {
  if (!["soko", "kopano"].includes(token))
    throw new Error("Invalid test token");
  return { uid: token, email: `${token}@example.test` };
};
const input = { name: "Earny Studio", ownerName: "Victor Soko" };
const meeting = {
  title: "Portfolio review",
  date: "2026-10-09",
  type: "Project review",
  transcript: sampleTranscript,
};
const accountApp = (options) =>
  createApp({
    store: new AccountStore(),
    storage: "firebase",
    provider: "sample",
    signupEnabled: true,
    verifyToken: verify,
    ...options,
  });
const as = (app, method, path, uid = "soko") =>
  request(app)[method](path).set("Authorization", `Bearer ${uid}`);

test("signup access is configured by the server; workspace routes require verified tokens", async () => {
  const app = accountApp();
  assert.equal(
    (await request(app).get("/api/config")).body.signupEnabled,
    true,
  );
  await request(app).post("/api/workspace").send(input).expect(401);
  await as(app, "post", "/api/workspace", "invalid").send(input).expect(401);
  const privateApp = accountApp({ signupEnabled: false });
  assert.equal(
    (await request(privateApp).get("/api/config")).body.signupEnabled,
    false,
  );
});

test("workspace creation and rename preserve meetings and isolate different accounts", async () => {
  const app = accountApp();
  await as(app, "post", "/api/meetings").send(meeting).expect(201);
  assert.equal((await as(app, "get", "/api/workspace")).body.workspace, null);
  const created = await as(app, "post", "/api/workspace")
    .send(input)
    .expect(201);
  assert.equal(created.body.workspace.ownerUid, "soko");
  await as(app, "post", "/api/workspace").send(input).expect(409);
  await as(app, "patch", "/api/workspace")
    .send({ name: "Soko Studio", ownerName: "Soko" })
    .expect(200);
  const own = (await as(app, "get", "/api/workspace")).body;
  assert.equal(own.workspace.name, "Soko Studio");
  assert.equal(own.meetings.length, 1);
  assert.equal(own.workspace.createdAt, created.body.workspace.createdAt);
  const other = (await as(app, "get", "/api/workspace", "kopano")).body;
  assert.equal(other.workspace, null);
  assert.deepEqual(other.meetings, []);
  await as(app, "patch", "/api/workspace", "kopano").send(input).expect(404);
  await as(app, "post", "/api/workspace", "kopano")
    .send({ name: "Portfolio", ownerName: "Kopano" })
    .expect(201);
  assert.equal(
    (await as(app, "get", "/api/workspace")).body.workspace.name,
    "Soko Studio",
  );
});

test("clients cannot choose an owner uid or another user's workspace id", async () => {
  const app = accountApp();
  for (const payload of [
    { ...input, ownerUid: "kopano" },
    { ...input, id: "kopano" },
    { ...input, name: " " },
    { ...input, ownerName: "a" },
    { ...input, name: "a".repeat(81) },
  ]) {
    await as(app, "post", "/api/workspace").send(payload).expect(400);
  }
  assert.equal((await as(app, "get", "/api/workspace")).body.workspace, null);
  await as(app, "post", "/api/workspace").send(input).expect(201);
  await as(app, "patch", "/api/workspace")
    .send({ ...input, ownerUid: "kopano" })
    .expect(400);
  assert.equal(
    (await as(app, "get", "/api/workspace")).body.workspace.ownerUid,
    "soko",
  );
});

test("private mode retains the email allowlist and public mode enables new accounts", async (t) => {
  const previous = process.env.ALLOWED_EMAILS;
  t.after(() => {
    if (previous === undefined) delete process.env.ALLOWED_EMAILS;
    else process.env.ALLOWED_EMAILS = previous;
  });
  process.env.ALLOWED_EMAILS = "soko@example.test";
  await as(
    accountApp({ signupEnabled: false }),
    "get",
    "/api/workspace",
    "kopano",
  ).expect(403);
  await as(accountApp(), "get", "/api/workspace", "kopano").expect(200);
});

test("workspace metadata persists after restarting the local store", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "shiftscript-account-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "workspace.json");
  const app = createApp({
    storage: "local",
    provider: "sample",
    store: new LocalStore(path),
  });
  await request(app).post("/api/workspace").send(input).expect(201);
  await request(app).post("/api/meetings").send(meeting).expect(201);
  const reopened = createApp({
    storage: "local",
    provider: "sample",
    store: new LocalStore(path),
  });
  const data = (await request(reopened).get("/api/workspace").expect(200)).body;
  assert.equal(data.workspace.name, "Earny Studio");
  assert.equal(data.meetings.length, 1);
});

test("Firestore workspace metadata merges without overwriting an existing quota or meetings", async () => {
  const docs = new Map([
    ["workspaces/soko", { quota: { date: "2026-10-09", count: 4 } }],
    ["workspaces/soko/meetings/old", { id: "old", title: "Existing meeting" }],
  ]);
  const doc = (path) => ({
    path,
    collection: (name) => collection(`${path}/${name}`),
    get: async () => ({ data: () => docs.get(path) }),
  });
  const collection = (path) => ({
    path,
    doc: (id) => doc(`${path}/${id}`),
    get: async () => ({
      docs: [...docs.entries()]
        .filter(
          ([key]) =>
            key.startsWith(path + "/") &&
            !key.slice(path.length + 1).includes("/"),
        )
        .map(([, value]) => ({ data: () => value })),
    }),
  });
  const db = {
    collection,
    runTransaction: async (fn) =>
      fn({
        get: (ref) => ref.get(),
        set: (ref, data, options) =>
          docs.set(
            ref.path,
            options?.merge ? { ...docs.get(ref.path), ...data } : data,
          ),
      }),
  };
  const store = new FirebaseStore(() => ({ db }));
  assert.equal((await store.list("soko")).workspace, null);
  await store.mutate("soko", (s) => {
    s.workspace = { ...input, id: "soko", ownerUid: "soko" };
  });
  assert.equal((await store.list("soko")).workspace.name, "Earny Studio");
  assert.equal((await store.list("soko")).meetings.length, 1);
  assert.equal(docs.get("workspaces/soko").quota.count, 4);
  await store.mutate("soko", (s) => {
    s.quota.count += 1;
  });
  assert.equal(docs.get("workspaces/soko").workspace.ownerName, "Victor Soko");
  assert.equal((await store.list("kopano")).workspace, null);
  assert.deepEqual((await store.list("kopano")).meetings, []);
});
