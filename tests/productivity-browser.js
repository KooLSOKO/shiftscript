// Real UI and API against an isolated local database. No live mail, Gemini or Calendar calls.
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { sampleTranscript } from "../server/analyze.js";
const dir = await mkdtemp(join(tmpdir(), "shiftscript-productivity-ui-")),
  store = new LocalStore(join(dir, "db.json")),
  app = createApp({ storage: "local", provider: "sample", store });
const identity = {
  name: "Kiya Soko",
  aliases: ["VS"],
  preferences: {
    inAppNotifications: true,
    emailReminders: false,
    remindBeforeDays: 1,
    timeZone: "Africa/Johannesburg",
  },
};
await request(app).patch("/api/profile").send(identity).expect(200);
await request(app)
  .post("/api/workspace")
  .send({ name: "Earny studio", ownerName: "Kiya Soko" })
  .expect(201);
const base = {
  description: "Review portfolio pages",
  owner: "Kiya Soko",
  ownerUid: "local-demo",
  deadline: "Not specified",
  dueDate: null,
  priority: "Med",
  status: "To Do",
  projectId: null,
  checklist: [],
};
const first = (
  await request(app)
    .post("/api/tasks")
    .send({ ...base, title: "Draft portfolio", clientId: crypto.randomUUID() })
    .expect(201)
).body.task;
const second = (
  await request(app)
    .post("/api/tasks")
    .send({
      ...base,
      title: "Review portfolio",
      dependencyIds: [first.id],
      clientId: crypto.randomUUID(),
    })
    .expect(201)
).body.task;
const priorMeeting = (
  await request(app)
    .post("/api/meetings")
    .send({
      title: "Prior client review",
      date: "2026-10-09",
      type: "Client meeting",
      transcript: sampleTranscript,
    })
    .expect(201)
).body.meeting;
const proposal = priorMeeting.proposals[0];
await request(app)
  .post(`/api/meetings/${priorMeeting.id}/reviews`)
  .send({
    reviews: [
      {
        title: "Prior commitment",
        description: proposal.description,
        owner: "Kopano",
        ownerUid: null,
        deadline: proposal.deadline,
        dueDate: null,
        priority: proposal.priority,
        proposalId: proposal.id,
        decision: "approved",
      },
    ],
  })
  .expect(200);
const server = app.listen(3013, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5183,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3013" },
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
const browser = await chromium.launch(options),
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Africa/Johannesburg",
    reducedMotion: "reduce",
  });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await mkdir("docs/screenshots", { recursive: true });
const dialog = () => page.getByRole("dialog");
const close = async () =>
  page.getByRole("button", { name: "Close dialog", exact: true }).click();
try {
  await page.goto("http://127.0.0.1:5183/app");
  await page
    .getByRole("heading", { name: "Less follow-up. More follow-through." })
    .waitFor();
  await page.getByRole("button", { name: /Notifications/ }).click();
  await dialog()
    .getByText("Assigned to you", { exact: true })
    .first()
    .waitFor();
  await dialog().getByRole("button", { name: "Mark all read" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".notification-item.read").length === 2,
  );
  await close();
  await page.getByRole("button", { name: "Task tracker", exact: true }).click();
  await page
    .getByRole("button", { name: "Review portfolio", exact: true })
    .click();
  await dialog()
    .getByText("Waiting on 1 unfinished task(s).", { exact: true })
    .waitFor();
  assert.ok(
    await dialog()
      .getByRole("combobox", { name: "Status", exact: true })
      .locator("option")
      .filter({ hasText: "Completed" })
      .evaluate((option) => option.disabled),
  );
  await close();
  await page
    .getByRole("button", { name: "Draft portfolio", exact: true })
    .click();
  await dialog().getByRole("button", { name: "Tomorrow", exact: true }).click();
  assert.ok(
    await dialog()
      .getByLabel("Confirmed due date", { exact: true })
      .inputValue(),
  );
  await dialog()
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await dialog().getByText("Changes saved.", { exact: true }).waitFor();
  await close();
  await page
    .getByRole("checkbox", { name: "Select Draft portfolio", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select Review portfolio", exact: true })
    .check();
  await page
    .getByRole("combobox", { name: "Bulk task priority" })
    .selectOption("High");
  await page.getByRole("button", { name: "Apply to selected tasks" }).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('input[aria-label^="Select "]:checked')
        .length === 0,
  );
  assert.ok(
    (await store.list("local-demo")).tasks
      .filter((task) => [first.id, second.id].includes(task.id))
      .every((task) => task.priority === "High"),
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByText("Changes undone.", { exact: true }).waitFor();
  assert.ok(
    (await store.list("local-demo")).tasks
      .filter((task) => [first.id, second.id].includes(task.id))
      .every((task) => task.priority === "Med"),
  );
  await page
    .getByRole("button", { name: "My overdue tasks", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Saved view name" })
    .fill("My urgent work");
  await page.getByRole("button", { name: "Save view", exact: true }).click();
  await page
    .getByRole("button", { name: "My urgent work", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.keyboard.press("Control+k");
  await dialog().getByRole("textbox").fill("Draft portfolio");
  await dialog()
    .getByRole("button", { name: /Draft portfolio/ })
    .click();
  await dialog().getByRole("heading", { name: "Task details" }).waitFor();
  await close();
  await page
    .getByRole("button", {
      name: "Add Draft portfolio to Google Calendar",
      exact: true,
    })
    .click();
  await dialog()
    .getByLabel("Calendar date", { exact: true })
    .fill("2026-10-15");
  await dialog().getByLabel("Start time", { exact: true }).fill("09:00");
  await dialog().getByRole("button", { name: "Save schedule to task" }).click();
  await dialog()
    .getByText("Schedule saved to this task.", { exact: true })
    .waitFor();
  await close();
  assert.equal(
    (await store.list("local-demo")).tasks.find((t) => t.id === first.id)
      .schedule.time,
    "09:00",
  );
  await page
    .getByRole("button", {
      name: "Add Draft portfolio to Google Calendar",
      exact: true,
    })
    .click();
  assert.equal(
    await dialog().getByLabel("Start time", { exact: true }).inputValue(),
    "09:00",
  );
  await page.evaluate(() => {
    window.open = () => null;
  });
  await dialog()
    .getByRole("button", { name: "Open Google Calendar", exact: false })
    .click();
  await dialog()
    .getByRole("button", {
      name: "I saved this event in Google Calendar",
      exact: true,
    })
    .click();
  await dialog()
    .getByText("Marked added to your calendar", { exact: true })
    .waitFor();
  await close();
  assert.equal((await store.getProfile("local-demo")).calendarMarks.length, 1);
  await page
    .getByRole("button", { name: "View your profile", exact: true })
    .click();
  await page.getByLabel("Profile name", { exact: true }).fill("Victor Soko");
  const photo = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 20;
    const context = canvas.getContext("2d");
    context.fillStyle = "#2458e8";
    context.fillRect(0, 0, 20, 20);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Profile photo", { exact: true }).setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(photo, "base64"),
  });
  await page.getByRole("img", { name: "New profile photo preview" }).waitFor();
  await page
    .getByLabel("Names people call you", { exact: false })
    .fill("VS, Kiya");
  await page
    .getByRole("button", { name: "Save profile & preferences", exact: true })
    .click();
  await page
    .getByText("Your profile and preferences are saved.", { exact: true })
    .waitFor();
  assert.equal((await store.getProfile("local-demo")).name, "Victor Soko");
  assert.match(
    (await store.getProfile("local-demo")).avatar,
    /^data:image\/webp;base64,/,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/profile-settings-desktop.png",
    fullPage: true,
    style: ".toast,.undo-banner,.skip-link{visibility:hidden!important}",
  });
  await page.getByRole("button", { name: "Meetings", exact: true }).click();
  await page.getByRole("button", { name: "Prepare meeting agenda" }).click();
  await dialog()
    .getByRole("combobox", { name: "Previous meeting for agenda" })
    .selectOption({ label: "Prior client review" });
  await dialog()
    .getByRole("button", { name: "Generate agenda from existing work" })
    .click();
  assert.match(
    await dialog().getByLabel("Meeting agenda", { exact: true }).inputValue(),
    /Prior commitment/,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/agenda-desktop.png",
    fullPage: true,
    style: ".toast,.undo-banner,.skip-link{visibility:hidden!important}",
  });
  await dialog().getByRole("button", { name: "Use for new meeting" }).click();
  await dialog().getByRole("heading", { name: "A new conversation" }).waitFor();
  await dialog()
    .getByRole("button", { name: "Load sample", exact: true })
    .click();
  await dialog()
    .getByRole("button", { name: "Process transcript", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Follow-through from the previous meeting",
      exact: true,
    })
    .waitFor();
  assert.equal((await store.list("local-demo")).agendas.length, 1);
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page
    .getByRole("heading", { name: "Workspace activity", exact: true })
    .waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/activity-desktop.png",
    fullPage: true,
    style: ".toast,.undo-banner,.skip-link{visibility:hidden!important}",
  });
  await page.getByRole("button", { name: "Task tracker", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Select Draft portfolio", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select Review portfolio", exact: true })
    .check();
  await page.getByRole("button", { name: "Schedule selected tasks" }).click();
  await dialog()
    .getByLabel("Date for Review portfolio", { exact: true })
    .fill("2026-10-15");
  await dialog()
    .getByLabel("Time for Review portfolio", { exact: true })
    .fill("10:00");
  await dialog()
    .getByRole("button", { name: "Save schedules", exact: true })
    .click();
  await dialog()
    .getByRole("link", { name: "Open event draft", exact: false })
    .first()
    .waitFor();
  assert.equal(
    (await store.list("local-demo")).tasks.filter((t) => t.schedule).length,
    2,
  );
  await close();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/productivity-desktop.png",
    fullPage: true,
    style: ".toast,.undo-banner,.skip-link{visibility:hidden!important}",
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page
      .getByRole("button", { name: "Go to Tasks", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Details", exact: true })
      .first()
      .waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Task page overflow at " + width,
    );
    if (width === 390) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: "docs/screenshots/productivity-mobile.png",
        fullPage: true,
        style: ".toast,.undo-banner,.skip-link{visibility:hidden!important}",
      });
    }
    await page
      .getByRole("button", { name: "Details", exact: true })
      .first()
      .click();
    assert.ok(
      await page.evaluate(
        () =>
          document.querySelector("dialog").scrollWidth <=
          document.querySelector("dialog").clientWidth + 1,
      ),
      "Task editor overflow at " + width,
    );
    await close();
    await page
      .getByRole("button", { name: "View your profile", exact: true })
      .click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Profile overflow at " + width,
    );
    if (width === 390) await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "docs/screenshots/profile-settings-mobile.png",
      fullPage: true,
      style: ".toast,.undo-banner,.skip-link{visibility:hidden!important}",
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: notifications/read, aliases/profile, dependencies, bulk priority/undo, saved views, global search, persisted schedules/bulk Calendar, saved agendas/follow-up comparison, activity, mobile 390/320 px; no live external calls.",
  );
} catch (error) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/productivity-failure.png",
    fullPage: true,
    style: ".toast,.undo-banner,.skip-link{visibility:hidden!important}",
  });
  console.error(await page.locator("body").innerText(), errors);
  throw error;
} finally {
  await browser.close();
  await vite.close();
  server.close();
  await rm(dir, { recursive: true, force: true });
}
