// Real React/API flow with simulated Firebase identities; no live account data.
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import request from "supertest";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { shim } from "./fixtures/auth-shim.js";
const dir = await mkdtemp(join(tmpdir(), "shift-profiles-ui-"));
const store = new LocalStore(join(dir, "db.json"));
const people = {
  soko: {
    uid: "soko",
    name: "Victor Soko",
    email: "soko@example.test",
    email_verified: false,
  },
  kopano: {
    uid: "kopano",
    name: "Kopano Mokoena",
    email: "kopano@example.test",
    email_verified: true,
  },
};
const app = createApp({
  store,
  storage: "firebase",
  provider: "sample",
  signupEnabled: true,
  verifyToken: async (uid) => people[uid],
  memberIdentity: async (uid) => ({
    uid,
    email: people[uid].email,
    displayName: people[uid].name,
    emailVerified: people[uid].email_verified,
  }),
});
const api = (method, path, who = "soko", workspace = "soko") =>
  request(app)
    [method]("/api" + path)
    .set("Authorization", "Bearer " + who)
    .set("X-Workspace-Id", workspace);
await api("post", "/workspace")
  .send({ name: "Earny Studio", ownerName: "Victor Soko" })
  .expect(201);
await api("patch", "/profile")
  .send({
    tutorialVersion: 1,
    bio: "I turn conversations into useful next steps.",
  })
  .expect(200);
await api("post", "/workspace", "kopano", "kopano")
  .send({ name: "Portfolio Studio", ownerName: "Kopano Mokoena" })
  .expect(201);
await api("patch", "/profile", "kopano", "kopano")
  .send({
    name: "Kopano Mokoena",
    bio: "Portfolio designer focused on simplicity.",
  })
  .expect(200);
const invite = (
  await api("post", "/members/invitations")
    .send({ email: people.kopano.email, role: "member" })
    .expect(201)
).body.invitation;
await api(
  "post",
  `/workspaces/soko/invitations/${invite.id}/accept`,
  "kopano",
).expect(200);
for (const [who, status] of [
  ["soko", "To Do"],
  ["kopano", "Completed"],
])
  await api("post", "/tasks")
    .send({
      title: who + " portfolio review",
      description: "Review the portfolio",
      owner: people[who].name,
      ownerUid: who,
      deadline: "Not specified",
      dueDate: null,
      priority: "Med",
      status,
      projectId: null,
      checklist: [],
      clientId: crypto.randomUUID(),
    })
    .expect(201);
const server = app.listen(3040, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5190,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3040" },
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
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(
    /\/node_modules\/\.vite\/deps\/firebase_auth\.js(?:\?|$)/,
    (route) =>
      route.fulfill({ contentType: "application/javascript", body: shim }),
  );
  await page.route("https://**", (route) => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem(
      "shiftscript:cookie-preferences:v1",
      JSON.stringify({ version: 1, essential: true, optional: false }),
    );
    localStorage.setItem(
      "test-session",
      JSON.stringify({
        uid: "soko",
        email: "soko@example.test",
        displayName: "Victor Soko",
        emailVerified: false,
      }),
    );
  });
  await page.goto("http://127.0.0.1:5190/app");
  await page.locator(".auth-transition").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Open your profile", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Victor Soko", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Email verified", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("About you", { exact: true })
    .fill("Building a clearer path from meetings to tasks.");
  await page
    .getByLabel("Profile photo", { exact: true })
    .setInputFiles("public/art/profile.png");
  await page
    .getByRole("button", { name: "Save profile & preferences", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Your profile and preferences are saved.",
  );
  await expect(page.locator(".profile-bio")).toHaveText(
    "Building a clearer path from meetings to tasks.",
  );
  await expect(page.locator(".profile-portrait img")).toHaveAttribute(
    "src",
    /^data:image\/webp/,
  );
  const saved = (await api("get", "/profile")).body.profile;
  assert(saved.avatar.length <= 100000);
  people.soko.email_verified = true;
  await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem("test-session"));
    session.emailVerified = true;
    localStorage.setItem("test-session", JSON.stringify(session));
  });
  await page
    .getByRole("button", { name: "Check verification", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Email verified", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Check verification", exact: true }),
  ).toHaveCount(0);
  await page.locator(".profile-tasks-button").click();
  await expect(
    page.getByRole("button", { name: "soko portfolio review", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "kopano portfolio review", exact: true }),
  ).toHaveCount(0);
  console.log(
    "Profile name/bio/photo save, verification refresh and My tasks passed.",
  );
  async function navigate(label) {
    if (
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width <= 850)
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Open your profile", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Victor Soko", exact: true }),
    ).toBeVisible();
    assert(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    );
    if (process.env.SHIFTSCRIPT_QA_IMAGES && (width === 1440 || width === 390))
      await page.locator(".profile-layout").screenshot({
        path: join(
          process.env.SHIFTSCRIPT_QA_IMAGES,
          `profile-qa-${width}.png`,
        ),
      });
    const portrait = await page.locator(".profile-portrait").boundingBox();
    assert(
      portrait.width > 180 &&
        portrait.x >= 0 &&
        portrait.x + portrait.width <= width,
    );
    await navigate("Team & workspace");
    await page
      .getByRole("button", {
        name: "View Kopano Mokoena's profile",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Workspace member profile",
      exact: true,
    });
    await expect(
      dialog.getByRole("heading", { name: "Kopano Mokoena", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("img", { name: "Email verified", exact: true }),
    ).toHaveCount(1);
    await expect(dialog.locator(".profile-bio")).toHaveText(
      "Portfolio designer focused on simplicity.",
    );
    assert(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    const stats = await dialog.locator(".profile-card-stats").innerText();
    assert(stats.includes("Completed"));
    const box = await dialog.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width + 1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    console.log(
      `${width}px: sidebar profile navigation, responsive own/member cards, verified badge and modal bounds passed.`,
    );
  }
  people.kopano.email_verified = false;
  await page
    .getByRole("button", { name: "View Kopano Mokoena's profile", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Kopano Mokoena", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("img", { name: "Email verified", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate("Overview");
  await page.getByRole("button", { name: "New meeting", exact: true }).click();
  const modal = page.getByRole("dialog", {
    name: "A new conversation",
    exact: true,
  });
  const dial = modal.locator(".source-stick");
  await expect(dial).toBeVisible();
  const choice = (name) => modal.getByRole("radio", { name, exact: true });
  for (const [dx, dy, label] of [
    [45, 0, "Voice"],
    [0, 45, "Recent Google Meet"],
    [-45, 0, "Previous meeting"],
    [0, -45, "Text"],
  ]) {
    await dial.scrollIntoViewIfNeeded();
    const box = await dial.boundingBox();
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await expect(choice(label)).toHaveAttribute("data-preview", "true");
    await page.mouse.up();
    await expect(choice(label)).toHaveAttribute("aria-checked", "true");
  }
  await choice("Voice").click();
  await expect(choice("Voice")).toHaveAttribute("aria-checked", "true");
  // Hovering and a tiny drag must not change the mode.
  await choice("Previous meeting").hover();
  await expect(choice("Voice")).toHaveAttribute("aria-checked", "true");
  const box = await dial.boundingBox(),
    x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 3, y + 3);
  await page.mouse.up();
  await expect(choice("Voice")).toHaveAttribute("aria-checked", "true");
  await choice("Voice").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(choice("Previous meeting")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const transition = await dial
    .locator(".source-stick-knob")
    .evaluate((el) => getComputedStyle(el).transitionTimingFunction);
  assert(!transition.includes("cubic-bezier"));
  await page.keyboard.press("Escape");
  const selected = page.locator(".nav-item.selected");
  const borders = await selected.evaluate((el) => {
    const s = getComputedStyle(el);
    return [
      s.borderTopWidth,
      s.borderRightWidth,
      s.borderBottomWidth,
      s.borderLeftWidth,
      s.boxShadow,
    ];
  });
  assert.deepEqual(borders, ["2px", "2px", "2px", "2px", "none"]);
  console.log(
    "Desktop dial dragging/clicking/arrow keys, tiny-drag safety and complete blue selection border passed.",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await vite.close();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
