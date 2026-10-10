// Public home is static HTML. Load Firebase and the workspace only on app routes.
const parameters = new URLSearchParams(window.location.search);
const legacyAppLink = ["google", "workspaceInvite", "invite"].some((key) =>
  parameters.has(key),
);
if (window.location.pathname === "/" && legacyAppLink) {
  window.location.replace(
    "/app" + window.location.search + window.location.hash,
  );
} else if (/^\/app\/?$/.test(window.location.pathname)) {
  document.getElementById("home").remove();
  const root = document.getElementById("root");
  root.hidden = false;
  root.innerHTML =
    '<p role="status" style="padding:32px;font-family:Manrope,Arial,sans-serif">Opening your workspace…</p>';
  import("./app-entry.jsx").catch(() => {
    root.innerHTML =
      '<main style="padding:32px;font-family:Manrope,Arial,sans-serif"><h1>We couldn’t load your workspace.</h1><p>Refresh this page to try again.</p><a href="/">Back to home</a></main>';
  });
}
