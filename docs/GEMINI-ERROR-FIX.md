# Gemini assistant error — diagnostic patch for ShiftScript v3.1.0

Calendar is shown as connected in the supplied screenshot. The assistant failed while requesting or parsing a Gemini response. The original generic message did not identify the underlying provider failure.

This patch distinguishes quota/rate limits, key/access rejection, unavailable models, rejected request formats, provider outages and invalid JSON. It accepts both SDK HTTP status conventions (`status` and `statusCode`). Request errors log only a numeric status, a safe model identifier and a category; they never print upstream messages, API keys, prompts, responses or calendar/meeting content.

The patch improves diagnosis. The screenshot alone does not establish whether your live failure is a quota, model-access, schema or response issue. It does not change your Gemini model, credentials, Google permissions, tasks or Calendar connection. No new dependency is required.

## Install

Extract **ShiftScript-Gemini-error-fix.zip** into Downloads. It contains only the changed server adapter, its regression tests, this guide and verification results. Run these commands one at a time in VS Code:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av "/Users/soko/Downloads/ShiftScript-Gemini-error-fix/" ./
npm run check
git add server/gemini.js tests/gemini-audio.test.js docs/GEMINI-ERROR-FIX.md docs/gemini-error-check-results.txt
git commit -m "Distinguish Gemini assistant request errors"
git push origin main
```

Wait for the linked Vercel deployment to finish, refresh Assistant, and send the question once.

## Find the underlying error

1. Open Vercel and select the ShiftScript project.
2. Open **Logs** (runtime/request logs, rather than the deployment's build log).
3. In ShiftScript, send the assistant question once. Return to Vercel and find the request to `/api/assistant/chat` at that time.
4. Open its function log entry. Look for **Gemini request failed:**. Copy only its `status`, `model` and `category`, together with the updated error message shown in ShiftScript.

| Message/category | Next step |
| --- | --- |
| Quota or rate limit / 429 | Check API-project/model limits in AI Studio; wait before retrying. A different key in the same project does not create extra project quota. |
| Assistant model unavailable / 404 | Check the server `ASSISTANT_MODEL` variable and model availability in that API project. Redeploy after changing a variable. |
| Key/project access / 401 or 403 | Check the server `GEMINI_API_KEY` and its API/project restrictions. |
| Request format / 400 or 422 | Share the safe log category (`response_schema`, `generation_config`, `model_access` or `provider_request`) so the adapter can be corrected. |
| Temporary provider outage / 500, 503 or 504 | Wait and retry once. |
| Incomplete/invalid JSON | Share the new on-screen message; the output format or generation limit needs investigation. |

If the generic message remains, confirm the newest Vercel deployment finished and that it includes the patched `server/gemini.js`. Do not repeatedly click Ask; failed attempts also consume quota.

Verification uses fictional SDK responses and mocked Calendar/email/model adapters. No live key, provider account or meeting content was used.
