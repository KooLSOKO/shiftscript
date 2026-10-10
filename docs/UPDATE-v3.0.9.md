# ShiftScript v3.0.9 — compact completed tasks

Completed Board cards now show just the selection checkbox, task title and status. Priority, project, owner, due date and schedule are hidden from the card when you choose Completed. Changing the status back restores the normal card immediately.

Completed mobile task-list cards are also shorter: secondary fields and the disabled Done button are hidden. Desktop table columns remain aligned for comparison. Tap the title or Details to see the original task information, checklist, notes and meeting link. Completing a task does not delete any information.

The inline Add to Calendar button is removed from both the task list and Board cards. Calendar scheduling remains available by opening a task's details and choosing Add to Google Calendar; bulk scheduling also remains available.

Checkboxes and status controls remain usable in the compact layout, including on narrow phones. Existing permission rules, filters and bulk selection still apply. No environment changes or database migrations are needed.

## Install on your Mac

Unzip ShiftScript-v3.0.9.zip into Downloads. Open your existing project in VS Code and run each command **one at a time**:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.0.9/" ./
npm ci
npm run check
git add .
git commit -m "Compact completed tasks and simplify task controls"
git push origin main
```

The copy preserves your local configuration, repository and data. Your connected Vercel project will deploy the push.

## Check after deployment

1. Open Board, choose Completed on an active task and check that it becomes compact.
2. Tap its title to see all its original details and meeting source.
3. Change its status to To Do and check that the details return on the card.
4. Check Tasks on your phone: completed items are compact and no Calendar button appears on the list or Board.
5. If needed, open Task details to use Calendar scheduling.

## Verification

The production build, 69 unit/API tests and all nine browser suites pass. Browser checks cover completed cards at 320, 390, 768 and 1440 pixels, selection, task details, reopen/recomplete and persistence after reload. Calendar tests use its remaining Task details entry point. External Google, Firebase and mail services are simulated in automated tests.
