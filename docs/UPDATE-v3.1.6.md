# ShiftScript v3.1.6 — delete meetings and tasks

## What changed

- Open a task and choose **Delete task** near the top of Task details. Confirm in the app. The workspace's existing **Undo** option restores the task for five minutes, including its original proposal link. If another task depends on it, first remove that dependency.
- Open a meeting from **Meetings** and choose **Delete meeting**. The confirmation shows the linked-task count. Confirming permanently removes the meeting, transcript, summary, proposals and every linked task for everyone in the workspace. This meeting deletion cannot be undone.
- Dependencies on the removed tasks are cleared from other tasks. Saved notes and follow-up agendas/meetings stay available, with obsolete meeting links removed. Existing Google documents and Calendar events stay in Google.
- Owners and Members can delete; Viewers cannot. The server rechecks membership and permissions inside the transaction. If the meeting or its linked tasks changed after loading, refresh and review again. A recap email still being sent blocks meeting deletion until its result is saved.
- Activity records who deleted the meeting. Earlier undo groups touching removed work are invalidated so they cannot restore orphaned tasks. All deletion operations use the existing Firebase/local storage paths; no new environment variables or Firebase rules are required.
- Buttons have at least 44px height. Confirmations default keyboard focus to Cancel and fit narrow mobile screens.

## Install in your existing Mac project

Extract **ShiftScript-v3.1.6.zip** into Downloads. Keep your existing VS Code project open and run each command separately:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.env.*' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.1.6/" ./
npm ci
npm run check
git add .
git --no-pager diff --cached --name-only
git commit -m "Add meeting deletion and clearer task delete controls"
git push origin main
```

Wait for the connected Vercel deployment to become Ready, then refresh the website. Existing credentials and database contents are preserved while copying the code.

## Quick acceptance check

Use a disposable test meeting. Approve a proposal, open its task, cancel deletion once, then delete it and use Undo. From the meeting page, cancel Delete meeting once; confirm that the linked-task count is correct, then confirm deletion. Meeting history and the tracker should refresh automatically. Repeat on mobile.

## Verification

110 unit/API tests pass; the production build passes. The isolated browser suite passes at 320, 390, 768 and 1440 pixels, covering task cancellation/deletion/undo, meeting cancellation/cascade deletion, keyboard focus, 44px minimum touch targets, automatic history refresh and modal viewport bounds. API tests cover stale meeting/task changes, permission/workspace isolation, explicit confirmation, sending-email conflicts, persisted deletion, source/dependency cleanup and undo invalidation.

External services use isolated local/simulated adapters in tests. Physical-device Safari and a deployed Firebase round trip remain acceptance checks.
