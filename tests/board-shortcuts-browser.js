// Actual React/API signup, onboarding, keyboard shortcuts and board movement. No live services.
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import request from "supertest";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { boardSort } from "../shared/board.js";
import { shim } from "./fixtures/auth-shim.js";
const dir = await mkdtemp(join(tmpdir(), "shift-board-ui-"));
const store = new LocalStore(join(dir, "db.json"));
const app = createApp({
  storage: "firebase",
  provider: "sample",
  signupEnabled: true,
  store,
  verifyToken: async (uid) => ({
    uid,
    name: "Kiya Soko",
    email: uid + "@example.test",
    email_verified: true,
  }),
});
const server = app.listen(3037, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5187,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3037" },
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
    args: bundle.args.filter((a) => a !== "--single-process"),
  };
}
const browser = await chromium.launch(launch),
  errors = [];
const base = {
  description: "Portfolio review",
  owner: "Kiya Soko",
  ownerUid: "soko",
  deadline: "Not specified",
  dueDate: null,
  priority: "Med",
  status: "To Do",
  projectId: null,
  checklist: [],
};
const api = (method, path) =>
  request(app)
    [method]("/api" + path)
    .set("Authorization", "Bearer soko")
    .set("X-Workspace-Id", "soko");
async function setup(page, session = true) {
  page.setDefaultTimeout(45000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(
    /\/node_modules\/\.vite\/deps\/firebase_auth\.js(?:\?|$)/,
    (route) =>
      route.fulfill({ contentType: "application/javascript", body: shim }),
  );
  await page.route("https://**", (route) => route.abort());
  await page.addInitScript(() => {
    window.testOpening = { seen: 0, phases: [], finished: 0 };
    let active = false;
    const watch = new MutationObserver(() => {
      const overlay = document.querySelector(".auth-transition");
      if (overlay) {
        if (!active) {
          window.testOpening.seen++;
          active = true;
        }
        const phase = overlay.dataset.phase;
        if (!window.testOpening.phases.includes(phase))
          window.testOpening.phases.push(phase);
      } else if (active) {
        active = false;
        window.testOpening.finished++;
      }
    });
    watch.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-phase"],
    });
  });
  await page.addInitScript(
    ({ session }) => {
      localStorage.setItem(
        "shiftscript:cookie-preferences:v1",
        JSON.stringify({ version: 1, essential: true, optional: false }),
      );
      if (session)
        localStorage.setItem(
          "test-session",
          JSON.stringify({
            uid: "soko",
            email: "soko@example.test",
            displayName: "Kiya Soko",
            emailVerified: true,
          }),
        );
    },
    { session },
  );
}
async function fit(dialog, page, label) {
  const box = await dialog.evaluate((el) => ({
    left: el.getBoundingClientRect().left,
    right: el.getBoundingClientRect().right,
    width: innerWidth,
    inner: el.clientWidth,
    scroll: el.scrollWidth,
  }));
  assert(
    box.left >= -1 && box.right <= box.width + 1 && box.scroll <= box.inner + 1,
    label + JSON.stringify(box),
  );
  assert(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    label +
      " document overflow " +
      JSON.stringify(
        await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.body.scrollWidth,
          wide: [...document.querySelectorAll("body *")]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.right > innerWidth + 1 && r.width > 0;
            })
            .slice(0, 10)
            .map((el) => ({
              tag: el.tagName,
              classes: el.className,
              right: el.getBoundingClientRect().right,
            })),
        })),
      ),
  );
}
try {
  let tour;
  if (process.env.SHIFTSCRIPT_UI_MOBILE_ONLY) {
    await api("post", "/workspace")
      .send({ name: "Earny Studio", ownerName: "Kiya Soko" })
      .expect(201);
    await api("patch", "/profile").send({ tutorialVersion: 1 }).expect(200);
  } else {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "no-preference",
    });
    await setup(page, false);
    await page.goto("http://127.0.0.1:5187/app?mode=signup");
    await page
      .getByRole("dialog", { name: "Opening ShiftScript", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Skip animation", exact: true })
      .click();
    await page.getByLabel("Full name", { exact: true }).fill("Kiya Soko");
    await page.getByLabel("Email", { exact: true }).fill("soko@example.test");
    await page.getByLabel("Password", { exact: true }).fill("test-pass-123");
    await page
      .getByLabel("Confirm password", { exact: true })
      .fill("test-pass-123");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Opening ShiftScript", exact: true })
      .waitFor();
    await page
      .getByRole("dialog", { name: "Opening ShiftScript", exact: true })
      .waitFor({ state: "hidden" });
    await page
      .getByLabel("Workspace name", { exact: true })
      .fill("Earny Studio");
    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .click();
    tour = page.getByRole("dialog", {
      name: "Welcome to your workspace",
      exact: true,
    });
    await tour.waitFor();
    await fit(tour, page, "Signup tutorial");

    await tour.getByRole("button", { name: "Next", exact: true }).click();
    tour = page.getByRole("dialog", {
      name: "A meeting becomes a plan",
      exact: true,
    });
    await tour.getByRole("button", { name: "Next", exact: true }).click();
    tour = page.getByRole("dialog", {
      name: "Make the board your own",
      exact: true,
    });
    await tour.waitFor();
    const practice = tour.getByRole("button", {
      name: "Move Review the portfolio",
      exact: true,
    });
    await practice.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await expect(
      tour.locator('[data-board-status="In Progress"]'),
    ).toContainText("Review the portfolio");
    assert.equal((await store.list("soko")).tasks.length, 0);
    await tour.getByRole("button", { name: "Next", exact: true }).click();
    tour = page.getByRole("dialog", {
      name: "A few keys. A faster day.",
      exact: true,
    });
    await tour
      .getByRole("columnheader", { name: "Mac", exact: true })
      .waitFor();
    await tour
      .getByRole("columnheader", { name: "Windows", exact: true })
      .waitFor();
    await tour
      .getByRole("button", { name: "Let's get started", exact: true })
      .click();
    await tour.waitFor({ state: "hidden" });
    assert.equal((await store.getProfile("soko")).tutorialVersion, 1);
    console.log(
      "First-signup tutorial, practice keyboard board and profile persistence passed.",
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .waitForFunction(() => window.testOpening?.finished > 0)
      .catch(async (error) => {
        console.log(
          "OPENING DIAGNOSTIC",
          await page.evaluate(() => ({
            opening: window.testOpening,
            reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
            overlay: document
              .querySelector(".auth-transition")
              ?.outerHTML.slice(0, 300),
            body: document.body.innerText.slice(0, 500),
          })),
          errors,
        );
        throw error;
      });
    assert((await page.evaluate(() => window.testOpening.seen)) > 0);
    assert(
      await page.evaluate(
        () =>
          window.testOpening.phases.includes("cover") &&
          window.testOpening.phases.includes("reveal"),
      ),
    );
    assert.equal(
      await page
        .getByRole("dialog", { name: "Welcome to your workspace", exact: true })
        .count(),
      0,
    );
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.keyboard.press("Meta+k");
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.keyboard.press("n");
    await page
      .getByRole("dialog", { name: "A new conversation", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.keyboard.press("t");
    await page
      .getByRole("dialog", { name: "A new task", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    const cards = [];
    for (const title of [
      "Draft portfolio",
      "Review portfolio",
      "Publish portfolio",
    ])
      cards.push(
        (
          await api("post", "/tasks")
            .send({ ...base, title, clientId: crypto.randomUUID() })
            .expect(201)
        ).body.task,
      );
    await page.keyboard.press("r");
    await page
      .getByRole("status")
      .filter({ hasText: "Workspace refreshed." })
      .waitFor();
    await page.keyboard.press("b");
    const handle = page.getByRole("button", {
      name: "Move Draft portfolio",
      exact: true,
    });
    const dest = page.locator('[data-board-status="In Progress"]');
    await handle.scrollIntoViewIfNeeded();
    let from = await handle.boundingBox(),
      to = await dest.boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, Math.max(120, to.y + 80), {
      steps: 12,
    });
    await page.mouse.up();
    await expect(dest).toContainText("Draft portfolio");
    assert.equal(
      (await store.list("soko")).tasks.find((t) => t.id === cards[0].id).status,
      "In Progress",
    );
    await page.keyboard.press("Control+z");
    await expect(page.locator('[data-board-status="To Do"]')).toContainText(
      "Draft portfolio",
    );
    console.log(
      "Desktop shortcuts, mouse status movement and keyboard Undo passed.",
    );
    // Same-column placement uses real pointer coordinates and survives a reload.
    const draft = page.getByRole("button", {
      name: "Move Draft portfolio",
      exact: true,
    });
    const publish = page.locator(`[data-board-task="${cards[2].id}"]`);
    await draft.scrollIntoViewIfNeeded();
    from = await draft.boundingBox();
    await page.mouse.move(from.x + 22, from.y + 22);
    await page.mouse.down();
    to = await publish.boundingBox();
    if (to.y < 140) {
      await page.mouse.move(from.x + 22, 50, { steps: 10 });
      for (let i = 0; i < 45; i++) {
        await page.waitForTimeout(25);
        to = await publish.boundingBox();
        if (to.y >= 140) break;
      }
    }
    await page.mouse.move(to.x + to.width / 2, to.y + to.height * 0.25, {
      steps: 12,
    });
    // Edge scrolling may have advanced during the last mouse steps. Re-read the
    // destination before release so this checks a deliberate before-card drop.
    await page.waitForTimeout(100);
    to = await publish.boundingBox();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height * 0.25);
    await page.mouse.up();
    await expect(page.locator(".board-feedback")).toContainText(
      "moved to To Do",
    );
    const saved = (await store.list("soko")).tasks
      .filter((t) => t.status === "To Do")
      .sort(boardSort);
    assert(
      saved.findIndex((t) => t.id === cards[0].id) <
        saved.findIndex((t) => t.id === cards[2].id),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .waitForFunction(() => window.testOpening?.finished > 0)
      .catch(async (error) => {
        console.log(
          "OPENING DIAGNOSTIC",
          await page.evaluate(() => ({
            opening: window.testOpening,
            reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
            overlay: document
              .querySelector(".auth-transition")
              ?.outerHTML.slice(0, 300),
            body: document.body.innerText.slice(0, 500),
          })),
          errors,
        );
        throw error;
      });
    assert((await page.evaluate(() => window.testOpening.seen)) > 0);
    assert(
      await page.evaluate(
        () =>
          window.testOpening.phases.includes("cover") &&
          window.testOpening.phases.includes("reveal"),
      ),
    );
    await page.keyboard.press("b");
    const ids = await page
      .locator('[data-board-status="To Do"] [data-board-task]')
      .evaluateAll((items) => items.map((el) => el.dataset.boardTask));
    assert.deepEqual(
      ids,
      saved.map((t) => t.id),
    );
    // Keyboard selection can reach all five columns, and Escape never commits.
    await page
      .getByRole("button", { name: "Move Review portfolio", exact: true })
      .focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    assert.equal(
      (await store.list("soko")).tasks.find((t) => t.id === cards[1].id).status,
      "To Do",
    );
    await page.keyboard.press("Space");
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await expect(page.locator('[data-board-status="Completed"]')).toContainText(
      "Review portfolio",
    );
    // Letter keys in an actual task text input must not open another screen.
    await page
      .getByRole("button", { name: "Publish portfolio", exact: true })
      .click();
    const input = page
      .getByRole("dialog", { name: "Task details", exact: true })
      .getByLabel("Task title", { exact: true });
    await input.fill("nbtdram");
    assert.equal(await input.inputValue(), "nbtdram");
    await page.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      ),
    );
    const restoredOpening = page.getByRole("dialog", {
      name: "Opening ShiftScript",
      exact: true,
    });
    await restoredOpening.waitFor();
    await expect(input).toHaveValue("nbtdram");
    assert(
      await restoredOpening
        .getByRole("button", { name: "Skip animation", exact: true })
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            document
              .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
              ?.closest(".auth-transition") === el.closest(".auth-transition")
          );
        }),
    );
    await restoredOpening
      .getByRole("button", { name: "Skip animation", exact: true })
      .click();
    await restoredOpening.waitFor({ state: "hidden" });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("nbtdram");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.keyboard.press("Control+/");
    let help = page.getByRole("dialog", {
      name: "Shortcuts and controls",
      exact: true,
    });
    const preference = () =>
      help.getByRole("checkbox", {
        name: "Enable single-key shortcuts",
        exact: false,
      });
    await preference().click();
    await expect(preference()).not.toBeChecked();
    await expect(preference()).toBeEnabled();
    assert.equal((await store.getProfile("soko")).singleKeyShortcuts, false);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.keyboard.press("n");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.keyboard.press("Control+k");
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.testOpening?.finished > 0);
    await page.keyboard.press("Meta+/");
    help = page.getByRole("dialog", {
      name: "Shortcuts and controls",
      exact: true,
    });
    await expect(preference()).not.toBeChecked();
    await expect(preference()).toBeEnabled();
    await help
      .getByRole("button", { name: "Replay workspace tutorial", exact: true })
      .click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    tour = page.getByRole("dialog", {
      name: "Make the board your own",
      exact: true,
    });
    await tour
      .getByRole("button", { name: "Move Review the portfolio", exact: true })
      .focus();
    await page.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      ),
    );
    await page
      .getByRole("button", { name: "Skip animation", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Opening ShiftScript", exact: true })
      .waitFor({ state: "hidden" });
    await expect(tour).toBeVisible();
    await expect(
      tour.getByRole("button", {
        name: "Move Review the portfolio",
        exact: true,
      }),
    ).toBeFocused();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await expect(
      tour.locator('[data-board-status="In Progress"]'),
    ).toContainText("Review the portfolio");
    await tour.getByRole("button", { name: "Next", exact: true }).click();
    await page
      .getByRole("checkbox", {
        name: "Enable single-key shortcuts",
        exact: false,
      })
      .check();
    await expect(
      page.getByRole("checkbox", {
        name: "Enable single-key shortcuts",
        exact: false,
      }),
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", {
        name: "Enable single-key shortcuts",
        exact: false,
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Let's get started", exact: true })
      .click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Shortcuts and tutorial", exact: true })
      .click();
    help = page.getByRole("dialog", {
      name: "Shortcuts and controls",
      exact: true,
    });
    await page.route("**/api/profile", async (route) => {
      if (route.request().method() === "PATCH")
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Test saving failure" }),
        });
      else await route.continue();
    });
    await preference().click();
    await expect(help.getByRole("alert")).toContainText("could not be saved");
    await expect(preference()).toBeChecked();
    await expect(preference()).toBeEnabled();
    assert.equal((await store.getProfile("soko")).singleKeyShortcuts, true);
    await page.unroute("**/api/profile");
    await preference().click();
    await expect(preference()).not.toBeChecked();
    await expect(preference()).toBeEnabled();
    await preference().click();
    await expect(preference()).toBeChecked();
    await expect(preference()).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    console.log(
      "Transition preserves editor values/focus and tutorial steps; shortcut opt-out persists, keeps modifier and board controls, and handles save/retry errors.",
    );
    await page.close();
    console.log(
      "Desktop signup tutorial, Mac/Windows shortcuts, pointer reorder/status, keyboard move/cancel, Undo, persistence and opening replay passed.",
    );
  }
  for (const width of [320, 390, 768]) {
    const mobile = await browser.newPage({
      viewport: { width, height: 900 },
      isMobile: width < 650,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    await setup(mobile);
    await mobile.goto("http://127.0.0.1:5187/app");
    await mobile
      .getByRole("button", { name: "Shortcuts and tutorial", exact: true })
      .click();
    let help = mobile.getByRole("dialog", {
      name: "Shortcuts and controls",
      exact: true,
    });
    await fit(help, mobile, "Shortcut help " + width);
    await mobile.emulateMedia({ reducedMotion: "no-preference" });
    await mobile.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      ),
    );
    const opening = mobile.getByRole("dialog", {
      name: "Opening ShiftScript",
      exact: true,
    });
    await opening.waitFor();
    await fit(opening, mobile, "Opening over help " + width);
    await opening
      .getByRole("button", { name: "Skip animation", exact: true })
      .click();
    await opening.waitFor({ state: "hidden" });
    await expect(help).toBeVisible();
    await mobile.emulateMedia({ reducedMotion: "reduce" });
    if (width === 320 && process.env.SHIFTSCRIPT_QA_OUTPUT)
      await help.screenshot({
        path: join(
          process.env.SHIFTSCRIPT_QA_OUTPUT,
          "shortcuts-help-mobile.png",
        ),
      });
    await help
      .getByRole("button", { name: "Replay workspace tutorial", exact: true })
      .click();
    tour = mobile.getByRole("dialog", {
      name: "Welcome to your workspace",
      exact: true,
    });
    await fit(tour, mobile, "Tutorial " + width);
    await tour.getByRole("button", { name: "Next", exact: true }).click();
    tour = mobile.getByRole("dialog", {
      name: "A meeting becomes a plan",
      exact: true,
    });
    await tour.getByRole("button", { name: "Next", exact: true }).click();
    tour = mobile.getByRole("dialog", {
      name: "Make the board your own",
      exact: true,
    });
    await fit(tour, mobile, "Practice board " + width);
    // Native browser touch input exercises pointer capture and edge auto-scroll.
    const grab = tour.getByRole("button", {
      name: "Move Review the portfolio",
      exact: true,
    });
    const col = tour.locator('[data-board-status="In Progress"]');
    await grab.scrollIntoViewIfNeeded();
    const start = await grab.boundingBox();
    const board = tour.locator(".task-board");
    const bounds = await board.boundingBox();
    const cdp = await mobile.context().newCDPSession(mobile);
    const y = start.y + start.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: start.x + start.width / 2, y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: Math.min(bounds.x + bounds.width - 10, width - 15), y },
      ],
    });
    for (let i = 0; i < 35; i++) {
      await mobile.waitForTimeout(25);
      const target = await col.boundingBox();
      if (
        target.x >= bounds.x - 1 &&
        target.x + target.width <= bounds.x + bounds.width + 1
      )
        break;
    }
    const target = await col.boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: Math.max(
            bounds.x + 50,
            Math.min(target.x + target.width / 2, bounds.x + bounds.width - 50),
          ),
          y: target.y + 60,
        },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(col).toContainText("Review the portfolio");
    await cdp.detach();
    await tour.getByRole("button", { name: "Next", exact: true }).click();
    tour = mobile.getByRole("dialog", {
      name: "A few keys. A faster day.",
      exact: true,
    });
    await fit(tour, mobile, "Controls table " + width);
    await tour
      .getByRole("button", { name: "Let's get started", exact: true })
      .click();
    await tour.waitFor({ state: "hidden" });
    await mobile
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await mobile.emulateMedia({ reducedMotion: "no-preference" });
    await mobile.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      ),
    );
    await mobile
      .getByRole("dialog", { name: "Opening ShiftScript", exact: true })
      .waitFor();
    await mobile.keyboard.press("Escape");
    await mobile
      .getByRole("dialog", { name: "Opening ShiftScript", exact: true })
      .waitFor({ state: "hidden" });
    await expect(
      mobile.getByRole("button", { name: "Open navigation", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    await mobile.keyboard.press("Escape");
    await expect(
      mobile.getByRole("button", { name: "Open navigation", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await mobile.emulateMedia({ reducedMotion: "reduce" });
    await mobile.reload();
    await mobile
      .getByRole("button", { name: "Shortcuts and tutorial", exact: true })
      .waitFor();
    assert.equal(await mobile.locator(".auth-transition").count(), 0);
    await mobile.close();
    console.log(
      `Tutorial and controls fit ${width}px; touch practice movement and reduced-motion launch passed.`,
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await vite.close();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
