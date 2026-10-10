import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GOOGLE_RETURN_KEY,
  preferGoogleRedirect,
  googleAuthDomain,
  hasGoogleReturn,
  startGoogleReturn,
  clearGoogleReturn,
} from "../src/auth-flow.js";
function browser() {
  const values = new Map();
  return {
    sessionStorage: {
      getItem: (k) => values.get(k) || null,
      setItem: (k, v) => values.set(k, v),
      removeItem: (k) => values.delete(k),
    },
  };
}
test("mobile devices redirect, including desktop-mode iPad; desktops use popup", () => {
  for (const device of [
    { userAgent: "iPhone" },
    { userAgent: "Android" },
    { userAgentData: { mobile: true } },
    { platform: "MacIntel", maxTouchPoints: 5 },
  ])
    assert.equal(preferGoogleRedirect(device), true);
  for (const device of [
    { userAgent: "Windows Chrome" },
    { platform: "MacIntel", maxTouchPoints: 0 },
    {},
  ])
    assert.equal(preferGoogleRedirect(device), false);
});
test("return marker survives navigation and is cleared after completion", () => {
  const b = browser();
  assert.equal(hasGoogleReturn(b), false);
  startGoogleReturn(b);
  assert.equal(hasGoogleReturn(b), true);
  assert.deepEqual(
    Object.keys(JSON.parse(b.sessionStorage.getItem(GOOGLE_RETURN_KEY))),
    ["startedAt"],
  );
  clearGoogleReturn(b);
  assert.equal(hasGoogleReturn(b), false);
});
test("expired, malformed and future markers cannot keep login waiting", () => {
  const b = browser();
  for (const value of [
    "invalid",
    "null",
    "{}",
    JSON.stringify({ startedAt: Date.now() - 21 * 60000 }),
    JSON.stringify({ startedAt: Date.now() + 60000 }),
  ]) {
    b.sessionStorage.setItem(GOOGLE_RETURN_KEY, value);
    assert.equal(hasGoogleReturn(b), false);
  }
});
test("blocked session storage fails before leaving the login page", () => {
  const b = {
    sessionStorage: {
      getItem() {
        throw Error();
      },
      setItem() {
        throw Error();
      },
      removeItem() {
        throw Error();
      },
    },
  };
  assert.equal(hasGoogleReturn(b), false);
  assert.doesNotThrow(() => clearGoogleReturn(b));
  assert.throws(() => startGoogleReturn(b), /site storage enabled/);
});
test("production uses proxied auth domain; local and explicit alternate setups retain config", () => {
  const fallback = "shiftscriptza.firebaseapp.com",
    host = "shiftscript.earny.co.za";
  for (const configured of [undefined, fallback, host])
    assert.equal(googleAuthDomain(host, configured, fallback), host);
  assert.equal(googleAuthDomain("localhost", undefined, fallback), fallback);
  assert.equal(
    googleAuthDomain(host, "custom.example", fallback),
    "custom.example",
  );
});
test("Firebase helper is proxied before SPA routes and can be embedded only by its own origin", () => {
  const config = JSON.parse(
    readFileSync(new URL("../vercel.json", import.meta.url)),
  );
  assert.deepEqual(config.rewrites[0], {
    source: "/__/auth/:path*",
    destination: "https://shiftscriptza.firebaseapp.com/__/auth/:path*",
  });
  assert.equal(config.rewrites[1].source, "/__/firebase/init.json");
  const fallback = new RegExp("^" + config.rewrites.at(-1).source + "$");
  assert.equal(fallback.test("/__/auth/handler"), false);
  assert.equal(fallback.test("/__/auth/iframe"), false);
  assert.equal(fallback.test("/workspace"), true);
  const deny = config.headers.find((r) =>
    r.headers.some((h) => h.key === "X-Frame-Options" && h.value === "DENY"),
  );
  const pattern = new RegExp("^" + deny.source + "$");
  assert.equal(pattern.test("/app"), true);
  assert.equal(pattern.test("/__/auth/iframe"), false);
  const helper = config.headers.find((r) => r.source === "/__/auth/:path*");
  assert(helper.headers.some((h) => h.value === "SAMEORIGIN"));
  assert(helper.headers.some((h) => h.value === "no-store"));
});
