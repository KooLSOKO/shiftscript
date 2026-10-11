# ShiftScript v3.1.2 — your notebook, with a next step

## What changed

**Notes** is a new shared workspace tab, accessible from the desktop sidebar and phone menu. You can type a note, take a notebook photo or upload a document image. Save notes without creating any tasks.

- Automatic browser-side JPEG compression, retaining up to a 2400px long edge when possible. A 2 MB compressed-photo cap keeps requests within the existing server upload budget. There is no API Ninjas dependency or 200 KB restriction.
- Photo preview, original/compressed size, rotation and optional percentage crop. Apply the crop before extracting. If a browser cannot decode HEIC, export the image as JPEG/PNG.
- Explicit **Extract text** sends the prepared photo to Gemini. Writing is kept in its original language with line breaks; unclear handwriting is marked `[unclear]`. Review names, dates and missing words before saving. Append another scanned page or replace the text deliberately.
- Editable note title, date, project and related meeting. Search notes locally or with workspace search. Workspace members share notes; viewers can read but cannot scan, save or process.
- **Process with Gemini** creates a separate meeting summary and pending task proposals from the saved note. Choose the meeting type and date. Tasks still need approval before appearing on the dashboard. The original note is kept.
- Notes and meetings link in both directions, with the source version recorded. Updating notes never changes a previously processed meeting or its tasks. Deleting a note leaves processed meetings and approved tasks intact.
- Shifty can answer questions about saved notes and cite a note you can open. Her context uses up to eight relevant notes, with a 3000-character excerpt per note.
- Version checks prevent overwriting another member’s edits or saving an analysis after its source changed. Activity records show note saves, updates and deletion.

## Install

Download and extract **ShiftScript-v3.1.2.zip** into Downloads. In your existing VS Code project, open **Terminal → New Terminal** and run these commands one at a time:

```bash
cd "/Users/soko/Downloads/ShiftScript 2"
rsync -av --exclude='.env' --exclude='.env.local' --exclude='.git' --exclude='node_modules' --exclude='.data' --exclude='secrets' --exclude='.vercel' "/Users/soko/Downloads/ShiftScript-v3.1.2/" ./
npm ci
npm run check
git add .
git diff --cached --name-only
git commit -m "Add shared Notes with Gemini notebook scanning"
git push origin main
```

Press **q** if the staged file list opens in a pager. Check that private `.env` and service-account files are not staged. Vercel deploys the push automatically; refresh after its deployment becomes Ready.

## Existing configuration

Keep your current Firebase and Gemini settings. No new API key, paid OCR provider, OAuth scope, Firebase rule or index is required. Firestore notes are created below the existing workspace when you save your first note.

- `AI_PROVIDER=gemini` and the current `GEMINI_API_KEY` enable photo scanning and custom note analysis.
- Photo reading uses existing `ASSISTANT_MODEL`, defaulting to `gemini-3.8-flash`, with your current key and project quota. Meeting analysis still uses existing `GEMINI_MODEL`.
- Scans and note processing each consume one attempt from the existing `MAX_ANALYSES_PER_DAY` workspace cap (default 20, UTC reset). Failed requests also count. Saving/editing/deleting notes makes no AI call. Reprocessing the same saved version with identical meeting settings returns the existing meeting.
- Sample mode supports typed notes; photo extraction needs Gemini. Sample analysis only accepts the included fictional transcript, as before.

## Try it

1. Open **Notes → New note**.
2. Choose **Take photo** or **Upload photo**. Inspect the compressed preview, rotate or crop if needed, then choose **Extract text**.
3. Correct `[unclear]`, names and dates. Add a title, then **Save note**. No task is created.
4. Choose **Process with Gemini**, set meeting details, and generate the summary and proposals.
5. Review and approve an explicit task. Open its source meeting and use **Open source note** to return to the saved writing.
6. Ask Shifty “What does my portfolio notebook say?” and open its note source chip.

Original photo bytes are temporary: ShiftScript keeps saved note text and the filename/size metadata, not the photo. To keep an original image, retain it on your device. Take photos in good light, one page at a time. Handwriting recognition can make mistakes; review the extracted text before processing it.

## Verification

Unit/API and browser workflows cover access, stale edits, source changes, provider errors, actual photo compression/crop/rotation, save versus process, pending-task approval, source links, Shifty and responsive layouts. Live Gemini and Firebase calls are owner-managed acceptance checks; automated providers are simulated and no emails are sent.
