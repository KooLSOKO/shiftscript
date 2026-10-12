// Real React/API rendering with a fictional model adapter; no provider requests.
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { newWorkspace } from "../server/collaboration.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const dir = await mkdtemp(join(tmpdir(), "shift-shifty-design-"));
const store = new LocalStore(join(dir, "db.json"));
await store.mutateProfile("local-demo", (p) => {
  p.name = "Soko";
});
await store.mutate("local-demo", (s) => {
  s.workspace = newWorkspace(
    "local-demo",
    { name: "Earny Studio", ownerName: "Soko" },
    { uid: "local-demo", name: "Soko", email: "soko@example.test" },
  );
});
let answer =
  "## Your next steps\n\nYou have **two tasks** to review.\n\n1. **Review mobile**\n- Due date: 2026-10-20\n- Status: To Do\n\n2. **Prepare launch post**\n- Due date: No deadline is set.\n- Status: Completed";
const app = createApp({
  store,
  storage: "local",
  provider: "sample",
  assistant: async () => ({ answer, sourceIds: [], actions: [] }),
});
const server = app.listen(3041, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5191,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3041" },
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
    viewport: { width: 1440, height: 900 },
  });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://**", (r) => r.abort());
  await page.addInitScript(() =>
    localStorage.setItem(
      "shiftscript:cookie-preferences:v1",
      JSON.stringify({ version: 1, essential: true, optional: false }),
    ),
  );
  await page.goto("http://127.0.0.1:5191/app");
  await page.locator(".auth-transition").waitFor({ state: "detached" });
  for (const [width, height] of [
    [1280, 720],
    [1440, 900],
    [1920, 1080],
    [1024, 650],
  ]) {
    await page.setViewportSize({ width, height });
    const nav = page.locator(".sidebar > nav");
    assert(
      await nav.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
      `Navigation requires scrolling at ${width}x${height}`,
    );
    const navBox = await nav.boundingBox();
    for (const button of await nav.getByRole("button").all()) {
      const box = await button.boundingBox();
      assert(
        box.y >= navBox.y - 1 &&
          box.y + box.height <= navBox.y + navBox.height + 1,
      );
      assert.equal(
        await button.evaluate((el) => getComputedStyle(el).fontSize),
        "14px",
      );
    }
    const foot = await page
      .getByRole("button", { name: "Open your profile", exact: true })
      .boundingBox();
    assert(foot.y + foot.height <= height);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    console.log(
      `${width}x${height}: all desktop tabs fit without sidebar scrolling; bold text and profile entry remain visible.`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const shifty = page.locator('.nav-item[data-tab="assistant"]');
  await shifty.click();
  await expect(
    page.getByRole("heading", { name: "Hi Soko, I’m Shifty.", exact: true }),
  ).toBeVisible();
  const frame = page.locator(".shifty-dashboard");
  await expect(frame.locator(".assistant-prompts button")).toHaveCount(3);
  assert.equal(
    await shifty.evaluate((el) => getComputedStyle(el).animationName),
    "shifty-border-flow",
  );
  assert.equal(
    await frame.evaluate(
      (el) => getComputedStyle(el, "::before").animationName,
    ),
    "shifty-arrival-wash",
  );
  const firstPosition = await shifty.evaluate(
    (el) => getComputedStyle(el).backgroundPosition,
  );
  await expect
    .poll(() =>
      shifty.evaluate((el) => getComputedStyle(el).backgroundPosition),
    )
    .not.toBe(firstPosition);
  const input = page.getByLabel("Ask Shifty", { exact: true });
  await page
    .getByRole("button", {
      name: "What tasks are assigned to me and when are they due?",
      exact: true,
    })
    .click();
  await expect(input).toHaveValue(
    "What tasks are assigned to me and when are they due?",
  );
  await input.press("Enter");
  const reply = page.locator(".assistant-rich-text").last();
  await expect(
    reply.getByRole("heading", { name: "Your next steps", exact: true }),
  ).toBeVisible();
  await expect(reply.locator("strong")).toHaveCount(3);
  await expect(reply.locator(":scope > ol > li")).toHaveCount(2);
  await expect(reply.locator("ol li ul li")).toHaveCount(4);
  assert(!(await reply.innerText()).includes("**"));
  assert((await reply.innerText()).includes("No deadline is set."));
  console.log(
    "Gradient entrance and animated active border, quick prompt, bold replies and numbered task/details lists passed.",
  );
  if (process.env.SHIFTSCRIPT_QA_IMAGES)
    await frame.screenshot({
      path: join(
        process.env.SHIFTSCRIPT_QA_IMAGES,
        "shifty-formatted-desktop.png",
      ),
    });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await shifty.evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  assert.equal(
    await frame
      .locator(".assistant-chat")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  assert.equal(
    await frame.evaluate((el) => getComputedStyle(el, "::before").display),
    "none",
  );
  await page.reload();
  await expect(page.locator(".auth-transition")).toHaveCount(0);
  await shifty.click();
  await page.getByRole("button", { name: "Toggle chat history" }).click();
  await page.locator(".shifty-history-select").first().click();
  if (
    (await page
      .getByRole("button", { name: "Toggle chat history" })
      .getAttribute("aria-expanded")) === "true"
  )
    await page.getByRole("button", { name: "Toggle chat history" }).click();
  await expect(page.locator(".assistant-rich-text strong").first()).toHaveText(
    "two tasks",
  );
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert(
      await frame
        .locator(".assistant-messages")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    const send = await page
      .getByRole("button", { name: "Send assistant question", exact: true })
      .boundingBox();
    assert(send.height >= 44 && send.width >= 44);
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    for (const item of await page.locator(".sidebar > nav .nav-item").all())
      assert((await item.boundingBox()).height >= 44);
    await shifty.click();
    if (process.env.SHIFTSCRIPT_QA_IMAGES && width === 390)
      await frame.screenshot({
        path: join(
          process.env.SHIFTSCRIPT_QA_IMAGES,
          "shifty-formatted-mobile.png",
        ),
      });
    console.log(
      `${width}px: readable formatted reply, touch navigation and composer bounds passed.`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  answer =
    '<img src=x onerror="window.shiftyInjected=true"> **<script>window.shiftyInjected=true</script>** [open](javascript:alert(1))';
  await input.fill("Render this test safely");
  await input.press("Enter");
  await expect(page.locator(".assistant-rich-text").last()).toContainText(
    "<script>",
  );
  assert.equal(
    await page
      .locator(
        ".assistant-rich-text img, .assistant-rich-text script, .assistant-rich-text a",
      )
      .count(),
    0,
  );
  assert.equal(await page.evaluate(() => window.shiftyInjected), undefined);
  // The layout falls back to reachable scrolling for unusually short desktop windows.
  await page.setViewportSize({ width: 1100, height: 500 });
  await page.locator('.nav-item[data-tab="profile"]').click();
  await expect(
    page.getByRole("heading", { name: "Soko", exact: true }),
  ).toBeVisible();
  console.log(
    "Reloaded history formatting, inert HTML/URLs, reduced-motion support and short-window navigation fallback passed.",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await vite.close();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
