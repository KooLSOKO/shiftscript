# ShiftScript v2.2 — invitation emails, recent meetings and usability

## What's included

1. **Earny invitation emails.** In Team & workspace, enter a teammate's email and Member/Viewer access. When SMTP and the public URL are configured, Send an invitation email is selected by default. Click Send invitation to create the invitation and send its join link through your existing Earny Zoho mailbox.
2. **Resend, status and copy link.** Pending invitations show email acceptance/rejection/unconfirmed status and expiration. Resend email and Copy link remain available. If sending fails, the invitation is kept. For an unconfirmed send, check Zoho Sent mail before resending.
3. **Recent Google Meet inside New meeting.** Select Recent Google Meet. Your connected account's accessible recent meetings load automatically. Search by date/time/reference, choose View sources, preview the generated notes/transcript, check the date/type/project, then process it. Google imports still use the secure server-fetched source.
4. **Reuse a saved transcript.** Select Previous meeting, search your workspace history, preview a source, then Use this transcript. Update the transcript and metadata before processing. The original date is kept so relative deadlines are not accidentally shifted. Existing tasks are not copied.
5. **Draft preservation and less repetition.** Switching intake sources keeps your text/voice draft. An empty draft from opening the modal is cleared after Google import; an unrelated text draft is kept. Already imported Google sources are labelled, with an Open saved meeting shortcut. Recent lists support refresh and pagination. The embedded phone view keeps recent meetings ahead of the optional Google Docs fallback.
6. **Invitation expiry and permissions.** New invitations expire after 7 days. Only the exact invited, verified email can join. Only owners can send or revoke invitations. Creation and send retries avoid duplicates. Legacy invitations without an expiration remain compatible.

The 100,000-character text/import limit and comma-separated dashboard recap emails remain available. Voice transcription retains its 2.5 MB recording/15,000-character output limits. Meet listing does not start recording or generate missing Google transcripts. If Google cannot list your personal account's meetings, use the Have the notes link? fallback with the generated Google Docs URL.

## Vercel settings

Open **Vercel → ShiftScript → Settings → Environment Variables**.

| Key | Value | Type |
|---|---|---|
| `APP_URL` | `https://shiftscript.earny.co.za` | Config |
| `PUBLIC_SIGNUP_ENABLED` | `true` if new teammates should be able to register | Config |

`APP_URL` makes email links point to your production domain. When absent, the server uses the origin of your existing `GOOGLE_REDIRECT_URI`. For local mail tests, use your local front-end URL instead.

Keep your existing SMTP variables, Google OAuth variables, Gemini settings, Firebase Admin credential and integration encryption key. No new email service, Firebase rules or Google scopes are needed. With public signup enabled, workspace membership still protects team data. If you keep signup disabled, invited users need an existing account and must be included in `ALLOWED_EMAILS` when that restriction is configured.

Save variables for **Production**, then deploy the new commit (or redeploy if you changed variables after deployment).

## Update the project on your Mac

Download and unzip `ShiftScript-v2.2-Invitations-Recent-Meetings.zip` in Downloads. The extracted folder is `ShiftScript-v2.2`.

In your existing VS Code project's terminal, run these **one at a time**:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' "/Users/soko/Downloads/ShiftScript-v2.2/" ./
npm ci
npm run check
git add .
git --no-pager diff --cached --name-only
```

Check the staged list has no private `.env` or service-account file, then run:

```bash
git commit -m "Add invitation emails and recent meeting intake"
git push origin main
```

This is a full source update. The rsync command keeps your local `.env`, Git history, dependencies and local data. Existing Firestore meetings/tasks remain in place.

## Live check

1. In Team & workspace, invite an email address you choose. Keep Send an invitation email checked and click Send invitation.
2. Confirm its status says Email accepted by mail server. Check the chosen inbox (including Spam). SMTP acceptance is not a guarantee of inbox delivery.
3. Open its invitation link. Sign up/sign in with the invited address, verify the address, then select Join workspace under Your workspaces. A different email cannot join using the link.
4. As owner, use Copy link, or Resend email after the one-minute cooldown. Revoke an invitation to make its link unusable.
5. Click New meeting → Recent Google Meet. Select a source and process it. Review proposed tasks before approving.
6. Open New meeting again, use Previous meeting, or switch sources with a text draft to confirm it remains available.

Invitation mail limits: 20 sends per workspace/day (UTC), 20 attempts per invitation and a 60-second resend cooldown. Recap email limits remain separate. Failures count toward the invitation-mail limit; uncertain sends are never retried automatically.

Validation uses simulated identities and mocked Google/Gemini/SMTP. No real emails were sent during development. Check your actual Zoho delivery and Google artifact availability after deployment.
