// Dashboard shortcuts against isolated sample data; no live integrations.
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { sampleTranscript } from "../server/analyze.js";

const dir = await mkdtemp(join(tmpdir(), "shiftscript-dashboard-"));
const app = createApp({
  storage: "local",
  provider: "sample",
  store: new LocalStore(join(dir, "data.json")),
});
await request(app)
  .post("/api/workspace")
  .send({ name: "Shortcut studio", ownerName: "Kiya Soko" })
  .expect(201);
const project = (
  await request(app)
    .post("/api/projects")
    .send({
      name: "Portfolio project",
      description: "Client delivery",
      color: "blue",
      status: "active",
    })
    .expect(201)
).body.project;
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Johannesburg",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const shifted = new Date(date + "T12:00:00Z");
shifted.setUTCDate(shifted.getUTCDate() - 1);
const yesterday = shifted.toISOString().slice(0, 10);
for (const [title, status, dueDate] of [
  ["Active next step", "To Do", null],
  ["Overdue action", "In Progress", yesterday],
  ["Blocked handoff", "Blocked", null],
  ["Completed archive", "Completed", yesterday],
]) {
  await request(app)
    .post("/api/tasks")
    .send({
      title,
      description: "A fictional commitment",
      owner: "Kiya Soko",
      ownerUid: "local-demo",
      deadline: dueDate || "Not specified",
      dueDate,
      priority: "Med",
      status,
      projectId: project.id,
      checklist: [],
      clientId: crypto.randomUUID(),
    })
    .expect(201);
}
for (const title of [
  "Pending portfolio",
  "Pending sprint",
  "Reviewed team meeting",
]) {
  const meeting = (
    await request(app)
      .post("/api/meetings")
      .send({
        title,
        date,
        type: "Client meeting",
        transcript: sampleTranscript,
      })
      .expect(201)
  ).body.meeting;
  if (title === "Reviewed team meeting") {
    await request(app)
      .post(`/api/meetings/${meeting.id}/reviews`)
      .send({
        reviews: meeting.proposals.map((p) => ({
          proposalId: p.id,
          title: p.title,
          description: p.description,
          owner: p.owner,
          ownerUid: null,
          deadline: p.deadline,
          dueDate: p.dueDate,
          priority: p.priority,
          decision: "rejected",
        })),
      })
      .expect(200);
  }
}
await request(app)
  .post("/api/workspaces")
  .send({ name: "Empty studio", ownerName: "Kiya Soko" })
  .expect(201);
const apiServer = app.listen(3016, "127.0.0.1");
await new Promise((resolve) => apiServer.once("listening", resolve));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5186,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3016" },
  },
});
await vite.listen();
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
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  timezoneId: "Africa/Johannesburg",
  reducedMotion: "reduce",
});
await page.addInitScript(() =>
  localStorage.setItem(
    "shiftscript:cookie-preferences:v1",
    JSON.stringify({ version: 1, essential: true, optional: false }),
  ),
);
page.setDefaultTimeout(15000);
await page.addInitScript(() =>
  localStorage.setItem("shiftscript:workspace:local-demo", "local-demo"),
);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await mkdir("docs/screenshots", { recursive: true });
const shortcuts = () =>
  page.getByRole("region", { name: "Workspace shortcuts" });
const card = (label, count) =>
  shortcuts().getByRole("button", {
    name: `View ${label.toLowerCase()}: ${count}`,
    exact: true,
  });
async function overview() {
  const quick = page.getByRole("navigation", { name: "Quick navigation" });
  if (await quick.isVisible())
    await quick
      .getByRole("button", { name: "Go to Overview", exact: true })
      .click();
  else {
    const nav = page.getByRole("button", { name: "Overview", exact: true });
    if (!(await nav.isVisible()))
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    await nav.click();
  }
  await shortcuts().waitFor();
}
const taskButton = (title) =>
  page.getByRole("button", { name: title, exact: true });
try {
  await page.goto("http://127.0.0.1:5186/app");
  await shortcuts().waitFor();
  assert.equal(await shortcuts().getByRole("button").count(), 7);
  for (const [label, count] of [
    ["Meetings processed", 3],
    ["Projects", 1],
    ["Awaiting approval", 6],
    ["Active tasks", 3],
    ["Completed", 1],
    ["Blocked", 1],
    ["Overdue", 1],
  ])
    assert(await card(label, count).isVisible());
  // Keyboard activation must reach the same filtered view as pointer activation.
  await card("Active tasks", 3).focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page
      .getByRole("combobox", { name: "Status", exact: true })
      .inputValue(),
    "Active",
  );
  assert.equal(await taskButton("Completed archive").count(), 0);
  assert(await taskButton("Active next step").isVisible());
  await overview();
  await card("Completed", 1).focus();
  await page.keyboard.press("Space");
  assert.equal(
    await page
      .getByRole("combobox", { name: "Status", exact: true })
      .inputValue(),
    "Completed",
  );
  assert(await taskButton("Completed archive").isVisible());
  assert.equal(await taskButton("Active next step").count(), 0);
  await overview();
  await card("Blocked", 1).click();
  assert.equal(
    await page
      .getByRole("combobox", { name: "Status", exact: true })
      .inputValue(),
    "Blocked",
  );
  assert(await taskButton("Blocked handoff").isVisible());
  // A shortcut must reset stale search/owner/priority/status filters.
  await page
    .getByRole("combobox", { name: "Priority", exact: true })
    .selectOption("High");
  await page
    .getByPlaceholder("Task, owner or meeting")
    .fill("unrelated search");
  await overview();
  await card("Overdue", 1).click();
  assert.equal(
    await page
      .getByRole("combobox", { name: "Due date", exact: true })
      .inputValue(),
    "Overdue",
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "Status", exact: true })
      .inputValue(),
    "All",
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "Priority", exact: true })
      .inputValue(),
    "All",
  );
  assert.equal(
    await page.getByPlaceholder("Task, owner or meeting").inputValue(),
    "",
  );
  assert(await taskButton("Overdue action").isVisible());
  assert.equal(await taskButton("Completed archive").count(), 0);
  await overview();
  await card("Awaiting approval", 6).click();
  assert.equal(
    await page
      .getByRole("combobox", { name: "Meeting review", exact: true })
      .inputValue(),
    "Pending",
  );
  assert.equal(await page.locator(".meeting-row").count(), 2);
  assert.equal(
    await page.getByRole("button", { name: /^Reviewed team meeting/ }).count(),
    0,
  );
  await page.getByPlaceholder("Search title or summary").fill("no match");
  await overview();
  await card("Meetings processed", 3).click();
  assert.equal(
    await page
      .getByRole("combobox", { name: "Meeting review", exact: true })
      .inputValue(),
    "All",
  );
  assert.equal(
    await page.getByPlaceholder("Search title or summary").inputValue(),
    "",
  );
  assert.equal(await page.locator(".meeting-row").count(), 3);
  await overview();
  await card("Projects", 1).click();
  await page
    .getByRole("heading", { name: "Portfolio project", exact: true })
    .waitFor();
  await overview();
  await page.evaluate(() => document.fonts.ready);
  assert.match(
    await page
      .locator(".stat")
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily),
    /Manrope/,
  );
  await shortcuts().screenshot({
    path: "docs/screenshots/dashboard-shortcuts-desktop.png",
  });
  for (const width of [320, 390, 768, 2048]) {
    await page.setViewportSize({ width, height: 1050 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow at ${width}`,
    );
    for (const button of await shortcuts().getByRole("button").all()) {
      const box = await button.boundingBox();
      assert(
        box.width >= 44 &&
          box.height >= 44 &&
          box.x >= 0 &&
          box.x + box.width <= width + 1,
      );
    }
    if (width === 390) {
      await shortcuts().evaluate((el) =>
        window.scrollTo(
          0,
          Math.max(0, window.scrollY + el.getBoundingClientRect().top - 100),
        ),
      );
      await shortcuts().screenshot({
        path: "docs/screenshots/dashboard-shortcuts-mobile.png",
      });
    }
  }
  // Workspace switches clear approval filters; zero totals are still usable.
  await page
    .getByRole("button", { name: "Switch workspace", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Empty studio/ })
    .click();
  await card("Awaiting approval", 0).waitFor();
  assert(!(await card("Awaiting approval", 0).isDisabled()));
  await card("Awaiting approval", 0).click();
  await page
    .getByRole("heading", { name: "No meetings in this view", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Switch workspace", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Shortcut studio/ })
    .click();
  await card("Meetings processed", 3).click();
  assert.equal(
    await page
      .getByRole("combobox", { name: "Meeting review", exact: true })
      .inputValue(),
    "All",
  );
  assert.equal(await page.locator(".meeting-row").count(), 3);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: all seven dashboard shortcuts, keyboard Enter/Space, correct task subsets, all pending meetings, stale filter reset, workspace isolation/reset, zero totals, Manrope and 320/390/768/2048px layouts.",
  );
} catch (error) {
  await page.screenshot({
    path: "docs/screenshots/dashboard-shortcuts-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
  await vite.close();
  await new Promise((resolve) => apiServer.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
