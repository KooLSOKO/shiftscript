// UI contract test with simulated Firebase Auth; never creates a live account.
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { createApp } from "../server/app.js";
const users = new Map();
const store = {
  async list(uid) {
    return structuredClone(
      users.get(uid) || { meetings: [], tasks: [], quota: {}, workspace: null },
    );
  },
  async mutate(uid, action) {
    const s = await this.list(uid),
      result = action(s);
    users.set(uid, s);
    return result;
  },
};
const server = createApp({
  storage: "firebase",
  provider: "sample",
  signupEnabled: true,
  store,
  verifyToken: async (uid) => {
    if (!["soko", "kopano", "google-new"].includes(uid))
      throw new Error("Bad token");
    return { uid, email: uid + "@example.test" };
  },
}).listen(3010, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3010" },
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
    args: bundled.args,
  };
}
const browser = await chromium.launch(options);
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  timezoneId: "Africa/Johannesburg",
});
await page.addInitScript(() =>
  localStorage.setItem(
    "shiftscript:cookie-preferences:v1",
    JSON.stringify({ version: 1, essential: true, optional: false }),
  ),
);
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await mkdir("docs/screenshots", { recursive: true });
// Substitute only the Auth module. The actual React UI, API and routing run normally.
const shim = `
const callbacks = new Set();
const hydrate = value => value && ({...value, getIdToken: async () => value.uid});
const auth = { currentUser: hydrate(JSON.parse(localStorage.getItem('test-session') || 'null')) };
const persist = () => localStorage.setItem('test-session', JSON.stringify(auth.currentUser));
const notify = () => { persist(); callbacks.forEach(fn => fn(auth.currentUser)); };
export const getAuth = () => auth;
export class GoogleAuthProvider { setCustomParameters(parameters) { window.testGoogleParameters = parameters; } }
export async function signInWithPopup(_a, provider) {
  const code = localStorage.getItem('test-google-error');
  if(code) throw Object.assign(new Error(),{code});
  const fresh = localStorage.getItem('test-google-new') === 'true';
  const u = fresh ? {uid:'google-new',email:'google-new@example.test',displayName:'Lerato Dlamini',emailVerified:true}
    : JSON.parse(localStorage.getItem('test-accounts') || '{}')['soko@example.test'];
  auth.currentUser=hydrate(u); notify(); return {user:auth.currentUser};
}
export const onAuthStateChanged = (_a, fn) => { callbacks.add(fn); queueMicrotask(() => fn(auth.currentUser)); return () => callbacks.delete(fn); };
export async function createUserWithEmailAndPassword(_a, email, password) {
  const accounts = JSON.parse(localStorage.getItem('test-accounts') || '{}');
  if(accounts[email]) throw Object.assign(new Error(), {code:'auth/email-already-in-use'});
  const u = {uid:email.startsWith('kopano')?'kopano':'soko',email,displayName:''};
  accounts[email]=u; localStorage.setItem('test-accounts',JSON.stringify(accounts));
  auth.currentUser=hydrate(u); notify(); return {user:auth.currentUser};
}
export async function updateProfile(u, profile) {
  Object.assign(u,profile); const accounts=JSON.parse(localStorage.getItem('test-accounts') || '{}');
  accounts[u.email]=u; localStorage.setItem('test-accounts',JSON.stringify(accounts)); persist();
}
export async function signInWithEmailAndPassword(_a,email,password) {
  const u=JSON.parse(localStorage.getItem('test-accounts') || '{}')[email];
  if(!u || password!=='test-pass-123') throw Object.assign(new Error(),{code:'auth/invalid-credential'});
  auth.currentUser=hydrate(u); notify(); return {user:auth.currentUser};
}
export async function signOut() { auth.currentUser=null; notify(); }
export async function sendPasswordResetEmail() {}
export async function sendEmailVerification() {}
`;
await page.route(
  /\/node_modules\/\.vite\/deps\/firebase_auth\.js(?:\?|$)/,
  (route) =>
    route.fulfill({ contentType: "application/javascript", body: shim }),
);
await page.route("https://**", (route) => route.abort());
await page.addInitScript(() => {
  window.calendarDrafts = [];
  window.open = (url) => {
    window.calendarDrafts.push(url);
    return null;
  };
});
try {
  await page.goto("http://127.0.0.1:5180/");
  await page
    .getByRole("link", { name: "Get started", exact: false })
    .first()
    .click();
  await page
    .getByRole("heading", {
      name: "Your next chapter starts here.",
      exact: true,
    })
    .waitFor();
  assert(await page.getByLabel("Full name", { exact: true }).isVisible());
  await page.goto("http://127.0.0.1:5180/app");
  const googleButton = page.getByRole("button", {
    name: "Continue with Google",
    exact: true,
  });
  await googleButton.waitFor();
  assert.equal(
    await page
      .getByRole("navigation", { name: "ShiftScript policies" })
      .getByRole("link", { name: "Privacy Policy", exact: true })
      .getAttribute("href"),
    "/privacy",
  );
  for (const [code, text] of [
    ["auth/popup-closed-by-user", "Google sign-in was cancelled."],
    ["auth/popup-blocked", "Your browser blocked the Google sign-in window."],
    [
      "auth/unauthorized-domain",
      "This website is not authorised for Google sign-in yet.",
    ],
    ["auth/operation-not-allowed", "Google sign-in is not enabled yet."],
    [
      "auth/account-exists-with-different-credential",
      "This email uses a different sign-in method.",
    ],
  ]) {
    await page.evaluate(
      (code) => localStorage.setItem("test-google-error", code),
      code,
    );
    await googleButton.click();
    await page.getByText(text, { exact: false }).waitFor();
    assert(await googleButton.isEnabled());
  }
  await page.evaluate(() => localStorage.removeItem("test-google-error"));
  assert.deepEqual(await page.evaluate(() => window.testGoogleParameters), {
    prompt: "select_account",
  });
  await page.reload();
  await googleButton.waitFor();
  await page.screenshot({
    path: "docs/screenshots/google-signin-desktop.png",
    fullPage: true,
  });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert(await googleButton.isVisible());
  }
  await page.screenshot({
    path: "docs/screenshots/google-signin-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Full name", { exact: true }).fill("Victor Soko");
  await page.getByLabel("Email", { exact: true }).fill("soko@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-pass-123");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("does-not-match");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page
    .getByText("Your passwords don't match.", { exact: true })
    .waitFor();
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("test-pass-123");
  await page.screenshot({
    path: "docs/screenshots/signup-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Give your work a place to land." })
    .waitFor();
  assert.equal(
    await page.getByLabel("Your full name", { exact: true }).inputValue(),
    "Victor Soko",
  );
  await page.getByLabel("Workspace name", { exact: true }).fill("Earny Studio");
  await page.screenshot({
    path: "docs/screenshots/workspace-setup-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Less follow-up. More follow-through." })
    .waitFor();
  await page.getByText("Victor Soko", { exact: true }).waitFor();
  await page.getByRole("button", { name: "New meeting", exact: true }).click();
  await page.getByRole("button", { name: "Load sample", exact: true }).click();
  await page
    .getByRole("button", { name: "Process transcript", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Meeting summary", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  await page.getByLabel("Workspace name", { exact: true }).fill("Soko Studio");
  await page.getByLabel("Your full name", { exact: true }).fill("Victor Soko");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("Workspace settings saved.", { exact: true }).waitFor();
  users.get("soko").tasks = [
    ["first", "Victor", null, "To Do"],
    ["surname", "Soko", null, "To Do"],
    ["full", "Victor Soko", null, "To Do"],
    ["linked", "Old name", "soko", "Completed"],
    ["other-person", "Kopano", null, "To Do"],
    ["other-account", "Victor", "kopano", "To Do"],
  ].map(([id, owner, ownerUid, status]) => ({
    id,
    owner,
    ownerUid,
    status,
    title: "Profile test " + id,
    description: "Profile assignment test",
    deadline: "",
    dueDate: id === "linked" ? "2026-10-13" : null,
    priority: "Med",
    projectId: null,
    meetingId: null,
    createdAt: "2026-10-10T08:00:00Z",
    updatedAt: "2026-10-10T08:00:00Z",
    checklist: [],
    notes: [],
  }));
  await page.reload();
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .waitFor();
  assert.ok(
    (
      await page
        .getByRole("button", { name: "Switch workspace", exact: true })
        .innerText()
    ).includes("Soko Studio"),
  );
  assert.equal(users.get("soko").meetings.length, 1);
  await page
    .getByRole("button", { name: "View your profile", exact: true })
    .click();
  const profile = page.getByRole("region", { name: "Personal profile" });
  await profile
    .getByRole("heading", { name: "Victor Soko", exact: true })
    .waitFor();
  await profile.getByText("soko@example.test", { exact: true }).waitFor();
  assert.equal(
    await profile.getByText("kopano@example.test", { exact: true }).count(),
    0,
  );
  await page.screenshot({
    path: "docs/screenshots/profile-desktop.png",
    fullPage: true,
  });
  assert.deepEqual(
    await profile.locator(".profile-work strong").allTextContents(),
    ["3", "1"],
  );
  await profile
    .getByRole("button", { name: "View my tasks", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Owner", { exact: true }).inputValue(),
    "Me",
  );
  for (const id of ["first", "surname", "full", "linked"])
    await page
      .getByRole("button", { name: "Profile test " + id, exact: true })
      .waitFor();
  for (const id of ["other-person", "other-account"])
    assert.equal(
      await page
        .getByRole("button", { name: "Profile test " + id, exact: true })
        .count(),
      0,
    );
  await page
    .getByRole("button", {
      name: "Add Profile test first to Google Calendar",
      exact: true,
    })
    .click();
  const calendar = page.getByRole("dialog", {
    name: "Add task to Google Calendar",
    exact: true,
  });
  assert.equal(
    await calendar.getByLabel("Calendar date", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await calendar.getByLabel("Start time", { exact: true }).inputValue(),
    "",
  );
  assert(
    await calendar
      .getByRole("button", { name: "Open Google Calendar", exact: true })
      .isDisabled(),
  );
  await calendar
    .getByLabel("Calendar date", { exact: true })
    .fill("2026-10-12");
  assert(
    await calendar
      .getByRole("button", { name: "Open Google Calendar", exact: true })
      .isDisabled(),
  );
  await calendar.getByLabel("Start time", { exact: true }).fill("09:00");
  await calendar.getByLabel("Duration", { exact: true }).selectOption("60");
  await calendar
    .getByRole("button", { name: "Open Google Calendar", exact: true })
    .click();
  const draft = new URL(
    await page.evaluate(() => window.calendarDrafts.at(-1)),
  );
  assert.equal(
    draft.searchParams.get("dates"),
    "20261012T070000Z/20261012T080000Z",
  );
  assert.equal(draft.searchParams.get("text"), "Profile test first");
  assert.equal(draft.searchParams.get("stz"), "Africa/Johannesburg");
  assert.equal(
    await calendar
      .getByRole("link", { name: "Open event draft again", exact: true })
      .getAttribute("href"),
    draft.toString(),
  );
  assert.equal(users.get("soko").tasks[0].dueDate, null);
  await page.screenshot({
    path: "docs/screenshots/calendar-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert(
    await calendar.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  );
  await calendar
    .getByRole("button", { name: "Open Google Calendar", exact: true })
    .click();
  assert.equal(await page.evaluate(() => window.calendarDrafts.length), 2);
  await page.screenshot({
    path: "docs/screenshots/calendar-mobile.png",
    fullPage: true,
  });
  await calendar
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Profile test first", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add to Google Calendar", exact: true })
    .click();
  await calendar.waitFor();
  await calendar
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Add Profile test linked to Google Calendar",
      exact: true,
    })
    .click();
  assert.equal(
    await calendar.getByLabel("Calendar date", { exact: true }).inputValue(),
    "2026-10-13",
  );
  assert.equal(
    await calendar.getByLabel("Start time", { exact: true }).inputValue(),
    "",
  );
  assert(
    await calendar
      .getByRole("button", { name: "Open Google Calendar", exact: true })
      .isDisabled(),
  );
  await calendar
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Full name", { exact: true }).fill("Kopano");
  await page.getByLabel("Email", { exact: true }).fill("kopano@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-pass-123");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("test-pass-123");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Kopano Portfolio");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "docs/screenshots/workspace-setup-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Less follow-up. More follow-through." })
    .waitFor();
  assert.deepEqual(users.get("kopano").meetings, []);
  await page
    .getByRole("button", { name: "View your profile", exact: true })
    .click();
  await profile.getByRole("heading", { name: "Kopano", exact: true }).waitFor();
  await profile.getByText("kopano@example.test", { exact: true }).waitFor();
  assert.equal(
    await profile.getByText("soko@example.test", { exact: true }).count(),
    0,
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "docs/screenshots/profile-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Go to Overview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("soko@example.test");
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await page
    .getByText(
      "If this email has an account, you'll receive a password reset link.",
      { exact: true },
    )
    .waitFor();
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page
    .getByRole("button", { name: "Open workspace", exact: true })
    .click();
  await page
    .getByText("Check your email and password and try again.", { exact: true })
    .waitFor();
  await page.getByLabel("Password", { exact: true }).fill("test-pass-123");
  await page
    .getByRole("button", { name: "Open workspace", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Less follow-up. More follow-through." })
    .waitFor();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByText("Soko Studio", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await googleButton.click();
  await page
    .getByRole("heading", { name: "Less follow-up. More follow-through." })
    .waitFor();
  assert.equal(users.get("soko").meetings.length, 1);
  assert.equal(users.get("soko").tasks.length, 6);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByText("Soko Studio", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("test-google-new", "true"));
  await googleButton.click();
  await page
    .getByRole("heading", { name: "Give your work a place to land." })
    .waitFor();
  assert.equal(
    await page.getByLabel("Your full name", { exact: true }).inputValue(),
    "Lerato Dlamini",
  );
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Lerato Studio");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Less follow-up. More follow-through." })
    .waitFor();
  assert.deepEqual(users.get("google-new").meetings, []);
  assert.equal(users.get("google-new").workspace.ownerName, "Lerato Dlamini");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: simulated email and Google sign-in, returning workspace preservation, Google onboarding/name, cancellation and configuration errors, account isolation, reset, mobile overflow and policy links.",
  );
} catch (e) {
  await page.screenshot({
    path: "docs/screenshots/accounts-failure.png",
    fullPage: true,
  });
  console.error(await page.locator("body").innerText(), errors);
  throw e;
} finally {
  await browser.close();
  await vite.close();
  server.close();
}
