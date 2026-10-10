import { useEffect, useRef, useState } from "react";
import * as Icons from "./components/Icons.jsx";
import {
  api,
  auth,
  onAuthStateChanged,
  signOut,
  setApiWorkspace,
  statuses,
  fields,
  formatDate,
  today,
  overdue,
} from "./lib.js";
import { defaultFilters, filterTasks } from "./features/task-filters.js";
import { exportCsv, exportPdf, taskReport } from "./features/exports.js";
import AccountAccess, {
  WorkspaceSetup,
  WorkspaceLoading,
  WorkspaceSettings,
} from "./components/Account.jsx";
import PolicyLinks from "./components/PolicyLinks.jsx";
import NewMeeting from "./components/NewMeeting.jsx";
import MeetingDetail from "./components/MeetingDetail.jsx";
import GoogleMeet from "./components/GoogleMeet.jsx";
import RecapEmail from "./components/RecapEmail.jsx";
import TaskEditor from "./components/TaskEditor.jsx";
import TaskFilters from "./components/TaskFilters.jsx";
import Projects from "./components/Projects.jsx";
import { WorkspaceSwitcher, Team } from "./components/Workspaces.jsx";
import Priority from "./components/Priority.jsx";
import Profile from "./components/Profile.jsx";
import TabArtwork from "./components/TabArtwork.jsx";
import TaskCalendar from "./components/TaskCalendar.jsx";
import {
  Notifications,
  GlobalSearch,
  ActivityFeed,
  SavedViews,
  NeedsAttention,
} from "./components/ProductivityPanels.jsx";
import TaskBulkActions from "./components/TaskBulkActions.jsx";
import CalendarBatch from "./components/CalendarBatch.jsx";
import MeetingPreparation from "./components/MeetingPreparation.jsx";
import { taskNotifications, waitingOn } from "../shared/productivity.js";
const tabs = [
  ["dashboard", "Overview", Icons.LayoutDashboard],
  ["meetings", "Meetings", Icons.NotebookPen],
  ["google", "Google Meet", Icons.Video],
  ["tasks", "Task tracker", Icons.ListTodo],
  ["board", "Board", Icons.Columns3],
  ["projects", "Projects", Icons.Folder],
  ["team", "Team & workspace", Icons.Users],
  ["activity", "Activity", Icons.History],
  ["profile", "Profile", Icons.UserCircle],
];
const emptyData = () => ({
  activity: [],
  agendas: [],
  meetings: [],
  tasks: [],
  projects: [],
  draft: null,
  workspace: null,
  role: "owner",
});
export default function App() {
  const [config, setConfig] = useState(null),
    [user, setUser] = useState(undefined),
    [registering, setRegistering] = useState(false),
    [catalog, setCatalog] = useState({
      workspaces: [],
      invitations: [],
      actor: null,
    }),
    [workspaceId, setWorkspaceId] = useState(null),
    [data, setData] = useState(emptyData),
    [loadedFor, setLoadedFor] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [tab, setTab] = useState("dashboard"),
    [menu, setMenu] = useState(false),
    [switcher, setSwitcher] = useState(false),
    [settings, setSettings] = useState(false),
    [newMeeting, setNewMeeting] = useState(false),
    [meetingId, setMeetingId] = useState(null),
    [emailMeetingId, setEmailMeetingId] = useState(null),
    [taskId, setTaskId] = useState(null),
    [calendarTaskId, setCalendarTaskId] = useState(null),
    [filters, setFilters] = useState({ ...defaultFilters }),
    [meetingSearch, setMeetingSearch] = useState(""),
    [meetingProject, setMeetingProject] = useState("All"),
    [meetingReview, setMeetingReview] = useState("All"),
    [pdfBusy, setPdfBusy] = useState(false),
    [personal, setPersonal] = useState(null),
    [selectedIds, setSelectedIds] = useState([]),
    [calendarBatchIds, setCalendarBatchIds] = useState([]),
    [searchOpen, setSearchOpen] = useState(false),
    [notificationsOpen, setNotificationsOpen] = useState(false),
    [preparation, setPreparation] = useState(null),
    [preparedAgenda, setPreparedAgenda] = useState(null),
    [undo, setUndo] = useState(null),
    [undoBusy, setUndoBusy] = useState(false);
  const current = useRef({ uid: null, workspaceId: null }),
    generation = useRef(0);
  useEffect(() => {
    if (!menu || !window.matchMedia("(max-width: 850px)").matches) return;
    const drawer = document.getElementById("workspace-navigation"),
      previous = document.activeElement;
    if (!drawer) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () =>
      [...drawer.querySelectorAll("button:not(:disabled), a[href]")].filter(
        (v) => v.getClientRects().length,
      );
    controls()[0]?.focus();
    function key(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(false);
      }
      if (e.key !== "Tab") return;
      const items = controls(),
        first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [menu]);
  const actor = {
    ...(catalog.actor || { uid: user?.uid || "local-demo" }),
    name:
      (personal?.customName && personal.name) ||
      user?.displayName ||
      catalog.actor?.name ||
      "ShiftScript demo",
    aliases: personal?.aliases || [],
  };
  function patchPersonal(patch) {
    if (current.current.uid === actor.uid)
      setPersonal((previous) => ({ ...previous, ...patch }));
  }
  async function refreshCatalog() {
    const [result, profile] = await Promise.all([
      api("/workspaces", { workspace: false }),
      api("/profile", { workspace: false }),
    ]);
    if (
      (config?.authRequired ? auth?.currentUser?.uid : "local-demo") ===
      result.actor.uid
    ) {
      setCatalog(result);
      setPersonal(profile.profile);
    }
    return result;
  }
  async function reload(id = current.current.workspaceId) {
    const uid = current.current.uid;
    const result = await api("/workspace", { workspace: id });
    if (current.current.uid === uid && current.current.workspaceId === id) {
      setData(result);
      setLoadedFor(uid);
      setError("");
    }
    return result;
  }
  async function selectWorkspace(id) {
    current.current.workspaceId = id;
    setApiWorkspace(id);
    setWorkspaceId(id);
    setData(emptyData());
    setLoading(true);
    setMeetingId(null);
    setEmailMeetingId(null);
    setTaskId(null);
    setCalendarTaskId(null);
    setSelectedIds([]);
    setCalendarBatchIds([]);
    setSearchOpen(false);
    setNotificationsOpen(false);
    setPreparation(null);
    setPreparedAgenda(null);
    setUndo(null);
    setNewMeeting(false);
    setSettings(false);
    setFilters({ ...defaultFilters });
    setMeetingProject("All");
    setMeetingReview("All");
    setMeetingSearch("");
    setTab("dashboard");
    setMenu(false);
    try {
      await reload(id);
      try {
        localStorage.setItem(
          "shiftscript:workspace:" + current.current.uid,
          id,
        );
      } catch {}
    } finally {
      if (current.current.workspaceId === id) setLoading(false);
    }
  }
  async function initialize() {
    const ticket = ++generation.current,
      uid = config?.authRequired ? auth?.currentUser?.uid : "local-demo";
    current.current = { uid, workspaceId: null };
    setLoading(true);
    setError("");
    try {
      const result = await refreshCatalog();
      if (
        ticket !== generation.current ||
        (config?.authRequired ? auth?.currentUser?.uid : "local-demo") !== uid
      )
        return;
      let saved;
      try {
        saved = localStorage.getItem("shiftscript:workspace:" + uid);
      } catch {}
      const id =
        result.workspaces.find((w) => w.id === saved)?.id ||
        result.workspaces[0]?.id ||
        uid;
      await selectWorkspace(id);
      const googleStatus = new URLSearchParams(window.location.search).get(
        "google",
      );
      if (googleStatus) {
        setTab("google");
        if (googleStatus === "connected")
          setToast(
            "Google account connected. Select your meeting notes to import.",
          );
        else
          setError(
            "Google connection could not be completed. Try Connect Google again and approve Meet and Docs read access.",
          );
        const url = new URL(window.location.href);
        url.searchParams.delete("google");
        window.history.replaceState(
          {},
          "",
          url.pathname + url.search + url.hash,
        );
      }
      if (new URLSearchParams(window.location.search).has("workspaceInvite"))
        setSwitcher(true);
    } catch (e) {
      if (ticket === generation.current) {
        setError(e.message);
        setLoadedFor(null);
      }
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    api("/config", { workspace: false })
      .then(setConfig)
      .catch((e) => {
        setError("Could not connect to the API. " + e.message);
        setLoading(false);
      });
    const unsub = auth ? onAuthStateChanged(auth, setUser) : () => {};
    if (!auth) setUser(null);
    return unsub;
  }, []);
  useEffect(() => {
    if (!config || registering) return;
    if (config.authRequired && !user) {
      generation.current++;
      current.current = { uid: null, workspaceId: null };
      setApiWorkspace(null);
      setData(emptyData());
      setCatalog({ workspaces: [], invitations: [], actor: null });
      setPersonal(null);
      setSelectedIds([]);
      setCalendarBatchIds([]);
      setSearchOpen(false);
      setNotificationsOpen(false);
      setPreparation(null);
      setPreparedAgenda(null);
      setUndo(null);
      setWorkspaceId(null);
      setLoadedFor(null);
      setLoading(false);
      setSwitcher(false);
      setNewMeeting(false);
      setTaskId(null);
      setCalendarTaskId(null);
      setMeetingId(null);
      setEmailMeetingId(null);
      setSettings(false);
      setMenu(false);
      setToast("");
      return;
    }
    initialize();
  }, [config, user?.uid, registering]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    function key(event) {
      if (
        !workspaceId ||
        loading ||
        document.querySelector('dialog[open], [role="dialog"]')
      )
        return;
      const typing =
        /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) ||
        event.target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      } else if (
        !typing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key.toLowerCase() === "n" &&
        data.role !== "viewer"
      ) {
        event.preventDefault();
        setNewMeeting(true);
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [workspaceId, loading, data.role]);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(
      () => setUndo(null),
      Math.max(0, undo.expires - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [undo]);
  useEffect(() => {
    if (!workspaceId || !data.workspace) return;
    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !document.querySelector('dialog[open], [role="dialog"]')
      )
        reload().catch(() => {});
    }, 120000);
    return () => clearInterval(timer);
  }, [workspaceId, Boolean(data.workspace)]);
  async function taskSaved(result) {
    const id = workspaceId,
      uid = actor.uid;
    if (current.current.uid !== uid || current.current.workspaceId !== id)
      return;
    await reload(id);
    if (current.current.workspaceId !== id) return;
    if (result?.undoToken)
      setUndo({
        token: result.undoToken,
        workspaceId: id,
        expires: Date.now() + 300000,
      });
  }
  function toggleSelected(id) {
    setSelectedIds((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : previous.length < 25
          ? [...previous, id]
          : previous,
    );
  }
  function taskView(value) {
    setFilters({ ...defaultFilters, ...value });
    setTab("tasks");
    setMeetingId(null);
  }
  function meetingView(review = "All") {
    setMeetingSearch("");
    setMeetingProject("All");
    setMeetingReview(review);
    setMeetingId(null);
    setTab("meetings");
  }
  const notices = taskNotifications(data.tasks, actor, personal?.preferences),
    unread = notices.filter(
      (item) =>
        !personal?.readNotifications?.includes(workspaceId + ":" + item.id),
    ).length;
  const selected = data.tasks.filter((task) => selectedIds.includes(task.id)),
    calendarBatch = data.tasks.filter((task) =>
      calendarBatchIds.includes(task.id),
    );
  const readOnly = data.role === "viewer",
    meeting = data.meetings.find((m) => m.id === meetingId),
    emailMeeting = data.meetings.find((m) => m.id === emailMeetingId),
    task = data.tasks.find((t) => t.id === taskId),
    calendarTask = data.tasks.find((t) => t.id === calendarTaskId),
    pending = data.meetings.reduce(
      (n, m) =>
        n + m.proposals.filter((p) => p.reviewStatus === "pending").length,
      0,
    ),
    filtered = filterTasks(data.tasks, filters, actor, today()),
    late = data.tasks.filter(overdue),
    completed = data.tasks.filter((t) => t.status === "Completed"),
    blocked = data.tasks.filter((t) => t.status === "Blocked"),
    active = data.tasks.filter((t) => t.status !== "Completed"),
    name = actor.name;
  const visibleMeetings = data.meetings.filter(
    (m) =>
      (meetingReview === "All" ||
        m.proposals.some((proposal) => proposal.reviewStatus === "pending")) &&
      (meetingProject === "All" ||
        (meetingProject === "None"
          ? !m.projectId
          : m.projectId === meetingProject)) &&
      (m.title + " " + m.summary)
        .toLowerCase()
        .includes(meetingSearch.toLowerCase()),
  );
  function openMeeting(id) {
    setMeetingId(id);
    setTab("meetings");
    setMenu(false);
  }
  async function changeStatus(t, status) {
    try {
      const result = await api("/tasks/" + t.id, {
        method: "PATCH",
        body: JSON.stringify({
          ...fields(t),
          status,
          expectedUpdatedAt: t.updatedAt,
        }),
      });
      await taskSaved(result);
      setToast("Task status saved.");
    } catch (e) {
      setError(e.message);
    }
  }
  async function pdf() {
    setPdfBusy(true);
    try {
      await exportPdf(taskReport(filtered, data.workspace, data.projects));
    } catch (e) {
      setError(e.message);
    } finally {
      setPdfBusy(false);
    }
  }
  const switcherView = switcher && (
    <WorkspaceSwitcher
      catalog={catalog}
      selected={workspaceId}
      user={user}
      onSelect={selectWorkspace}
      onRefresh={refreshCatalog}
      onClose={() => setSwitcher(false)}
    />
  );
  if (!config || (config.authRequired && user === undefined))
    return (
      <WorkspaceLoading
        error={error}
        onRetry={() => window.location.reload()}
      />
    );
  if (config?.authRequired && (!user || registering))
    return (
      <AccountAccess
        config={config}
        error={error}
        setError={setError}
        setRegistering={setRegistering}
      />
    );
  if (config?.authRequired && loadedFor !== user?.uid)
    return <WorkspaceLoading error={error} onRetry={initialize} />;
  if (config?.authRequired && !data.workspace && !loading)
    return (
      <>
        <WorkspaceSetup
          user={user}
          onSaved={async () => {
            await refreshCatalog();
            await reload();
          }}
        />
        <div className="onboarding-invitations">
          <button className="button small" onClick={() => setSwitcher(true)}>
            Join an invited workspace
          </button>
        </div>
        {switcherView}
      </>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside
        id="workspace-navigation"
        aria-label="Workspace navigation"
        className={"sidebar " + (menu ? "open" : "")}
      >
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
          <Icons.X />
        </button>
        <button
          className="workspace-pill workspace-switch"
          aria-label="Switch workspace"
          onClick={() => setSwitcher(true)}
        >
          <span className="avatar">
            <Icons.Building size={22} />
          </span>
          <div>
            <strong>{data.workspace?.name || "Your workspace"}</strong>
            <span>
              {data.role} · {catalog.workspaces.length}{" "}
              {catalog.workspaces.length === 1 ? "workspace" : "workspaces"}
            </span>
          </div>
          <Icons.ChevronDown size={16} />
        </button>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-label={label}
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
          <img src="/art/meeting-blue.png" alt="" />
          <h3>Good meetings go somewhere.</h3>
          <p>Keep decisions, owners and next steps in the same place.</p>
          {!readOnly && (
            <button className="text-button" onClick={() => setNewMeeting(true)}>
              Start with a transcript
            </button>
          )}
        </div>
        <div className="sidebar-foot">
          <span className="avatar dark">
            {personal?.avatar ? (
              <img src={personal.avatar} alt="" />
            ) : (
              name?.slice(0, 2).toUpperCase() || "SS"
            )}
          </span>
          <div>
            <strong>{name}</strong>
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
              <Icons.LogOut size={16} />
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
              aria-expanded={menu}
              aria-controls="workspace-navigation"
              onClick={() => setMenu(true)}
            >
              <Icons.Menu />
            </button>
            <span className="breadcrumb">
              Workspace <span>/</span>
              {tabs.find((t) => t[0] === tab)?.[1]}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="icon-button"
              aria-label="Search workspace"
              onClick={() => setSearchOpen(true)}
            >
              <Icons.Search size={20} />
            </button>
            <button
              className="icon-button notification-trigger"
              aria-label={
                "Notifications" + (unread ? ": " + unread + " unread" : "")
              }
              onClick={() => setNotificationsOpen(true)}
            >
              <Icons.Bell size={21} />
              {unread > 0 && <span>{Math.min(unread, 99)}</span>}
            </button>
            <button
              className="icon-button profile-trigger"
              aria-label="View your profile"
              title="Your profile"
              onClick={() => {
                setTab("profile");
                setMeetingId(null);
                setMenu(false);
              }}
            >
              <Icons.UserCircle size={22} />
            </button>
            <span className="mode-badge">
              <span />
              {config?.provider === "gemini" ? "Live analysis" : "Sample mode"}
            </span>
            <button
              className="icon-button"
              aria-label="Refresh workspace"
              disabled={loading}
              onClick={() => reload().catch((e) => setError(e.message))}
            >
              <Icons.RefreshCw size={17} />
            </button>
            {data.role === "owner" && (
              <button
                className="icon-button"
                aria-label="Workspace settings"
                onClick={() => setSettings(true)}
              >
                <Icons.Building size={18} />
              </button>
            )}
          </div>
        </header>
        <main id="main">
          {error && (
            <div className="alert" role="alert">
              <Icons.AlertCircle size={19} />
              <p>{error}</p>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <Icons.X size={16} />
              </button>
            </div>
          )}
          {config?.provider === "sample" && (
            <div className="sample-banner">
              <span>You're in sample mode.</span> Try the included fictional
              transcript. Custom transcripts require Gemini.
            </div>
          )}
          {readOnly && (
            <div className="read-only">
              <Icons.Shield size={17} />
              Viewer access · Read meetings, follow tasks and export reports.
            </div>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">KEEP THE CONVERSATION MOVING</p>
              <h1>
                {meeting
                  ? meeting.title
                  : {
                      dashboard: "Less follow-up. More follow-through.",
                      meetings: "Every meeting, a clear next step.",
                      tasks: "The work, all in one place.",
                      board: "A little clarity goes a long way.",
                      projects: "Make room for the bigger picture.",
                      team: "Good work happens together.",
                      google: "From Google Meet to a clear next step.",
                      activity: "Keep up with your workspace.",
                      profile: "Your profile.",
                    }[tab]}
              </h1>
              <p>
                {meeting
                  ? `${formatDate(meeting.date)} · ${meeting.type}`
                  : {
                      dashboard:
                        "Your meetings, decisions and everything that comes next.",
                      meetings:
                        "Turn conversations into work you can review and trust.",
                      tasks:
                        "Keep an eye on who owns what, and what happens next.",
                      board: "Move tasks from a first step to a finished one.",
                      projects:
                        "A shared home for related conversations and commitments.",
                      team: "Manage your people, permissions and workspace.",
                      google:
                        "Bring in your notes. Review the work. Keep moving.",
                      activity: "See who changed what, and follow the work.",
                      profile:
                        "Your account, your work and the places you belong.",
                    }[tab]}
              </p>
            </div>
            {!readOnly && tab !== "profile" && (
              <div className="heading-actions">
                {(tab === "tasks" || tab === "board") && (
                  <button className="button" onClick={() => setTaskId("new")}>
                    <Icons.Plus size={17} />
                    New task
                  </button>
                )}
                <button
                  className="button primary"
                  onClick={() => setNewMeeting(true)}
                >
                  <Icons.Plus size={18} />
                  New meeting
                </button>
              </div>
            )}
          </div>
          {loading ? (
            <div className="empty">
              <Icons.RefreshCw className="spin" />
              <h3>Opening your workspace…</h3>
            </div>
          ) : (
            <>
              {!meeting && <TabArtwork tab={tab} />}
              {tab === "profile" && (
                <Profile
                  user={user}
                  actor={actor}
                  catalog={catalog}
                  workspace={data.workspace}
                  role={data.role}
                  tasks={data.tasks}
                  onWorkspaces={() => setSwitcher(true)}
                  onMyWork={() => {
                    setFilters({ ...defaultFilters, owner: "Me" });
                    setTab("tasks");
                  }}
                  personal={personal}
                  remindersReady={config.remindersReady}
                  onProfileSaved={async (profile) => {
                    if (current.current.uid !== actor.uid) return;
                    setPersonal(profile);
                    await refreshCatalog();
                    await reload();
                  }}
                  onSignOut={() => signOut(auth)}
                />
              )}
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
                      <div className="flex flex-wrap gap-2 mt-4">
                        {!readOnly && (
                          <button
                            className="button primary"
                            onClick={() => setNewMeeting(true)}
                          >
                            {data.draft
                              ? "Continue your draft"
                              : "Add your first next step"}
                          </button>
                        )}
                        <button
                          className="button"
                          onClick={() => {
                            setFilters({ ...defaultFilters, owner: "Me" });
                            setTab("tasks");
                          }}
                        >
                          My work
                        </button>
                      </div>
                    </div>
                    <img
                      src="/art/meeting-blue.png"
                      alt="Illustration of colleagues planning their next steps"
                    />
                  </section>
                  <section className="stats" aria-label="Workspace shortcuts">
                    {[
                      [
                        data.meetings.length,
                        "Meetings processed",
                        Icons.NotebookPen,
                        "sage",
                        () => meetingView(),
                      ],
                      [
                        data.projects.length,
                        "Projects",
                        Icons.Folder,
                        "sage",
                        () => {
                          setMeetingId(null);
                          setTab("projects");
                        },
                      ],
                      [
                        pending,
                        "Awaiting approval",
                        Icons.Clock,
                        "peach",
                        () => meetingView("Pending"),
                      ],
                      [
                        active.length,
                        "Active tasks",
                        Icons.ListTodo,
                        "sage",
                        () => taskView({ status: "Active" }),
                      ],
                      [
                        completed.length,
                        "Completed",
                        Icons.CheckCircle2,
                        "sage",
                        () => taskView({ status: "Completed" }),
                      ],
                      [
                        blocked.length,
                        "Blocked",
                        Icons.AlertCircle,
                        "peach",
                        () => taskView({ status: "Blocked" }),
                      ],
                      [
                        late.length,
                        "Overdue",
                        Icons.CalendarDays,
                        "peach",
                        () => taskView({ due: "Overdue" }),
                      ],
                    ].map(([v, label, Icon, color, onClick]) => (
                      <button
                        type="button"
                        className="stat"
                        key={label}
                        onClick={onClick}
                        aria-label={`View ${label.toLowerCase()}: ${v}`}
                      >
                        <span className={"stat-icon " + color}>
                          <Icon size={32} />
                        </span>
                        <strong>{v}</strong>
                        <span className="stat-label">{label}</span>
                      </button>
                    ))}
                  </section>
                  <NeedsAttention
                    data={data}
                    onTasks={taskView}
                    onMeetings={() => {
                      setTab("meetings");
                      setMeetingId(
                        data.meetings.find((m) =>
                          m.proposals.some((p) => p.reviewStatus === "pending"),
                        )?.id || null,
                      );
                    }}
                  />
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Recent conversations</h2>
                        <button
                          className="text-button"
                          onClick={() => meetingView()}
                        >
                          View all
                        </button>
                      </div>
                      {data.meetings.length ? (
                        data.meetings
                          .slice(0, 4)
                          .map((m) => (
                            <MeetingRow
                              key={m.id}
                              m={m}
                              projects={data.projects}
                              onOpen={() => openMeeting(m.id)}
                              onEmail={
                                !readOnly ? () => setEmailMeetingId(m.id) : null
                              }
                              emailReady={config?.emailReady}
                            />
                          ))
                      ) : (
                        <Empty
                          icon={Icons.NotebookPen}
                          title="A fresh page for your next meeting"
                          text="Add a transcript to start building your meeting history."
                          action={!readOnly ? "Try a sample meeting" : null}
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
                          <Icons.Clock />
                          <div>
                            <h3>{pending} proposed tasks to review</h3>
                            <p>Confirm owners and deadlines.</p>
                          </div>
                          <button
                            className="button small"
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
                            Review
                          </button>
                        </div>
                      )}
                      {[
                        [late, "Overdue tasks", "Overdue"],
                        [blocked, "Blocked tasks", "Blocked"],
                      ].map(
                        ([items, title, kind]) =>
                          items.length > 0 && (
                            <div className="attention" key={kind}>
                              <Icons.Flag />
                              <div>
                                <h3>
                                  {items.length} {title.toLowerCase()}
                                </h3>
                                <p>Find what needs a hand.</p>
                              </div>
                              <button
                                className="button small"
                                aria-label={title}
                                onClick={() => {
                                  setFilters({
                                    ...defaultFilters,
                                    ...(kind === "Overdue"
                                      ? { due: kind }
                                      : { status: kind }),
                                  });
                                  setTab("tasks");
                                }}
                              >
                                View tasks
                              </button>
                            </div>
                          ),
                      )}
                      {pending + late.length + blocked.length === 0 && (
                        <Empty
                          icon={Icons.CheckCircle2}
                          title="A little breathing room."
                          text="No pending approvals, overdue tasks or blockers."
                        />
                      )}
                    </section>
                  </div>
                </>
              )}
              {tab === "activity" && (
                <ActivityFeed
                  activity={data.activity}
                  onTask={(id) =>
                    data.tasks.some((task) => task.id === id)
                      ? setTaskId(id)
                      : setToast(
                          "This task was deleted. Its change remains in history.",
                        )
                  }
                  onMeeting={openMeeting}
                  onProject={(id) => taskView({ project: id })}
                />
              )}
              {tab === "google" && (
                <GoogleMeet
                  key={workspaceId + ":" + actor.uid}
                  projects={data.projects}
                  workspace={data.workspace}
                  readOnly={readOnly}
                  config={config}
                  existingMeetings={data.meetings}
                  onOpenExisting={(m) => openMeeting(m.id)}
                  onCreated={async (m) => {
                    await reload();
                    openMeeting(m.id);
                    setToast(
                      "Google source processed. Review your proposed tasks.",
                    );
                  }}
                />
              )}
              {tab === "meetings" &&
                (meeting ? (
                  <MeetingDetail
                    key={meeting.id}
                    meeting={meeting}
                    tasks={data.tasks}
                    meetings={data.meetings}
                    onMeeting={openMeeting}
                    onPrepare={(id) => setPreparation({ meetingId: id })}
                    emailReady={config.emailReady}
                    workspace={data.workspace}
                    projects={data.projects}
                    readOnly={readOnly}
                    reload={reload}
                    onBack={() => setMeetingId(null)}
                    onTask={setTaskId}
                    onError={setError}
                  />
                ) : (
                  <>
                    {!readOnly && (
                      <div className="agenda-list mb-4">
                        <button
                          className="button"
                          onClick={() => setPreparation({})}
                        >
                          <Icons.NotebookPen size={18} />
                          Prepare meeting agenda
                        </button>
                        {data.agendas
                          ?.filter((item) => !item.meetingId)
                          .slice(0, 8)
                          .map((agenda) => (
                            <button
                              className="button small"
                              key={agenda.id}
                              onClick={() => {
                                if (
                                  data.draft?.transcript &&
                                  !window.confirm(
                                    "Start from this agenda and replace your current draft?",
                                  )
                                )
                                  return;
                                setPreparedAgenda(agenda);
                                setNewMeeting(true);
                              }}
                            >
                              <Icons.FileText size={16} />
                              {agenda.title}
                            </button>
                          ))}
                      </div>
                    )}
                    <div className="panel meeting-filters">
                      <label>
                        Search meetings
                        <input
                          placeholder="Search title or summary"
                          value={meetingSearch}
                          onChange={(e) => setMeetingSearch(e.target.value)}
                        />
                      </label>
                      <label>
                        Project
                        <select
                          aria-label="Project"
                          value={meetingProject}
                          onChange={(e) => setMeetingProject(e.target.value)}
                        >
                          <option value="All">All projects</option>
                          <option value="None">No project</option>
                          {data.projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Review
                        <select
                          aria-label="Meeting review"
                          value={meetingReview}
                          onChange={(e) => setMeetingReview(e.target.value)}
                        >
                          <option value="All">All meetings</option>
                          <option value="Pending">Needs approval</option>
                        </select>
                      </label>
                    </div>
                    <section className="panel mt-5">
                      {visibleMeetings.length ? (
                        visibleMeetings.map((m) => (
                          <MeetingRow
                            key={m.id}
                            m={m}
                            projects={data.projects}
                            onOpen={() => openMeeting(m.id)}
                            onEmail={
                              !readOnly ? () => setEmailMeetingId(m.id) : null
                            }
                            emailReady={config?.emailReady}
                          />
                        ))
                      ) : (
                        <Empty
                          icon={Icons.NotebookPen}
                          title="No meetings in this view"
                          text="Adjust your filters or add a new conversation."
                        />
                      )}
                    </section>
                  </>
                ))}
              {(tab === "tasks" || tab === "board") && (
                <>
                  <TaskFilters
                    value={filters}
                    onChange={setFilters}
                    tasks={data.tasks}
                    projects={data.projects}
                    count={filtered.length}
                  />
                  <SavedViews
                    filters={filters}
                    personal={personal}
                    workspaceId={workspaceId}
                    onChange={setFilters}
                    onSaved={(views) => patchPersonal({ savedViews: views })}
                  />
                  {!readOnly && (
                    <TaskBulkActions
                      selected={selected}
                      filtered={filtered}
                      members={data.workspace?.members || []}
                      projects={data.projects}
                      onSelect={setSelectedIds}
                      onClear={() => setSelectedIds([])}
                      onSaved={taskSaved}
                      onCalendar={() =>
                        setCalendarBatchIds(selected.map((task) => task.id))
                      }
                    />
                  )}
                  <div className="export-toolbar">
                    <p className="hint">
                      Exports include {filtered.length}{" "}
                      {filtered.length === 1 ? "task" : "tasks"} in this view.
                    </p>
                    <button
                      className="button small"
                      onClick={() => exportCsv(filtered, data.projects)}
                    >
                      <Icons.FileCsv size={17} />
                      Export CSV
                    </button>
                    <button
                      className="button small"
                      disabled={pdfBusy}
                      onClick={pdf}
                    >
                      <Icons.FilePdf size={17} />
                      {pdfBusy ? "Preparing PDF…" : "Export PDF"}
                    </button>
                  </div>
                  {tab === "tasks" ? (
                    <section className="panel task-table">
                      <div className="table-scroll">
                        <table className="task-table">
                          <thead>
                            <tr>
                              {!readOnly && (
                                <th className="selection-cell">Select</th>
                              )}
                              <th>Task</th>
                              <th>Owner</th>
                              <th>Due date</th>
                              <th>Priority</th>
                              <th>Status</th>
                              <th>Project / source</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((t) => (
                              <tr key={t.id}>
                                {!readOnly && (
                                  <td
                                    data-label="Select"
                                    className="selection-cell"
                                  >
                                    <input
                                      type="checkbox"
                                      aria-label={"Select " + t.title}
                                      checked={selectedIds.includes(t.id)}
                                      onChange={() => toggleSelected(t.id)}
                                    />
                                  </td>
                                )}
                                <td data-label="Task">
                                  <button
                                    className="card-title"
                                    onClick={() => setTaskId(t.id)}
                                  >
                                    {t.title}
                                  </button>
                                  {t.checklist?.length > 0 && (
                                    <span className="hint">
                                      {t.checklist.filter((c) => c.done).length}
                                      /{t.checklist.length} steps
                                    </span>
                                  )}
                                  <button
                                    className="text-button task-calendar-link"
                                    aria-label={
                                      "Add " + t.title + " to Google Calendar"
                                    }
                                    onClick={() => setCalendarTaskId(t.id)}
                                  >
                                    <Icons.CalendarDays size={15} />
                                    {personal?.calendarMarks?.some(
                                      (mark) =>
                                        mark.workspaceId === workspaceId &&
                                        mark.taskId === t.id,
                                    )
                                      ? "Marked added to Calendar"
                                      : "Add to Calendar"}
                                  </button>
                                </td>
                                <td data-label="Owner">{t.owner}</td>
                                <td
                                  data-label="Due date"
                                  className={overdue(t) ? "late" : ""}
                                >
                                  {formatDate(t.dueDate)}
                                  {!t.schedule && (
                                    <small className="saved-schedule">
                                      Not scheduled
                                    </small>
                                  )}
                                  {t.schedule && (
                                    <small className="saved-schedule">
                                      Scheduled {t.schedule.date} ·{" "}
                                      {t.schedule.time}
                                    </small>
                                  )}
                                </td>
                                <td data-label="Priority">
                                  <Priority value={t.priority} />
                                </td>
                                <td data-label="Status">
                                  <select
                                    aria-label={"Status for " + t.title}
                                    disabled={readOnly}
                                    value={t.status}
                                    onChange={(e) =>
                                      changeStatus(t, e.target.value)
                                    }
                                  >
                                    {statuses.map((s) => (
                                      <option
                                        key={s}
                                        disabled={
                                          s === "Completed" &&
                                          waitingOn(t, data.tasks).length > 0
                                        }
                                      >
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                  {waitingOn(t, data.tasks).length > 0 && (
                                    <span className="badge dependency-badge">
                                      Waiting on{" "}
                                      {waitingOn(t, data.tasks).length} task(s)
                                    </span>
                                  )}
                                  <div className="mobile-task-actions">
                                    <button
                                      className="button small"
                                      onClick={() => setTaskId(t.id)}
                                    >
                                      <Icons.Edit size={15} />
                                      Details
                                    </button>
                                    <button
                                      className="button small"
                                      disabled={
                                        readOnly ||
                                        t.status === "Completed" ||
                                        waitingOn(t, data.tasks).length > 0
                                      }
                                      onClick={() =>
                                        changeStatus(t, "Completed")
                                      }
                                    >
                                      <Icons.Check size={15} />
                                      Done
                                    </button>
                                  </div>
                                </td>
                                <td data-label="Project / source">
                                  <p className="hint">
                                    {data.projects.find(
                                      (p) => p.id === t.projectId,
                                    )?.name || "No project"}
                                  </p>
                                  {t.meetingId ? (
                                    <button
                                      className="text-button"
                                      onClick={() => openMeeting(t.meetingId)}
                                    >
                                      {t.meetingTitle}
                                    </button>
                                  ) : (
                                    <span className="hint">Added manually</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {!filtered.length && (
                        <Empty
                          icon={Icons.ListTodo}
                          title="No tasks in this view"
                          text="Adjust the filters, add a task or approve proposals from a meeting."
                        />
                      )}
                    </section>
                  ) : (
                    <div className="kanban">
                      {statuses.map((s, index) => (
                        <section className="kanban-column" key={s}>
                          <h2>
                            <span className={"column-dot dot-" + index} />
                            {s}
                            <span className="badge">
                              {filtered.filter((t) => t.status === s).length}
                            </span>
                          </h2>
                          {filtered
                            .filter((t) => t.status === s)
                            .map((t) => (
                              <article className="task-card" key={t.id}>
                                {!readOnly && (
                                  <label className="check-option">
                                    <input
                                      type="checkbox"
                                      aria-label={"Select " + t.title}
                                      checked={selectedIds.includes(t.id)}
                                      onChange={() => toggleSelected(t.id)}
                                    />
                                    Select
                                  </label>
                                )}
                                {waitingOn(t, data.tasks).length > 0 && (
                                  <span className="badge dependency-badge">
                                    Waiting on {waitingOn(t, data.tasks).length}{" "}
                                    task(s)
                                  </span>
                                )}
                                <Priority value={t.priority} />
                                <button
                                  className="card-title"
                                  onClick={() => setTaskId(t.id)}
                                >
                                  {t.title}
                                </button>
                                <p className="hint">
                                  {data.projects.find(
                                    (p) => p.id === t.projectId,
                                  )?.name || "No project"}
                                </p>
                                <div className="task-card-foot">
                                  <span>{t.owner}</span>
                                  <span className={overdue(t) ? "late" : ""}>
                                    {formatDate(t.dueDate)}
                                    {!t.schedule && (
                                      <small className="saved-schedule">
                                        Not scheduled
                                      </small>
                                    )}
                                    {t.schedule && (
                                      <small className="saved-schedule">
                                        Scheduled {t.schedule.date} ·{" "}
                                        {t.schedule.time}
                                      </small>
                                    )}
                                  </span>
                                </div>
                                <button
                                  className="text-button task-calendar-link"
                                  aria-label={
                                    "Add " + t.title + " to Google Calendar"
                                  }
                                  onClick={() => setCalendarTaskId(t.id)}
                                >
                                  <Icons.CalendarDays size={15} />
                                  Add to Calendar
                                </button>
                                <select
                                  aria-label={"Status for " + t.title}
                                  disabled={readOnly}
                                  value={t.status}
                                  onChange={(e) =>
                                    changeStatus(t, e.target.value)
                                  }
                                >
                                  {statuses.map((s) => (
                                    <option
                                      key={s}
                                      disabled={
                                        s === "Completed" &&
                                        waitingOn(t, data.tasks).length > 0
                                      }
                                    >
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              </article>
                            ))}
                        </section>
                      ))}
                    </div>
                  )}
                </>
              )}
              {tab === "projects" && (
                <Projects
                  projects={data.projects}
                  tasks={data.tasks}
                  meetings={data.meetings}
                  readOnly={readOnly}
                  onSaved={reload}
                  onOpen={(id) => {
                    setFilters({ ...defaultFilters, project: id });
                    setTab("tasks");
                  }}
                />
              )}
              {tab === "team" && (
                <Team
                  workspace={data.workspace}
                  role={data.role}
                  user={user}
                  reload={reload}
                  onRefresh={refreshCatalog}
                  onError={setError}
                  onToast={setToast}
                  invitationEmailReady={config.invitationEmailReady}
                />
              )}
            </>
          )}
          <footer className="app-footer">
            ShiftScript · A clear next step, every time.
            <PolicyLinks />
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Icons.CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      <nav
        className={
          "mobile-bottom-nav" + (!readOnly ? " has-meeting-action" : "")
        }
        aria-label="Quick navigation"
      >
        {[
          ["dashboard", "Overview", Icons.LayoutDashboard],
          ["meetings", "Meetings", Icons.NotebookPen],
          ["tasks", "Tasks", Icons.ListTodo],
          ["google", "Google Meet", Icons.Video],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            aria-label={"Go to " + label}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              setTab(id);
              setMeetingId(null);
              setMenu(false);
            }}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {!readOnly && !menu && !newMeeting && (
        <button
          className="mobile-meeting-button"
          aria-label="Add new meeting"
          title="New meeting"
          onClick={() => {
            setMenu(false);
            setNewMeeting(true);
          }}
        >
          <svg
            className="mobile-meeting-ring"
            viewBox="0 0 80 80"
            aria-hidden="true"
          >
            <defs>
              <path
                id="meeting-text-ring"
                d="M40,11 a29,29 0 1,1 0,58 a29,29 0 1,1 0,-58"
              />
            </defs>
            <text textLength="182" lengthAdjust="spacing">
              <textPath href="#meeting-text-ring">
                NEW MEETING • NEW MEETING •{" "}
              </textPath>
            </text>
          </svg>
          <span className="mobile-meeting-centre" aria-hidden="true">
            <Icons.Plus size={28} />
          </span>
        </button>
      )}
      {newMeeting && (
        <NewMeeting
          key={workspaceId}
          config={config}
          workspaceId={workspaceId}
          actorId={actor.uid}
          projects={data.projects}
          draft={data.draft}
          agendas={data.agendas}
          preparedAgenda={preparedAgenda}
          meetings={data.meetings}
          workspace={data.workspace}
          onOpenExisting={async (m) => {
            setNewMeeting(false);
            setPreparedAgenda(null);
            openMeeting(m.id);
          }}
          onClose={async () => {
            setNewMeeting(false);
            setPreparedAgenda(null);
            try {
              await reload();
            } catch (e) {
              setError(e.message);
            }
          }}
          onCreated={async (m) => {
            await reload();
            setNewMeeting(false);
            setPreparedAgenda(null);
            openMeeting(m.id);
            setToast("Meeting processed. Review the proposed tasks.");
          }}
        />
      )}
      {emailMeeting && !readOnly && (
        <RecapEmail
          key={workspaceId + ":" + emailMeeting.id}
          meeting={emailMeeting}
          reload={reload}
          onClose={() => setEmailMeetingId(null)}
        />
      )}
      {(task || taskId === "new") && (
        <TaskEditor
          key={taskId}
          task={task}
          projects={data.projects}
          members={data.workspace?.members || []}
          readOnly={readOnly}
          onClose={() => setTaskId(null)}
          tasks={data.tasks}
          onDeleted={taskSaved}
          onSaved={taskSaved}
          onCalendar={() => {
            setTaskId(null);
            setCalendarTaskId(task.id);
          }}
          onSource={() => {
            setTaskId(null);
            openMeeting(task.meetingId);
          }}
        />
      )}
      {calendarTask && (
        <TaskCalendar
          key={calendarTask.id}
          task={calendarTask}
          readOnly={readOnly}
          onSaved={taskSaved}
          personal={personal}
          workspaceId={workspaceId}
          onMarks={(marks) => patchPersonal({ calendarMarks: marks })}
          onClose={() => setCalendarTaskId(null)}
        />
      )}
      {settings && (
        <WorkspaceSettings
          user={user}
          workspace={data.workspace}
          onSaved={async () => {
            await reload();
            await refreshCatalog();
            setSettings(false);
            setToast("Workspace settings saved.");
          }}
          onClose={() => setSettings(false)}
        />
      )}
      {searchOpen && (
        <GlobalSearch
          data={data}
          onTask={setTaskId}
          onMeeting={openMeeting}
          onProject={(id) => taskView({ project: id })}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {notificationsOpen && (
        <Notifications
          data={data}
          actor={actor}
          personal={personal}
          onRead={(ids) => patchPersonal({ readNotifications: ids })}
          onTask={setTaskId}
          onClose={() => setNotificationsOpen(false)}
        />
      )}
      {calendarBatch.length > 0 && (
        <CalendarBatch
          tasks={calendarBatch}
          personal={personal}
          workspaceId={workspaceId}
          onMarks={(marks) => patchPersonal({ calendarMarks: marks })}
          readOnly={readOnly}
          onSaved={taskSaved}
          onClose={() => setCalendarBatchIds([])}
        />
      )}
      {preparation && !readOnly && (
        <MeetingPreparation
          data={data}
          initialMeetingId={preparation.meetingId}
          onSaved={reload}
          onClose={() => setPreparation(null)}
          onUse={(agenda) => {
            if (
              data.draft?.transcript &&
              !window.confirm(
                "Start from this agenda and replace your current draft?",
              )
            )
              return;
            setPreparedAgenda(agenda);
            setPreparation(null);
            setNewMeeting(true);
          }}
        />
      )}
      {undo && (
        <div className="undo-banner" role="status">
          <span>Task changes saved. Undo available for 5 minutes.</span>
          <button
            className="button small"
            disabled={undoBusy}
            onClick={async () => {
              setUndoBusy(true);
              try {
                await api("/undo/" + undo.token, {
                  workspace: undo.workspaceId,
                  method: "POST",
                });
                setUndo(null);
                setTaskId(null);
                await reload();
                setToast("Changes undone.");
              } catch (error) {
                setError(error.message);
              } finally {
                setUndoBusy(false);
              }
            }}
          >
            Undo
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss undo"
            onClick={() => setUndo(null)}
          >
            <Icons.X size={16} />
          </button>
        </div>
      )}
      {switcherView}
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
        </button>
      )}
    </div>
  );
}
function MeetingRow({ m, projects, onOpen, onEmail, emailReady }) {
  const n = m.proposals.filter((p) => p.reviewStatus === "pending").length;
  return (
    <div className="meeting-entry">
      <button className="meeting-row" onClick={onOpen}>
        <span className="meeting-icon">
          <Icons.FileText size={21} />
        </span>
        <div>
          <h3>{m.title}</h3>
          <p>
            {formatDate(m.date)} · {m.type}
            {m.projectId
              ? " · " +
                (projects.find((p) => p.id === m.projectId)?.name || "Project")
              : ""}
          </p>
        </div>
        <span className={"badge " + (n ? "yellow" : "")}>
          {n ? n + " to review" : m.proposals.length + " actions"}
        </span>
      </button>
      <div className="meeting-entry-recap">
        <p className="meeting-summary-excerpt">{m.summary}</p>
        {onEmail && (
          <button
            className="button small meeting-email"
            disabled={!emailReady}
            title={
              emailReady
                ? "Choose recipients and review the recap"
                : "Earny email setup is required"
            }
            aria-label={"Email recap for " + m.title}
            onClick={onEmail}
          >
            <Icons.Mail size={16} /> Email recap
          </button>
        )}
      </div>
    </div>
  );
}
