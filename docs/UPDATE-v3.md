# ShiftScript v3.0 — Keep the work moving

This full source release adds the seven planned features and the smaller usability improvements. It keeps React, Tailwind, Node, Firebase, Gemini, Google Meet imports and Earny's Zoho sender. Your existing meetings, projects, shared workspaces and tasks stay in their current locations.

## The seven features

| Feature | What you can do | Where to find it |
| --- | --- | --- |
| Notifications and reminders | See your assignments, upcoming deadlines and overdue work; mark notices read. Choose in-app notices, reminder lead time and optional daily Earny email. | Header bell; Profile → Reminder preferences |
| Saved Calendar scheduling | Save a work-session date, time, duration and time zone on a task. Schedule up to 25 selected tasks. Mark events added after saving them in Google Calendar. | Task tracker/Board → Add to Calendar; select tasks → Schedule selected tasks |
| Editable profiles | Change your display name, upload/remove a cropped photo and add up to eight comma-separated nicknames. | Profile → Your profile & preferences |
| Owner suggestions | Match extracted names to member names and aliases. Confirm a suggested account. Duplicate matches require a reviewer to choose the right account. | Proposed task review; Task details → Workspace assignee |
| Meeting preparation and follow-through | Generate and save an editable agenda from unfinished commitments, previous decisions and follow-up topics. Attach it to the next conversation, then compare completed and open work after processing. | Meetings → Prepare meeting agenda; meeting details → Prepare follow-up meeting |
| Workspace activity | See the actor, action, time and linked task, meeting or project. Up to 200 recent events are kept. | Navigation → Activity |
| Task dependencies | Select up to ten prerequisites. Completion is blocked while prerequisites are unfinished. Cycles, missing tasks and cross-workspace dependencies are rejected. | Task details → Waiting on other tasks |

Names and aliases help find name-only assignments. An explicit account assignment always takes precedence. Changing a profile does not move a task to another person. Owner suggestions never approve tasks automatically.

## Quality-of-life improvements

- **Quick dates:** Today, Tomorrow, Friday and Next week in task/proposal editing. Friday means the next Friday when today is Friday; Next week is seven days from today.
- **Bulk changes:** Select up to 25 tasks and change assignee, priority, project or status together. Select Completed to complete a batch. Stale edits or unfinished dependencies reject the whole batch.
- **Undo:** Undo your latest task edit, status change, bulk operation, saved schedule or deletion for five minutes. Undo belongs to the person who made the change and refuses to overwrite a newer edit. Task creation and proposal approval are not undone through this control.
- **Saved views:** Save named filter combinations, or use My overdue tasks, Due this week and Waiting for review. Due this week uses the existing next-seven-days filter. Views are personal and scoped to a workspace.
- **Workspace search:** Search meetings, tasks and projects with the header search button or Ctrl/Command + K. Press N outside a text field/dialog to start a meeting.
- **Mobile actions:** Task cards have Details and Done buttons, clearer selection controls and dependency badges. The four-button bottom navigation stays available. New layouts were checked at 320px and 390px.
- **Needs attention:** Dashboard shortcuts for missing owners, missing deadlines, overdue tasks, pending proposals and dependencies.
- **Freshness:** Visible workspaces refresh every two minutes while no dialog is open. Use the existing Refresh button whenever you need an immediate update. This is polling, not a realtime subscription.
- **Brand:** New Bell and History icons use the original ShiftScript vector style. Corporate blue, urgency accents, tab illustrations and reduced-motion support remain.

## Calendar: what “added” means

ShiftScript stores a task's work-session schedule independently of its due date. It opens Google's prefilled event draft; you choose the calendar and click **Save** there. Then select **I saved this event in Google Calendar** to record your own confirmation. The mark is private to you and associated with that schedule. It is not a verified Google receipt.

Bulk scheduling prepares a separate link for each task; it does not launch many popups. Mark each event added after saving it. Reopening and saving another draft can create a duplicate, so marked events show a confirmation before opening. Task edits do not update an existing Google event. No extra Calendar API scopes are required. Viewers may open event drafts and keep personal marks, but may not save shared task schedules.

Reference: https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events#provide_a_link_for_users_to_add_the_event

## Meeting agendas and comparison

1. Go to **Meetings → Prepare meeting agenda**.
2. Choose a previous meeting, or start from unfinished workspace/project tasks.
3. Click **Generate agenda from existing work**, edit the agenda, title, date and meeting type, then **Save agenda** or **Use for new meeting**.
4. Paste/upload the actual transcript, add voice, or import a recent Google source. The agenda stays separate from the spoken source; it does not become evidence for invented tasks.
5. Process and review the meeting normally. The follow-through panel shows the previous meeting's current completed/open commitments and earlier follow-up topics. Previous-decision mentions use text-matching hints for human review; they do not prove a decision was resolved.

Saved unprocessed agendas appear in the meeting list; New meeting also has a Saved agenda selector. There is a limit of 50 saved agendas per workspace. An attached agenda is a snapshot; later task changes update the progress comparison, not the saved agenda text. Existing drafts are protected by a replacement confirmation when starting from an agenda.

## Update your existing Mac project

Download and extract **ShiftScript-v3.0.zip** into Downloads. The extracted source folder should be **ShiftScript-v3.0** and contain `package.json`. Keep using your existing **ShiftScript 2** folder for its Git history and private `.env`.

**Before pushing:** in Vercel, open your ShiftScript project → **Settings → Functions**, and enable **Fluid compute** if it is off. The daily reminder function in this release has a 300-second maximum duration. Vercel's current Hobby limit supports that duration with Fluid compute; the old non-Fluid Hobby maximum is 60 seconds.

Run these commands **one line at a time** in VS Code → Terminal → New Terminal:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' "/Users/soko/Downloads/ShiftScript-v3.0/" ./
npm ci
npm run check
npm run dev
```

Open the local address shown by Vite, usually http://localhost:5173. Test the updated profile, a task dependency, an agenda, bulk editing/Undo and Calendar scheduling. Stop the development servers with **Control + C** before committing.

Then run each line separately:

```bash
git status
git add .
git --no-pager diff --cached --name-only
git commit -m "Add ShiftScript profiles, reminders and productivity tools"
git push origin main
```

The staged list should include `server/productivity.js`, the new `shared/` modules, new React components, `api/reminders.js`, `vercel.json`, tests, docs, icons and `package-lock.json`. `.env` and private Firebase/SMTP credentials must not appear. Existing `.gitignore` excludes them. `--no-pager` prevents the terminal opening the scrollable Git viewer.

Vercel builds from your push. Keep the project root containing `package.json`, Vite framework, `npm ci` install, `npm run build` build command and `dist` output. Existing Firebase, Google, Gemini and Zoho variables continue to work. No new Google API or OAuth scopes, manual data migration or browser Firestore permission changes are required.

## Optional daily Earny email reminders

In-app notifications work immediately. Daily emails need **CRON_SECRET**, the existing Zoho SMTP settings, a canonical app URL and each user's consent.

1. Vercel → ShiftScript project → **Settings → Environment Variables**.
2. Confirm `APP_URL` is `https://shiftscript.earny.co.za`. Keep your working `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM` values. `SMTP_FROM` should be the Earny sender you've already configured, such as `meetings@earny.co.za`.
3. Generate a new random secret locally with `openssl rand -hex 32`. Copy the generated value. It is a server secret; do not commit it or paste it into public code.
4. Add a Vercel environment variable: **Key:** `CRON_SECRET`; **Value:** the generated secret; **Environment:** Production. Save it.
5. Redeploy the latest commit so environment changes take effect. Confirm Fluid compute is enabled.
6. Vercel → project → **Settings → Cron Jobs**: confirm `/api/reminders` with schedule `0 6 * * *` appears and is enabled. The configuration is already in `vercel.json`.
7. In the deployed app, sign in using a verified Firebase email. Open **Profile**, enable **Daily email reminders**, choose the lead time, then **Save profile & preferences**. Unverified users can request a verification email, verify and sign in again.
8. Assign yourself a due/overdue task. The next scheduled run sends a digest to your verified account email using Earny's sender. Vercel's Cron Jobs screen also supports a manual run after configuration; it sends opted-in reminders, so use it when you're ready for that.

The job is scheduled at **06:00 UTC**, or **08:00 South Africa**. On Vercel Hobby it can run within the scheduled hour, so expect approximately **08:00–08:59**, not an exact-minute reminder. Cron runs happen in production, not automatically on localhost or preview deployments. A user's preference time zone determines which dates count as today/upcoming; it does not set a different cron hour.

The digest includes current upcoming/overdue assignments and assignments created/reassigned that day when recorded in activity. It sends only to the verified account that opted in, using current workspace access. It is not the comma-separated meeting recap feature; that existing flow stays available separately.

This initial implementation queries up to 100 opted-in profiles and considers up to 20 per invocation, prioritizing older attempts, with four concurrent workers and a bounded run time. It suits a small team; larger audiences need a paginated queue and more scheduling capacity. It does not promise a daily message for every subscriber above that capacity. Mail-server acceptance is recorded, not inbox delivery. A reserved/uncertain same-day attempt is not silently retried, which prevents duplicate emails after SMTP timeouts. Turn reminders off in Profile to withdraw consent.

Official references checked for this release:

- Cron setup, CRON_SECRET, Hobby accuracy: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- Function duration and Fluid compute limits: https://vercel.com/docs/functions/configuring-functions/duration

## Persistence and access

- Personal name, aliases, compressed avatar, preferences, views, notification read state, calendar marks and email attempts live in `privateProfiles/{uid}`. The authenticated server controls access; they are not returned in workspace data.
- Shared `agendas`, `activity` and temporary `undoRecords` use workspace subcollections. Schedule and dependency IDs are stored on task documents.
- Existing records receive empty/default values when read. Your deny-all browser Firestore rules remain appropriate because the Admin SDK is used by the authenticated server.
- Undo restores meeting-origin links after deletion. Dependencies must stay within one workspace. Changes retain Owner/Member/Viewer checks and optimistic versions.

## Verification and live checks

The release passes **69 unit/API tests**, **five browser suites** and the **production build**. Tests cover consent, verification, revoked membership, private profiles, overlapping cron calls, uncertain email outcomes, duplicate owners, cycles, atomic bulk changes, stale versions, undo expiry/ownership/conflicts, Firestore persistence, agenda references, Calendar time zones, image resizing, UI controls and mobile overflow.

All tests use isolated data and simulated external integrations. They do not send real emails, create real Calendar events or modify your hosted account. After deployment, check real Firebase sign-in/persistence, one Google import with an attached agenda, one Calendar event, your reminder opt-in and an actual Earny digest. Your credentials, host configuration, quotas and inbox delivery still need that live check.

Optional browser tests on your Mac:

```bash
npx playwright install chromium
npm run test:ui
```

## Brief demo walkthrough

“ShiftScript now carries the work beyond the meeting. First, we give every user a profile and aliases so tasks are easier to assign. Next, notifications and personal views highlight what needs attention. We can update a group of tasks, undo a mistake and keep dependencies from being completed out of order. We save work sessions and add them to Google Calendar. Before the next conversation, we prepare an agenda from unfinished commitments. After processing the transcript, we compare progress and review the new proposals. Activity history makes shared changes visible, and the same controls work on mobile.”
