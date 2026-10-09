# ShiftScript · Blue edition

A meeting workspace that turns a transcript or voice recording into meeting notes and proposed tasks. Review and approve each task before it reaches your tracker.

**React 19 · Tailwind CSS 4 · Node.js/Express · Firebase Auth/Firestore · Gemini**

This update adds a corporate cobalt palette, original vector icons, an Earny-inspired illustration, vivid priority badges, subtle animations and voice input. Your supplied Firebase **Web configuration is already included**. Firebase services and backend credentials still need setup in your console.

## 1. Open in VS Code

1. Extract `ShiftScript-blue-gemini.zip`. Open the **ShiftScript** folder containing `package.json` in VS Code.
2. Install Node.js **22.12 or later**. Open **Terminal → New Terminal**.
3. Run:

```bash
npm ci
cp .env.example .env
npm run dev
```

Windows PowerShell: use `Copy-Item .env.example .env` instead of `cp`.

4. Open **http://localhost:5173**. Keep the terminal running; this starts React and the Node API.
5. Try **New meeting → Load sample → Process transcript**. Review, edit and approve a task. Open the tracker, change its status and add a progress update. Refresh to check persistence.

The initial configuration uses `STORAGE_MODE=local` and `AI_PROVIDER=sample`. The sample is a labelled, fixed fictional example, with no model call or Firebase connection. It accepts only `examples/meeting.txt`; enable Gemini for your own transcripts. Local data is saved in `.data/workspace.json`. `npm run preview` serves frontend build files only; it does not start the API.

## 2. Enable Gemini

The default model is **`gemini-3.5-flash-lite`**, which supports text, audio input and structured JSON. Google lists a free tier for this model. Free access depends on project eligibility, region and current quotas; it is not unlimited. Check your project's limits in [Google AI Studio](https://aistudio.google.com/). See [model capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) and [pricing](https://ai.google.dev/gemini-api/docs/pricing).

**Replace the Gemini key shared in chat**, then put the replacement only in your local `.env` or Vercel server settings. No private key is included in this ZIP.

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=your-new-gemini-key
GEMINI_MODEL=gemini-3.5-flash-lite
MAX_ANALYSES_PER_DAY=20
```

Restart `npm run dev`. You can keep local storage while using live Gemini. The Node server calls Gemini's Interactions API with structured JSON and `store:false`; the key stays on the server. Never name the variable `VITE_GEMINI_API_KEY`.

Transcription and analysis are separate requests. Each consumes one app quota attempt; failed attempts count too. The app limit resets at UTC midnight and does not override Google's rate limits. Identical saved meetings return cached results without another analysis call. After switching from sample to live mode, change the sample title (e.g. “Dashboard review — live”) to avoid retrieving its saved fixture.

Google's free-tier data terms may permit content to be used to improve its products. Use fictional or approved recordings/transcripts, and review the provider's terms before submitting sensitive meetings.

## 3. Use a transcript or voice recording

**Transcript:** paste text or upload a `.txt` file. Maximum 15,000 characters. Add a title, date and type, then choose **Process transcript**.

**Voice:** choose an MP3, WAV, M4A, AAC, OGG, FLAC or WebM file, or click **Record voice**. Microphone recording needs permission and localhost or HTTPS; it stops automatically after five minutes. Files must be **2.5 MB or smaller**, including uploaded recordings. Trim/compress longer audio before uploading.

1. Preview the recording and choose **Transcribe to text**.
2. Check the editable transcript. Correct speaker names and unclear words; speaker labels alone do not establish a person's name.
3. Choose **Process transcript**, then review the proposed tasks.

Gemini is required for transcription. Audio is sent to the server and Gemini; the app does **not** persist raw audio. It saves the reviewed transcript and source filename with the meeting. Recording is captured first and transcribed afterwards; this is not streaming speech recognition or a Meet/Teams/Zoom integration. Each request has a 45-second model timeout; use short, clear recordings.

## 4. Finish Firebase setup

Keep Firebase; Supabase is unnecessary for this project. `src/firebase-config.js` contains your supplied public Web configuration for **shiftscriptza**, including the storage bucket and measurement ID. `.env.example` includes optional Web config overrides. Analytics and Firebase Storage uploads are not initialized; Auth and Firestore are the services used here.

### Firebase Console

1. Open [Firebase Console](https://console.firebase.google.com/) → **shiftscriptza**.
2. **Firestore Database → Create database**: Standard edition, Native mode, default database `(default)`, production rules, preferred region.
3. **Authentication → Sign-in method**: enable **Email/Password**.
4. **Authentication → Users → Add user**: create your own demo account. This app has no public sign-up flow.
5. **Authentication → Settings → Authorized domains**: add `localhost`, and later your Vercel domain.
6. **Project settings → Service accounts**: generate a fresh Admin SDK private key. Keep the JSON file outside the extracted project, e.g. `~/Documents/ShiftScript-secrets/service-account.json`. Revoke any previously exposed private service-account key through Google Cloud IAM.
7. Publish `firestore.rules` in Firestore's **Rules** tab. Browser database access is denied; the authenticated Node server accesses UID-scoped records through the Admin SDK.

### Local .env

Keep your Gemini variables, then change:

```dotenv
STORAGE_MODE=firebase
FIREBASE_PROJECT_ID=shiftscriptza
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
FIREBASE_SERVICE_ACCOUNT_JSON=
ALLOWED_EMAILS=your-email@example.com
```

Use your Firebase user's actual email in `ALLOWED_EMAILS`. On Windows use a path such as `C:/Users/you/Documents/ShiftScript-secrets/service-account.json`. On macOS use `/Users/you/...`. `~` is not expanded inside `.env`. Leave `FIREBASE_SERVICE_ACCOUNT_JSON` empty locally when using the file path.

Restart and sign in. Each user gets a separate private workspace. Local demo data is not automatically copied to Firestore. You can set `AI_PROVIDER=sample` with Firebase to test persistence without model calls. No more Web configuration is needed from you; passwords and private keys should be configured locally rather than sent in chat.

## 5. Push to GitHub

Create an empty repository named `shiftscript` at [github.com/new](https://github.com/new). Leave its README and gitignore options unchecked. From the extracted project folder:

```bash
git init
git add .
git status
git commit -m "Build ShiftScript blue edition with Gemini voice input"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/shiftscript.git
git push -u origin main
```

Replace `YOUR-USERNAME`. If Git asks for your identity, set `git config user.name "Your Name"` and `git config user.email "you@example.com"`, then retry. Authenticate when prompted, or use VS Code Source Control → **Publish to GitHub**.

Check `git status` before committing: `.env`, `.data`, credentials and `node_modules` must be absent. `.gitignore` excludes them; `.env.example` and the public Firebase config are safe to commit. Keep service-account JSON outside the repository.

## 6. Deploy to Vercel

The repository deploys frontend and Node API together. `vercel.json` builds Vite to `dist/` and routes `/api/*` to `api/index.js`. Firestore provides persistent data; local file mode is deliberately blocked on Vercel.

1. In [Vercel](https://vercel.com/), choose **Add New → Project** and import the GitHub repository.
2. Root: the folder containing `package.json`. Preset: **Vite**. Install: **npm ci**. Build: **npm run build**. Output: **dist**. Node: 22 or 24.
3. Add these environment variables before deploying:

| Variable | Value |
| --- | --- |
| `STORAGE_MODE` | `firebase` |
| `AI_PROVIDER` | `gemini`, or `sample` for the fixed demo |
| `GEMINI_API_KEY` | Fresh private Gemini key |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| `MAX_ANALYSES_PER_DAY` | `20` |
| `FIREBASE_PROJECT_ID` | `shiftscriptza` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Entire fresh service-account JSON object |
| `ALLOWED_EMAILS` | Your Firebase account email; comma-separate additional accounts |

The Web configuration is already in the source, so `VITE_FIREBASE_*` overrides are optional. **Do not set `GOOGLE_APPLICATION_CREDENTIALS` on Vercel**: your local file is unavailable there. Paste the complete JSON into `FIREBASE_SERVICE_ACCOUNT_JSON` without extra enclosing quotes; preserve the `\n` escapes inside its private key. Never prefix a secret with `VITE_`.

4. Deploy, then add the resulting hostname (e.g. `shiftscript.vercel.app`) to Firebase's authorized domains.
5. Sign in, process a fictional meeting, approve a task and refresh. Inspect Firestore's `workspaces/<uid>/meetings` and `tasks` collections.
6. Later pushes to `main` redeploy automatically. Environment changes require a redeploy; `VITE_` overrides are baked into the frontend at build time. Add Preview environment values/domains if testing preview deployments.

## Design and features

- Corporate cobalt `#2458E8`, white cards, clear typography and an original rounded illustration inspired by Earny's visual direction.
- **High:** vivid coral/red; **Medium:** amber; **Low:** teal. Flag icons and text communicate priority alongside colour. Overdue/blocked indicators use urgency colours.
- 27 original SVG interface icons in `src/components/Icons.jsx`, with standalone copies in `public/icons/`.
- Gentle entrance, dialog, hover, toast and recording animations; respects reduced-motion preferences.
- Structured summary, discussions, decisions, follow-ups and proposed tasks with transcript evidence.
- Human editing, approval and rejection; only approved tasks enter the tracker.
- Task owners, dates, status, priority, progress notes, board, history, source links and JSON export.
- Duplicate-safe reviews and cached repeat meetings; authenticated Firebase workspaces.

## Verification

```bash
npm run check
npx playwright install chromium
npm run test:ui
```

The check runs **11 backend tests** and the production build. The browser test covers the complete sample workflow, responsive screens and audio upload/editing with a **mocked transcription result**. See `docs/TESTING.md`. Live Gemini accuracy, microphone capture, Firebase connectivity and Vercel deployment require verification with your configured accounts; they are not claimed as tested here.

## Troubleshooting

| Issue | Fix |
| --- | --- |
| Node/npm not found | Install Node >=22.12 and reopen VS Code. |
| API unavailable | Run `npm run dev`; keep both processes running. |
| Port 3001 in use | Stop the old server. If changing `PORT`, update the Vite API proxy too. |
| Sample rejects my transcript | Set `AI_PROVIDER=gemini`, add the key and restart. |
| Gemini rejects key/project | Create a valid key in AI Studio; check project/API restrictions. |
| Gemini rate/quota limit | Wait and retry; inspect Google's project limits. Free access varies. |
| Model unavailable | Check current model access in AI Studio and update `GEMINI_MODEL`. |
| No microphone access | Allow microphone permission on localhost/HTTPS, or upload audio. |
| Audio too large or unclear | Trim/compress under 2.5 MB; use a shorter, clearer recording. |
| Firebase login fails | Enable Email/Password, create the user and authorize the hostname. |
| 403 after Firebase login | Match the signed-in email to `ALLOWED_EMAILS`. |
| Firebase API failure | Verify Admin credentials, project ID and `(default)` Firestore database. |
| Relative date unresolved | Confirm a date manually; only ISO dates, today and tomorrow resolve automatically. |

This is a working proof of concept with bounded private workspaces: 50 meetings, 250 tasks, 50 updates per task and 15,000 transcript characters. It does not include shared team roles, streaming transcription, calendar sync, notifications or automatic deployment. Human review is required because evidence checks cannot guarantee semantic model accuracy.
