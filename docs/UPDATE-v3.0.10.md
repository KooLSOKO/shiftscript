# ShiftScript v3.0.10 — directional meeting sources

The supplied Uiverse controls are adapted to React JSX and scoped CSS using Earny blue (#2458E8), navy, Manrope and the existing custom icon system.

## Meeting source dial

The New meeting window now has four directions:

| Direction | Mode | What it does |
| --- | --- | --- |
| Up | Text | Paste a transcript or upload a .txt file. |
| Right | Voice | Upload audio or record a voice note, then review the transcript. |
| Down | Recent Google Meet | Browse accessible recent meetings and import a Google-generated source. |
| Left | Previous meeting | Reuse a saved meeting's transcript or open that meeting. |

Tap a labelled mode or drag the centre dial in that direction and release. A small movement or cancelled drag does not change the source. The selected mode stays highlighted. With keyboard focus on a mode, the arrow keys select their matching directions; Enter and Space activate the focused choice.

The control uses accessible radio controls for assistive technology and keyboard navigation. The drag area is limited to the centre dial, leaving the rest of the modal scrollable on phones. Touch targets remain at least 44 pixels. Reduced motion keeps the selection clear without tilting the dial.

Your draft title and transcript stay in place when browsing other sources. Selected audio stays available during mode switches in the open window; recordings are still not saved in drafts. Switching is disabled while requesting microphone permission, recording, transcribing or importing. Voice transcription still requires the existing Gemini setup.

## Disconnect button

The Google connection page now uses the supplied sliding-panel button design in Earny blue, with the custom disconnect icon. Hover or keyboard focus expands the icon panel across the button. Its accessible name remains Disconnect. Reduced motion uses a static layout with the label visible.

Clicking it immediately runs the existing Google disconnect action. The animation does not delay the request or alter its behaviour. The action remains disabled while a request is running.

## Install and deploy

Unzip ShiftScript-v3.0.10.zip into Downloads. Open your existing project in VS Code and run these **one at a time**:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.0.10/" ./
npm ci
npm run check
git add .
git commit -m "Add directional meeting sources and blue disconnect button"
git push origin main
```

Your existing local configuration, Git repository and data are preserved by the copy. Your connected Vercel project will deploy the push. No new environment variables, Firebase configuration or migrations are required.

## Check after deployment

1. Open New meeting and try all four labelled modes and drag directions on a phone and desktop.
2. Paste text, switch sources and return to Text. Confirm the draft remains.
3. Select an audio file, switch to Text and return to Voice. Confirm the file remains in this window.
4. Use the arrow keys while focused on a mode and confirm the selected mode and keyboard focus follow the direction.
5. On the Google Meet page, check the Disconnect button's hover and keyboard focus animation. Activating it removes the connection and returns to Connect Google.

Automated checks use fictional transcripts and mocked Google/audio services; they do not disconnect your real Google account or send real meeting emails.

Verification: production build and 69 unit/API tests pass. The updated browser smoke, Google integration and built experience suites pass, with phone/tablet/desktop checks and mocked external services.
