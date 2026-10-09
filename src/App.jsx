import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  NotebookPen,
  Columns3,
  ListTodo,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Check,
  Clock,
  Flag,
  Upload,
  Search,
  Download,
  RefreshCw,
  LogOut,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  CalendarDays,
  MessageSquare,
} from "./components/Icons.jsx";
import {
  api,
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  statuses,
  types,
  fields,
  formatDate,
  today,
  overdue,
  exportFile,
} from "./lib.js";
import Modal from "./components/Modal.jsx";
import Fields from "./components/Fields.jsx";
import Proposal from "./components/Proposal.jsx";
import AudioInput from "./components/AudioInput.jsx";
import Priority from "./components/Priority.jsx";
const tabs = [
  ["dashboard", "Overview", LayoutDashboard],
  ["meetings", "Meetings", NotebookPen],
  ["tasks", "Task tracker", ListTodo],
  ["board", "Board", Columns3],
];
export default function App() {
  const [config, setConfig] = useState(null),
    [user, setUser] = useState(undefined),
    [data, setData] = useState({ meetings: [], tasks: [] }),
    [tab, setTab] = useState("dashboard"),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [loading, setLoading] = useState(true),
    [newMeeting, setNewMeeting] = useState(false),
    [meetingId, setMeetingId] = useState(null),
    [taskId, setTaskId] = useState(null),
    [menu, setMenu] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All");
  async function reload() {
    const d = await api("/workspace");
    setData(d);
    return d;
  }
  useEffect(() => {
    api("/config")
      .then(setConfig)
      .catch((e) => {
        setError(
          "Could not connect to the API. Run npm run dev or check the deployment. " +
            e.message,
        );
        setLoading(false);
      });
    const unsub = auth ? onAuthStateChanged(auth, setUser) : () => {};
    if (!auth) setUser(null);
    return unsub;
  }, []);
  useEffect(() => {
    if (!config) return;
    if (config.authRequired && !user) {
      setLoading(false);
      setData({ meetings: [], tasks: [] });
      return;
    }
    setLoading(true);
    reload()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [config, user]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const meeting = data.meetings.find((m) => m.id === meetingId),
    task = data.tasks.find((t) => t.id === taskId);
  const pending = data.meetings.reduce(
      (n, m) =>
        n + m.proposals.filter((p) => p.reviewStatus === "pending").length,
      0,
    ),
    active = data.tasks.filter((t) => t.status !== "Completed"),
    completed = data.tasks.filter((t) => t.status === "Completed"),
    blocked = data.tasks.filter((t) => t.status === "Blocked"),
    late = data.tasks.filter(overdue),
    actions = data.meetings.reduce((n, m) => n + m.proposals.length, 0);
  const filtered = data.tasks.filter(
    (t) =>
      (filter === "All" ||
        (filter === "Overdue" ? overdue(t) : t.status === filter)) &&
      (t.title + " " + t.owner + " " + t.meetingTitle)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function openMeeting(id) {
    setMeetingId(id);
    setTab("meetings");
    setMenu(false);
  }
  async function changeStatus(t, status) {
    try {
      await api("/tasks/" + t.id, {
        method: "PATCH",
        body: JSON.stringify({ ...fields(t), status }),
      });
      await reload();
      setToast("Task status saved.");
    } catch (e) {
      setError(e.message);
    }
  }
  if (config?.authRequired && !user)
    return <Login config={config} error={error} setError={setError} />;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setTab("dashboard");
            setMeetingId(null);
          }}
        >
          <img src="/favicon.svg" alt="" />
          <span>
            ShiftScript
            <span className="brand-caption">CONVERSATION → ACTION</span>
          </span>
        </a>
        <button
          className="icon-button mobile-close"
          aria-label="Close menu"
          onClick={() => setMenu(false)}
        >
          <X />
        </button>
        <div className="workspace-pill">
          <span className="avatar">SS</span>
          <div>
            <strong>Your workspace</strong>
            <span>
              {config?.storage === "firebase"
                ? "Connected to Firebase"
                : "Local sample workspace"}
            </span>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              className={"nav-item " + (tab === id ? "selected" : "")}
              onClick={() => {
                setTab(id);
                setMeetingId(null);
                setMenu(false);
              }}
            >
              <Icon size={19} />
              {label}
              {id === "meetings" && pending > 0 && (
                <span className="nav-count">{pending}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <img src="/art/meeting-blue.webp" alt="" />
          <h3>Good meetings go somewhere.</h3>
          <p>Keep decisions, owners and next steps in the same place.</p>
          <button className="text-button" onClick={() => setNewMeeting(true)}>
            Start with a transcript
            <ArrowRight size={15} />
          </button>
        </div>
        <div className="sidebar-foot">
          <span className="avatar dark">
            {user?.email?.slice(0, 2).toUpperCase() || "VS"}
          </span>
          <div>
            <strong>{user?.email || "ShiftScript demo"}</strong>
            <span>
              {config?.provider === "gemini"
                ? "Gemini connected"
                : "Sample mode · no API calls"}
            </span>
          </div>
          {user && (
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() => signOut(auth)}
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>
      {menu && (
        <button
          className="menu-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              Workspace <span>/</span> {tabs.find((t) => t[0] === tab)?.[1]}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="mode-badge">
              <span />
              {config?.provider === "gemini" ? "Live analysis" : "Sample mode"}
            </span>
            <button
              className="icon-button"
              aria-label="Refresh workspace"
              disabled={loading}
              onClick={() => {
                setError("");
                reload().catch((e) => setError(e.message));
              }}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>
        <main id="main">
          {error && (
            <div className="alert" role="alert">
              <AlertCircle size={19} />
              <p>{error}</p>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {config?.provider === "sample" && (
            <div className="sample-banner">
              <span>You're in sample mode.</span> Try the included fictional
              transcript. Connect Gemini in .env for your own meetings.
            </div>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">KEEP THE CONVERSATION MOVING</p>
              <h1>
                {meeting
                  ? meeting.title
                  : tab === "dashboard"
                    ? "Less follow-up. More follow-through."
                    : tab === "meetings"
                      ? "Every meeting, a clear next step."
                      : tab === "tasks"
                        ? "The work, all in one place."
                        : "A little clarity goes a long way."}
              </h1>
              <p>
                {meeting
                  ? `${formatDate(meeting.date)} · ${meeting.type}`
                  : tab === "dashboard"
                    ? "A calm place for your meetings, decisions and everything that comes next."
                    : tab === "meetings"
                      ? "Turn conversations into work you can review and trust."
                      : tab === "tasks"
                        ? "Keep an eye on who owns what, and what happens next."
                        : "Move approved tasks from a first step to a finished one."}
              </p>
            </div>
            <button
              className="button primary"
              onClick={() => setNewMeeting(true)}
            >
              <Plus size={18} />
              New meeting
            </button>
          </div>
          {loading ? (
            <div className="empty">
              <RefreshCw className="spin" />
              <h3>Opening your workspace…</h3>
            </div>
          ) : (
            <>
              {tab === "dashboard" && (
                <>
                  <section className="hero">
                    <div>
                      <span className="badge cream">
                        FROM THE ROOM TO THE ROADMAP
                      </span>
                      <h2>
                        Talk it through.
                        <br />
                        Put it in motion.
                      </h2>
                      <p>
                        Capture the important bits, check the details,
                        <br className="hidden md:block" /> and give every next
                        step a place to land.
                      </p>
                      <button
                        className="button primary"
                        onClick={() => setNewMeeting(true)}
                      >
                        Add your first next step
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                    <img
                      src="/art/meeting-blue.webp"
                      alt="Clay-style illustration of colleagues planning their next steps"
                    />
                  </section>
                  <section className="stats">
                    {[
                      [
                        data.meetings.length,
                        "Meetings processed",
                        NotebookPen,
                        "sage",
                      ],
                      [actions, "Actions identified", Flag, "yellow"],
                      [pending, "Awaiting approval", Clock, "peach"],
                      [active.length, "Active tasks", ListTodo, "sage"],
                      [completed.length, "Completed", CheckCircle2, "sage"],
                      [blocked.length, "Blocked", AlertCircle, "peach"],
                      [late.length, "Overdue", CalendarDays, "peach"],
                    ].map(([v, label, Icon, color]) => (
                      <article className="stat" key={label}>
                        <div className={"stat-icon " + color}>
                          <Icon size={18} />
                        </div>
                        <strong>{v}</strong>
                        <span>{label}</span>
                      </article>
                    ))}
                  </section>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Recent conversations</h2>
                        <button
                          className="text-button"
                          onClick={() => {
                            setTab("meetings");
                            setMeetingId(null);
                          }}
                        >
                          View all
                          <ArrowUpRight size={16} />
                        </button>
                      </div>
                      {data.meetings.length ? (
                        data.meetings
                          .slice(0, 4)
                          .map((m) => (
                            <MeetingRow
                              key={m.id}
                              m={m}
                              onOpen={() => openMeeting(m.id)}
                            />
                          ))
                      ) : (
                        <Empty
                          icon={NotebookPen}
                          title="A fresh page for your next meeting"
                          text="Add a transcript to start building your meeting history."
                          action="Try a sample meeting"
                          onClick={() => setNewMeeting(true)}
                        />
                      )}
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Needs your attention</h2>
                        <span className="badge">
                          {pending + late.length + blocked.length}
                        </span>
                      </div>
                      {pending > 0 && (
                        <div className="attention">
                          <Clock />
                          <div>
                            <h3>{pending} proposed tasks to review</h3>
                            <p>Check owners and dates before approving.</p>
                          </div>
                          <button
                            className="icon-button"
                            aria-label="Review proposed tasks"
                            onClick={() =>
                              openMeeting(
                                data.meetings.find((m) =>
                                  m.proposals.some(
                                    (p) => p.reviewStatus === "pending",
                                  ),
                                ).id,
                              )
                            }
                          >
                            <ArrowRight size={19} />
                          </button>
                        </div>
                      )}
                      {[
                        ...new Map(
                          [...late, ...blocked].map((t) => [t.id, t]),
                        ).values(),
                      ]
                        .slice(0, 3)
                        .map((t) => (
                          <div key={t.id} className="attention">
                            <AlertCircle />
                            <div>
                              <button
                                className="link"
                                onClick={() => setTaskId(t.id)}
                              >
                                {t.title}
                              </button>
                              <p>
                                {t.owner} · {overdue(t) ? "Overdue" : "Blocked"}
                              </p>
                            </div>
                          </div>
                        ))}
                      {!pending && !late.length && !blocked.length && (
                        <Empty
                          icon={CheckCircle2}
                          title="A clear desk. A clear head."
                          text="Pending approvals, blocked work and overdue tasks will appear here."
                        />
                      )}
                    </section>
                  </div>
                </>
              )}
              {tab === "meetings" &&
                (meeting ? (
                  <MeetingDetail
                    meeting={meeting}
                    reload={reload}
                    onBack={() => setMeetingId(null)}
                    setError={setError}
                    onTask={setTaskId}
                  />
                ) : (
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Meeting history</h2>
                      <span className="badge">
                        {data.meetings.length} meetings
                      </span>
                    </div>
                    {data.meetings.length ? (
                      data.meetings.map((m) => (
                        <MeetingRow
                          key={m.id}
                          m={m}
                          onOpen={() => openMeeting(m.id)}
                        />
                      ))
                    ) : (
                      <Empty
                        icon={NotebookPen}
                        title="Start with the conversation"
                        text="Paste a transcript or upload a .txt file. Your notes and decisions will stay here."
                        action="Create a meeting"
                        onClick={() => setNewMeeting(true)}
                      />
                    )}
                  </section>
                ))}
              {(tab === "tasks" || tab === "board") && (
                <>
                  <div className="toolbar">
                    <label className="search">
                      <Search size={17} />
                      <input
                        aria-label="Search tasks"
                        placeholder="Search tasks, people or meetings…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filter tasks"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      {["All", ...statuses, "Overdue"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <button
                      className="button"
                      onClick={() =>
                        exportFile("shiftscript-tasks.json", data.tasks)
                      }
                    >
                      <Download size={16} />
                      Export
                    </button>
                  </div>
                  {tab === "tasks" ? (
                    <section className="panel task-table">
                      {filtered.length ? (
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Task & source</th>
                                <th>Owner</th>
                                <th>Deadline</th>
                                <th>Priority</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filtered.map((t) => (
                                <tr key={t.id}>
                                  <td>
                                    <button
                                      className="link"
                                      onClick={() => setTaskId(t.id)}
                                    >
                                      {t.title}
                                    </button>
                                    <button
                                      className="source-link"
                                      onClick={() => openMeeting(t.meetingId)}
                                    >
                                      {t.meetingTitle}
                                      <ArrowUpRight size={12} />
                                    </button>
                                  </td>
                                  <td>
                                    <span className="owner">
                                      <span className="avatar tiny">
                                        {t.owner.slice(0, 2).toUpperCase()}
                                      </span>
                                      {t.owner}
                                    </span>
                                  </td>
                                  <td className={overdue(t) ? "late" : ""}>
                                    {t.dueDate
                                      ? formatDate(t.dueDate)
                                      : t.deadline}
                                  </td>
                                  <td>
                                    <Priority value={t.priority}/>
                                  </td>
                                  <td>
                                    <select
                                      aria-label={"Status for " + t.title}
                                      value={t.status}
                                      onChange={(e) =>
                                        changeStatus(t, e.target.value)
                                      }
                                    >
                                      {statuses.map((s) => (
                                        <option key={s}>{s}</option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <Empty
                          icon={ListTodo}
                          title={
                            data.tasks.length
                              ? "No matching tasks"
                              : "A place for approved work"
                          }
                          text={
                            data.tasks.length
                              ? "Try another search or status filter."
                              : "Review and approve a proposed task in Meetings to add it here."
                          }
                        />
                      )}
                    </section>
                  ) : (
                    <div className="kanban">
                      {statuses.map((status, i) => (
                        <section className="kanban-column" key={status}>
                          <h2>
                            <span className={"column-dot dot-" + i} />
                            {status}
                            <span className="badge">
                              {
                                filtered.filter((t) => t.status === status)
                                  .length
                              }
                            </span>
                          </h2>
                          {filtered
                            .filter((t) => t.status === status)
                            .map((t) => (
                              <article className={"task-card priority-card-"+t.priority.toLowerCase()} key={t.id}>
                                <Priority value={t.priority}/>
                                <button
                                  className="card-title"
                                  onClick={() => setTaskId(t.id)}
                                >
                                  {t.title}
                                </button>
                                <button
                                  className="source-link"
                                  onClick={() => openMeeting(t.meetingId)}
                                >
                                  {t.meetingTitle}
                                  <ArrowUpRight size={12} />
                                </button>
                                <div className="task-card-foot">
                                  <span>{t.owner}</span>
                                  <span className={overdue(t) ? "late" : ""}>
                                    {t.dueDate
                                      ? formatDate(t.dueDate)
                                      : "No date set"}
                                  </span>
                                </div>
                                <select
                                  aria-label={"Status for " + t.title}
                                  value={t.status}
                                  onChange={(e) =>
                                    changeStatus(t, e.target.value)
                                  }
                                >
                                  {statuses.map((s) => (
                                    <option key={s}>{s}</option>
                                  ))}
                                </select>
                              </article>
                            ))}
                          {!filtered.some((t) => t.status === status) && (
                            <p className="column-empty">Nothing here yet.</p>
                          )}
                        </section>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <footer>
            ShiftScript <span>·</span> Built for a better next step.
          </footer>
        </main>
      </div>
      {newMeeting && (
        <NewMeeting
          config={config}
          onClose={() => setNewMeeting(false)}
          onCreated={async (m) => {
            await reload();
            setNewMeeting(false);
            openMeeting(m.id);
            setToast("Meeting ready. Review the proposed tasks below.");
          }}
        />
      )}
      {task && (
        <TaskModal
          task={task}
          onClose={() => setTaskId(null)}
          reload={reload}
          onSource={() => {
            setTaskId(null);
            openMeeting(task.meetingId);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
function Empty({ icon: Icon, title, text, action, onClick }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="button small" onClick={onClick}>
          {action}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
function MeetingRow({ m, onOpen }) {
  const n = m.proposals.filter((p) => p.reviewStatus === "pending").length;
  return (
    <button className="meeting-row" onClick={onOpen}>
      <span className="meeting-icon">
        <FileText size={21} />
      </span>
      <div>
        <h3>{m.title}</h3>
        <p>
          {formatDate(m.date)} · {m.type}
        </p>
      </div>
      <span className={"badge " + (n ? "yellow" : "")}>
        {n ? n + " to review" : m.proposals.length + " actions"}
      </span>
      <ArrowUpRight size={17} />
    </button>
  );
}
function MeetingDetail({ meeting: m, reload, onBack, setError, onTask }) {
  return (
    <>
      <div className="flex flex-wrap gap-3 mb-5">
        <button className="button small" onClick={onBack}>
          ← Meeting history
        </button>
        <button
          className="button small"
          onClick={() => exportFile("shiftscript-meeting-" + m.id + ".json", m)}
        >
          <Download size={15} />
          Export notes
        </button>
        <span className="badge">
          {m.provider === "sample"
            ? "Fictional sample · preset results"
            : "Gemini analysis"}
        </span>
        {m.source?.kind === 'audio' && <span className="badge">Voice source · {m.source.name}</span>}
      </div>
      <div className="meeting-detail-grid">
        <div>
          <section className="panel notes">
            <p className="eyebrow">THE MEETING, AT A GLANCE</p>
            <h2>Meeting summary</h2>
            <p className="summary">{m.summary}</p>
            {[
              ["Key discussion points", m.discussionPoints],
              ["Decisions", m.decisions],
              ["Follow-ups", m.followUps],
            ].map(([label, items]) => (
              <div className="note-section" key={label}>
                <h3>{label}</h3>
                {items.length ? (
                  <ul>
                    {items.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">None identified.</p>
                )}
              </div>
            ))}
          </section>
          <details className="panel transcript mt-5">
            <summary>Original transcript</summary>
            <pre>{m.transcript}</pre>
          </details>
        </div>
        <section className="panel proposals">
          <div className="section-heading">
            <h2>Proposed tasks</h2>
            <span className="badge">
              {m.proposals.filter((p) => p.reviewStatus === "pending").length}{" "}
              pending
            </span>
          </div>
          <p className="hint mb-5">
            Review each commitment before it joins the tracker. Nothing is
            approved automatically.
          </p>
          {m.proposals.length ? (
            m.proposals.map((p) => (
              <div key={p.id}>
                <Proposal
                  proposal={p}
                  meetingId={m.id}
                  onDone={reload}
                  onError={setError}
                />
                {p.taskId && (
                  <button
                    className="text-button mb-5"
                    onClick={() => onTask(p.taskId)}
                  >
                    Open approved task
                    <ArrowUpRight size={15} />
                  </button>
                )}
              </div>
            ))
          ) : (
            <Empty
              icon={CheckCircle2}
              title="No actionable commitments"
              text="This transcript has no proposed tasks to review."
            />
          )}
        </section>
      </div>
    </>
  );
}
function NewMeeting({ config, onClose, onCreated }) {
  const [form, setForm] = useState({
      title: "",
      date: today(),
      type: "Project review",
      transcript: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [audioBusy,setAudioBusy] = useState(false);
  const change = (key, value) => setForm({ ...form, [key]: value });
  async function submit(e) {
    e.preventDefault();
    if(audioBusy) return;
    setBusy(true);
    setError("");
    try {
      const d = await api("/meetings", {
        method: "POST",
        body: JSON.stringify(form),
      });
      await onCreated(d.meeting);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt"))
      return setError("Choose a .txt transcript.");
    if (file.size > 60000)
      return setError("Choose a transcript under 60 KB (15,000 characters).");
    try {
      const text = await file.text();
      if (text.length > 15000)
        return setError("Transcript must be under 15,000 characters.");
      setForm(previous => ({...previous,transcript:text,source:{kind:'text',name:file.name}}));
      setError("");
    } catch {
      setError("Could not read this file.");
    }
  }
  return (
    <Modal
      title="A new conversation"
      onClose={() => {
        if (!busy && !audioBusy) onClose();
      }}
    >
      <p className="muted mb-5">
        Add a transcript or voice recording. We’ll find the decisions and next steps.
      </p>
      <form onSubmit={submit}>
        <div className="field-grid">
          <label className="col-span-full">
            Meeting title
            <input
              required
              minLength={3}
              maxLength={120}
              placeholder="e.g. Dashboard project review"
              value={form.title}
              onChange={(e) => change("title", e.target.value)}
            />
          </label>
          <label>
            Meeting date
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => change("date", e.target.value)}
            />
          </label>
          <label>
            Meeting type
            <select
              value={form.type}
              onChange={(e) => change("type", e.target.value)}
            >
              {types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
        <AudioInput config={config} disabled={busy} onBusy={setAudioBusy} onTranscript={(transcript,source)=>{setForm(previous=>({...previous,transcript,source}));setError("");}}/>
        <div className="flex items-center justify-between gap-3 mt-5 mb-2">
          <span className="field-label">Transcript</span>
          <div className="flex gap-3">
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setForm({
                  title: "Dashboard project review",
                  date: "2026-10-09",
                  type: "Project review",
                  transcript: config.sampleTranscript,
                });
                setError("");
              }}
            >
              Load sample
            </button>
            <label className="text-button upload">
              <Upload size={14} />
              Upload .txt
              <input
                type="file"
                accept=".txt,text/plain"
                disabled={busy}
                onChange={(e) => upload(e.target.files?.[0])}
              />
            </label>
          </div>
        </div>
        <textarea
          aria-label="Meeting transcript"
          required
          minLength={40}
          maxLength={15000}
          rows={10}
          value={form.transcript}
          onChange={(e) => change("transcript", e.target.value)}
          placeholder="Paste a transcript here. Speaker names help identify owners."
        />
        <p className="hint mt-2">
          {form.transcript.length.toLocaleString()} / 15,000 characters · Use
          fictional or approved transcripts.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy || audioBusy || !config}>
            {busy ? (
              <>
                <RefreshCw size={16} className="spin" />
                Reading the conversation…
              </>
            ) : (
              <>
                Process transcript
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function TaskModal({ task, onClose, reload, onSource }) {
  const [value, setValue] = useState({ ...fields(task), status: task.status }),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("");
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await api("/tasks/" + task.id, {
        method: "PATCH",
        body: JSON.stringify(value),
      });
      await reload();
      setSaved("Changes saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function addNote(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/tasks/" + task.id + "/notes", {
        method: "POST",
        body: JSON.stringify({ text: note }),
      });
      setNote("");
      await reload();
      setSaved("Progress update saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Task details" onClose={onClose}>
      <button className="source-link mb-4" onClick={onSource}>
        From: {task.meetingTitle}
        <ArrowUpRight size={14} />
      </button>
      <p className="hint mb-3">Task ID: {task.id}</p>
      <form onSubmit={save}>
        <Fields value={value} onChange={setValue} />
        <label className="block mt-4">
          Status
          <select
            value={value.status}
            onChange={(e) => setValue({ ...value, status: e.target.value })}
          >
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <blockquote className="evidence mt-5">“{task.evidence}”</blockquote>
        <button className="button primary mt-4" disabled={busy}>
          Save changes
          <Check size={16} />
        </button>
      </form>
      <div className="note-section">
        <h3 className="flex gap-2 items-center">
          <MessageSquare size={17} />
          Progress updates
        </h3>
        {task.notes.length ? (
          task.notes.map((n) => (
            <div className="progress-note" key={n.id}>
              <p>{n.text}</p>
              <span>{new Date(n.createdAt).toLocaleString("en-ZA")}</span>
            </div>
          ))
        ) : (
          <p className="hint">No progress updates yet.</p>
        )}
        <form onSubmit={addNote}>
          <label className="mt-4 block">
            Add a progress update
            <textarea
              rows={2}
              required
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What moved forward? What’s in the way?"
            />
          </label>
          <button className="button small mt-3" disabled={busy || !note.trim()}>
            Add update
          </button>
        </form>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="success-text" role="status">
          {saved}
        </p>
      )}
    </Modal>
  );
}
function Login({ config, error, setError }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  async function login(e) {
    e.preventDefault();
    if (!auth) return;
    setBusy(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError(
        "Sign-in failed. Check your email, password and Firebase Email/Password provider.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <div className="login-art">
        <img src="/art/meeting-blue.webp" alt="Clay-style colleagues planning together" />
        <h1>
          Talk it through.
          <br />
          Put it in motion.
        </h1>
        <p>Your next steps deserve a place to land.</p>
      </div>
      <section className="login-form">
        <div className="brand mb-8">
          <img src="/favicon.svg" alt="" />
          ShiftScript
        </div>
        <h2>Welcome to your workspace.</h2>
        <p className="muted mb-6">
          Sign in with an account created in Firebase Authentication.
        </p>
        {!auth ? (
          <div className="alert">
            Add VITE_FIREBASE_API_KEY and VITE_FIREBASE_APP_ID from your
            Firebase Web app config, then restart or redeploy. See README.md.
          </div>
        ) : (
          <form onSubmit={login}>
            <label className="block mb-4">
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block mb-6">
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="button primary w-full" disabled={busy}>
              {busy ? "Signing in…" : "Open workspace"}
              <ArrowRight size={17} />
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <p className="hint mt-6">
          Private workspace ·{" "}
          {config.provider === "sample" ? "Sample analysis" : "Gemini analysis"}
        </p>
      </section>
    </main>
  );
}
