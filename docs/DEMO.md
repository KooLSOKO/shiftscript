# Two-minute end-to-end demo

1. **Overview**: “ShiftScript turns a meeting transcript into a plan, but a person stays in control of which tasks are created.” Show the stored-data metrics.
2. **New meeting > Load sample**: “This sample includes discussion, a decision, two named owners and one unassigned action.” In sample mode say clearly: “This is the free fixture for the interface demo. The same flow uses Gemini when connected.” For the brief's AI acceptance, use live analysis mode instead.
3. **Process transcript**: show summary, discussion points, decisions and follow-ups. “Keeping discussion separate prevents every sentence becoming a task.”
4. **Proposed tasks**: point to the transcript excerpt. Stephen has an explicit date; Kiyasha has no date; the mobile check has no owner. “The app preserves gaps instead of filling them with guesses.”
5. **Review & edit details**: assign the mobile review to yourself and set a date. Approve two tasks and reject one. “Only approved tasks are stored as work.”
6. **Task tracker**: change one status to In Progress. Open its details and add “First review complete; mobile screenshots pending.” Show its source-meeting link.
7. **Board**: show the same task under In Progress. Refresh the browser. “The state survives a refresh because it is persisted in Firestore” (or say local storage file if in local mode).
8. **Meeting history**: reopen the meeting to show decisions and reviewed proposals. Resubmit exactly the same title/date/type/transcript to show no duplicate tasks.

## Explain your decisions

- React and Tailwind provide a responsive UI; Node keeps the model key server-side.
- Firebase is used for the existing project and durable task storage.
- Structured JSON and validation make the extraction predictable enough to review.
- Human approval and evidence excerpts make errors visible before becoming work.
- Streaming meeting capture, calendar integrations and team collaboration are next steps.

For the hand-in include your repository URL, deployed app URL, live model output and refreshed Firebase-backed task screenshots. The supplied screenshots prove the sample flow only.

## Voice alternative

With Gemini enabled, upload or record a short voice note, preview it and choose Transcribe to text. Review the transcript and correct names before processing. Show the same approval flow and the saved voice-source filename. Explain that the recording is transcribed after capture, rather than streamed live.
