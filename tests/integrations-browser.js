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
  "Kiya: Kopano, please publish your portfolio tomorrow.\nKopano: I will publish my portfolio tomorrow.\nKiya: I will review the mobile layout by Friday.";
const source = {
  kind: "google-notes",
  name: "Portfolio launch notes",
  url: "https://docs.google.com/document/d/portfolio-document/edit",
  documentId: "portfolio-document",
};
let sent = 0;
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
  disconnect: async () => {},
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
  await page.goto("http://127.0.0.1:5182");
  await page.getByRole("button", { name: "Google Meet", exact: true }).click();
  await page
    .getByRole("button", { name: "Load recent meetings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View sources", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Gemini notes 1 · Preview", exact: true })
    .click();
  await page.getByRole("heading", { name: "Review your import" }).waitFor();
  await page
    .getByLabel("Meeting title", { exact: true })
    .fill("Kopano portfolio review");
  await page.getByLabel("Project", { exact: true }).selectOption("portfolio");
  await screen("google-import-desktop");
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
  await page
    .getByRole("button", { name: "Process meeting", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Meeting summary", exact: true })
    .waitFor();
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
