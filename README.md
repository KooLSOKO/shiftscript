# Latest update

See **[UPDATE-v3.0.5](docs/UPDATE-v3.0.5.md)** for larger clickable dashboard cards, consistent site styling and Mac deployment commands.

See **[UPDATE-v3.0.2](docs/UPDATE-v3.0.2.md)** for the public landing page, the `/app` workspace entry and Mac installation instructions.

See **[UPDATE-v3.0.1](docs/UPDATE-v3.0.1.md)** for public policies, About/contact pages, Google sign-in, Firebase setup and the OAuth branding URLs.

See **[UPDATE-v3](docs/UPDATE-v3.md)** for all seven productivity features, QoL updates, Mac installation and optional daily Earny reminders. The new reminder function requires Fluid compute on Vercel. See [UPDATE-v2.4](docs/UPDATE-v2.4.md) for Google Calendar task scheduling and deployment instructions. [UPDATE-v2.3.1](docs/UPDATE-v2.3.1.md) covers name-aware My tasks. [UPDATE-v2.3](docs/UPDATE-v2.3.md) covers the artwork, SEO, mobile navigation and profiles.

# ShiftScript v3.0.5

A corporate blue meeting workspace: turn a transcript or voice recording into structured notes and proposed tasks, review the commitments, then track the work with your team.

**React 19 · Tailwind CSS 4 · Node.js/Express · Firebase Auth/Firestore · Gemini**

## Existing project: start here

Read **[docs/UPDATE-v3.md](docs/UPDATE-v3.md)** for the complete v3 update, Mac deployment commands and reminder setup. For Google Meet and Zoho setup, see **[docs/UPDATE-v2.1.md](docs/UPDATE-v2.1.md)**. This is a complete source project. Your Firebase Web configuration is included; private credentials are excluded.

## New project in VS Code

Open the extracted **ShiftScript-v3.0.1** folder, the one containing `package.json`. Use Node.js **22.12+** (Node 22 or 24).

```bash
npm ci
cp .env.example .env
npm run dev
```

Open http://localhost:5173 for the public home, or http://localhost:5173/app for the workspace. Windows PowerShell: use `Copy-Item .env.example .env`. The command starts the React frontend and Node API together. `npm run preview` previews built frontend files only; it does not start the API.

The default is a fictional sample with local storage and no paid/live API calls. **New meeting → Load sample → Process transcript**. Sample mode accepts the included sample transcript only. Local data lives in `.data/workspace.json`; local mode is blocked in production.

## New in v2.1

Google Meet/Docs notes imports, speaker-labelled transcripts when available, optional Earny recap emails through Zoho, and improved mobile navigation, task cards, touch controls and filters. Read [docs/UPDATE-v2.1.md](docs/UPDATE-v2.1.md) for the required server variables and live test steps. The integration tests use mocked services; your personal Google account and Zoho delivery still need a live check.

## New in v3.0

Notifications and optional daily Earny digests; saved single/bulk Calendar schedules; editable profiles/photos/aliases; confirmed owner suggestions; saved meeting agendas and follow-through comparisons; workspace activity; task dependencies. Quick dates, bulk edits, five-minute undo, personal saved views, workspace search, mobile actions and dashboard attention shortcuts are included. Follow [UPDATE-v3](docs/UPDATE-v3.md) before deploying the reminder function.

## What is included

- Editable pasted / `.txt` transcripts, audio upload and microphone recording.
- Structured meeting summaries, discussion points, decisions, follow-ups and evidence-linked action proposals.
- Individual or bulk approval/rejection, with editable owners, dates and priorities. Nothing is approved automatically.
- Private autosaved meeting drafts and browser recovery copies.
- Manual tasks, checklists, progress updates and five task statuses.
- Dashboard, task table and board; search plus owner/project/priority/status/source/due-date filters and sorting.
- Filtered PDF/CSV task exports and PDF/JSON meeting exports.
- Projects, multiple workspaces, email-bound invitation links, Owner/Member/Viewer roles.
- Signup, full names, sign-in, password reset and email verification for invitations.
- 46 original native SVG icons, corporate cobalt, vivid urgency badges and reduced-motion-aware animations.

## Connect Gemini

Use a private server key from [Google AI Studio](https://aistudio.google.com/). Put it in `.env` locally or server environment variables on Vercel:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=your-private-gemini-key
GEMINI_MODEL=gemini-3.5-flash-lite
MAX_ANALYSES_PER_DAY=20
```

Restart the development server after changes. The existing configurable model is retained. Check model availability and your current free-tier eligibility/quotas in AI Studio; a free tier is not unlimited. See [Google's model documentation](https://ai.google.dev/gemini-api/docs/models) and [pricing](https://ai.google.dev/gemini-api/docs/pricing).

The key stays on the Node server. Do not use `VITE_GEMINI_API_KEY`. Transcription and analysis each consume one quota attempt; failures count too. The default quota is shared by the workspace and resets at UTC midnight. Already saved identical meetings return cached results. Use a new title to intentionally analyse a previously saved sample again with Gemini.

## Voice and transcripts

Text: paste or upload `.txt`, maximum 100,000 characters (file limit 400 KB). Google notes/transcript imports and private drafts use the same text limit. Choose meeting date/type and an optional project. Voice transcription retains its separate 2.5 MB recording and 15,000-character output limits.

Audio: upload MP3, WAV, M4A, AAC, OGG, FLAC or WebM, or **Record voice** on localhost/HTTPS. Recording stops after five minutes; files must be **2.5 MB or smaller**. Trim/compress longer recordings. Gemini transcribes first; you correct speaker names and unclear words, then process the text for tasks. Raw audio is not persisted. Unidentified speaker labels do not establish a real person's identity.

Use fictional or approved meeting content. Review provider data terms before sending sensitive recordings/transcripts. Google imports use generated notes/transcript artifacts; real-time recording bots are outside this release.

## Connect Firebase

Your public Web config for `shiftscriptza` is in `src/firebase-config.js`. Auth and Firestore are used; Analytics and raw-audio Storage uploads are not initialized.

1. [Firebase Console](https://console.firebase.google.com/) → your project → **Authentication → Email/Password** enabled.
2. Create the default **Firestore Database**, Native mode, production rules.
3. Authentication → Settings → Authorized domains: add `localhost` and your Vercel domain.
4. Publish `firestore.rules`. Direct browser database access is denied; the authenticated Node API uses the Admin SDK.
5. Generate Admin credentials through Project settings → Service accounts. Keep the file outside this project.

Locally:

```dotenv
STORAGE_MODE=firebase
FIREBASE_PROJECT_ID=shiftscriptza
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
FIREBASE_SERVICE_ACCOUNT_JSON=
PUBLIC_SIGNUP_ENABLED=true
ALLOWED_EMAILS=
```

Use a full path; `~` is not expanded in `.env`. On Vercel, leave `GOOGLE_APPLICATION_CREDENTIALS` empty and put the complete Admin JSON into `FIREBASE_SERVICE_ACCOUNT_JSON`. Keep its JSON valid, including the private key's escaped newlines.

`PUBLIC_SIGNUP_ENABLED=true` allows teammates to register. Workspace membership still controls access. With `false`, `ALLOWED_EMAILS` restricts which accounts can use the hosted app; include all intended teammates if you use private mode.

**Shared workspaces:** Owners can create and email an invitation from Earny's configured Zoho mailbox, resend it, or copy its link. New invitations expire after 7 days. The recipient must sign in using the invited email and verify it before joining. Invitations appear under **Switch workspace**. Enable `PUBLIC_SIGNUP_ENABLED=true` for new teammates to register, or keep private mode and add their email to `ALLOWED_EMAILS` if they already have an account. Set `APP_URL` to your canonical ShiftScript URL for email links; it falls back to the origin of `GOOGLE_REDIRECT_URI` when omitted.

Existing UID workspace records stay where they are. Owner membership metadata upgrades automatically. Projects and drafts use new subcollections; no document moves are required.

## GitHub and Vercel

Commit the complete source and `package-lock.json`, then push to your existing repository. `.gitignore` excludes `.env`, private credentials, data, dependencies and build output. Use [docs/UPDATE-v2.md](docs/UPDATE-v2.md) for the exact commands for your Mac.

Import/connect the repository to Vercel. Framework **Vite**, install **`npm ci`**, build **`npm run build`**, output **`dist`**. Root Directory must contain `package.json`, `index.html` and `src/main.jsx`. Existing `vercel.json` routes `/api/*` to the Node function and preserves static fonts/assets.

Set server variables `STORAGE_MODE=firebase`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `MAX_ANALYSES_PER_DAY` and `PUBLIC_SIGNUP_ENABLED=true`. The provided Firebase Web config works as-is; optional `VITE_FIREBASE_*` overrides must be present at build time. Add your actual deployed domain to Firebase authorized domains. Redeploy after editing variables.

## Verify and understand the app

```bash
npm run check
npx playwright install chromium
npm run test:ui
```

Tests use temporary data and simulated auth/model results; they do not contact live Firebase or Gemini. Live project credentials, provider quotas, email delivery and Vercel settings need a deployment check in your account.

See [architecture](docs/ARCHITECTURE.md), [assets](docs/ASSETS.md), [testing](docs/TESTING.md) and [demo](docs/DEMO.md).
