# ShiftScript v3.1.12 — Shifty's full-height loading button

The Ask button now matches the question field's height on desktop and mobile. It follows the field when resized, and its width stays fixed while the answer is pending. The send control stays aligned when pressed, hovered and disabled.

During a real pending reply, the button shows a moving Earny-blue gradient, a sweeping highlight, two counter-rotating rings and a small breathing diamond. Desktop also shows Thinking…; mobile uses the larger orbit indicator. The existing avatar/status feedback remains. Reduced-motion mode keeps a static gradient and indicator, with no rotation, sweep or pulsing.

The button is disabled while waiting and the existing submission guard prevents duplicate requests. When a reply arrives, the send icon returns. A failed request stops the animation and keeps the original question for retry. No changes were made to AI responses, source links, review rules or calendar/email integrations.

## Install on your Mac

Unzip **ShiftScript-v3.1.12.zip** into Downloads. Open your existing **ShiftScript 2** project in VS Code → Terminal → New Terminal. Run each command separately:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env*' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.1.12/" ./
npm ci
npm run check
```

After tests and build pass:

```bash
git add .
git --no-pager diff --cached --name-only
git commit -m "Match Shifty send button height and add gradient loading"
git push origin main
```

Review staged filenames before committing; do not include private environment files or credentials. Wait for Vercel Ready and refresh the site. No new dependencies, environment variables, Firebase rules or Google scopes are needed.

## Try it

Open Shifty, type a question and press Ask. Check that the button matches the field before, during and after the reply. Try a resized text field on desktop and a phone layout. With device Reduce Motion enabled, the pending indicator should remain visible without movement.

## Validation

130 unit/API tests and the final production build pass. Two browser suites pass: shifty-send-browser and assistant-browser. Delayed requests verify equal field/button height, fixed width, waiting animation, one submission, reduced-motion behavior and restored icons at 1440/768/390/320px. A simulated failure verifies retained input and retry. Existing avatar states, private chat history, sources, calendar selection, action approvals and recap review/send are also covered using fictional adapters.

These checks do not send real mail or call live Google/Gemini/Firebase services. Physical-device Safari and the deployed integration remain owner acceptance checks. The existing large-bundle build warning remains.
