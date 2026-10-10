// Verify the built public homepage and navigation, without external integrations.
import express from "express";
import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
const serverApp = createApp({ storage: "local", provider: "sample" });
const config = JSON.parse(await readFile("vercel.json", "utf8"));
assert.equal(
  config.rewrites.find((r) => r.source === "/app").destination,
  "/index.html",
);
serverApp.use(express.static(resolve("dist")));
serverApp.get(["/app", "/app/"], (_req, res) =>
  res.sendFile(resolve("dist/index.html")),
);
const server = serverApp.listen(3015, "127.0.0.1");
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
await mkdir("docs/screenshots", { recursive: true });
try {
  const noJs = await browser.newPage({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  await noJs.goto("http://127.0.0.1:3015/");
  await noJs
    .getByRole("heading", { level: 1, name: /Good meetings/ })
    .waitFor();
  await noJs
    .getByText("Do I need to connect Google Meet?", { exact: true })
    .click();
  assert(
    await noJs
      .getByText("No. You can start by pasting", { exact: false })
      .isVisible(),
  );
  assert.equal(
    await noJs
      .getByRole("link", { name: "Start with a meeting" })
      .getAttribute("href"),
    "/app?mode=signup",
  );
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const requests = [],
    errors = [],
    failures = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(r.url());
  });
  await page.goto("http://127.0.0.1:3015/");
  await page
    .getByRole("heading", { level: 1, name: /Good meetings/ })
    .waitFor();
  await page.waitForLoadState("networkidle");
  assert(
    !requests.some(
      (url) =>
        url.includes("/api/") ||
        url.includes("app-entry") ||
        url.includes("googleapis.com"),
    ),
    "Home loaded workspace/auth services",
  );
  assert.equal(
    await page.locator('link[rel="canonical"]').getAttribute("href"),
    "https://shiftscript.earny.co.za/",
  );
  assert.equal(
    await page.locator('meta[property="og:image"]').getAttribute("content"),
    "https://shiftscript.earny.co.za/art/social-sharing.png",
  );
  assert.equal(
    JSON.parse(
      await page.locator('script[type="application/ld+json"]').textContent(),
    )["@type"],
    "SoftwareApplication",
  );
  // Load below-fold illustrations before taking a full-page screenshot.
  await page.locator("#home img").evaluateAll(async (images) => {
    for (const img of images) img.loading = "eager";
    await Promise.all(images.map((img) => img.decode()));
  });
  await page.screenshot({
    path: "docs/screenshots/landing-desktop.png",
    fullPage: true,
  });
  for (const width of [320, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(() =>
      [...document.querySelectorAll("#home img")].every((img) => img.complete),
    );
    for (const img of await page.locator("#home img").all())
      assert(
        await img.evaluate((el) => el.naturalWidth > 0),
        "Image failed to decode",
      );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `Overflow at ${width}`,
    );
    for (const card of await page
      .locator(".ss-hero-task, .ss-demo-card, .ss-header-actions")
      .all()) {
      const box = await card.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width + 1);
    }
    if (width === 390) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: "docs/screenshots/landing-mobile.png",
        fullPage: true,
      });
    }
  }
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  assert(page.url().endsWith("#how-it-works"));
  await page
    .getByText("Do I need to connect Google Meet?", { exact: true })
    .click();
  assert(
    await page
      .getByText("No. You can start by pasting", { exact: false })
      .isVisible(),
  );
  await page
    .getByRole("link", { name: "Sign in", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", {
      name: "Less follow-up. More follow-through.",
      exact: true,
    })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, "/app");
  assert.equal(
    await page.locator('meta[name="robots"]').getAttribute("content"),
    "noindex",
  );
  // Preserve already-shared links through the new public root.
  await page.goto("http://127.0.0.1:3015/?google=error");
  await page.waitForURL("**/app?google=error");
  await page
    .getByRole("heading", {
      name: "Less follow-up. More follow-through.",
      exact: true,
    })
    .waitFor();
  await page.goto(
    "http://127.0.0.1:3015/?workspaceInvite=legacy-workspace&invite=legacy-invite",
  );
  await page.waitForURL(
    "**/app?workspaceInvite=legacy-workspace&invite=legacy-invite",
  );
  await page
    .getByRole("heading", { name: "Your workspaces", exact: false })
    .waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log(
    "PASS: built landing with/without JS, no home auth/API requests, SEO, assets, 320/390/430/768/1440 layouts, FAQs, app navigation and legacy Google/invitation links.",
  );
} finally {
  await browser.close();
  server.close();
}
