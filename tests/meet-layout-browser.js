// Fictional Meet sources and local storage; no Google accounts or outbound messages.
import express from "express";
import { chromium } from "@playwright/test";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import request from "supertest";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const dir = await mkdtemp(join(tmpdir(), "shift-meet-layout-"));
const meetings = Array.from({ length: 20 }, (_, i) => ({
  name: `conferenceRecords/layout-${i}`,
  startTime: new Date(
    Date.UTC(2026, 9, 11 - Math.floor(i / 4), 12 - (i % 4)),
  ).toISOString(),
  endTime: new Date(
    Date.UTC(2026, 9, 11 - Math.floor(i / 4), 13 - (i % 4)),
  ).toISOString(),
}));
const google = {
  ready: true,
  status: async () => ({ ready: true, connected: true }),
  list: async () => ({ meetings, cursor: null }),
  artifacts: async (_user, name) => ({ artifacts: [] }),
  preview: async () => ({
    previewId: "layout-preview",
    title: "Portfolio planning notes",
    transcript:
      "Kiya: Kopano, please publish the portfolio on Friday.\nKopano: I will publish it on Friday.",
    source: {
      kind: "google-notes",
      name: "Portfolio planning",
      url: "https://docs.google.com/document/d/layout/edit",
      documentId: "layout",
      artifact: "conferenceRecords/layout-0/smartNotes/notes",
    },
  }),
};
const app = createApp({
  store: new LocalStore(join(dir, "workspace.json")),
  google,
  storage: "local",
  provider: "gemini",
});
await request(app)
  .post("/api/workspace")
  .send({ name: "Earny Studio", ownerName: "Kiya Soko" })
  .expect(201);
app.use(express.static(resolve("dist")));
app.get("/app", (_req, res) => res.sendFile(resolve("dist/index.html")));
const server = app.listen(3025, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
let launch = { headless: true };
if (process.env.SHIFTSCRIPT_TEST_CHROMIUM) {
  const { default: bundled } = await import(
    process.env.SHIFTSCRIPT_TEST_CHROMIUM
  );
  launch = {
    headless: true,
    executablePath: await bundled.executablePath(),
    args: bundled.args.filter((a) => a !== "--single-process"),
  };
}
const browser = await chromium.launch(launch);
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(12000);
await page.addInitScript(() =>
  localStorage.setItem(
    "shiftscript:cookie-preferences:v1",
    JSON.stringify({ version: 1, essential: true, optional: false }),
  ),
);
await page.route("https://**", (route) => route.abort());
let releaseSources;
await page.route("**/api/google/artifacts?*", async (route) => {
  const name = new URL(route.request().url()).searchParams.get("name");
  if (releaseSources) await releaseSources;
  if (name.endsWith("-2"))
    return route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "Source lookup failed. Try again." }),
    });
  const artifacts = name.endsWith("-1")
    ? []
    : [
        { name: `${name}/smartNotes/notes`, kind: "notes", ready: true },
        {
          name: `${name}/transcripts/transcript`,
          kind: "transcript",
          ready: false,
        },
      ];
  await route.fulfill({ json: { artifacts } });
});
const sidebar = page.locator(".meet-desktop-sources");
async function modalFits(label) {
  const dialog = page.getByRole("dialog");
  assert(
    await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    label + " dialog content fits without sideways scrolling",
  );
  await dialog.evaluate((e) => {
    e.scrollLeft = 100;
  });
  assert.equal(
    await dialog.evaluate((e) => e.scrollLeft),
    0,
    label + " cannot pan sideways",
  );
  const bounds = await dialog.boundingBox();
  const width = page.viewportSize().width;
  assert(
    bounds.x >= 0 && bounds.x + bounds.width <= width + 1,
    label + " dialog fits viewport",
  );
  assert.equal(
    await page.evaluate(() => document.body.style.overflow),
    "hidden",
  );
}
try {
  await page.goto("http://127.0.0.1:3025/app");
  await page.getByRole("button", { name: "Google Meet", exact: true }).click();
  await page
    .getByRole("button", { name: "Load recent meetings", exact: true })
    .click();
  await sidebar
    .getByText("Choose View sources beside a meeting", { exact: false })
    .waitFor();
  let release;
  releaseSources = new Promise((r) => (release = r));
  await page
    .getByRole("button", { name: "View sources", exact: true })
    .first()
    .click();
  await sidebar.getByText("Loading sources…", { exact: true }).waitFor();
  release();
  releaseSources = null;
  await sidebar
    .getByRole("button", { name: "Gemini notes 1 · Preview", exact: true })
    .waitFor();
  assert(
    await sidebar
      .getByRole("button", {
        name: "Transcript 2 · Still preparing",
        exact: true,
      })
      .isDisabled(),
  );
  const listBounds = await page.locator(".meet-list-column").boundingBox();
  const sourceBounds = await sidebar.boundingBox();
  assert(
    sourceBounds.x >= listBounds.x + listBounds.width,
    "Sources sit to the right of the meeting list",
  );
  assert(
    sourceBounds.y < listBounds.y + 5,
    "Sources align with the start of the meeting list",
  );
  const initialY = sourceBounds.y;
  await page
    .locator(".google-meetings")
    .evaluate((e) => (e.scrollTop = e.scrollHeight));
  assert.equal(
    (await sidebar.boundingBox()).y,
    initialY,
    "Sources remain visible when meeting list scrolls",
  );
  await page.locator(".google-meetings").evaluate((e) => (e.scrollTop = 0));
  await mkdir("/workspace/scratch/d0cf15ef849a/qa-layout", { recursive: true });
  await page.locator(".recent-meeting-panel").screenshot({
    path: "/workspace/scratch/d0cf15ef849a/qa-layout/meet-sources-desktop.png",
  });
  await page
    .locator(".google-meeting")
    .nth(1)
    .getByRole("button", { name: "View sources", exact: true })
    .click();
  await sidebar
    .getByText("No generated notes or transcripts yet.", { exact: false })
    .waitFor();
  assert.equal(
    await sidebar
      .getByRole("button", { name: "Gemini notes 1 · Preview" })
      .count(),
    0,
    "Changing meetings clears previous sources",
  );
  await page
    .locator(".google-meeting")
    .nth(2)
    .getByRole("button", { name: "View sources", exact: true })
    .click();
  await sidebar.getByRole("alert").waitFor();
  await sidebar
    .getByRole("button", { name: "Close available sources" })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Hide sources", exact: true })
      .count(),
    0,
  );
  for (const width of [320, 390, 430, 768]) {
    await page.mouse.move(0, 0);
    await page.setViewportSize({ width, height: 844 });
    await page
      .locator(".google-meeting")
      .first()
      .getByRole("button", { name: "View sources", exact: true })
      .click();
    const inline = page
      .locator(".google-meeting")
      .first()
      .locator(".meet-inline-sources");
    await inline
      .getByRole("button", { name: "Gemini notes 1 · Preview", exact: true })
      .waitFor();
    assert(!(await sidebar.isVisible()), "Narrow view uses inline sources");
    assert.equal(
      await page
        .getByRole("heading", { name: "Available sources", exact: true })
        .count(),
      1,
    );
    const button = await page
      .getByRole("button", { name: "Hide sources", exact: true })
      .boundingBox();
    const inlineBounds = await inline.boundingBox();
    assert(
      inlineBounds.y >= button.y + button.height,
      "Sources expand directly under the selected button",
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await inline
      .getByRole("button", { name: "Gemini notes 1 · Preview", exact: true })
      .click();
    await page.waitForFunction(() => {
      const heading = document.querySelector(
        ".google-page:not(.google-embedded) .import-preview h2",
      );
      const rect = heading?.getBoundingClientRect();
      return (
        heading === document.activeElement &&
        rect?.top >= 70 &&
        rect.bottom < innerHeight - 80
      );
    });
    if (width === 390)
      await page.locator(".google-meeting").first().screenshot({
        path: "/workspace/scratch/d0cf15ef849a/qa-layout/meet-sources-mobile.png",
      });
    await page
      .getByRole("button", { name: "Hide sources", exact: true })
      .click();
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".google-meeting")
    .first()
    .getByRole("button", { name: "View sources", exact: true })
    .click();
  await page
    .locator(".google-meeting")
    .first()
    .locator(".meet-inline-sources")
    .getByRole("button", { name: "Gemini notes 1 · Preview", exact: true })
    .click();
  await page.waitForFunction(() => {
    const heading = document.querySelector(
      ".google-page:not(.google-embedded) .import-preview h2",
    );
    const rect = heading?.getBoundingClientRect();
    return (
      heading === document.activeElement &&
      rect?.top >= 70 &&
      rect.bottom < innerHeight - 80
    );
  });
  await page.getByRole("button", { name: "Hide sources", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator(".google-meeting")
    .first()
    .getByRole("button", { name: "View sources", exact: true })
    .click();
  await sidebar
    .getByRole("button", { name: "Gemini notes 1 · Preview", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Review your import", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "New meeting", exact: true }).click();
  for (const width of [320, 390, 430, 768, 1440]) {
    await page.mouse.move(0, 0);
    await page.setViewportSize({ width, height: 844 });
    await modalFits("New meeting " + width);
    await page
      .getByRole("radio", { name: "Recent Google Meet", exact: true })
      .click();
    const embedded = page.locator(".google-embedded");
    await embedded
      .getByRole("heading", { name: "Recent meetings", exact: true })
      .waitFor();
    await embedded
      .getByRole("button", { name: "View sources", exact: true })
      .first()
      .click();
    await embedded
      .locator(".meet-inline-sources")
      .getByRole("button", { name: "Gemini notes 1 · Preview", exact: true })
      .waitFor();
    await modalFits("Embedded sources " + width);
    await embedded
      .locator(".meet-inline-sources")
      .getByRole("button", { name: "Gemini notes 1 · Preview", exact: true })
      .click();
    await embedded
      .getByRole("heading", { name: "Review your import", exact: true })
      .waitFor();
    await page.waitForFunction(() => {
      const dialog = document.querySelector("dialog[open]");
      const heading = dialog?.querySelector(".import-preview h2");
      const rect = heading?.getBoundingClientRect();
      const bounds = dialog?.getBoundingClientRect();
      return (
        heading === document.activeElement &&
        rect?.top >= bounds.top &&
        rect.bottom < bounds.bottom
      );
    });
    await page
      .getByRole("dialog")
      .getByLabel("Meeting title", { exact: true })
      .fill("Portfolio " + "x".repeat(100));
    await modalFits("Import preview " + width);
    await page.getByRole("radio", { name: "Text", exact: true }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("dialog").evaluate((e) => (e.scrollTop = 0));
  await page.getByRole("dialog").screenshot({
    path: "/workspace/scratch/d0cf15ef849a/qa-layout/new-meeting-modal-mobile.png",
  });
  const cdp = await page.context().newCDPSession(page);
  const bounds = await page.getByRole("dialog").boundingBox();
  const before = await page.getByRole("dialog").evaluate((e) => e.scrollTop);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: bounds.x + bounds.width - 10, y: bounds.y + 350 }],
  });
  for (let i = 1; i <= 8; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: bounds.x + bounds.width - 10 - i * 3, y: bounds.y + 350 - i * 22 },
      ],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.equal(
    await page.getByRole("dialog").evaluate((e) => e.scrollLeft),
    0,
    "Diagonal touch gesture never shifts the dialog sideways",
  );
  assert(
    (await page.getByRole("dialog").evaluate((e) => e.scrollTop)) > before,
    "Vertical touch scrolling still works",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  assert.equal(
    await page.evaluate(() => document.body.style.overflow),
    "",
    "Closing dialog restores page scrolling",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Desktop side sources, independent list scrolling, mobile inline expansion, loading/empty/error states, preview actions, embedded layouts, modal fit at 320/390/430/768/1440, diagonal touch scroll, background scroll restoration and automatic review scroll/focus after source selection on mobile and in dialogs.",
  );
} catch (e) {
  console.error("Viewport", page.viewportSize());
  console.error(
    await page
      .locator(".google-meeting")
      .first()
      .evaluate(async (el) => {
        const samples = [];
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => requestAnimationFrame(r));
          const rect = el.getBoundingClientRect();
          samples.push({
            x: rect.x,
            y: rect.y,
            w: rect.width,
            h: rect.height,
            scroll: window.scrollY,
          });
        }
        return samples;
      }),
  );
  await page.screenshot({
    path: "/workspace/scratch/d0cf15ef849a/qa-layout/layout-failure.png",
  });
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
