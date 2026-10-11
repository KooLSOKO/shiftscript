// Actual React/API workflow with fictional calendar, model and SMTP adapters.
// This suite never reads credentials, calls a live provider or sends real mail.
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { newWorkspace } from "../server/collaboration.js";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { dateInZone, addDays } from "../shared/productivity.js";
const directory = await mkdtemp(join(tmpdir(), "shift-assistant-ui-"));
const store = new LocalStore(join(directory, "workspace.json"));
await store.mutateProfile("local-demo", (p) => {
  p.name = "Kiya";
});
const zone = "Africa/Johannesburg",
  future = addDays(dateInZone(), 2);
const task = {
  id: "task-one",
  title: "Review the portfolio",
  description: "Check the mobile layout.",
  owner: "Kiya",
  ownerUid: "local-demo",
  status: "To Do",
  priority: "High",
  dueDate: null,
  deadline: "Not specified",
  meetingId: "meeting-one",
  meetingTitle: "Portfolio review",
  projectId: null,
  notes: [],
  checklist: [],
  dependencyIds: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
await store.mutate("local-demo", (s) => {
  s.workspace = newWorkspace(
    "local-demo",
    { name: "Earny Studio", ownerName: "Kiya" },
    { uid: "local-demo", name: "Kiya", email: "kiya@example.test" },
  );
  s.tasks.push(task);
  s.meetings.push({
    id: "meeting-one",
    title: "Portfolio review",
    date: dateInZone(),
    transcript:
      "Kiya: Let's keep blue. Kopano: I will prepare the launch post.",
    summary:
      "Kiya and Kopano reviewed the portfolio and agreed to keep the blue layout.",
    discussionPoints: ["Review the portfolio on mobile."],
    decisions: ["Keep the blue layout."],
    followUps: ["Confirm the launch post."],
    proposals: [
      {
        id: "approved-one",
        taskId: "task-one",
        title: task.title,
        owner: "Kiya",
        deadline: null,
        reviewStatus: "approved",
        evidence: "Kiya: I will review mobile.",
      },
      {
        id: "pending-one",
        title: "Prepare launch post",
        owner: "Kopano",
        deadline: null,
        reviewStatus: "pending",
        evidence: "Kopano: I will prepare the launch post.",
      },
    ],
  });
});
let selectedIds = ["primary"],
  connected = true,
  unavailable = false,
  blocks = 0,
  sent = 0;
const recipientsSent = [];
const calendars = [
  { id: "kiya@example.test", name: "Kiya", primary: true, timeZone: zone },
  { id: "team@example.test", name: "Team schedule", timeZone: zone },
];
const calendar = {
  ready: true,
  status: async () => ({ ready: true, connected, selectedIds }),
  calendars: async () => ({ calendars, truncated: false }),
  select: async (_, ids) => {
    selectedIds = ids;
    return calendar.status();
  },
  disconnect: async () => {
    connected = false;
  },
  context: async () => {
    if (unavailable)
      throw Object.assign(Error("Calendar is temporarily unavailable."), {
        status: 502,
      });
    return {
      connected,
      checkedAt: new Date().toISOString(),
      rangeStart: new Date().toISOString(),
      rangeEnd: new Date(Date.now() + 14 * 86400000).toISOString(),
      selectedCount: selectedIds.length,
      truncated: false,
      timeZone: zone,
      events: [
        {
          id: "private-event",
          title: "Design check-in",
          start: future + "T07:00:00Z",
          end: future + "T08:00:00Z",
          href: "https://calendar.google.com/calendar/event?eid=fictional",
        },
      ],
      freeSlots: [
        { date: future, time: "11:00", duration: 60, timeZone: zone },
      ],
      workingHours: "08:00–17:00, Monday–Friday",
    };
  },
  createTaskBlock: async (_, id, t, schedule, workspace, origin, verify) => {
    await verify();
    blocks++;
    return {
      eventId: id,
      href: "https://calendar.google.com/calendar/event?eid=fictional",
      calendarName: "ShiftScript · Task blocks",
      start: future + "T09:00:00Z",
      end: future + "T10:00:00Z",
    };
  },
};
const blankAction = {
  taskId: "task-one",
  meetingId: null,
  date: null,
  time: null,
  duration: null,
  status: null,
  dueDate: null,
  changeDueDate: false,
  recipients: [],
};
const apiServer = createApp({
  store,
  storage: "local",
  provider: "sample",
  calendar,
  google: {
    ready: true,
    limit: async () => {},
    status: async () => ({ ready: true, connected: true }),
  },
  appUrl: "https://shiftscript.earny.co.za",
  mailer: {
    ready: true,
    send: async (recipients) => {
      sent++;
      recipientsSent.push(recipients);
      return { accepted: recipients, rejected: [] };
    },
  },
  assistant: async ({ question, context }) => {
    let actions = [],
      answer =
        "Review the portfolio has no deadline set. Your next event is Design check-in.";
    if (question.includes("progress")) {
      actions = [
        { ...blankAction, kind: "update_task", status: "In Progress" },
      ];
      answer = "Review this change to the portfolio task before confirming.";
    } else if (question.includes("Schedule")) {
      actions = [{ ...blankAction, kind: "schedule_task" }];
      answer = "Choose a date and time to reserve a portfolio review block.";
    } else if (question.includes("Email")) {
      actions = [
        {
          ...blankAction,
          kind: "email_recap",
          meetingId: "meeting-one",
          recipients: ["kopano@example.test", "kiya@example.test"],
        },
      ];
      answer =
        "Review the current portfolio recap and recipients before sending.";
    } else if (context.calendar.warning)
      answer =
        "Calendar is unavailable. The portfolio task has no deadline set.";
    return {
      answer,
      sourceIds: ["task:task-one", "meeting:meeting-one", "event:0"],
      actions,
    };
  },
}).listen(3018, "127.0.0.1");
await new Promise((r) => apiServer.once("listening", r));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5184,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3018" },
  },
});
await vite.listen();
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
page.setDefaultTimeout(15000);
page.on("pageerror", (e) => errors.push(e.message));
await page.route("https://**", (r) => r.abort());
await page.addInitScript(() =>
  localStorage.setItem(
    "shiftscript:cookie-preferences:v1",
    JSON.stringify({ version: 1, essential: true, optional: false }),
  ),
);
await mkdir("docs/screenshots", { recursive: true });
const log = page.getByRole("log", { name: "Assistant conversation" });
const input = page.getByLabel("Ask Shifty", { exact: true });
async function ask(question, reply) {
  await input.fill(question);
  await input.press("Enter");
  await log.getByText(reply, { exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      !document
        .querySelector('[aria-label="Assistant conversation"]')
        .matches('[aria-busy="true"]'),
  );
}
async function widthCheck(label) {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    label + " overflow",
  );
}
async function screenshot(name) {
  await page.screenshot({
    path: "docs/screenshots/" + name + ".png",
    fullPage: true,
    style: ".toast{visibility:hidden!important}",
  });
}
try {
  await page.goto("http://127.0.0.1:5184/app");
  await page.getByRole("button", { name: "Ask Shifty", exact: true }).click();
  await page.getByRole("heading", { name: "Shifty" }).waitFor();
  await page.getByText("Hi Kiya, I’m Shifty.", { exact: true }).waitFor();
  await page
    .locator('.shifty-avatar-heading[data-shifty-state="ready"]')
    .waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await widthCheck("Assistant empty " + width);
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".shifty-avatar img")].every(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    );
    assert(
      (
        await page
          .getByRole("button", { name: "Send assistant question" })
          .boundingBox()
      ).height >= 44,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screenshot("assistant-empty-desktop");
  await page
    .getByText("Choose calendars · 1 selected", { exact: true })
    .click();
  await page.getByLabel("Team schedule", { exact: true }).check();
  const selectionResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/calendar/selection") &&
      r.request().method() === "PUT",
  );
  await page
    .getByRole("button", { name: "Save calendar selection", exact: true })
    .click();
  assert.equal((await selectionResponse).status(), 200);
  await page
    .getByText("Choose calendars · 2 selected", { exact: true })
    .waitFor();
  assert.deepEqual(selectedIds, ["kiya@example.test", "team@example.test"]);
  await input.fill("When is my task due?\nAnd what is my next event?");
  await input.press("Shift+Enter");
  assert((await input.inputValue()).endsWith("\n"));
  let releaseReply, intercepted;
  const held = new Promise((resolve) => {
    releaseReply = resolve;
  });
  const started = new Promise((resolve) => {
    intercepted = resolve;
  });
  const holdChat = async (route) => {
    intercepted();
    await held;
    await route.continue();
  };
  await page.route("**/api/assistant/chat", holdChat);
  const firstAnswer = ask(
    "When is my task due?",
    "Review the portfolio has no deadline set. Your next event is Design check-in.",
  );
  await started;
  await page
    .locator('.shifty-avatar-heading[data-shifty-state="thinking"]')
    .waitFor();
  await log
    .locator('.shifty-avatar-working[data-shifty-state="thinking"]')
    .waitFor();
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".shifty-avatar-heading img")
      .evaluate((img) => getComputedStyle(img).animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  releaseReply();
  await firstAnswer;
  await page.unroute("**/api/assistant/chat", holdChat);
  await page
    .locator('.shifty-avatar-heading[data-shifty-state="replying"]')
    .waitFor();
  assert.equal(
    await log.locator(".assistant-speaker").last().innerText(),
    "Shifty",
  );
  assert.equal(
    await log.getByRole("link", { name: "Design check-in" }).count(),
    1,
  );
  await log
    .getByRole("button", { name: "Review the portfolio", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Task details", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await ask(
    "Set the portfolio task in progress",
    "Review this change to the portfolio task before confirming.",
  );
  assert.equal((await store.list()).tasks[0].status, "To Do");
  await page
    .getByRole("button", { name: "Review task change", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Task deadline", { exact: true }).inputValue(),
    "",
  );
  await page
    .getByRole("button", { name: "Confirm task change", exact: true })
    .click();
  await log.getByText("Task updated.", { exact: true }).waitFor();
  assert.equal((await store.list()).tasks[0].status, "In Progress");
  await ask(
    "Schedule my portfolio task",
    "Choose a date and time to reserve a portfolio review block.",
  );
  await page
    .getByRole("button", { name: "Review calendar block", exact: true })
    .click();
  assert.equal(blocks, 0);
  assert.equal(
    await page.getByLabel("Block date", { exact: true }).inputValue(),
    "",
  );
  await page
    .getByRole("button", { name: "Confirm calendar block", exact: true })
    .click();
  assert.equal(blocks, 0, "Required date/time prevents scheduling");
  await page.getByLabel("Block date", { exact: true }).fill(future);
  await page.getByLabel("Start time", { exact: true }).fill("11:00");
  await page
    .locator('.shifty-avatar-heading[data-shifty-state="replying"]')
    .waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await widthCheck("Calendar review " + width);
    assert(
      (
        await page
          .getByRole("button", { name: "Confirm calendar block", exact: true })
          .boundingBox()
      ).height >= 44,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("assistant-calendar-mobile");
  await page
    .getByRole("button", { name: "Confirm calendar block", exact: true })
    .click();
  await log
    .getByText("Added to your ShiftScript task calendar.", { exact: true })
    .waitFor();
  assert.equal(blocks, 1);
  assert.equal((await store.list()).tasks[0].dueDate, null);
  await page.getByLabel("Planning time zone", { exact: true }).fill("bad-zone");
  assert.deepEqual(
    errors,
    [],
    "Incomplete time zone doesn't crash prior replies",
  );
  await page.getByLabel("Planning time zone", { exact: true }).fill(zone);
  await ask(
    "Email the portfolio recap to kopano@example.test, kiya@example.test",
    "Review the current portfolio recap and recipients before sending.",
  );
  assert.equal(sent, 0);
  await page
    .getByRole("button", { name: "Review email recap", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Recipients", { exact: true }).inputValue(),
    "kopano@example.test, kiya@example.test",
  );
  await page
    .getByText("1 approved task(s) included · 1 pending excluded")
    .waitFor();
  assert(
    !(await page.locator(".recap-preview pre").innerText()).includes(
      "Prepare launch post",
    ),
  );
  await widthCheck("Assistant recap phone");
  await screenshot("assistant-recap-mobile");
  await page.getByRole("button", { name: "Send recap", exact: true }).click();
  await page
    .getByRole("heading", { name: "Recap accepted by the mail server" })
    .waitFor();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await log
    .getByText("Recap accepted by the email server.", { exact: true })
    .waitFor();
  assert.equal(sent, 1);
  assert.deepEqual(recipientsSent[0], [
    "kopano@example.test",
    "kiya@example.test",
  ]);
  await screenshot("assistant-chat-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screenshot("assistant-chat-desktop");
  await page.reload();
  await page.getByRole("button", { name: "Ask Shifty", exact: true }).click();
  await log
    .getByText("Recap accepted by the email server.", { exact: true })
    .waitFor();
  assert.equal(await log.locator(".assistant-message").count(), 8);
  await page
    .getByRole("button", { name: "Clear assistant conversation", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep it", exact: true }).click();
  assert.equal(await log.locator(".assistant-message").count(), 8);
  await page.route("**/api/assistant/chat", (r) =>
    r.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error: "Please try again shortly." }),
    }),
  );
  await input.fill("Try again");
  await page.getByRole("button", { name: "Send assistant question" }).click();
  await page.getByText("Please try again shortly.", { exact: true }).waitFor();
  await page
    .locator('.shifty-avatar-heading[data-shifty-state="error"]')
    .waitFor();
  assert.equal(await input.inputValue(), "Try again");
  await page.unroute("**/api/assistant/chat");
  unavailable = true;
  await ask(
    "What is my task deadline?",
    "Calendar is unavailable. The portfolio task has no deadline set.",
  );
  await page
    .getByRole("button", { name: "Disconnect Calendar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Google Calendar", exact: true })
    .waitFor();
  assert.equal(connected, false);
  await page
    .getByRole("button", { name: "Clear assistant conversation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear conversation", exact: true })
    .click();
  await page.getByText("Hi Kiya, I’m Shifty.", { exact: true }).waitFor();
  assert.equal((await store.list()).tasks.length, 1);
  assert.equal((await store.list()).meetings.length, 1);
  assert.equal(blocks, 1);
  await page
    .locator('.shifty-avatar-heading[data-shifty-state="ready"]')
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Shifty four avatar states, reduced motion and grounded chat, private history, calendar selection/review, task approval, recap review/send, recovery, keyboard and mobile layouts (320/390/768/1440).",
  );
} catch (e) {
  await page.screenshot({
    path: "docs/screenshots/assistant-failure.png",
    fullPage: true,
  });
  console.error(await page.locator("body").innerText(), errors);
  throw e;
} finally {
  await browser.close();
  await vite.close();
  await new Promise((r) => apiServer.close(r));
  await rm(directory, { recursive: true, force: true });
}
