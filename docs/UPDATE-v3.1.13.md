# ShiftScript v3.1.13 — Shifty chats and history

Shifty now opens a fresh chat whenever you enter her tab, reload the page, return after signing out or reopen the browser. You can keep talking within the open chat. Use the history toggle to return to an earlier conversation and continue it.

## What changed

- Separate saved chats, titled from the first question and listed newest first. Empty chats do not clutter history.
- Toggleable history beside the conversation on large screens; a left drawer on phones, tablets and smaller desktop windows. Escape closes the drawer and returns focus to its opener.
- Search saved titles, continue a conversation or delete it. A selected chat has a full blue outline. Deleting a conversation leaves tasks, meetings and calendar blocks intact.
- Rounded suggestion pills, a workspace context chip, plus controls for a new chat and the existing full-height gradient loading button. Shifty's clay avatar, blue palette, reply formatting and source/review cards remain.
- Chat history is private to your account and the selected workspace. Shared workspace members cannot read your chats. Every reply uses current authorized tasks, meeting notes and your selected calendars.
- Your previous workspace conversation is automatically preserved as a saved chat when history loads. Older client sessions that are still processing finish before migration.
- Pending reply/navigation guards keep a response in the chat it belongs to. Unsent text prompts before switching chats. History refreshes when opened.

## Limits and behavior

A chat supports 50 question/reply pairs (100 stored messages). At the limit, Shifty asks you to start a new chat and retains the conversation. You can keep up to 200 saved chats across your account; delete an older chat to free space. Existing daily/minute question limits still apply. These limits do not require another AI key, and chat titles do not call the model.

An in-flight answer is saved by the server even if you leave the tab, provided the request completes successfully. Reopen history to find it. Chat saving requires the existing Firebase Admin configuration in hosted mode. Only legacy messages already retained by the old version can be migrated.

## Install on your Mac

Unzip **ShiftScript-v3.1.13.zip** in Downloads. In VS Code, open your existing **ShiftScript 2** folder, then Terminal → New Terminal. Run each command separately:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env*' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.1.13/" ./
npm ci
npm run check
```

After the checks pass:

```bash
git add .
git --no-pager diff --cached --name-only
git commit -m "Add private Shifty chat sessions and responsive history"
git push origin main
```

Review staged filenames before committing and keep private environment files and credentials out of Git. Wait for Vercel Ready and refresh your site. This update needs no new dependencies, environment variables, Google scopes or Firebase rules. The server automatically creates private chat documents using your existing Admin SDK access.

## Try it

1. Open Shifty and ask a question. Start another chat with the plus button.
2. Open history, select the first chat and ask a follow-up. Confirm both earlier replies and new replies remain there.
3. Leave Shifty or reload the site, then open Shifty again. You should see a fresh chat with your previous chats in history.
4. On mobile, open history and select a chat: the drawer closes and the conversation loads. Escape closes it when using a keyboard.
5. Delete a saved chat and confirm its tasks and meetings remain. Try reduced motion to check the static gradient presentation.

## Validation

138 unit/API tests, the final production build and five relevant browser suites pass. See `TESTING.md` and `check-results.txt` for the exact checks performed. Provider tests use fictional adapters; they do not send real mail or call live Google, Gemini or Firebase services. Physical-device Safari and the deployed network round trip remain acceptance checks. The existing large-bundle build warning remains.
