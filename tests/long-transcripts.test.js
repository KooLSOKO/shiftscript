import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import {
  analyze,
  sampleTranscript,
  sampleAnalysis,
} from "../server/analyze.js";
import { MAX_TRANSCRIPT_CHARS } from "../shared/limits.js";
import { parseRecipients } from "../shared/recipients.js";

test("100,000-character transcripts and drafts keep all text, including commitments at the end", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "shift-long-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new LocalStore(join(dir, "workspaces.json"));
  const transcript =
    "Kiya: Portfolio review.\n"
      .repeat(5000)
      .slice(0, MAX_TRANSCRIPT_CHARS - sampleTranscript.length - 1) +
    "\n" +
    sampleTranscript;
  assert.equal(transcript.length, MAX_TRANSCRIPT_CHARS);
  let calls = 0;
  const app = createApp({
    storage: "local",
    store,
    provider: "gemini",
    analyzer: (input) =>
      analyze(input, "gemini", async (payload) => {
        calls++;
        assert.equal(JSON.parse(payload.input).transcript, transcript);
        return structuredClone(sampleAnalysis);
      }),
  });
  const input = {
    title: "Complete portfolio review",
    date: "2026-10-10",
    type: "Project review",
    transcript,
  };
  const draft = await request(app)
    .put("/api/drafts/current")
    .send(input)
    .expect(200);
  assert.equal(draft.body.draft.transcript, transcript);
  const created = await request(app)
    .post("/api/meetings")
    .send(input)
    .expect(201);
  assert.equal(created.body.meeting.transcript, transcript);
  assert.equal(created.body.meeting.proposals.length, 3);
  assert.equal(
    created.body.meeting.proposals[0].evidence,
    sampleAnalysis.actions[0].evidence,
  );
  await request(app).post("/api/meetings").send(input).expect(200);
  assert.equal(calls, 1, "Duplicate imports do not spend another AI request");
  assert.equal(
    (await store.list()).meetings[0].transcript.length,
    MAX_TRANSCRIPT_CHARS,
  );
  await request(app)
    .post("/api/meetings")
    .send({ ...input, transcript: transcript + "x" })
    .expect(400);
  await request(app)
    .put("/api/drafts/current")
    .send({ ...input, transcript: transcript + "x" })
    .expect(400);
  assert.equal(calls, 1, "Oversized input is rejected before AI analysis");
});

test("comma-separated email recipients are validated and deduplicated", () => {
  assert.deepEqual(
    parseRecipients(
      " Kopano@example.test, kiya@example.test, KOPANO@example.test\n",
    ),
    {
      recipients: ["kopano@example.test", "kiya@example.test"],
      error: "",
    },
  );
  assert.equal(
    parseRecipients("a@example.test; b@example.test\nc@example.test").recipients
      .length,
    3,
  );
  assert.match(
    parseRecipients("a@example.test, broken-address").error,
    /broken-address/,
  );
  assert.match(
    parseRecipients("a@example.test\r\nBcc: injected@example.test").error,
    /Check/,
  );
  assert.match(
    parseRecipients(
      Array.from({ length: 11 }, (_, i) => `${i}@example.test`).join(","),
    ).error,
    /up to 10/,
  );
  assert.equal(parseRecipients(" , , ").recipients.length, 0);
});
