// Self-contained smoke test: uses temporary sample data, no account or paid API.
import { chromium } from "@playwright/test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { createApp } from "../server/app.js";
import { sampleTranscript } from "../server/analyze.js";
import { LocalStore } from "../server/store.js";
import { strict as assert } from "node:assert";
await mkdir("docs/screenshots", { recursive: true });
let launchOptions = { headless: true };
if (process.env.SHIFTSCRIPT_TEST_CHROMIUM) {
  const { default: bundled } = await import(
    process.env.SHIFTSCRIPT_TEST_CHROMIUM
  );
  launchOptions = {
    headless: true,
    executablePath: await bundled.executablePath(),
    args: bundled.args,
  };
}
const testDirectory = await mkdtemp(join(tmpdir(), "shiftscript-browser-"));
const apiServer = createApp({
  storage: "local",
  provider: "sample",
  store: new LocalStore(join(testDirectory, "workspace.json")),
}).listen(3009, "127.0.0.1");
await new Promise((resolve) => apiServer.once("listening", resolve));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5179,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3009" },
  },
});
await vite.listen();
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  reducedMotion: "reduce",
});
await page.addInitScript(() =>
  localStorage.setItem(
    "shiftscript:cookie-preferences:v1",
    JSON.stringify({ version: 1, essential: true, optional: false }),
  ),
);
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5179/app");
  await page
    .getByRole("heading", { name: "Less follow-up. More follow-through." })
    .waitFor();
  await page.getByRole("button", { name: "New meeting", exact: true }).click();
  await page.getByRole("button", { name: "Load sample", exact: true }).click();
  await page
    .getByRole("button", { name: "Process transcript", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Meeting summary", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Approve task", exact: true })
      .count(),
    3,
  );
  await page.screenshot({
    path: "docs/screenshots/meeting-review-desktop.png",
    fullPage: true,
    style: ".toast { visibility: hidden !important; }",
  });
  await page
    .getByRole("button", { name: "Approve task", exact: true })
    .first()
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".proposal.reviewed").length === 1,
  );
  await page
    .getByRole("button", { name: "Reject", exact: true })
    .first()
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".proposal.reviewed").length === 2,
  );
  await page
    .getByRole("button", { name: "Review & edit details", exact: true })
    .click();
  await page.getByLabel("Assigned to", { exact: true }).fill("Victor");
  await page
    .getByLabel("Confirmed due date", { exact: true })
    .fill("2026-10-15");
  await page.getByRole("button", { name: "Approve task", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".proposal.reviewed").length === 3,
  );
  await page.getByRole("button", { name: "Task tracker", exact: true }).click();
  await page
    .getByLabel("Status for Review dashboard and send feedback")
    .selectOption("In Progress");
  await page
    .getByRole("button", {
      name: "Review dashboard and send feedback",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Add a progress update")
    .fill("First review complete; waiting for mobile screenshots.");
  await page.getByRole("button", { name: "Add update", exact: true }).click();
  await page.getByText("Progress update saved.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Task tracker", exact: true }).click();
  assert.equal(
    await page
      .getByLabel("Status for Review dashboard and send feedback")
      .inputValue(),
    "In Progress",
  );
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/board-desktop.png",
    fullPage: true,
    style: ".toast { visibility: hidden !important; }",
  });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/dashboard-desktop.png",
    fullPage: true,
    style: ".toast { visibility: hidden !important; }",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const quickNav = page.getByRole("navigation", { name: "Quick navigation" });
  assert.equal(await quickNav.getByRole("button").count(), 4);
  await quickNav
    .getByRole("button", { name: "Go to Meetings", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Every meeting, a clear next step.",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await quickNav
      .getByRole("button", { name: "Go to Meetings", exact: true })
      .getAttribute("aria-current"),
    "page",
  );
  await page.locator(".tab-artwork img").evaluate(async (img) => {
    await img.decode();
    if (!img.naturalWidth) throw new Error("Missing tab art");
  });
  await page.screenshot({
    path: "docs/screenshots/meetings-navigation-mobile.png",
    fullPage: true,
  });
  for (const width of [320, 360, 390, 414]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Four-button navigation and art fit " + width,
    );
    for (const button of await quickNav.getByRole("button").all()) {
      const bounds = await button.boundingBox();
      assert(bounds.width >= 44 && bounds.height >= 44);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await quickNav
    .getByRole("button", { name: "Go to Overview", exact: true })
    .click();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "No horizontal page overflow on mobile overview",
  );
  await page.screenshot({
    path: "docs/screenshots/dashboard-mobile.png",
    fullPage: true,
    style: ".toast { visibility: hidden !important; }",
  });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: /^Meetings/ }).click();
  await page.getByRole("button", { name: /^Dashboard project review/ }).click();
  await page
    .getByRole("heading", { name: "Meeting summary", exact: true })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "No horizontal page overflow on mobile meeting",
  );
  await page.screenshot({
    path: "docs/screenshots/meeting-mobile.png",
    fullPage: true,
    style: ".toast { visibility: hidden !important; }",
  });
  // A mocked recognition result verifies audio UI wiring without a paid/live API call.
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), provider: "gemini", aiReady: true },
    });
  });
  let voiceUploaded = false;
  await page.route("**/api/transcribe", async (route) => {
    const body = route.request().postDataJSON();
    assert.equal(body.name, "voice-sample.wav");
    assert.equal(body.mimeType, "audio/wav");
    assert.ok(body.data.length > 16);
    voiceUploaded = true;
    await route.fulfill({
      json: {
        transcript: sampleTranscript,
        source: { kind: "audio", name: body.name },
        provider: "gemini",
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.reload();
  await page.getByRole("button", { name: "New meeting", exact: true }).click();
  await page
    .getByLabel("Meeting title", { exact: true })
    .fill("Voice workflow review");
  await page.getByLabel("Meeting date", { exact: true }).fill("2026-10-09");
  const wav = Buffer.alloc(48);
  wav.write("RIFF");
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  await page.getByLabel("Upload audio file").setInputFiles({
    name: "voice-sample.wav",
    mimeType: "audio/wav",
    buffer: wav,
  });
  await page
    .getByRole("button", { name: "Transcribe to text", exact: true })
    .click();
  await page.waitForFunction(
    (expected) =>
      document.querySelector('[aria-label="Meeting transcript"]').value ===
      expected,
    sampleTranscript,
    { timeout: 15000 },
  );
  assert.equal(voiceUploaded, true);
  await page.screenshot({
    path: "docs/screenshots/voice-input-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Process transcript", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Meeting summary", exact: true })
    .waitFor();
  await page
    .getByText("Voice source · voice-sample.wav", { exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: sample workflow, edits, approval/rejection, persistence, board, mobile navigation, no overflow, mocked voice upload/transcription/review/source, no page errors.",
  );
} catch (error) {
  await page.screenshot({
    path: "docs/screenshots/browser-failure.png",
    fullPage: true,
  });
  console.error(
    "Browser failure:",
    await page.locator("body").innerText(),
    errors,
  );
  throw error;
} finally {
  await browser.close();
  await vite.close();
  apiServer.close();
  await rm(testDirectory, { recursive: true, force: true });
}
