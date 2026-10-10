# ShiftScript v2.3.1 — Name-aware My tasks

## What changed

The Profile **View my tasks** button, Overview **My work** shortcut, **Assigned to me** filter and Profile task counts now use the same matching rule:

1. A task linked to an account matches that account. If it is linked to another account, matching text does not override that assignment.
2. For name-only tasks, match the signed-in user's full name, first name or last name exactly, ignoring letter case and extra spaces. Full names containing middle names also match the first-name + last-name form.
3. Do not guess from email addresses or partial substrings. “Sokoto” does not match “Soko”.

For Victor Soko, name-only owners **Victor**, **Soko** and **Victor Soko** now appear in My tasks automatically. The same rule applies to every user using the name on their own account, within the currently selected workspace. This is a filter change: it does not change task owners or permissions. Two people sharing a first name or surname can see the same name-only task; choosing a Workspace assignee makes its ownership explicit.

Profile counts follow this rule, with separate active and completed totals. The Profile shortcut clears other filters before opening My tasks; filters subsequently selected continue to apply.

## Install and deploy

Extract the ZIP to Downloads. Run each command separately in the VS Code terminal:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' "/Users/soko/Downloads/ShiftScript-v2.3.1/" ./
npm ci
npm run check
git add .
git --no-pager diff --cached --name-only
git commit -m "Match My tasks by account, first name and surname"
git push origin main
```

Keep your existing local `.env` and Vercel configuration. This update requires no new environment variables, Firebase rules, migration or Google permissions.

## Verification

- Unit tests cover case/spacing, first/full/last names, middle names, Unicode normalization, multiple users, explicit account precedence, substring rejection, absent identity and combined filters.
- Authenticated browser checks seed name-only and account-linked tasks, open Profile, check matching counts, click View my tasks and verify only the four matching tasks appear.
- Existing mobile, meeting-processing, collaboration, Google-import and email suites are retained.
