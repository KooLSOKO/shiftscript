export const GOOGLE_RETURN_KEY = "shiftscript:google-auth-pending:v1";
const returnLifetime = 20 * 60 * 1000;
export function preferGoogleRedirect(device = globalThis.navigator) {
  return Boolean(
    device?.userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod/i.test(device?.userAgent || "") ||
    (device?.platform === "MacIntel" && device?.maxTouchPoints > 1),
  );
}
export function googleAuthDomain(host, configured, fallback) {
  // Vercel proxies the production helper. Normalise the legacy config on that host only.
  return host === "shiftscript.earny.co.za" &&
    (!configured || configured === fallback || configured === host)
    ? host
    : configured || fallback;
}
export function hasGoogleReturn(browser = globalThis.window) {
  try {
    const item = JSON.parse(browser.sessionStorage.getItem(GOOGLE_RETURN_KEY));
    const age = Date.now() - item?.startedAt;
    if (Number.isFinite(age) && age >= 0 && age < returnLifetime) return true;
    browser.sessionStorage.removeItem(GOOGLE_RETURN_KEY);
  } catch {
    /* Storage unavailable. */
  }
  return false;
}
export function startGoogleReturn(browser = globalThis.window) {
  try {
    browser.sessionStorage.setItem(
      GOOGLE_RETURN_KEY,
      JSON.stringify({ startedAt: Date.now() }),
    );
  } catch {
    throw new Error(
      "Your browser could not save the sign-in return. Open ShiftScript in Safari or Chrome with site storage enabled, or sign in with email.",
    );
  }
}
export function clearGoogleReturn(browser = globalThis.window) {
  try {
    browser.sessionStorage.removeItem(GOOGLE_RETURN_KEY);
  } catch {
    /* Storage unavailable. */
  }
}
