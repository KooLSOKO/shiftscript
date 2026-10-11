# ShiftScript v3.1.4 — nearby meeting sources and steady mobile dialogs

## What changed

- On wide Google Meet views, **Available sources** now sits to the right of **Recent meetings**, aligned with the start of the list. The meeting list scrolls independently so its sources stay visible.
- On mobile, tablet and the narrower New meeting dialog, sources expand directly beneath the selected meeting's **View sources** button. **Hide sources** and the close control collapse the selection.
- The selected row is highlighted. Loading, source lookup errors, empty results and sources still being prepared appear in the source panel. Changing meetings clears the old source choices. Preview and processing keep the existing workflow.
- Dialogs use vertical scrolling, contain overscroll, constrain form fields and wrap long content. Background page scrolling is locked while a dialog is open and restored on close. The source dial retains its own drag gestures, and pinch zoom remains available.
- This release builds on v3.1.3 and retains duplicate meeting/task protection, the steadier directional selector, Notes, Shifty and the existing integrations.

## Install on your Mac

Extract **ShiftScript-v3.1.4.zip** into Downloads. Run each command separately in the terminal for your existing VS Code project:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.env.*' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.1.4/" ./
npm ci
npm run check
git add .
git --no-pager diff --cached --name-only
git commit -m "Show Meet sources nearby and fix mobile dialog scrolling"
git push origin main
```

Keep your existing environment variables and credentials. No new OAuth scope or Firebase rule is needed. Vercel deploys the GitHub push; refresh once the deployment is Ready. Google sign-in still requires the correct Firebase OAuth client's custom-domain redirect URL, as discussed separately.

## Try it

1. Open Google Meet and load recent meetings. Select View sources. On desktop, check the right panel while scrolling through a long meeting list.
2. On your phone, choose View sources on different meetings. Each panel should appear beneath its own button rather than at the end of the list.
3. Open New meeting and scroll up and down, including diagonal swipes. The title and form should stay aligned, with no sideways drift. Drag the dial separately to confirm mode selection still works.
4. Close the dialog and confirm normal page scrolling returns.

## Verification

All 105 unit/API tests and the production build pass. Targeted browser checks cover loading, empty/error states, switching meetings, source preview, independent desktop list scrolling, inline mobile/embedded sources, dialog widths at 320/390/430/768/1440 pixels and a diagonal touch scroll. The existing Google import/task approval/email recap suite also passes. A broader experience-suite run was blocked by a Chromium page-screenshot timeout; it is not counted as passed. External services are simulated; live Google authorization and a physical Safari phone remain deployment acceptance checks.
