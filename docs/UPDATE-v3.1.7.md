# ShiftScript v3.1.7 — faster controls and a board you can move

## New controls

The keyboard button in the top bar opens **Shortcuts and controls**, including separate Mac and Windows columns. Replay the four-step workspace tutorial from that panel or from Profile.

| Action | Mac | Windows |
| --- | --- | --- |
| Search meetings and tasks | Command + K | Ctrl + K |
| New meeting | N | N |
| New task | T | T |
| Board | B | B |
| Meeting history | M | M |
| Overview | D | D |
| Ask Shifty | A | A |
| Refresh workspace data | R | R |
| Undo an available task change | Command + Z | Ctrl + Z |
| Shortcut guide | Command + / or ? | Ctrl + / or ? |

Single letters do not fire while typing in inputs, editable text, or dialogs. Repeated keys and IME composition are ignored. Owners/Members get creation and Undo controls; Viewers retain read-only navigation and search. Undo uses the existing five-minute task undo, and never intercepts text-field Undo.

## Board movement

All five existing columns remain: To Do, In Progress, Blocked, In Review, Completed.

- Mouse or touch: drag the blue grab handle. Drop over a card's top/bottom half to place before/after it, or in a column's empty space to place at the end. Edge scrolling helps reach off-screen cards and columns.
- Keyboard: focus the handle using Tab, then press Space or Enter to pick up. Left/Right chooses a column, Up/Down chooses a position, Space/Enter drops, Escape cancels.
- The Status menu provides another way to move to a column, including on phones.
- The shortcut table fits small screens; header controls wrap on narrow phones instead of overflowing, while retaining 44px touch targets.
- Order is saved in the workspace and survives refresh. It is shared with teammates and independent of the task-list sort. Existing filters still apply to the board. Tasks retain their meeting/proposal links, owners, dates, notes and checklists.
- The server rechecks membership, source/destination task versions and dependencies. A blocked task cannot bypass completion rules by dragging. Normal moves participate in five-minute Undo. A rare full-column rank rebalance affecting more than 25 tasks has no Undo token, matching the existing bulk-undo limit.

## First-signup tutorial

After a signed-in account creates or joins its first available workspace, a four-step guide explains navigation, meeting processing and approval, board controls and shortcuts for both operating systems. Existing accounts without a tutorial marker also receive the guide once after updating. Tutorial completion/skip is saved privately to the account and follows it across devices. Practice cards only exist in the tutorial, so they cannot change real work. Local demo mode exposes manual replay rather than pretending to create a signed-up account.

If progress cannot be saved, the guide displays an error and offers **Continue for now**. It can appear again on the next visit until completion is saved.

## Opening animation

The existing blue paint transition now plays on every workspace page open or refresh, in addition to sign-in/signup. Returning from browser history also replays it. It keeps a Skip button, supports Escape, bounds its hold during slow/failed API loading, and skips motion for a reduced-motion preference. Normal tab navigation inside the app stays quick.

## Install on your Mac

Extract **ShiftScript-v3.1.7.zip** into Downloads. Run each command separately in the terminal of your existing VS Code project:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.env.*' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.1.7/" ./
npm ci
npm run check
git add .
git --no-pager diff --cached --name-only
git commit -m "Add saved board movement, shortcuts and workspace tutorial"
git push origin main
```

Wait for Vercel's deployment to become Ready, then refresh ShiftScript. No new environment variables, dependencies or Firebase rules are needed. Existing credentials and data remain in place.

## Acceptance walkthrough

1. Refresh the workspace and check the blue transition/Skip button.
2. Use the keyboard button to replay the tutorial. Move a practice card, then check Mac and Windows labels.
3. Open Board. Move a real disposable task to another column, reorder it, and refresh to check persistence.
4. Focus its handle and try keyboard movement/cancel. Check Ctrl/Command Z when an Undo token exists.
5. On a phone, drag using the handle or use Status. Confirm ordinary typing does not open screens.

## Verification

116 unit/API tests pass; the final production build passes. Desktop browser checks cover actual signup, tutorial progress, Mac/Windows shortcuts, pointer status changes/reordering, keyboard movement/cancellation, Undo, saved order and opening replay. Mobile/tablet checks at 320, 390 and 768 pixels cover tutorial/help bounds, native touch movement, horizontal edge scrolling and reduced-motion launch. The deletion regression suite also passes at 320, 390, 768 and 1440 pixels.

The production build retains the existing large-bundle warning; it does not fail the build.

Services are isolated/simulated during tests. Physical-device Safari and a deployed Firebase round trip remain owner acceptance checks.
