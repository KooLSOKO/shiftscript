# ShiftScript v3.1.10 — the desktop dial and workspace profiles

## Directional selector

The blue directional dial is back on desktop. Text is up, Voice is right, Recent Google Meet is down and Previous meeting is left. Click any surrounding mode, use the arrow keys, or drag the dial and release. Desktop mouse input has a small dead zone, stable direction locking near diagonals, bounded one-axis movement, and a short linear transition instead of springy motion. Choices commit on release; hovering, pointer cancellation and tiny accidental drags do not commit a new mode. Phone/tablet touch behavior is retained. Reduced-motion preferences are respected.

## Full selection border

The selected sidebar item now has a complete blue border instead of a left-only highlight. Its light blue background remains. This applies to desktop navigation and the mobile navigation drawer.

## Profile cards

Personal and member profiles share a rounded card with a large photo, name, optional short bio, a verified-email badge when applicable, and real task counts for the current workspace. Photo uploads are cropped to 480px and compressed to the existing small avatar limit. Existing smaller photos remain valid; re-upload for a sharper portrait. Without a photo, the card uses ShiftScript clay artwork and initials. Your own card keeps My tasks, role, email, workspace information and account controls. Desktop has a card/settings layout; mobile stacks the sections with wrapping text and accessible touch targets.

Set your bio in Profile → About you, then Save profile & preferences. It is visible to people in workspaces you have joined. Private aliases, reminders, calendar settings and assistant conversations are not shown on a member profile.

## Navigation and member access

Click the account/photo area at the bottom left of the sidebar to open your profile. On mobile, open the menu to use this entry, or use the top profile icon. In Team & workspace, click an accepted member's name or initials to open their profile. A pending invitation does not grant profile access. Viewers can read shared member profiles, and removing a member removes this access. Profiles show only the current shared workspace, not other workspace memberships.

The server checks both memberships before reading a profile and again after asynchronous Firebase identity lookup. It returns a small shared profile view and task counts, never private preferences, drafts, saved filters, calendar data or assistant history.

## Email verification

The badge means **Email verified**, not a paid account or an owner role. Your badge uses the verified Firebase session; a teammate's badge uses a current Firebase Auth user lookup matching their workspace email. Editable or stale stored profile values cannot enable it. If lookup cannot confirm verification, no badge is shown. Local demo profiles do not have verification badges.

For email/password accounts: Profile → Verify your email, open the emailed link, return to ShiftScript and choose Check verification. This reloads Firebase's account state and forces a new ID token before refreshing the badge. Google accounts may already have verified email addresses. Do not mark someone verified manually in profile data.

## Install and deploy on your Mac

Unzip **ShiftScript-v3.1.10.zip** into Downloads. Keep your existing **ShiftScript 2** folder and open it in VS Code. Run these commands **one at a time**:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env*' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.1.10/" ./
npm ci
npm run check
```

Continue only when the checks pass. Then:

```bash
git add .
git --no-pager diff --cached --name-only
git commit -m "Restore desktop dial and add shared member profiles"
git push origin main
```

Review staged filenames before committing; do not include private environment files or credentials. Vercel deploys the pushed commit. Wait for Ready, then reload the site. The copy command preserves your private environment files, Git repository, local data and deployment settings.

**No new environment variables, dependencies, Google scopes, Firebase rules or database migration are required.** Existing profile records work with an empty bio. Keep your existing Firebase Admin credentials configured on the server.

## Acceptance walkthrough

1. Desktop: create a meeting; click, drag and use arrow keys for each source. A tiny drag or hover should not change your selected mode.
2. Switch tabs; check that the whole selected navigation item has a blue border.
3. Click your bottom-left account entry; upload a photo, add a bio, save and refresh. Check My tasks.
4. Sign in with an unverified email/password account; no badge should show. Verify the email and tap Check verification.
5. Invite a second account, accept from that account, then open its profile from Team & workspace. Check its photo/bio, role and current-workspace task counts.
6. Repeat on a phone: open navigation, open Profile, then view a teammate. Dialogs should stay within the screen and scroll vertically.
7. Check task movement and Undo on the board; the immediate saving behavior from v3.1.9 is preserved.

## Validation

126 unit/API tests and production build pass. Five browser suites pass: profiles-browser, ux-controls-browser, browser-smoke, collaboration-browser and accounts-browser. Browser validation covers email/Google sign-in and same-tab mobile return, invitation acceptance and workspace isolation, profiles, desktop directional controls, complete selection borders, 320/390/768/1440px layouts, immediate board movement/rollback/Undo, nested Escape, private draft reopening and the transcript/voice workflow. Tests use fictional accounts and isolated/simulated services. Physical iPhone Safari, live Firebase verification emails, Google profile photos and the deployed production connection remain owner acceptance checks. The existing large-bundle build warning remains.
