# ShiftScript v2.4 — Add tasks to Google Calendar

## How it works

1. In Task tracker or Board, click **Add to Calendar** on a task. Alternatively, open Task details and choose **Add to Google Calendar**.
2. An existing task due date is pre-filled. If no date exists, choose one. A start time is always required because ShiftScript tasks currently store date-only deadlines.
3. Pick a duration: 15, 30, 45, 60, 90 or 120 minutes. The default is 30 minutes. The time zone is shown and follows the user's device, so a South African device uses Africa/Johannesburg.
4. Click **Open Google Calendar**. It opens an event draft containing the task title, description, owner, priority and source meeting name, with a link to the ShiftScript homepage.
5. Review the event, choose your Google account/calendar and click **Save** in Google Calendar.

The button stays disabled until both date and time are entered. Invalid dates/times and unavailable daylight-saving times are rejected. The event end time is calculated correctly across midnight. A fallback **Open event draft again** link is shown if the browser blocks the new tab.

Scheduling creates a calendar event/work session, not a Google Tasks entry. It does not alter the task's saved deadline, mark it complete, invite colleagues, or claim the event has been saved. Existing viewer permissions allow personal calendar export without editing workspace data. Save unsaved task edits before scheduling from Task details.

## Google setup

This uses Google's documented pre-filled event link flow. There are no new Calendar API permissions, no new OAuth connection and no extra ShiftScript API usage for this feature. Users sign in to Google Calendar and save the draft themselves. Existing Google Meet permissions and connections are unchanged. These events do not automatically sync with future ShiftScript edits; repeatedly saving a new draft can create duplicate events.

Reference: https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events#provide_a_link_for_users_to_add_the_event

## Update on your Mac

Extract the ZIP to Downloads and run each line separately in the VS Code terminal:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' "/Users/soko/Downloads/ShiftScript-v2.4/" ./
npm ci
npm run check
git add .
git --no-pager diff --cached --name-only
git commit -m "Add Google Calendar scheduling for tasks"
git push origin main
```

Keep your local `.env` and Vercel variables. No new environment variables, API enablement, migration or Firestore rules are required.

## Verification

- Unit checks: required date/time, real dates, duration validation, saved tasks, safe app URLs, preserved task content, South African UTC conversion, midnight/year rollover and daylight-saving transitions.
- Authenticated browser checks: missing-date and missing-time prompts, existing-date pre-fill, Profile My tasks → Calendar, Task details → Calendar, title/time-zone/duration accuracy and blocked-popup fallback.
- Mobile calendar layout checked at 320px. External Calendar navigation is mocked; tests do not create real calendar events.
- Existing transcript, approvals, mobile navigation, account isolation, invitations, Google imports and email-recap suites are retained.
