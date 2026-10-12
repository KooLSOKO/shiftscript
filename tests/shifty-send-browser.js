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
const server = app.listen(3042, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5192,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3042" },
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
  await page.goto("http://127.0.0.1:5192/app");
  await page.locator(".auth-transition").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Ask Shifty", exact: true }).click();
  const input = page.getByLabel("Ask Shifty", { exact: true }),
    send = page.getByRole("button", {
      name: "Send assistant question",
      exact: true,
    });
  const reply = page.locator(".assistant-rich-text");
  await expect(input).toBeEnabled({ timeout: 20000 });
  await expect(send).toBeDisabled();
  async function aligned() {
    // Take both rectangles in one frame: focusing a phone textarea may scroll the page.
    const { a, b } = await input.evaluate((el) => {
      const field = el.getBoundingClientRect(),
        button = el.form.querySelector(".shifty-send").getBoundingClientRect();
      return {
        a: { y: field.y, height: field.height },
        b: { y: button.y, height: button.height, width: button.width },
      };
    });
    assert(
      Math.abs(a.height - b.height) < 1,
      `Send ${b.height}px versus field ${a.height}px`,
    );
    assert(Math.abs(a.y - b.y) < 1, `Field y=${a.y}, send y=${b.y}`);
    assert(b.height >= 80);
    return { width: b.width, height: b.height };
  }
  let total = 0;
  for (const [width, height] of [
    [1440, 900],
    [768, 1000],
    [390, 844],
    [320, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await input.evaluate((el) => {
      el.style.height = "80px";
    });
    await aligned();
    if (width > 850) {
      await input.evaluate((el) => {
        el.style.height = "124px";
      });
      await aligned();
    }
    await input.fill("When is my task due?");
    const before = await aligned();
    let release;
    const gate = new Promise((r) => (release = r));
    let posts = 0;
    await page.route("**/api/assistant/chat", async (route) => {
      posts++;
      await gate;
      await route.continue();
    });
    await send.click();
    await expect(send).toHaveAttribute("aria-busy", "true");
    await expect(send).toBeDisabled();
    await expect(send.locator(".shifty-orbit")).toBeVisible();
    assert.deepEqual(await aligned(), before);
    assert.equal(
      await send.evaluate((el) => getComputedStyle(el).animationName),
      "shifty-send-flow",
    );
    const pos = await send.evaluate(
      (el) => getComputedStyle(el).backgroundPosition,
    );
    await expect
      .poll(() =>
        send.evaluate((el) => getComputedStyle(el).backgroundPosition),
      )
      .not.toBe(pos);
    await page.locator(".assistant-compose").evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    assert.equal(posts, 1, "Repeated submission sent another request");
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await send.evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    assert.equal(
      await send
        .locator(".shifty-orbit-ring")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await expect(send.locator(".shifty-orbit")).toBeVisible();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    if (process.env.SHIFTSCRIPT_QA_IMAGES && [1440, 390].includes(width))
      await page.locator(".assistant-compose").screenshot({
        path: join(
          process.env.SHIFTSCRIPT_QA_IMAGES,
          `shifty-send-pending-${width}.png`,
        ),
      });
    release();
    total++;
    await expect(reply).toHaveCount(total);
    await expect(send).toHaveAttribute("aria-busy", "false");
    await expect(send.locator(".shifty-orbit")).toHaveCount(0);
    await expect(send.locator(":scope > svg")).toHaveCount(1);
    assert.deepEqual(await aligned(), before);
    await page.unroute("**/api/assistant/chat");
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    console.log(
      `${width}px: matching height/resizing, stable width, animated waiting state, repeat-submit guard, reduced motion and restored send icon passed.`,
    );
  }
  await input.fill("Keep this question if the connection fails");
  await page.route("**/api/assistant/chat", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Simulated temporary issue." },
    }),
  );
  await send.click();
  await expect(page.getByRole("alert")).toContainText(
    "Simulated temporary issue.",
  );
  await expect(input).toHaveValue("Keep this question if the connection fails");
  await expect(send).toHaveAttribute("aria-busy", "false");
  await expect(send).toBeEnabled();
  await expect(send.locator(".shifty-orbit")).toHaveCount(0);
  await page.unroute("**/api/assistant/chat");
  await send.click();
  await expect(reply).toHaveCount(total + 1);
  console.log(
    "Failure clears loading, keeps the question and permits successful retry.",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await vite.close();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
