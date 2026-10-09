# Historical v1.2 update — superseded

Use **[UPDATE-v2.md](UPDATE-v2.md)** for this complete ZIP. The instructions below describe an earlier partial update and do not apply to v2.

# ShiftScript: signup, names and personal workspaces

This update adds email/password signup, full names, password reset, first-login workspace setup, and workspace/name editing. Each authenticated Firebase UID owns one private workspace. It does not add team invitations, shared workspaces or multiple workspaces per account.

## Install into your existing VS Code project

1. Unzip `ShiftScript-signup-update.zip`.
2. Copy its contents into your existing `ShiftScript 2` project folder. Merge `src`, `server`, `tests`, and `docs`; replace only files with matching paths. Do not delete the existing folders first. Your `.env`, `.git`, Firebase config, assets, package files and existing meetings remain in place.
3. No new npm dependencies are required. Run `npm ci` if dependencies are not already installed.
4. In your actual `.env` file (not `.env.example`), set:

```dotenv
STORAGE_MODE=firebase
PUBLIC_SIGNUP_ENABLED=true
```

Keep your existing Firebase Admin and Gemini credentials. Stop the running dev server with Control+C and restart with `npm run dev`.

`STORAGE_MODE=local` continues to provide the sample demo and does not show Firebase signup. Use Firebase mode to test accounts.

## Firebase and Vercel

1. In Firebase project `shiftscriptza`, enable Authentication > Sign-in method > Email/Password. Users can now create their own accounts through the app; do not create each account manually.
2. Ensure the default Firestore database exists. Keep the existing `firestore.rules`: browser access is denied; authenticated server requests use the Admin SDK and the verified UID.
3. Ensure the Vercel hostname is in Firebase Authentication > Settings > Authorized domains. Include `localhost` for local work.
4. In Vercel > ShiftScript > Settings > Environment Variables, add **`PUBLIC_SIGNUP_ENABLED` = `true`**, for Production and Preview. Keep `STORAGE_MODE=firebase` and the existing `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `AI_PROVIDER`, and `GEMINI_API_KEY` values.
5. Public signup mode permits every signed-in Firebase user to use their own workspace, so `ALLOWED_EMAILS` no longer restricts access in this mode. Set the flag back to `false` to restore the previous email allowlist restriction and hide the signup link. The flag controls app access and signup UI; it does not disable Firebase's account-creation API.
6. From the VS Code terminal in your existing repository:

```bash
git add src server tests docs .env.example
git commit -m "Add signup, names and personal workspace setup"
git push origin main
```

Vercel normally deploys the pushed commit automatically. Wait for the new deployment to be Ready. If you save environment changes afterwards, redeploy so that deployment receives the new variables.

## Using it

- Sign-in screen > Create an account > enter full name, email and matching passwords (at least 8 characters; Firebase can impose a stronger policy).
- Next, confirm your name and enter a workspace name such as `Earny Studio`.
- Existing users sign in with their original account and name their workspace once; existing meetings and tasks are retained.
- Click the workspace card above Overview in the sidebar to edit the workspace name and your full name.
- Use Forgot password? to request a Firebase password-reset email.

Full names are saved in Firebase Auth `displayName` and in the workspace metadata. Firestore uses the existing `workspaces/{uid}` path, with a `workspace` metadata object containing `name`, `ownerName`, `id`, `ownerUid`, `createdAt`, and `updatedAt`. The current quota and meeting/task subcollections are retained. Workspace owners always come from the verified token, never client-submitted IDs.

The existing daily AI quota remains per personal workspace/user. There is no global project-wide AI budget in this update.

## Checks

```bash
npm run check
npx playwright install chromium
node tests/accounts-browser.js
npm run test:ui
```

Account API tests cover authentication, validation, duplicate workspace creation, edits, existing data preservation, per-account isolation, private allowlist mode, local persistence, and Firestore metadata merging. The account browser test simulates Firebase Auth and uses an in-memory store. It covers signup, password mismatch, names, workspace creation/rename, refresh, two accounts, password reset, sign-in errors and mobile layout.

No live Firebase account, password-reset email or hosted Vercel signup was exercised here. Verify these on your deployment after installing and setting the environment variable.

Official Firebase references:
- https://firebase.google.com/docs/auth/web/password-auth
- https://firebase.google.com/docs/auth/web/manage-users
