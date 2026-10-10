# ShiftScript v3.0.6 — easier mobile actions and a clearer first visit

## What's changed

- **Centred New meeting button on phones.** A 76px cobalt circle sits between Meetings and Tasks in the four-tab bottom bar. Its rotating “New meeting” text surrounds an original plus icon. It opens the same transcript/audio/Google import dialog as the normal New meeting button. Viewers do not receive a creation control. Keyboard users can activate it with Enter or Space; reduced motion stops the text animation.
- **Stronger navigation and toolbar.** Sidebar labels are larger, bold and darker, with 23px icons. Desktop search, notifications, profile, refresh and workspace settings use 48px controls and 25px icons. Mobile controls retain at least 44px touch targets and stronger contrast.
- **Larger Calendar actions.** Add to Calendar is a bordered blue control with at least a 46px touch target, a 22px icon and bold 14px text. Scheduling and quick-date controls also have larger targets. Tasks still require a date and start time before the Calendar handoff.
- **First-visit cookie notice.** The homepage, workspace and public information pages explain the essential cookies/browser storage used for sign-in, workspace selection and recoverable drafts. Acceptance is remembered on that browser. Optional analytics and advertising trackers remain absent; accepting the notice does not enable them. Cookie preferences in the footer reopens the notice. Blocked browser storage does not prevent dismissal, but the notice can appear again after navigation if it cannot save the acknowledgement.
- **Cleaner homepage.** The navy announcement strip above the header is removed. A cobalt/ice-blue scrolling strip presents Clear decisions, Named owners, Next steps and Shared progress. It can be paused or resumed, pauses on hover/focus, and becomes static for reduced-motion users.

The central button and cookie notice respect phone safe areas. The notice sits above the mobile navigation rather than covering it. Existing transparent illustrations, meeting processing, shared workspaces and projects are retained.

## Install in your existing Mac project

Download and unzip `ShiftScript-v3.0.6.zip` into Downloads. Open your existing folder in VS Code. Run these commands **one at a time**:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.0.6/" ./
npm ci
npm run check
git add .
git commit -m "Improve mobile meeting controls and first-visit experience"
git push origin main
```

The copy preserves your existing `.env`, Git repository and local data. No new environment variables, Firebase changes or database migration are needed. Your connected Vercel project deploys the push. After it finishes, check `https://shiftscript.earny.co.za/` and `/app` on a phone.

To test the first-visit notice again, use a private/incognito window or reopen Cookie preferences at the bottom of the page. Acceptance is specific to the browser and domain; accepting it on localhost does not acknowledge it on your live domain.

## Verification

The package includes exact results in `docs/check-results.txt`. The new `tests/experience-browser.js` suite checks real built pages: first-visit display, persistent essential-only acknowledgement, policy/app reopening, cross-tab dismissal, blocked storage, marquee pause/reduced motion, centred mobile creation and keyboard activation, non-overlapping navigation, Calendar touch targets and desktop toolbar sizes. It checks 320/360/390/414/650px mobile layouts and 768/1440px desktop layouts. The collaboration suite also verifies that the mobile action is absent for viewers.

Public policy pages remain readable with JavaScript disabled. Their only script is the standalone essential-storage notice; they do not load Firebase or workspace services. Existing suites test processing, accounts, projects, workspace permissions, imports, recap emails, reminders and Calendar handoffs with simulated providers. No live email or Calendar writes are made by the tests.

The supplied circular-text interaction was adapted from the Creatlydev button on Uiverse.io. The blue styling, plus icon, reduced-motion behavior and navigation layout belong to ShiftScript's existing visual system.
