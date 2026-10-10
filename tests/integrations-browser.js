// Mocked Google, Gemini and SMTP: no credentials and no external messages required.
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { newWorkspace } from "../server/collaboration.js";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const directory = await mkdtemp(join(tmpdir(), "shift-google-mobile-"));
const store = new LocalStore(join(directory, "workspace.json"));
const transcript =
  "Kiya: We reviewed the portfolio layout and discussed the launch.\n".repeat(
    300,
  ) +
  "Kiya: Kopano, please publish your portfolio tomorrow.\nKopano: I will publish my portfolio tomorrow.\nKiya: I will review the mobile layout by Friday.";
const source = {
  kind: "google-notes",
  name: "Portfolio launch notes",
  url: "https://docs.google.com/document/d/portfolio-document/edit",
  documentId: "portfolio-document",
  artifact: "conferenceRecords/portfolio/smartNotes/notes",
};
let sent = 0,
  disconnected = 0;
const sentRecipients = [];
await store.mutate("local-demo", (s) => {
  s.workspace = newWorkspace(
    "local-demo",
    { name: "Earny Studio", ownerName: "Kiya" },
    { uid: "local-demo", email: "demo@example.invalid" },
  );
  s.projects.push({
    id: "portfolio",
    name: "Kopano Portfolio",
    description: "New website",
    color: "blue",
    createdAt: new Date().toISOString(),
  });
});
const google = {
  ready: true,
  status: async () => ({ ready: true, connected: true }),
  list: async () => ({
    meetings: [
      {
        name: "conferenceRecords/portfolio",
        startTime: "2026-10-10T08:00:00Z",
        endTime: "2026-10-10T08:30:00Z",
      },
    ],
    cursor: null,
  }),
  artifacts: async () => ({
    artifacts: [
      {
        name: "conferenceRecords/portfolio/smartNotes/notes",
        kind: "notes",
        ready: true,
      },
    ],
  }),
  preview: async () => ({
    previewId: "mock-preview-with-long-id",
    transcript,
    source,
    title: source.name,
    expires: Date.now() + 900000,
  }),
  imported: async () => ({ transcript, source }),
  disconnect: async () => {
    disconnected++;
  },
};
const server = createApp({
  store,
  google,
  storage: "local",
  provider: "gemini",
  mailer: {
    ready: true,
    send: async (recipients) => {
      sent++;
      sentRecipients.push(recipients);
      return { accepted: recipients, rejected: [] };
    },
  },
  analyzer: async () => ({
    summary:
      "Kiya and Kopano agreed to publish the portfolio and review its mobile layout.",
    discussionPoints: ["The new portfolio is ready."],
    decisions: ["Publish the website tomorrow."],
    followUps: ["Confirm the live URL."],
    actions: [
      {
        title: "Publish the portfolio",
        description: "Publish the new website.",
        owner: "Kopano",
        deadline: "tomorrow",
        priority: "High",
        evidence: "Kopano: I will publish my portfolio tomorrow.",
      },
      {
        title: "Review the mobile layout",
        description: "Check the portfolio on phones.",
        owner: "Kiya",
        deadline: "Friday",
        priority: "Med",
        evidence: "Kiya: I will review the mobile layout by Friday.",
      },
    ],
  }),
}).listen(3012, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5182,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3012" },
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
const browser = await chromium.launch(launch),
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  }),
  errors = [];
await page.addInitScript(() =>
  localStorage.setItem(
    "shiftscript:cookie-preferences:v1",
    JSON.stringify({ version: 1, essential: true, optional: false }),
  ),
);
page.setDefaultTimeout(15000);
page.on("pageerror", (e) => errors.push(e.message));
await page.route("https://**", (route) => route.abort());
await mkdir("docs/screenshots", { recursive: true });
async function widthCheck(label) {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    label + " must not overflow the viewport",
  );
}
async function screen(name) {
  await page.screenshot({
    path: "docs/screenshots/" + name + ".png",
    fullPage: true,
    style: ".toast{visibility:hidden!important}",
  });
}
try {
  await page.goto("http://127.0.0.1:5182/app");
  await page.getByRole("button", { name: "New meeting", exact: true }).click();
  await page
    .getByRole("radio", { name: "Recent Google Meet", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Recent meetings", exact: true })
    .waitFor();
  assert.equal(await page.locator(".google-embedded").count(), 1);
  await page
    .getByLabel("Search recent Google meetings")
    .fill("no-such-meeting");
  await page
    .getByText(
      "No meetings match your search. Clear it to see all loaded meetings.",
    )
    .waitFor();
  await page.getByLabel("Search recent Google meetings").fill("");
  await page
    .getByRole("button", { name: "View sources", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Gemini notes 1 · Preview", exact: true })
    .click();
  await page.getByRole("heading", { name: "Review your import" }).waitFor();
  assert(transcript.length > 15000);
  assert.equal(await page.locator(".import-text pre").innerText(), transcript);
  await page
    .getByLabel("Meeting title", { exact: true })
    .fill("Kopano portfolio review");
  await page.getByLabel("Project", { exact: true }).selectOption("portfolio");
  await screen("google-import-desktop");
  await screen("new-meeting-google-desktop");
  for (const width of [320, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await widthCheck("Google import " + width);
    assert(
      Number(
        await page
          .getByLabel("Meeting title", { exact: true })
          .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
      ) >= (width <= 650 ? 16 : 14),
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await screen("google-import-mobile");
  await screen("new-meeting-google-mobile");
  let releaseImport;
  const importGate = new Promise((resolve) => {
    releaseImport = resolve;
  });
  await page.route("**/api/google/import", async (route) => {
    await importGate;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Process meeting", exact: true })
    .click();
  await page
    .locator(".processing-status")
    .getByText("Reading your meeting notes…", { exact: true })
    .waitFor();
  assert.equal(await page.locator(".ss-wave-loader li").count(), 9);
  releaseImport();

  await page
    .getByRole("heading", { name: "Meeting summary", exact: true })
    .waitFor();
  assert.equal(
    (await store.list()).drafts.length,
    0,
    "Google import clears an empty scratch draft",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Approve task", exact: true })
      .count(),
    2,
  );
  await page
    .getByRole("button", { name: "Approve task", exact: true })
    .first()
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".proposal.reviewed").length === 1,
  );
  await widthCheck("Mobile review");
  await screen("review-mobile-v21");
  await page.getByRole("button", { name: "Email recap", exact: true }).click();
  await page
    .getByLabel("Recipients", { exact: true })
    .fill("kopano@example.test");
  await page
    .getByText("1 approved task(s) included · 1 pending excluded")
    .waitFor();
  assert(
    !(await page.locator(".recap-preview pre").innerText()).includes(
      "Check the portfolio on phones.",
    ),
  );
  const modal = await page.getByRole("dialog").boundingBox();
  assert(modal.x >= 0 && modal.width <= 390);
  await screen("email-recap-mobile");
  await page.getByRole("button", { name: "Send recap", exact: true }).click();
  await page
    .getByRole("heading", { name: "Recap accepted by the mail server" })
    .waitFor();
  assert.equal(sent, 1);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Go to Overview", exact: true })
    .click();
  const emailButton = page.getByRole("button", {
    name: "Email recap for Kopano portfolio review",
    exact: true,
  });
  await emailButton.waitFor();
  for (const width of [320, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await widthCheck("Dashboard email " + width);
    assert((await emailButton.boundingBox()).height >= 44);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screen("dashboard-email-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await screen("dashboard-email-mobile");
  await emailButton.click();
  await page
    .getByLabel("Recipients", { exact: true })
    .fill("kopano@example.test, invalid-address");
  assert(
    await page
      .getByRole("button", { name: "Send recap", exact: true })
      .isDisabled(),
  );
  assert.equal(sent, 1);
  await page
    .getByLabel("Recipients", { exact: true })
    .fill(" kopano@example.test, kiya@example.test, KOPANO@example.test ");
  await page
    .getByText("2 recipient(s) · duplicate addresses removed")
    .waitFor();
  await page
    .getByText("1 approved task(s) included · 1 pending excluded")
    .waitFor();
  await widthCheck("Dashboard recap modal");
  await screen("dashboard-recap-mobile");
  await page.getByRole("button", { name: "Send recap", exact: true }).click();
  await page
    .getByRole("heading", { name: "Recap accepted by the mail server" })
    .waitFor();
  assert.equal(sent, 2);
  assert.deepEqual(sentRecipients[1], [
    "kopano@example.test",
    "kiya@example.test",
  ]);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "New meeting", exact: true }).click();
  await page
    .getByRole("radio", { name: "Previous meeting", exact: true })
    .click();
  await page.getByLabel("Search saved meetings").fill("Kopano");
  await page.locator(".previous-meeting-option").first().click();
  await screen("reuse-meeting-mobile");
  await page
    .getByRole("button", { name: "Use this transcript", exact: false })
    .click();
  assert.equal(
    await page.getByLabel("Meeting transcript", { exact: true }).inputValue(),
    transcript,
  );
  assert(
    (
      await page.getByLabel("Meeting title", { exact: true }).inputValue()
    ).endsWith("follow-up"),
  );
  await page
    .getByRole("radio", { name: "Recent Google Meet", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Recent meetings", exact: true })
    .waitFor();
  assert(
    (await page.locator(".google-meeting .hint").first().innerText()).includes(
      "Already imported",
    ),
  );
  await page.getByRole("radio", { name: "Text", exact: true }).click();
  assert.equal(
    await page.getByLabel("Meeting transcript", { exact: true }).inputValue(),
    transcript,
    "Source switching keeps the draft",
  );
  await page.getByLabel("Upload transcript", { exact: true }).setInputFiles({
    name: "long-meeting.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(transcript),
  });
  assert.equal(
    await page.getByLabel("Meeting transcript", { exact: true }).inputValue(),
    transcript,
  );
  await page
    .getByLabel("Meeting transcript", { exact: true })
    .fill("x".repeat(100001));
  await page
    .getByText(
      "This transcript exceeds 100,000 characters. Shorten it or split it into separate meetings before processing.",
    )
    .waitFor();
  assert.equal(
    (await page.getByLabel("Meeting transcript", { exact: true }).inputValue())
      .length,
    100001,
    "Pasted text is never silently truncated",
  );
  await page.getByLabel("Meeting transcript", { exact: true }).fill(transcript);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Go to Tasks", exact: true }).click();
  await page.getByLabel("Status for Publish the portfolio").waitFor();
  for (const width of [320, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await widthCheck("Task tracker " + width);
    if (width <= 650)
      assert(
        (
          await page
            .getByLabel("Status for Publish the portfolio")
            .boundingBox()
        ).height >= 44,
      );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Show task filters", exact: true })
    .click();
  await page.getByLabel("Priority", { exact: true }).selectOption("High");
  await page
    .getByRole("button", { name: "Hide task filters", exact: true })
    .click();
  await screen("tasks-mobile-v21");
  await page
    .getByRole("button", { name: "Publish the portfolio", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await widthCheck("Task editor");
  await screen("task-editor-mobile-v21");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .getAttribute("aria-expanded"),
    "true",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => !document.querySelector(".sidebar").classList.contains("open"),
  );
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-label"),
    ),
    "Open navigation",
  );
  await page
    .getByRole("button", { name: "Go to Google Meet", exact: true })
    .click();
  await page
    .getByLabel("Google Docs notes link")
    .fill("https://docs.google.com/document/d/portfolio-document/edit");
  await page
    .getByRole("button", { name: "Preview notes", exact: true })
    .click();
  await page.getByRole("heading", { name: "Review your import" }).waitFor();
  await page.setViewportSize({ width: 844, height: 390 });
  await widthCheck("Landscape import");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await widthCheck("Desktop import");
  const disconnect = page.getByRole("button", {
    name: "Disconnect",
    exact: true,
  });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await disconnect.scrollIntoViewIfNeeded();
    const bounds = await disconnect.boundingBox();
    assert(
      bounds.width >= 44 &&
        bounds.height === 56 &&
        bounds.x >= 0 &&
        bounds.x + bounds.width <= width,
    );
    await widthCheck("Disconnect " + width);
    if (width === 390 || width === 1440)
      await disconnect.screenshot({
        path: `docs/screenshots/disconnect-${width === 390 ? "mobile" : "desktop"}.png`,
      });
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await disconnect.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const panel = disconnect.locator(".disconnect-button-icon");
  await panel.evaluate(async (el) => {
    await Promise.all(
      el.getAnimations().map((a) => a.finished.catch(() => {})),
    );
  });
  assert((await panel.boundingBox()).width > 170);
  assert.equal(
    await panel.evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(36, 88, 232)",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal((await panel.boundingBox()).width, 48);
  assert.equal(
    await disconnect
      .locator(".disconnect-button-label")
      .evaluate((el) => getComputedStyle(el).opacity),
    "1",
  );
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Connect Google", exact: true })
    .waitFor();
  assert.equal(disconnected, 1);
  assert.equal(
    await page.getByRole("heading", { name: "Review your import" }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Google import, task approval, email preview/send, phone layouts (320/390/430), tablet (768), landscape (844), modal controls and drawer keyboard checks passed.",
  );
} catch (e) {
  await page.screenshot({
    path: "docs/screenshots/integration-failure.png",
    fullPage: true,
  });
  console.error(await page.locator("body").innerText(), errors);
  throw e;
} finally {
  await browser.close();
  await vite.close();
  await new Promise((r) => server.close(r));
  await rm(directory, { recursive: true, force: true });
}
