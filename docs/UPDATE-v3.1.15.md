# ShiftScript 3.1.15 — fewer database reads

This release reduces Firestore reads while retaining the current tabs, clay artwork, search, dashboard totals, task filters, projects, workspace roles, board controls, meeting approval, source links, exports, notes, Google integrations and Shifty chats.

## What changed

- Membership checks read the workspace record instead of all eight subcollections. Current membership is checked for every request and again inside each write transaction.
- The existing two-minute background refresh first compares a durable workspace revision. If unchanged, it returns a small response and no workspace collections are read. All writes through ShiftScript update this revision in the same transaction. A normal manual Refresh always fetches a full snapshot; an hourly full background check also covers external edits made directly in Firebase Console.
- Common task, board, project, note, draft, agenda, invitation and review operations read only their required collections. Task dependency validation, board reordering and approval deduplication still have the full relevant task set. Complex meeting deletion retains its complete transaction to safely unlink related work.
- Activity and undo entries append without scanning their entire histories on each normal save. Transactional compaction runs periodically when these logs are next used. Activity reads return the latest 200 entries. The existing five-minute undo expiry and concurrent-edit checks remain.
- Committed task changes update React state directly after editing, creating, deleting, bulk updating or scheduling tasks. No follow-up whole-workspace GET is needed for those saves. Meeting deletion versions and activity are updated with the save response; newer client records are retained if a response arrives late.
- Repeated collection reads within a single request reuse an immutable snapshot only while the workspace revision remains unchanged. There is no shared cross-user or cross-request workspace cache. Membership records are always fetched afresh.
- The authenticated profile GET reuses the profile already fetched for that request. Reminders and member profiles request only the collections they need.
- Firestore RESOURCE_EXHAUSTED errors show an explicit database usage-limit message with HTTP 503, rather than an unexplained 500.
- The earlier Shifty request adjustment is included: a 45-second provider wait, 6,000 output/thinking tokens and low thinking effort for chat. No new AI key is required. Incomplete responses produce a clearer error and log safe response status/usage metadata. Live Gemini reliability still depends on provider access and limits.

## What stays visible

All current workspace records remain available for search, totals, exports, notes and task views. This release does not introduce shortened task lists or a new pagination interface. The first workspace load still fetches the complete visible snapshot; the savings come from avoiding unnecessary repeat scans and narrowing backend operations. It does not guarantee that every workload will fit the free quota.

No documents are moved and no manual Firebase migration is needed. Existing workspaces receive a revision field automatically on their first authorized load. No Google OAuth scopes, Firebase rules or environment variables need changing for the read optimization. Keep STORAGE_MODE=firebase in production.

## Install in your existing VS Code project

1. Keep a backup or commit any current local changes first. This package is based on v3.1.14 and includes the Shifty adjustment discussed in this conversation. Preserve any additional custom changes you made outside that version.
2. Extract ShiftScript-v3.1.15.zip. Copy its contents into your existing project folder, replacing the matching files. Retain your existing .env, .git folder, Firebase service-account secret and Vercel environment variables. The archive contains no live secrets, node_modules, local database or dist folder.
3. In the existing project terminal, run `npm ci` and then `npm run check`, one at a time.
4. Review the changes with `git status`. Stage the updated source and documentation, commit and push to your existing main branch. Vercel will build the new deployment from that push.
5. After the deployment is Ready, refresh the app. Confirm task editing, one board move, a teammate update and the manual Refresh button. An unchanged scheduled GET /api/workspace?since=... should return `unchanged: true`.

## Validation and limits

Counted-read tests use a Firestore simulator with transactional read-before-write checks and conflict retries, not live Firebase credentials or billing. They cover scope preservation, access revocation, revision initialization, quota-only writes, undo, task patches, duplicate processing, notes, agendas, projects and meeting deletion links. A real React/API browser test checks desktop and mobile conditional polling, direct task-save updates, changed-data refresh and manual refresh.

The first load, manual refresh, changed-workspace refresh and complex cross-record operations still read their needed data. Direct Firebase Console edits are visible on manual refresh or the hourly safety refresh. Temporary append-only history records are cleaned during periodic compaction. Already consumed quota is not restored by deploying this release.

See READ-SAVINGS.md and check-results.txt for measured fixture counts and completed verification.
