// One text limit for pasted transcripts, uploads, drafts and Google imports.
// Voice transcription retains its separate recording/output limits.
export const MAX_TRANSCRIPT_CHARS = 100_000;
export const MAX_TRANSCRIPT_FILE_BYTES = MAX_TRANSCRIPT_CHARS * 4;
export const MAX_RECAP_RECIPIENTS = 10;
