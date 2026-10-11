# ShiftScript v3 architecture

## Pipeline and trust

Voice upload/recording → validated authenticated API → Gemini audio-to-text → editable transcript. Pasted or `.txt` transcripts join the same pipeline. Raw recordings are not persisted.

Transcript → validation → structured extraction → evidence/owner/deadline grounding → meeting with pending proposals → human single/bulk review → transactional task creation → dashboard/table/board. Manual tasks enter directly with `sourceType:manual`, without a fictional source meeting.

Gemini uses the existing Interactions adapter, configurable `GEMINI_MODEL`, strict response schema, `store:false`, 45-second model timeout and no automatic retries. Cached identical meetings skip new analysis. Model/free-tier access is external to the app. Grounding verifies quotes and explicit names/deadlines, not semantic correctness; humans approve commitments.

## Data model

`workspaces/{workspaceId}` stores `workspace` metadata and a shared daily `quota`. Existing personal workspaces keep their Firebase UID path. Additional workspaces use random `w_` IDs.

| Field / subcollection | Contents |
| --- | --- |
| `workspace` | ID, name, owner UID/name/email, timestamps, members and pending invitations |
| `workspace.members` | UID, name, email, role, joined timestamp; one immutable owner in this release |
| `workspace.memberUids` | Membership index for catalog discovery |
| `workspace.invites` | Random invitation ID, email, Member/Viewer role, inviter UID and timestamp |
| `workspace.inviteEmails` | Email index for verified invitation discovery |
| `meetings` | Transcript/source, type/date, project ID, summary, decisions, follow-ups and proposals |
| `tasks` | Editable task fields, owner UID/name, project, checklist, status, notes and source meeting/proposal/evidence |
| `projects` | Name, description, accent colour, status, creator and timestamps |
| `drafts` | One document per user UID, private input, owner UID, version and timestamp |

Legacy metadata is hydrated/persisted in place. Tasks without a project/checklist/owner UID still render. Local JSON upgrades from a flat record into a `schemaVersion:2` workspace map on first mutation. No meetings/tasks move. Historical names remain after member removal.

## Authorization

A Firebase ID token establishes the actor. `X-Workspace-Id` selects a workspace but never grants access. Every request validates owner/membership, and mutations recheck it within the transaction. Removed members' delayed analyses cannot be committed. Private mode additionally enforces `ALLOWED_EMAILS`; public signup does not bypass workspace permissions.

Owners manage settings, invitations and member roles/removal. Members edit work. Viewers only read/export. Owner UID/role cannot be changed through member routes. Browser Firestore access is denied; Admin SDK handles server operations.

Invitations bind an exact normalized email and require `email_verified` in the verified ID token. Links alone grant no access. Owners can revoke invitations or send/resend them through Zoho. New invitations have a server-enforced 7-day expiry, checked at discovery, acceptance and sending. Legacy invitations without an expiry remain compatible. Owner creation requests support a client UUID for safe retries. Email bodies and recipients come from persisted workspace/invitation data, never from arbitrary client content. Links use the configured `APP_URL` origin, falling back to `GOOGLE_REDIRECT_URI`; request Host/Origin headers cannot change them. Firebase verification/reset emails send on explicit user action. Personal use does not require email verification; joining does.

Draft responses contain only the actor's draft. Recovery keys include UID/workspace ID. Saves/deletes compare expected versions; failed saves keep a local copy. Member removal deletes their workspace draft. Task editors supply `expectedUpdatedAt`; stale saves fail. Moving meetings updates approved tasks' projects and timestamps too.

## Transactions and limits

Firestore transactions read the root/subcollections before writes, diff changed records and merge metadata/quota. Bulk review applies a whole selected batch atomically. Repeated review creates no duplicate tasks; manual create retries reuse a UUID-derived ID. Local writes serialize in one Node process and use atomic file rename.

Limits: 20 members plus pending invitations per workspace, 20 memberships per user, 50 projects, 50 meetings, 250 tasks, 20 proposals per meeting, 30 checklist steps and 50 progress notes per task. The quota is 20 combined analysis/transcription attempts per workspace/day by default, resetting at UTC midnight; failures count.

Catalog queries use default single-field array indexes on `workspace.memberUids` and `workspace.inviteEmails`. Reads/transactions load a bounded workspace. Larger deployments need pagination, narrower transactions and job locking. Concurrent unseen duplicate meetings may both call Gemini before one record wins. Workspace-creation membership limits are a soft precheck under simultaneous requests.

There are no realtime subscriptions, presence, workspace deletion or owner transfer. Visible workspaces poll every two minutes when no dialog is open; explicit refresh is also available. Optional daily reminders are described below. Google Meet imports and optional invitation/recap emails are described below.

## Input and exports

Audio signature/base64 validation permits supported formats, at most 2.5 MB decoded, with 15,000-character transcription output. The JSON body limit is 3.5 MB. Pasted/uploaded text, private drafts and Google imports allow 100,000 characters, sent in full in one analysis request with the existing 45-second model timeout. Uploads allow 400 KB; there is no silent text truncation. The encrypted Google preview vault evicts older previews when its combined JSON exceeds 600 KB before encryption/base64 expansion, to stay below Firestore's per-document limit. Dates use ISO calendar strings; overdue comparisons use Africa/Johannesburg. Timestamps use UTC.

PDF/CSV export runs in the browser for only the selected workspace/current filtered tasks. PDF dynamically loads jsPDF and bundled licensed DejaVu fonts, wraps text and paginates. CSV quotes cells and prefixes possible spreadsheet formula payloads. Meeting reports retain evidence and approval status. No external export service receives content.

## Main modules

| Module | Purpose |
| --- | --- |
| `src/App.jsx` | Auth/catalog, switching, dashboard, navigation and tracker/board |
| `src/components/Account.jsx` | Signup/sign-in/reset and personal workspace setup/settings |
| `src/components/Workspaces.jsx` | Invitations, verification, roles and workspace creation |
| `src/components/Projects.jsx` | Project cards, status and edits |
| `src/components/NewMeeting.jsx` | Private draft recovery/autosave and text/voice processing |
| `src/components/MeetingDetail.jsx` | Notes, individual/bulk review and reports |
| `src/components/TaskEditor.jsx` | Manual/meeting tasks, assignees, checklists and updates |
| `src/features/` | Pure task filtering and export/report helpers |
| `server/collaboration.js` | Membership, permissions, project and assignee checks |
| `server/app.js`, `schema.js` | Authenticated APIs, validation, quota and guarded mutations |
| `server/store.js` | Firestore/local persistence, catalog and migration |
| `api/index.js`, `vercel.json` | Node function and Vercel API/asset routing |


## v2.1 integration boundaries

`server/google.js` handles OAuth (PKCE, browser-bound expiring state), token refresh and official Meet/Docs endpoints. `server/integration-vault.js` encrypts personal connection tokens, OAuth attempts and temporary import previews using AES-256-GCM. Firebase stores opaque payloads under `privateIntegrations/{uid}`, separate from workspace collections. This collection is never included in workspace/catalog APIs; the deny-all Firestore browser rules apply to it. Local development uses a private ignored `.data/integrations.json` file.

Only server-fetched previews can become trusted Google sources. They are bound to the requesting UID, current Google connection and workspace; imports recheck write permission. Existing meeting grounding, AI quota, deduplication and task-review flows apply. Source labels distinguish a document/notes from native transcript entries. Google source metadata is stored on the meeting and exported in reports.

`server/recap-email.js` builds a recap from persisted meeting data and approved tasks. The client submits recipients, a preview fingerprint and idempotency UUID, not arbitrary email body/from/HTML. A workspace transaction validates the fingerprint, role, limit and send reservation before SMTP. Sender and SMTP credentials remain server-only. Outcome histories live on meeting records; uncertain outcomes are not auto-retried. Email recipients are Bcc. SMTP outcomes are acceptance statuses, not delivery receipts.

Google imports are user initiated. There are no Meet bots, background polling, webhook subscriptions, Calendar scopes or restricted Drive read scopes in this phase.

## v2.2 invitation and intake flow

`server/invitation-email.js` builds an escaped Earny invitation with a canonical join link, role and expiry. `/members/invitations/:id/email` is owner-only and accepts only an idempotency UUID. A transaction reserves the send and quota before SMTP, checks membership and invitation again before sending, and records accepted/rejected/uncertain status. A failed send keeps the invitation. Resends have a 60-second cooldown, 20 attempts per invitation and 20 sends per workspace/day (UTC), independent of the AI-request quota. SMTP acceptance is not inbox delivery. Revocation during SMTP never revives the invitation.

`NewMeeting.jsx` keeps its text/voice draft when users switch between text/voice, recent Google Meet sources and saved meeting transcripts. Embedded `GoogleMeet.jsx` loads accessible recent records, supports search/pagination, preview and trusted import, and marks imported artifacts. Opening a saved meeting saves the local text draft first. Reusing a transcript keeps its source date for relative deadline accuracy. Unchanged transcript/date reopens the saved meeting with reviews and tasks intact; new discussion text/date enters processing and review. Empty drafts created while opening the modal are cleared after a successful Google import, while unrelated text drafts are kept.


## v3 personal and productivity data

`privateProfiles/{uid}` holds personal name/aliases/avatar, reminder preferences, scoped saved views, read-notification IDs, personal Calendar confirmations and bounded digest attempt history. Requests derive UID from the verified Firebase token. Profile names/aliases are mirrored to that user's member entries so reviewers can suggest an account; account IDs override name matching. The local store persists profiles in its ignored database; the in-memory profile adapter is for explicitly injected test stores.

Workspace subcollections now also contain `agendas` (50), `activity` (last 200 events) and `undoRecords` (bounded five-minute snapshots). Task documents add optional `schedule` and `dependencyIds`. Graph checks reject cycles, missing/foreign prerequisites and completion while waiting. Bulk edits and schedules are limited to 25 versioned tasks, applied atomically. Undo is author-bound, time-limited and conditional on every affected task's latest version; deletion/restore keeps proposal links consistent.

`shared/identity.js` unifies full/first/surname/nickname matching. `shared/scheduling.js` validates IANA wall times, resolves to UTC, rejects DST gaps and chooses the first occurrence in an ambiguous DST hour. `shared/productivity.js` provides notifications and follow-up comparisons. Agenda generation reads existing work without an AI call. Actual transcript processing remains independent and pending proposals still require review. Agenda snapshots and previous-meeting references remain metadata, independent of the transcript/date cache identity.

`api/reminders.js` exposes the same Express app with a longer 300-second Vercel function budget. An exact rewrite keeps it ahead of the general API function; `0 6 * * *` schedules production cron at 06:00 UTC. CRON_SECRET is checked with a timing-safe comparison before cron work. Current Auth verification/email/disabled status, profile consent and workspace membership are rechecked. A per-user/per-local-day transaction reserves each attempt before SMTP; uncertain attempts do not automatically replay. The job queries at most 100 opted-in profiles, considers 20 per run and uses four workers with a 240-second dispatch budget. It requires Fluid compute for the 300-second Hobby duration. Queued/paginated delivery is a future scaling task.

Daily digests use the existing Earny mailer and only the opted-in verified recipient. No new Calendar access is requested: saved schedules open event drafts and manual confirmations stay private. Calendar data does not sync automatically.

## v3.0.1 public policies and identity

Four static public pages in `public/about`, `public/privacy`, `public/terms` and `public/data-deletion` are copied to the build. Explicit Vercel rewrites precede the SPA fallback; their shared stylesheet is outside that fallback. No JS, account or API call is needed to read them. Policy links are available in account/onboarding frames and the app footer.

Google account sign-in uses Firebase `signInWithPopup` with `GoogleAuthProvider` and basic identity only. The existing Firebase UID and server token verification determine workspace access. There is no client-driven account merge and no reuse of Google sign-in credentials for Meet access. New users continue through the existing workspace onboarding. Enable the Google provider and authorise deployment domains in Firebase Console. The separate Meet OAuth flow and its scopes/testing restrictions remain unchanged.

## Public home and workspace entry (v3.0.2)

`index.html` contains the public landing page, semantic sections, native FAQs and social metadata. It is readable without JavaScript or the API. `public/landing.css` is isolated to `.ss-home`, with reduced-motion support. The small `src/main.jsx` entry lazy-loads `src/app-entry.jsx` and Firebase only at `/app` or `/app/`. Sign-up links use `/app?mode=signup` and honour the server signup flag. Authenticated sessions at `/app` retain the existing workspace and onboarding behaviour.

Old root invitation and Google callback query strings redirect to `/app` with all parameters intact. New OAuth returns, invitation emails, reminder links and Calendar draft links use `/app`; the registered OAuth callback URI remains unchanged. Public policy URLs remain unchanged. Vercel rewrites `/app` to the built HTML and serves landing CSS, robots.txt and sitemap.xml as static files. App responses have a noindex header; the client also sets app title/canonical/noindex. The sitemap contains only public pages.

## Homepage styling revision (v3.0.3)

The static home entry and lazy workspace routing remain unchanged. The home uses local Manrope fonts and four original clay illustrations; web delivery uses alpha-preserving WebP files in `public/art/clay`, with original PNGs included. `public/art/workspace-preview.png` copies an automated demo-workspace screenshot. The landing style remains scoped to `.ss-home`. No provider, account, schema, SMTP or cron behaviour changes.


## Workspace assistant and connected Calendar (v3.1.0)

`server/assistant.js` builds bounded context from the authorized workspace (60 ranked tasks, six ranked meetings with excerpts) and `server/calendar.js` (next 14 days from selected calendars, 60 events, free/busy checks). Context carries task/meeting/event references; output references are allowlisted and source links come from server data. Calendar descriptions, transcripts and task text are untrusted evidence in the system instruction. Model proposals cannot call arbitrary endpoints or access credentials.

Gemini Interactions reuses GEMINI_API_KEY with configurable ASSISTANT_MODEL, structured JSON, store:false, 30-second timeout and no automatic retries. Defaults: Gemini 3.8 Flash for chat, existing Flash-Lite for meeting analysis/audio. Sample chat is deterministic.

The existing encrypted per-UID integration vault holds separate Meet and Calendar connections. Calendar OAuth requests events.readonly, calendarlist.readonly, events.freebusy and app.created. PKCE, encrypted state, browser-bound cookies and scope verification remain in the common callback; its purpose selects the connection and return page. Selection is validated against that user's Calendar list. Connection IDs are rechecked around provider requests, preventing a reconnect from mixing accounts.

Private profile assistantThreads store 12 messages per workspace, bounded to five recent workspaces, plus quota and a single active-request lease. Chat request IDs/fingerprints support idempotent replies. Quota defaults to 40 attempts/day/account and 6/minute; failures count. Profile/catalog views omit the threads. Firestore browser rules deny these records along with all other direct database access.

The server creates only typed, existing-resource proposals: update_task, schedule_task and email_recap. Proposals expire after 24 hours. Task writes use the existing authorized workspace transaction, stale-version guard, dependency validation and activity/undo mechanism. Calendar approval rechecks workspace access, task version and availability; inserts a deterministic event ID into an app-created secondary calendar with no attendees. A creation claim prevents uncertain calendar-creation retries; ambiguous event outcomes stay uncertain. Google event changes after approval are not synchronized to tasks.

Email proposals open the existing fingerprinted recap preview and recipient review. Normalized recipients written in the question may prefill that form; the user can edit them. Actual SMTP results are matched by meeting, actor and send request ID before marking a proposal done. Viewer roles can use private chat/calendar blocks but cannot modify shared tasks or send recaps. All external provider operations remain outside Firestore transaction callbacks.

## Shared notebook notes

The server store hydrates a `notes` collection under each existing workspace. API-only Firebase access and membership checks apply. Notes have versioned text, date, optional project/meeting links and bounded photo filename metadata. Images are never stored in Firebase or local workspace records. Notes writes use optimistic versions; processing reads a canonical saved snapshot and checks that it was neither edited nor deleted before committing a meeting. Source note ID/version are retained on that meeting; deleting a note preserves historical meeting text and approved tasks.

Browser preprocessing uses Canvas with EXIF-aware browser decoding, explicit quarter-turn rotation/crop, JPEG output and byte checks (max 2,000,000 bytes). No photo reaches the server until Extract text. The server validates supported image signatures and bounded base64, claims the existing daily AI quota, calls Gemini Interactions with image content, and rechecks membership after the request. Extraction is a faithful text-only step, separate from meeting analysis. Notes are available to Shifty as up to eight relevant excerpts of 3000 characters each with canonical note source chips. Requests use the existing GEMINI_API_KEY and ASSISTANT_MODEL for scans; note processing uses GEMINI_MODEL through the current analyzer.

## v3.1.3 meeting identity and dial movement

Meeting identity hashes the normalized transcript and meeting date. Title, type, project, input filename and preparation do not affect it. Saved note snapshots additionally include note ID/version. The server checks both stored processing fingerprints and recomputed fingerprints from legacy meetings; existing IDs are preserved. Matching is workspace-scoped and is repeated inside the save transaction, returning cached=true/HTTP 200 if another request already committed. Serial cache hits skip quota/model calls; concurrent unseen submissions can still both call Gemini. Different transcripts/dates and different note versions remain separate; no fuzzy semantic merge or retroactive deletion occurs.

Proposals carry an immutable action key built from original normalized title, evidence, owner and deadline. IDs no longer depend on array order. Review checks that key and the proposal/task link before inserting a task; linking existing work leaves task fields and progress intact. Cached flags propagate through text/voice, Google and Notes callbacks to the reuse message.

The directional dial uses immediate pointer tracking with bounded travel, a 10px mouse dead zone (18px for touch), diagonal hysteresis and release-to-commit. Held movement has no transition; settled movement uses 180ms ease-out with no overshoot. Click/tap labels and keyboard selection remain available.

## v3.1.4 responsive Meet sources

GoogleMeet keeps the selected meeting separate from its fetched artifacts, so loading and lookup errors appear beside the selection. MeetSources renders the same source choices in a right panel for sufficiently wide containers and beneath the selected row for narrow/embedded views. CSS container queries use available panel width rather than device labels. The meeting list has independent desktop scrolling. Modal bounds and minmax form columns prevent horizontal overflow; a reference-counted page scroll lock restores prior overflow styles when the final dialog closes.

## Meeting deletion (v3.1.6)

Workspace responses include a SHA-256 `deletionVersion` derived from canonical meeting content and all linked tasks. `DELETE /api/meetings/:id` requires `{ confirm: true, expectedVersion }`. The transaction rechecks write permission, email reservations and the current revision, removes the meeting and linked tasks, prunes dependent-task/source references, invalidates relevant undo groups and records activity. No external files or calendar events are deleted. Task deletion retains its existing version guard, dependency block and five-minute undo.
