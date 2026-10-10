// Actual built first-visit storage behavior and central meeting controls, with isolated fictional data.
import express from "express";
import { chromium } from "@playwright/test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import request from "supertest";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
const dir = await mkdtemp(join(tmpdir(), "shiftscript-experience-"));
const app = createApp({
  storage: "local",
  provider: "sample",
  store: new LocalStore(join(dir, "data.json")),
});
await request(app)
  .post("/api/workspace")
  .send({ name: "Studio workspace", ownerName: "Kiya Soko" })
  .expect(201);
await request(app)
  .post("/api/tasks")
  .send({
    title: "Review the portfolio",
    description: "Check the project before Friday.",
    owner: "Kiya Soko",
    ownerUid: "local-demo",
    deadline: "Not specified",
    dueDate: null,
    priority: "High",
    status: "To Do",
    projectId: null,
    checklist: [],
    clientId: crypto.randomUUID(),
  })
  .expect(201);
app.use(express.static(resolve("dist")));
app.get(["/app", "/app/"], (_req, res) =>
  res.sendFile(resolve("dist/index.html")),
);
const server = app.listen(3017, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
let options = { headless: true };
if (process.env.SHIFTSCRIPT_TEST_CHROMIUM) {
  const { default: bundled } = await import(
    process.env.SHIFTSCRIPT_TEST_CHROMIUM
  );
  options = {
    headless: true,
    executablePath: await bundled.executablePath(),
    args: bundled.args,
  };
}
const browser = await chromium.launch(options);
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [],
  failures = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (
    r.status() >= 400 &&
    !(r.status() === 503 && r.url().endsWith("/api/meetings"))
  )
    failures.push(r.url());
});
const origin = "http://127.0.0.1:3017";
await mkdir("docs/screenshots", { recursive: true });
try {
  await page.goto(origin);
  await page.getByRole("heading", { name: "Just the essentials." }).waitFor();
  await page.screenshot({
    path: "docs/screenshots/cookie-first-visit-desktop.png",
  });
  await page.getByRole("button", { name: "Pause movement" }).click();
  assert.equal(
    await page.locator(".ss-marquee").getAttribute("data-paused"),
    "true",
  );
  assert.equal(
    await page
      .locator(".ss-marquee-track")
      .evaluate((el) => getComputedStyle(el).animationPlayState),
    "paused",
  );
  await page.getByRole("button", { name: "Resume movement" }).click();
  await page.locator(".ss-marquee").evaluate((el) => el.blur());
  assert.equal(
    await page.locator(".ss-marquee").getAttribute("data-paused"),
    "false",
  );
  const consent = page.locator("#ss-cookie-notice");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const box = await consent.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width && box.height < 844);
    const accept = await page
      .getByRole("button", { name: "Accept essential cookies" })
      .boundingBox();
    assert(accept.height >= 44 && accept.width >= 44);
  }
  await page.getByRole("button", { name: "Accept essential cookies" }).click();
  assert.equal(await consent.count(), 0);
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("shiftscript:cookie-preferences:v1"))
          .optional,
    ),
    false,
  );
  await page.locator(".ss-marquee").screenshot({
    path: "docs/screenshots/home-marquee-desktop.png",
    animations: "disabled",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".ss-marquee")
    .screenshot({ path: "docs/screenshots/home-marquee-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  assert.equal(await consent.count(), 0);
  await page.goto(origin + "/privacy/");
  await page.getByRole("button", { name: "Cookie preferences" }).click();
  await page.getByRole("heading", { name: "Just the essentials." }).waitFor();
  await page.getByRole("button", { name: "Accept essential cookies" }).click();
  await page.goto(origin + "/app");
  await page
    .getByRole("heading", { name: "Less follow-up. More follow-through." })
    .waitFor();
  assert.equal(await consent.count(), 0);
  const action = page.getByRole("button", {
    name: "Add new meeting",
    exact: true,
  });
  const nav = page.getByRole("navigation", { name: "Quick navigation" });
  for (const width of [320, 360, 390, 414, 650]) {
    await page.setViewportSize({ width, height: 844 });
    const box = await action.boundingBox();
    assert(Math.abs(box.x + box.width / 2 - width / 2) < 1);
    assert(box.width >= 72 && box.height >= 72);
    assert.equal(await nav.getByRole("button").count(), 4);
    for (const item of await nav.getByRole("button").all()) {
      const b = await item.boundingBox();
      assert(b.width >= 44 && b.height >= 44);
      assert(
        b.x + b.width <= box.x || b.x >= box.x + box.width,
        "A tab overlaps the central button",
      );
    }
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const toolbar = await page
      .getByRole("button", { name: "Search workspace" })
      .boundingBox();
    assert(toolbar.width >= 44 && toolbar.height >= 44);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".mobile-meeting-ring")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await action.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "A new conversation" }).waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "docs/screenshots/mobile-meeting-button.png" });
  // Hold an actual processing request to inspect status, motion and error recovery.
  const letters = await page
    .locator(".mobile-meeting-ring > span")
    .evaluateAll((elements) =>
      elements.map((el) =>
        parseFloat(el.style.getPropertyValue("--letter-angle")),
      ),
    );
  assert.equal(
    letters.length,
    Array.from("NEW MEETING • NEW MEETING • ").length,
  );
  const step = 360 / letters.length;
  for (let i = 1; i < letters.length; i++)
    assert(Math.abs(letters[i] - letters[i - 1] - step) < 0.001);
  assert(
    Math.abs(360 - letters.at(-1) - step) < 0.001,
    "Circular text has an oversized closing gap",
  );
  let releaseProcessing;
  let processingFailed = false;
  let responseGate = new Promise((resolve) => {
    releaseProcessing = resolve;
  });
  await page.route("**/api/meetings", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await responseGate;
    if (!processingFailed) {
      processingFailed = true;
      return route.fulfill({
        status: 503,
        json: { error: "Simulated processing failure. Try again." },
      });
    }
    return route.continue();
  });
  await action.click();
  await page.getByRole("button", { name: "Load sample", exact: true }).click();
  await page
    .getByRole("button", { name: "Process transcript", exact: true })
    .click();
  const loader = page.locator(".processing-status");
  await loader
    .getByText("Reading the conversation…", { exact: true })
    .waitFor();
  assert.equal(await loader.locator("li").count(), 9);
  assert.equal(
    await loader
      .locator("li")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(36, 88, 232)",
  );
  assert.equal(
    await loader
      .locator("li")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  assert(
    await page
      .getByRole("button", { name: "Processing…", exact: true })
      .isDisabled(),
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  assert.equal(
    await loader
      .locator("li")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
    "ss-wave-1",
  );
  // Changing the motion preference restarts the finite dialog entrance. Measure its settled layout.
  await page.getByRole("dialog").evaluate(async (el) => {
    await Promise.all(
      el.getAnimations().map((animation) => animation.finished.catch(() => {})),
    );
  });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await loader.scrollIntoViewIfNeeded();
    const b = await loader.locator(".ss-wave-loader").boundingBox();
    assert(
      b.width === 200 && b.height === 45 && b.x >= 0 && b.x + b.width <= width,
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("dialog")
    .screenshot({ path: "docs/screenshots/transcript-loader-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await loader.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/transcript-loader-mobile.png",
  });
  releaseProcessing();
  await page
    .getByRole("alert")
    .getByText("Simulated processing failure. Try again.")
    .waitFor();
  assert.equal(await loader.count(), 0);
  assert(
    !(await page
      .getByRole("button", { name: "Process transcript", exact: true })
      .isDisabled()),
  );
  responseGate = new Promise((resolve) => {
    releaseProcessing = resolve;
  });
  await page
    .getByRole("button", { name: "Process transcript", exact: true })
    .click();
  await loader.waitFor();
  releaseProcessing();
  await page
    .getByRole("heading", { name: "Meeting summary", exact: true })
    .waitFor();
  assert.equal(await loader.count(), 0);
  await page.unroute("**/api/meetings");
  await page.evaluate(() => {
    window.previousView = document.querySelector(".page-transition");
  });
  await nav.getByRole("button", { name: "Go to Tasks", exact: true }).click();
  assert(
    await page.evaluate(
      () => window.previousView !== document.querySelector(".page-transition"),
    ),
    "Tab did not receive a fresh transition",
  );
  assert.equal(
    await page
      .locator(".page-transition")
      .evaluate((el) => getComputedStyle(el).animationName),
    "ss-page-enter",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".page-transition")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );

  const calendar = page
    .getByRole("button", {
      name: "Add Review the portfolio to Google Calendar",
      exact: true,
    })
    .first();
  await calendar.waitFor();
  const calendarBox = await calendar.boundingBox();
  assert(calendarBox.height >= 44 && calendarBox.width >= 44);
  assert.equal(
    await calendar.evaluate((el) => getComputedStyle(el).fontSize),
    "14px",
  );
  await calendar.click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await calendar.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({
    path: "docs/screenshots/calendar-controls-mobile.png",
  });
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(!(await action.isVisible()));
    const b = await page
      .getByRole("button", { name: "Search workspace" })
      .boundingBox();
    assert(b.width >= 48 && b.height >= 48);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() =>
    localStorage.removeItem("shiftscript:cookie-preferences:v1"),
  );
  await page.reload();
  await page.getByRole("heading", { name: "Just the essentials." }).waitFor();
  await action.waitFor();
  const noticeBox = await consent.boundingBox(),
    fabBox = await action.boundingBox();
  assert(
    noticeBox.y + noticeBox.height < fabBox.y,
    "Cookie notice covers mobile meeting button",
  );
  await page.screenshot({
    path: "docs/screenshots/cookie-first-visit-mobile.png",
  });
  await page.getByRole("button", { name: "Accept essential cookies" }).click();
  // Notification in another tab dismisses an already-open notice.
  const other = await context.newPage();
  await other.goto(origin);
  await other.getByRole("button", { name: "Cookie preferences" }).click();
  await page.getByRole("button", { name: "Cookie preferences" }).click();
  await page.getByRole("button", { name: "Accept essential cookies" }).click();
  await other.locator("#ss-cookie-notice").waitFor({ state: "detached" });
  await other.close();
  const blocked = await browser.newPage({
    viewport: { width: 320, height: 844 },
  });
  await blocked.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Storage unavailable", "SecurityError");
      },
    });
  });
  await blocked.goto(origin);
  await blocked
    .getByRole("button", { name: "Accept essential cookies" })
    .click();
  assert.equal(await blocked.locator("#ss-cookie-notice").count(), 0);
  await blocked.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log(
    "PASS: first-visit notice, essential-only persistence, policy/app preferences, cross-tab updates, blocked storage, marquee pause/reduced motion, centred mobile action with gap-free lettering, keyboard activation, processing loader/request lifecycle/error recovery, tab transitions/reduced motion, four non-overlapping tabs, 320–650px touch targets and desktop toolbar/calendar controls.",
  );
} catch (error) {
  await page.screenshot({
    path: "docs/screenshots/experience-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
