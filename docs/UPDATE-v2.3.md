# ShiftScript v2.3 — Sharing, mobile navigation and profiles

## What changed

- Home title: **ShiftScript by Earny | Turn Meetings Into Action**.
- Description: **Turn meeting transcripts and Google Meet notes into clear summaries, decisions and tasks. Review actions, track progress and collaborate with your team.**
- A 1200 × 630 social sharing image with Open Graph and large-image Twitter metadata in `index.html`. The canonical URL is `https://shiftscript.earny.co.za/`.
- Four mobile navigation buttons: Overview, Meetings, Tasks and Google Meet. Projects, Board, Team and Profile remain in the menu. The bar respects phone safe areas and uses labelled custom icons with an active state.
- A personal Profile view, accessible from the top-right person icon or menu. Shows the signed-in name and email, email verification state, current workspace role, memberships and task counts. View my tasks uses account IDs, matching the existing My work filter. Unassigned tasks are not included.
- New matching artwork for Meetings, Google Meet, Tasks/Board, Projects, Team and Profile. Overview keeps its existing illustration. Artwork is resized to compact WebP assets and decorative images have empty alternative text.

## Install on your Mac

1. Download and extract the ZIP. It creates a folder named `ShiftScript-v2.3`.
2. Open your existing project in VS Code and open **Terminal → New Terminal**.
3. Run each line separately:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' "/Users/soko/Downloads/ShiftScript-v2.3/" ./
npm ci
npm run check
git add .
git --no-pager diff --cached --name-only
git commit -m "Add sharing metadata, mobile Meetings navigation and profiles"
git push origin main
```

Keep your current `.env` locally. Check the staged list contains no `.env` or private credential files. Existing Vercel environment variables remain valid; this update needs no new variables, OAuth scopes or Firestore rules.

## After Vercel deploys

- Open the production URL on your phone: check all four bottom buttons and the person icon in the header.
- Open Profile and confirm your name, email and workspaces. Sign out and sign in as another user; their profile should show their own identity.
- Open each tab and check its artwork loads.
- Open `https://shiftscript.earny.co.za/art/social-sharing.png` to view the sharing image. Link previews may retain a cached older image until the sharing service refreshes it.
- The sharing metadata describes the app only; it does not embed private meeting or account data.

## Artwork creation

Built-in image generation was used with the existing `meeting-blue.webp` as a style reference. Prompts requested the same matte cobalt outfits, friendly Black South African professionals, pale ice-blue backdrops and coral/yellow/teal accents. Scenes: transcript organisation; a video meeting with a notes clipboard; task checklist; website project planning; colleagues with an invitation envelope; and a personal profile card. The social card includes ShiftScript, by Earny, “Turn meetings into action.” and the production domain. Full prompts and original file mapping are in `docs/ARTWORK-v2.3.json`.

## Scope

Profile is an account overview; this release does not add avatar uploads or account editing. Google Meet continues to import available notes/transcripts through the existing permissions. No recording bot or live capture is added.
