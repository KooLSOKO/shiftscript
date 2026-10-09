// UI contract test with simulated Firebase Auth; never creates a live account.
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { createApp } from "../server/app.js";
const users = new Map();
const store = {
  async list(uid) { return structuredClone(users.get(uid) || { meetings: [], tasks: [], quota: {}, workspace: null }); },
  async mutate(uid, action) { const s = await this.list(uid), result = action(s); users.set(uid, s); return result; },
};
const server = createApp({ storage: "firebase", provider: "sample", signupEnabled: true, store,
  verifyToken: async uid => { if (!["soko", "kopano"].includes(uid)) throw new Error("Bad token"); return { uid, email: uid + "@example.test" }; },
}).listen(3010, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const vite = await createServer({ server: { host: "127.0.0.1", port: 5180, strictPort: true, proxy: { "/api": "http://127.0.0.1:3010" } } });
await vite.listen();
let options = { headless: true };
if (process.env.SHIFTSCRIPT_TEST_CHROMIUM) {
  const { default: bundled } = await import(process.env.SHIFTSCRIPT_TEST_CHROMIUM);
  options = { headless: true, executablePath: await bundled.executablePath(), args: bundled.args };
}
const browser = await chromium.launch(options);
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await mkdir("docs/screenshots", { recursive: true });
// Substitute only the Auth module. The actual React UI, API and routing run normally.
const shim = `
const callbacks = new Set();
const hydrate = value => value && ({...value, getIdToken: async () => value.uid});
const auth = { currentUser: hydrate(JSON.parse(localStorage.getItem('test-session') || 'null')) };
const persist = () => localStorage.setItem('test-session', JSON.stringify(auth.currentUser));
const notify = () => { persist(); callbacks.forEach(fn => fn(auth.currentUser)); };
export const getAuth = () => auth;
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
`;
await page.route(/\/node_modules\/\.vite\/deps\/firebase_auth\.js(?:\?|$)/, route => route.fulfill({ contentType: "application/javascript", body: shim }));
await page.route("https://**", route => route.abort());
try {
  await page.goto("http://127.0.0.1:5180");
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Victor Soko");
  await page.getByLabel("Email", { exact: true }).fill("soko@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-pass-123");
  await page.getByLabel("Confirm password", { exact: true }).fill("does-not-match");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByText("Your passwords don't match.", { exact: true }).waitFor();
  await page.getByLabel("Confirm password", { exact: true }).fill("test-pass-123");
  await page.screenshot({ path: "docs/screenshots/signup-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("heading", { name: "Give your work a place to land." }).waitFor();
  assert.equal(await page.getByLabel("Your full name", { exact: true }).inputValue(), "Victor Soko");
  await page.getByLabel("Workspace name", { exact: true }).fill("Earny Studio");
  await page.screenshot({ path: "docs/screenshots/workspace-setup-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await page.getByRole("heading", { name: "Less follow-up. More follow-through." }).waitFor();
  await page.getByText("Victor Soko", { exact: true }).waitFor();
  await page.getByRole("button", { name: "New meeting", exact: true }).click();
  await page.getByRole("button", { name: "Load sample", exact: true }).click();
  await page.getByRole("button", { name: "Process transcript", exact: true }).click();
  await page.getByRole("heading", { name: "Meeting summary", exact: true }).waitFor();
  await page.getByRole("button", { name: "Workspace settings", exact: true }).click();
  await page.getByLabel("Workspace name", { exact: true }).fill("Soko Studio");
  await page.getByLabel("Your full name", { exact: true }).fill("Soko");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("Workspace details saved.", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Workspace settings", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Workspace settings", exact: true }).innerText(), "SS\nSoko Studio\nConnected to Firebase");
  assert.equal(users.get("soko").meetings.length, 1);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Kopano");
  await page.getByLabel("Email", { exact: true }).fill("kopano@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-pass-123");
  await page.getByLabel("Confirm password", { exact: true }).fill("test-pass-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Workspace name", { exact: true }).fill("Kopano Portfolio");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: "docs/screenshots/workspace-setup-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await page.getByRole("heading", { name: "Less follow-up. More follow-through." }).waitFor();
  assert.deepEqual(users.get("kopano").meetings, []);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("soko@example.test");
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await page.getByText("If this email has an account, you'll receive a password reset link.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Open workspace", exact: true }).click();
  await page.getByText("Check your email and password and try again.", { exact: true }).waitFor();
  await page.getByLabel("Password", { exact: true }).fill("test-pass-123");
  await page.getByRole("button", { name: "Open workspace", exact: true }).click();
  await page.getByRole("heading", { name: "Less follow-up. More follow-through." }).waitFor();
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByText("Soko Studio", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS: simulated signup, password mismatch, names, workspace creation/rename, refresh, account isolation, reset, wrong password, sign-in, mobile overflow.");
} catch (e) {
  await page.screenshot({ path: "docs/screenshots/accounts-failure.png", fullPage: true });
  console.error(await page.locator("body").innerText(), errors);
  throw e;
} finally { await browser.close(); await vite.close(); server.close(); }
