/* First-visit acknowledgement for essential storage only. No optional trackers are enabled. */
(() => {
  const key = "shiftscript:cookie-preferences:v1";
  let acknowledged = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    acknowledged = saved?.version === 1 && saved?.essential === true;
  } catch {
    /* Private browsing or blocked storage: the notice remains usable. */
  }
  const show = () => {
    if (document.getElementById("ss-cookie-notice")) return;
    const notice = document.createElement("section");
    notice.id = "ss-cookie-notice";
    notice.className = "ss-cookie-notice";
    notice.setAttribute("aria-label", "Cookies and site storage");
    notice.innerHTML =
      '<div><h2>Just the essentials.</h2><p>ShiftScript uses essential cookies and browser storage to keep you signed in, remember your workspace and recover meeting drafts. We don’t use optional analytics or advertising trackers.</p></div><div class="ss-cookie-actions"><button type="button" class="ss-cookie-accept">Accept essential cookies</button><a href="/privacy#storage">Read our privacy policy</a></div>';
    const isApp = /^\/app\/?$/.test(location.pathname);
    notice.classList.toggle("ss-cookie-app", isApp);
    notice.querySelector("button").addEventListener("click", () => {
      acknowledged = true;
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            essential: true,
            optional: false,
            acknowledgedAt: new Date().toISOString(),
          }),
        );
      } catch {
        /* Acknowledged for this page even if persistence is unavailable. */
      }
      const trigger = document.querySelector("[data-cookie-preferences]");
      const shouldRestoreFocus = notice.contains(document.activeElement);
      notice.remove();
      if (shouldRestoreFocus && trigger) trigger.focus({ preventScroll: true });
    });
    document.body.appendChild(notice);
  };
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-cookie-preferences]")) {
      show();
      document
        .querySelector(".ss-cookie-accept")
        ?.focus({ preventScroll: true });
    }
  });
  // Keep acknowledgement in sync between tabs, without reloading the app.
  window.addEventListener("storage", (event) => {
    if (event.key !== key) return;
    try {
      acknowledged = JSON.parse(event.newValue)?.essential === true;
    } catch {
      acknowledged = false;
    }
    if (acknowledged) document.getElementById("ss-cookie-notice")?.remove();
    else show();
  });
  if (!acknowledged) show();
})();
