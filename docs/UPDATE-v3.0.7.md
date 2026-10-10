# ShiftScript v3.0.7 — processing waves and smoother navigation

## What's changed

- **Your wave loader in Earny blue.** A white pill with a cobalt border and nine animated bars appears while ShiftScript analyses a pasted/uploaded transcript, transcribes voice, or processes imported Google Meet notes. Its status message describes the current operation. It follows the actual request state, disappears after completion or failure, and adds no artificial delay or progress percentage.
- **Mobile circular text fixed.** The central New meeting button now places each character at an equal angle around the full circle. This replaces the SVG text path that left an oversized gap on your phone. The blue button, plus icon, existing tap area and four navigation tabs stay the same.
- **Subtle page transitions.** Workspace tabs, meeting detail views and workspace switches use a short fade and small vertical entrance. The transition runs when the view changes, rather than restarting whenever tasks reload or you type. Existing form and task state behavior is retained.
- **Small interaction details.** Sidebar and bottom-navigation selections change colour smoothly, selected icons get a small emphasis, and opening a homepage FAQ gently reveals its answer.
- **Reduced-motion support.** Wave bars become a static waveform, circular lettering stops rotating, and the new view/FAQ transitions and navigation effects stop when the visitor requests reduced motion. Loading status text stays visible and is announced to assistive technology.

The waveform adapts the JkHuger Uiverse.io example you supplied, with ShiftScript's `#2458E8` colour. It is a noninteractive status display, so it does not behave like a clickable menu.

## Install and push from your Mac

Download and unzip `ShiftScript-v3.0.7.zip` into Downloads. Open your existing project in VS Code and run these **one at a time**:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.0.7/" ./
npm ci
npm run check
git add .
git commit -m "Add processing wave loader and smoother page transitions"
git push origin main
```

The copy preserves your `.env`, repository and local data. There are no new environment variables, database migrations or Firebase changes. Your connected Vercel project deploys the push.

After deployment, open `/app` on your phone and check the rotating text. Process a transcript to see the loader, then move between Overview, Meetings and Tasks to check the transitions. The loader is visible only while a request is pending; fast sample processing can finish quickly.

## Verification

Exact results are included in `docs/check-results.txt`. The package includes desktop/mobile screenshots of the waveform and updated central meeting button.

The browser suites hold real request paths open using test-only gates to verify that the loader appears while busy, uses nine cobalt bars, disables duplicate submission and clears after success or a simulated failure. They test a retry without losing the visible draft. Voice transcription and Google imports are also checked while pending. No deliberate waiting is added to production code.

Built-page checks cover equal circular-letter spacing, mobile touch targets and loader fit at 320/390/1440px. Navigation checks verify a new view entrance on a tab change and no animation in reduced-motion mode. Existing tests continue to cover accounts, task approval, permissions, projects, shared workspaces, email previews, reminders, Calendar handoffs, public pages and cookies. External providers are simulated; no live emails or Calendar entries are sent by these tests.

All 69 unit/API tests, all nine browser suites and the production build passed. The homepage preview was refreshed from the current fictional dashboard, then the final built-home asset/layout checks passed again.
