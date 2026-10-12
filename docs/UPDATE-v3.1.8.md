# ShiftScript v3.1.8 — shortcut preferences and safer opening transitions

This follow-up includes everything from v3.1.7: saved board movement, mouse/touch grab handles, keyboard board controls, Mac/Windows shortcuts, first-signup practice tutorial and the blue opening animation.

## What improved

- **Single-key shortcuts can be switched off.** Open the keyboard button or the tutorial's last step and change **Enable single-key shortcuts**. The preference is private to your account and follows you across devices. It defaults to On for existing accounts.
- **Modifier shortcuts remain available.** Turning off single keys disables N, T, B, M, D, A, R and ?. Command/Ctrl K, Command/Ctrl Z and Command/Ctrl / still work when otherwise available. Space/Enter and arrow-key board controls also remain available.
- **Clear saving and retry behavior.** The toggle responds immediately, shows its saving state, and returns to its previous value with an error if the server cannot save it. Try the toggle again to retry. Shortcut and tutorial updates change only their respective local profile fields, so overlapping responses do not overwrite other preferences.
- **Open work survives the transition.** Returning to a cached workspace page no longer closes your meeting/task editor, tutorial, help panel, workspace selector or navigation drawer. The blue animation appears above existing dialogs and returns focus to the same field or board handle when it finishes or is skipped. Tutorial steps and practice cards remain in place.
- **Slow loading keeps a useful focus destination.** If the bounded animation ends before the workspace finishes loading, focus moves to the ready workspace heading once loading completes, provided the user has not focused another control.
- **Escape is contained.** Escape skips the animation without also closing the mobile navigation beneath it. A second Escape can then close the menu normally. Reduced-motion settings and the bounded slow-load hold remain supported.
- **Handled keyboard events are respected.** App shortcuts do not take over keys already handled by another control.

## Install on your Mac

Unzip **ShiftScript-v3.1.8.zip** into Downloads. Open your existing **ShiftScript 2** folder in VS Code. Run each command separately:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env*' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.1.8/" ./
npm ci
npm run check
git add .
git --no-pager diff --cached --name-only
git commit -m "Polish shortcut preferences and preserve editors during transitions"
git push origin main
```

Check the staged file list before committing. Your private .env and credential files should not appear. No new dependencies, environment variables or Firebase rules are needed.

## Acceptance walkthrough

1. Open the keyboard button. Turn single-key shortcuts off, close the guide and press N: no meeting editor should open. Command/Ctrl K still opens Search.
2. Refresh, then reopen the guide. The preference should still be off. Turn it back on if you prefer the quicker controls.
3. Replay the tutorial and try a practice card with Space, arrows and Space, even with single keys disabled.
4. When returning to a browser-cached workspace page with an editor open, check that the transition plays above it and returns you to the same field. Confirm your unsaved task text and tutorial step remain intact.
5. On a phone, check the guide and toggle fit the screen, and drag a practice card with the handle.

## Verification

118 unit/API tests pass. The final production build passes (with the existing large-bundle warning). The complete board/shortcut browser suite passes at 320, 390, 768 and 1440 pixels, including signup/practice onboarding, mouse and native touch movement, saved order, keyboard controls, shortcut opt-out persistence, modifier controls, save failure/retry, editor values/focus, preserved tutorial steps and mobile menu restoration. The account browser suite also passes email/Google sign-in, simulated same-tab iPhone/Android Google returns, cancellation/timeout recovery, signup/name/workspace preservation, overflow, focus/inert/scroll cleanup, Escape, slow/error recovery and reduced motion, including landscape.

No live provider operations were performed.

Browser tests use the actual React app and Node API with simulated Firebase Auth. Cache-restoration handling is exercised with persisted pageshow events; physical-device Safari and browser-managed cache behavior remain deployed acceptance checks. Tests do not use live user accounts, send emails or contact Google/Gemini/Zoho.
