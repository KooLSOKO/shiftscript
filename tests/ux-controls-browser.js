// Real app/API interactions; delayed network gates prove immediate feedback and safe rollback.
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import request from "supertest";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { shim } from "./fixtures/auth-shim.js";
const dir = await mkdtemp(join(tmpdir(), "shift-ux-"));
const store = new LocalStore(join(dir, "db.json"));
const app = createApp({
  storage: "firebase",
  provider: "sample",
  signupEnabled: true,
  store,
  verifyToken: async (uid) => ({
    uid,
    name: "Kiya Soko",
    email: uid + "@example.test",
    email_verified: true,
  }),
});
const api = (method, path) =>
  request(app)
    [method]("/api" + path)
    .set("Authorization", "Bearer soko")
    .set("X-Workspace-Id", "soko");
await api("post", "/workspace")
  .send({ name: "Earny Studio", ownerName: "Kiya Soko" })
  .expect(201);
await api("patch", "/profile").send({ tutorialVersion: 1 }).expect(200);
const task = (
  await api("post", "/tasks")
    .send({
      title: "Review portfolio",
      description: "Keep the original context.",
      owner: "Kiya Soko",
      ownerUid: "soko",
      deadline: "Not specified",
      dueDate: null,
      priority: "High",
      status: "To Do",
      projectId: null,
      checklist: [],
      clientId: crypto.randomUUID(),
    })
    .expect(201)
).body.task;
const server = app.listen(3038, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5188,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3038" },
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
    hasTouch: true,
  });
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(
    /\/node_modules\/\.vite\/deps\/firebase_auth\.js(?:\?|$)/,
    (route) =>
      route.fulfill({ contentType: "application/javascript", body: shim }),
  );
  await page.route("https://**", (route) => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem(
      "shiftscript:cookie-preferences:v1",
      JSON.stringify({ version: 1, essential: true, optional: false }),
    );
    localStorage.setItem(
      "test-session",
      JSON.stringify({
        uid: "soko",
        email: "soko@example.test",
        displayName: "Kiya Soko",
        emailVerified: true,
      }),
    );
  });
  await page.goto("http://127.0.0.1:5188/app");
  await page
    .getByRole("button", { name: "Shortcuts and tutorial", exact: true })
    .waitFor();
  await page.keyboard.press("b");
  await page
    .getByRole("button", { name: "Move Review portfolio", exact: true })
    .waitFor();
  let release,
    observed = false;
  const gate = new Promise((r) => (release = r));
  let reads = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/workspace" && r.method() === "GET")
      reads++;
  });
  await page.route("**/api/tasks/*/move", async (route) => {
    observed = true;
    await gate;
    await route.continue();
  });
  await page
    .getByLabel("Status for Review portfolio", { exact: true })
    .selectOption("In Progress");
  await expect(page.locator('[data-board-status="In Progress"]')).toContainText(
    "Review portfolio",
  );
  await expect.poll(() => observed).toBe(true);
  assert.equal((await store.list("soko")).tasks[0].status, "To Do");
  await expect(
    page.locator('[data-board-task="' + task.id + '"] .board-saving-badge'),
  ).toHaveText("Saving…");
  release();
  await expect(page.locator(".board-feedback")).toContainText(
    "moved to In Progress",
  );
  await page.unroute("**/api/tasks/*/move");
  assert.equal(reads, 0, "A successful move should not reload the workspace");
  assert.equal((await store.list("soko")).tasks[0].status, "In Progress");
  await page.keyboard.press("Control+z");
  await expect(page.locator('[data-board-status="To Do"]')).toContainText(
    "Review portfolio",
  );
  let releaseFailure;
  const failedGate = new Promise((r) => (releaseFailure = r));
  await page.route("**/api/tasks/*/move", async (route) => {
    await failedGate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Simulated network save failure" }),
    });
  });
  await page
    .getByLabel("Status for Review portfolio", { exact: true })
    .selectOption("Blocked");
  await expect(page.locator('[data-board-status="Blocked"]')).toContainText(
    "Review portfolio",
  );
  releaseFailure();
  await expect(page.locator(".board-feedback")).toContainText(
    "Could not confirm",
  );
  await expect(page.locator('[data-board-status="To Do"]')).toContainText(
    "Review portfolio",
  );
  await page.unroute("**/api/tasks/*/move");
  await page
    .getByLabel("Status for Review portfolio", { exact: true })
    .selectOption("In Review");
  await expect(page.locator(".board-feedback")).toContainText(
    "moved to In Review",
  );
  assert.equal(
    (await store.list("soko")).tasks[0].description,
    "Keep the original context.",
  );
  console.log(
    "Immediate board movement before the server request, pending indicator, no success reload, Undo, failure rollback/reconciliation and retry passed.",
  );
  await page
    .getByRole("button", { name: "Review portfolio", exact: true })
    .click();
  const outer = page.getByRole("dialog", { name: "Task details", exact: true });
  await outer.getByRole("button", { name: "Delete task", exact: true }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(outer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  assert.equal((await store.list("soko")).tasks.length, 1);
  let releaseDraft;
  const draftGate = new Promise((r) => (releaseDraft = r));
  await page.route("**/api/drafts/current", async (route) => {
    if (route.request().method() === "PUT") await draftGate;
    await route.continue();
  });
  await page.keyboard.press("n");
  const meeting = () =>
    page.getByRole("dialog", { name: "A new conversation", exact: true });
  await meeting()
    .getByLabel("Meeting title", { exact: true })
    .fill("First private draft");
  const choices = meeting().getByRole("radiogroup", {
    name: "Meeting source",
    exact: true,
  });
  await expect(meeting().locator(".source-stick")).toBeHidden();
  for (const name of [
    "Voice",
    "Recent Google Meet",
    "Previous meeting",
    "Text",
  ]) {
    await choices.getByRole("radio", { name, exact: true }).click();
    await expect(
      choices.getByRole("radio", { name, exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    const bounds = await choices
      .getByRole("radio", { name, exact: true })
      .boundingBox();
    assert(bounds.height >= 100);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0, { timeout: 1500 });
  await page.keyboard.press("n");
  await expect(
    meeting().getByLabel("Meeting title", { exact: true }),
  ).toHaveValue("First private draft");
  await meeting()
    .getByLabel("Meeting title", { exact: true })
    .fill("Revised private draft");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0, { timeout: 1500 });
  releaseDraft();
  await expect
    .poll(async () => (await api("get", "/workspace")).body.draft?.title)
    .toBe("Revised private draft");
  await page.unroute("**/api/drafts/current");
  console.log(
    "Escape closes only the top nested dialog; draft editor closes immediately and reopening before cloud save preserves the latest draft without version conflicts. Desktop source buttons passed.",
  );
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 950 });
    await expect(
      page.getByRole("button", { name: "Shortcuts and tutorial", exact: true }),
    ).toBeHidden();
    await page
      .getByRole("button", { name: "View your profile", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Replay workspace tutorial", exact: true })
      .click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const tour = page.getByRole("dialog", {
      name: "Ready for your next meeting",
      exact: true,
    });
    await expect(tour.locator("table,kbd")).toHaveCount(0);
    assert(!(await tour.innerText()).includes("Ctrl"));
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    if (width <= 650)
      await page
        .getByRole("button", { name: "Add new meeting", exact: true })
        .click();
    else {
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await page.getByRole("button", { name: "Overview", exact: true }).click();
      await page
        .getByRole("button", { name: "New meeting", exact: true })
        .click();
    }
    await expect(meeting().locator(".source-stick")).toBeVisible();
    await expect(meeting().locator(".desktop-source-help")).toBeHidden();
    await choices.getByRole("radio", { name: "Text", exact: true }).click();
    await meeting().locator(".source-stick").scrollIntoViewIfNeeded();
    const box = await meeting().locator(".source-stick").boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: box.x + box.width / 2 + 45, y: box.y + box.height / 2 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(
      choices.getByRole("radio", { name: "Voice", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await cdp.detach();
    assert(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    );
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    console.log(
      `Mobile ${width}px: no keyboard header/guide, touch tutorial, directional touch selection, Escape and viewport bounds passed.`,
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await vite.close();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
