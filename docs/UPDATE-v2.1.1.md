# ShiftScript v2.1.1 — dashboard recaps and longer imports

## What changed

- Pasted transcripts, `.txt` uploads, private drafts and Google Meet/Docs imports now support **100,000 characters**, up from 15,000. Text uploads can be up to 400 KB. The complete source reaches the existing AI processor in one request; no text is silently cut off.
- The dashboard's **Recent conversations** cards show a summary excerpt and an **Email recap** button. Meeting history has the same shortcut, and the existing button inside a meeting remains available.
- Enter addresses such as `kiya@example.com, kopano@example.com`. Spaces are trimmed, duplicate addresses are removed, and invalid addresses are highlighted before sending. Commas, new lines and semicolons are accepted. Up to 10 different addresses can be selected per send.
- Preview the meeting summary, decisions, approved tasks with owners/deadlines/status and follow-ups before clicking **Send recap**. Pending and rejected task proposals are excluded. The sender remains the Earny mailbox configured in Vercel; recipient addresses are hidden from one another.
- Dashboard buttons remain accessible on phone/tablet screens, with 44-pixel touch targets. Viewers cannot send email. Existing fingerprint, retry, daily send and workspace permission checks still apply.
- Older large Google previews are evicted as necessary so the encrypted per-user preview document stays within Firestore's size limit. The latest source remains intact.

## Install on your Mac

1. Download and unzip `ShiftScript-v2.1.1-Dashboard-Email.zip` into Downloads. Its folder is named `ShiftScript-v2.1.1`.
2. Open your existing **ShiftScript 2** folder in VS Code. Open **Terminal → New Terminal**.
3. Run these commands **one at a time**:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' "/Users/soko/Downloads/ShiftScript-v2.1.1/" ./
npm ci
npm run check
git add .
git diff --cached --name-only
```

Press **q** if Git opens a scrollable file list. Confirm no private `.env` or service-account file is staged, then run:

```bash
git commit -m "Add dashboard email recaps and longer transcript imports"
git push origin main
```

Vercel will build the new commit. This update does not require new environment variables, Firebase rules or Google scopes. Keep your existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, optional `SMTP_FROM`, Google OAuth, Gemini, Firebase and integration encryption settings.

## Use the new dashboard shortcut

1. Import/process your meeting as usual.
2. Open the meeting and review/approve the tasks you want to include.
3. Return to **Overview**. Under **Recent conversations**, click that meeting's **Email recap**. For older meetings, click **View all** and use the same button in meeting history.
4. Enter the recipient email addresses separated by commas.
5. Check the recipient count and read the preview.
6. Click **Send recap**. Check the chosen inboxes for the message.

You can email a summary before approving tasks; the preview will show that pending tasks are excluded. SMTP acceptance confirms that the mail server accepted a recipient, not that the email reached their inbox. A disabled recap button means SMTP configuration is incomplete, or you do not have permission to send.

## Limits and validation

Text/import limit: 100,000 characters. Voice transcription retains its separate **2.5 MB recording** and **15,000-character output** limits. This update does not add long-recording transcription or background processing. Gemini's existing free-tier quota, the 45-second model timeout, and the existing maximum of 20 proposed actions per analysis still apply; a larger accepted source does not guarantee provider availability or processing speed.

Automated tests cover full-length input, evidence near the end, draft persistence, duplicate processing, oversize rejection, large Unicode Google previews and recipient validation. Browser tests use mocked Google/Gemini/SMTP services and check direct dashboard sending, invalid-address blocking, comma-separated recipients, complete text uploads, non-truncating paste and phone/tablet layouts. No real email was sent during development.
