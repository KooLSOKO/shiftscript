# ShiftScript v2 testing

Tested 9 October 2026 using Node.js 24.19.0. No private credentials supplied in chat were used.

## Automated checks

`npm run check`: **29 tests passed, zero failed; production Vite build passed.** Coverage includes:

- Transcript extraction fixtures, evidence grounding, dates, original source links and human approval.
- Duplicate meetings/reviews/manual create retries and invalid inputs.
- Manual tasks, checklists, confirmed assignees, notes and stale task updates.
- Combined filters, date ranges, sorting, CSV quoting/formula protection and embedded-font PDF pagination.
- Private draft persistence, per-user visibility, save/delete version conflicts.
- Shared workspace membership, verified email-bound invitations, Owner/Member/Viewer permissions, member revocation and data isolation.
- Bulk approval/rejection atomicity, edited owners/dates and repeat handling.
- Legacy local/Firebase metadata migration and read-before-write Firestore transactions.
- Member revocation while AI analysis is pending, preventing the result being saved.
- Gemini/audio contracts, validation, timeout/quota error handling and production local-storage refusal.

Firestore tests use an injected transaction fixture. Auth/model tests use simulated tokens and SDK results. They do not contact live services.

## Browser checks

`npm run test:ui`: **all three browser suites passed** with actual React/Vite and Node APIs:

| Suite | Main checks |
| --- | --- |
| `browser-smoke.js` | Sample meeting, evidence, edits, approval/rejection, status/notes persistence, board, mobile navigation and mocked voice upload/transcription/source |
| `accounts-browser.js` | Simulated signup, name prefill, password mismatch, workspace setup/rename, account isolation, reset, invalid password and mobile layout |
| `collaboration-browser.js` | Projects, draft recovery after reload, bulk edits/approval, manual tasks/checklists/notes, combined filters, PDF/CSV downloads, clipboard invitation links, verified join, Member edits, Viewer access and multiple workspace switching/isolation |

The collaboration suite also checks that adding a progress note from a stale task editor does not let it overwrite another member's status change. A 409 response in this test is expected.

Desktop checks use 1440 px viewports; mobile uses 390 × 844. No page JavaScript errors or horizontal page overflow were found in the tested flows. Wide task tables and boards intentionally scroll inside their containers. Screenshots contain fictional sample data and simulated identities.

```bash
npx playwright install chromium
npm run test:ui
```

Suites create temporary data and use ports 3009/5179, 3010/5180 and 3011/5181 sequentially. No credentials are required. The optional `SHIFTSCRIPT_TEST_CHROMIUM` environment variable supports the bundled Chromium used in this environment; ordinary local runs use Playwright Chromium.

PDF report pages were rendered and visually checked with accented names, long content, page breaks, headers/footers and proposal status/evidence. Both meeting and filtered task downloads were verified in the browser.

## Live checks after deployment

1. Sign up/sign in with real Firebase Auth. Check reset and verification email delivery and authorized domains.
2. Load old meetings/tasks, create a project and save a draft. Confirm Firestore persistence after refresh.
3. Invite a second verified email, join, edit as Member, change to Viewer, verify writes are denied, then remove access.
4. Use Gemini on a fictional/approved transcript with a fresh title; inspect the evidence, owners and dates. Test a short recording and microphone permission on localhost/HTTPS.
5. Push to GitHub and check Vercel's deployment, sign-in, API requests and font/PDF downloads.

Not verified here: your live Firebase credentials/IAM, email delivery, Gemini eligibility/key/model accuracy, microphone hardware or the hosted Vercel deployment.

## Dependency audit

The installed tree reports 12 advisories (8 moderate, 4 high). The high findings trace to the Firebase Web SDK's unused Node Firestore transport (`@grpc/grpc-js` 1.9.x); this application imports only browser Auth and uses the Admin SDK's separate 1.14.6 transport for server Firestore. No gRPC server is exposed by ShiftScript. This is a dependency inventory observation, not proof of universal non-exploitability. No force downgrade of Firebase was applied; review upstream updates before adding client-side Firestore/gRPC usage.
