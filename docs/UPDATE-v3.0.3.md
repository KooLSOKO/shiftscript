# ShiftScript v3.0.3 — Earny-inspired homepage revision

The public home now follows Earny's visual direction more closely: Manrope typography, blue and navy, small section labels, a three-line headline, simple buttons and open sections. Four original clay illustrations replace the generic feature tiles. The page also shows a real ShiftScript dashboard preview with fictional demo data.

## Changes

- Revised headline: “Good meetings. Clear next steps. Built together.”
- A navy top strip and cleaner navigation.
- Open numbered workflow rows and four illustrated feature sections.
- Original clay artwork for meeting notes, reviewed tasks, shared projects and reminder emails.
- A real product screenshot, labelled as a fictional demo workspace.
- Simpler copy and fewer badges, cards and decorative boxes.
- Local Manrope fonts with their licence included.
- Lightweight transparent WebP icon assets, around 28–31 KB each; original PNGs included for reuse.
- Responsive 320–1440px layouts, keyboard focus, readable FAQ answers and reduced-motion support.

The homepage remains public at `/`. Sign in opens `/app`, and signup links use `/app?mode=signup`. Existing OAuth, invitations, account flows and environment variables are unchanged. Your Google verification submission does not need to be restarted for this update.

## Install on your Mac

Download and unzip `ShiftScript-v3.0.3.zip` into Downloads. Run these one at a time in the VS Code terminal:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.0.3/" ./
npm ci
npm run check
git add .
git commit -m "Refine homepage with Earny clay artwork"
git push origin main
```

Vercel will deploy the pushed update. Check `https://shiftscript.earny.co.za/` and the Sign in/Get started buttons afterwards. No new environment variables are required.

## Verification

69 unit/API tests and the production build passed. The built-home browser suite checks no-JavaScript content, native FAQs, assets, SEO, five viewport widths, app entry and old Google/invitation links. The account browser suite checks the landing signup CTA and existing simulated email/Google authentication and workspace preservation. New desktop and mobile screenshots are included in `docs/screenshots`.
