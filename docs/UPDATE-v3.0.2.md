# ShiftScript v3.0.2 — Public home page

The main domain now opens a public landing page explaining what ShiftScript does. Your account and workspace open at `/app`.

## What changed

- Earny blue hero, existing original illustrations and custom SVG icons.
- Three steps: bring the conversation, structure it with Gemini, review and track the tasks.
- Fictional Kiya/Kopano meeting-to-task example, with clear priorities and an approval notice.
- Explanations of summaries, task tracking, projects, shared workspaces, source links, Calendar drafts, optional reminders and Earny recap emails.
- Honest Google Meet explanation: optional imports of available accessible artifacts, no automatic recording, test-account restrictions while the Google connection is in testing.
- Native expandable FAQs, contact and existing policy links.
- Mobile layouts, keyboard focus, reduced-motion support, social metadata, structured data, robots.txt and public sitemap.
- Sign in opens `/app`. Get started opens email signup when public signup is enabled. Google sign-in remains available inside the account screen.
- Returning authenticated users open their existing workspace through `/app`.
- New invitation, Google-return, reminder and Calendar links open `/app`. Previously shared root invitation and Google-return links remain compatible.
- Public home does not load Firebase/workspace code or call the API. Account startup displays a loading screen until server configuration and identity are ready.

No database migration or new environment variables are needed. Keep your existing Firebase, Gemini, Google, SMTP and reminder settings. The Google redirect URI remains `https://shiftscript.earny.co.za/api/google/callback`. Existing `/about`, `/privacy`, `/terms` and `/data-deletion` URLs remain available. You do not need to edit OAuth branding or restart verification for this deployment.

## Install on your Mac

1. Download and unzip `ShiftScript-v3.0.2.zip` into Downloads. The folder should be named `ShiftScript-v3.0.2`.
2. Open the VS Code terminal. Run each command separately:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.0.2/" ./
npm ci
npm run check
```

This updates the project while keeping your private local settings and repository.

3. Push the update:

```bash
git add .
git commit -m "Add public ShiftScript landing page"
git push origin main
```

4. Wait for the Vercel production deployment to complete, then check:

- `https://shiftscript.earny.co.za/` — public landing page.
- `https://shiftscript.earny.co.za/app` — sign-in or existing workspace.
- Get started — signup form when enabled.
- Privacy links and an existing workspace invitation.

For local development, run `npm run dev`; open `http://localhost:5173/` for the landing or `http://localhost:5173/app` for the app. `npm run preview` serves the built front end only; it does not start the API.

## Verification

69 unit/API tests and the production build pass. Seven browser suites cover the new home plus all existing workflows. Desktop and mobile landing screenshots are included in `docs/screenshots`. External Google/Firebase/SMTP services are simulated during automated checks; no live accounts or messages are created.
