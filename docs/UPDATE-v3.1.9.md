# ShiftScript v3.1.9 — cleaner mobile controls and immediate board moves

## Mobile

The keyboard button is hidden on phone/tablet layouts (up to 850px). Board guidance, Search and Profile no longer display Mac/Windows key instructions on these layouts. The signup tutorial ends with a touch guide instead of a keyboard table or shortcut toggle. Replay it from Profile. Desktop retains the shortcut button, both operating-system labels and the saved preference.

## Meeting source selection

Desktop uses four large, directly clickable source cards: Text, Voice, Recent Google Meet and Previous meeting. No desktop dial dragging is required. At phone/tablet sizes, the original directional dial, touch gestures and mode buttons remain available. Guidance follows the layout and keeps the existing Earny blue styling.

## Escape and drafts

Escape closes the topmost normal popup. In a nested delete confirmation it closes the confirmation first, leaving the task editor open; another Escape closes the editor. A control that already handles Escape (such as cancelling a practice-board keyboard move) keeps its local behavior.

Closing a normal meeting draft stores the current text locally and queues its cloud save in the background, so Escape/X does not wait for that network request. Saves are serialized per account/workspace and preserve known versions when reopening quickly. An account guard prevents queued draft content being written under a different signed-in user. If local browser storage is unavailable, closure waits for a successful cloud save to protect the text. Existing guards around active processing, recording/import and destructive save/delete operations remain in place.

## Board responsiveness

Cards move or reorder immediately on drop/status selection. A **Saving…** badge shows that confirmation is pending. The move response returns the saved task records (including rare rank rebalances) and workspace activity, so a successful move no longer needs a second full-workspace request. Undo becomes available after confirmation.

Failures restore only the previewed position/status, preserving newer edits and deleted tasks. Stale or uncertain saves trigger reconciliation; an older reconciliation cannot overwrite a newer move. Server permissions, expected versions, dependencies and five-minute Undo remain enforced. One board move is confirmed at a time to avoid conflicting anchors; a slow network can keep the saving indicator visible even though the card has already moved.

## Install on your Mac

Unzip **ShiftScript-v3.1.9.zip** into Downloads. Open your existing **ShiftScript 2** project in VS Code, then run each command separately:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env*' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.1.9/" ./
npm ci
npm run check
git add .
git --no-pager diff --cached --name-only
git commit -m "Improve mobile controls, popup Escape and board responsiveness"
git push origin main
```

Continue after the checks pass, review the staged files, and wait for Vercel to report Ready. No new dependencies, scopes, environment variables or Firebase rules are needed.

## Acceptance walkthrough

1. On a phone, check that the keyboard button is gone. Replay the tutorial from Profile and confirm the final step shows touch guidance.
2. On desktop, create a meeting and click each source card. On mobile, try the directional dial.
3. Open a normal popup and press Escape. Open a task's delete confirmation and check that Escape closes one layer at a time.
4. Type a draft, close it and reopen it quickly. Check that your text is kept.
5. Move a task, then reorder it. The card should settle immediately, show Saving briefly and keep its saved position after refresh. Check Undo after confirmation.

## Verification

122 unit/API tests and the final production build pass. Four isolated browser suites pass: ux-controls-browser, board-shortcuts-browser, browser-smoke and deletion-browser. They cover immediate movement before server persistence, no full-workspace reload after a successful move, pending feedback, failure rollback/reconciliation/retry, Undo, saved reordering, nested Escape, immediate draft closure and reopening, desktop source cards, mobile directional touch gestures, touch-only tutorial/help, hidden mobile keyboard tools and 320/390/768/1440px layout bounds. Transcript/voice processing, review, duplicate reuse and deletion regressions also pass. The build retains its existing large-bundle warning.

Tests use fictional data and isolated/simulated services; no live mail, Google, Gemini or Firebase operations are performed. Physical-device Safari and a deployed Firebase/network round trip remain owner acceptance checks.
