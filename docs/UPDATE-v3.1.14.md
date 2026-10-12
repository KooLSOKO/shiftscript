# ShiftScript v3.1.14 — Google Meet batches and daily allowances

Google Meet now has two import modes: **One meeting** and **Batch · up to 3**. The existing single import and embedded New meeting flow remain available.

## Batch workflow

1. Open Google Meet and select **Batch · up to 3**.
2. Load recent meetings, open a meeting's sources and choose **Add to batch**. You can also add a Google Docs notes link.
3. Review each selected card. Set its own title, date, meeting type and project; expand Source text to inspect the notes/transcript. Remove an item to make room for another. Duplicate sources, including notes selected through their Docs link, are detected.
4. Click **Process 3 meetings** (or the count you selected). Each source is processed in its own request and saved as a separate meeting. The queue shows refreshing/processing/processed/error states and a progress bar.
5. Open each completed result to review its summary and proposed tasks. Processing does not approve tasks or send recap emails.

After finishing, use **Start another batch** to clear the queue while keeping the saved meetings. A failed source does not remove successful results. **Process remaining** retries unfinished sources only. **Stop after current meeting** lets the current request finish and leaves the remaining queue ready. Keep the Meet tab open while the batch runs; navigating away stops future queue requests. Already saved meetings remain in Meetings.

Previews are refreshed one at a time before processing, so large or expired queued previews can still be handled within the existing encrypted-vault limits. If the source text has changed, that item requires another review before analysis. No source text is truncated or combined. Each Google request retains existing account/workspace checks and existing processing duplicate protection.

Desktop cards have full-width selection borders and compact status chips. On mobile, cards stack, expanded fields are a single column, touch actions are at least 44px and choosing a source scrolls to the batch review. Source lists retain the existing desktop side panel/mobile inline layout. Reduced motion disables progress transitions.

## Daily defaults: 50

- **Shifty:** 50 questions per account per UTC day. The existing six-per-minute cap still applies.
- **Workspace AI processing:** 50 analysis/transcription requests per UTC day, shared by the workspace. Each batch meeting uses one analysis request; previews do not use the analysis allowance. Failed model attempts still count. Cached duplicates do not use another analysis.

These are application limits; raising them does not alter your Google/Gemini provider quota. The separate stored-meeting limit remains unchanged.

Existing environment settings override defaults. Update both your local `.env` and Vercel:

```dotenv
MAX_ASSISTANT_CHATS_PER_DAY=50
MAX_ANALYSES_PER_DAY=50
```

In Vercel, open the ShiftScript project → **Settings → Environment Variables**. Edit existing entries (or add them if absent), set both values to `50` for Production and Preview, then deploy the new commit. If edited after deployment, redeploy so the new values take effect. No new Google scopes, API keys or Firebase rules are required.

## Install on your Mac

Unzip **ShiftScript-v3.1.14.zip** into Downloads. Open your existing **ShiftScript 2** project in VS Code → Terminal → New Terminal. Run each command separately:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env*' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.1.14/" ./
npm ci
npm run check
```

Edit the two values above in your existing `.env` separately; the copy command preserves private configuration.

After checks pass and Vercel settings are updated:

```bash
git add .
git --no-pager diff --cached --name-only
git commit -m "Add Google Meet batch processing and 50-request daily defaults"
git push origin main
```

Review staged filenames before committing; private `.env` files and credentials must remain excluded. Wait for Vercel Ready and refresh ShiftScript.

## Verification

146 unit/API tests, the production build and four relevant browser suites pass. See `TESTING.md` and `check-results.txt` for the checks performed. Fictional provider adapters exercise the API and UI without sending real mail or calling live Google/Gemini/Firebase services. Physical-device Safari and deployed-provider acceptance remain owner checks. The existing large-bundle build warning remains.
