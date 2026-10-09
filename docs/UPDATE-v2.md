# Install the complete ShiftScript v2 update

This ZIP contains the **entire project**, including `src/main.jsx`, backend files, assets and the updated lockfile. Keep using your existing GitHub repository and Vercel project.

## Update your Mac project

1. Download and extract **ShiftScript-v2-complete.zip** into Downloads. You should have `/Users/soko/Downloads/ShiftScript-v2/`, containing `package.json`.
2. Stop the existing development server with **Control+C**.
3. In the VS Code terminal, run:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.git/' --exclude='.env' --exclude='node_modules/' --exclude='.data/' "/Users/soko/Downloads/ShiftScript-v2/" ./
npm ci
npm run check
npm run dev
```

If Finder names the extracted folder differently, substitute its actual path in the `rsync` command. The source folder must contain `package.json`. Do not use `--delete`. This copies the complete update and preserves your existing `.git`, `.env`, installed data and GitHub remote. `npm ci` installs the updated dependencies.

Open http://localhost:5173. Your existing local data upgrades when the app first writes; existing Firebase records keep their paths. Existing approved tasks and meeting links remain available.

## GitHub and Vercel

After testing locally, stop the development server and run:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
git status
git add src server api public docs tests examples package.json package-lock.json index.html vite.config.js vercel.json firebase.json firestore.rules README.md .env.example .firebaserc .gitignore .prettierignore .vscode
git commit -m "Add projects, shared workspaces and workflow improvements"
git push origin main
```

Your connected Vercel project should deploy automatically. Keep the existing install/build settings: **Install `npm ci`**, **Build `npm run build`**, **Output `dist`**. The Vercel Root Directory is the folder containing `package.json`, `index.html` and `src/main.jsx`.

Keep your existing Firebase and Gemini environment variables. To let invited teammates register, use `PUBLIC_SIGNUP_ENABLED=true` on Vercel (Production, and Preview if you use it). Redeploy after changing environment variables. Leave Gemini/Admin credentials in server variables, without a `VITE_` prefix. `.env.example` contains placeholders, not private credentials.

## Firebase check

- Authentication → Sign-in method → **Email/Password enabled**.
- Authentication → Settings → Authorized domains → your current Vercel domain and `localhost`.
- Authentication → Templates → **Email address verification**. The default Firebase verification email works; adjust the branding if desired.
- Use the existing default Firestore database and server Admin credentials. Browser Firestore access remains denied by `firestore.rules` because all reads/writes use the authenticated API.
- No manual database migration is required. Personal workspace membership metadata is added on the next workspace load. Shared workspace discovery uses Firestore's default single-field array indexes. If you previously disabled indexing for `workspace.memberUids` or `workspace.inviteEmails`, enable it again.

## Try the new features

1. **Projects → New project**. Choose a name, description and accent colour.
2. **New meeting**. Pick the project. Type or upload text, then **Save & close**. Reopen to recover your private draft. Edits also save automatically; raw audio files are not saved in drafts.
3. Process a meeting, **Select all pending**, set common owners/dates/priorities, **Apply details**, then approve or reject the selected proposals. You can still edit/review tasks individually.
4. **Task tracker → New task**. Add manual work, assign a workspace member, choose a project and add checklist steps. Save checkbox changes with **Save changes**.
5. Filter by owner, priority, status, project, source or due date. **Assigned to me** matches a confirmed workspace assignee, rather than guessing a person's identity from a transcript name.
6. **Export CSV / PDF** includes only tasks in the current filtered view. Meeting detail also exports a PDF summary and JSON notes.
7. **Team & workspace → Create invitation**. Select Member or Viewer. **Copy link** and send it yourself. ShiftScript does not send invitation emails.
8. The recipient signs in or creates an account with that exact email, opens **Switch workspace**, sends/opens the verification email, then chooses **Check verification → Join workspace**. A shared link opens this screen automatically.
9. **Switch workspace** creates or switches between separate workspaces. Projects are shared with everyone who can access their workspace; projects do not have separate permissions.

| Role | Access |
| --- | --- |
| Owner | Read/export, edit work, workspace settings, invitations, member roles/removal |
| Member | Read/export, meetings, projects, task approval, tasks, checklists and updates |
| Viewer | Read and export only |

This is a small-team version: 20 members/pending invitations per workspace, 50 projects, 50 meetings and 250 tasks. Workspace changes appear after refresh or your own edits; there are no real-time presence indicators. Owners cannot be removed or demoted in this release. There is no automatic email sender, task reminder scheduler or Meet/Teams/Zoom connection.

Drafts are private per user and workspace; one current draft is kept. A local browser copy supports recovery if a save fails. Draft version conflicts keep the local copy and stop overwriting the other draft. Task version conflicts require reopening the task before saving again. Removing a member removes their private workspace draft but keeps historical task ownership and progress notes.
