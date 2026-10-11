# ShiftScript v3.1.1 — Meet Shifty

Shifty is your meeting and planning assistant. She is warm, attentive and practical, with occasional gentle humour when it fits. Her character should make planning easier while preserving grounded answers, source links and review before any changes.

## What changed

- The sidebar, Overview shortcut, chat heading, message author and question input now use Shifty’s name.
- Four original transparent PNG portraits in Earny’s clay art style: **ready**, **thinking**, **replying** and **error**. They share her face, braided bun, blue blazer and gold earrings.
- The header changes expression according to real request activity. Loading and pending operations show thinking; a successful reply shows replying; an error shows a reassuring retry expression. Clearing the conversation returns her to ready. Replies have small portraits beside her name.
- The welcome screen introduces Shifty and offers practical starting questions.
- A subtle thinking animation respects reduced-motion settings. Portraits are locally served and preloaded for smooth state changes on desktop and mobile.
- Her server instructions define her tone and identity. Existing Google Calendar, meeting context, private history and reviewed actions remain in place. No new AI service or API key is required.
- Includes the previous Gemini diagnostic patch.

## Install the update

1. Download and extract **ShiftScript-v3.1.1.zip** into Downloads.
2. Open your existing ShiftScript project in VS Code, then choose **Terminal → New Terminal**.
3. Run each command separately, waiting for it to finish:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.env.local' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.1.1/" ./
npm ci
npm run check
git add .
git diff --cached --name-only
git commit -m "Introduce Shifty with clay avatar states and personality"
git push origin main
```

If the file list opens in a pager, press **q** to return to the terminal. Check that private `.env` files and service-account credentials are not staged.

Vercel deploys after the push. Refresh the site once deployment is Ready. Your existing environment variables and Google connections are reused.

## Try it

- Open **Shifty**, or select **Ask Shifty** on Overview.
- Ask “Who are you?” to hear her introduction.
- Ask “What tasks are assigned to me?” and watch the thinking and reply states.
- Ask for a calendar block and review it before confirming.
- Clear the conversation to see her ready state again.

## Artwork

Assets live at `public/art/shifty/{ready,thinking,replying,error}.png`. Creation prompts and provenance are in [SHIFTY-ARTWORK.json](SHIFTY-ARTWORK.json). They were created with the built-in image-generation tool; deployment copies preserve transparency. These are static portrait states with a CSS thinking animation, not lip-synced video.
