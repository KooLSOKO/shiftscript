# ShiftScript v3.0.11 — mobile Google return and stronger directional movement

The meeting dial now travels 17 pixels on desktop and 13 pixels on small phones, tilts 24 degrees and settles with a short spring transition. Every direction visibly leans toward its labelled mode. Click, keyboard and native touch dragging still work. A second touch cannot interrupt an active drag. Reduced motion retains the highlighted selection without tilting.

On iPhone, Android and iPad, Google sign-in now leaves and returns in the same browser tab. On return, ShiftScript shows **Finishing Google sign-in…**, completes Firebase authentication, plays the existing blue welcome transition once and opens your workspace or workspace setup. Desktop keeps the popup flow. The return URL, including signup and invitation query parameters, remains intact.

Cancellation, configuration errors and a 15-second return timeout restore a usable sign-in screen. Expired return markers do not trap users in loading. The marker contains only a timestamp. Browsers with blocked session storage receive an explanation before navigation. Returning to an interrupted sign-in screen through the browser Back button refreshes that screen to finish or recover.

## Configure Google sign-in before deploying

This is required for the new same-origin Firebase helper, which avoids third-party storage problems on modern mobile browsers. The code includes Vercel proxy rewrites and uses the custom auth domain on shiftscript.earny.co.za automatically, including when the old Firebase auth-domain environment value is still present.

1. Open [Firebase Console](https://console.firebase.google.com/) and choose **shiftscriptza**.
2. Go to **Authentication → Settings → Authorized domains**. Add **shiftscript.earny.co.za** if it is absent.
3. Go to **Authentication → Sign-in method → Google**. Confirm Google is enabled. Expand **Web SDK configuration** and identify the **Web client ID**. Copy it so you can identify the matching client in Google Cloud.
4. Open [Google Cloud Console](https://console.cloud.google.com/), select the same Firebase project, and go to **Google Auth Platform → Clients**. If your console shows the older navigation, use **APIs & Services → Credentials**.
5. Open the **Web application OAuth client with the matching Firebase Web client ID**. This is the Firebase sign-in client; your separate Google Meet connection client is a different integration.
6. Under **Authorized redirect URIs**, add this exact URI:

   ```text
   https://shiftscript.earny.co.za/__/auth/handler
   ```

7. Under **Authorized JavaScript origins**, add **https://shiftscript.earny.co.za** if it is absent. Save. Keep the existing Firebase redirect URIs and any existing Meet callback URI; add this entry rather than replacing them.
8. After saving the Google settings, install and deploy this update using the commands below. No GoDaddy/DNS changes are needed.

Both the desktop popup and mobile redirect use this custom helper in production, so configure the callback **before pushing the update**. No new API key, server credential or database migration is required. Localhost and preview deployments retain their configured Firebase auth domain. Use the canonical domain for the mobile production acceptance test.

Firebase guidance: [Redirect sign-in best practices, Option 3](https://firebase.google.com/docs/auth/web/redirect-best-practices#option-3-proxy-auth-requests-to-firebaseappcom).

## Install and deploy

Extract ShiftScript-v3.0.11.zip into Downloads. Run these commands **one at a time** in your VS Code terminal after completing the Google configuration above:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.0.11/" ./
npm ci
npm run check
git add .
git commit -m "Improve mobile Google sign-in and directional controls"
git push origin main
```

The copy preserves your local configuration, Git repository and stored data. Your connected Vercel project deploys the push. Wait for that deployment to finish before testing.

## Site review

Reviewed account access and signup, workspace setup and switching, meeting creation and source selection, recording/upload and transcript processing, task review/editing/approval, progress and completed-task layouts, projects and collaboration, Google import/disconnect, email preview/send, calendar flows, reminders/productivity controls, public pages, cookie preferences, profile/navigation, keyboard focus and reduced motion.

The review found and addressed these issues:

- The popup-only login caused a separate mobile Google window. Phones now use a redirect with an explicit return loading state.
- The global iframe-blocking header would prevent Firebase's same-origin helper from working. Application pages retain iframe protection; only the authentication helper permits same-origin embedding and uses no-store caching.
- A return could remain busy after cancellation, an SDK failure, missing Firebase setup or an interrupted navigation. Bounded recovery and browser Back handling now clear the pending state.
- The dial movement was too subtle. Its larger travel and tilt make the selected direction visible.
- Multiple simultaneous touches could overwrite a drag. The selector now accepts one primary pointer at a time.
- The return loading screen offered Sign out even when nobody was signed in. That action now appears only for an authenticated user.

No additional broad redesign was needed for the workflows checked. Existing responsive layouts, tap targets, custom icons, draft/audio preservation and blue loading/welcome transitions are retained.

## Production acceptance checks

1. On iPhone Safari and Android Chrome, open https://shiftscript.earny.co.za/app and choose Continue with Google. Confirm that the browser returns to the same tab and shows the return/loading screen before the workspace opens.
2. Cancel once and retry. Confirm email sign-in remains available.
3. Try Google signup and check your display name is prefilled in workspace setup. Try an existing workspace account and confirm its meetings/tasks remain.
4. On desktop, confirm the popup still signs in and the welcome transition runs once.
5. In New meeting, tap, drag or use arrow keys to select all four directions. Confirm title, transcript and selected audio survive source changes.
6. Enable reduced motion and repeat source selection. The selection should remain clear without tilt.

Automated external integrations are simulated; a live Google OAuth round trip and your provider settings must be confirmed after deployment. Tests do not send real mail, use your API keys, or modify live Google/Firebase accounts.

Verification: 75 unit/API tests and the final production build pass. All nine browser suites pass, with targeted account and selector reruns covering the actual 15-second stalled-return recovery, native two-finger drag handling, measured dial travel and signup/return flows. External services are simulated.
