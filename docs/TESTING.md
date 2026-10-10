# ShiftScript v2.2 testing

Tested 10 October 2026 using Node.js 24.19.0. No private credentials supplied in chat were used.

## Automated checks

`npm run check`: **50 tests passed, zero failed; production Vite build passed.** Coverage includes:

- Transcript extraction fixtures, evidence grounding, dates, original source links and human approval; anonymous speaker labels cannot become named owners.
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

## Google and email checks

Version 2.2 adds owner-only invitation emails with normalized stored recipients, canonical links immune to request-host changes, escaped workspace names, 7-day expiration/discovery/acceptance, idempotent creation/send, cooldown, separate mail quota preserved during AI calls, rejected/uncertain outcomes and revocation during SMTP. No real invitation emails are sent in tests.

The browser integration suite processes a recent Google meeting directly inside New meeting, searches the loaded list, reuses saved transcripts and confirms drafts survive switching sources. The collaboration browser suite creates two invitations with automatic mocked email, verifies recipient/link content, resends one, checks status and phone/tablet overflow, and completes the existing verified recipient join/permissions workflow.

Version 2.1.1 adds 100,000-character text/draft processing with verified commitments at the end and one AI call per unique meeting; oversized input rejects before AI use. Large Unicode Google sources retain all text while old previews are evicted to bound encrypted vault size. Comma-separated addresses are trimmed, validated and deduplicated before sending. Browser checks cover dashboard/history recap buttons, invalid-address blocking, two recipients from comma-separated input, 44-pixel phone controls, a text upload above 15,000 characters and non-truncating paste over the new limit.

`tests/integrations.test.js` adds OAuth state/PKCE/cookie binding, replay and expiry rejection; token encryption/refresh; mocked Firestore per-user separation; document URL validation and nested tabs/tables; paginated speaker-tagged entries; unknown labels; private previews, workspace scoping, disconnect invalidation, trusted import metadata and review/deduplication. It also checks email roles, approved-task-only rendering, HTML escaping, recipient limits, preview fingerprints, idempotent sends, uncertain SMTP outcomes and configured sender/Bcc.

No real Google OAuth, Gmail account, Gemini API or Zoho SMTP credentials were used. The browser mailer is mocked: no messages were sent externally.

## Browser checks

`npm run test:ui`: **all four browser suites passed** with actual React/Vite and Node APIs:

| Suite | Main checks |
| --- | --- |
| `browser-smoke.js` | Sample meeting, evidence, edits, approval/rejection, status/notes persistence, board, mobile navigation and mocked voice upload/transcription/source |
| `accounts-browser.js` | Simulated signup, name prefill, password mismatch, workspace setup/rename, account isolation, reset, invalid password and mobile layout |
| `integrations-browser.js` | Mocked Meet artifacts and Docs-link import, source labels, pending proposals, approval, recap preview/send, collapsed filters, mobile task cards, dialog bounds and keyboard navigation |
| `collaboration-browser.js` | Projects, draft recovery after reload, bulk edits/approval, manual tasks/checklists/notes, combined filters, PDF/CSV downloads, clipboard invitation links, verified join, Member edits, Viewer access and multiple workspace switching/isolation |

The collaboration suite also checks that adding a progress note from a stale task editor does not let it overwrite another member's status change. A 409 response in this test is expected.

Desktop checks use 1440 px viewports. The new integration suite checks 320, 390 and 430 px phones, 768 px tablet and 844 px landscape, including viewport overflow, input size, touch targets, drawer keyboard navigation, import review, approval and email preview/send. No page JavaScript errors or horizontal page overflow were found in the tested flows. Phone task tables become cards; boards intentionally scroll inside their containers. Screenshots contain fictional sample data and simulated identities.

```bash
npx playwright install chromium
npm run test:ui
```

Suites create temporary data and use ports 3009/5179, 3010/5180 and 3011/5181 and 3012/5182 sequentially. No credentials are required. The optional `SHIFTSCRIPT_TEST_CHROMIUM` environment variable supports the bundled Chromium used in this environment; ordinary local runs use Playwright Chromium.

PDF report pages were rendered and visually checked with accented names, long content, page breaks, headers/footers and proposal status/evidence. Both meeting and filtered task downloads were verified in the browser.

## Live checks after deployment

1. Sign up/sign in with real Firebase Auth. Check reset and verification email delivery and authorized domains.
2. Load old meetings/tasks, create a project and save a draft. Confirm Firestore persistence after refresh.
3. Invite a second verified email, join, edit as Member, change to Viewer, verify writes are denied, then remove access.
4. Use Gemini on a fictional/approved transcript with a fresh title; inspect the evidence, owners and dates. Test a short recording and microphone permission on localhost/HTTPS.
5. Push to GitHub and check Vercel's deployment, sign-in, API requests and font/PDF downloads.

Not verified here: your live Firebase credentials/IAM, Google consent/scopes, personal-account Meet REST eligibility, actual Google artifact availability, Zoho SMTP/delivery, Gemini eligibility/key/model accuracy, microphone hardware or the hosted Vercel deployment. Use the live checklist in [UPDATE-v2.1.md](UPDATE-v2.1.md).

## Dependency audit

The installed tree reports 12 advisories (8 moderate, 4 high). The high findings trace to the Firebase Web SDK's unused Node Firestore transport (`@grpc/grpc-js` 1.9.x); this application imports only browser Auth and uses the Admin SDK's separate 1.14.6 transport for server Firestore. No gRPC server is exposed by ShiftScript. This is a dependency inventory observation, not proof of universal non-exploitability. No force downgrade of Firebase was applied; review upstream updates before adding client-side Firestore/gRPC usage.

The v2.1 final audit still reports those 12 existing findings. The new SMTP dependency was updated to Nodemailer 10.1.0; no Nodemailer advisory was reported in the final audit.

## v2.3 checks

Browser smoke checks the four labelled bottom-navigation buttons, the Meetings active state, artwork decoding, and 44px minimum tap targets with no overflow at 320, 360, 390 and 414px. The accounts browser suite checks signed-in name/email isolation for two users, workspace memberships and profile rendering on desktop and mobile. The existing collaboration and integration suites continue to exercise invitation email, Meet imports and recaps.

## v2.3.1 assignment matching

My tasks matches full/first/last name for name-only owners, with explicit account ownership taking precedence. Unit tests cover matching and rejection cases plus combined filters. The accounts browser test checks Profile counts and the actual View my tasks shortcut for a user whose server actor name differs from their current display name.

## v2.4 Calendar scheduling

Calendar unit tests validate explicit dates/times, DST gaps and UTC conversion. Account browser tests check scheduling a task with no date, a pre-filled due date, mobile fitting at 320px, correct event parameters and fallback links. Browser navigation is intercepted; no live Google event is created.


## v3.0 productivity checks

`npm run check` passes 69 unit/API tests plus the production build. `npm run test:ui` passes all five suites; the new productivity browser suite uses isolated local data and API/browser port 3013/5183. It checks notification read state, dependency completion controls, quick due dates, bulk changes/undo, saved views/search, persisted single/batch Calendar schedules, manual Calendar marks with popup interception, profile aliases and resized photo upload, saved agendas/follow-through comparison, activity and 390/320px task/profile layouts.

New API checks cover profile persistence/isolation and invalid avatars; duplicate-owner confirmation; dependency cycles/foreign IDs; atomic stale-batch rejection; viewer restrictions; undo authorship/expiry/concurrent edits and restored meeting links; schedules and DST gaps; private views/marks; agenda references/idempotency; Firestore private profile transactions; verified consent and current membership; simultaneous cron calls and uncertain SMTP outcomes. Fake SMTP captures recipients and body without sending email. Current identity and consent are tested independently of token claims.

All five browser suites and 69 API checks passed on the packaged source. No hosted Firebase, Google, SMTP or Vercel changes were made by these tests. Vercel cron timing, real SMTP acceptance/inbox delivery and actual Google event saving remain deployment checks. See UPDATE-v3.md for the full checklist.

## v3.0.1 Google identity and public pages

The accounts browser suite simulates Google provider account selection, cancellation, blocked popup, disabled provider, unauthorised domain and credential conflict. It checks preserved returning workspaces and first-login display-name onboarding. The new sixth browser suite serves the built public pages using their configured Vercel rewrites and verifies no-JavaScript access, canonical/title/contact links, successful image decoding and 320/390px/desktop layout. Live Firebase provider configuration and Vercel deployment still need the checks in `UPDATE-v3.0.1.md`.

## Public landing (v3.0.2)

`tests/landing-browser.js` serves the built homepage and tests readable no-JavaScript content, native FAQs, absence of home API/Auth calls, canonical/social/schema metadata, loaded assets, five viewport widths (320–1440px), workspace navigation and legacy OAuth/invitation links. The account browser suite additionally enters signup from the actual landing CTA. Existing six browser suites now navigate to `/app`; they still test all earlier account, processing, project, workspace and integration flows using simulated external services.
