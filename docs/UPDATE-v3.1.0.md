# ShiftScript v3.1.0 — your workspace assistant and Google Calendar

The new **Assistant** page answers questions using permitted tasks, meeting notes, discussion points, decisions and pending proposals. Connect your Google Calendar to include upcoming events and availability. It uses your existing Gemini API key; no separate AI subscription or API provider is required.

## What you can do

- Ask “What tasks are assigned to me and when are they due?” Assignment uses the same account/name/alias rules as My tasks. Missing deadlines remain missing.
- Ask about a meeting’s decisions, discussion points and proposed tasks. Source chips open the original task or meeting; event chips link to Google Calendar.
- Ask for a plan around upcoming events. Each request reads the next 14 days from your selected calendars; potential work slots use weekdays, 08:00–17:00 in the planning time zone.
- Ask “Schedule my portfolio review task.” Review the date, start time, time zone and duration, then confirm. Undated tasks require you to set a block date and time first.
- Ask to change a task’s status or deadline. Review both fields before confirming. Permissions, stale-version checks and existing dependency rules apply.
- Ask “Email the portfolio recap to kopano@example.com, kiya@example.com.” The assistant opens the existing email preview with those addresses. You can edit them and send from the configured Earny/Zoho mailbox. Pending task proposals are excluded.

Replies and proposed actions are private to the asking account and workspace. Team members cannot browse your calendar or assistant conversation through shared workspace records. The UI uses Earny blue, original Compass/Send icons, existing transparent clay artwork and the blue wave loader. It supports small phones, tablets, desktop, keyboard input and reduced motion. The sidebar menu now scrolls within the available height, keeping profile and sign-out controls reachable as the navigation grows.

## 1. Enable Google Calendar API

Do this in **the Google Cloud project used by your existing Meet integration**:

1. Open [Google Cloud Console](https://console.cloud.google.com/). Select that project using the project selector at the top.
2. Open the navigation menu → **APIs & Services → Library**.
3. Search for **Google Calendar API** and open it.
4. Click **Enable**. If the button says **Manage**, it is already enabled.

Keep Google Meet API and Google Docs API enabled. No GoDaddy/DNS changes are required.

## 2. Add Calendar permissions to your Google consent configuration

1. In the same project, open **Google Auth Platform → Data Access**. Older consoles show **APIs & Services → OAuth consent screen**.
2. Click **Add or remove scopes**.
3. Search for Google Calendar API and select these four scopes. If the console offers a manual scope field, paste the full URLs below, one per line.
4. Save the changes. Keep your existing Meet and Docs read scopes.

| Scope | Purpose |
| --- | --- |
| `https://www.googleapis.com/auth/calendar.events.readonly` | Read upcoming events on selected calendars |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` | Let each person choose their calendars |
| `https://www.googleapis.com/auth/calendar.events.freebusy` | Check availability before proposing/confirming a block |
| `https://www.googleapis.com/auth/calendar.app.created` | Create and use a separate ShiftScript task calendar |

If the OAuth application is **Testing**, go to **Google Auth Platform → Audience → Test users** and add each person’s Google email address. Testing-mode consent can expire and require reconnecting. If your application has already gone through production verification, adding sensitive permissions may require updating that verification submission. The new code does not bypass Google’s consent or verification screens.

## 3. Confirm the existing integration callback

Open **Google Auth Platform → Clients**, then open the **Web application client whose ID matches your Vercel `GOOGLE_CLIENT_ID`**. Under **Authorized redirect URIs**, keep this exact entry:

```text
https://shiftscript.earny.co.za/api/google/callback
```

Calendar reuses this integration client, callback, server secret and encryption key. Do not replace them or generate a new encryption key. This client is separate from Firebase Google sign-in. Firebase sign-in keeps its existing callback:

```text
https://shiftscript.earny.co.za/__/auth/handler
```

The Firebase setup from [v3.0.11](UPDATE-v3.0.11.md) remains necessary for mobile Google login. If that setup is already working, leave it as it is.

## 4. Check Vercel environment variables

Open your ShiftScript project on Vercel → **Settings → Environment Variables**. Keep your existing Firebase, Google, Gemini and Zoho variables. The new optional entries are:

| Key | Value | Notes |
| --- | --- | --- |
| `ASSISTANT_MODEL` | `gemini-3.8-flash` | Default assistant model; can be changed independently of meeting processing |
| `MAX_ASSISTANT_CHATS_PER_DAY` | `40` | Per-account daily cap; 6 requests/minute also applies |

Make sure existing `AI_PROVIDER` is `gemini` and existing `GEMINI_API_KEY` is populated on the server. Without changing those, sample mode gives deterministic task replies and makes no live AI requests. Never prefix a private key with `VITE_`. The assistant model can be overridden with another available text/structured-output model in the same Gemini project.

Google currently lists free-tier input/output for Gemini 3.8 Flash. Availability and rate limits depend on your API project, and sharing the existing key does not create a separate quota. Your Google AI Pro consumer subscription does not replace API-project access. Check [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) and [AI Studio](https://aistudio.google.com/) if a model or quota error appears. This release makes one model request per chat turn, with bounded context and no automatic provider retries.

No new Firebase rules, indexes, SMTP credentials or third-party dependencies are required. Private conversation data uses the existing server-only profile storage and deny-all browser Firestore rules.

## 5. Install and deploy

Extract **ShiftScript-v3.1.0.zip** into Downloads. Open your existing project in VS Code. Run these commands **one at a time** in its terminal:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.1.0/" ./
npm ci
npm run check
git add .
git diff --cached --name-only
```

Check the staged filenames. `.env`, service-account credentials and private data should not be present. If the terminal opens a scrolling file list, press **q** to exit it. Then run:

```bash
git commit -m "Add workspace assistant and Google Calendar planning"
git push origin main
```

Your connected Vercel project deploys the push. If you change environment variables after a deployment, redeploy so the server receives them. The ZIP excludes local secrets, Git metadata, dependencies and stored data; the copy command preserves those in your existing project.

## 6. Connect and test with your group

1. After deployment, open https://shiftscript.earny.co.za/app and sign in normally.
2. Choose **Assistant** in the sidebar, or **Ask assistant** on Overview. On phones, use the menu to open Assistant; the existing four bottom navigation icons stay familiar.
3. Choose **Connect Google Calendar**. Select your Google account and approve all four Calendar permissions. You return to Assistant in the same browser tab. This is a separate connection from Meet.
4. Expand **Choose calendars**, select one to five calendars and save. Pick the correct **Planning time zone**, normally `Africa/Johannesburg` for your group.
5. Ask about a task with no due date. Confirm the answer says no deadline is set and its source chip opens the correct task.
6. Ask about a meeting’s decisions and pending tasks. Confirm pending tasks are identified as proposals.
7. Ask for a schedule. Set a future date/time and confirm once. On first approval, Google receives a new **ShiftScript · Task blocks** calendar. Check that it contains the block, its task link, and no invited guests. The task deadline stays unchanged.
8. Try a time that conflicts with an event on a selected calendar. The app should ask you to choose another time.
9. Ask for a status change and confirm its review card. Check the task tracker and activity history.
10. Ask for a recap to your chosen comma-separated addresses. Review the recipients and email body, then choose **Send recap**. Check Zoho Sent mail and recipient delivery. “Accepted” confirms SMTP acceptance, not inbox delivery.
11. Have a second person connect their calendar. Each person should see their own events/history, while shared tasks and meetings obey the existing workspace roles.

## Limits and recovery

- Each reply includes up to 60 relevant tasks, six relevant meetings with selected transcript excerpts, and 60 upcoming events. Source ranking is lightweight; asking about a named task or meeting improves retrieval. The assistant is not a complete transcript search engine.
- Calendar coverage is selected calendars over the next 14 days. Truncated lists and unavailable Calendar access are reported. Missing access is never treated as an empty calendar. Scheduling rechecks availability at confirmation, but another calendar editor can still create a conflict afterwards.
- A confirmed block is a separate Google event. Later task edits do not automatically reschedule it. Existing draft-based task Calendar controls still work independently.
- Assistant-created blocks are future times within 90 days, with durations of 15–120 minutes. No guests are invited and existing primary-calendar events are not edited.
- History retains 12 messages per workspace across your five most recently used conversations. **Clear conversation** removes your current chat and its proposals; tasks, meetings and calendar blocks remain.
- Proposals expire after 24 hours. Changed tasks require a fresh proposal. Viewers may ask questions and schedule private blocks, but cannot modify shared tasks or send workspace recaps.
- The daily assistant cap resets at midnight UTC. Failed attempts count; Google/Gemini project quotas can be lower than the app’s cap.
- If Calendar fails, workspace questions remain available. Fix access and reconnect Calendar for event questions. Disconnecting Calendar does not disconnect Meet.
- An ambiguous provider response is marked **Check result** and is not automatically retried. Check Google Calendar or Zoho Sent mail before creating another action. Reconnecting can create a new task calendar on the next approval; existing Google calendars/events are not deleted.

## Verification

See [check-results.txt](check-results.txt) for automated results. Tests use fictional Google events, simulated OAuth/model/auth responses and mocked SMTP. They do not connect your real accounts or send real emails. Owner setup and a live round trip are still required after deployment.

Technical references: [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [free/busy query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [create a calendar](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert), [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).
