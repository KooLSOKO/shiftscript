import TaskBoard from "./components/TaskBoard.jsx";
import {
  previewBoardMove,
  overlayBoardMove,
  rollbackBoardMove,
  mergeSavedBoardTasks,
} from "./features/board-updates.js";
import ShortcutsTour, { KeyboardIcon } from "./components/ShortcutsTour.jsx";
import { shortcutAction, isTypingTarget } from "./features/shortcuts.js";
import AuthTransition from "./components/AuthTransition.jsx";
import { hasGoogleReturn, clearGoogleReturn } from "./auth-flow.js";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import * as Icons from "./components/Icons.jsx";
import {
  api,
  auth,
  onAuthStateChanged,
  completeGoogleRedirect,
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
import MemberProfile from "./components/MemberProfile.jsx";
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
const Notes = lazy(() => import("./components/Notes.jsx"));
const Assistant = lazy(() => import("./components/Assistant.jsx"));
const tabs = [
  ["dashboard", "Overview", Icons.LayoutDashboard],
  ["meetings", "Meetings", Icons.NotebookPen],
  ["google", "Google Meet", Icons.Video],
  ["assistant", "Shifty", Icons.Compass],
  ["notes", "Notes", Icons.FileText],
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
  notes: [],
  meetings: [],
  tasks: [],
  projects: [],
  draft: null,
  workspace: null,
  role: "owner",
});
function focusWorkspaceHeading() {
  const heading = document.querySelector(
    ".auth-content .page-heading h1, .auth-content .login-form h2",
  );
  if (!heading) return;
  const hadTabIndex = heading.hasAttribute("tabindex");
  if (!hadTabIndex) heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
  if (!hadTabIndex)
    heading.addEventListener(
      "blur",
      () => heading.removeAttribute("tabindex"),
      { once: true },
    );
}
export default function App() {
  const [config, setConfig] = useState(null),
    [user, setUser] = useState(undefined),
    [registering, setRegistering] = useState(hasGoogleReturn),
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
    [noteToOpen, setNoteToOpen] = useState(null),
    [emailMeetingId, setEmailMeetingId] = useState(null),
    [taskId, setTaskId] = useState(null),
    [memberProfileId, setMemberProfileId] = useState(null),
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
  const [authTransition, setAuthTransition] = useState({ id: 0 });
  const [tutorial, setTutorial] = useState(null);
  const [tutorialBusy, setTutorialBusy] = useState(false);
  const [tutorialError, setTutorialError] = useState("");
  const [shortcutBusy, setShortcutBusy] = useState(false);
  const [shortcutError, setShortcutError] = useState("");
  const [boardBusy, setBoardBusy] = useState(false);
  const boardPending = useRef(null);
  const boardRevision = useRef(0);
  const tutorialSeen = useRef(new Set());
  const [googleReturning, setGoogleReturning] = useState(hasGoogleReturn);
  const [assistantRecap, setAssistantRecap] = useState(null);
  const [assistantRevision, setAssistantRevision] = useState(0);
  const authSequence = useRef(0);
  const transitionFocus = useRef(null);
  const focusAfterLoad = useRef(false);
  const restoreTransitionFocus = useRef(false);
  const latestLoading = useRef(loading);
  latestLoading.current = loading;
  function beginAuthTransition() {
    transitionFocus.current = document.activeElement;
    setAuthTransition((previous) => previous || { id: ++authSequence.current });
  }
  const finishAuthTransition = useCallback(() => {
    focusAfterLoad.current = latestLoading.current;
    restoreTransitionFocus.current = true;
    setAuthTransition(null);
  }, []);
  useEffect(() => {
    if (authTransition || !restoreTransitionFocus.current) return;
    restoreTransitionFocus.current = false;
    const frame = requestAnimationFrame(() => {
      const previous = transitionFocus.current;
      transitionFocus.current = null;
      if (
        previous?.isConnected &&
        previous !== document.body &&
        previous !== document.documentElement
      ) {
        previous.focus({ preventScroll: true });
        if (document.activeElement === previous) {
          focusAfterLoad.current = false;
          return;
        }
      }
      const modal = [...document.querySelectorAll("dialog[open]")].at(-1);
      if (modal) {
        focusAfterLoad.current = false;
        if (!modal.contains(document.activeElement))
          modal
            .querySelector("button:not(:disabled), input, textarea, select")
            ?.focus({ preventScroll: true });
        return;
      }
      focusWorkspaceHeading();
    });
    return () => cancelAnimationFrame(frame);
  }, [authTransition]);
  useEffect(() => {
    if (!focusAfterLoad.current || loading || authTransition) return;
    focusAfterLoad.current = false;
    // The loading heading may have disappeared after the bounded transition.
    // Reannounce the ready workspace only when the user has not focused a control.
    if (
      document.activeElement === document.body &&
      !document.querySelector("dialog[open]")
    )
      focusWorkspaceHeading();
  }, [loading, authTransition]);
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
  useEffect(() => {
    boardPending.current = null;
    boardRevision.current++;
    setBoardBusy(false);
  }, [workspaceId, actor.uid]);
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
  async function reload(
    id = current.current.workspaceId,
    expectedBoardRevision,
  ) {
    const uid = current.current.uid;
    const result = await api("/workspace", { workspace: id });
    if (
      current.current.uid === uid &&
      current.current.workspaceId === id &&
      (expectedBoardRevision === undefined ||
        expectedBoardRevision === boardRevision.current)
    ) {
      const pending = boardPending.current;
      setData(
        pending?.uid === uid && pending.workspaceId === id
          ? {
              ...result,
              tasks: overlayBoardMove(result.tasks, pending.changes),
            }
          : result,
      );
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
    setNoteToOpen(null);
    setEmailMeetingId(null);
    setTaskId(null);
    setMemberProfileId(null);
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
      const calendarStatus = new URLSearchParams(window.location.search).get(
        "calendar",
      );
      if (calendarStatus) {
        setTab("assistant");
        if (calendarStatus === "connected")
          setToast(
            "Google Calendar connected. Choose the calendars for your assistant.",
          );
        else
          setError(
            "Calendar connection could not finish. Enable Calendar API and approve the requested access, then try again.",
          );
        const url = new URL(window.location.href);
        url.searchParams.delete("calendar");
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
    let active = true;
    const unsub = auth ? onAuthStateChanged(auth, setUser) : () => {};
    let returnTimer;
    if (auth && googleReturning) {
      const finish = () => {
        clearTimeout(returnTimer);
        clearGoogleReturn();
        setGoogleReturning(false);
        setRegistering(false);
      };
      returnTimer = setTimeout(() => {
        if (!active) return;
        active = false;
        setUser(auth.currentUser || null);
        setError(
          "Google sign-in took too long. Please try again or use your email.",
        );
        finish();
      }, 15000);
      completeGoogleRedirect()
        .then(async (result) => {
          if (!active) return;
          if (result) await result.user.getIdToken();
          if (!active) return;
          if (result) {
            setUser(result.user);
            beginAuthTransition();
          } else {
            setUser(auth.currentUser || null);
            setError(
              "Google sign-in was not completed. Please try again or use your email.",
            );
          }
          finish();
        })
        .catch((e) => {
          if (!active) return;
          setUser(auth.currentUser || null);
          setError(
            e.code === "auth/unauthorized-domain"
              ? "Google sign-in is not authorised for this domain. Contact meetings@earny.co.za."
              : "Google sign-in couldn't finish. Please try again or use your email.",
          );
          finish();
        });
    }
    function restored(event) {
      if (!event.persisted) return;
      if (hasGoogleReturn()) window.location.reload();
      else {
        beginAuthTransition();
      }
    }
    window.addEventListener("pageshow", restored);
    if (!auth) {
      setUser(null);
      clearGoogleReturn();
      setGoogleReturning(false);
      setRegistering(false);
    }
    return () => {
      active = false;
      clearTimeout(returnTimer);
      unsub();
      window.removeEventListener("pageshow", restored);
    };
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
      setMemberProfileId(null);
      setCalendarTaskId(null);
      setMeetingId(null);
      setEmailMeetingId(null);
      setSettings(false);
      setMenu(false);
      setTutorial(null);
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
    if (
      config?.authRequired &&
      data.workspace &&
      personal &&
      !personal.tutorialVersion &&
      !loading &&
      !authTransition &&
      !tutorial &&
      !menu &&
      !document.querySelector('dialog[open], [role="dialog"]') &&
      !tutorialSeen.current.has(actor.uid)
    ) {
      tutorialSeen.current.add(actor.uid);
      setTutorial("tour");
    }
  }, [
    config?.authRequired,
    data.workspace,
    personal,
    loading,
    authTransition,
    tutorial,
    menu,
    actor.uid,
  ]);
  useEffect(() => {
    function key(event) {
      const action = shortcutAction(event, {
        typing: isTypingTarget(event.target),
        blocked:
          !workspaceId ||
          !data.workspace ||
          loading ||
          !!authTransition ||
          !!tutorial ||
          menu ||
          !!document.querySelector('dialog[open], [role="dialog"]'),
        readOnly: data.role === "viewer",
        hasUndo: !!undo && undo.expires > Date.now() && !undoBusy && !boardBusy,
        singleKeys: personal?.singleKeyShortcuts !== false,
      });
      if (!action) return;
      event.preventDefault();
      if (action === "search") setSearchOpen(true);
      else if (action === "meeting") setNewMeeting(true);
      else if (action === "task") setTaskId("new");
      else if (action === "help") setTutorial("help");
      else if (action === "undo") undoLastChange();
      else if (action === "refresh")
        reload()
          .then(() => setToast("Workspace refreshed."))
          .catch((error) => setError(error.message));
      else {
        setTab(action);
        setMeetingId(null);
        setMenu(false);
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [
    workspaceId,
    loading,
    data.workspace,
    data.role,
    authTransition,
    tutorial,
    menu,
    undo,
    undoBusy,
    boardBusy,
    personal?.singleKeyShortcuts,
  ]);
  async function changeShortcutPreference(enabled) {
    if (shortcutBusy) return;
    const uid = actor.uid;
    const previous = personal?.singleKeyShortcuts !== false;
    setShortcutBusy(true);
    setShortcutError("");
    patchPersonal({ singleKeyShortcuts: enabled });
    try {
      const result = await api("/profile", {
        workspace: false,
        method: "PATCH",
        body: JSON.stringify({ singleKeyShortcuts: enabled }),
      });
      if (current.current.uid === uid)
        patchPersonal({
          singleKeyShortcuts: result.profile.singleKeyShortcuts,
        });
    } catch (error) {
      if (current.current.uid === uid) {
        patchPersonal({ singleKeyShortcuts: previous });
        setShortcutError(
          "Your shortcut preference could not be saved. " + error.message,
        );
      }
    } finally {
      setShortcutBusy(false);
    }
  }
  async function finishTutorial() {
    if (tutorialBusy) return;
    setTutorialBusy(true);
    setTutorialError("");
    const uid = actor.uid;
    try {
      const result = await api("/profile", {
        workspace: false,
        method: "PATCH",
        body: JSON.stringify({ tutorialVersion: 1 }),
      });
      if (current.current.uid !== uid) return;
      patchPersonal({ tutorialVersion: result.profile.tutorialVersion });
      setTutorial(null);
    } catch (error) {
      setTutorialError(
        "Your tutorial progress could not be saved. Please try again. " +
          error.message,
      );
    } finally {
      setTutorialBusy(false);
    }
  }
  async function undoLastChange() {
    if (!undo || undoBusy || boardBusy || undo.expires <= Date.now()) return;
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
  }
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
  async function moveBoardTask(task, destination) {
    const workspace = workspaceId,
      uid = actor.uid;
    if (boardPending.current)
      throw new Error("A move is still saving. Please wait a moment.");
    const operation = {
      uid,
      workspaceId: workspace,
      changes: previewBoardMove(data.tasks, task.id, destination),
      revision: ++boardRevision.current,
    };
    boardPending.current = operation;
    setBoardBusy(true);
    setData((previous) => ({
      ...previous,
      tasks: overlayBoardMove(previous.tasks, operation.changes),
    }));
    try {
      const result = await api("/tasks/" + task.id + "/move", {
        workspace,
        method: "POST",
        body: JSON.stringify({
          ...destination,
          expectedUpdatedAt: task.updatedAt,
        }),
      });
      if (
        current.current.uid !== uid ||
        current.current.workspaceId !== workspace
      )
        return;
      setData((previous) => {
        const activity = new Map(
          [...previous.activity, ...(result.activity || [])].map((item) => [
            item.id,
            item,
          ]),
        );
        return {
          ...previous,
          tasks: mergeSavedBoardTasks(
            previous.tasks,
            result.tasks || [result.task],
          ),
          activity: [...activity.values()]
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .slice(-200),
        };
      });
      if (result.undoToken)
        setUndo({
          token: result.undoToken,
          workspaceId: workspace,
          expires: Date.now() + 300000,
        });
      else setUndo(null);
    } catch (error) {
      if (
        current.current.uid === uid &&
        current.current.workspaceId === workspace
      ) {
        setData((previous) => ({
          ...previous,
          tasks: rollbackBoardMove(previous.tasks, operation.changes),
        }));
        if (boardPending.current === operation) boardPending.current = null;
        if (error.status === 409 || !error.status || error.status >= 500)
          reload(workspace, operation.revision).catch(() => {});
      }
      throw new Error(
        (error.status && error.status < 500
          ? "Move was not saved. "
          : "Could not confirm this move. ") + error.message,
      );
    } finally {
      if (boardPending.current === operation) boardPending.current = null;
      if (
        current.current.uid === uid &&
        current.current.workspaceId === workspace
      )
        setBoardBusy(false);
    }
  }
  async function meetingDeleted(result) {
    const id = workspaceId,
      uid = actor.uid;
    if (current.current.uid !== uid || current.current.workspaceId !== id)
      return;
    setMeetingId(null);
    if (result.deletedTaskIds.includes(taskId)) setTaskId(null);
    setUndo(null);
    setToast(
      `Meeting deleted${result.deletedTaskCount ? ` with ${result.deletedTaskCount} linked task${result.deletedTaskCount === 1 ? "" : "s"}` : ""}.`,
    );
    try {
      await reload(id);
    } catch (error) {
      setError(
        "Meeting deleted, but the workspace could not refresh. Refresh the page to load the latest data.",
      );
    }
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
  function renderApp() {
    if (googleReturning)
      return <WorkspaceLoading message="Finishing Google sign-in…" />;
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
          onAuthenticated={beginAuthTransition}
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
                data-tab={id}
                aria-current={tab === id ? "page" : undefined}
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
              <button
                className="text-button"
                onClick={() => setNewMeeting(true)}
              >
                Start with a transcript
              </button>
            )}
          </div>
          <div className="sidebar-foot">
            <button
              type="button"
              className="sidebar-profile-link"
              aria-label="Open your profile"
              onClick={() => {
                setTab("profile");
                setMeetingId(null);
                setMenu(false);
              }}
            >
              <span className="avatar dark">
                {personal?.avatar || user?.photoURL ? (
                  <img src={personal?.avatar || user.photoURL} alt="" />
                ) : (
                  name?.slice(0, 2).toUpperCase() || "SS"
                )}
              </span>
              <span className="sidebar-profile-copy">
                <strong>{name}</strong>
                <small>View your profile</small>
              </span>
            </button>
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
                className="icon-button desktop-keyboard-controls"
                aria-label="Shortcuts and tutorial"
                title="Shortcuts and tutorial"
                onClick={() => {
                  setTutorialError("");
                  setTutorial("help");
                }}
              >
                <KeyboardIcon />
              </button>
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
                {config?.provider === "gemini"
                  ? "Live analysis"
                  : "Sample mode"}
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
            <div
              className="page-transition"
              key={`${workspaceId}:${tab}:${meetingId || "overview"}`}
            >
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
                          assistant: "Make room for your next step.",
                          notes: "Your notebook, with a next step.",
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
                          board:
                            "Move tasks from a first step to a finished one.",
                          projects:
                            "A shared home for related conversations and commitments.",
                          team: "Manage your people, permissions and workspace.",
                          google:
                            "Bring in your notes. Review the work. Keep moving.",
                          assistant:
                            "Ask about your tasks, meetings and the time ahead.",
                          notes:
                            "Capture a page, keep a note or turn it into work for review.",
                          activity:
                            "See who changed what, and follow the work.",
                          profile:
                            "Your account, your work and the places you belong.",
                        }[tab]}
                  </p>
                </div>
                {!readOnly &&
                  tab !== "profile" &&
                  tab !== "assistant" &&
                  tab !== "notes" && (
                    <div className="heading-actions">
                      {(tab === "tasks" || tab === "board") && (
                        <button
                          className="button"
                          onClick={() => setTaskId("new")}
                        >
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
                      onTutorial={() => {
                        setTutorialError("");
                        setTutorial("tour");
                      }}
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
                            <br className="hidden md:block" /> and give every
                            next step a place to land.
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
                            <button
                              className="button"
                              onClick={() => {
                                setMeetingId(null);
                                setTab("assistant");
                              }}
                            >
                              <Icons.Compass size={19} />
                              Ask Shifty
                            </button>
                          </div>
                        </div>
                        <img
                          src="/art/meeting-blue.png"
                          alt="Illustration of colleagues planning their next steps"
                        />
                      </section>
                      <section
                        className="stats"
                        aria-label="Workspace shortcuts"
                      >
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
                              m.proposals.some(
                                (p) => p.reviewStatus === "pending",
                              ),
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
                                    !readOnly
                                      ? () => setEmailMeetingId(m.id)
                                      : null
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
                      onNote={(id) => {
                        setNoteToOpen(id);
                        setMeetingId(null);
                        setTab("notes");
                      }}
                    />
                  )}
                  {tab === "notes" && (
                    <Suspense
                      fallback={<p role="status">Opening your notes…</p>}
                    >
                      <Notes
                        key={workspaceId + ":" + actor.uid}
                        notes={data.notes}
                        projects={data.projects}
                        meetings={data.meetings}
                        workspaceId={workspaceId}
                        config={config}
                        readOnly={readOnly}
                        onChange={reload}
                        onMeeting={openMeeting}
                        onProcessed={(m, result) => {
                          openMeeting(m.id);
                          setToast(
                            result?.cached
                              ? "Already processed. Opened the saved meeting; reviews and task progress are unchanged."
                              : "Note processed. Review the proposed tasks.",
                          );
                        }}
                        openId={noteToOpen}
                        onOpenConsumed={() => setNoteToOpen(null)}
                      />
                    </Suspense>
                  )}
                  {tab === "assistant" && (
                    <Suspense fallback={<p role="status">Opening Shifty…</p>}>
                      <Assistant
                        key={workspaceId + ":" + actor.uid}
                        actor={actor}
                        workspaceId={workspaceId}
                        workspaceName={data.workspace?.name || "Your workspace"}
                        config={config}
                        readOnly={readOnly}
                        revision={assistantRevision}
                        timeZone={
                          personal?.preferences?.timeZone ||
                          "Africa/Johannesburg"
                        }
                        onTask={(id) => setTaskId(id)}
                        onMeeting={openMeeting}
                        onNote={(id) => {
                          setNoteToOpen(id);
                          setMeetingId(null);
                          setTab("notes");
                        }}
                        onChange={reload}
                        onEmail={(action) => {
                          setAssistantRecap({ ...action, workspaceId });
                          setEmailMeetingId(action.meetingId);
                        }}
                      />
                    </Suspense>
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
                      onCreated={async (m, result) => {
                        await reload();
                        openMeeting(m.id);
                        setToast(
                          result?.cached
                            ? "Already processed. Opened the saved meeting; reviews and task progress are unchanged."
                            : "Google source processed. Review your proposed tasks.",
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
                        onNote={(id) => {
                          setNoteToOpen(id);
                          setMeetingId(null);
                          setTab("notes");
                        }}
                        onPrepare={(id) => setPreparation({ meetingId: id })}
                        emailReady={config.emailReady}
                        workspace={data.workspace}
                        projects={data.projects}
                        readOnly={readOnly}
                        reload={reload}
                        onBack={() => setMeetingId(null)}
                        onDeleted={meetingDeleted}
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
                              onChange={(e) =>
                                setMeetingProject(e.target.value)
                              }
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
                                  !readOnly
                                    ? () => setEmailMeetingId(m.id)
                                    : null
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
                        onSaved={(views) =>
                          patchPersonal({ savedViews: views })
                        }
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
                          {filtered.length === 1 ? "task" : "tasks"} in this
                          view.
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
                                  <tr
                                    key={t.id}
                                    className={
                                      t.status === "Completed"
                                        ? "task-row-completed"
                                        : undefined
                                    }
                                  >
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
                                      {t.status !== "Completed" &&
                                        t.checklist?.length > 0 && (
                                          <span className="hint">
                                            {
                                              t.checklist.filter((c) => c.done)
                                                .length
                                            }
                                            /{t.checklist.length} steps
                                          </span>
                                        )}
                                    </td>
                                    <td data-label="Owner">{t.owner}</td>
                                    <td
                                      data-label="Due date"
                                      className={overdue(t) ? "late" : ""}
                                    >
                                      {formatDate(t.dueDate)}
                                      {t.status !== "Completed" &&
                                        !t.schedule && (
                                          <small className="saved-schedule">
                                            Not scheduled
                                          </small>
                                        )}
                                      {t.status !== "Completed" &&
                                        t.schedule && (
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
                                              waitingOn(t, data.tasks).length >
                                                0
                                            }
                                          >
                                            {s}
                                          </option>
                                        ))}
                                      </select>
                                      {waitingOn(t, data.tasks).length > 0 && (
                                        <span className="badge dependency-badge">
                                          Waiting on{" "}
                                          {waitingOn(t, data.tasks).length}{" "}
                                          task(s)
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
                                        {t.status !== "Completed" && (
                                          <button
                                            className="button small"
                                            disabled={
                                              readOnly ||
                                              t.status === "Completed" ||
                                              waitingOn(t, data.tasks).length >
                                                0
                                            }
                                            onClick={() =>
                                              changeStatus(t, "Completed")
                                            }
                                          >
                                            <Icons.Check size={15} />
                                            Done
                                          </button>
                                        )}
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
                                          onClick={() =>
                                            openMeeting(t.meetingId)
                                          }
                                        >
                                          {t.meetingTitle}
                                        </button>
                                      ) : (
                                        <span className="hint">
                                          Added manually
                                        </span>
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
                        <TaskBoard
                          key={workspaceId}
                          tasks={filtered}
                          allTasks={data.tasks}
                          projects={data.projects}
                          readOnly={readOnly}
                          selectedIds={selectedIds}
                          onSelect={toggleSelected}
                          onOpen={setTaskId}
                          onMove={moveBoardTask}
                        />
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
                      onProfile={(uid) => {
                        if (uid === actor.uid) setTab("profile");
                        else setMemberProfileId(uid);
                      }}
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
            </div>
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
            <span className="mobile-meeting-ring" aria-hidden="true">
              {Array.from("NEW MEETING • NEW MEETING • ").map(
                (character, index, letters) => (
                  <span
                    key={index}
                    style={{
                      "--letter-angle": `${(index * 360) / letters.length}deg`,
                    }}
                  >
                    {character === " " ? "\u00a0" : character}
                  </span>
                ),
              )}
            </span>
            <span className="mobile-meeting-centre" aria-hidden="true">
              <Icons.Plus size={28} />
            </span>
          </button>
        )}
        {memberProfileId && (
          <MemberProfile
            key={workspaceId + ":" + memberProfileId}
            uid={memberProfileId}
            workspaceId={workspaceId}
            onClose={() => setMemberProfileId(null)}
          />
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
            onCreated={async (m, result) => {
              await reload();
              setNewMeeting(false);
              setPreparedAgenda(null);
              openMeeting(m.id);
              setToast(
                result?.cached
                  ? "Already processed. Opened the saved meeting; reviews and task progress are unchanged."
                  : "Meeting processed. Review the proposed tasks.",
              );
            }}
          />
        )}
        {emailMeeting && !readOnly && (
          <RecapEmail
            key={workspaceId + ":" + emailMeeting.id}
            meeting={emailMeeting}
            reload={reload}
            initialRecipients={
              assistantRecap?.workspaceId === workspaceId &&
              assistantRecap.meetingId === emailMeeting.id
                ? assistantRecap.recipients
                : []
            }
            onSent={async (send) => {
              if (
                assistantRecap?.workspaceId === workspaceId &&
                assistantRecap.meetingId === emailMeeting.id &&
                ["accepted", "partial"].includes(send.status)
              ) {
                try {
                  await api(
                    "/assistant/actions/" + assistantRecap.id + "/recap-result",
                    {
                      method: "POST",
                      body: JSON.stringify({ requestId: send.id }),
                      headers: assistantRecap.chatId
                        ? { "X-Assistant-Chat-Id": assistantRecap.chatId }
                        : {},
                    },
                  );
                  setAssistantRevision((v) => v + 1);
                } catch {
                  setToast(
                    "Recap sent. The assistant's status could not refresh; the send is recorded on the meeting.",
                  );
                }
              }
            }}
            onClose={() => {
              setEmailMeetingId(null);
              setAssistantRecap(null);
            }}
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
            onDeleted={async (result) => {
              try {
                await taskSaved(result);
              } catch (error) {
                setError(
                  "Task deleted, but the workspace could not refresh. Refresh the page to load the latest data.",
                );
              }
            }}
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
            onNote={(id) => {
              setNoteToOpen(id);
              setMeetingId(null);
              setTab("notes");
            }}
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
              disabled={undoBusy || boardBusy}
              onClick={undoLastChange}
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
        {tutorial && (
          <ShortcutsTour
            key={tutorial}
            mode={tutorial}
            readOnly={readOnly}
            busy={tutorialBusy}
            error={tutorialError}
            singleKeys={personal?.singleKeyShortcuts !== false}
            shortcutBusy={shortcutBusy}
            shortcutError={shortcutError}
            onShortcutChange={changeShortcutPreference}
            onClose={
              tutorial === "help" ? () => setTutorial(null) : finishTutorial
            }
            onFinish={finishTutorial}
            onDismiss={() => setTutorial(null)}
            onRestart={() => {
              setTutorialError("");
              setTutorial("tour");
            }}
          />
        )}
        {switcherView}
      </div>
    );
  }
  return (
    <>
      <div className="auth-content" inert={authTransition ? true : undefined}>
        {renderApp()}
      </div>
      {authTransition && (
        <AuthTransition
          key={authTransition.id}
          ready={
            !!config &&
            !registering &&
            !loading &&
            !googleReturning &&
            (!config.authRequired || user !== undefined)
          }
          onFinished={finishAuthTransition}
        />
      )}
    </>
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
