# ShiftScript v3.0.4 — transparent artwork and tactile buttons

This update finishes the homepage input icons and gives the artwork a clean cutout treatment across the app. The corporate blue, Manrope typography and Earny clay direction stay consistent.

## Changes

- Original clay microphone and video-notes icons now match the transcript icon in the homepage input strip.
- Decorative arrow icons are removed from buttons and action links throughout the home and workspace. Button labels and destinations are retained.
- Original button styling inspired by CSSButtons: a raised solid base, a gentle hover fill and a satisfying pressed state. Mobile taps, keyboard focus and reduced-motion preferences are supported.
- All seven character illustrations now use genuinely transparent PNGs: Overview, Meetings, Google Meet, Tasks/Board, Projects, Team and Profile. They sit directly on each section's background without a separate image rectangle.
- Two additional original clay scenes illustrate reviewing decisions and handing agreed tasks to teammates.
- The existing four clay icons also use smaller transparent PNG delivery files. Original PNGs are included for reuse.
- The actual product screenshot remains labelled as a fictional demo workspace.

No new environment variables, Firebase settings or Google OAuth callback changes are required.

## Install on your Mac

Download and unzip `ShiftScript-v3.0.4.zip` into Downloads. Run these commands **one at a time** in the VS Code terminal:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.0.4/" ./
npm ci
npm run check
git add .
git commit -m "Add transparent clay artwork and tactile buttons"
git push origin main
```

Your linked Vercel project will deploy the push. Check the homepage, Board and Profile after deployment. Existing local `.env` settings are preserved by the copy command.

## Artwork and verification

Project illustrations are in `public/art/*.png` and `public/art/clay/*.png`. Prompts and provenance are recorded in `docs/ARTWORK-v3.0.4.json`. The built-in image-generation tool was used for the new scenes and background extraction; PNG resizing preserves transparency.

Verification results are included in `docs/check-results.txt`. Browser checks use simulated external services and do not send live emails or calendar events.

All 69 unit/API tests, the production build and all seven browser suites passed. The homepage was checked at 320, 390, 430, 768 and 1440 pixels. Character/icon PNG integrity and alpha transparency were verified, and the homepage and Board screenshots were visually reviewed. The homepage product preview was refreshed from the current app's fictional demo workspace.

Button inspiration: [CSSButtons](https://cssbuttons.io/). The implementation is original CSS in `public/landing.css` and `src/styles.css`.
