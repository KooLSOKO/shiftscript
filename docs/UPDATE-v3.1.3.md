# ShiftScript v3.1.3 — duplicate protection and a steadier meeting dial

## Duplicate meetings and tasks

- Processing the same transcript on the same meeting date reopens the saved meeting. Changing its title, type, project, filename or preparation no longer creates a second copy. Whitespace and letter-case differences are ignored.
- Approved or rejected proposals keep their decisions. Task edits, status, checklists, notes and source links stay unchanged. An **Already processed** message explains why the saved meeting opened.
- A cached repeat makes no additional AI call and consumes no additional analysis attempt. Concurrent first submissions can both call the provider, but only one meeting is saved; the other request returns the saved result.
- Matching stays inside the selected workspace. Older meetings are recognized from their stored transcript/date; existing IDs and links are preserved without a Firebase migration.
- Proposal IDs now follow the original action rather than its position in the AI response. Approval checks the original action key before creating a task, so equivalent proposals link to existing work instead of resetting it.
- This is exact normalized-content matching, not fuzzy semantic matching. A different transcript or meeting date is a new discussion. Note processing retains the source note ID/version so edited historical note snapshots remain distinct. Previously saved duplicates are not silently deleted.
- Reusing a meeting retains its saved metadata. Change its project from the existing meeting page if needed. For a follow-up, replace the copied transcript with the new discussion and set its actual date.

## Desktop directional selector

- The knob follows the pointer while held, without a delayed spring animation.
- Release commits the previewed mode and settles with a short ease-out transition. The blue clay appearance and visible directional movement remain.
- A smaller mouse dead zone makes short deliberate drags easier. Near-diagonal movement retains the current intent until the pointer clearly moves into another direction.
- Small accidental movements do not change the mode. Clickable labels, arrow keys, touch dragging, reduced motion and disabled states remain available.

## Install on your Mac

Extract **ShiftScript-v3.1.3.zip** into Downloads. In your existing VS Code project's terminal, run each command separately:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.env.*' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.1.3/" ./
npm ci
npm run check
git add .
git diff --cached --name-only
git commit -m "Prevent duplicate meeting tasks and improve directional selector"
git push origin main
```

Press **q** if the file list opens in a pager. Vercel deploys the push; refresh once it is Ready. Keep your current Firebase, Gemini and Google settings. No new API key, OAuth scope or database rule is needed.

## Try the fix

1. Process a transcript and approve a task. Change its status and add a progress note.
2. Submit that transcript again with the same date but a different title or meeting type.
3. Check the **Already processed** message, original review decisions and unchanged task count/progress.
4. Drag the dial toward each mode on desktop. It should follow your pointer, preview the mode and commit on release. Also try clicking the labels and using arrow keys.

See [check-results.txt](check-results.txt) for verification. Automated external providers are simulated; no live emails are sent.
