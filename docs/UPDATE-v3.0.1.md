# ShiftScript v3.0.1 — public policies and Google sign-in

This complete release contains all v3 productivity features plus public About, Privacy Policy, Terms of Service and Data Deletion pages, and Firebase Google sign-in. Contact: **meetings@earny.co.za**. Pages work without an account or JavaScript and use ShiftScript's blue palette and original icon system. Policy links appear on account screens and the workspace footer; contextual Google/AI data notices appear before processing.

## Update your existing Mac project

Extract `ShiftScript-v3.0.1.zip` into Downloads. Run each command separately in your VS Code terminal:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' "/Users/soko/Downloads/ShiftScript-v3.0.1/" ./
npm ci
npm run check
```

Keep your existing private `.env` and Vercel secrets. No new dependency or environment variable is needed for Google identity sign-in. The existing Meet integration variables still apply only to that separate connection.

## Enable Google in Firebase — required once

1. Open https://console.firebase.google.com/ and select **shiftscriptza** (the Firebase project used in `src/firebase-config.js`).
2. Open **Build → Authentication → Sign-in method** (some consoles label it **Sign-in providers**).
3. Choose **Add new provider → Google**, or open the existing Google row.
4. Turn **Enable** on. Set the project public-facing name to **ShiftScript**. Select an available support email you monitor. If Firebase only lists your Google account address, use that account; the website's support/privacy contact stays `meetings@earny.co.za`.
5. Click **Save**. Keep Email/Password enabled for existing users.
6. Open **Authentication → Settings → Authorized domains → Add domain**. Add **`shiftscript.earny.co.za`**, without `https://` or a path. Add your exact production Vercel hostname if you also use it. Add `localhost` explicitly for local development if it is missing.
7. Keep the current Firebase auth domain `shiftscriptza.firebaseapp.com`. Do not replace it with your Vercel domain unless you separately configure Firebase's custom auth handler. If you customise the identity OAuth client, the Firebase redirect is `https://shiftscriptza.firebaseapp.com/__/auth/handler`. Do not remove the separate Meet redirect `https://shiftscript.earny.co.za/api/google/callback` from its client.
8. For public onboarding, keep **`STORAGE_MODE=firebase`** and **`PUBLIC_SIGNUP_ENABLED=true`** in Vercel. If public signup is disabled, the existing email allowlist still restricts app access, including Google users. The flag is an app access policy; it does not prevent Firebase itself from creating a Google identity.

The button opens Google immediately from a user click and requests basic Firebase identity only. There are no Meet, Docs or Calendar scopes in this sign-in call. Existing users return to workspaces using their Firebase UID; new users confirm their Google display name and create or join a workspace. Google can create a Firebase identity on first use. A provider account conflict is shown as an error rather than creating or merging workspace records in the client. For existing email accounts, retain Firebase's normal one-account-per-email behaviour; never delete an account just to switch providers.

Popup cancellation is recoverable. If blocked, allow popups for the site and retry in Safari or Chrome. In-app browsers are not recommended. This release does not silently fall back to a redirect flow, which would need additional browser-storage configuration on Vercel.

## Push and deploy

```bash
git status
git add .
git diff --cached --name-only
git commit -m "Add public policies and Google sign-in"
git push origin main
```

If `git diff` opens a scrolling pager, press **q** to return to the prompt. Ensure private `.env` files and service credentials are absent from the staged list. Vercel should deploy the commit. If you change its environment variables afterwards, redeploy to apply them.

## Google OAuth branding links

After the deployment is Ready, open these in a private window without signing in. Each should show its actual page, including on refresh:

| Field or page                   | URL                                           |
| ------------------------------- | --------------------------------------------- |
| Application home page           | https://shiftscript.earny.co.za/about         |
| Privacy policy                  | https://shiftscript.earny.co.za/privacy       |
| Terms of service                | https://shiftscript.earny.co.za/terms         |
| Data deletion instructions      | https://shiftscript.earny.co.za/data-deletion |
| Website support/privacy contact | meetings@earny.co.za                          |
| Authorized domain               | earny.co.za                                   |

Use those home/privacy/terms URLs in **Google Auth Platform → Branding** for your Meet OAuth project. The About page explains the product publicly. Verify `earny.co.za` ownership in Google Search Console and follow Google's branding and scope verification process. Adding policy pages or Google identity sign-in does not approve Meet's sensitive permissions or remove its Testing restrictions.

## Confirm AI data handling before public verification

The privacy policy describes the current code, including the differences between unpaid and paid Gemini processing. The supplied code does not establish which billing terms your API project uses. Google's unpaid Gemini terms allow model/product improvement and human review and instruct users not to submit confidential, personal or sensitive content. Its paid-service terms prohibit using prompts/responses to improve products; abuse-monitoring retention can still apply. A consumer Google AI Pro subscription is separate from this API arrangement.

Do not submit public OAuth verification with an unsupported claim that your current unpaid processor never trains on Google data. Before processing real private meetings, confirm and configure an API arrangement whose data-use terms meet the relevant Google user-data requirements. This release has not enabled billing or changed the deployed AI provider. Use fictional/anonymised content until that is resolved. A privacy notice alone does not fix a processor-policy conflict or grant OAuth approval.

Deletion requests go to your monitored mailbox and require manual handling. The pages do not invent an automatic whole-account erasure feature, a fixed deletion deadline, zero retention, or an ability to recall emails. Review the operator's legal identity, physical contact details, applicable processing arrangements and retention practices before broader commercial use; these were not supplied as verified business information here. Update the policy text when those practices change.

## Validation and live checklist

Local checks cover the production build, existing API behaviour, Google identity UI using simulated Firebase, cancellation, blocked popups, disabled provider, unauthorized domains, account conflicts, existing-workspace preservation and new-user name/onboarding. Public pages are checked without JavaScript, on desktop and at 320/390px. Existing collaboration, Google/email, productivity and sample browser workflows remain in the regression suite. Google/Firebase/SMTP are not exercised live by these tests.

After enabling Firebase Google sign-in, test one existing Google/email identity and one new Google user on the deployed site. Confirm account selection, profile name, correct workspace, sign-out/re-entry, all public pages and mobile layout. Connecting Meet should still prompt separately for its permissions. Existing Meet test-user/verification requirements remain unchanged.

Official references:

- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/web/redirect-best-practices
- https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- https://developers.google.com/terms/api-services-user-data-policy
- https://ai.google.dev/gemini-api/terms
- https://www.justice.gov.za/legislation/acts/2013-004.pdf
- https://inforegulator.org.za/popia/
