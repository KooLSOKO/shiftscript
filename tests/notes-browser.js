// Actual React + authenticated API workflow. All provider data is fictional.
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { newWorkspace } from "../server/collaboration.js";
import { analyze } from "../server/analyze.js";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(join(tmpdir(), "notes-ui-")),
  store = new LocalStore(join(dir, "state.json"));
await store.mutate("local-demo", (s) => {
  s.workspace = newWorkspace(
    "local-demo",
    { name: "Earny Studio", ownerName: "Kiya" },
    { uid: "local-demo", name: "Kiya", email: "kiya@example.test" },
  );
});
await store.mutateProfile("local-demo", (p) => {
  p.name = "Kiya";
});
const text =
  "Portfolio planning\nKeep the corporate blue.\nKopano will review the mobile portfolio by 2026-10-15.\nKiya will confirm launch details.\nUnreadable margin: [unclear].";
let scans = 0,
  analyses = 0,
  scannedBytes = 0,
  assistantNotes = [];
const previousKey = process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY = "fictional-test-key-never-used";
const apiServer = createApp({
  store,
  storage: "local",
  provider: "gemini",
  noteExtractor: async (image) => {
    scans++;
    scannedBytes = Buffer.from(image.data, "base64").length;
    return { text, warnings: ["Review the unclear margin."] };
  },
  analyzer: async (input) => {
    analyses++;
    return analyze(input, "gemini", async () => ({
      summary:
        "The team kept corporate blue and agreed to review the mobile portfolio.",
      discussionPoints: ["Mobile portfolio review."],
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
    }));
  },
  assistant: async ({ context }) => {
    assistantNotes = context.notes;
    return {
      answer:
        "Your notebook says to keep corporate blue. Kopano owns the mobile review.",
      sourceIds: context.notes.map((n) => n.sourceId),
      actions: [],
    };
  },
}).listen(3019, "127.0.0.1");
if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
else process.env.GEMINI_API_KEY = previousKey;
// config is evaluated per request, so preserve a harmless placeholder for this test process.
process.env.GEMINI_API_KEY = "fictional-test-key-never-used";
await new Promise((r) => apiServer.once("listening", r));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5185,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3019" },
  },
});
await vite.listen();
let launch = { headless: true };
if (process.env.SHIFTSCRIPT_TEST_CHROMIUM) {
  const { default: bundled } = await import(
    process.env.SHIFTSCRIPT_TEST_CHROMIUM
  );
  launch = {
    ...launch,
    executablePath: await bundled.executablePath(),
    args: bundled.args.filter((a) => a !== "--single-process"),
  };
}
const browser = await chromium.launch(launch),
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  }),
  errors = [];
page.setDefaultTimeout(15000);
page.on("pageerror", (e) => errors.push(e.message));
await page.route("https://**", (r) => r.abort());
await page.addInitScript(() =>
  localStorage.setItem(
    "shiftscript:cookie-preferences:v1",
    JSON.stringify({ version: 1, essential: true, optional: false }),
  ),
);
async function width(label) {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    label + " overflow",
  );
}
async function notesTab() {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page
    .getByRole("heading", { name: "Your notebook, with a next step." })
    .waitFor();
}
try {
  await page.goto("http://127.0.0.1:5185/app");
  await notesTab();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  // Make an actual high-resolution noisy paper PNG; browser compression is real.
  const fixture = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 3200;
    canvas.height = 2200;
    const c = canvas.getContext("2d"),
      pixels = c.createImageData(canvas.width, canvas.height);
    let seed = 42;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const v = 220 + (seed % 35);
      pixels.data[i] = v;
      pixels.data[i + 1] = v;
      pixels.data[i + 2] = v;
      pixels.data[i + 3] = 255;
    }
    c.putImageData(pixels, 0, 0);
    c.fillStyle = "#172c58";
    c.font = "72px sans-serif";
    [
      "Portfolio planning",
      "Keep the corporate blue.",
      "Kopano: mobile review, 2026-10-15",
      "Kiya: confirm launch details",
    ].forEach((t, i) => c.fillText(t, 180, 250 + i * 180));
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const raw = Buffer.from(fixture, "base64");
  assert(raw.length > 2_000_000);
  const file = join(dir, "notebook-fixture.png");
  await writeFile(file, raw);
  await page.getByLabel("Upload photo", { exact: true }).setInputFiles(file);
  await page
    .getByRole("button", { name: "Extract text", exact: true })
    .waitFor();
  await page.waitForFunction(() => !document.querySelector(".note-working"));
  assert.equal(scans, 0);
  assert.equal(
    await page.getByLabel("Note text", { exact: true }).inputValue(),
    "",
  );
  await page.getByText("Rotate or crop the page", { exact: true }).click();
  await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".note-working"));
  const dimensions = await page
    .locator(".note-photo-preview")
    .evaluate((img) => ({ w: img.naturalWidth, h: img.naturalHeight }));
  assert(dimensions.h > dimensions.w);
  await page.getByLabel("Crop left (%)", { exact: true }).fill("10");
  assert(
    await page
      .getByRole("button", { name: "Extract text", exact: true })
      .isDisabled(),
  );
  await page.getByRole("button", { name: "Apply crop", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".note-working"));
  for (const w of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width: w, height: 844 });
    await width("Note editor " + w);
    const b = await page
      .getByRole("button", { name: "Extract text", exact: true })
      .boundingBox();
    assert(b.height >= 44);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Extract text", exact: true }).click();
  await page.getByText("Review the unclear margin.", { exact: true }).waitFor();
  assert.equal(scans, 1);
  assert(scannedBytes <= 2_000_000 && scannedBytes < raw.length);
  assert.equal(
    await page.getByLabel("Note text", { exact: true }).inputValue(),
    text,
  );
  await page
    .getByLabel("Note title", { exact: true })
    .fill("Portfolio notebook");
  await page
    .getByLabel("Note text", { exact: true })
    .fill(text.replace("[unclear]", "Launch after approval."));
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Portfolio notebook", exact: true })
    .waitFor();
  let data = await store.list();
  assert.equal(data.notes.length, 1);
  assert.equal(data.tasks.length, 0);
  assert.equal(data.meetings.length, 0);
  assert(!JSON.stringify(data).includes(fixture));
  assert.equal(data.notes[0].photo.name, "notebook-fixture.png");
  await page.getByRole("button", { name: "Edit note", exact: true }).click();
  await page
    .getByLabel("Note title", { exact: true })
    .fill("Portfolio notebook updated");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Portfolio notebook updated", exact: true })
    .waitFor();
  assert.equal((await store.list()).notes[0].version, 2);
  assert.equal(
    (await store.list()).notes[0].title,
    "Portfolio notebook updated",
  );
  for (const w of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width: w, height: 844 });
    await width("Note detail " + w);
  }
  await page
    .getByRole("button", { name: "Process with Gemini", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Process note with Gemini", exact: true })
    .waitFor();
  await page
    .getByRole("button", {
      name: "Generate summary and proposals",
      exact: true,
    })
    .click();
  await page
    .getByRole("heading", { name: "Meeting summary", exact: true })
    .waitFor();
  assert.equal(analyses, 1);
  data = await store.list();
  assert.equal(data.tasks.length, 0);
  assert.equal(data.meetings.length, 1);
  assert.equal(data.meetings[0].source.noteVersion, 2);
  assert.equal(data.notes[0].title, "Portfolio notebook updated");
  assert.equal(data.notes[0].processed[0].meetingId, data.meetings[0].id);
  await page.getByRole("button", { name: "Approve task", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".proposal.reviewed").length === 1,
  );
  assert.equal((await store.list()).tasks.length, 1);
  await page
    .getByRole("button", { name: "Open source note", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Portfolio notebook updated", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await notesTab();
  await page.getByLabel("Search notes", { exact: true }).fill("absent");
  await page
    .getByRole("heading", { name: "No matching notes.", exact: true })
    .waitFor();
  await page.getByLabel("Search notes", { exact: true }).fill("portfolio");
  await page.locator(".note-card").click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  // Saved notes are available to Shifty and source chips return to the note.
  await page.getByRole("button", { name: "Shifty", exact: true }).click();
  await page
    .getByLabel("Ask Shifty", { exact: true })
    .fill("What did my notebook say?");
  await page
    .getByRole("button", { name: "Send assistant question", exact: true })
    .click();
  await page
    .getByText(
      "Your notebook says to keep corporate blue. Kopano owns the mobile review.",
      { exact: true },
    )
    .waitFor();
  assert.equal(assistantNotes.length, 1);
  assert.equal(assistantNotes[0].title, "Portfolio notebook updated");
  assert.match(assistantNotes[0].text, /Launch after approval/);
  await page
    .getByRole("log")
    .getByRole("button", { name: "Portfolio notebook updated", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Portfolio notebook updated", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  assert.equal((await store.list()).meetings.length, 1);
  assert.equal((await store.list()).tasks.length, 1);
  await page
    .getByRole("button", { name: "Confirm delete note", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "A home for the things you jot down.",
      exact: true,
    })
    .waitFor();
  data = await store.list();
  assert.equal(data.notes.length, 0);
  assert.equal(data.meetings.length, 1);
  assert.equal(data.tasks.length, 1);
  // Typed notes, recoverable scan errors and no automatic extraction on upload.
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Note title", { exact: true }).fill("Typed follow-up");
  await page
    .getByLabel("Note text", { exact: true })
    .fill("Remember to confirm the launch date after the mobile review.");
  await page.getByLabel("Upload photo", { exact: true }).setInputFiles(file);
  await page.waitForFunction(() => !document.querySelector(".note-working"));
  await page.route("**/api/notes/scan", (r) =>
    r.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error: "Photo scan quota reached." }),
    }),
  );
  await page.getByRole("button", { name: "Extract text", exact: true }).click();
  await page.getByText("Photo scan quota reached.", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Note text", { exact: true }).inputValue(),
    "Remember to confirm the launch date after the mobile review.",
  );
  await page.unroute("**/api/notes/scan");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Typed follow-up", exact: true })
    .waitFor();
  assert.equal((await store.list()).notes.length, 1);
  assert.deepEqual(errors, []);
  await mkdir("docs/screenshots", { recursive: true });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/screenshots/notes-desktop-qa.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/notes-mobile-qa.png",
    fullPage: true,
  });
  console.log(
    "PASS: Notes real photo compression/crop/rotation, extraction review/edit/save, typed notes, safe errors, processing/approval/source links, Shifty note citations, deletion safety and mobile layouts (320/390/768/1440). No live provider calls.",
  );
} catch (e) {
  await page.screenshot({
    path: join(dir, "notes-failure.png"),
    fullPage: true,
  });
  console.error(
    await page.locator("body").innerText(),
    errors,
    "Screenshot:",
    join(dir, "notes-failure.png"),
  );
  throw e;
} finally {
  await browser.close();
  await vite.close();
  await new Promise((r) => apiServer.close(r));
  if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previousKey;
  await rm(dir, { recursive: true, force: true });
}
