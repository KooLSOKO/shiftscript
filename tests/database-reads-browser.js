import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import request from "supertest";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { FirebaseStore } from "../server/store.js";
import { countingFirestore } from "./fixtures/firestore-counting.js";
import { shim } from "./fixtures/auth-shim.js";

const mock = countingFirestore();
const store = new FirebaseStore(() => ({ db: mock.db }));
const app = createApp({
  storage: "firebase",
  provider: "sample",
  signupEnabled: true,
  store,
  verifyToken: async (uid) => ({
    uid,
    name: "Victor",
    email: uid + "@example.test",
    email_verified: true,
  }),
});
const api = (method, path) =>
  request(app)
    [method]("/api" + path)
    .set("Authorization", "Bearer soko")
    .set("X-Workspace-Id", "soko");
await api("post", "/workspace")
  .send({ name: "The Interns", ownerName: "Victor" })
  .expect(201);
await api("patch", "/profile").send({ tutorialVersion: 1 }).expect(200);
const fields = {
  title: "Review portfolio",
  description: "Check the mobile layout",
  owner: "Victor",
  ownerUid: "soko",
  deadline: "Not specified",
  dueDate: null,
  priority: "Med",
  status: "To Do",
  projectId: null,
  checklist: [],
  dependencyIds: [],
};
const task = (await api("post", "/tasks").send(fields).expect(201)).body.task;
const server = app.listen(3056, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5206,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3056" },
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
    args: bundle.args.filter((arg) => arg !== "--single-process"),
  };
}
const browser = await chromium.launch(launch),
  errors = [];
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
      reducedMotion: "reduce",
    });
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(
      /\/node_modules\/\.vite\/deps\/firebase_auth\.js(?:\?|$)/,
      (route) =>
        route.fulfill({ contentType: "application/javascript", body: shim }),
    );
    await page.route("https://**", (route) => route.abort());
    await page.addInitScript(() => {
      localStorage.setItem(
        "test-session",
        JSON.stringify({
          uid: "soko",
          email: "soko@example.test",
          displayName: "Victor",
          emailVerified: true,
        }),
      );
      localStorage.setItem(
        "shiftscript:cookie-preferences:v1",
        JSON.stringify({ version: 1, essential: true, optional: false }),
      );
    });
    await page.clock.install();
    let fullLoads = 0;
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.pathname === "/api/workspace" && !url.search) fullLoads++;
    });
    await page.goto("http://127.0.0.1:5206/app");
    await page.clock.runFor(4000);
    await page.locator(".app-shell").waitFor();
    await page
      .getByRole("dialog", { name: "Opening ShiftScript", exact: true })
      .waitFor({ state: "hidden" });
    const beforePoll = fullLoads;
    mock.reset();
    const idleReply = page.waitForResponse((response) =>
      response.url().includes("/api/workspace?since="),
    );
    await page.clock.fastForward(120001);
    assert.equal((await (await idleReply).json()).unchanged, true);
    assert.equal(mock.count(), 2);
    assert.equal(fullLoads, beforePoll);
    await page
      .getByRole("button", {
        name: mobile ? "Go to Tasks" : "Task tracker",
        exact: true,
      })
      .click();
    const title = mock.docs.get("workspaces/soko/tasks/" + task.id).title;
    await page.getByRole("button", { name: title, exact: true }).click();
    const editedTitle = mobile
      ? "Mobile review complete"
      : "Desktop review complete";
    await page
      .getByRole("dialog")
      .getByLabel("Task title", { exact: true })
      .fill(editedTitle);
    const beforeSave = fullLoads;
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByText("Changes saved.", { exact: true })
      .waitFor();
    assert.equal(
      fullLoads,
      beforeSave,
      "saving a task must not reload all workspace collections",
    );
    assert.equal(
      mock.docs.get("workspaces/soko/tasks/" + task.id).title,
      editedTitle,
    );
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: editedTitle, exact: true }),
    ).toBeVisible();
    const changedReply = page.waitForResponse((response) =>
      response.url().includes("/api/workspace?since="),
    );
    await page.clock.fastForward(120001);
    const changed = await (await changedReply).json();
    assert.equal(
      changed.tasks.find((item) => item.id === task.id).title,
      editedTitle,
    );
    assert(!changed.unchanged);
    assert(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    );
    await page
      .getByRole("button", { name: "Refresh workspace", exact: true })
      .click();
    await expect.poll(() => fullLoads).toBe(beforeSave + 1);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop/mobile revision polling uses two reads, task saves avoid full reloads, changed shared data syncs, manual refresh and layout remain usable.",
  );
} finally {
  await browser.close();
  await vite.close();
  await new Promise((resolve) => server.close(resolve));
}
