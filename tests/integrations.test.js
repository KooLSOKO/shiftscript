import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { IntegrationVault } from "../server/integration-vault.js";
import {
  GoogleIntegration,
  documentId,
  extractDocument,
} from "../server/google.js";
import { RecapMailer, recap } from "../server/recap-email.js";
import { LocalStore } from "../server/store.js";
import { createApp } from "../server/app.js";
import { MAX_TRANSCRIPT_CHARS } from "../shared/limits.js";
const env = {
  GOOGLE_CLIENT_ID: "mock-client",
  GOOGLE_CLIENT_SECRET: "mock-secret",
  GOOGLE_REDIRECT_URI: "https://shiftscript.earny.co.za/api/google/callback",
};
const text =
  "Kiya: Kopano, please publish the portfolio by tomorrow.\nKopano: I will publish the portfolio by tomorrow and send you the link.";
const scope =
  "https://www.googleapis.com/auth/meetings.space.readonly https://www.googleapis.com/auth/documents.readonly";
const actor = (uid) => ({
  uid,
  email: uid + "@example.test",
  name: uid,
  email_verified: true,
});
const call = (app, method, path, uid = "kiya", workspace = "kiya") =>
  request(app)
    [method]("/api" + path)
    .set("Authorization", "Bearer " + uid)
    .set("X-Workspace-Id", workspace);
async function fixture(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "shift-integrations-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const vault = new IntegrationVault({
    path: join(dir, "vault.json"),
    secret: "12".repeat(32),
  });
  const store = new LocalStore(join(dir, "workspace.json")),
    calls = [],
    emails = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    const u = new URL(url);
    let body;
    if (u.hostname === "oauth2.googleapis.com")
      body = {
        access_token: "access-" + new URLSearchParams(init.body).get("code"),
        refresh_token: "refresh-private-value",
        expires_in: 3600,
        scope,
      };
    else if (u.pathname.startsWith("/v1/documents/"))
      body = {
        title: "Portfolio notes",
        tabs: [
          {
            documentTab: {
              body: {
                content: [
                  { paragraph: { elements: [{ textRun: { content: text } }] } },
                ],
              },
            },
          },
        ],
      };
    else if (u.pathname === "/v2/conferenceRecords")
      body = {
        conferenceRecords: [
          {
            name: "conferenceRecords/meeting1",
            startTime: "2026-10-10T08:00:00Z",
            endTime: "2026-10-10T08:30:00Z",
          },
        ],
        nextPageToken: "next-mock-page",
      };
    else if (u.pathname.endsWith("/smartNotes"))
      body = {
        smartNotes: [
          {
            name: "conferenceRecords/meeting1/smartNotes/notes1",
            state: "FILE_GENERATED",
          },
        ],
      };
    else if (u.pathname.endsWith("/transcripts"))
      body = {
        transcripts: [
          {
            name: "conferenceRecords/meeting1/transcripts/transcript1",
            state: "FILE_GENERATED",
          },
        ],
      };
    else if (u.pathname.endsWith("/notes1"))
      body = {
        state: "FILE_GENERATED",
        docsDestination: { document: "portfolio-notes-document" },
      };
    else if (u.pathname.endsWith("/transcript1"))
      body = { state: "FILE_GENERATED" };
    else if (u.pathname.endsWith("/participants"))
      body = {
        participants: [
          {
            name: "conferenceRecords/meeting1/participants/kiya",
            signedinUser: { displayName: "Kiya" },
          },
        ],
      };
    else if (u.pathname.endsWith("/entries")) {
      body = u.searchParams.has("pageToken")
        ? {
            transcriptEntries: [
              {
                participant: "conferenceRecords/meeting1/participants/unknown",
                text: "Yes, I will publish the website tomorrow.",
                startTime: "2026-10-10T08:01:00Z",
              },
            ],
          }
        : {
            transcriptEntries: [
              {
                participant: "conferenceRecords/meeting1/participants/kiya",
                text: "Please publish the portfolio by tomorrow.",
                startTime: "2026-10-10T08:00:00Z",
              },
            ],
            nextPageToken: "entries-page-2",
          };
    } else throw new Error("Unexpected mock request: " + u.pathname);
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const google = new GoogleIntegration({ vault, env, fetcher });
  const mailer = {
    ready: true,
    send: async (recipients, message) => {
      emails.push({ recipients, message });
      return { accepted: recipients, rejected: [] };
    },
  };
  const app = createApp({
    store,
    google,
    mailer,
    storage: "firebase",
    provider: "gemini",
    signupEnabled: true,
    verifyToken: async (uid) => actor(uid),
    analyzer: async (input) => {
      calls.push({ analysis: input });
      return {
        summary: "The team agreed to publish the portfolio.",
        discussionPoints: [],
        decisions: ["Publish the portfolio."],
        followUps: [],
        actions: [
          {
            title: "Publish portfolio",
            description: "Publish the reviewed website.",
            owner: "Kopano",
            deadline: "tomorrow",
            priority: "High",
            evidence: input.transcript.split("\n")[0],
          },
        ],
      };
    },
    ...options,
  });
  await call(app, "post", "/workspace")
    .send({ name: "Earny", ownerName: "Kiya" })
    .expect(201);
  return { dir, vault, store, google, app, calls, emails, mailer };
}
async function connect(app, uid = "kiya", workspace = "kiya") {
  const start = await call(
    app,
    "post",
    "/google/connect",
    uid,
    workspace,
  ).expect(200);
  const state = new URL(start.body.url).searchParams.get("state"),
    cookie = start.headers["set-cookie"][0].split(";")[0];
  const callback = await request(app)
    .get("/api/google/callback")
    .query({ state, code: "code-" + uid })
    .set("Cookie", cookie)
    .expect(303);
  assert.equal(
    callback.headers.location,
    env.GOOGLE_REDIRECT_URI.replace(
      "/api/google/callback",
      "/?google=connected",
    ),
  );
  return { state, cookie };
}
test("OAuth binds state to the browser, uses PKCE, expires, and rejects replay without exposing secrets", async (t) => {
  const f = await fixture(t),
    start = await call(f.app, "post", "/google/connect").expect(200),
    url = new URL(start.body.url);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert(!start.body.url.includes("mock-secret"));
  const state = url.searchParams.get("state"),
    cookie = start.headers["set-cookie"][0].split(";")[0];
  const bad = await request(f.app)
    .get("/api/google/callback")
    .query({ state, code: "code" })
    .set("Cookie", "shiftscript-google=wrong")
    .expect(303);
  assert(bad.headers.location.endsWith("google=error"));
  assert.equal(f.calls.length, 0);
  await request(f.app)
    .get("/api/google/callback")
    .query({ state, code: "code" })
    .set("Cookie", cookie)
    .expect(303)
    .expect("Location", /google=connected$/);
  await request(f.app)
    .get("/api/google/callback")
    .query({ state, code: "code" })
    .set("Cookie", cookie)
    .expect(303)
    .expect("Location", /google=error$/);
  assert.equal(f.calls.length, 1);
  const status = await call(f.app, "get", "/google/status").expect(200);
  assert.equal(status.body.connected, true);
  assert(!JSON.stringify(status.body).includes("access-"));
  const bytes = await readFile(join(f.dir, "vault.json"), "utf8");
  assert(!bytes.includes("refresh-private-value"));
  assert(!bytes.includes("code_verifier"));
  const attempt = await f.google.start("kiya");
  await f.vault.mutate("kiya", (s) => {
    s.states.forEach((v) => (v.expires = 1));
  });
  await assert.rejects(
    f.google.callback(
      { state: new URL(attempt.url).searchParams.get("state"), code: "unused" },
      attempt.binding,
    ),
    /expired|already used/,
  );
});
test("unconfigured integration remains optional and unauthenticated private endpoints are rejected", async (t) => {
  const f = await fixture(t);
  await request(f.app).get("/api/google/status").expect(401);
  const google = new GoogleIntegration({ env: {}, vault: f.vault });
  assert.equal(google.ready, false);
  assert.deepEqual(await google.status("kiya"), {
    ready: false,
    connected: false,
  });
  await assert.rejects(google.start("kiya"), /not configured/);
});
test("Docs extraction handles tables and child tabs, and link validation prevents arbitrary URL fetches", () => {
  const p = (content) => ({
    paragraph: { elements: [{ textRun: { content } }] },
  });
  const result = extractDocument({
    tabs: [
      {
        documentTab: {
          body: {
            content: [
              p("Parent"),
              {
                table: {
                  tableRows: [{ tableCells: [{ content: [p("Cell")] }] }],
                },
              },
            ],
          },
        },
        childTabs: [{ documentTab: { body: { content: [p("Child")] } } }],
      },
    ],
  });
  assert.match(result, /ParentCell/);
  assert.match(result, /Child/);
  assert.equal(
    documentId(
      "https://docs.google.com/document/d/portfolio-document/edit?x=y",
    ),
    "portfolio-document",
  );
  for (const url of [
    "http://docs.google.com/document/d/portfolio-document",
    "https://docs.google.com.evil.test/document/d/portfolio-document",
    "https://127.0.0.1/document/d/portfolio-document",
    "javascript:alert(1)",
  ])
    assert.throws(() => documentId(url));
});
test("Google preview/import keeps trusted source metadata, requires review and prevents client text or source tampering", async (t) => {
  const f = await fixture(t);
  await connect(f.app);
  const preview = (
    await call(f.app, "post", "/google/preview")
      .send({
        kind: "document",
        url: "https://docs.google.com/document/d/portfolio-notes-document/edit",
      })
      .expect(200)
  ).body;
  assert.equal(preview.transcript, text);
  assert.equal(preview.source.kind, "google-document");
  const body = {
    previewId: preview.previewId,
    title: "Portfolio review",
    date: "2026-10-10",
    type: "Project review",
    projectId: null,
  };
  await call(f.app, "post", "/google/import")
    .send({ ...body, transcript: "fabricated data" })
    .expect(400);
  const m = (await call(f.app, "post", "/google/import").send(body).expect(201))
    .body.meeting;
  assert.equal(m.transcript, text);
  assert.equal(m.source.documentId, "portfolio-notes-document");
  assert.equal(m.proposals[0].reviewStatus, "pending");
  assert.equal((await f.store.list("kiya")).tasks.length, 0);
  await call(f.app, "post", "/google/import").send(body).expect(200);
  assert.equal(f.calls.filter((c) => c.analysis).length, 1);
  await assert.rejects(
    f.google.imported("another-user", "kiya", preview.previewId),
    /another workspace|expired/,
  );
  await assert.rejects(
    f.google.imported("kiya", "other-workspace", preview.previewId),
    /another workspace|expired/,
  );
  await call(f.app, "delete", "/google/connection").expect(200);
  await call(f.app, "post", "/google/import").send(body).expect(409);
});
test("Meet pagination preserves speaker names and unknown speakers without inventing identities", async (t) => {
  const f = await fixture(t);
  await connect(f.app);
  const list = (await call(f.app, "get", "/google/meetings").expect(200)).body;
  assert.equal(list.cursor, "next-mock-page");
  const sources = (
    await call(
      f.app,
      "get",
      "/google/artifacts?name=conferenceRecords%2Fmeeting1",
    ).expect(200)
  ).body;
  assert.equal(sources.artifacts.length, 2);
  const p = await f.google.preview("kiya", "kiya", {
    kind: "artifact",
    name: "conferenceRecords/meeting1/transcripts/transcript1",
  });
  assert.match(p.transcript, /^Kiya: Please/);
  assert.match(p.transcript, /Unknown speaker 1: Yes/);
  assert.equal(p.source.kind, "google-transcript");
  const notes = await f.google.preview("kiya", "kiya", {
    kind: "artifact",
    name: "conferenceRecords/meeting1/smartNotes/notes1",
  });
  assert.equal(notes.source.kind, "google-notes");
  assert(f.calls.some((c) => c.url?.includes("pageToken=entries-page-2")));
  await assert.rejects(
    f.google.artifacts("kiya", "https://evil.test"),
    /Invalid/,
  );
});
test("expired previews, overlong documents and incomplete artifact generation are rejected", async (t) => {
  const f = await fixture(t);
  await connect(f.app);
  const p = await f.google.preview("kiya", "kiya", {
    kind: "document",
    url: "https://docs.google.com/document/d/portfolio-notes-document",
  });
  await f.vault.mutate("kiya", (s) => {
    s.previews[0].expires = 1;
  });
  await assert.rejects(
    f.google.imported("kiya", "kiya", p.previewId),
    /expired/,
  );
  f.google.fetcher = async () =>
    new Response(
      JSON.stringify({
        title: "Long",
        body: {
          content: [
            {
              paragraph: {
                elements: [
                  {
                    textRun: { content: "x".repeat(MAX_TRANSCRIPT_CHARS + 1) },
                  },
                ],
              },
            },
          ],
        },
      }),
    );
  await assert.rejects(
    f.google.preview("kiya", "kiya", {
      kind: "document",
      url: "https://docs.google.com/document/d/portfolio-notes-document",
    }),
    /100,000/,
  );
  f.google.fetcher = async () =>
    new Response(JSON.stringify({ state: "ENDED" }));
  await assert.rejects(
    f.google.preview("kiya", "kiya", {
      kind: "artifact",
      name: "conferenceRecords/meeting1/smartNotes/notes1",
    }),
    /still preparing/,
  );
});
test("long Unicode Google imports preserve all text and keep the encrypted preview vault bounded", async (t) => {
  const f = await fixture(t);
  await connect(f.app);
  const transcript = "界".repeat(MAX_TRANSCRIPT_CHARS);
  f.google.fetcher = async () =>
    new Response(
      JSON.stringify({
        title: "Long review",
        body: {
          content: [
            { paragraph: { elements: [{ textRun: { content: transcript } }] } },
          ],
        },
      }),
    );
  let latest;
  for (let i = 0; i < 4; i++)
    latest = await f.google.preview("kiya", "kiya", {
      kind: "document",
      url: "https://docs.google.com/document/d/portfolio-notes-document",
    });
  assert.equal(latest.transcript, transcript);
  assert.equal(
    (await f.google.imported("kiya", "kiya", latest.previewId)).transcript,
    transcript,
  );
  const saved = await f.vault.get("kiya");
  assert(
    saved.previews.length < 4,
    "Older previews are evicted before the Firestore document limit",
  );
  assert(Buffer.byteLength(f.vault.seal(saved), "utf8") < 900_000);
});
test("token refresh preserves encrypted connection identity, and upstream failures never disclose key strings", async (t) => {
  const f = await fixture(t);
  await connect(f.app);
  await f.vault.mutate("kiya", (s) => {
    s.connection.expires = 1;
  });
  assert.equal(await f.google.access("kiya"), "access-null");
  assert(
    f.calls.at(-1).init.body.get("refresh_token") === "refresh-private-value",
  );
  f.google.fetcher = async () =>
    new Response(JSON.stringify({ error: "mock-secret upstream details" }), {
      status: 403,
    });
  await assert.rejects(
    f.google.list("kiya"),
    (e) => e.status === 403 && !e.message.includes("mock-secret"),
  );
});
async function seedEmail(f) {
  await f.store.mutate("kiya", (s) => {
    s.workspace.members.push({
      uid: "viewer",
      email: "viewer@example.test",
      name: "Viewer",
      role: "viewer",
    });
    s.meetings.push({
      id: "email-meeting",
      title: "Portfolio <review>",
      date: "2026-10-10",
      type: "Planning",
      summary: "Kiya and Kopano agreed to publish the portfolio.",
      decisions: ["Publish <soon>."],
      followUps: ["Confirm the URL."],
      proposals: [
        { id: "approved", taskId: "approved-task", reviewStatus: "approved" },
        {
          id: "pending",
          reviewStatus: "pending",
          title: "Hidden pending proposal",
        },
      ],
      createdAt: new Date().toISOString(),
    });
    s.tasks.push({
      id: "approved-task",
      meetingId: "email-meeting",
      title: "Publish portfolio",
      description: "<script>must be escaped</script>",
      owner: "Kopano",
      priority: "High",
      status: "To Do",
      dueDate: "2026-10-11",
    });
  });
}
test("email previews include only approved tasks, escape HTML, enforce roles and recipient limits", async (t) => {
  const f = await fixture(t);
  await seedEmail(f);
  const preview = (
    await call(f.app, "get", "/meetings/email-meeting/email-preview").expect(
      200,
    )
  ).body;
  assert.equal(preview.approvedCount, 1);
  assert.equal(preview.pendingCount, 1);
  assert(!preview.text.includes("Hidden pending proposal"));
  const rendered = recap(await f.store.list("kiya"), "email-meeting");
  assert(!rendered.html.includes("<script>"));
  assert(rendered.html.includes("&lt;script&gt;"));
  await call(
    f.app,
    "get",
    "/meetings/email-meeting/email-preview",
    "viewer",
  ).expect(403);
  const body = {
    recipients: ["kopano@example.test"],
    requestId: randomUUID(),
    fingerprint: preview.fingerprint,
  };
  await call(f.app, "post", "/meetings/email-meeting/email", "viewer")
    .send(body)
    .expect(403);
  await call(f.app, "post", "/meetings/email-meeting/email")
    .send({ ...body, recipients: ["bad\r\nBcc: injected"] })
    .expect(400);
  await call(f.app, "post", "/meetings/email-meeting/email")
    .send({ ...body, recipients: Array(11).fill("kopano@example.test") })
    .expect(400);
  await call(f.app, "post", "/meetings/email-meeting/email")
    .send({ ...body, fingerprint: "00".repeat(32) })
    .expect(409);
  assert.equal(f.emails.length, 0);
  await call(f.app, "post", "/meetings/email-meeting/email")
    .send(body)
    .expect(200);
  await call(f.app, "post", "/meetings/email-meeting/email")
    .send(body)
    .expect(200);
  assert.equal(f.emails.length, 1);
  assert.equal(f.emails[0].message.fingerprint, preview.fingerprint);
});
test("uncertain SMTP outcomes are recorded and the same send cannot be repeated", async (t) => {
  const f = await fixture(t);
  await seedEmail(f);
  f.mailer.send = async () => {
    throw new Error("secret SMTP failure");
  };
  const p = (
    await call(f.app, "get", "/meetings/email-meeting/email-preview").expect(
      200,
    )
  ).body;
  const body = {
    recipients: ["kopano@example.test"],
    requestId: randomUUID(),
    fingerprint: p.fingerprint,
  };
  const result = await call(f.app, "post", "/meetings/email-meeting/email")
    .send(body)
    .expect(502);
  assert(!result.body.error.includes("secret"));
  await call(f.app, "post", "/meetings/email-meeting/email")
    .send(body)
    .expect(409);
  assert.equal(
    (await f.store.list("kiya")).meetings[0].emailSends[0].status,
    "uncertain",
  );
});
test("Zoho sender and Bcc are configured server-side and only SMTP accepted recipients are reported", async () => {
  let outgoing;
  const mailer = new RecapMailer({
    env: {
      SMTP_HOST: "smtp.zoho.com",
      SMTP_PORT: "465",
      SMTP_USER: "hello@earny.co.za",
      SMTP_PASSWORD: "mock-password",
    },
    transport: {
      sendMail: async (v) => {
        outgoing = v;
        return {
          accepted: ["hello@earny.co.za", "kopano@example.test"],
          rejected: ["kiya@example.test"],
        };
      },
    },
  });
  assert.equal(mailer.ready, true);
  const result = await mailer.send(
    ["kopano@example.test", "kiya@example.test"],
    { subject: "Recap", text: "Approved", html: "<p>Approved</p>" },
  );
  assert.equal(outgoing.from.address, "hello@earny.co.za");
  assert.deepEqual(outgoing.bcc, ["kopano@example.test", "kiya@example.test"]);
  assert.deepEqual(result, {
    accepted: ["kopano@example.test"],
    rejected: ["kiya@example.test"],
  });
  assert.equal(outgoing.disableFileAccess, true);
});

test("Firestore integration transactions persist encrypted user-only documents and preserve other users", async () => {
  const docs = new Map();
  const services = () => ({
    db: {
      collection: (name) => {
        assert.equal(name, "privateIntegrations");
        return {
          doc: (id) => ({
            id,
            get: async () => ({
              exists: docs.has(id),
              data: () => docs.get(id),
            }),
          }),
        };
      },
      runTransaction: async (fn) =>
        fn({
          get: (ref) => ref.get(),
          set: (ref, value) => docs.set(ref.id, value),
        }),
    },
  });
  const vault = new IntegrationVault({
    storage: "firebase",
    secret: "34".repeat(32),
    services,
  });
  await vault.mutate("kiya", (s) => {
    s.connection = { refresh: "private-refresh-kiya" };
  });
  await vault.mutate("kopano", (s) => {
    s.connection = { refresh: "private-refresh-kopano" };
  });
  await vault.mutate("kiya", (s) => {
    s.rate = { count: 1 };
  });
  assert.equal(
    (await vault.get("kopano")).connection.refresh,
    "private-refresh-kopano",
  );
  assert.equal((await vault.get("kiya")).rate.count, 1);
  assert(!JSON.stringify([...docs.values()]).includes("private-refresh"));
  const corrupted = docs.get("kiya").payload.slice(0, -3) + "bad";
  assert.throws(() => vault.open(corrupted));
});
test("unknown speaker labels cannot become named task owners", async () => {
  const { groundAnalysis } = await import("../server/schema.js");
  const result = groundAnalysis(
    {
      summary: "The speaker agreed to publish the website.",
      discussionPoints: [],
      decisions: [],
      followUps: [],
      actions: [
        {
          title: "Publish website",
          description: "Publish it",
          owner: "Unknown speaker 1",
          deadline: null,
          priority: "Med",
          evidence: "Unknown speaker 1: I will publish the website.",
        },
      ],
    },
    { transcript: "Unknown speaker 1: I will publish the website." },
  );
  assert.equal(result.actions[0].owner, null);
});
