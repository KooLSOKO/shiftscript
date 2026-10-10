# ShiftScript v3.0.5 — clearer dashboard shortcuts and consistent styling

The seven dashboard totals are now clickable buttons with larger custom icons, bold labels and a compact layout. Each shortcut opens the view behind its total and clears unrelated filters, so an old search does not hide the work you asked to see.

## Dashboard shortcuts

| Card | What opens |
| --- | --- |
| Meetings processed | All meetings, with search, project and review filters reset |
| Projects | Your workspace's projects |
| Awaiting approval | All meetings that contain at least one pending proposal |
| Active tasks | Task tracker with Active status, excluding completed tasks |
| Completed | Task tracker with Completed status |
| Blocked | Task tracker with Blocked status |
| Overdue | Task tracker with Overdue due-date filter, excluding completed tasks |

“Awaiting approval” counts proposed tasks. Clicking it opens the meetings those proposals belong to, so you can review their context before approving them. The new **Review → Needs approval** meeting filter can be changed back to **All meetings**. A zero total is still clickable and opens the corresponding empty view.

## Visual changes

- Desktop shortcut icons increase from 18px to 32–36px, with 54–62px backgrounds. Mobile icons are 30px inside 46px backgrounds.
- Labels are 14–15px and bold on desktop, and 13px and bold on mobile. Counts are larger and sit beside the icon.
- The two-row arrangement uses more of each card and reduces unused vertical space.
- Entire cards support pointer clicks, keyboard Enter/Space, visible keyboard focus and hover/press feedback. The mobile layout keeps two columns with large tap targets.
- Manrope now appears across the homepage, workspace, account screens and four public policy/about pages. Headings and action labels use consistent bold weights.
- Shared typography, cobalt/navy colours, borders and corner sizes are defined in `public/brand.css`.
- Primary buttons share the homepage's raised base, hover fill and pressed state. Public policy buttons follow the same style, with their decorative arrows removed.
- Homepage input icons and bold labels are larger and clickable; transcript/audio links jump to the workflow, and Meet notes links jump to the Meet explanation.
- Existing transparent PNG illustrations, the four mobile navigation buttons, account flows and permissions are retained.

No new environment variables, Firebase changes or database migration are needed.

## Install and push from your Mac

Download and unzip `ShiftScript-v3.0.5.zip` into Downloads. Open your existing project in VS Code and run these **one at a time** in its terminal:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.0.5/" ./
npm ci
npm run check
git add .
git commit -m "Make dashboard totals clickable and unify site styling"
git push origin main
```

The copy command preserves your `.env`, repository and local data. Your linked Vercel project will deploy after the push. Test each dashboard card on `https://shiftscript.earny.co.za/app` after deployment.

## Verification

`tests/dashboard-browser.js` checks all seven shortcuts, correct task subsets, multiple meetings awaiting approval, stale filter reset, zero totals, workspace switches and keyboard activation. It also checks card touch targets and page width at 320, 390, 768 and 2048px. The existing suites cover account, collaboration, processing, imports, reminders, policy pages and the public homepage using simulated external services.

Exact results are included in `docs/check-results.txt`. Updated screenshots are in `docs/screenshots`, including the focused desktop and mobile shortcut previews.

All 69 unit/API tests, the production build and all eight browser suites passed. External providers are simulated. The homepage product preview was refreshed from the current fictional workspace, and the built-home asset/layout checks were rerun after that image change.
