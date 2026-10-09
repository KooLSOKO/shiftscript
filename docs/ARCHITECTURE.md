# ShiftScript v2 architecture

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

Invitations bind an exact normalized email and require `email_verified` in the verified ID token. Links alone grant no access. Owners can revoke invitations. Links are copied/shared manually, with no automatic email sender or scheduled expiration. Firebase verification/reset emails send on explicit user action. Personal use does not require email verification; joining does.

Draft responses contain only the actor's draft. Recovery keys include UID/workspace ID. Saves/deletes compare expected versions; failed saves keep a local copy. Member removal deletes their workspace draft. Task editors supply `expectedUpdatedAt`; stale saves fail. Moving meetings updates approved tasks' projects and timestamps too.

## Transactions and limits

Firestore transactions read the root/subcollections before writes, diff changed records and merge metadata/quota. Bulk review applies a whole selected batch atomically. Repeated review creates no duplicate tasks; manual create retries reuse a UUID-derived ID. Local writes serialize in one Node process and use atomic file rename.

Limits: 20 members plus pending invitations per workspace, 20 memberships per user, 50 projects, 50 meetings, 250 tasks, 20 proposals per meeting, 30 checklist steps and 50 progress notes per task. The quota is 20 combined analysis/transcription attempts per workspace/day by default, resetting at UTC midnight; failures count.

Catalog queries use default single-field array indexes on `workspace.memberUids` and `workspace.inviteEmails`. Reads/transactions load a bounded workspace. Larger deployments need pagination, narrower transactions and job locking. Concurrent unseen duplicate meetings may both call Gemini before one record wins. Workspace-creation membership limits are a soft precheck under simultaneous requests.

No realtime subscriptions, presence, scheduled reminders, automatic invitation delivery, workspace deletion, owner transfer or external meeting connectors are included. Explicit refresh loads colleagues' changes.

## Input and exports

Audio signature/base64 validation permits supported formats, at most 2.5 MB decoded. The JSON body limit is 3.5 MB. Transcripts allow 15,000 characters. Dates use ISO calendar strings; overdue comparisons use Africa/Johannesburg. Timestamps use UTC.

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
