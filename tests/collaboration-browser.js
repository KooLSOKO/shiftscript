// Real React + Node workflows with simulated identities, no live Firebase/Gemini calls.
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { LocalStore } from "../server/store.js";
import { newWorkspace } from "../server/collaboration.js";
const names = {
  soko: "Victor Soko",
  kopano: "Kopano",
  viewer: "Client Viewer",
};
const directory = await mkdtemp(join(tmpdir(), "shift-collaboration-ui-")),
  store = new LocalStore(join(directory, "db.json"));
const invitationEmails = [];
await store.mutate("soko", (s) => {
  s.workspace = newWorkspace(
    "soko",
    { name: "Soko Studio", ownerName: names.soko },
    { uid: "soko", email: "soko@example.test", name: names.soko },
  );
});
const server = createApp({
  storage: "firebase",
  provider: "sample",
  signupEnabled: true,
  store,
  appUrl: "https://shiftscript.earny.co.za",
  mailer: {
    ready: true,
    send: async (recipients, message) => {
      invitationEmails.push({ recipients, message });
      return { accepted: recipients, rejected: [] };
    },
  },
  verifyToken: async (token) => {
    const [uid, verified] = token.split("|");
    if (!names[uid]) throw new Error("Bad test token");
    return {
      uid,
      email: uid + "@example.test",
      name: names[uid],
      email_verified: verified === "true",
    };
  },
}).listen(3011, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5181,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3011" },
  },
});
await vite.listen();
let options = { headless: true };
if (process.env.SHIFTSCRIPT_TEST_CHROMIUM) {
  const { default: bundled } = await import(
    process.env.SHIFTSCRIPT_TEST_CHROMIUM
  );
  options = {
    headless: true,
    executablePath: await bundled.executablePath(),
    args: bundled.args.filter((arg) => arg !== "--single-process"),
  };
}
const browser = await chromium.launch(options),
  errors = [];
const shim = `export const signInWithRedirect=async()=>{};export const getRedirectResult=async()=>null;export class GoogleAuthProvider { setCustomParameters() {} };export const signInWithPopup=async()=>{throw Object.assign(new Error(),{code:"auth/popup-closed-by-user"});};const callbacks=new Set();const value=JSON.parse(localStorage.getItem('test-session'));const auth={currentUser:value&&{...value,getIdToken:async()=>auth.currentUser.uid+'|'+auth.currentUser.emailVerified,reload:async()=>{auth.currentUser.emailVerified=true;localStorage.setItem('test-session',JSON.stringify(auth.currentUser));}}};export const getAuth=()=>auth;export const onAuthStateChanged=(_a,fn)=>{callbacks.add(fn);queueMicrotask(()=>fn(auth.currentUser));return()=>callbacks.delete(fn);};export const signOut=async()=>{auth.currentUser=null;localStorage.removeItem('test-session');callbacks.forEach(fn=>fn(null));};export const updateProfile=async(u,p)=>Object.assign(u,p);export const sendEmailVerification=async()=>{};export const sendPasswordResetEmail=async()=>{};export const signInWithEmailAndPassword=async()=>{};export const createUserWithEmailAndPassword=async()=>{};`;
async function pageFor(uid, verified = true) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addInitScript(
    (user) => {
      if (!localStorage.getItem("test-session"))
        localStorage.setItem("test-session", JSON.stringify(user));
    },
    {
      uid,
      email: uid + "@example.test",
      displayName: names[uid],
      emailVerified: verified,
    },
  );
  await context.addInitScript(() =>
    localStorage.setItem(
      "shiftscript:cookie-preferences:v1",
      JSON.stringify({ version: 1, essential: true, optional: false }),
    ),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", async (response) => {
    if (response.url().includes("/api/") && response.status() >= 400)
      console.error(
        "API failure",
        response.status(),
        response.request().method(),
        response.url(),
        response.request().headers()["x-workspace-id"],
        await response
          .text()
          .catch(() => "Response body unavailable after navigation"),
      );
  });
  await page.route(
    /\/node_modules\/\.vite\/deps\/firebase_auth\.js(?:\?|$)/,
    (route) =>
      route.fulfill({ contentType: "application/javascript", body: shim }),
  );
  await page.route("https://**", (route) => route.abort());
  return page;
}
await mkdir("docs/screenshots", { recursive: true });
const page = await pageFor("soko");
const url = "http://127.0.0.1:5181";
const nav = async (label, p = page) => {
  if (
    await p
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  )
    await p
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await p.getByRole("button", { name: label, exact: true }).click();
};
try {
  await page.goto(url + "/app");
  await page
    .getByRole("heading", { name: "Less follow-up. More follow-through." })
    .waitFor();
  await nav("Projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Kopano Portfolio");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A polished portfolio for Kopano’s new website.");
  await page.getByLabel("Accent colour").selectOption("teal");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page
    .getByRole("heading", { name: "Kopano Portfolio", exact: true })
    .waitFor();
  await page.screenshot({
    style: ".toast{visibility:hidden!important}",
    path: "docs/screenshots/projects-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "New meeting", exact: true }).click();
  await page.getByRole("button", { name: "Load sample", exact: true }).click();
  await page
    .getByLabel("Meeting title", { exact: true })
    .fill("Portfolio draft review");
  await page
    .getByLabel("Project", { exact: true })
    .selectOption({ label: "Kopano Portfolio" });
  await page.getByRole("button", { name: "Save & close", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "New meeting", exact: true }).click();
  assert.equal(
    await page.getByLabel("Meeting title", { exact: true }).inputValue(),
    "Portfolio draft review",
  );
  assert.ok(
    (await page.getByLabel("Meeting transcript").inputValue()).includes(
      "Stephen",
    ),
  );
  await page.screenshot({
    style: ".toast{visibility:hidden!important}",
    path: "docs/screenshots/draft-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Process transcript", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Meeting summary", exact: true })
    .waitFor();
  await page.getByLabel("Select all pending").check();
  await page.getByLabel("Set assignee", { exact: true }).selectOption("soko");
  await page.getByLabel("Set priority", { exact: true }).selectOption("High");
  await page.getByLabel("Set due date", { exact: true }).fill("2026-10-16");
  await page
    .getByRole("button", { name: "Apply details", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve selected", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".proposal.reviewed").length === 3,
  );
  assert.equal((await store.list("soko")).tasks.length, 3);
  const meetingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  const md = await meetingDownload;
  await md.saveAs(join(directory, "meeting.pdf"));
  assert.equal(
    (await readFile(join(directory, "meeting.pdf"))).subarray(0, 4).toString(),
    "%PDF",
  );
  await nav("Task tracker");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Check café portfolio layout");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Make the mobile portfolio feel good.");
  await page
    .getByLabel("Workspace assignee", { exact: true })
    .selectOption("soko");
  await page
    .getByRole("dialog")
    .getByLabel("Priority", { exact: true })
    .selectOption("High");
  await page
    .getByRole("dialog")
    .getByLabel("Project", { exact: true })
    .selectOption({ label: "Kopano Portfolio" });
  await page
    .getByLabel("Confirmed due date", { exact: true })
    .fill("2026-10-18");
  await page.getByLabel("New checklist item").fill("Check mobile spacing");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await page.getByLabel("New checklist item").fill("Review colour contrast");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page
    .getByRole("button", { name: "Check café portfolio layout", exact: true })
    .waitFor();
  assert.equal((await store.list("soko")).tasks.length, 4);
  await page.getByLabel("Owner", { exact: true }).selectOption("Me");
  await page.getByLabel("Source", { exact: true }).selectOption("manual");
  await page
    .getByLabel("Project", { exact: true })
    .selectOption({ label: "Kopano Portfolio" });
  await page.getByLabel("Priority", { exact: true }).selectOption("High");
  assert.equal(await page.locator("tbody tr").count(), 1);
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const cd = await csvDownload;
  await cd.saveAs(join(directory, "tasks.csv"));
  const csv = await readFile(join(directory, "tasks.csv"), "utf8");
  assert.ok(csv.includes("Check café portfolio layout"));
  assert.ok(!csv.includes("Review dashboard and send feedback"));
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  const pd = await pdfDownload;
  await pd.saveAs(join(directory, "tasks.pdf"));
  assert.equal(
    (await readFile(join(directory, "tasks.pdf"))).subarray(0, 4).toString(),
    "%PDF",
  );
  await page.screenshot({
    style: ".toast{visibility:hidden!important}",
    path: "docs/screenshots/filters-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Check café portfolio layout", exact: true })
    .click();
  await page.getByLabel("Complete Check mobile spacing").check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("Changes saved.", { exact: true }).waitFor();
  await page.getByLabel("Add a progress update").fill("Mobile layout checked.");
  await page.getByRole("button", { name: "Add update", exact: true }).click();
  await page.getByText("Progress update saved.", { exact: true }).waitFor();
  await page.screenshot({
    style: ".toast{visibility:hidden!important}",
    path: "docs/screenshots/manual-task-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await nav("Team & workspace");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("kopano@example.test");
  await page
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Copy invitation for kopano@example.test",
      exact: true,
    })
    .click();
  const invitationLink = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  assert.ok(invitationLink.includes("workspaceInvite=soko"));
  assert.equal(invitationEmails.length, 1);
  assert.deepEqual(invitationEmails[0].recipients, ["kopano@example.test"]);
  assert(
    invitationEmails[0].message.text.includes(
      "https://shiftscript.earny.co.za/app?workspaceInvite=soko",
    ),
  );
  await page
    .getByLabel("Email address", { exact: true })
    .fill("viewer@example.test");
  await page.getByLabel("Access", { exact: true }).selectOption("viewer");
  await page
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  await page.getByText("viewer@example.test", { exact: true }).waitFor();
  await page
    .getByText("Email accepted by mail server", { exact: true })
    .first()
    .waitFor();
  assert.equal(invitationEmails.length, 2);
  await page.screenshot({
    path: "docs/screenshots/invitation-email-desktop.png",
    fullPage: true,
    style: ".toast{visibility:hidden!important}",
  });
  for (const width of [320, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      "Invitation controls fit " + width,
    );
    if (width <= 650) {
      const name = await page
        .locator(".invite-row strong")
        .first()
        .boundingBox();
      const row = await page.locator(".invite-row").first().boundingBox();
      assert(
        name.width >= width - 100,
        "Invited email has a readable full-width column",
      );
      assert(
        row.height < 220,
        "Invitation card does not become a vertical letter column",
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/invitation-email-mobile.png",
    fullPage: true,
    style: ".toast{visibility:hidden!important}",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await store.mutate("soko", (s) => {
    s.workspace.invites[0].emailSends[0].at = new Date(
      Date.now() - 120000,
    ).toISOString();
  });
  await page
    .getByRole("button", {
      name: "Resend invitation email to kopano@example.test",
      exact: true,
    })
    .click();
  await page
    .getByText("Invitation email accepted by the mail server.", { exact: true })
    .waitFor();
  assert.equal(invitationEmails.length, 3);
  const member = await pageFor("kopano", false);
  await member.goto(invitationLink);
  await member
    .getByRole("heading", { name: "Your workspaces", exact: true })
    .waitFor();
  assert.equal(
    await member
      .getByRole("button", { name: "Join workspace", exact: true })
      .count(),
    0,
  );
  await member
    .getByRole("button", { name: "Send verification email", exact: true })
    .click();
  await member
    .getByText(
      "Verification email sent. Open the link, then check verification here.",
      { exact: true },
    )
    .waitFor();
  await member
    .getByRole("button", { name: "Check verification", exact: true })
    .click();
  await member
    .getByRole("button", { name: "Join workspace", exact: true })
    .click();
  await member
    .getByRole("heading", { name: "Less follow-up. More follow-through." })
    .waitFor();
  await member.getByText("Kopano", { exact: true }).waitFor();
  await nav("Task tracker", member);
  await member.getByRole("button", { name: "New task", exact: true }).waitFor();
  assert.equal(await member.locator("tbody tr").count(), 4);
  await member
    .getByLabel("Status for Check café portfolio layout")
    .selectOption("In Progress");
  // A progress note must not make an old task editor overwrite another member's edit.
  await nav("Task tracker");
  await page
    .getByRole("button", { name: "Check café portfolio layout", exact: true })
    .click();
  await page
    .getByLabel("Add a progress update")
    .fill("Owner follow-up while another member updates the task.");
  await page.getByRole("button", { name: "Add update", exact: true }).click();
  await page.getByText("Progress update saved.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByText(
      "This task changed since you opened it. Close and reopen it to load the latest version.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    (await store.list("soko")).tasks.find(
      (t) => t.title === "Check café portfolio layout",
    ).status,
    "In Progress",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await nav("Team & workspace");
  const viewer = await pageFor("viewer");
  const invitation = (await store.list("soko")).workspace.invites.find(
    (i) => i.email === "viewer@example.test",
  );
  await viewer.goto(url + "/?workspaceInvite=soko&invite=" + invitation.id);
  await viewer
    .getByRole("button", { name: "Join workspace", exact: true })
    .click();
  await viewer
    .getByRole("heading", { name: "Less follow-up. More follow-through." })
    .waitFor();
  assert.equal(
    await viewer
      .getByRole("button", { name: "New meeting", exact: true })
      .count(),
    0,
  );
  await viewer.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await viewer
      .getByRole("button", { name: "Add new meeting", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await viewer.locator(".mobile-bottom-nav.has-meeting-action").count(),
    0,
  );
  await nav("Task tracker", viewer);
  assert.equal(
    await viewer.getByRole("button", { name: "New task", exact: true }).count(),
    0,
  );
  assert.equal(
    await viewer
      .getByLabel("Status for Check café portfolio layout")
      .isDisabled(),
    true,
  );
  assert.equal(
    await viewer
      .getByLabel("Status for Check café portfolio layout")
      .inputValue(),
    "In Progress",
  );
  await viewer
    .getByRole("button", { name: "Check café portfolio layout", exact: true })
    .click();
  assert.equal(
    await viewer
      .getByRole("button", { name: "Save changes", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await viewer.getByLabel("Complete Check mobile spacing").isDisabled(),
    true,
  );
  await viewer
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Refresh workspace", exact: true })
    .click();
  await page.getByLabel("Role for Kopano").waitFor();
  await page.screenshot({
    style: ".toast{visibility:hidden!important}",
    path: "docs/screenshots/team-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Switch workspace", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Workspace name", { exact: true })
    .fill("New Client Studio");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector(".workspace-switch")
      ?.innerText.includes("New Client Studio"),
  );
  assert.ok(
    (
      await page
        .getByRole("button", { name: "Switch workspace", exact: true })
        .innerText()
    ).includes("New Client Studio"),
  );
  assert.equal(
    (
      await store.catalog({
        uid: "soko",
        email: "soko@example.test",
        emailVerified: true,
      })
    ).workspaces.length,
    2,
  );
  await nav("Task tracker");
  assert.equal(await page.locator("tbody tr").count(), 0);
  await page
    .getByRole("button", { name: "Switch workspace", exact: true })
    .click();
  await page.getByRole("button", { name: /Soko Studio.*owner/ }).click();
  await nav("Projects");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    style: ".toast{visibility:hidden!important}",
    path: "docs/screenshots/projects-mobile.png",
    fullPage: true,
  });
  await nav("Team & workspace");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    style: ".toast{visibility:hidden!important}",
    path: "docs/screenshots/team-mobile.png",
    fullPage: true,
  });
  await nav("Task tracker");
  await page
    .getByRole("button", { name: "Show task filters", exact: true })
    .click();
  await page
    .getByLabel("Due date", { exact: true })
    .selectOption("Custom range");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    style: ".toast{visibility:hidden!important}",
    path: "docs/screenshots/filters-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: projects, private draft/reload, bulk assignment/approval, manual tasks/checklists/notes, combined filters, PDF/CSV downloads, share-link clipboard, verified invitation join, member edits, viewer read-only, workspace isolation/switching, mobile layouts, no page errors.",
  );
} catch (e) {
  console.error(
    "Stored IDs",
    (await store.list("soko")).tasks.map((t) => ({ id: t.id, title: t.title })),
  );
  await page.screenshot({
    style: ".toast{visibility:hidden!important}",
    path: "docs/screenshots/collaboration-failure.png",
    fullPage: true,
  });
  for (const context of browser.contexts())
    for (const p of context.pages())
      console.error(
        "Page:",
        p.url(),
        await p.locator("body").innerText(),
        await p.evaluate(() => localStorage.getItem("test-session")),
        errors,
      );
  throw e;
} finally {
  await browser.close();
  await vite.close();
  server.close();
  await rm(directory, { recursive: true, force: true });
}
