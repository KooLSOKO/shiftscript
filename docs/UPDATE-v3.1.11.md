# ShiftScript v3.1.11 — a clearer workspace and Shifty dashboard

## Desktop navigation

The sidebar now uses the available screen height for all eleven navigation destinations. Workspace/header spacing is tighter, rows share the available height, and the decorative meeting artwork is hidden on shorter desktop screens. Navigation labels stay bold at 14px; the profile entry stays accessible at the bottom. Normal laptop/desktop layouts no longer need the inner navigation scrollbar. Mobile retains the larger touch targets and scrolling drawer.

An unusually short desktop window (640px high or less), or heavy zoom, keeps scrollable navigation as an accessibility fallback with no visible scrollbar. Destinations are not clipped or removed.

## Shifty's dashboard

Entering Shifty shows a short blue/cyan/lilac gradient wash and a gentle entrance transition. Her selected navigation tab has a continuously changing gradient border, and the conversation panel uses the same subtle border treatment. The greeting uses gradient lettering and her original clay avatar. Three prompt cards offer Your tasks, Plan your day and Meeting catch-up. Selecting a card fills the question field for review; it does not send the question automatically.

The conversation, personal calendar panel, sources, avatar states and action review controls retain their existing structure. User messages have compact blue bubbles; Shifty's replies have a cleaner white reading area. Mobile stacks the prompt cards and retains a large send target. Reduced-motion mode uses static gradients and omits the entrance/hover movement.

## Readable replies

Shifty's Markdown formatting now displays as bold text, emphasis, headings, numbered tasks and bullet lists. Dates and statuses beneath a numbered task appear as a nested list. Raw double asterisks around task titles no longer show. Previously saved responses use the same formatting when reopened; no history rewrite is required. Your own typed messages stay as you wrote them.

This is a small, safe text-formatting subset, not HTML rendering. HTML/script-looking content and URLs remain inert text. Sources still use the existing authorized source buttons and links, and actions still require review. Gemini responses, task facts, permissions and approval behavior are unchanged.

## Install on your Mac

Unzip **ShiftScript-v3.1.11.zip** into Downloads. Open the existing **ShiftScript 2** project in VS Code → Terminal → New Terminal. Run commands **one at a time**:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env*' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.1.11/" ./
npm ci
npm run check
```

Continue after tests and build pass:

```bash
git add .
git --no-pager diff --cached --name-only
git commit -m "Fit desktop navigation and refresh Shifty dashboard"
git push origin main
```

Review staged filenames before committing; do not include private environment files or credentials. Wait for Vercel Ready and refresh the site. No new dependencies, environment variables, Google scopes, Firebase rules or database migration are required.

## Try it

1. Desktop: check the sidebar at your normal browser size. Every tab and your profile should fit without scrolling.
2. Open Shifty from another tab; watch the entrance wash and the changing selected-tab border.
3. On an empty conversation, select a prompt card, review the question and send it.
4. Ask about tasks and deadlines. Bold titles and lists should appear without raw formatting asterisks. Reopen an old chat to check it too.
5. Open a source and review a proposed action. Confirmation remains required.
6. On mobile, check the stacked cards, readable replies, navigation and send button. Test reduced motion if enabled on your device.

## Validation

130 unit/API tests and the production build pass. Four browser suites pass: shifty-design-browser, assistant-browser, profiles-browser and ux-controls-browser. Coverage includes desktop sidebar fitting at 1280×720, 1440×900, 1920×1080 and 1024×650, short-window fallback, gradient entrance/border behavior, reduced motion, formatted saved/new replies and inert HTML/URLs. The assistant suite verifies calendar selection, source opening, avatar states, task/block approvals, recap review/send with fictional SMTP and recovery. Profile access, verification badges, the restored desktop dial, immediate board moves/Undo, Escape and drafts remain covered. Mobile layouts are checked at 320/390/768px.

Checks use fictional data and simulated services, not live Google/Gemini/Firebase/email calls. Physical-device Safari and your deployed integration remain owner acceptance checks. The existing large-bundle build warning remains.
