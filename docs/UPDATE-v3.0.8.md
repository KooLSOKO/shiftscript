# ShiftScript v3.0.8 — blue paint-stroke login handoff

## What's changed

The reference video's sweeping paint stroke is adapted as an original cobalt-blue SVG transition. Curved strokes sweep across the screen, briefly reveal ShiftScript's white branding on blue, then clear to the workspace or new-account setup screen.

- Runs after successful email login, email signup or Google sign-in/account creation.
- Runs once for that explicit authentication action. Restoring an existing session on refresh, creating a workspace, switching tabs or resetting a password does not replay it.
- Failed authentication and cancelled Google popups retain their normal messages rather than showing a success animation.
- Account names finish saving before signup transitions to workspace setup. Existing workspace selection and data are retained.
- The overlay covers the current viewport without stretching its SVG. It supports desktop, portrait phones, tablets and phone landscape, with a touch-sized Skip animation button positioned inside safe areas.
- Background controls are inert during the handoff, scrolling is temporarily locked, and keyboard focus stays on Skip animation. Escape also skips. Focus and scrolling are restored when the transition clears.
- Reduced-motion users bypass the sweeping animation. Changing to reduced motion during the wipe clears it immediately.

The usual handoff lasts about 1.25 seconds after authentication succeeds. If workspace loading takes longer, the animation clears within roughly 2.2 seconds to expose the real loading or retry screen. It does not wait forever or fake a successful workspace load.

This uses code-native SVG and CSS in `src/components/AuthTransition.jsx`, with the shared Earny blue `#2458E8`. The reference video is not embedded or redistributed. There are no new dependencies, environment variables, Firebase changes or database migrations.

## Install and deploy from your Mac

Download and unzip `ShiftScript-v3.0.8.zip` into Downloads. Open your existing project in VS Code. Run these **one at a time**:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.0.8/" ./
npm ci
npm run check
git add .
git commit -m "Add blue paint-stroke login and signup transition"
git push origin main
```

The copy preserves your `.env`, repository and local data. Your connected Vercel project deploys the push.

After deployment, sign out and sign in again on your desktop and phone to see the transition. A page refresh keeps you signed in and does not replay it. To check signup, use a new account and confirm the full name carries into workspace setup. A device with reduced motion enabled goes directly to the next screen.

## Verification

The account browser suite uses simulated Firebase identity with the real React screens and Node API. It checks normal-motion email/Google login, email signup followed by workspace creation, preserved workspaces, one transition per explicit authentication, no replay on session restoration, full viewport coverage, cobalt colour, keyboard focus, inert background controls, scrolling cleanup, Escape, slow loading, API error/retry and reduced motion changed mid-animation.

Viewport checks include 320×844, 390×844, 768×1024, 1440×1000 and 844×390. The existing reduced-motion account tests continue to cover signup names, Google onboarding, failed credentials, popup cancellation, disabled-provider errors, account isolation and password resets. Other browser suites cover transcript processing, task approval, collaboration, imports, recap emails, reminders, Calendar actions, public pages and cookies using simulated external providers.

Exact results are included in `docs/check-results.txt`. Screenshots in `docs/screenshots/auth-paint-*.png` show the stroke in progress; `auth-handoff-*.png` show the fully covered stage on desktop and mobile. Live Firebase account creation and production deployment remain checks for your configured site.

All 69 unit/API tests, all nine browser suites and the production build passed on the packaged revision.
