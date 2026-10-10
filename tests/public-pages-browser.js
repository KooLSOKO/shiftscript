// Built public pages with JavaScript disabled: no accounts, APIs or external messages.
import express from "express";
import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const config = JSON.parse(await readFile("vercel.json", "utf8"));
const app = express();
const pages = new Map([
  ["about", "Turn meetings into action."],
  ["privacy", "Privacy Policy"],
  ["terms", "Terms of Service"],
  ["data-deletion", "Data Deletion & Privacy Requests"],
]);
for (const [slug] of pages) {
  const rule = config.rewrites.find((r) => r.source === "/" + slug);
  assert.equal(rule?.destination, `/${slug}/index.html`);
  const document = await readFile(
    resolve("dist", "." + rule.destination),
    "utf8",
  );
  assert(!/<script\b/i.test(document));
  app.get("/" + slug, (_req, res) =>
    res.sendFile(resolve("dist", "." + rule.destination)),
  );
}
app.use(express.static(resolve("dist")));
const server = app.listen(3014, "127.0.0.1");
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
const page = await browser.newPage({
  javaScriptEnabled: false,
  viewport: { width: 1440, height: 1000 },
});
const failures = [];
page.on("response", (r) => {
  if (r.status() >= 400) failures.push(r.url());
});
await mkdir("docs/screenshots", { recursive: true });
try {
  for (const [slug, title] of pages) {
    const response = await page.goto(`http://127.0.0.1:3014/${slug}`);
    assert.equal(response.status(), 200);
    await page
      .getByRole("heading", { name: title, exact: true, level: 1 })
      .waitFor();
    assert.equal(
      await page.locator('link[rel="canonical"]').getAttribute("href"),
      `https://shiftscript.earny.co.za/${slug}`,
    );
    assert(
      await page
        .getByRole("link", { name: "Contact Earny", exact: true })
        .isVisible(),
    );
    assert.equal(
      await page
        .getByRole("link", { name: "Contact Earny", exact: true })
        .getAttribute("href"),
      "mailto:meetings@earny.co.za",
    );
    assert.equal(
      await page.locator('link[rel="stylesheet"]').getAttribute("href"),
      "/policies/style.css",
    );
    assert(
      (await page
        .getByRole("navigation", { name: "On this page" })
        .getByRole("link")
        .count()) > 0,
    );
    for (const img of await page.locator("img").all()) {
      assert(
        await img.evaluate(
          (element) => element.complete && element.naturalWidth > 0,
        ),
        "Public image failed to decode",
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (slug === "about" || slug === "privacy")
      await page.screenshot({
        path: `docs/screenshots/${slug}-public-desktop.png`,
        fullPage: true,
      });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      // Evaluate is unavailable with disabled JS in some browsers; DOM metrics via CDP are unnecessary.
      const body = await page.locator("body").boundingBox();
      const main = await page.locator("main").boundingBox();
      assert(body.width <= width && main.width <= width);
      for (const box of await page
        .locator("h1, .page-body, .site-header, footer")
        .all()) {
        const bounds = await box.boundingBox();
        assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      }
    }
    await page.screenshot({
      path: `docs/screenshots/${slug}-public-mobile.png`,
      fullPage: true,
    });
    await page
      .getByRole("navigation", { name: "Policy pages" })
      .getByRole("link", { name: "Privacy", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Privacy Policy", exact: true, level: 1 })
      .waitFor();
  }
  assert.deepEqual(failures, []);
  console.log(
    "PASS: four built public pages without JavaScript/authentication, configured routes, titles/canonicals, policy links, contact, desktop and 320/390px layouts.",
  );
} finally {
  await browser.close();
  server.close();
}
