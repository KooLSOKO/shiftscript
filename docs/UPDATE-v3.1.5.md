# ShiftScript v3.1.5 — bring the import review into view

After choosing a Google meeting source on mobile, ShiftScript now scrolls directly to **Review your import** once its preview has loaded. The same behavior works inside the New meeting dialog, including on desktop. Pasting a Google Docs link uses the same preview handoff.

The heading receives keyboard/screen-reader focus without an extra browser scroll. Normal motion uses a smooth scroll; reduced-motion preferences use an immediate scroll. Spacing keeps the review below the mobile toolbar, and the dialog scrolls its own content. Loading a source list, clearing a preview or resizing the page does not trigger the preview handoff.

## Install

Extract ShiftScript-v3.1.5.zip into Downloads. Run each command separately in your existing VS Code project's terminal:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.env.*' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.1.5/" ./
npm ci
npm run check
git add .
git --no-pager diff --cached --name-only
git commit -m "Scroll to the import review after choosing a meeting source"
git push origin main
```

Keep existing environment settings. Wait for Vercel's deployment to become Ready, then refresh ShiftScript.

## Test on your phone

Open Google Meet, load recent meetings, tap View sources and choose a notes/transcript Preview. Review your import should move into view automatically without a manual scroll. Repeat from New meeting → Recent Google Meet. Processing and approval remain manual actions.

## Verification

105 unit/API tests and the production build pass. The targeted browser suite verifies visible review headings and focus after mobile selection at 320/390/430/768 pixels, review scrolling inside dialogs at 320/390/430/768/1440, smooth scrolling at 390 pixels and immediate scrolling with reduced motion. It also retains source placement, loading/empty/error, viewport bounds and diagonal touch-scroll checks. Google sources are simulated; physical Safari remains a deployment acceptance check.
