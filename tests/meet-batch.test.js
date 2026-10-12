import test from "node:test";
import assert from "node:assert/strict";
import {
  batchCandidates,
  processMeetBatch,
  sameMeetSource,
} from "../shared/meet-batch.js";
const item = (n, status = "ready") => ({
  id: "source-" + n,
  selection: {
    kind: "document",
    url: "https://docs.google.com/document/d/source-document-" + n,
  },
  status,
  form: {
    title: "Meeting " + n,
    date: "2026-10-12",
    type: "Planning",
    projectId: n === 1 ? "launch" : "",
  },
  preview: {
    source: { documentId: "source-document-" + n, kind: "google-document" },
    transcript: "Kiya: Discussed project " + n + ". Kopano: I will review it.",
    previewId: "old-preview-" + n,
  },
});
const fresh = (entry) => ({
  ...entry.preview,
  previewId: "fresh-preview-" + entry.id,
});

test("Batch queues at most three unique sources, validates each editable meeting and excludes completed/changed rows", () => {
  assert.equal(
    sameMeetSource(
      { documentId: "doc" },
      { documentId: "doc", artifact: "notes" },
    ),
    true,
  );
  assert.throws(
    () => batchCandidates([item(1), item(2), item(3), item(4)]),
    /three/,
  );
  assert.throws(() => batchCandidates([item(1), item(1)]), /only once/);
  assert.deepEqual(
    batchCandidates([
      item(1, "done"),
      item(2, "failed"),
      item(3, "changed"),
    ]).map((v) => v.id),
    ["source-2"],
  );
  assert.throws(
    () =>
      batchCandidates([
        { ...item(1), form: { ...item(1).form, date: "2026-02-31" } },
      ]),
    (e) => e.itemId === "source-1",
  );
});

test("Batch refreshes previews and processes sequentially with separate fields, outcomes and review proposals", async () => {
  const items = [item(1), item(2), item(3)],
    calls = [],
    updates = [];
  let active = 0,
    highest = 0;
  const request = async (path, options) => {
    active++;
    highest = Math.max(highest, active);
    await new Promise((r) => setImmediate(r));
    const body = JSON.parse(options.body);
    calls.push({ path, body });
    active--;
    if (path.endsWith("preview"))
      return fresh(items.find((v) => v.selection.url === body.url));
    return {
      meeting: { id: body.previewId, proposals: [{ reviewStatus: "pending" }] },
      cached: false,
    };
  };
  const r = await processMeetBatch({
    items,
    request,
    onUpdate: (id, patch) => updates.push({ id, ...patch }),
  });
  assert.equal(highest, 1);
  assert.equal(r.results.length, 3);
  assert.equal(r.paused, false);
  assert.deepEqual(
    calls.map((v) => v.path),
    [
      "/google/preview",
      "/google/import",
      "/google/preview",
      "/google/import",
      "/google/preview",
      "/google/import",
    ],
  );
  assert.deepEqual(
    calls.filter((v) => v.path.endsWith("import")).map((v) => v.body.title),
    ["Meeting 1", "Meeting 2", "Meeting 3"],
  );
  assert.equal(calls[1].body.projectId, "launch");
  assert.equal(calls[3].body.projectId, null);
  assert(
    updates
      .filter((v) => v.status === "done")
      .every((v) => v.result.meeting.proposals[0].reviewStatus === "pending"),
  );
  assert.equal(items[0].preview.previewId, "old-preview-1");
});

test("A failed source leaves successful meetings saved and a retry processes only unfinished sources", async () => {
  const items = [item(1), item(2), item(3)];
  let failure = true,
    calls = 0;
  const request = async (path, o) => {
    const b = JSON.parse(o.body);
    if (path.endsWith("preview"))
      return fresh(items.find((v) => v.selection.url === b.url));
    calls++;
    if (b.title === "Meeting 2" && failure)
      throw Object.assign(Error("Temporary model error"), { status: 502 });
    return { meeting: { id: b.title }, cached: false };
  };
  const onUpdate = (id, patch) =>
    Object.assign(
      items.find((v) => v.id === id),
      patch,
    );
  const first = await processMeetBatch({ items, request, onUpdate });
  assert.equal(first.results.length, 2);
  assert.deepEqual(
    items.map((v) => v.status),
    ["done", "failed", "done"],
  );
  failure = false;
  await processMeetBatch({ items, request, onUpdate });
  assert.equal(calls, 4);
  assert(items.every((v) => v.status === "done"));
});

test("Changed source text requires a new review and never reaches the import processor", async () => {
  const v = item(1),
    updates = [];
  let imports = 0;
  const result = await processMeetBatch({
    items: [v],
    request: async (path) => {
      if (path.endsWith("import")) {
        imports++;
        return {};
      }
      return {
        ...fresh(v),
        transcript: "Kiya: The requirements have changed.",
      };
    },
    onUpdate: (_id, patch) => updates.push(patch),
  });
  assert.equal(imports, 0);
  assert.equal(result.results.length, 0);
  assert.equal(updates.at(-1).status, "changed");
  assert(updates.at(-1).changedPreview.transcript.includes("changed"));
});

test("Stop after current, unmount and rate limits do not start another source", async () => {
  const items = [item(1), item(2), item(3)];
  let stopped = false,
    calls = 0;
  const request = async (path, o) => {
    calls++;
    const b = JSON.parse(o.body);
    if (path.endsWith("preview"))
      return fresh(items.find((v) => v.selection.url === b.url));
    stopped = true;
    return { meeting: { id: "saved" } };
  };
  const r = await processMeetBatch({
    items,
    request,
    onUpdate: () => {},
    shouldStop: () => stopped,
  });
  assert.equal(r.results.length, 1);
  assert.equal(r.paused, true);
  assert.equal(calls, 2);
  let active = true,
    imports = 0;
  await processMeetBatch({
    items,
    request: async (path) => {
      if (path.endsWith("preview")) {
        active = false;
        return fresh(items[0]);
      }
      imports++;
      return {};
    },
    onUpdate: () => {},
    isActive: () => active,
  });
  assert.equal(imports, 0);
  const errors = [];
  const capped = await processMeetBatch({
    items,
    request: async () => {
      throw Object.assign(Error("Quota reached"), { status: 429 });
    },
    onUpdate: (id, p) => errors.push({ id, ...p }),
  });
  assert.equal(capped.paused, true);
  assert.equal(errors.filter((v) => v.status === "failed").length, 1);
});
