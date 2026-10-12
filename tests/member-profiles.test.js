import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { mouseDirection } from "../src/features/source-direction.js";
const people = Object.fromEntries(
  ["soko", "kopano", "outside", "unverified"].map((uid) => [
    uid,
    {
      uid,
      name: uid === "kopano" ? "Kopano" : uid,
      email: uid + "@example.test",
      email_verified: uid !== "unverified",
    },
  ]),
);
function call(app, method, path, who = "soko", workspace = "soko") {
  return request(app)
    [method]("/api" + path)
    .set("Authorization", "Bearer " + who)
    .set("X-Workspace-Id", workspace);
}
async function fixture(t, lookup) {
  const dir = await mkdtemp(join(tmpdir(), "shift-member-profile-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new LocalStore(join(dir, "db.json"));
  const identities = Object.fromEntries(
    Object.entries(people).map(([uid, p]) => [
      uid,
      {
        uid,
        displayName: p.name,
        email: p.email,
        emailVerified: p.email_verified,
      },
    ]),
  );
  const app = createApp({
    store,
    storage: "firebase",
    provider: "sample",
    signupEnabled: true,
    verifyToken: async (uid) => people[uid],
    memberIdentity: lookup || (async (uid) => identities[uid]),
  });
  await call(app, "post", "/workspace")
    .send({ name: "Earny Studio", ownerName: "Victor Soko" })
    .expect(201);
  await call(app, "post", "/workspace", "kopano", "kopano")
    .send({ name: "Private studio", ownerName: "Kopano" })
    .expect(201);
  const invite = (
    await call(app, "post", "/members/invitations")
      .send({ email: people.kopano.email, role: "viewer" })
      .expect(201)
  ).body.invitation;
  return { store, app, identities, invite };
}
async function accept(app, invite) {
  await call(
    app,
    "post",
    `/workspaces/soko/invitations/${invite.id}/accept`,
    "kopano",
  ).expect(200);
}
test("member profiles require accepted shared membership, omit private data, and count only shared tasks", async (t) => {
  const { app, store, invite } = await fixture(t);
  await call(app, "patch", "/profile", "kopano", "kopano")
    .send({
      name: "Kopano Mokoena",
      bio: "I build useful portfolios.",
      aliases: ["KM"],
    })
    .expect(200);
  await store.mutateProfile("kopano", (p) => {
    p.calendarMarks = [{ secret: "private-calendar" }];
    p.assistant = { secret: "private-chat" };
    p.savedViews = [{ secret: "private-filter" }];
    p.preferences = { emailReminders: true };
  });
  await call(app, "get", "/members/kopano/profile").expect(404);
  await call(app, "get", "/members/soko/profile", "kopano").expect(403);
  await accept(app, invite);
  await store.mutate("soko", (s) => {
    s.tasks.push(
      { id: "a", ownerUid: "kopano", owner: "Kopano", status: "To Do" },
      { id: "b", ownerUid: "kopano", owner: "Kopano", status: "Completed" },
      { id: "c", ownerUid: "soko", owner: "KM", status: "To Do" },
      { id: "d", owner: "KM", status: "To Do" },
    );
  });
  await store.mutate("kopano", (s) => {
    s.tasks.push({ id: "secret", ownerUid: "kopano", status: "To Do" });
  });
  const profile = (await call(app, "get", "/members/kopano/profile")).body
    .profile;
  assert.equal(profile.name, "Kopano Mokoena");
  assert.equal(profile.bio, "I build useful portfolios.");
  assert.equal(profile.emailVerified, true);
  assert.deepEqual(profile.stats, { active: 2, completed: 1 });
  assert.deepEqual(
    Object.keys(profile).sort(),
    [
      "uid",
      "name",
      "bio",
      "avatar",
      "email",
      "role",
      "joinedAt",
      "workspace",
      "emailVerified",
      "verificationAvailable",
      "stats",
    ].sort(),
  );
  await call(app, "get", "/members/soko/profile", "kopano").expect(200); // Viewer can read profiles.
  await call(app, "get", "/members/kopano/profile", "outside").expect(403);
  await call(app, "get", "/members/outside/profile").expect(404);
  await call(app, "delete", "/members/kopano").expect(200);
  await call(app, "get", "/members/kopano/profile").expect(404);
  await call(app, "get", "/members/soko/profile", "kopano").expect(403);
});
test("verification comes from Firebase identity, not editable/stale stored profile or role", async (t) => {
  const { app, store, invite, identities } = await fixture(t);
  await accept(app, invite);
  await call(app, "patch", "/profile", "unverified", "unverified")
    .send({ bio: "Designer", emailVerified: true })
    .expect(400);
  await store.mutateProfile("unverified", (p) => {
    p.emailVerified = true;
  });
  assert.equal(
    (await call(app, "get", "/profile", "unverified", "unverified")).body
      .profile.emailVerified,
    false,
  );
  await store.mutateProfile("kopano", (p) => {
    p.emailVerified = true;
  });
  identities.kopano.emailVerified = false;
  assert.equal(
    (await call(app, "get", "/members/kopano/profile")).body.profile
      .emailVerified,
    false,
  );
  identities.kopano.emailVerified = true;
  identities.kopano.email = "different@example.test";
  assert.equal(
    (await call(app, "get", "/members/kopano/profile")).body.profile
      .emailVerified,
    false,
  );
  identities.kopano.email = people.kopano.email;
  assert.equal(
    (await call(app, "get", "/members/kopano/profile")).body.profile
      .emailVerified,
    true,
  );
  await call(app, "patch", "/profile")
    .send({ bio: "a".repeat(241) })
    .expect(400);
});
test("identity lookup failure never creates a badge; membership revocation during lookup prevents disclosure", async (t) => {
  let lookup = async () => {
    throw Error("Firebase unavailable");
  };
  const { app, store, invite } = await fixture(t, (uid) => lookup(uid));
  await accept(app, invite);
  const profile = (await call(app, "get", "/members/kopano/profile")).body
    .profile;
  assert.equal(profile.emailVerified, false);
  assert.equal(profile.verificationAvailable, false);
  lookup = async () => {
    await store.mutate("soko", (s) => {
      s.workspace.members = s.workspace.members.filter(
        (m) => m.uid !== "kopano",
      );
    });
    return { emailVerified: true, email: people.kopano.email };
  };
  await call(app, "get", "/members/kopano/profile").expect(404);
});
test("desktop dial ignores tiny motion, keeps diagonal jitter stable, and accepts deliberate direction changes", () => {
  assert.equal(mouseDirection(3, 4), null);
  assert.equal(mouseDirection(40, 0), "voice");
  assert.equal(mouseDirection(-40, 0), "previous");
  assert.equal(mouseDirection(0, -40), "text");
  assert.equal(mouseDirection(0, 40), "google");
  assert.equal(mouseDirection(29, 31, "voice"), "voice");
  assert.equal(mouseDirection(28, 55, "voice"), "google");
  assert.equal(mouseDirection(-40, 2, "voice"), "previous");
  assert.equal(mouseDirection(0, 0, "previous"), null);
});
