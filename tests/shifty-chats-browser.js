// Real composer/API flow with delayed responses; no live accounts or AI calls.
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { newWorkspace } from "../server/collaboration.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const dir = await mkdtemp(join(tmpdir(), "shift-send-ui-"));
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
const app = createApp({
  store,
  storage: "local",
  provider: "sample",
  assistant: async () => ({
    answer: "Your task has no deadline set.",
    sourceIds: [],
    actions: [],
  }),
});
const server = app.listen(3043, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5193,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3043" },
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
  await page.goto("http://127.0.0.1:5193/app");
  await page.locator(".auth-transition").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Ask Shifty", exact: true }).click();
  const input = page.getByLabel("Ask Shifty", { exact: true }),
    send = page.getByRole("button", {
      name: "Send assistant question",
      exact: true,
    });

  const log = page.getByRole("log", { name: "Assistant conversation" });
  await expect(input).toBeEnabled();
  const history = page.getByRole("button", { name: "Toggle chat history" });
  const nextChat = page.getByRole("button", {
    name: "Start new Shifty chat",
    exact: true,
  });
  async function ask(text) {
    const count = await log.locator(".assistant-message-assistant").count();
    await input.fill(text);
    await send.click();
    await expect(log.locator(".assistant-message-assistant")).toHaveCount(
      count + 1,
    );
    await expect(input).toBeEnabled();
  }
  await ask("When is my portfolio due?");
  await history.click();
  await expect(page.locator(".shifty-history-select")).toHaveCount(1);
  await expect(page.locator(".shifty-history-select")).toContainText(
    "When is my portfolio due?",
  );
  await nextChat.click();
  await expect(log.locator(".assistant-message")).toHaveCount(0);
  await expect(input).toBeEnabled();
  await ask("Plan my next day");
  await expect(page.locator(".shifty-history-select")).toHaveCount(2);
  await page
    .locator(".shifty-history-select")
    .filter({ hasText: "When is my portfolio due?" })
    .click();
  await expect(log.locator(".assistant-message")).toHaveCount(2);
  await ask("And who owns it?");
  await expect(log.locator(".assistant-message")).toHaveCount(4);
  await page
    .getByRole("searchbox", { name: "Search previous chats" })
    .fill("portfolio");
  await expect(page.locator(".shifty-history-select")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search previous chats" }).fill("");
  // Leaving the feature ends the session; the saved conversation remains available.
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Ask Shifty", exact: true }).click();
  await expect(input).toBeEnabled();
  await expect(log.locator(".assistant-message")).toHaveCount(0);
  await history.click();
  await expect(page.locator(".shifty-history-select")).toHaveCount(2);
  await history.click();
  await page.reload();
  await page.locator(".auth-transition").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Ask Shifty", exact: true }).click();
  await expect(input).toBeEnabled();
  await expect(log.locator(".assistant-message")).toHaveCount(0);
  for (const width of [1440, 1200, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await history.click();
    if (width <= 1150) {
      await expect(
        page.getByRole("dialog", { name: "Your Shifty chats" }),
      ).toBeVisible();
      const drawer = page.getByRole("dialog", { name: "Your Shifty chats" });
      assert(
        await drawer.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      );
      await drawer.evaluate((el) =>
        Promise.all(
          el
            .getAnimations()
            .filter((a) => a.effect.getComputedTiming().iterations !== Infinity)
            .map((a) => a.finished),
        ),
      );
      const rect = await drawer.boundingBox();
      assert(
        Math.abs(rect.y) < 1 &&
          Math.abs(rect.x) < 1 &&
          Math.abs(rect.height - 900) < 1,
        "Drawer must fill the phone viewport",
      );
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
      await expect(history).toBeFocused();
      await history.click();
    } else await expect(page.locator("aside.shifty-history")).toBeVisible();
    if (process.env.SHIFTSCRIPT_QA_IMAGES && [1440, 390].includes(width))
      await page.screenshot({
        path: join(
          process.env.SHIFTSCRIPT_QA_IMAGES,
          `shifty-history-${width}.png`,
        ),
        fullPage: true,
      });
    await page
      .locator(".shifty-history-select")
      .filter({ hasText: "When is my portfolio due?" })
      .click();
    await expect(log.locator(".assistant-message")).toHaveCount(4);
    if (width <= 1150) await expect(page.getByRole("dialog")).toHaveCount(0);
    else await history.click();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Overflow at ${width}px`,
    );
    assert(
      await page
        .locator(".assistant-chat")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    const geometry = await input.evaluate((el) => {
      const a = el.getBoundingClientRect(),
        b = el.form.querySelector(".shifty-send").getBoundingClientRect();
      return { height: a.height, button: b.height, y: a.y, by: b.y };
    });
    assert(Math.abs(geometry.height - geometry.button) < 1);
    assert(Math.abs(geometry.y - geometry.by) < 1);
    await nextChat.click();
    await expect(input).toBeEnabled();
    await expect(log.locator(".assistant-message")).toHaveCount(0);
    if (process.env.SHIFTSCRIPT_QA_IMAGES && [1440, 390].includes(width))
      await page.screenshot({
        path: join(
          process.env.SHIFTSCRIPT_QA_IMAGES,
          `shifty-chats-${width}.png`,
        ),
        fullPage: true,
      });
    console.log(
      `${width}px: saved chat selection, drawer/rail, Escape/focus, new session, composer alignment and no overflow passed.`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route("**/api/assistant/chat", async (route) => {
    await gate;
    await route.continue();
  });
  await input.fill("A reply that completes after leaving");
  await send.click();
  await expect(send).toHaveAttribute("aria-busy", "true");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  release();
  await expect
    .poll(
      async () =>
        (await store.getProfile("local-demo")).assistantChatIndex.length,
    )
    .toBe(3);
  await page.unroute("**/api/assistant/chat");
  await page.getByRole("button", { name: "Ask Shifty", exact: true }).click();
  await expect(input).toBeEnabled();
  await expect(log.locator(".assistant-message")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 900 });
  await history.click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete chat: Plan my next day", exact: true })
    .click();
  await expect(page.locator(".shifty-history-select")).toHaveCount(2);
  await page
    .getByRole("searchbox", { name: "Search previous chats" })
    .fill("not found");
  await expect(
    page.getByText("No matching chats.", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await history.click();
  assert.equal(
    await page
      .getByRole("dialog")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Fresh session on leaving/reloading; reopened history keeps full turns; search/delete; responsive drawer; reduced motion passed.",
  );
} finally {
  await browser.close();
  await vite.close();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
