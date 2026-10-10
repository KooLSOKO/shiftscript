import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { invitationOrigin } from "../server/invitation-email.js";
import { sampleTranscript } from "../server/analyze.js";
const identities = {
  soko: {
    uid: "soko",
    email: "soko@example.test",
    name: "Victor <Soko>",
    email_verified: true,
  },
  kopano: {
    uid: "kopano",
    email: "kopano@example.test",
    name: "Kopano",
    email_verified: true,
  },
  stranger: {
    uid: "stranger",
    email: "stranger@example.test",
    name: "Stranger",
    email_verified: true,
  },
};
const call = (app, method, path, uid = "soko") =>
  request(app)
    [method]("/api" + path)
    .set("Authorization", "Bearer " + uid)
    .set("X-Workspace-Id", "soko");
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "shift-invite-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new LocalStore(join(directory, "workspace.json"));
  const emails = [];
  const mailer = {
    ready: true,
    send: async (recipients, message) => {
      emails.push({ recipients, message });
      return { accepted: recipients, rejected: [] };
    },
  };
  const app = createApp({
    storage: "firebase",
    provider: "sample",
    signupEnabled: true,
    store,
    appUrl: "https://shiftscript.earny.co.za",
    verifyToken: async (token) => identities[token],
    mailer,
    ...options,
  });
  await call(app, "post", "/workspace")
    .send({ name: "Earny <Studio>", ownerName: "Victor Soko" })
    .expect(201);
  const create = async (email = "kopano@example.test", body = {}) =>
    (
      await call(app, "post", "/members/invitations")
        .send({ email, role: "member", ...body })
        .expect(201)
    ).body.invitation;
  return { app, store, mailer, emails, create };
}
test("invitation creation retries are idempotent; email target and join link are server-owned", async (t) => {
  const f = await fixture(t);
  const clientId = randomUUID();
  const invite = await f.create("  KOPANO@example.test  ", { clientId });
  const again = await f.create("kopano@example.test", { clientId });
  assert.equal(invite.id, again.id);
  assert(
    Date.parse(invite.expiresAt) - Date.parse(invite.createdAt) >=
      7 * 86400000 - 1000,
  );
  await call(f.app, "post", "/members/invitations")
    .send({ email: "different@example.test", role: "member", clientId })
    .expect(409);
  const path = `/members/invitations/${invite.id}/email`;
  const body = { requestId: randomUUID() };
  await call(f.app, "post", path)
    .send({ ...body, recipients: ["stranger@example.test"] })
    .expect(400);
  const sent = await call(f.app, "post", path)
    .set("Origin", "https://evil.example")
    .set("X-Forwarded-Host", "evil.example")
    .send(body)
    .expect(200);
  assert.equal(sent.body.send.status, "accepted");
  await call(f.app, "post", path).send(body).expect(200);
  assert.equal(f.emails.length, 1);
  assert.deepEqual(f.emails[0].recipients, ["kopano@example.test"]);
  const message = f.emails[0].message;
  assert(
    message.text.includes(
      `https://shiftscript.earny.co.za/?workspaceInvite=soko&invite=${invite.id}`,
    ),
  );
  assert(message.text.includes("Sign up or sign in using kopano@example.test"));
  assert(!message.html.includes("<Studio>"));
  assert(message.html.includes("&lt;Studio&gt;"));
  assert(!message.html.includes("evil.example"));
  await call(f.app, "post", path).send({ requestId: randomUUID() }).expect(429);
  await call(
    f.app,
    "post",
    `/workspaces/soko/invitations/${invite.id}/accept`,
    "stranger",
  )
    .send({})
    .expect(404);
  await call(
    f.app,
    "post",
    `/workspaces/soko/invitations/${invite.id}/accept`,
    "kopano",
  )
    .send({})
    .expect(200);
  const second = await f.create("next@example.test");
  await call(f.app, "post", `/members/invitations/${second.id}/email`, "kopano")
    .send({ requestId: randomUUID() })
    .expect(403);
});
test("expired invitations disappear from recipient catalog and cannot join or send; recreation gets a new link", async (t) => {
  const f = await fixture(t),
    invite = await f.create();
  await f.store.mutate("soko", (s) => {
    s.workspace.invites[0].expiresAt = "2020-01-01T00:00:00Z";
  });
  assert.equal(
    (await call(f.app, "get", "/workspaces", "kopano")).body.invitations.length,
    0,
  );
  await call(
    f.app,
    "post",
    `/workspaces/soko/invitations/${invite.id}/accept`,
    "kopano",
  )
    .send({})
    .expect(410);
  await call(f.app, "post", `/members/invitations/${invite.id}/email`)
    .send({ requestId: randomUUID() })
    .expect(410);
  const replacement = await f.create();
  assert.notEqual(replacement.id, invite.id);
  assert.equal((await f.store.list("soko")).workspace.invites.length, 1);
  assert.equal(f.emails.length, 0);
});
test("uncertain sends retain invitations and cannot silently replay; rejected recipients are reported", async (t) => {
  const f = await fixture(t),
    invite = await f.create();
  let attempts = 0;
  f.mailer.send = async () => {
    attempts++;
    throw new Error("private SMTP diagnostic");
  };
  const path = `/members/invitations/${invite.id}/email`,
    body = { requestId: randomUUID() };
  const failure = await call(f.app, "post", path).send(body).expect(502);
  assert(!failure.body.error.includes("private SMTP"));
  await call(f.app, "post", path).send(body).expect(409);
  assert.equal(attempts, 1);
  assert.equal(
    (await f.store.list("soko")).workspace.invites[0].emailSends[0].status,
    "uncertain",
  );
  await f.store.mutate("soko", (s) => {
    s.workspace.invites[0].emailSends[0].at = new Date(
      Date.now() - 120000,
    ).toISOString();
  });
  f.mailer.send = async (recipients) => ({
    accepted: [],
    rejected: recipients,
  });
  const rejected = await call(f.app, "post", path)
    .send({ requestId: randomUUID() })
    .expect(200);
  assert.equal(rejected.body.send.status, "rejected");
});
test("invitation mail daily quota is separate and survives AI requests; missing config keeps copy links usable", async (t) => {
  const f = await fixture(t),
    invite = await f.create();
  await f.store.mutate("soko", (s) => {
    s.quota.invitationMail = {
      date: new Date().toISOString().slice(0, 10),
      count: 20,
    };
  });
  await call(f.app, "post", "/meetings")
    .send({
      title: "Daily quota review",
      type: "Planning",
      date: "2026-10-10",
      transcript: sampleTranscript,
    })
    .expect(201);
  assert.equal((await f.store.list("soko")).quota.invitationMail.count, 20);
  await call(f.app, "post", `/members/invitations/${invite.id}/email`)
    .send({ requestId: randomUUID() })
    .expect(429);
  f.mailer.ready = false;
  await call(f.app, "post", `/members/invitations/${invite.id}/email`)
    .send({ requestId: randomUUID() })
    .expect(503);
  assert.equal((await f.store.list("soko")).workspace.invites[0].id, invite.id);
});
test("revocation during SMTP preserves mail outcome without reviving the invitation", async (t) => {
  const f = await fixture(t),
    invite = await f.create();
  let release, started;
  const sending = new Promise((resolve) => {
    started = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  f.mailer.send = async (recipients) => {
    started();
    await gate;
    return { accepted: recipients, rejected: [] };
  };
  const response = call(
    f.app,
    "post",
    `/members/invitations/${invite.id}/email`,
  )
    .send({ requestId: randomUUID() })
    .then((value) => value);
  await sending;
  await call(f.app, "delete", `/members/invitations/${invite.id}`).expect(200);
  release();
  assert.equal((await response).status, 200);
  assert.equal((await f.store.list("soko")).workspace.invites.length, 0);
  await call(
    f.app,
    "post",
    `/workspaces/soko/invitations/${invite.id}/accept`,
    "kopano",
  )
    .send({})
    .expect(404);
});
test("invitation URLs use configured HTTPS origins, with loopback exceptions for development", () => {
  assert.equal(
    invitationOrigin("https://shiftscript.earny.co.za/api/google/callback"),
    "https://shiftscript.earny.co.za",
  );
  assert.equal(
    invitationOrigin("http://127.0.0.1:5173"),
    "http://127.0.0.1:5173",
  );
  for (const value of [
    "http://earny.co.za",
    "javascript:alert(1)",
    "https://user:password@earny.co.za",
    "garbage",
  ])
    assert.equal(invitationOrigin(value), null);
});
