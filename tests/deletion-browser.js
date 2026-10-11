// Real deletion routes and UI, isolated storage, no external service calls.
import express from "express";
import { chromium, expect } from "@playwright/test";
import request from "supertest";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { sampleTranscript } from "../server/analyze.js";
const dir = await mkdtemp(join(tmpdir(), "shift-delete-ui-"));
const store = new LocalStore(join(dir, "db.json"));
const app = createApp({ store, storage: "local", provider: "sample" });
await request(app)
  .post("/api/workspace")
  .send({ name: "Earny Studio", ownerName: "Kiya Soko" })
  .expect(201);
app.use(express.static(resolve("dist")));
app.get("/app", (_req, res) => res.sendFile(resolve("dist/index.html")));
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
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
const errors = [];
try {
  for (const width of [320, 390, 768, 1440]) {
    // New fixture per viewport so every confirmation is exercised against real data.
    await store.mutate("local-demo", (s) => {
      s.meetings = [];
      s.tasks = [];
      s.undoRecords = [];
      s.agendas = [];
      s.notes = [];
      s.quota = {};
    });
    const meeting = (
      await request(app)
        .post("/api/meetings")
        .send({
          title: `Portfolio review ${width}`,
          date: "2026-10-11",
          type: "Planning",
          transcript: sampleTranscript,
        })
        .expect(201)
    ).body.meeting;
    const proposal = meeting.proposals[0];
    await request(app)
      .post(`/api/meetings/${meeting.id}/reviews`)
      .send({
        reviews: [
          {
            title: `Publish portfolio ${width}`,
            description: proposal.description,
            owner: "Kiya Soko",
            ownerUid: null,
            deadline: proposal.deadline,
            dueDate: null,
            priority: proposal.priority,
            proposalId: proposal.id,
            decision: "approved",
          },
        ],
      })
      .expect(200);
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    page.setDefaultTimeout(12000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() =>
      localStorage.setItem(
        "shiftscript:cookie-preferences:v1",
        JSON.stringify({ version: 1, essential: true, optional: false }),
      ),
    );
    await page.route("https://**", (route) => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/app`);
    if (width > 650 && width <= 850)
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    await page
      .getByRole("button", {
        name: width <= 650 ? "Go to Tasks" : "Task tracker",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: `Publish portfolio ${width}`, exact: true })
      .click();
    const taskDialog = page.getByRole("dialog", {
      name: "Task details",
      exact: true,
    });
    const deleteTask = taskDialog.getByRole("button", {
      name: "Delete task",
      exact: true,
    });
    assert((await deleteTask.boundingBox()).height >= 44);
    await deleteTask.click();
    let confirm = page.getByRole("dialog", {
      name: "Delete this task?",
      exact: true,
    });
    await expect(
      confirm.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal((await store.list("local-demo")).tasks.length, 1);
    await deleteTask.click();
    await confirm
      .getByRole("button", { name: "Delete task", exact: true })
      .click();
    await taskDialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page
      .getByRole("button", { name: `Publish portfolio ${width}`, exact: true })
      .waitFor();
    assert.equal((await store.list("local-demo")).tasks.length, 1);
    if (width > 650 && width <= 850)
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    const navigation = page.getByRole("button", {
      name: width <= 650 ? "Go to Meetings" : "Meetings",
      exact: true,
    });
    await navigation.click();
    await page
      .locator(".meeting-row")
      .filter({ hasText: meeting.title })
      .click();
    const deleteMeeting = page.getByRole("button", {
      name: "Delete meeting",
      exact: true,
    });
    assert((await deleteMeeting.boundingBox()).height >= 44);
    await deleteMeeting.click();
    confirm = page.getByRole("dialog", {
      name: "Delete this meeting?",
      exact: true,
    });
    await confirm
      .getByText("1 linked task will also be deleted.", { exact: true })
      .waitFor();
    const fits = await confirm.evaluate((el) => ({
      inner: el.clientWidth,
      content: el.scrollWidth,
      left: el.getBoundingClientRect().left,
      right: el.getBoundingClientRect().right,
      viewport: innerWidth,
    }));
    assert(
      fits.content <= fits.inner + 1 &&
        fits.left >= -1 &&
        fits.right <= fits.viewport + 1,
      JSON.stringify(fits),
    );
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal((await store.list("local-demo")).meetings.length, 1);
    await deleteMeeting.click();
    await confirm
      .getByRole("button", { name: "Delete meeting & tasks", exact: true })
      .click();
    await confirm.waitFor({ state: "hidden" });
    await page
      .getByRole("status")
      .filter({ hasText: "Meeting deleted with 1 linked task." })
      .waitFor();
    const state = await store.list("local-demo");
    assert.equal(state.meetings.length, 0);
    assert.equal(state.tasks.length, 0);
    await expect(page.locator(".meeting-row")).toHaveCount(0);
    await page.close();
    console.log(
      `Deletion UI passed: ${width}px, task cancel/delete/undo, meeting cancel/cascade, dialog bounds and touch targets.`,
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
