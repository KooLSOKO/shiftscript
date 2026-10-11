# Version 2.0.0

Implemented all five requested workflow improvements: private autosaved drafts; bulk review with shared owner/date/priority edits; manual tasks/checklists; combined task filtering/sorting; and PDF/CSV exports. Added projects, multiple workspaces, shared Member/Viewer invitation links, server permissions and 15 additional original SVG icons (42 total).

Preserved corporate cobalt, urgency colours, reduced-motion-aware animations, voice input, Gemini extraction, signup/names/reset, evidence and source links. Personal workspace documents upgrade in place. Meeting platform integration remains deferred.

Use `docs/UPDATE-v2.md`. This is a complete project ZIP, excluding private credentials, dependencies, generated builds and local data. Included tests use simulated auth/provider data; live Firebase/Gemini/Vercel checks happen in the owner's account.

## v3.1.2 — shared Notes

Notes adds notebook-photo capture, browser compression and editable Gemini text extraction. Keeping notes and processing notes are separate actions. Processing uses the existing reviewable meeting pipeline with a canonical source version and a final stale-note/membership check. Shifty, workspace search and activity recognize notes; original photo bytes are not saved. Existing Gemini/Firebase settings and workspace roles are reused.
