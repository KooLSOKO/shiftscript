# Testing evidence

Tested 9 October 2026, Node.js 24.19.0. No private credential supplied in chat was used.

## Automated checks

`npm run check`: **17 tests passed, zero failed; production Vite build passed.** Tests cover:

- Summary/decision/three proposed actions from the fictional fixture; no tasks before approval.
- Owner/deadline handling, ambiguous dates and rejection of fabricated evidence.
- Duplicate meeting caching, simultaneous repeat approval and rejected proposals.
- Editing/status/progress-note persistence and invalid-input handling.
- Production refusal of ephemeral local storage.
- Gemini JSON contract, selected model, `store:false`, bounded timeout and quota error handling, using a mocked SDK client.
- Audio base64, MIME signatures and size boundaries.
- Audio input sent to the transcription adapter; no-clear-speech rejection.
- Transcription endpoint → reviewed transcript → meeting source metadata, without persisted audio, using injected test adapters.

These tests validate wiring/contracts and guards; they do not prove a live Gemini response.

## Browser checks

Headless Chromium at desktop 1440 × 1050 and mobile 390 × 844. Passed the sample processing, evidence, review edits, approval/rejection, tracker status, progress notes, refresh persistence, board and mobile navigation flow. No page JavaScript errors or horizontal mobile overflow.

Also tested audio selection, base64 submission, a **mocked recognition result** appearing in the editable transcript, processing that transcript and retaining its voice-source filename. Microphone hardware capture and live speech recognition were not exercised.

```bash
npx playwright install chromium
npm run test:ui
```

The test launches its own API/Vite on ports 3009/5179 and uses a temporary workspace. It needs no credentials. Screenshots in `docs/screenshots/` show sample data; `voice-input-desktop.png` shows mocked audio transcription. They are not live Gemini/Firebase evidence.

## Sample expectations

| Task | Owner | Deadline |
| --- | --- | --- |
| Review dashboard and send feedback | Stephen | 2026-10-12 |
| Consolidate feedback and prepare final notes | Kiyasha | Not specified |
| Check the mobile layout | Unassigned | before the next client review; calendar date unconfirmed |

The decision retains current navigation; onboarding remains a tentative follow-up. Input and expected JSON are in `examples/`.

## Live verification after setup

1. Enable Gemini with a fresh key. Process the fictional sample using a fresh title and inspect owners, evidence and deadlines.
2. Upload a short approved recording. Correct its transcript before extracting tasks. Verify microphone capture in your browser if using recording.
3. Enable Firebase Auth/Firestore/Admin credentials and the allowlist. Approve a task, refresh and inspect UID-scoped Firestore records.
4. Deploy to Vercel and repeat sign-in, transcript/audio and persistence checks.

Not verified here: live Gemini project eligibility/key validity/model accuracy, microphone hardware, Firebase IAM/connectivity, hosted login or Vercel deployment. The build and local/mock tests passed; configure the external services to complete those checks.

## Signup update

Six additional API/storage tests cover authenticated personal workspace creation/rename, invalid and cross-owner payloads, existing meeting preservation, account isolation, public/private access modes, local persistence and Firestore metadata merges. `node tests/accounts-browser.js` passes with simulated Firebase Auth on ports 3010/5180: signup/password mismatch, name prefill, workspace setup and edits, refresh, two isolated accounts, reset, wrong password and mobile layout. Live signup/reset email and Firebase connectivity still require deployed verification. See SIGNUP-UPDATE.md for installation.
