// Real React/API queue; fictional Google/model adapters, no live accounts or outbound messages.
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { newWorkspace } from "../server/collaboration.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const dir = await mkdtemp(join(tmpdir(), "shift-batch-ui-")),
  store = new LocalStore(join(dir, "db.json"));
await store.mutate("local-demo", (s) => {
  s.workspace = newWorkspace(
    "local-demo",
    { name: "Earny Studio", ownerName: "Kiya" },
    { uid: "local-demo", name: "Kiya", email: "kiya@example.test" },
  );
  s.projects.push({
    id: "launch",
    name: "Launch project",
    color: "blue",
    createdAt: new Date().toISOString(),
  });
});
const records = Array.from({ length: 4 }, (_, i) => ({
  name: "conferenceRecords/batch-" + (i + 1),
  startTime: `2026-10-${String(12 - i).padStart(2, "0")}T08:00:00Z`,
  endTime: `2026-10-${String(12 - i).padStart(2, "0")}T09:00:00Z`,
}));
const previews = new Map();
let counter = 0,
  failTwo = true,
  changedFour = false,
  imports = 0;
const google = {
  ready: true,
  status: async () => ({ ready: true, connected: true }),
  list: async () => ({ meetings: records, cursor: null }),
  artifacts: async (_uid, name) => ({
    artifacts: [
      { name: name + "/smartNotes/notes", kind: "notes", ready: true },
    ],
  }),
  preview: async (_uid, _workspace, selection) => {
    const n =
      selection.kind === "artifact"
        ? Number(selection.name.match(/batch-(\d)/)[1])
        : 1;
    const source = {
      kind: "google-notes",
      documentId: "batch-document-" + n,
      artifact: "conferenceRecords/batch-" + n + "/smartNotes/notes",
      name: "Meeting source " + n,
    };
    const transcript =
      `Kiya: We discussed project ${n}. Kopano: I will review project ${n} tomorrow.` +
      (n === 4 && changedFour ? " Kiya: Also review the new brief." : "");
    const v = {
      previewId: "preview-" + String(++counter).padStart(24, "0"),
      source,
      transcript,
      title: "Meeting source " + n,
      expires: Date.now() + 900000,
    };
    previews.set(v.previewId, v);
    return v;
  },
  imported: async (_uid, _workspace, id) => {
    imports++;
    const v = previews.get(id);
    if (!v) throw Object.assign(Error("Expired preview"), { status: 409 });
    return { source: v.source, transcript: v.transcript };
  },
};
const app = createApp({
  store,
  storage: "local",
  google,
  provider: "gemini",
  analyzer: async (input) => {
    if (input.source.documentId === "batch-document-2" && failTwo)
      throw Object.assign(
        Error("Simulated source failure. Retry this meeting."),
        { status: 502 },
      );
    return {
      summary: "Separate summary for " + input.source.documentId,
      discussionPoints: ["Project review"],
      decisions: [],
      followUps: [],
      actions: [
        {
          title: "Review " + input.source.documentId,
          description: "Review the project",
          owner: "Kopano",
          deadline: "tomorrow",
          priority: "Med",
          evidence: input.transcript,
        },
      ],
    };
  },
});
const server = app.listen(3044, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5194,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3044" },
  },
});
await vite.listen();
let launch = { headless: true };
if (process.env.SHIFTSCRIPT_TEST_CHROMIUM) {
  const { default: bundle } = await import(
    process.env.SHIFTSCRIPT_TEST_CHROMIUM
  );
  launch = {
    headless: true,
    executablePath: await bundle.executablePath(),
    args: bundle.args,
  };
}
const browser = await chromium.launch(launch),
  errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://**", (r) => r.abort());
  await page.addInitScript(() =>
    localStorage.setItem(
      "shiftscript:cookie-preferences:v1",
      JSON.stringify({ version: 1, essential: true, optional: false }),
    ),
  );
  await page.goto("http://127.0.0.1:5194/app");
  await page.getByRole("button", { name: "Google Meet", exact: true }).click();
  await page
    .getByRole("button", { name: "Batch · up to 3", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review your batch", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Load recent meetings", exact: true })
    .click();
  async function choose(n) {
    const row = page.locator(".google-meeting").nth(n - 1);
    const view = row.getByRole("button", { name: "View sources", exact: true });
    await view.click();
    await page
      .getByRole("button", {
        name: "Gemini notes 1 · Add to batch",
        exact: true,
      })
      .click();
    await expect(page.locator(".meet-batch-item")).toHaveCount(n);
  }
  await choose(1);
  await page
    .getByLabel("Meeting title 1", { exact: true })
    .fill("Launch planning");
  await page.getByLabel("Project 1", { exact: true }).selectOption("launch");
  // An aliased Docs link must not queue the same notes source twice.
  await page
    .getByLabel("Google Docs notes link", { exact: true })
    .fill("https://docs.google.com/document/d/batch-document-1/edit");
  await page
    .getByRole("button", { name: "Add notes to batch", exact: true })
    .click();
  await expect(page.locator(".meet-batch-item")).toHaveCount(1);
  await expect(
    page.getByText("That source is already in your batch.", { exact: true }),
  ).toBeVisible();
  await choose(2);
  await choose(3);
  await page
    .locator(".google-meeting")
    .nth(3)
    .getByRole("button", { name: "View sources", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Gemini notes 1 · Add to batch",
      exact: true,
    }),
  ).toBeDisabled();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole("heading", { name: "Review your batch", exact: true })
      .scrollIntoViewIfNeeded();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Overflow at ${width}`,
    );
    assert(
      await page
        .locator(".meet-batch")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    const action = page.getByRole("button", {
      name: "Process 3 meetings",
      exact: true,
    });
    assert((await action.boundingBox()).height >= 44);
    if (process.env.SHIFTSCRIPT_QA_IMAGES && [1440, 390].includes(width))
      await page.locator(".meet-batch").screenshot({
        path: join(
          process.env.SHIFTSCRIPT_QA_IMAGES,
          `meet-batch-${width}.png`,
        ),
      });
  }
  let release;
  const gate = new Promise((r) => (release = r));
  let posted = 0;
  await page.route("**/api/google/import", async (r) => {
    posted++;
    if (posted === 1) await gate;
    await r.continue();
  });
  const processButton = page.getByRole("button", {
    name: "Process 3 meetings",
    exact: true,
  });
  await processButton.click();
  await expect(page.locator(".state-processing")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "One meeting", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Remove source: Launch planning",
      exact: true,
    }),
  ).toBeDisabled();
  await page.locator(".meet-batch form").evaluate((form) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  assert.equal(posted, 1);
  release();
  await expect(page.locator(".state-done")).toHaveCount(2);
  await expect(page.locator(".state-failed")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Process 1 remaining", exact: true }),
  ).toBeEnabled();
  assert.equal(posted, 3);
  let saved = await store.list("local-demo");
  assert.equal(saved.meetings.length, 2);
  assert.equal(saved.tasks.length, 0);
  assert(
    saved.meetings.every((m) => m.proposals[0].reviewStatus === "pending"),
  );
  assert.equal(
    saved.meetings.find((m) => m.title === "Launch planning").projectId,
    "launch",
  );
  failTwo = false;
  await page
    .getByRole("button", { name: "Process 1 remaining", exact: true })
    .click();
  await expect(page.locator(".state-done")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "All meetings processed", exact: true }),
  ).toBeDisabled();
  assert.equal(posted, 4);
  await page.unroute("**/api/google/import");
  await page
    .getByRole("button", { name: "Open summary & tasks", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Separate summary for batch-document-1", { exact: true }),
  ).toBeVisible();
  saved = await store.list("local-demo");
  assert.equal(saved.meetings.length, 3);
  assert.equal(new Set(saved.meetings.map((m) => m.id)).size, 3);
  // Reopen with a fresh queue and force a changed source, followed by explicit review.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Google Meet", exact: true }).click();
  await page
    .getByRole("button", { name: "Batch · up to 3", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Load recent meetings", exact: true })
    .click();
  await page
    .locator(".google-meeting")
    .nth(3)
    .getByRole("button", { name: "View sources", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Gemini notes 1 · Add to batch", exact: true })
    .click();
  await expect(page.locator(".meet-batch-item")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Process 1 meeting", exact: true }),
  ).toBeEnabled();
  changedFour = true;
  const previousImports = imports;
  await page
    .getByRole("button", { name: "Process 1 meeting", exact: true })
    .click();
  await expect(page.locator(".state-changed")).toHaveCount(1);
  assert.equal(imports, previousImports);
  await expect(
    page.getByText("Kiya: Also review the new brief.", { exact: false }).last(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use this reviewed source", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Process 1 meeting", exact: true })
    .click();
  await expect(page.locator(".state-done")).toHaveCount(1);
  assert.equal((await store.list("local-demo")).meetings.length, 4);
  await page.setViewportSize({ width: 390, height: 900 });
  await page
    .getByRole("button", {
      name: "Remove source: Meeting source 4",
      exact: true,
    })
    .click();
  for (let n = 1; n <= 2; n++) {
    await page
      .locator(".google-meeting")
      .nth(n - 1)
      .getByRole("button", { name: "View sources", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Gemini notes 1 · Add to batch",
        exact: true,
      })
      .click();
    await expect(page.locator(".meet-batch-item")).toHaveCount(n);
    await expect(
      page.getByRole("button", {
        name: `Process ${n} meeting${n === 1 ? "" : "s"}`,
        exact: true,
      }),
    ).toBeEnabled();
    const heading = await page
      .getByRole("heading", { name: "Review your batch", exact: true })
      .boundingBox();
    assert(
      heading.y >= 0 && heading.y < 900,
      "Selected sources must scroll to the review on mobile",
    );
  }
  let finishCurrent;
  const stopGate = new Promise((r) => (finishCurrent = r));
  let stoppedPosts = 0;
  await page.route("**/api/google/import", async (route) => {
    stoppedPosts++;
    await stopGate;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Process 2 meetings", exact: true })
    .click();
  await expect(page.locator(".state-processing")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Stop after current meeting", exact: true })
    .click();
  finishCurrent();
  await expect(
    page.getByText(
      "Batch paused. Completed meetings are saved. Process remaining sources when you are ready.",
      { exact: true },
    ),
  ).toBeVisible();
  assert.equal(stoppedPosts, 1);
  await expect(page.locator(".state-done")).toHaveCount(1);
  await page.unroute("**/api/google/import");
  await page
    .getByRole("button", { name: "Process 1 remaining", exact: true })
    .click();
  await expect(page.locator(".state-done")).toHaveCount(2);
  assert.equal((await store.list("local-demo")).meetings.length, 4);
  await page
    .getByRole("button", { name: "Start another batch", exact: true })
    .click();
  await expect(page.locator(".meet-batch-item")).toHaveCount(0);
  assert.equal((await store.list("local-demo")).meetings.length, 4);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: three-source cap and duplicate aliases; independent editable fields; sequential requests/repeat guard; partial success, retry, changed-source review, separate meetings/pending tasks, result navigation; no overflow and 44px actions at 320/390/768/1440px.",
  );
} finally {
  await browser.close();
  await vite.close();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
