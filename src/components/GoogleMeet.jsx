import DisconnectButton from "./DisconnectButton.jsx";
import ProcessingLoader from "./ProcessingLoader.jsx";
import { useEffect, useState } from "react";
import { api, today, types } from "../lib.js";
import { Video, Link, RefreshCw, FileText, CheckCircle2 } from "./Icons.jsx";
export default function GoogleMeet({
  projects,
  workspace,
  readOnly,
  config,
  onCreated,
  embedded = false,
  autoLoad = false,
  initialForm,
  existingMeetings = [],
  onOpenExisting,
  onBeforeConnect,
  onBusyChange,
}) {
  const [connection, setConnection] = useState(null),
    [busy, setBusy] = useState(false),
    [operation, setOperation] = useState("working"),
    [error, setError] = useState(""),
    [meetings, setMeetings] = useState([]),
    [cursor, setCursor] = useState(null),
    [listed, setListed] = useState(false),
    [artifacts, setArtifacts] = useState(null),
    [url, setUrl] = useState(""),
    [preview, setPreview] = useState(null),
    [search, setSearch] = useState(""),
    [form, setForm] = useState({
      title: "",
      date: initialForm?.date || today(),
      type: initialForm?.type || "Project review",
      projectId: initialForm?.projectId || "",
    });
  useEffect(() => {
    let active = true;
    api("/google/status")
      .then(async (v) => {
        if (!active) return;
        setConnection(v);
        if (autoLoad && v.connected) {
          const result = await api("/google/meetings");
          if (!active) return;
          setMeetings(result.meetings);
          setCursor(result.cursor);
          setListed(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [autoLoad]);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  async function run(action, kind = "working") {
    setOperation(kind);
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function load(next = false) {
    const result = await api(
      "/google/meetings" +
        (next && cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
    );
    setMeetings((current) =>
      next
        ? [
            ...new Map(
              [...current, ...result.meetings].map((v) => [v.name, v]),
            ).values(),
          ]
        : result.meetings,
    );
    setCursor(result.cursor);
    setListed(true);
    setArtifacts(null);
  }
  async function select(selection, date) {
    const v = await api("/google/preview", {
      method: "POST",
      body: JSON.stringify(selection),
    });
    setPreview(v);
    setForm((f) => ({ ...f, title: v.title, date: date || today() }));
  }
  const sourceLabel =
    preview?.source.kind === "google-transcript"
      ? "Speaker-labelled transcript"
      : preview?.source.kind === "google-notes"
        ? "Meet Gemini notes"
        : "Google document";
  const alreadyImported =
    preview &&
    existingMeetings.find(
      (m) =>
        (preview.source.artifact &&
          m.source?.artifact === preview.source.artifact) ||
        (preview.source.documentId &&
          m.source?.documentId === preview.source.documentId),
    );
  const displayedMeetings = meetings.filter((m) =>
    [
      m.name,
      m.startTime,
      m.startTime &&
        new Date(m.startTime).toLocaleString("en-ZA", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
    ]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className={"google-page" + (embedded ? " google-embedded" : "")}>
      {!embedded && (
        <section className="panel integration-intro">
          <div className="integration-symbol">
            <Video size={34} />
          </div>
          <div>
            <p className="eyebrow">YOUR MEETING, ITS NEXT CHAPTER</p>
            <h2>Bring your Google meeting into ShiftScript</h2>
            <p className="summary">
              Import the notes or transcript Google has already generated.
              Review the source, process it and approve the next steps.
            </p>
          </div>
        </section>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="panel connection-panel">
        <p className="hint mb-4">
          Google permissions let ShiftScript retrieve the meeting source you
          select. Processing sends it to Gemini and shares it with your
          workspace.{" "}
          <a
            className="text-button"
            href="/privacy#google"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read how Google data is handled
          </a>
          .
        </p>
        <div className="section-heading">
          <h2>Your Google connection</h2>
          {connection?.connected && (
            <span className="badge">
              <CheckCircle2 size={15} /> Connected
            </span>
          )}
        </div>
        {!embedded && (
          <p className="summary">
            This connection belongs to your account. Importing a source shares
            its content with members of {workspace?.name || "this workspace"}.
          </p>
        )}
        {!connection ? (
          <p className="hint mt-4">Checking connection…</p>
        ) : !connection.ready ? (
          <p className="hint mt-4">
            Google connection is not configured yet. Ask your workspace
            administrator to complete the setup.
          </p>
        ) : connection.connected ? (
          <div className="integration-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => run(() => load())}
            >
              <RefreshCw size={17} /> Load recent meetings
            </button>
            {!embedded && (
              <DisconnectButton
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api("/google/connection", { method: "DELETE" });
                    setConnection({ ready: true, connected: false });
                    setPreview(null);
                    setMeetings([]);
                    setArtifacts(null);
                    setListed(false);
                  })
                }
              />
            )}
          </div>
        ) : (
          <button
            className="button primary mt-4"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const v = await api("/google/connect", { method: "POST" });
                await onBeforeConnect?.();
                window.location.assign(v.url);
              })
            }
          >
            <Link size={17} /> Connect Google
          </button>
        )}
        {!embedded && (
          <p className="hint mt-4">
            Read access to Meet and Google Docs is requested. You select what to
            import. Disconnect removes ShiftScript's saved connection; you can
            also revoke access in your Google account.
          </p>
        )}
      </section>
      {connection?.connected && (
        <>
          <section className="panel docs-panel">
            <details open={!embedded}>
              <summary>Have the notes link?</summary>
              <p className="summary">
                Paste the Google Docs link from your meeting notes. This also
                works when your meetings are unavailable through the Meet API.
              </p>
              <form
                className="docs-import"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => select({ kind: "document", url }));
                }}
              >
                <label>
                  Google Docs notes link
                  <input
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    required
                    placeholder="https://docs.google.com/document/d/…"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={busy || readOnly}
                  />
                </label>
                <button className="button primary" disabled={busy || readOnly}>
                  <FileText size={17} /> Preview notes
                </button>
              </form>
              <p className="hint mt-3">
                Notes summarise a discussion; they are not a full transcript.
                ShiftScript preserves names only when they appear in the source.
              </p>
            </details>
          </section>
          {listed && (
            <section className="panel recent-meeting-panel">
              <div className="section-heading">
                <h2>Recent meetings</h2>
                <span className="badge">{meetings.length}</span>
              </div>
              {meetings.length > 0 && (
                <label className="block mb-3">
                  Search recent meetings
                  <input
                    aria-label="Search recent Google meetings"
                    placeholder="Search date, time or meeting reference"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              )}
              {meetings.length ? (
                <div className="google-meetings">
                  {displayedMeetings.length === 0 && (
                    <p className="hint">
                      No meetings match your search. Clear it to see all loaded
                      meetings.
                    </p>
                  )}
                  {displayedMeetings.map((m, i) => (
                    <div className="google-meeting" key={m.name}>
                      <div>
                        <h3>
                          {m.startTime
                            ? new Date(m.startTime).toLocaleString("en-ZA", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : "Meeting " + (i + 1)}
                        </h3>
                        <p className="hint">
                          {m.endTime ? "Completed" : "In progress"}
                          {existingMeetings.some((saved) =>
                            saved.source?.artifact?.startsWith(m.name + "/"),
                          ) && " · Already imported"}
                        </p>
                      </div>
                      <button
                        className="button small"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            const v = await api(
                              "/google/artifacts?name=" +
                                encodeURIComponent(m.name),
                            );
                            setArtifacts({ ...v, meeting: m });
                          })
                        }
                      >
                        View sources
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="summary">
                  No meetings were returned. Try your Google Docs notes link
                  above.
                </p>
              )}
              {cursor && (
                <button
                  className="button mt-4"
                  disabled={busy}
                  onClick={() => run(() => load(true))}
                >
                  Load more meetings
                </button>
              )}
              {artifacts && (
                <div className="source-picker">
                  <h3>Available sources</h3>
                  {artifacts.artifacts.length ? (
                    artifacts.artifacts.map((a, i) => (
                      <button
                        className="button"
                        key={a.name}
                        disabled={busy || readOnly || !a.ready}
                        onClick={() =>
                          run(() =>
                            select(
                              { kind: "artifact", name: a.name },
                              artifacts.meeting.startTime
                                ? new Date(
                                    artifacts.meeting.startTime,
                                  ).toLocaleDateString("en-CA", {
                                    timeZone: "Africa/Johannesburg",
                                  })
                                : today(),
                            ),
                          )
                        }
                      >
                        <FileText size={17} />{" "}
                        {a.kind === "notes" ? "Gemini notes" : "Transcript"}{" "}
                        {i + 1} · {a.ready ? "Preview" : "Still preparing"}
                      </button>
                    ))
                  ) : (
                    <p className="hint">
                      No generated notes or transcripts yet. Enable note-taking
                      in Meet for your next eligible meeting, or use an existing
                      notes link.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}
          {preview && (
            <section className="panel import-preview">
              <div className="section-heading">
                <h2>Review your import</h2>
                <span className="badge">{sourceLabel}</span>
              </div>
              {alreadyImported && onOpenExisting && (
                <div className="import-existing">
                  <p className="hint">
                    This source was imported before. Open the saved meeting or
                    process its current content below.
                  </p>
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() => onOpenExisting(alreadyImported)}
                  >
                    Open saved meeting
                  </button>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    const v = await api("/google/import", {
                      method: "POST",
                      body: JSON.stringify({
                        ...form,
                        projectId: form.projectId || null,
                        previewId: preview.previewId,
                        ...(initialForm?.preparation
                          ? { preparation: initialForm.preparation }
                          : {}),
                      }),
                    });
                    await onCreated(v.meeting);
                  }, "processing");
                }}
              >
                <div className="field-grid">
                  <label>
                    Meeting title
                    <input
                      minLength={3}
                      maxLength={120}
                      required
                      value={form.title}
                      onChange={(e) =>
                        setForm({ ...form, title: e.target.value })
                      }
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Meeting date
                    <input
                      type="date"
                      required
                      value={form.date}
                      onChange={(e) =>
                        setForm({ ...form, date: e.target.value })
                      }
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Meeting type
                    <select
                      aria-label="Meeting type"
                      value={form.type}
                      onChange={(e) =>
                        setForm({ ...form, type: e.target.value })
                      }
                      disabled={busy}
                    >
                      {types.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Project
                    <select
                      aria-label="Project"
                      value={form.projectId}
                      onChange={(e) =>
                        setForm({ ...form, projectId: e.target.value })
                      }
                      disabled={busy}
                    >
                      <option value="">No project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <details className="transcript import-text" open>
                  <summary>
                    {sourceLabel} · {preview.transcript.length.toLocaleString()}{" "}
                    characters
                  </summary>
                  <pre>{preview.transcript}</pre>
                </details>
                <p className="hint">
                  Processing saves this source in the shared workspace. Confirm
                  you have permission to share it. The preview expires after 15
                  minutes.{" "}
                  <a
                    className="text-button"
                    href="/privacy#ai"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Check AI data handling before processing private content.
                  </a>
                </p>
                {config.provider !== "gemini" && (
                  <p className="form-error">
                    Google imports need live Gemini analysis. Ask your
                    administrator to enable it.
                  </p>
                )}
                {busy && operation === "processing" && (
                  <ProcessingLoader label="Reading your meeting notes…" />
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => setPreview(null)}
                  >
                    Clear preview
                  </button>
                  <button
                    className="button primary"
                    disabled={busy || readOnly || config.provider !== "gemini"}
                  >
                    {busy ? "Processing…" : "Process meeting"}
                  </button>
                </div>
              </form>
            </section>
          )}
        </>
      )}
      {busy && operation !== "processing" && (
        <p className="integration-busy" role="status">
          <RefreshCw className="spin" size={17} /> Working on it…
        </p>
      )}
    </div>
  );
}
