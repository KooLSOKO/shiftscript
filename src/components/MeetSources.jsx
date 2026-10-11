import { FileText, X } from "./Icons.jsx";

export default function MeetSources({
  id,
  meeting,
  artifacts,
  loading,
  error,
  busy,
  readOnly,
  onPreview,
  onClose,
}) {
  return (
    <section
      id={id}
      className="source-picker meet-sources"
      aria-label="Available sources"
      aria-busy={loading}
    >
      <div className="section-heading">
        <h3>Available sources</h3>
        {meeting && (
          <button
            type="button"
            className="icon-button"
            aria-label="Close available sources"
            onClick={onClose}
            disabled={busy}
          >
            <X size={18} />
          </button>
        )}
      </div>
      {!meeting ? (
        <p className="hint">
          Choose View sources beside a meeting to see its notes and transcript
          here.
        </p>
      ) : (
        <>
          <p className="meet-source-date">
            {meeting.startTime
              ? new Date(meeting.startTime).toLocaleString("en-ZA", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "Selected meeting"}
          </p>
          {loading ? (
            <p className="hint" role="status">
              Loading sources…
            </p>
          ) : error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : artifacts?.length ? (
            artifacts.map((a, i) => (
              <button
                type="button"
                className="button"
                key={a.name}
                disabled={busy || readOnly || !a.ready}
                onClick={() => onPreview(a, meeting)}
              >
                <FileText size={19} />{" "}
                <span>
                  {a.kind === "notes" ? "Gemini notes" : "Transcript"} {i + 1} ·{" "}
                  {a.ready ? "Preview" : "Still preparing"}
                </span>
              </button>
            ))
          ) : (
            <p className="hint">
              No generated notes or transcripts yet. Enable note-taking in Meet
              for your next eligible meeting, or use an existing notes link.
            </p>
          )}
        </>
      )}
    </section>
  );
}
