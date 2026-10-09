# Technical overview

## Pipeline

Voice upload/recording → authenticated `POST /api/transcribe` → Gemini audio-to-text → editable transcript. Pasted or `.txt` transcripts enter at the same editable text stage.

Transcript → authenticated `POST /api/meetings` → Zod input validation → Gemini structured extraction → evidence/owner/deadline validation → stored meeting with pending proposals → human review → transactional approved task → tracker, board and dashboard.

Raw audio is not written to local storage or Firestore. Only the reviewed transcript and optional `{kind:'audio', name}` source metadata are persisted.

## Files

| File | Purpose |
| --- | --- |
| `src/App.jsx` | Workspace, history, dashboard, tracker, board and meeting input |
| `src/components/AudioInput.jsx` | Upload, preview, microphone capture and transcription UI |
| `src/components/Icons.jsx`, `Priority.jsx` | Original vector icons and urgency badges |
| `src/firebase-config.js` | Supplied public Firebase Web configuration |
| `src/lib.js` | Auth, API client, dates and exports |
| `src/styles.css` | Tailwind plus blue visual system and reduced-motion handling |
| `public/art/meeting-blue.webp` | Original generated illustration |
| `public/icons/` | 27 reusable original SVG icons |
| `server/app.js` | Routes, authentication, allowlist, quota and validation |
| `server/gemini.js` | Server-only Gemini Interactions JSON adapter |
| `server/audio.js` | Audio limits/signatures and faithful transcription |
| `server/analyze.js`, `schema.js` | Extraction, sample fixture, Zod and grounding helpers |
| `server/store.js` | Firestore and local JSON adapters |
| `server/firebase.js` | Admin initialization with server credentials |
| `api/index.js`, `vercel.json` | Vercel function and routing |

## Storage

`workspaces/{uid}` stores `quota: {date,count}`. `meetings/{meetingId}` under that path stores title/date/type, transcript, optional source, provider, timestamps, summary, discussions, decisions, follow-ups and proposals. A proposal includes evidence, review status, owner, original deadline, confirmed date, priority and optional task ID.

`tasks/{taskId}` stores the approved task fields, source meeting/proposal IDs, evidence, status, timestamps and progress notes. Notes have IDs, text and creation time.

ISO calendar dates are used for deadlines; timestamps are UTC. Dashboard overdue comparisons use Africa/Johannesburg's current date. Quotas reset at UTC midnight. Missing owners are Unassigned. Ambiguous relative dates remain unresolved until a person confirms them.

## API

| Route | Purpose |
| --- | --- |
| GET `/api/config` | Nonsecret modes, model name, audio limit, readiness and sample |
| GET `/api/workspace` | Current user's stored meetings and tasks |
| POST `/api/transcribe` | Validate inline audio and return editable text/source |
| POST `/api/meetings` | Validate, extract and store pending proposals |
| POST `/api/meetings/:id/proposals/:id/review` | Correct and approve/reject a proposal |
| PATCH `/api/tasks/:id` | Edit task fields/status |
| POST `/api/tasks/:id/notes` | Append a progress update |

Firestore mode requires a Firebase ID token; production also requires an email allowlist. The server scopes operations to the verified UID. Browser Firestore rules deny direct access. Local storage is localhost-only and blocked in production. The Web config is public; Admin and Gemini credentials remain server-only. API responses disable caching.

Audio uploads use base64 JSON, limited to 2,500,000 decoded bytes. MIME/type signatures and encoding are validated. The JSON body limit is 3.5 MB, keeping the upload below Vercel's 4.5 MB function request limit. Recording requests permission only on user action and stops tracks after completion or dialog unmount.

## Gemini

Default: `gemini-3.5-flash-lite`, configurable through `GEMINI_MODEL`. Both tasks use the Interactions API with `store:false`, structured JSON schemas, temperature 0.2, a 45-second timeout and zero automatic retries. Extraction allows 6,000 output tokens; transcription 7,000. Free-tier eligibility and provider quotas are external to the app. `store:false` controls interaction storage; it is not a promise about Google's training/data policies.

The audio instruction requests faithful speech, unidentified speaker labels and `[unclear]` markers; it forbids summary and fabricated names. The user reviews the result before analysis. The extraction instruction treats transcript content as data, requires exact evidence and explicit owners/urgency, and defaults priority to Medium. Validation rejects invented evidence and clears unsupported owners/deadlines. These checks cannot establish semantic correctness; approval is required.

Daily app quota defaults to 20 combined transcription/analysis attempts per workspace, with failures counted. Cached meeting retrieval does not incur another analysis attempt.

## Idempotency and limits

Meeting IDs hash normalized title/date/type/transcript. A repeat retrieves the saved meeting and approvals. Two simultaneous unseen submissions can still both call Gemini before one record wins; production expansion should use analysis-job locking. Task IDs derive from meeting/proposal IDs. Firestore transactions change proposal status and create tasks atomically, preventing duplicate approval. Local mutations serialize in one process and write by atomic rename.

Reads return the bounded workspace: 50 meetings, 250 tasks, 20 proposals per meeting and 50 notes per task. This is suitable for a prototype, not large shared teams. Expand with pagination, per-document transactions, separate notes, shared roles and analysis jobs.
