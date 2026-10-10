# ShiftScript v2.1 — Google Meet, Earny email and mobile

This is a complete source project for VS Code. Your existing Firebase workspace data stays in Firestore. Keep your private `.env` and existing Vercel variables. No OAuth client secret, API key, SMTP password or Firebase service-account credential is included in this ZIP.

## What changed

- A **Google Meet** screen: connect your Google account, browse accessible recent meetings, select generated Gemini notes or transcripts and review an import before processing.
- A **Google Docs notes-link fallback** for accounts that cannot list meetings through the Meet API.
- Speaker labels from Google's transcript entries and participant records. Missing identities remain **Unknown speaker** and are not assigned as named task owners.
- Source links and clear labels distinguishing Gemini notes, a Google document and a speaker-labelled transcript. Google notes are not presented as verbatim meeting speech.
- **Earny recap email through Zoho SMTP**: preview the summary, decisions, approved tasks and follow-ups; choose recipients; click Send. Pending/rejected task proposals are excluded. Follow-ups are separately labelled.
- Personal Google connections, encrypted server-side in a separate Firestore collection; browser-bound, expiring OAuth state and PKCE. Import previews are private to the signed-in user and selected workspace.
- Mobile bottom navigation, larger tap targets, 16 px form fields, task cards, collapsible extra filters, vertically stacked forms, safe-area spacing, scrollable dialogs and keyboard-accessible navigation.
- An original flat two-tone video icon matching ShiftScript's corporate blue icon set.

The earlier seven v2 improvements remain: private drafts, bulk task review, manual tasks/checklists/notes, filters/sorting, PDF/CSV reports, projects/shared workspaces and custom branded icons.

## 1. Update your Mac project

Extract the ZIP into Downloads. The folder inside is **ShiftScript-v2.1**. Open your existing project in VS Code and use **Terminal → New Terminal**.

Copy the new source into your existing Git project without deleting existing files:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' "/Users/soko/Downloads/ShiftScript-v2.1/" ./
npm ci
npm run check
```

Adjust the source path if your unzip tool creates an extra parent folder. Both source and destination must contain `package.json`. Do not replace your private `.env` with `.env.example`.

Optional browser checks on your Mac:

```bash
npx playwright install chromium
npm run test:ui
```

## 2. Confirm the Google Cloud settings

In your **ShiftScript** Google Cloud project:

1. Enable **Google Meet API** and **Google Docs API**.
2. Under **Google Auth Platform → Audience**, keep External / Testing for the pilot and add `sokovictor04@gmail.com` as a test user.
3. Under **Data Access**, add both scopes:

```text
https://www.googleapis.com/auth/meetings.space.readonly
https://www.googleapis.com/auth/documents.readonly
```

4. Under **Clients**, use your **Web application** client. Authorised JavaScript origin:

```text
https://shiftscript.earny.co.za
```

Authorised redirect URI, exactly:

```text
https://shiftscript.earny.co.za/api/google/callback
```

Use the ordinary web client. The AI-powered-agent checkbox is not needed for this integration. Docs read access covers the user's documents; the application only fetches the document/source the user selects. Keep test users limited to your pilot. Plan Google's consent verification before broader public rollout. Testing refresh tokens for these scopes expire after seven days, so reconnecting during the pilot is normal.

## 3. Add the server variables in Vercel

Open the ShiftScript project → **Settings → Environment Variables**. Select **Production** for your deployed site. Production is the environment; Config/Secret is the variable's type.

Keep the three Google variables already added. Add the encryption key and Zoho settings:

| Key | Value | Type |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Your Google web OAuth client ID | Config |
| `GOOGLE_CLIENT_SECRET` | Your Google web OAuth client secret | Secret |
| `GOOGLE_REDIRECT_URI` | `https://shiftscript.earny.co.za/api/google/callback` | Config |
| `INTEGRATION_ENCRYPTION_KEY` | A new 64-character hexadecimal key generated below | Secret |
| `SMTP_HOST` | Exact outgoing SMTP hostname shown in your Zoho account | Config |
| `SMTP_PORT` | `465` for SSL, or `587` for STARTTLS | Config |
| `SMTP_USER` | Your existing Earny Zoho mailbox's full email address | Config |
| `SMTP_PASSWORD` | Zoho app password for that mailbox when required by 2FA/account policy | Secret |
| `SMTP_FROM` | Optional: an authorised sending alias; omit to use `SMTP_USER` | Config |

Generate the encryption key once in your VS Code terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output privately into Vercel. Keep it stable and store it safely: replacing it makes existing encrypted Google connections unreadable. Do not commit it or prefix it with `VITE_`.

**Use the Zoho mailbox, not `sokovictor04@gmail.com`, for SMTP.** Your Gmail address is for Google Meet. The Earny address must actually exist in Zoho. The sender must match that mailbox or an authorised alias. Zoho's SMTP hostname depends on its data centre and account plan; use the value in your account rather than guessing. Your plan must include SMTP access. Do not change Earny's MX records or the ShiftScript CNAME for this feature.

Keep these existing settings:

```text
STORAGE_MODE=firebase
AI_PROVIDER=gemini
FIREBASE_PROJECT_ID=shiftscriptza
```

Keep your existing `GEMINI_API_KEY`, `GEMINI_MODEL`, Firebase Admin credential and signup/allowlist settings. AI Pro in the Google app and Gemini API usage have separate entitlements/quotas. Do not assume AI Pro pays for API requests. Use the API model/key already configured for your available tier.

Firebase Console → **Authentication → Settings → Authorised domains** must include `shiftscript.earny.co.za`. Firestore must be enabled and the server Admin credential must have access. The existing `firestore.rules` denies browser access to all data, including `privateIntegrations`; apply these rules if your project's current rules are different. Admin SDK routes handle access checks.

## 4. Push to GitHub and deploy

In the same VS Code terminal:

```bash
git status
git add .
git diff --cached --name-only
git commit -m "Add Google Meet import, Earny recaps and mobile improvements"
git push origin main
```

Before committing, confirm the staged filenames do not include `.env`, private credential JSON or `.data`. The included `.gitignore` excludes them. Never commit secrets.

Vercel should build the linked GitHub push automatically. If you add/change variables after a deployment, redeploy so the new values are applied. Open the **Production** deployment at `https://shiftscript.earny.co.za`; use that domain for Connect Google so the OAuth cookie and callback use the same origin.

## 5. First live test

1. Sign into ShiftScript using Firebase.
2. Open **Google Meet → Connect Google**. Select your test-user Google account and grant Meet and Docs read access.
3. Host an eligible Google Meet and enable **Take notes for me**. Meet notifies participants. Let the meeting end and wait for the notes document to be generated.
4. In ShiftScript, try **Load recent meetings → View sources → Preview**. If the account/API cannot list meetings, paste the Google Docs notes link into **Have the notes link?** instead.
5. Review the source, set the meeting title/date/type/project and select **Process meeting**. Confirm the proposed owners/deadlines, then approve tasks.
6. Open **Email recap**. Enter an address you choose for the test, inspect the preview and click **Send recap**. Verify receipt in that mailbox. No automatic email is sent after processing.
7. Repeat on a phone: open a task card, change its status, expand/collapse filters and review an import.

## Limits and honest expectations

- This imports already-generated Google artifacts. It does not join calls as a bot, record live audio, activate note-taking automatically or run background polling/webhooks.
- Google AI Pro provides eligible hosted-meeting note-taking; full transcript availability is separate. Notes do not guarantee full speaker attribution. The personal Gmail account's Meet REST access has not been verified live, so the Docs-link route is included.
- Meet transcript entries have a limited retention window. Import promptly while Google makes them accessible.
- Imports support 40–15,000 characters. Oversized sources are rejected rather than silently shortened; paste a shorter section in New meeting or use a shorter notes document.
- Previews expire after 15 minutes. They are scoped to the user, connection and workspace. Disconnect clears saved tokens and previews, but does not delete previously shared meetings/tasks or revoke Google's consent globally. Google account security settings can revoke consent.
- The existing AI-request limit applies. Email sending is limited to 10 requests per workspace/day (UTC), 10 recipients per request and 100 send-history entries per meeting.
- SMTP acceptance does not guarantee inbox delivery. Retry protection prevents the same send ID from being sent twice. If the outcome is uncertain, check recipients/Zoho mail logs before starting a new send. No automatic retry occurs.
- Members with write access can import/share sources and send recaps. Viewers can read/export but cannot import or send workspace recaps.
- The test suite uses mocked Google/Gemini/SMTP. Live consent, personal-account Meet eligibility, Firebase IAM and Zoho delivery still need your deployment check.

## Troubleshooting

| Message / symptom | Check |
| --- | --- |
| Google connection is not configured | All four Google/encryption variables exist in the deployed environment; redeploy |
| `redirect_uri_mismatch` | Client type Web application; exact callback URL in Google Cloud and `GOOGLE_REDIRECT_URI`; start on the same ShiftScript domain |
| Google connection expired | Disconnect and reconnect; Testing tokens expire after seven days |
| Google access denied / no meetings | Test user/scopes/APIs, selected account and meeting eligibility; try your notes document link |
| Document cannot be found/read | Open it with the connected Google account; check sharing and the Docs API |
| File is still preparing | Wait for Google to finish generating it |
| Preview expired / another workspace | Re-import after switching workspace or reconnecting |
| Recap changed since preview | Close/reopen Email recap to review the latest approved tasks |
| Earny email setup required | Zoho SMTP variables, supported plan, app password and authorised sender; redeploy |
| Email result uncertain | Check recipients and Zoho logs before retrying; do not repeatedly click Send |

## Primary references

- Google OAuth web server flow: https://developers.google.com/identity/protocols/oauth2/web-server
- Google OAuth testing tokens: https://developers.google.com/identity/protocols/oauth2
- Meet artifacts: https://developers.google.com/workspace/meet/api/guides/artifacts
- Meet Node quickstart/account prerequisites: https://developers.google.com/workspace/meet/api/quickstart/nodejs
- Google Docs tabs: https://developers.google.com/workspace/docs/api/how-tos/tabs
- Zoho SMTP settings: https://www.zoho.com/mail/help/zoho-smtp.html
- Google AI Pro note-taking: https://blog.google/products-and-platforms/products/workspace/take-notes-for-me/
