import { firebaseConfig } from "./firebase-config.js";

const LEGACY_STORAGE_KEY = "study-agile-state-v1";
const STORAGE_KEY_PREFIX = "study-agile-state-v1:";
const PENDING_WRITE_PREFIX = "study-agile-pending-write-v1:";
const FIREBASE_VERSION = "11.10.0";
const DEFAULT_SUBJECTS = ["古漢", "現代文", "数学", "英語", "物理", "化学", "歴史", "地理", "公共"];
const DEFAULT_PERIOD_COUNT = 5;
const MAX_SUBJECTS = 30;
const MAX_SUBJECT_LENGTH = 40;
const MAX_PERIOD_COUNT = 20;

const elements = {
  authScreen: document.querySelector("#auth-screen"),
  authMessage: document.querySelector("#auth-message"),
  authUser: document.querySelector("#auth-user"),
  syncStatus: document.querySelector("#sync-status"),
  signInButtons: document.querySelectorAll("[data-google-sign-in]"),
  signOutButton: document.querySelector("#google-sign-out"),
  retryButton: document.querySelector("[data-auth-retry]"),
  dashboard: document.querySelector("#dashboard"),
  syncError: document.querySelector("#sync-error"),
  syncErrorMessage: document.querySelector("#sync-error-message"),
  retrySyncButton: document.querySelector("#retry-sync"),
  dateLabel: document.querySelector("#today-label"),
  summary: document.querySelector("#today-summary"),
  tasks: document.querySelector("#today-list"),
  tasksEmpty: document.querySelector("#today-empty"),
  carryOverdueTasks: document.querySelector("#carry-overdue-tasks"),
  pastTasks: document.querySelector("#past-task-list"),
  pastTasksEmpty: document.querySelector("#past-task-empty"),
  events: document.querySelector("#event-list"),
  eventsEmpty: document.querySelector("#event-empty"),
  futureEvents: document.querySelector("#future-event-list"),
  futureEventsEmpty: document.querySelector("#future-event-empty"),
  pastEvents: document.querySelector("#past-event-list"),
  pastEventsEmpty: document.querySelector("#past-event-empty"),
  eventDialog: document.querySelector("#event-dialog"),
  quizzes: document.querySelector("#quiz-list"),
  quizzesEmpty: document.querySelector("#quiz-empty"),
  quizDialog: document.querySelector("#quiz-dialog"),
  pools: document.querySelector("#pool-list"),
  poolsEmpty: document.querySelector("#pool-empty"),
  pastPoolsSection: document.querySelector("#past-pools"),
  pastPools: document.querySelector("#past-pool-list"),
  goalDialog: document.querySelector("#goal-dialog"),
  poolDialog: document.querySelector("#pool-dialog"),
  taskDialog: document.querySelector("#task-dialog"),
  taskDetailsDialog: document.querySelector("#task-details-dialog"),
  returnTaskDialog: document.querySelector("#return-task-dialog"),
  completeDialog: document.querySelector("#complete-dialog"),
  carryPoolDialog: document.querySelector("#carry-pool-dialog"),
  carryOverdueDialog: document.querySelector("#carry-overdue-dialog"),
  studyLogDialog: document.querySelector("#study-log-dialog"),
  settingsView: document.querySelector("#settings-view"),
  settingsDialog: document.querySelector("#settings-view"),
  settingsSubjects: document.querySelector("#settings-subject-list"),
  menuDialog: document.querySelector("#menu-dialog"),
  bottomNav: document.querySelector(".bottom-nav"),
  calendarView: document.querySelector("#calendar-view"),
  recordingView: document.querySelector("#recording-view"),
  recordingTaskSelect: document.querySelector("#recording-task-select"),
  recordingTaskList: document.querySelector("#recording-task-list"),
  recordingTaskEmpty: document.querySelector("#recording-task-empty"),
  recordingSession: document.querySelector("#recording-session"),
  recordingTaskTitle: document.querySelector("#recording-task-title"),
  recordingElapsed: document.querySelector("#recording-elapsed"),
  recordingClock: document.querySelector("#recording-clock"),
  recordingStart: document.querySelector("#recording-start"),
  recordingPause: document.querySelector("#recording-pause"),
  recordingEnd: document.querySelector("#recording-end"),
  calendarMonth: document.querySelector("#calendar-month"),
  calendarGrid: document.querySelector("#calendar-grid"),
  miniCalendarMonth: document.querySelector("#mini-calendar-month"),
  miniCalendarGrid: document.querySelector("#mini-calendar-grid"),
  miniCalendarPopover: document.querySelector("#mini-calendar-popover"),
  miniCalendarAgendaTitle: document.querySelector("#mini-calendar-agenda-title"),
  miniCalendarAgenda: document.querySelector("#mini-calendar-agenda"),
  miniCalendarAgendaEmpty: document.querySelector("#mini-calendar-agenda-empty"),
  calendarAgendaTitle: document.querySelector("#calendar-agenda-title"),
  calendarAgenda: document.querySelector("#calendar-agenda-list"),
  calendarAgendaEmpty: document.querySelector("#calendar-agenda-empty"),
  calendarStudyTotal: document.querySelector("#calendar-study-total"),
  calendarStudyList: document.querySelector("#calendar-study-list"),
  calendarStudyEmpty: document.querySelector("#calendar-study-empty"),
  calendarArchiveTotal: document.querySelector("#calendar-archive-total"),
  calendarArchiveMonthList: document.querySelector("#calendar-archive-month-list"),
  calendarArchiveEmpty: document.querySelector("#calendar-archive-empty"),
};

let today = dateKeyInJst(new Date());
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = today;
let miniCalendarSelectedDate = "";
let calendarRenderedMinute = -1;
const subjectFilters = new Map([
  ["today", new Set()],
  ["events", new Set()],
  ["quizzes", new Set()],
  ["pools", new Set()],
  ["past", new Set()],
  ["calendar", new Set()],
]);
let state = emptyState();
let pendingTaskRecord = null;
let selectingRecordingTask = false;
let recordingEndTaskId = null;
let currentUser = null;
let firebaseAuth = null;
let firebaseAuthApi = null;
let firestoreDb = null;
let firestoreStateRef = null;
let firestoreApi = null;
let saveQueue = Promise.resolve();
let legacyDataPendingMigration = false;
let authLoadGeneration = 0;
function createId() {
  return crypto.randomUUID();
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKeyInJst(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDate(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function getWeekday(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function getWeekStart(dateString) {
  return shiftDate(dateString, -getWeekday(dateString));
}

function addMonths(date, months) {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(date.getDate(), lastDay));
  return result;
}

function emptyState() {
  return {
    events: [],
    goals: [],
    quizzes: [],
    pools: [],
    tasks: [],
    studyTimer: null,
    settings: { subjects: [...DEFAULT_SUBJECTS], periodCount: DEFAULT_PERIOD_COUNT },
  };
}

function reconcileInPeriodStatuses(pools, tasks) {
  let changed = false;

  pools.forEach((pool) => {
    if (!pool.start || !pool.end || today < pool.start || today > pool.end) return;
    if (pool.status !== "active") {
      pool.status = "active";
      changed = true;
    }
  });

  tasks.forEach((task) => {
    const pool = task.poolId
      ? pools.find((item) => item.id === task.poolId)
      : pools.find((item) => (task.quizId && item.sourceQuizId === task.quizId)
        || (task.sourceGoalId && item.sourceGoalId === task.sourceGoalId));
    if (!pool?.start || !pool.end || today < pool.start || today > pool.end) return;
    if (task.completed) {
      if (task.status === "closed") {
        task.status = "active";
        changed = true;
      }
    } else if (task.status === "closed") {
      task.status = "active";
      changed = true;
    }
  });

  return changed;
}

function normalizeState(stored) {
  stored = stored && typeof stored === "object" ? stored : {};
  const events = Array.isArray(stored.events) ? stored.events : [];
  const goals = Array.isArray(stored.goals) ? stored.goals : [];
  events.forEach((event) => {
    event.memo = typeof event.memo === "string" ? event.memo.slice(0, 2000) : "";
    event.alwaysShow = Boolean(event.alwaysShow);
    const pinnedAt = Number(event.pinnedAt);
    event.pinnedAt = Number.isSafeInteger(pinnedAt) && pinnedAt > 0 ? pinnedAt : 0;
  });
  goals.forEach((goal) => {
    goal.memo = typeof goal.memo === "string" ? goal.memo.slice(0, 2000) : "";
  });
  const ungroupedGoals = goals.filter((goal) => !events.some((event) => event.id === goal.eventId));
  if (ungroupedGoals.length) {
    const legacyEvent = {
      id: createId(),
      title: "イベント未設定の長期計画",
      type: "other",
      start: "",
      end: "",
      memo: "",
    };
    events.push(legacyEvent);
    ungroupedGoals.forEach((goal) => { goal.eventId = legacyEvent.id; });
  }
  const storedSubjects = Array.isArray(stored.settings?.subjects)
    ? stored.settings.subjects
      .filter((subject) => typeof subject === "string")
      .map((subject) => subject.trim().slice(0, MAX_SUBJECT_LENGTH))
      .filter((subject, index, subjects) => subject && subjects.indexOf(subject) === index)
      .slice(0, MAX_SUBJECTS)
    : [];
  const storedPeriodCount = Number(stored.settings?.periodCount);
  const tasks = Array.isArray(stored.tasks) ? stored.tasks : [];
  const pools = Array.isArray(stored.pools) ? stored.pools : [];
  pools.forEach((pool) => {
    pool.memo = typeof pool.memo === "string" ? pool.memo.slice(0, 2000) : "";
  });
  tasks.forEach((task) => {
    task.memo = typeof task.memo === "string" ? task.memo.slice(0, 2000) : "";
  });
  pools.forEach((pool) => {
    if (pool.scope === "長期計画の提出日" && pool.deadline) {
      pool.scope = formatSubmissionDate(pool.deadline);
    }
  });
  tasks.forEach((task) => {
    if (task.scope !== "長期計画の提出日") return;
    const pool = pools.find((item) => item.id === task.poolId);
    if (pool?.deadline) task.scope = formatSubmissionDate(pool.deadline);
  });
  tasks.forEach((task) => {
    const seconds = Number(task.studySeconds);
    task.studySeconds = Number.isSafeInteger(seconds) && seconds > 0 ? seconds : 0;
    task.studyLogs = (Array.isArray(task.studyLogs) ? task.studyLogs : [])
      .filter((log) => log && typeof log.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(log.date)
        && Number.isSafeInteger(Number(log.seconds)) && Number(log.seconds) >= 0
        && Number.isSafeInteger(Number(log.amount)) && Number(log.amount) >= 0
        && (Number(log.seconds) > 0 || Number(log.amount) > 0))
      .map((log) => ({ date: log.date, seconds: Number(log.seconds), amount: Number(log.amount) }));
  });
  const storedTimer = stored.studyTimer;
  const studyTimer = storedTimer && typeof storedTimer.taskId === "string"
    && tasks.some((task) => task.id === storedTimer.taskId)
    ? {
      taskId: storedTimer.taskId,
      elapsedSeconds: Number.isSafeInteger(Number(storedTimer.elapsedSeconds)) && Number(storedTimer.elapsedSeconds) > 0
        ? Number(storedTimer.elapsedSeconds)
        : 0,
      startedAt: Number.isFinite(Number(storedTimer.startedAt)) && Number(storedTimer.startedAt) > 0
        ? Number(storedTimer.startedAt)
        : null,
      hasStarted: Boolean(storedTimer.hasStarted || storedTimer.startedAt || Number(storedTimer.elapsedSeconds) > 0),
    }
    : null;
  return {
    events,
    goals,
    quizzes: Array.isArray(stored.quizzes) ? stored.quizzes : [],
    pools,
    tasks,
    studyTimer,
    settings: {
      subjects: storedSubjects.length ? storedSubjects : [...DEFAULT_SUBJECTS],
      periodCount: Number.isSafeInteger(storedPeriodCount) && storedPeriodCount >= 1 && storedPeriodCount <= MAX_PERIOD_COUNT
        ? storedPeriodCount
        : DEFAULT_PERIOD_COUNT,
    },
  };
}

function readLocalState(key) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? null : normalizeState(JSON.parse(value));
  } catch (error) {
    console.error("保存データを読み込めませんでした。", error);
    throw new Error("このブラウザに保存されたデータを読み込めませんでした。", { cause: error });
  }
}

function saveState({ deferRender = false } = {}) {
  if (!currentUser || !firestoreStateRef) {
    console.error("ログイン状態を確認できないため、データを保存できません。");
    return false;
  }
  if (state.studyTimer && !state.tasks.some((task) => task.id === state.studyTimer.taskId)) {
    state.studyTimer = null;
  }
  const updatedAt = Date.now();
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${currentUser.uid}`, JSON.stringify(state));
    localStorage.setItem(`${PENDING_WRITE_PREFIX}${currentUser.uid}`, String(updatedAt));
  } catch (error) {
    console.error("データを保存できませんでした。", error);
    setAuthMessage("この端末の一時保存に失敗しました。クラウドへの保存を試みています。", true);
  }
  if (!deferRender) render();
  const user = currentUser;
  const stateRef = firestoreStateRef;
  const snapshot = JSON.parse(JSON.stringify(state));
  queueCloudWrite(user, stateRef, snapshot, updatedAt);
  return true;
}

function queueCloudWrite(user, stateRef, data, updatedAt) {
  saveQueue = saveQueue
    .then(() => writeCloudState(stateRef, data, updatedAt))
    .then(() => {
      clearPendingWrite(user.uid, updatedAt);
      if (currentUser?.uid === user.uid) setAuthMessage("同期済み");
      if (legacyDataPendingMigration) {
        removeLegacyData();
        legacyDataPendingMigration = false;
      }
    })
    .catch((error) => {
      console.error("Firestoreへのデータ保存に失敗しました。", error);
      if (currentUser?.uid === user.uid) {
        setAuthMessage("クラウドへの同期に失敗しました。通信状態を確認して再同期してください。", true);
      }
    });
  return saveQueue;
}

async function writeCloudState(stateRef, data, updatedAt = Date.now()) {
  await firestoreApi.setDoc(stateRef, {
    state: data,
    clientUpdatedAt: updatedAt,
    updatedAt: firestoreApi.serverTimestamp(),
  });
}

function clearPendingWrite(uid, updatedAt) {
  const key = `${PENDING_WRITE_PREFIX}${uid}`;
  try {
    if (Number(localStorage.getItem(key)) === updatedAt) localStorage.removeItem(key);
  } catch (error) {
    console.error("同期済み状態を更新できませんでした。", error);
  }
}

function removeLegacyData() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (error) {
    console.error("移行済みデータをブラウザから削除できませんでした。", error);
  }
}

function setAuthMessage(message, isError = false) {
  elements.authMessage.textContent = message;
  elements.authMessage.classList.toggle("error", isError);
  elements.syncStatus.textContent = message;
  elements.syncStatus.classList.toggle("error", isError);
  elements.syncErrorMessage.textContent = message;
  elements.syncError.hidden = !isError || !currentUser || elements.dashboard.hidden;
}

function setAuthenticatedView(isReady) {
  elements.authScreen.hidden = isReady;
  elements.dashboard.hidden = !isReady;
  elements.recordingView.hidden = true;
  elements.settingsView.hidden = true;
  document.body.classList.remove("recording-fullscreen");
  elements.authUser.hidden = !currentUser;
  elements.authUser.textContent = currentUser?.displayName || currentUser?.email || "";
  elements.authUser.title = currentUser?.email || "";
  elements.syncStatus.hidden = !currentUser;
  elements.signOutButton.hidden = !currentUser;
  elements.signInButtons.forEach((button) => {
    button.hidden = Boolean(currentUser);
    button.disabled = !firebaseAuth || Boolean(currentUser);
  });
  elements.retryButton.hidden = !currentUser || isReady;
}

function isFirebaseConfigured() {
  return ["apiKey", "authDomain", "projectId", "appId"].every((key) => (
    typeof firebaseConfig[key] === "string" && firebaseConfig[key].trim().length > 0
  ));
}

function getAccountLoadErrorMessage(error) {
  if (error?.code === "permission-denied") {
    return "Firestoreへのアクセスが拒否されました。Firebase ConsoleでプロジェクトとFirestoreルールの公開状態を確認してください。 (permission-denied)";
  }
  if (error?.code === "unavailable") {
    return "Firestoreに接続できません。通信状態を確認して再読み込みしてください。 (unavailable)";
  }
  if (error?.code === "failed-precondition") {
    return "Firestoreの設定を確認できませんでした。Firebase ConsoleでFirestore Databaseが作成済みか確認してください。 (failed-precondition)";
  }
  const errorCode = typeof error?.code === "string" ? ` (${error.code})` : "";
  return `データを読み込めませんでした。通信状態を確認し、再読み込みしてください。${errorCode}`;
}

async function loadUserState(user) {
  const generation = ++authLoadGeneration;
  let loadStage = "Firestoreのドキュメント参照を作成";
  let taskProgressReconciled = false;
  currentUser = user;
  firestoreStateRef = null;
  state = emptyState();
  setAuthenticatedView(false);
  setAuthMessage("アカウントのデータを読み込んでいます。");
  try {
    const stateRef = firestoreApi.doc(firestoreDb, "users", user.uid, "planner", "state");
    loadStage = "Firestoreからユーザーデータを取得";
    const remoteSnapshot = await firestoreApi.getDoc(stateRef);
    if (generation !== authLoadGeneration) return;

    loadStage = "Firestoreのユーザーデータを処理";
    let shouldSeedCloud = false;
    let cloudWriteAt = Date.now();
    if (remoteSnapshot.exists()) {
      const remoteData = remoteSnapshot.data();
      loadStage = "端末に保存された同期状態を確認";
      const pendingAt = Number(localStorage.getItem(`${PENDING_WRITE_PREFIX}${user.uid}`) || 0);
      const remoteUpdatedAt = Number(remoteData.clientUpdatedAt || 0);
      const cachedState = pendingAt > remoteUpdatedAt
        ? readLocalState(`${STORAGE_KEY_PREFIX}${user.uid}`)
        : null;
      if (cachedState) {
        state = cachedState;
        shouldSeedCloud = true;
        cloudWriteAt = pendingAt;
      } else {
        state = normalizeState(remoteData.state);
      }
    } else {
      loadStage = "端末に保存されたユーザーデータを確認";
      const cachedState = readLocalState(`${STORAGE_KEY_PREFIX}${user.uid}`);
      if (cachedState) {
        state = cachedState;
        shouldSeedCloud = true;
      } else {
        const legacyState = readLocalState(LEGACY_STORAGE_KEY);
        if (legacyState) {
          state = legacyState;
          legacyDataPendingMigration = true;
          shouldSeedCloud = true;
        }
      }
    }

    taskProgressReconciled = state.pools.reduce(
      (changed, pool) => syncTaskProgress(pool.id) || changed,
      false,
    );
    taskProgressReconciled = reconcileInPeriodStatuses(state.pools, state.tasks) || taskProgressReconciled;
    loadStage = "端末にユーザーデータを一時保存";
    firestoreStateRef = stateRef;
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${user.uid}`, JSON.stringify(state));
    } catch (error) {
      console.error("データの一時保存に失敗しました。", error);
    }

    if (shouldSeedCloud) {
      loadStage = "初回データをFirestoreに保存";
      await writeCloudState(stateRef, state, cloudWriteAt);
      clearPendingWrite(user.uid, cloudWriteAt);
      taskProgressReconciled = false;
      if (legacyDataPendingMigration) {
        removeLegacyData();
        legacyDataPendingMigration = false;
      }
    }
  } catch (error) {
    console.error("アカウントのデータを読み込めませんでした。", {
      stage: loadStage,
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
      error,
    });
    if (generation !== authLoadGeneration) return;
    setAuthenticatedView(false);
    setAuthMessage(`${getAccountLoadErrorMessage(error)} [処理: ${loadStage}]`, true);
    return;
  }
  if (generation !== authLoadGeneration) return;
  setAuthenticatedView(true);
  setAuthMessage("同期済み");
  const schedulesMoved = moveDueSchedulesToPools();
  const pastTasksCompleted = completeAchievedPastTasks();
  if (schedulesMoved || taskProgressReconciled || pastTasksCompleted) saveState();
  else render();
}

async function initializeAuth() {
  if (!isFirebaseConfigured()) {
    setAuthMessage("Firebaseの設定が必要です。READMEの「Firebaseの設定」を参照してください。", true);
    return;
  }
  try {
    const [appApi, authApi, dbApi] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
    ]);
    const app = appApi.initializeApp(firebaseConfig);
    firebaseAuth = authApi.getAuth(app);
    firebaseAuthApi = authApi;
    firestoreDb = dbApi.initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    });
    firestoreApi = dbApi;
    elements.signInButtons.forEach((button) => { button.disabled = false; });
    setAuthMessage("Googleアカウントでログインしてください。初回利用時は自動で新規登録されます。");
    authApi.onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        loadUserState(user);
      } else {
        authLoadGeneration += 1;
        currentUser = null;
        firestoreStateRef = null;
        state = emptyState();
        legacyDataPendingMigration = false;
        elements.calendarView.hidden = true;
        setAuthenticatedView(false);
        setAuthMessage("Googleアカウントでログインしてください。初回利用時は自動で新規登録されます。");
      }
    });
  } catch (error) {
    console.error("Firebaseを初期化できませんでした。", error);
    setAuthMessage("Firebaseを初期化できませんでした。設定とネットワークを確認してください。", true);
  }
}

elements.signInButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (!firebaseAuth || !firebaseAuthApi) return;
    elements.signInButtons.forEach((signInButton) => { signInButton.disabled = true; });
    setAuthMessage("Googleアカウントでログインまたは新規登録しています。");
    try {
      await firebaseAuthApi.signInWithPopup(firebaseAuth, new firebaseAuthApi.GoogleAuthProvider());
    } catch (error) {
      console.error("Googleログインに失敗しました。", error);
      setAuthMessage("Googleログインに失敗しました。もう一度お試しください。", true);
    } finally {
      elements.signInButtons.forEach((signInButton) => {
        signInButton.disabled = !firebaseAuth || Boolean(currentUser);
      });
    }
  });
});

elements.signOutButton.addEventListener("click", async () => {
  if (!firebaseAuth || !firebaseAuthApi) return;
  elements.signOutButton.disabled = true;
  try {
    await firebaseAuthApi.signOut(firebaseAuth);
  } catch (error) {
    console.error("ログアウトに失敗しました。", error);
    setAuthMessage("ログアウトに失敗しました。もう一度お試しください。", true);
  } finally {
    elements.signOutButton.disabled = false;
  }
});

elements.retryButton.addEventListener("click", () => {
  if (currentUser) loadUserState(currentUser);
});

elements.retrySyncButton.addEventListener("click", () => {
  if (!currentUser || !firestoreStateRef) return;
  const user = currentUser;
  const updatedAt = Date.now();
  try {
    localStorage.setItem(`${PENDING_WRITE_PREFIX}${user.uid}`, String(updatedAt));
  } catch (error) {
    console.error("再同期状態を一時保存できませんでした。", error);
  }
  queueCloudWrite(user, firestoreStateRef, JSON.parse(JSON.stringify(state)), updatedAt);
});

elements.carryOverdueTasks.addEventListener("click", () => {
  openCarryOverdueDialog();
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatDate(value, options = { month: "numeric", day: "numeric" }) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ja-JP", options).format(new Date(year, month - 1, day));
}

function formatSubmissionDate(value) {
  return `提出日 ${formatDate(value, { year: "numeric", month: "long", day: "numeric" })}`;
}

function goalProgress(goal) {
  const completed = Number(goal.completed);
  return Math.min(goal.total * goal.laps, Number.isFinite(completed) ? Math.max(0, completed) : 0);
}

function taskMeetsMinimum(task, amount) {
  return (task.actual || 0) + amount >= task.minimum;
}

function getAllSubjects() {
  const subjects = new Set(state.settings.subjects);
  [...state.goals, ...state.quizzes, ...state.pools, ...state.tasks]
    .forEach((item) => {
      if (item.subject) subjects.add(item.subject);
    });
  return [...subjects];
}

function matchesSubjectFilter(section, subject) {
  const selected = subjectFilters.get(section);
  return !selected?.size || (subject ? selected.has(subject) : false);
}

function getTaskSubject(task) {
  const pool = state.pools.find((item) => item.id === task.poolId);
  return pool?.subject || task.subject || "";
}

function getEventSubjects(event) {
  const subjects = new Set();
  state.goals
    .filter((goal) => goal.eventId === event.id)
    .forEach((goal) => { if (goal.subject) subjects.add(goal.subject); });
  state.pools
    .filter((pool) => pool.eventId === event.id
      || state.goals.some((goal) => goal.eventId === event.id && goal.id === pool.goalId))
    .forEach((pool) => { if (pool.subject) subjects.add(pool.subject); });
  state.quizzes
    .filter((quiz) => quiz.eventId === event.id)
    .forEach((quiz) => { if (quiz.subject) subjects.add(quiz.subject); });
  return subjects;
}

function renderSubjectFilters() {
  const subjects = getAllSubjects();
  document.querySelectorAll("[data-subject-filter]").forEach((container) => {
    const section = container.dataset.subjectFilter;
    const selected = subjectFilters.get(section) || new Set();
    const count = selected.size;
    container.innerHTML = `<details><summary>${count ? `${count}科目選択中` : "すべての科目"}</summary>
      <div class="subject-filter-options">
        <label><input type="checkbox" data-subject-filter-all="${escapeHtml(section)}" ${count ? "" : "checked"} />すべて</label>
        ${subjects.map((subject) => `<label><input type="checkbox" data-subject-filter-section="${escapeHtml(section)}" value="${escapeHtml(subject)}" ${selected.has(subject) ? "checked" : ""} />${escapeHtml(subject)}</label>`).join("")}
      </div>
    </details>`;
  });
}

function render() {
  reconcileInPeriodStatuses(state.pools, state.tasks);
  renderSubjectFilters();
  elements.dateLabel.textContent = formatDate(today, { month: "long", day: "numeric", weekday: "short" });
  renderSubjectOptions();
  renderEventOptions();
  renderPeriodOptions();
  renderTasks();
  renderEvents();
  renderQuizzes();
  renderMiniCalendar();
  renderPools();
  renderSummary();
  renderPoolOptions();
  renderRecording();
  if (!elements.calendarView.hidden) renderCalendar();
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = String(Math.floor(total / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const remainingSeconds = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}:${remainingSeconds}`;
}

function getRecordingTask() {
  return state.tasks.find((task) => task.id === state.studyTimer?.taskId);
}

function getRecordingElapsedSeconds() {
  const timer = state.studyTimer;
  if (!timer) return 0;
  const runningSeconds = timer.startedAt ? Math.floor((Date.now() - timer.startedAt) / 1000) : 0;
  return timer.elapsedSeconds + Math.max(0, runningSeconds);
}

function getTaskStudySeconds(task) {
  const activeSeconds = state.studyTimer?.taskId === task.id && state.studyTimer.startedAt
    ? Math.max(0, Math.floor((Date.now() - state.studyTimer.startedAt) / 1000))
    : 0;
  const loggedSeconds = (task.studyLogs || []).reduce((total, log) => total + log.seconds, 0);
  return (task.studySeconds || 0) + loggedSeconds + activeSeconds;
}

function getTaskStudySecondsOnDate(task, date) {
  const taskDateSeconds = task.date === date ? (task.studySeconds || 0) : 0;
  const activeSeconds = task.date === date && state.studyTimer?.taskId === task.id && state.studyTimer.startedAt
    ? Math.max(0, Math.floor((Date.now() - state.studyTimer.startedAt) / 1000))
    : 0;
  const loggedSeconds = (task.studyLogs || [])
    .filter((log) => log.date === date)
    .reduce((total, log) => total + log.seconds, 0);
  return taskDateSeconds + activeSeconds + loggedSeconds;
}

function getStudySecondsForDate(date) {
  return state.tasks
    .reduce((total, task) => total + getTaskStudySecondsOnDate(task, date), 0);
}

function getFilteredStudySecondsForDate(date, subjectSection = "calendar") {
  return state.tasks
    .filter((task) => matchesSubjectFilter(subjectSection, getTaskSubject(task)))
    .reduce((total, task) => total + getTaskStudySecondsOnDate(task, date), 0);
}

function hasOverMinimumRecordForDate(date) {
  return state.tasks.some((task) => {
    const minimum = Number(task.minimum);
    return task.date === date
      && Number.isSafeInteger(minimum)
      && minimum > 0
      && getTaskStudyRecordOnDate(task, date).amount > minimum;
  });
}

function studyHeatLevel(seconds) {
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  if (minutes < 180) return 4;
  return 5;
}

function formatCalendarDuration(seconds) {
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}分`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}m`;
}

function renderRecordingClock() {
  const now = new Date();
  elements.recordingClock.textContent = `${new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now)} JST`;
}

function renderRecording() {
  const task = getRecordingTask();
  const showingTaskSelect = selectingRecordingTask || !task;
  elements.recordingTaskSelect.hidden = !showingTaskSelect;
  elements.recordingSession.hidden = showingTaskSelect;
  const todayTasks = state.tasks
    .filter((item) => item.date === today)
    .sort(compareTasksByDeadlineAndSubject);
  elements.recordingTaskList.innerHTML = todayTasks.map((item) => {
    const pool = state.pools.find((poolItem) => poolItem.id === item.poolId);
    const title = pool?.title || item.title;
    const subject = pool?.subject || item.subject || "科目未設定";
    return `<button class="recording-task-option" type="button" data-record-task="${escapeHtml(item.id)}">
      <span class="recording-option-title">${escapeHtml(title)}</span>
      <span class="recording-option-detail">${escapeHtml(subject)} ・ 最低 ${escapeHtml(item.minimum)} ${escapeHtml(pool?.unit || item.unit || "")}</span>
    </button>`;
  }).join("");
  elements.recordingTaskEmpty.hidden = todayTasks.length > 0;
  if (!task || showingTaskSelect) {
    renderRecordingClock();
    return;
  }
  const pool = state.pools.find((item) => item.id === task.poolId);
  const title = pool?.title || task.title;
  elements.recordingTaskTitle.innerHTML = `<button class="recording-task-title-button" type="button" data-recording-task-details="${escapeHtml(task.id)}" aria-label="${escapeHtml(title)}の詳細を表示">${escapeHtml(title)}</button>`;
  elements.recordingElapsed.textContent = formatDuration(getRecordingElapsedSeconds());
  elements.recordingStart.hidden = Boolean(state.studyTimer.startedAt);
  elements.recordingStart.textContent = state.studyTimer.elapsedSeconds ? "記録を再開" : "記録開始";
  elements.recordingPause.hidden = !state.studyTimer.startedAt;
  elements.recordingEnd.hidden = !state.studyTimer.hasStarted;
  renderRecordingClock();
}

function closeMenuDialog() {
  if (elements.menuDialog.open) elements.menuDialog.close();
}

function openSettingsView() {
  closeMenuDialog();
  renderSettingsForm();
  elements.dashboard.hidden = true;
  elements.calendarView.hidden = true;
  elements.recordingView.hidden = true;
  elements.settingsView.hidden = false;
  document.body.classList.remove("recording-fullscreen");
  window.scrollTo({ top: 0 });
}

function openSettingsHome() {
  elements.settingsView.hidden = true;
  elements.calendarView.hidden = true;
  elements.recordingView.hidden = true;
  elements.dashboard.hidden = !elements.authScreen.hidden;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openRecordingView() {
  selectingRecordingTask = !getRecordingTask();
  closeMenuDialog();
  elements.dashboard.hidden = true;
  elements.calendarView.hidden = true;
  elements.settingsView.hidden = true;
  elements.recordingView.hidden = false;
  document.body.classList.add("recording-fullscreen");
  renderRecording();
  window.scrollTo({ top: 0 });
}

function addRunningTimeToTask(timer, now = Date.now()) {
  if (!timer?.startedAt) return;
  const task = state.tasks.find((item) => item.id === timer.taskId);
  const elapsed = Math.max(0, Math.floor((now - timer.startedAt) / 1000));
  if (task) task.studySeconds = (task.studySeconds || 0) + elapsed;
  timer.elapsedSeconds += elapsed;
  timer.startedAt = null;
}

function renderSubjectOptions() {
  const options = `<option value="" selected disabled>科目を選択してください</option>${state.settings.subjects
    .map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`)
    .join("")}`;
  document.querySelectorAll('#quiz-form [name="subject"], #goal-form [name="subject"]').forEach((select) => {
    const selected = select.value;
    select.innerHTML = options;
    if (state.settings.subjects.includes(selected)) select.value = selected;
  });
}

function renderEventOptions() {
  const select = document.querySelector('#quiz-form [name="eventId"]');
  const selected = select.value;
  select.innerHTML = `<option value="">イベントに所属しない</option>${state.events
    .map((event) => `<option value="${escapeHtml(event.id)}">${escapeHtml(event.title)}</option>`)
    .join("")}`;
  if (state.events.some((event) => event.id === selected)) select.value = selected;
}

function renderPeriodOptions(selectedValue) {
  const select = document.querySelector('#quiz-form [name="period"]');
  const selected = selectedValue ?? select.value;
  const options = ['<option value="" selected disabled>校時を選択してください</option>'];
  for (let period = 1; period <= state.settings.periodCount; period += 1) {
    options.push(`<option value="${period}">${period}校時</option>`);
  }
  const selectedPeriod = Number(selected);
  if (Number.isSafeInteger(selectedPeriod) && selectedPeriod > state.settings.periodCount) {
    options.push(`<option value="${selectedPeriod}">${selectedPeriod}校時（登録済み）</option>`);
  }
  select.innerHTML = options.join("");
  if (selected) select.value = String(selected);
}

function settingsSubjectRow(subject = "", originalSubject = "") {
  return `<div class="settings-subject-row" data-original-subject="${escapeHtml(originalSubject)}">
    <input type="text" name="subject" value="${escapeHtml(subject)}" maxlength="${MAX_SUBJECT_LENGTH}" aria-label="科目名" required />
    <button class="text-button icon-action" type="button" data-move-setting-subject="-1" aria-label="科目を上へ移動" title="上へ">↑</button>
    <button class="text-button icon-action" type="button" data-move-setting-subject="1" aria-label="科目を下へ移動" title="下へ">↓</button>
    <button class="text-button icon-action delete-button" type="button" data-remove-setting-subject aria-label="${subject ? `${escapeHtml(subject)}を削除` : "科目を削除"}" title="削除">🗑️</button>
  </div>`;
}

function renderSettingsForm() {
  const form = elements.settingsDialog.querySelector("form");
  form.elements.periodCount.value = state.settings.periodCount;
  elements.settingsSubjects.innerHTML = state.settings.subjects
    .map((subject) => settingsSubjectRow(subject, subject))
    .join("");
  form.querySelector("[data-add-setting-subject]").disabled = state.settings.subjects.length >= MAX_SUBJECTS;
  updateSettingsSubjectMoveButtons();
}

function updateSettingsSubjectMoveButtons() {
  const rows = [...elements.settingsSubjects.querySelectorAll(".settings-subject-row")];
  rows.forEach((row, index) => {
    row.querySelector('[data-move-setting-subject="-1"]').disabled = index === 0;
    row.querySelector('[data-move-setting-subject="1"]').disabled = index === rows.length - 1;
  });
}

function getTaskSubjectOrder(task) {
  const pool = state.pools.find((item) => item.id === task.poolId);
  const subject = pool?.subject || task.subject;
  return getSubjectOrder(subject);
}

function getSubjectOrder(subject) {
  const index = state.settings.subjects.indexOf(subject);
  return index < 0 ? state.settings.subjects.length : index;
}

function compareTasksByDeadlineAndSubject(a, b) {
  return b.date.localeCompare(a.date) || getTaskSubjectOrder(a) - getTaskSubjectOrder(b);
}

function compareGoalsByDeadlineAndSubject(a, b) {
  const dateA = a.deadline || a.submissionDate || "9999-12-31";
  const dateB = b.deadline || b.submissionDate || "9999-12-31";
  return dateA.localeCompare(dateB) || getSubjectOrder(a.subject) - getSubjectOrder(b.subject);
}

function renderSummary() {
  const todaysTasks = state.tasks
    .filter((task) => task.date === today)
    .filter((task) => matchesSubjectFilter("today", getTaskSubject(task)));
  const completed = todaysTasks.filter((task) => task.completed).length;
  elements.summary.innerHTML = `<span class="stat-number">${completed}<span style="font-size:13px;color:#93a099"> / ${todaysTasks.length}</span></span><span class="stat-caption">今日の完了</span>`;
}

function renderTasks() {
  const visibleTasks = state.tasks
    .filter((task) => task.date === today || (!task.completed && task.status !== "closed" && task.date < today))
    .filter((task) => matchesSubjectFilter("today", getTaskSubject(task)))
    .sort((a, b) => Number(a.completed) - Number(b.completed)
      || b.date.localeCompare(a.date)
      || getTaskSubjectOrder(a) - getTaskSubjectOrder(b));
  const pastTasks = state.tasks
    .filter((task) => (task.completed || task.status === "closed") && task.date !== today)
    .filter((task) => matchesSubjectFilter("past", getTaskSubject(task)))
    .sort(compareTasksByDeadlineAndSubject);
  const overdueTasks = visibleTasks.filter((task) => task.date < today);
  elements.carryOverdueTasks.hidden = overdueTasks.length === 0;
  elements.carryOverdueTasks.textContent = overdueTasks.length
    ? `今日に繰り越す（${overdueTasks.length}件）`
    : "今日に繰り越す";
  elements.tasksEmpty.hidden = visibleTasks.length > 0;
  elements.tasks.innerHTML = visibleTasks.map((task) => renderTaskCard(task)).join("");
  elements.pastTasksEmpty.hidden = pastTasks.length > 0;
  elements.pastTasks.innerHTML = pastTasks.map((task) => renderTaskCard(task)).join("");
}

function renderTaskCard(task) {
  const pool = state.pools.find((item) => item.id === task.poolId);
  const unit = pool?.unit || task.unit;
  const title = pool?.title || task.title;
  const subject = pool?.subject || task.subject || "科目未設定";
  const canReturn = task.status !== "closed" && canReturnTaskToPool(task);
  const returnButton = canReturn
    ? `<button class="text-button icon-action" type="button" data-return-task="${escapeHtml(task.id)}" aria-label="週間プールへ戻す" title="${hasTaskProgress(task) ? "実績や勉強記録があるToDoは戻せません" : "週間プールへ戻す"}"${hasTaskProgress(task) ? " disabled" : ""}>↩️</button>`
    : "";
  const completeLabel = task.completed ? "記録済み" : "実績を記録";
  const recorded = task.actual || 0;
  const achieved = recorded >= task.minimum;
  const surplus = task.completed && achieved && recorded > task.minimum
    ? `<span class="surplus">＋${recorded - task.minimum} ${escapeHtml(unit)} できた！</span>`
    : "";
  const shortfall = !task.completed && !achieved
    ? `<span class="shortfall">あと ${task.minimum - recorded} ${escapeHtml(unit)}</span>`
    : "";
  const taskState = task.completed
    ? "完了"
    : task.status === "closed"
      ? "終了"
      : achieved
        ? "最低達成・継続中"
        : recorded > 0
          ? "記録あり"
          : "未着手";
  const isPast = task.date < today;
  const date = isPast ? `${formatDate(task.date, { month: "numeric", day: "numeric", weekday: "short" })} ・ ` : "";
  const carryButtons = isPast && !task.completed
    ? isExpiredPoolTask(task)
      ? `<button class="text-button" type="button" data-carry-weekly-task="${escapeHtml(task.id)}">残りを繰り越す</button><button class="text-button" type="button" data-decline-weekly-task="${escapeHtml(task.id)}">繰り越さない</button>`
      : task.status !== "closed"
        ? `<button class="text-button" type="button" data-carry-overdue-task="${escapeHtml(task.id)}">今日に繰り越す</button>`
        : ""
    : "";
  const taskActions = task.status === "closed"
    ? carryButtons
    : `<button class="text-button icon-action" type="button" data-edit-task="${escapeHtml(task.id)}" aria-label="タスクを編集" title="編集">✏️</button>${carryButtons}${task.completed ? "" : `${achieved ? `<button class="task-complete" type="button" data-mark-task-complete="${escapeHtml(task.id)}">✅ 完了</button>` : ""}<button class="task-complete" type="button" data-complete-task="${escapeHtml(task.id)}">${completeLabel}</button>`}`;
  return `<article class="task-card${task.completed ? " done" : ""}${isPast && !task.completed && task.status !== "closed" ? " past-uncompleted" : ""}">
    <div class="task-card-summary">
      <div class="task-main">
        <button class="card-title detail-title" type="button" data-task-details="${escapeHtml(task.id)}" aria-label="${escapeHtml(title)}の詳細を表示">${escapeHtml(title)}</button>
        <p class="task-detail">${date}${escapeHtml(subject)} ・ ${taskState} ・ 最低 ${task.minimum} ${escapeHtml(unit)} ・ 累計 ${recorded} ${escapeHtml(unit)} ・ 勉強 ${formatDuration(getTaskStudySeconds(task))}</p>
      </div>
      ${(surplus || shortfall) ? `<div class="task-remainder">${surplus}${shortfall}</div>` : ""}
    </div>
    <div class="task-card-footer">
      <div class="task-actions">${returnButton}${taskActions}</div>
    </div>
  </article>`;
}

function renderEvents() {
  const futureThreshold = dateKey(addMonths(new Date(), 2));
  const pastEvents = state.events
    .filter((event) => event.end && event.end < today)
    .filter((event) => {
      const subjects = getEventSubjects(event);
      return !subjectFilters.get("past")?.size
        || [...subjects].some((subject) => matchesSubjectFilter("past", subject));
    })
    .sort((a, b) => b.end.localeCompare(a.end));
  const upcomingEvents = state.events.filter((event) => !event.end || event.end >= today);
  const compareUpcomingEvents = (a, b) => (a.start || "9999-12-31").localeCompare(b.start || "9999-12-31")
    || (a.end || "9999-12-31").localeCompare(b.end || "9999-12-31");
  const currentEvents = upcomingEvents
    .filter((event) => event.pinnedAt || event.alwaysShow || !event.start || event.start < futureThreshold)
    .filter((event) => {
      const subjects = getEventSubjects(event);
      return !subjectFilters.get("events")?.size
        || [...subjects].some((subject) => matchesSubjectFilter("events", subject));
    })
    .sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0) || compareUpcomingEvents(a, b));
  const futureEvents = upcomingEvents
    .filter((event) => !event.pinnedAt && !event.alwaysShow && event.start && event.start >= futureThreshold)
    .filter((event) => {
      const subjects = getEventSubjects(event);
      return !subjectFilters.get("events")?.size
        || [...subjects].some((subject) => matchesSubjectFilter("events", subject));
    })
    .sort(compareUpcomingEvents);
  elements.eventsEmpty.hidden = currentEvents.length > 0;
  elements.futureEventsEmpty.hidden = futureEvents.length > 0;
  elements.pastEventsEmpty.hidden = pastEvents.length > 0;
  elements.events.innerHTML = currentEvents.map((event) => renderEventCard(event)).join("");
  elements.futureEvents.innerHTML = futureEvents.map((event) => renderEventCard(event, true)).join("");
  elements.pastEvents.innerHTML = pastEvents.map((event) => renderEventCard(event, false, "past")).join("");
}

function scheduleEventRefresh() {
  const now = new Date();
  const nextDay = new Date(`${shiftDate(dateKeyInJst(now), 1)}T00:00:00+09:00`);
  window.setTimeout(() => {
    const previousToday = today;
    const currentDate = dateKeyInJst(new Date());
    today = currentDate;
    if (selectedCalendarDate === previousToday) {
      selectedCalendarDate = currentDate;
      calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    }
    const schedulesMoved = moveDueSchedulesToPools();
    const pastTasksCompleted = completeAchievedPastTasks();
    const statusesReconciled = reconcileInPeriodStatuses(state.pools, state.tasks);
    if (schedulesMoved || pastTasksCompleted || statusesReconciled) saveState();
    else render();
    renderCalendar();
    scheduleEventRefresh();
  }, nextDay.getTime() - now.getTime() + 50);
}

function getSchedulePoolStart(dueDate) {
  const weekday = getWeekday(dueDate);
  return shiftDate(getWeekStart(dueDate), weekday <= 2 ? -7 : 0);
}

function findSchedulePool(schedule) {
  const pools = state.pools.filter((pool) => schedule.sourceGoalId
    ? pool.sourceGoalId === schedule.sourceGoalId
    : pool.sourceQuizId === schedule.id);
  return pools.find((pool) => pool.status === "active") || pools[0];
}

function isScheduleComplete(schedule) {
  const pool = findSchedulePool(schedule);
  return state.tasks.some((task) => task.completed
    && (schedule.sourceGoalId
      ? task.sourceGoalId === schedule.sourceGoalId || (pool && task.poolId === pool.id)
      : task.quizId === schedule.id || (pool && task.poolId === pool.id)));
}

function hasScheduleTaskToday(schedule) {
  const pool = findSchedulePool(schedule);
  return state.tasks.some((task) => task.date === today
    && (schedule.sourceGoalId
      ? task.sourceGoalId === schedule.sourceGoalId || (pool && task.poolId === pool.id)
      : task.quizId === schedule.id || (pool && task.poolId === pool.id)));
}

function createSchedulePool(schedule) {
  if (findSchedulePool(schedule)) return false;
  const goal = schedule.sourceGoalId
    ? state.goals.find((item) => item.id === schedule.sourceGoalId)
    : null;
  const start = getSchedulePoolStart(schedule.date);
  const title = schedule.title || (schedule.kind === "submission" ? "提出物" : "小テスト");
  const pool = {
    id: createId(),
    ...(schedule.sourceGoalId ? { sourceGoalId: schedule.sourceGoalId } : { sourceQuizId: schedule.id }),
    eventId: schedule.eventId || goal?.eventId || "",
    goalId: goal?.id || "",
    goalTitle: goal?.title || "小テスト・提出物予定",
    title,
    subject: schedule.subject || goal?.subject || "",
    unit: goal?.unit || (schedule.kind === "submission" ? (schedule.unit || "件") : "回"),
    scope: schedule.scope || "",
    scopeUnit: schedule.unit || "",
    deadline: schedule.date,
    start,
    end: shiftDate(start, 6),
    target: goal ? Math.max(1, goal.total * goal.laps - goalProgress(goal)) : 1,
    completed: 0,
    status: "active",
    memo: "",
  };
  state.pools.push(pool);
  state.tasks.filter((task) => !task.poolId && (schedule.sourceGoalId
    ? task.sourceGoalId === schedule.sourceGoalId
    : task.quizId === schedule.id)).forEach((task) => {
    task.poolId = pool.id;
  });
  syncTaskProgress(pool.id);
  return true;
}

function moveDueSchedulesToPools() {
  let changed = false;
  getScheduledQuizzes().forEach((schedule) => {
    if (today < getSchedulePoolStart(schedule.date) || findSchedulePool(schedule)) return;
    if (isScheduleComplete(schedule)) return;
    changed = createSchedulePool(schedule) || changed;
  });
  return changed;
}

function renderEventCard(event, isInFutureList = false, subjectSection = "events") {
  const eventGoals = state.goals
    .filter((goal) => goal.eventId === event.id)
    .filter((goal) => matchesSubjectFilter(subjectSection, goal.subject))
    .sort(compareGoalsByDeadlineAndSubject);
  const typeLabel = getEventTypeLabel(event.type);
  const eventDates = event.start && event.end
    ? `${formatDate(event.start)} — ${formatDate(event.end)}`
    : "日程未設定";
  const isPastEvent = event.end && event.end < today;
  const topPinButton = `<button class="button button-quiet button-small event-always-show" type="button" data-toggle-event-top-pin="${escapeHtml(event.id)}" aria-pressed="${Boolean(event.pinnedAt)}" aria-label="${event.pinnedAt ? "上部固定を解除" : "上部に固定"}" title="${event.pinnedAt ? "上部固定を解除" : "上部に固定"}">${event.pinnedAt ? "上部固定中" : "上部に固定"}</button>`;
  const visibilityActions = isPastEvent ? "" : event.alwaysShow
    ? `${topPinButton}<button class="text-button event-unshow" type="button" data-toggle-event-always-show="${escapeHtml(event.id)}">常に表示を解除</button>`
    : isInFutureList
      ? `<button class="button button-quiet button-small event-always-show" type="button" data-toggle-event-always-show="${escapeHtml(event.id)}" aria-label="イベントと長期計画を常に表示" title="イベントと長期計画を常に表示">常に表示</button>`
      : topPinButton;
  return `<article class="event-card">
    <div class="event-heading">
      <div class="card-top"><div><button class="card-title detail-title" type="button" data-event-details="${escapeHtml(event.id)}" aria-label="${escapeHtml(event.title)}の詳細を表示">${escapeHtml(event.title)}</button><p class="card-subtitle">${eventDates}</p></div>
        <span class="badge">${typeLabel}</span>
      </div>
      <div class="event-actions">${visibilityActions}<button class="text-button icon-action" type="button" data-edit-event="${escapeHtml(event.id)}" aria-label="イベントを編集" title="編集">✏️</button><button class="text-button icon-action delete-button" type="button" data-delete-event="${escapeHtml(event.id)}" aria-label="イベントを削除" title="削除">🗑️</button><button class="button button-secondary button-small" type="button" data-add-goal="${escapeHtml(event.id)}">＋ 長期計画を追加</button></div>
    </div>
    <div class="event-goals">${eventGoals.length
      ? eventGoals.map((goal) => renderGoalCard(goal)).join("")
      : `<p class="muted-empty">このイベントの長期計画はまだありません。</p>`}
    </div>
  </article>`;
}

function getEventTypeLabel(type) {
  return {
    holiday: "長期休暇",
    regular_exam: "定期試験",
    mock_exam: "模擬試験",
    other: "その他",
  }[type] || "その他";
}

function renderGoalCard(goal) {
  const total = goal.total * goal.laps;
  const completed = goalProgress(goal);
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const lap = Math.min(goal.laps, Math.floor(completed / goal.total) + 1);
  const status = completed >= total ? "完了" : `${lap}周目 / ${goal.laps}周`;
  const datesMatch = goal.deadline && goal.deadline === goal.submissionDate;
  const deadline = datesMatch
    ? `提出期限 ${formatDate(goal.deadline)}`
    : goal.deadline ? `期限 ${formatDate(goal.deadline)}` : "期限なし";
  const submissionDate = goal.submissionDate && !datesMatch ? `提出 ${formatDate(goal.submissionDate)}` : "";
  const poolButton = state.pools.some((pool) => pool.goalId === goal.id && pool.status === "active")
    ? ""
    : `<button class="text-button" type="button" data-add-pool="${escapeHtml(goal.id)}">＋ 週間プールに追加</button>`;
  return `<article class="goal-card">
    <div class="card-top"><div><button class="card-title detail-title" type="button" data-goal-details="${escapeHtml(goal.id)}" aria-label="${escapeHtml(goal.title)}の詳細を表示">${escapeHtml(goal.title)}</button><p class="card-subtitle">${escapeHtml(goal.subject || "科目未設定")} ・ ${escapeHtml(goal.total)} ${escapeHtml(goal.unit)} × ${escapeHtml(goal.laps)}周</p><p class="card-subtitle goal-date-meta">${escapeHtml(deadline)}${submissionDate ? ` ・ ${escapeHtml(submissionDate)}` : ""}</p></div>
      <div class="goal-actions"><span class="badge${percent === 100 ? " complete" : ""}">${status}</span><button class="text-button icon-action" type="button" data-edit-goal="${escapeHtml(goal.id)}" aria-label="長期計画を編集" title="編集">✏️</button><button class="text-button icon-action delete-button" type="button" data-delete-goal="${escapeHtml(goal.id)}" aria-label="長期計画を削除" title="削除">🗑️</button></div>
    </div>
    <div class="progress-track" role="progressbar" aria-label="${escapeHtml(goal.title)}の進捗" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${percent}%"></div></div>
    <div class="progress-meta"><span>${completed} / ${total} ${escapeHtml(goal.unit)}</span><span>${percent}%</span></div>
    ${poolButton ? `<div class="goal-pool-action">${poolButton}</div>` : ""}
  </article>`;
}

function getScheduledQuizzes() {
  const goalSubmissions = state.goals
    .filter((goal) => goal.submissionDate)
    .map((goal) => ({
      sourceGoalId: goal.id,
      kind: "submission",
      title: goal.title,
      subject: goal.subject,
      date: goal.submissionDate,
      scope: formatSubmissionDate(goal.submissionDate),
      period: null,
      eventId: goal.eventId,
    }));
  return [...state.quizzes, ...goalSubmissions]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.period || 99) - (b.period || 99));
}

function renderQuizzes() {
  const quizzes = getScheduledQuizzes()
    .filter((quiz) => matchesSubjectFilter("quizzes", quiz.subject));
  elements.quizzesEmpty.hidden = quizzes.length > 0;
  elements.quizzes.innerHTML = quizzes.map((quiz) => {
    const event = state.events.find((item) => item.id === quiz.eventId);
    const matchingPool = findSchedulePool(quiz);
    const completedTask = isScheduleComplete(quiz);
    const hasTodayTask = hasScheduleTaskToday(quiz);
    const poolButton = matchingPool || completedTask
      ? ""
      : `<button class="text-button" type="button" data-add-schedule-pool="${escapeHtml(quiz.sourceGoalId || quiz.id)}" data-schedule-source="${quiz.sourceGoalId ? "goal" : "quiz"}">週間プールへ</button>`;
    const actions = quiz.sourceGoalId
      ? `${poolButton}<button class="text-button icon-action" type="button" data-edit-goal="${escapeHtml(quiz.sourceGoalId)}" aria-label="長期計画を編集" title="編集">✏️</button>`
      : `<button class="text-button icon-action" type="button" data-edit-quiz="${escapeHtml(quiz.id)}" aria-label="予定を編集" title="編集">✏️</button>
         ${poolButton}
         ${completedTask || hasTodayTask ? "" : `<button class="text-button" type="button" data-add-quiz-task="${escapeHtml(quiz.id)}">今日のToDoへ</button>`}
         <button class="text-button icon-action" type="button" data-duplicate-quiz="${escapeHtml(quiz.id)}" aria-label="予定を複製" title="複製">📑</button>
         <button class="text-button icon-action delete-button" type="button" data-delete-quiz="${escapeHtml(quiz.id)}" aria-label="予定を削除" title="削除">🗑️</button>`;
    return `<article class="quiz-card${completedTask ? " completed" : ""}">
      <div class="quiz-info">
        <button class="card-title detail-title" type="button" data-quiz-details="${escapeHtml(quiz.sourceGoalId || quiz.id)}" data-quiz-source="${quiz.sourceGoalId ? "goal" : "quiz"}" aria-label="${escapeHtml(quiz.title || "小テスト・提出物")}の詳細を表示">${escapeHtml(quiz.title || "小テスト・提出物")}</button>
        <div class="quiz-meta"><span>${formatDate(quiz.date, { month: "numeric", day: "numeric", weekday: "short" })}</span>${quiz.period ? `<strong>${quiz.period}<span>校時</span></strong>` : ""}<span class="badge">${escapeHtml(quiz.subject)}</span><span class="badge">${quiz.kind === "submission" ? "提出物" : "小テスト"}</span>${event ? `<span class="badge">${escapeHtml(event.title)}</span>` : ""}</div>
      </div>
      <div class="quiz-actions">${actions}</div>
    </article>`;
  }).join("");
}

function getSchedulesForDate(date, subjectSection = "calendar") {
  const events = state.events
    .filter((event) => event.start && event.end && event.start <= date && event.end >= date)
    .filter((event) => {
      const subjects = getEventSubjects(event);
      return !subjectFilters.get(subjectSection)?.size
        || [...subjects].some((subject) => matchesSubjectFilter(subjectSection, subject));
    })
    .map((event) => ({ kind: "event", event }));
  const quizzes = getScheduledQuizzes()
    .filter((quiz) => quiz.date === date)
    .filter((quiz) => matchesSubjectFilter(subjectSection, quiz.subject))
    .map((quiz) => ({ kind: "quiz", quiz }));
  return [...events, ...quizzes];
}

function renderMiniCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  elements.miniCalendarMonth.textContent = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(calendarMonth);
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStart = dateKey(new Date(year, month, 1));
  const monthEnd = dateKey(new Date(year, month, daysInMonth));
  const weekCount = Math.ceil((firstWeekday + daysInMonth) / 7);
  const weeks = [];
  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    const weekStart = shiftDate(monthStart, weekIndex * 7 - firstWeekday);
    const weekEnd = shiftDate(weekStart, 6);
    const cells = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = shiftDate(weekStart, weekday);
      if (date < monthStart || date > monthEnd) {
        cells.push('<span class="mini-calendar-cell mini-calendar-cell-empty" role="presentation"></span>');
        continue;
      }
      const isToday = date === today;
      const selected = date === miniCalendarSelectedDate;
      const overMinimum = hasOverMinimumRecordForDate(date);
      cells.push(`<button class="mini-calendar-cell${isToday ? " is-today" : ""}${selected ? " is-selected" : ""}${overMinimum ? " is-over-minimum" : ""}" type="button" role="gridcell" data-mini-calendar-date="${date}" aria-label="${formatDate(date, { year: "numeric", month: "long", day: "numeric", weekday: "long" })}${overMinimum ? "、最低量を超えた実績あり" : ""}" aria-pressed="${selected}">
        <span>${Number(date.slice(-2))}</span>
      </button>`);
    }

    const overlappingEvents = state.events
      .filter((item) => item.start && item.end && item.start <= weekEnd && item.end >= weekStart && item.start <= monthEnd && item.end >= monthStart)
      .filter((item) => {
        const subjects = getEventSubjects(item);
        return !subjectFilters.get("quizzes")?.size
          || [...subjects].some((subject) => matchesSubjectFilter("quizzes", subject));
      })
      .map((item) => ({
        event: item,
        start: item.start > weekStart ? item.start : weekStart,
        end: item.end < weekEnd ? item.end : weekEnd,
      }))
      .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.event.title.localeCompare(b.event.title));
    const laneEnds = [];
    const bands = overlappingEvents.map(({ event: item, start, end }) => {
      let lane = laneEnds.findIndex((laneEnd) => laneEnd < start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = end;
      const startColumn = new Date(`${start}T00:00:00`).getDay() + 1;
      const endColumn = new Date(`${end}T00:00:00`).getDay() + 2;
      const classes = [
        "calendar-event-band",
        item.start === start ? "is-event-start" : "",
        item.end === end ? "is-event-end" : "",
      ].filter(Boolean).join(" ");
      return `<span class="${classes}" style="grid-column:${startColumn}/${endColumn};grid-row:${lane + 1}" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>`;
    });
    const submissionDates = new Set(getScheduledQuizzes()
      .filter((quiz) => quiz.kind === "submission" && quiz.date >= weekStart && quiz.date <= weekEnd && quiz.date >= monthStart && quiz.date <= monthEnd)
      .filter((quiz) => matchesSubjectFilter("quizzes", quiz.subject))
      .map((quiz) => quiz.date));
    const submissionBands = [...submissionDates].map((date) => {
      const column = new Date(`${date}T00:00:00`).getDay() + 1;
      return `<span class="mini-calendar-submission-band" style="grid-column:${column};grid-row:${laneEnds.length + 1}" title="提出物あり"></span>`;
    });
    weeks.push(`<section class="mini-calendar-week" style="--mini-event-space:${(laneEnds.length + (submissionDates.size ? 1 : 0)) * 13}px">
      <div class="mini-calendar-days">${cells.join("")}</div>
      <div class="mini-calendar-event-layer" aria-hidden="true">${bands.join("")}${submissionBands.join("")}</div>
    </section>`);
  }
  elements.miniCalendarGrid.innerHTML = weeks.join("");
  elements.miniCalendarPopover.hidden = !miniCalendarSelectedDate;
  if (miniCalendarSelectedDate) {
    elements.miniCalendarAgendaTitle.textContent = formatDate(miniCalendarSelectedDate, { year: "numeric", month: "long", day: "numeric", weekday: "long" });
    const schedules = getSchedulesForDate(miniCalendarSelectedDate, "quizzes");
    elements.miniCalendarAgenda.innerHTML = renderCalendarAgendaItems(schedules);
    elements.miniCalendarAgendaEmpty.hidden = schedules.length > 0;
  }
}

function renderCalendar() {
  calendarRenderedMinute = Math.floor(Date.now() / 60000);
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  elements.calendarMonth.textContent = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(calendarMonth);
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStart = dateKey(new Date(year, month, 1));
  const monthEnd = dateKey(new Date(year, month, daysInMonth));
  const weekCount = Math.ceil((firstWeekday + daysInMonth) / 7);
  const weeks = [];
  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    const weekStart = shiftDate(monthStart, weekIndex * 7 - firstWeekday);
    const weekEnd = shiftDate(weekStart, 6);
    const cells = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = shiftDate(weekStart, weekday);
      if (date < monthStart || date > monthEnd) {
        cells.push('<span class="calendar-cell calendar-cell-empty" role="presentation"></span>');
        continue;
      }
      const schedules = getSchedulesForDate(date, "calendar");
      const quizzes = schedules.filter((schedule) => schedule.kind === "quiz").map((schedule) => schedule.quiz);
      const isToday = date === today;
      const selected = date === selectedCalendarDate;
      const scheduleCount = schedules.length;
      const studySeconds = getStudySecondsForDate(date);
      const studyMinutes = Math.floor(studySeconds / 60);
      const heatLevel = studyHeatLevel(studySeconds);
      const overMinimum = hasOverMinimumRecordForDate(date);
      cells.push(`<button class="calendar-cell${isToday ? " is-today" : ""}${selected ? " is-selected" : ""}${heatLevel ? ` study-level-${heatLevel}` : ""}${overMinimum ? " is-over-minimum" : ""}" type="button" role="gridcell" data-calendar-date="${date}" aria-label="${formatDate(date, { year: "numeric", month: "long", day: "numeric", weekday: "long" })}${scheduleCount ? `、予定${scheduleCount}件` : ""}${studySeconds ? `、勉強時間${formatDuration(studySeconds)}` : ""}${overMinimum ? "、最低量を超えた実績あり" : ""}" aria-pressed="${selected}">
        <span class="calendar-day-number">${Number(date.slice(-2))}</span>
        ${quizzes.slice(0, 2).map((quiz) => `<span class="calendar-marker quiz">${escapeHtml(quiz.subject)}${quiz.period ? ` ${quiz.period}校時` : ""} ${quiz.kind === "submission" ? `提出物${quiz.title ? ` ${escapeHtml(quiz.title)}` : ""}` : "小テスト"}</span>`).join("")}
        ${quizzes.length > 2 ? `<span class="calendar-marker-more">ほか${quizzes.length - 2}件</span>` : ""}
        ${studyMinutes ? `<span class="calendar-study-time" title="勉強時間 ${formatDuration(studySeconds)}">${formatCalendarDuration(studySeconds)}</span>` : ""}
      </button>`);
    }

    const overlappingEvents = state.events
      .filter((item) => item.start && item.end && item.start <= weekEnd && item.end >= weekStart && item.start <= monthEnd && item.end >= monthStart)
      .filter((item) => {
        const subjects = getEventSubjects(item);
        return !subjectFilters.get("calendar")?.size
          || [...subjects].some((subject) => matchesSubjectFilter("calendar", subject));
      })
      .map((item) => {
        const start = item.start > weekStart ? item.start : weekStart;
        const end = item.end < weekEnd ? item.end : weekEnd;
        return {
          event: item,
          start: start < monthStart ? monthStart : start,
          end: end > monthEnd ? monthEnd : end,
        };
      })
      .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.event.title.localeCompare(b.event.title));
    const laneEnds = [];
    const bands = overlappingEvents.map(({ event: item, start, end }) => {
      let lane = laneEnds.findIndex((laneEnd) => laneEnd < start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = end;
      const startColumn = new Date(`${start}T00:00:00`).getDay() + 1;
      const endColumn = new Date(`${end}T00:00:00`).getDay() + 2;
      const classes = [
        "calendar-event-band",
        item.start === start ? "is-event-start" : "",
        item.end === end ? "is-event-end" : "",
      ].filter(Boolean).join(" ");
      return `<span class="${classes}" style="grid-column:${startColumn}/${endColumn};grid-row:${lane + 1}" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>`;
    }).join("");
    const eventSpace = 36 + laneEnds.length * 18;
    weeks.push(`<section class="calendar-week" style="--event-space:${eventSpace}px">
      <div class="calendar-days">${cells.join("")}</div>
      <div class="calendar-event-layer" aria-hidden="true">${bands}</div>
    </section>`);
  }
  elements.calendarGrid.innerHTML = weeks.join("");
  renderCalendarAgenda();
  renderStudyArchive();
}

function renderStudyArchive() {
  const monthlySeconds = new Map();
  const addStudyTime = (date, seconds) => {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const recordedSeconds = Number(seconds);
    if (!Number.isFinite(recordedSeconds) || recordedSeconds <= 0) return;
    const month = date.slice(0, 7);
    monthlySeconds.set(month, (monthlySeconds.get(month) || 0) + recordedSeconds);
  };

  state.tasks.forEach((task) => {
    if (!matchesSubjectFilter("calendar", getTaskSubject(task))) return;
    addStudyTime(task.date, task.studySeconds);
    (task.studyLogs || []).forEach((log) => addStudyTime(log.date, log.seconds));
    if (state.studyTimer?.taskId === task.id && state.studyTimer.startedAt) {
      addStudyTime(task.date, Math.max(0, Math.floor((Date.now() - state.studyTimer.startedAt) / 1000)));
    }
  });

  const months = [...monthlySeconds].sort(([first], [second]) => first.localeCompare(second));
  const totalSeconds = months.reduce((total, [, seconds]) => total + seconds, 0);
  const longestMonth = Math.max(0, ...months.map(([, seconds]) => seconds));
  elements.calendarArchiveTotal.textContent = formatDuration(totalSeconds);
  elements.calendarArchiveEmpty.hidden = months.length > 0;
  elements.calendarArchiveMonthList.innerHTML = months.map(([month, seconds]) => {
    const [year, monthNumber] = month.split("-").map(Number);
    const label = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" })
      .format(new Date(year, monthNumber - 1, 1));
    const barWidth = Math.max(3, (seconds / longestMonth) * 100);
    return `<li class="calendar-archive-month">
      <span class="calendar-archive-month-label">${label}</span>
      <span class="calendar-archive-bar-track" aria-hidden="true"><span class="calendar-archive-bar" style="width:${barWidth}%"></span></span>
      <time>${formatDuration(seconds)}</time>
    </li>`;
  }).join("");
}

function renderCalendarAgenda() {
  const date = selectedCalendarDate;
  const schedules = getSchedulesForDate(date, "calendar");
  elements.calendarAgendaTitle.textContent = formatDate(date, { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  elements.calendarAgendaEmpty.hidden = schedules.length > 0;
  elements.calendarAgenda.innerHTML = renderCalendarAgendaItems(schedules, true);
  const groupedStudyTasks = new Map();
  state.tasks.forEach((task) => {
    if (!matchesSubjectFilter("calendar", getTaskSubject(task))) return;
    const { seconds, amount } = getTaskStudyRecordOnDate(task, date);
    if (seconds === 0 && amount === 0) return;
    const key = getStudyTaskGroupKey(task);
    const group = groupedStudyTasks.get(key) || { task, tasks: [], seconds: 0, amount: 0 };
    group.tasks.push(task);
    group.seconds += seconds;
    group.amount += amount;
    groupedStudyTasks.set(key, group);
  });
  const studyTasks = [...groupedStudyTasks.values()]
    .sort((a, b) => b.seconds - a.seconds || a.task.title.localeCompare(b.task.title));
  const totalSeconds = studyTasks.reduce((total, group) => total + group.seconds, 0);
  elements.calendarStudyTotal.textContent = `合計 ${formatDuration(totalSeconds)}`;
  elements.calendarStudyEmpty.hidden = studyTasks.length > 0;
  elements.calendarStudyList.innerHTML = studyTasks.map(({ task, tasks, seconds, amount }) => {
    const pool = state.pools.find((item) => item.id === task.poolId);
    const title = pool?.title || task.title;
    const subject = pool?.subject || task.subject || "科目未設定";
    const recordedAmount = amount > 0 ? `実績 ${amount} ${pool?.unit || task.unit || ""}` : "実績なし";
    const recording = tasks.some((item) => item.date === date && state.studyTimer?.taskId === item.id && state.studyTimer.startedAt);
    return `<article class="calendar-study-item"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subject)} ・ ${escapeHtml(recordedAmount)}</span></div><div class="calendar-study-actions"><time>${formatDuration(seconds)}</time><button class="text-button icon-action delete-button" type="button" data-delete-study-record="${escapeHtml(task.id)}" aria-label="${escapeHtml(title)}の勉強記録を削除" title="${recording ? "計測中は削除できません" : "削除"}"${recording ? " disabled" : ""}>🗑️</button></div></article>`;
  }).join("");
}

function renderCalendarAgendaItems(schedules, includeScope = false) {
  return schedules.map((schedule) => {
    if (schedule.kind === "event") {
      return `<article class="agenda-item agenda-event"><span class="agenda-kind">イベント</span><strong>${escapeHtml(schedule.event.title)}</strong></article>`;
    }
    const quiz = schedule.quiz;
    const scope = includeScope
      ? (quiz.scope ? `範囲: ${escapeHtml(quiz.scope)}${quiz.unit ? ` ${escapeHtml(quiz.unit)}` : ""}` : "範囲未設定")
      : "";
    const kind = quiz.kind === "submission" ? "提出物" : "小テスト";
    const period = quiz.period ? ` ・ ${quiz.period}校時` : "";
    const event = state.events.find((item) => item.id === quiz.eventId);
    return `<article class="agenda-item agenda-quiz"><span class="agenda-kind">${kind}</span><p>${escapeHtml(quiz.subject)}${period} ・ ${escapeHtml(quiz.title || kind)}${scope ? ` ・ ${scope}` : ""}${event ? ` ・ ${escapeHtml(event.title)}` : ""}</p></article>`;
  }).join("");
}

function getTaskStudyRecordOnDate(task, date) {
  const logs = task.studyLogs || [];
  const amountFromLogs = logs.reduce((total, log) => total + log.amount, 0);
  const amountOnDate = logs
    .filter((log) => log.date === date)
    .reduce((total, log) => total + log.amount, 0);
  const legacyAmount = task.date === date
    ? Math.max(0, Number(task.actual || 0) - amountFromLogs)
    : 0;
  return {
    seconds: getTaskStudySecondsOnDate(task, date),
    amount: legacyAmount + amountOnDate,
  };
}

function getStudyTaskGroupKey(task) {
  return task.poolId || task.quizId || task.sourceGoalId || task.id;
}

function hasTaskProgress(task) {
  return task.completed || Number(task.actual || 0) > 0 || Number(task.studySeconds || 0) > 0
    || (task.studyLogs || []).length > 0
    || (state.studyTimer?.taskId === task.id
      && (state.studyTimer.hasStarted || state.studyTimer.startedAt || Number(state.studyTimer.elapsedSeconds || 0) > 0));
}

function canReturnTaskToPool(task) {
  if (task.status === "closed") return false;
  if (task.poolId) {
    const pool = state.pools.find((item) => item.id === task.poolId);
    return pool?.status === "active";
  }
  const quiz = getScheduledQuizzes().find((item) => task.sourceGoalId
    ? item.sourceGoalId === task.sourceGoalId
    : item.id === task.quizId);
  if (!quiz) return false;
  const pool = findSchedulePool(quiz);
  return !pool || pool.status === "active";
}

function isExpiredPoolTask(task) {
  const pool = state.pools.find((item) => item.id === task.poolId);
  return Boolean(pool?.end && pool.end < today);
}

function getPoolReturnDestination(pool) {
  if (pool.sourceQuizId) {
    return state.quizzes.some((quiz) => quiz.id === pool.sourceQuizId) ? "予定" : "";
  }
  return state.goals.some((goal) => goal.id === pool.goalId) ? "長期計画" : "";
}

function renderPools() {
  const pastPoolThreshold = shiftDate(today, -7);
  const currentPools = state.pools.filter((pool) => !pool.end || pool.end >= today)
    .filter((pool) => matchesSubjectFilter("pools", pool.subject))
    .sort((a, b) => a.start.localeCompare(b.start));
  const recentlyExpiredPools = state.pools.filter((pool) => pool.end && pool.end < today && pool.end >= pastPoolThreshold)
    .filter((pool) => matchesSubjectFilter("pools", pool.subject))
    .sort((a, b) => a.start.localeCompare(b.start));
  const pastPools = state.pools.filter((pool) => pool.end && pool.end < pastPoolThreshold)
    .filter((pool) => matchesSubjectFilter("pools", pool.subject))
    .sort((a, b) => a.start.localeCompare(b.start));
  const pools = [...currentPools, ...recentlyExpiredPools];
  elements.poolsEmpty.hidden = pools.length > 0;
  elements.pools.innerHTML = pools.map((pool) => renderPoolCard(pool)).join("");
  elements.pastPoolsSection.hidden = pastPools.length === 0;
  elements.pastPools.innerHTML = pastPools.map((pool) => renderPoolCard(pool)).join("");
}

function renderPoolCard(pool) {
  const remaining = Math.max(0, pool.target - pool.completed);
  const percent = pool.target ? Math.min(100, Math.round(pool.completed / pool.target * 100)) : 0;
  const active = pool.status === "active";
  const returnDestination = getPoolReturnDestination(pool);
  const poolTasks = state.tasks.filter((task) => task.poolId === pool.id);
  const hasProgress = Number(pool.completed || 0) > 0 || poolTasks.some(hasTaskProgress);
  const returnButton = active && returnDestination
    ? `<button class="text-button icon-action" type="button" data-return-pool="${escapeHtml(pool.id)}" aria-label="${returnDestination}へ戻す" title="${hasProgress ? "実績や勉強記録がある週間プールは戻せません" : `${returnDestination}へ戻す`}"${hasProgress ? " disabled" : ""}>↩️</button>`
    : "";
  const hasTodayTask = state.tasks.some((task) => task.date === today
    && (task.poolId === pool.id || (pool.sourceQuizId && task.quizId === pool.sourceQuizId)));
  const buttons = active
    ? `${hasTodayTask ? "" : `<button class="text-button" type="button" data-add-task="${escapeHtml(pool.id)}">＋ 今日のToDoへ</button>`}
       <button class="text-button" type="button" data-carry-pool="${escapeHtml(pool.id)}"${remaining === 0 ? " disabled" : ""}>残りを繰り越す</button>`
    : `<span class="badge">終了</span>`;
  const poolDescription = `${escapeHtml(pool.goalTitle || "長期計画")}から`;
  const deadline = pool.deadline ? ` ・ 提出 ${formatDate(pool.deadline)}` : "";
  return `<article class="pool-card">
      <div class="card-top"><div><button class="card-title detail-title" type="button" data-pool-details="${escapeHtml(pool.id)}" aria-label="${escapeHtml(pool.title)}の詳細を表示">${escapeHtml(pool.title)}</button><p class="card-subtitle">${escapeHtml(pool.subject || "科目未設定")} ・ ${poolDescription}${deadline}</p></div>
        <span class="badge${remaining === 0 ? " complete" : ""}">${remaining === 0 ? "達成" : `残り ${remaining} ${escapeHtml(pool.unit)}`}</span>
      </div>
      <div class="progress-track" role="progressbar" aria-label="${escapeHtml(pool.title)}の進捗" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${percent}%"></div></div>
      <div class="progress-meta"><span>${pool.completed} / ${pool.target} ${escapeHtml(pool.unit)} 完了</span><span>${percent}%</span></div>
      <div class="card-footer"><span class="date-range">${formatDate(pool.start)} — ${formatDate(pool.end)}</span><div class="pool-actions">${returnButton}<button class="text-button icon-action" type="button" data-edit-pool="${escapeHtml(pool.id)}" aria-label="週間プールを編集" title="編集">✏️</button>${buttons}</div></div>
    </article>`;
}

function renderPoolOptions() {
  const select = elements.poolDialog.querySelector('[name="goalId"]');
  const goals = state.goals;
  select.innerHTML = `<option value="" disabled selected>${goals.length ? "長期目標を選択してください" : "先に長期計画を追加してください"}</option>${goals
    .map((goal) => {
      const event = state.events.find((item) => item.id === goal.eventId);
      return `<option value="${escapeHtml(goal.id)}">${escapeHtml(event?.title || "イベント未設定")} — ${escapeHtml(goal.subject || "科目未設定")} / ${escapeHtml(goal.title)}</option>`;
    }).join("")}`;
  elements.poolDialog.querySelector('[type="submit"]').disabled = goals.length === 0;
}

function showError(form, message) {
  const element = form.querySelector(".form-error");
  element.textContent = message;
  element.classList.toggle("visible", Boolean(message));
}

function saveStateAndClose(dialog, form) {
  if (!saveState({ deferRender: true })) {
    showError(form, "ログイン状態を確認できません。再読み込みしてから、もう一度お試しください。");
    return false;
  }
  if (dialog === elements.settingsDialog) {
    openSettingsHome();
  } else {
    dialog.close();
  }
  render();
  return true;
}

function deleteEvent(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;
  const goalIds = new Set(state.goals.filter((goal) => goal.eventId === eventId).map((goal) => goal.id));
  const poolIds = new Set(state.pools.filter((pool) => pool.eventId === eventId || goalIds.has(pool.goalId)).map((pool) => pool.id));
  if (!window.confirm(`「${event.title}」と、その長期計画・週間プール・関連する今日のToDoを削除し、提出物との関連付けを解除します。この操作は取り消せません。`)) return;
  state.events = state.events.filter((item) => item.id !== eventId);
  state.goals = state.goals.filter((goal) => !goalIds.has(goal.id));
  state.quizzes.forEach((quiz) => {
    if (quiz.eventId === eventId) quiz.eventId = "";
  });
  state.pools = state.pools.filter((pool) => !poolIds.has(pool.id));
  state.tasks = state.tasks.filter((task) => !poolIds.has(task.poolId) && !goalIds.has(task.sourceGoalId));
  saveState();
}

function deleteGoal(goalId) {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal) return;
  const poolIds = new Set(state.pools.filter((pool) => pool.goalId === goalId).map((pool) => pool.id));
  if (!window.confirm(`「${goal.title}」と、その週間プール・関連する今日のToDoを削除します。この操作は取り消せません。`)) return;
  state.goals = state.goals.filter((item) => item.id !== goalId);
  state.pools = state.pools.filter((pool) => !poolIds.has(pool.id));
  state.tasks = state.tasks.filter((task) => task.sourceGoalId !== goalId && !poolIds.has(task.poolId));
  saveState();
}

function deleteStudyRecord(taskId, date) {
  const selectedTask = state.tasks.find((task) => task.id === taskId);
  if (!selectedTask) return;
  const groupKey = getStudyTaskGroupKey(selectedTask);
  const tasks = state.tasks.filter((task) => getStudyTaskGroupKey(task) === groupKey
    && (getTaskStudyRecordOnDate(task, date).seconds > 0 || getTaskStudyRecordOnDate(task, date).amount > 0));
  if (!tasks.length) return;
  if (tasks.some((task) => task.date === date && state.studyTimer?.taskId === task.id && state.studyTimer.startedAt)) {
    window.alert("計測中の記録は削除できません。先に計測を終了してください。");
    return;
  }
  const title = state.pools.find((pool) => pool.id === selectedTask.poolId)?.title || selectedTask.title;
  if (!window.confirm(`「${title}」の${formatDate(date, { year: "numeric", month: "long", day: "numeric" })}の勉強記録を削除します。この日の勉強時間と実施量が削除され、週間プール・長期目標の進捗も戻ります。この操作は取り消せません。`)) return;

  const affectedPoolIds = new Set();
  tasks.forEach((task) => {
    const logs = task.studyLogs || [];
    const loggedAmount = logs
      .filter((log) => log.date === date)
      .reduce((total, log) => total + log.amount, 0);
    const legacyAmount = task.date === date
      ? Math.max(0, Number(task.actual || 0) - logs.reduce((total, log) => total + log.amount, 0))
      : 0;
    const amountToRemove = loggedAmount + legacyAmount;
    task.studyLogs = logs.filter((log) => log.date !== date);
    if (task.date === date) task.studySeconds = 0;
    if (amountToRemove > 0) {
      task.actual = Math.max(0, Number(task.actual || 0) - amountToRemove);
      if (task.actual < task.minimum) task.completed = false;
      const pool = getTaskPool(task);
      if (pool) affectedPoolIds.add(pool.id);
    }
    if (state.studyTimer?.taskId === task.id && !state.studyTimer.startedAt) {
      state.studyTimer.elapsedSeconds = 0;
      state.studyTimer.hasStarted = false;
    }
  });
  affectedPoolIds.forEach(syncTaskProgress);
  saveState();
}

function deleteQuiz(quizId) {
  const quiz = state.quizzes.find((item) => item.id === quizId);
  if (!quiz) return;
  if (!window.confirm(`「${quiz.title || "小テスト・提出物"}」と、そこから作成した週間プール・今日のToDoを削除します。この操作は取り消せません。`)) return;
  const poolIds = new Set(state.pools.filter((pool) => pool.sourceQuizId === quizId).map((pool) => pool.id));
  state.quizzes = state.quizzes.filter((item) => item.id !== quizId);
  state.pools = state.pools.filter((pool) => !poolIds.has(pool.id));
  state.tasks = state.tasks.filter((task) => task.quizId !== quizId && !poolIds.has(task.poolId));
  saveState();
}

document.addEventListener("change", (event) => {
  const allFilter = event.target.closest("[data-subject-filter-all]");
  if (allFilter) {
    if (allFilter.checked) {
      subjectFilters.get(allFilter.dataset.subjectFilterAll)?.clear();
      render();
    }
    return;
  }
  const subjectFilter = event.target.closest("[data-subject-filter-section]");
  if (subjectFilter) {
    const section = subjectFilters.get(subjectFilter.dataset.subjectFilterSection);
    if (!section) return;
    if (subjectFilter.checked) section.add(subjectFilter.value);
    else section.delete(subjectFilter.value);
    render();
  }
});

function openDialog(dialog) {
  const form = dialog.querySelector("form");
  if (form) {
    form.reset();
    delete form.dataset.editId;
    const heading = form.querySelector(".modal-heading h2");
    const submit = form.querySelector('[type="submit"]');
    if (heading) {
      heading.dataset.defaultText ||= heading.textContent;
      heading.textContent = heading.dataset.defaultText;
    }
    if (submit) {
      submit.dataset.defaultText ||= submit.textContent;
      submit.textContent = submit.dataset.defaultText;
    }
    if (dialog === elements.goalDialog) delete form.dataset.deadlineAutoFilled;
  }
  if (form) showError(form, "");
  if (dialog === elements.completeDialog) {
    pendingTaskRecord = null;
    document.querySelector("#task-record-inputs").hidden = false;
    document.querySelector("#task-record-actions").hidden = false;
    document.querySelector("#task-outcome").hidden = true;
    document.querySelector("#task-record-minutes-field").hidden = false;
  }
  if (dialog === elements.studyLogDialog) {
    const taskSelect = form.elements.taskId;
    const studyTasks = state.tasks
      .filter((task) => task.status !== "closed")
      .sort((a, b) => compareTasksByDeadlineAndSubject(a, b) || a.title.localeCompare(b.title));
    taskSelect.innerHTML = `<option value="" selected disabled>${studyTasks.length ? "タスクを選択してください" : "記録できるタスクがありません"}</option>${studyTasks
      .map((task) => {
        const pool = state.pools.find((item) => item.id === task.poolId);
        const title = pool?.title || task.title;
        const subject = pool?.subject || task.subject || "科目未設定";
        const date = formatDate(task.date, { month: "numeric", day: "numeric" });
        const status = task.completed ? "完了" : "未完了";
        return `<option value="${escapeHtml(task.id)}">${escapeHtml(`${date} ・ ${subject} ・ ${title} ・ ${status}`)}</option>`;
      }).join("")}`;
    form.elements.minutes.value = "0";
    form.elements.amount.value = "0";
    document.querySelector("#study-log-date").textContent = `${formatDate(selectedCalendarDate, { year: "numeric", month: "long", day: "numeric" })}の記録`;
    document.querySelector("#study-log-unit").textContent = "タスクの単位に合わせて入力してください。";
    form.querySelector('[type="submit"]').disabled = studyTasks.length === 0;
  }
  if (dialog === elements.poolDialog) {
    form.elements.goalId.disabled = false;
    form.elements.goalId.required = true;
    const start = getWeekStart(today);
    form.elements.start.value = start;
    form.elements.end.value = shiftDate(start, 6);
  }
  if (dialog === elements.eventDialog) {
    form.elements.start.value = today;
    form.elements.end.value = today;
  }
  if (dialog === elements.quizDialog) {
    form.elements.date.value = today;
    setScheduleType(form, "quiz");
    form.elements.period.value = "";
    document.querySelector("#quiz-dialog-title").textContent = "予定を追加";
  }
  if (dialog === elements.settingsDialog) {
    renderSettingsForm();
    return;
  }
  dialog.showModal();
}

function openEditDialog(dialog, record, heading, submitLabel) {
  openDialog(dialog);
  const form = dialog.querySelector("form");
  form.dataset.editId = record.id;
  form.querySelector(".modal-heading h2").textContent = heading;
  form.querySelector('[type="submit"]').textContent = submitLabel;
  return form;
}

function setScheduleType(form, kind, selectedPeriod = form.elements.period.value) {
  form.elements.kind.value = kind;
  const isQuiz = kind === "quiz";
  const period = form.elements.period;
  renderPeriodOptions(selectedPeriod);
  period.required = isQuiz;
  period.disabled = !isQuiz;
  document.querySelector("#period-field").hidden = !isQuiz;
  document.querySelector("#schedule-event-field").hidden = isQuiz;
  if (isQuiz) form.elements.eventId.value = "";
  form.querySelectorAll("[data-schedule-type]").forEach((button) => {
    const selected = button.dataset.scheduleType === kind;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

document.addEventListener("click", (event) => {
  const carryAddButton = event.target.closest("[data-carry-add]");
  if (carryAddButton) {
    const row = carryAddButton.closest(".carry-overdue-row");
    const input = row?.querySelector("[data-carry-task]");
    if (input) input.value = Math.max(1, Number(input.value || 0) + Number(carryAddButton.dataset.carryAdd));
    return;
  }
  if (event.target.closest(".brand")) {
    event.preventDefault();
    elements.calendarView.hidden = true;
    elements.recordingView.hidden = true;
    elements.settingsView.hidden = true;
    document.body.classList.remove("recording-fullscreen");
    elements.dashboard.hidden = !elements.authScreen.hidden;
    miniCalendarSelectedDate = "";
    renderMiniCalendar();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (event.target.closest(".menu-button")) {
    elements.menuDialog.showModal();
    return;
  }
  if (event.target.closest("[data-menu-record]")) {
    openRecordingView();
    return;
  }
  if (event.target.closest("[data-menu-settings]")) {
    openSettingsView();
    return;
  }
  if (event.target.closest("[data-settings-home]")) {
    openSettingsHome();
    return;
  }
  if (event.target.closest("[data-record-home]")) {
    selectingRecordingTask = false;
    elements.recordingView.hidden = true;
    elements.settingsView.hidden = true;
    document.body.classList.remove("recording-fullscreen");
    elements.dashboard.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (event.target.closest("[data-record-start]")) {
    if (getRecordingTask() && state.studyTimer && !state.studyTimer.startedAt) {
      state.studyTimer.startedAt = Date.now();
      state.studyTimer.hasStarted = true;
      saveState();
    }
    return;
  }
  if (event.target.closest("[data-record-pause]")) {
    addRunningTimeToTask(state.studyTimer);
    saveState();
    return;
  }
  if (event.target.closest("[data-record-change]")) {
    addRunningTimeToTask(state.studyTimer);
    saveState();
    selectingRecordingTask = true;
    renderRecording();
    return;
  }
  if (event.target.closest("[data-record-end]")) {
    const task = getRecordingTask();
    const timer = state.studyTimer;
    if (!task || !timer?.hasStarted) return;
    addRunningTimeToTask(timer);
    const elapsedSeconds = timer.elapsedSeconds;
    state.studyTimer = null;
    recordingEndTaskId = task.id;
    selectingRecordingTask = false;
    elements.recordingView.hidden = true;
    document.body.classList.remove("recording-fullscreen");
    elements.dashboard.hidden = false;
    saveState();
    const form = elements.completeDialog.querySelector("form");
    openDialog(elements.completeDialog);
    form.elements.taskId.value = task.id;
    form.elements.actual.value = task.completed ? 0 : Math.max(0, task.minimum - (task.actual || 0));
    form.elements.memo.value = task.memo || "";
    form.elements.minutes.value = "0";
    document.querySelector("#task-record-minutes-field").hidden = true;
    const pool = state.pools.find((item) => item.id === task.poolId);
    const title = pool?.title || task.title;
    document.querySelector("#complete-task-title").textContent = `${title} — 計測 ${formatDuration(elapsedSeconds)} ・ 最低 ${task.minimum} ${pool?.unit || task.unit}`;
    elements.completeDialog.querySelector(".modal-heading h2").textContent = "勉強記録を終了";
    return;
  }
  const recordingDetailsButton = event.target.closest("[data-recording-task-details]");
  if (recordingDetailsButton) {
    const task = state.tasks.find((item) => item.id === recordingDetailsButton.dataset.recordingTaskDetails);
    if (task) openTaskDetails(task);
    return;
  }
  const recordingTaskButton = event.target.closest("[data-record-task]");
  if (recordingTaskButton) {
    const task = state.tasks.find((item) => item.id === recordingTaskButton.dataset.recordTask && item.date === today);
    if (!task) return;
    if (state.studyTimer?.taskId !== task.id) {
      addRunningTimeToTask(state.studyTimer);
      state.studyTimer = { taskId: task.id, elapsedSeconds: 0, startedAt: null, hasStarted: false };
    }
    selectingRecordingTask = false;
    saveState();
    return;
  }
  if (event.target.closest("[data-menu-calendar]")) {
    closeMenuDialog();
    calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    selectedCalendarDate = today;
    renderCalendar();
    elements.dashboard.hidden = true;
    elements.recordingView.hidden = true;
    elements.settingsView.hidden = true;
    document.body.classList.remove("recording-fullscreen");
    elements.calendarView.hidden = false;
    window.scrollTo({ top: 0 });
    return;
  }
  if (event.target.closest("[data-menu-home]")) {
    closeMenuDialog();
    elements.calendarView.hidden = true;
    elements.recordingView.hidden = true;
    elements.settingsView.hidden = true;
    document.body.classList.remove("recording-fullscreen");
    elements.dashboard.hidden = false;
    miniCalendarSelectedDate = "";
    renderMiniCalendar();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (event.target.closest("[data-calendar-home]")) {
    elements.calendarView.hidden = true;
    elements.recordingView.hidden = true;
    elements.settingsView.hidden = true;
    document.body.classList.remove("recording-fullscreen");
    elements.dashboard.hidden = false;
    miniCalendarSelectedDate = "";
    renderMiniCalendar();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (event.target.closest("[data-open-mini-calendar]")) {
    selectedCalendarDate = miniCalendarSelectedDate
      || dateKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1));
    renderCalendar();
    elements.dashboard.hidden = true;
    elements.recordingView.hidden = true;
    elements.settingsView.hidden = true;
    document.body.classList.remove("recording-fullscreen");
    elements.calendarView.hidden = false;
    window.scrollTo({ top: 0 });
    return;
  }
  const miniCalendarShift = event.target.closest("[data-mini-calendar-shift]");
  if (miniCalendarShift) {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + Number(miniCalendarShift.dataset.miniCalendarShift), 1);
    miniCalendarSelectedDate = "";
    renderMiniCalendar();
    return;
  }
  if (event.target.closest("[data-mini-calendar-close]")) {
    miniCalendarSelectedDate = "";
    renderMiniCalendar();
    return;
  }
  const miniCalendarDay = event.target.closest("[data-mini-calendar-date]");
  if (miniCalendarDay) {
    miniCalendarSelectedDate = miniCalendarDay.dataset.miniCalendarDate;
    renderMiniCalendar();
    return;
  }
  const calendarShift = event.target.closest("[data-calendar-shift]");
  if (calendarShift) {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + Number(calendarShift.dataset.calendarShift), 1);
    selectedCalendarDate = dateKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1));
    renderCalendar();
    return;
  }
  if (event.target.closest("[data-calendar-today]")) {
    calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    selectedCalendarDate = today;
    renderCalendar();
    return;
  }
  const calendarDay = event.target.closest("[data-calendar-date]");
  if (calendarDay) {
    selectedCalendarDate = calendarDay.dataset.calendarDate;
    renderCalendar();
    return;
  }
  if (event.target.closest("[data-add-study-log]")) {
    openDialog(elements.studyLogDialog);
    return;
  }
  const deleteStudyRecordButton = event.target.closest("[data-delete-study-record]");
  if (deleteStudyRecordButton) {
    deleteStudyRecord(deleteStudyRecordButton.dataset.deleteStudyRecord, selectedCalendarDate);
    return;
  }
  const addSettingSubject = event.target.closest("[data-add-setting-subject]");
  if (addSettingSubject) {
    const rows = elements.settingsSubjects.querySelectorAll(".settings-subject-row");
    if (rows.length >= MAX_SUBJECTS) return;
    elements.settingsSubjects.insertAdjacentHTML("beforeend", settingsSubjectRow());
    elements.settingsDialog.querySelector("[data-add-setting-subject]").disabled = rows.length + 1 >= MAX_SUBJECTS;
    updateSettingsSubjectMoveButtons();
    elements.settingsSubjects.querySelector(".settings-subject-row:last-child input").focus();
    return;
  }
  const moveSettingSubject = event.target.closest("[data-move-setting-subject]");
  if (moveSettingSubject) {
    const rows = [...elements.settingsSubjects.querySelectorAll(".settings-subject-row")];
    const row = moveSettingSubject.closest(".settings-subject-row");
    const index = rows.indexOf(row);
    const targetIndex = index + Number(moveSettingSubject.dataset.moveSettingSubject);
    if (targetIndex < 0 || targetIndex >= rows.length) return;
    if (targetIndex < index) elements.settingsSubjects.insertBefore(row, rows[targetIndex]);
    else elements.settingsSubjects.insertBefore(rows[targetIndex], row);
    updateSettingsSubjectMoveButtons();
    return;
  }
  const removeSettingSubject = event.target.closest("[data-remove-setting-subject]");
  if (removeSettingSubject) {
    removeSettingSubject.closest(".settings-subject-row").remove();
    elements.settingsDialog.querySelector("[data-add-setting-subject]").disabled = false;
    updateSettingsSubjectMoveButtons();
    return;
  }
  const openButton = event.target.closest("[data-open-dialog]");
  if (openButton) {
    const dialog = document.getElementById(openButton.dataset.openDialog);
    if (dialog === elements.settingsDialog && elements.menuDialog.open) elements.menuDialog.close();
    openDialog(dialog);
    return;
  }
  if (event.target.closest("[data-close-dialog]")) {
    event.target.closest("dialog").close();
    return;
  }
  const editEventButton = event.target.closest("[data-edit-event]");
  const toggleEventVisibilityButton = event.target.closest("[data-toggle-event-always-show]");
  if (toggleEventVisibilityButton) {
    const item = state.events.find((eventItem) => eventItem.id === toggleEventVisibilityButton.dataset.toggleEventAlwaysShow);
    if (!item) return;
    item.alwaysShow = !item.alwaysShow;
    if (!item.alwaysShow) item.pinnedAt = 0;
    saveState();
    return;
  }
  const toggleEventTopPinButton = event.target.closest("[data-toggle-event-top-pin]");
  if (toggleEventTopPinButton) {
    const item = state.events.find((eventItem) => eventItem.id === toggleEventTopPinButton.dataset.toggleEventTopPin);
    if (!item) return;
    if (item.pinnedAt) {
      item.pinnedAt = 0;
    } else {
      const latestPinnedAt = Math.max(0, ...state.events.map((eventItem) => eventItem.pinnedAt || 0));
      item.pinnedAt = Math.max(Date.now(), latestPinnedAt + 1);
    }
    saveState();
    return;
  }
  if (editEventButton) {
    const item = state.events.find((eventItem) => eventItem.id === editEventButton.dataset.editEvent);
    if (!item) return;
    const form = openEditDialog(elements.eventDialog, item, "イベントを編集", "変更を保存");
    form.elements.title.value = item.title;
    form.elements.type.value = item.type;
    form.elements.start.value = item.start;
    form.elements.end.value = item.end;
    form.elements.memo.value = item.memo || "";
    return;
  }
  const eventDetailsButton = event.target.closest("[data-event-details]");
  if (eventDetailsButton) {
    const item = state.events.find((eventItem) => eventItem.id === eventDetailsButton.dataset.eventDetails);
    if (item) openEventDetails(item);
    return;
  }
  const editGoalButton = event.target.closest("[data-edit-goal]");
  if (editGoalButton) {
    const item = state.goals.find((goal) => goal.id === editGoalButton.dataset.editGoal);
    if (!item) return;
    const form = openEditDialog(elements.goalDialog, item, "長期目標を編集", "変更を保存");
    form.elements.eventId.value = item.eventId;
    form.elements.subject.value = item.subject;
    form.elements.title.value = item.title;
    form.elements.scope.value = item.scope || "";
    form.elements.unit.value = item.unit;
    form.elements.total.value = item.total;
    form.elements.laps.value = item.laps;
    form.elements.deadline.value = item.deadline || "";
    form.elements.submissionDate.value = item.submissionDate || "";
    form.elements.memo.value = item.memo || "";
    const parentEvent = state.events.find((eventItem) => eventItem.id === item.eventId);
    document.querySelector("#goal-event-title").textContent = `${parentEvent?.title || "イベント未設定"} の長期計画`;
    return;
  }
  const goalDetailsButton = event.target.closest("[data-goal-details]");
  if (goalDetailsButton) {
    const item = state.goals.find((goal) => goal.id === goalDetailsButton.dataset.goalDetails);
    if (item) openGoalDetails(item);
    return;
  }
  const quizDetailsButton = event.target.closest("[data-quiz-details]");
  if (quizDetailsButton) {
    if (quizDetailsButton.dataset.quizSource === "goal") {
      const goal = state.goals.find((item) => item.id === quizDetailsButton.dataset.quizDetails);
      if (goal) openGoalDetails(goal);
    } else {
      const quiz = state.quizzes.find((item) => item.id === quizDetailsButton.dataset.quizDetails);
      if (quiz) openQuizDetails(quiz);
    }
    return;
  }
  const addPoolButton = event.target.closest("[data-add-pool]");
  if (addPoolButton) {
    const goal = state.goals.find((item) => item.id === addPoolButton.dataset.addPool);
    if (!goal) return;
    openDialog(elements.poolDialog);
    elements.poolDialog.querySelector('[name="goalId"]').value = goal.id;
    return;
  }
  const editQuizButton = event.target.closest("[data-edit-quiz]");
  if (editQuizButton) {
    const item = state.quizzes.find((quiz) => quiz.id === editQuizButton.dataset.editQuiz);
    if (!item) return;
    const form = openEditDialog(elements.quizDialog, item, "予定を編集", "変更を保存");
    setScheduleType(form, item.kind === "submission" ? "submission" : "quiz", item.period ? String(item.period) : "");
    form.elements.title.value = item.title || "";
    form.elements.subject.value = item.subject;
    form.elements.date.value = item.date;
    form.elements.scope.value = item.scope || "";
    form.elements.unit.value = item.unit || "";
    form.elements.period.value = item.period ? String(item.period) : "";
    form.elements.eventId.value = item.eventId || "";
    return;
  }
  const editPoolButton = event.target.closest("[data-edit-pool]");
  if (editPoolButton) {
    const item = state.pools.find((pool) => pool.id === editPoolButton.dataset.editPool);
    if (!item) return;
    const form = openEditDialog(elements.poolDialog, item, "週間プールを編集", "変更を保存");
    form.querySelector('[type="submit"]').disabled = false;
    form.elements.goalId.value = item.goalId || "";
    form.elements.goalId.disabled = true;
    form.elements.goalId.required = false;
    form.elements.target.value = item.target;
    form.elements.start.value = item.start;
    form.elements.end.value = item.end;
    form.elements.memo.value = item.memo || "";
    return;
  }
  const taskDetailsButton = event.target.closest("[data-task-details]");
  if (taskDetailsButton) {
    const task = state.tasks.find((item) => item.id === taskDetailsButton.dataset.taskDetails);
    if (task) openTaskDetails(task);
    return;
  }
  const poolDetailsButton = event.target.closest("[data-pool-details]");
  if (poolDetailsButton) {
    const pool = state.pools.find((item) => item.id === poolDetailsButton.dataset.poolDetails);
    if (pool) openPoolDetails(pool);
    return;
  }
  const editTaskButton = event.target.closest("[data-edit-task]");
  if (editTaskButton) {
    const item = state.tasks.find((task) => task.id === editTaskButton.dataset.editTask);
    if (!item || item.status === "closed") return;
    const form = openEditDialog(elements.taskDialog, item, "今日の最低ラインを編集", "変更を保存");
    form.elements.poolId.value = item.poolId || "";
    form.elements.minimum.value = item.minimum;
    form.elements.memo.value = item.memo || "";
    const pool = state.pools.find((poolItem) => poolItem.id === item.poolId);
    document.querySelector("#task-pool-title").textContent = pool ? `${pool.title}（${pool.unit}）` : item.title;
    return;
  }
  const deleteEventButton = event.target.closest("[data-delete-event]");
  if (deleteEventButton) {
    deleteEvent(deleteEventButton.dataset.deleteEvent);
    return;
  }
  const deleteGoalButton = event.target.closest("[data-delete-goal]");
  if (deleteGoalButton) {
    deleteGoal(deleteGoalButton.dataset.deleteGoal);
    return;
  }
  const deleteQuizButton = event.target.closest("[data-delete-quiz]");
  if (deleteQuizButton) {
    deleteQuiz(deleteQuizButton.dataset.deleteQuiz);
    return;
  }
  const scheduleTypeButton = event.target.closest("[data-schedule-type]");
  if (scheduleTypeButton) {
    setScheduleType(scheduleTypeButton.closest("form"), scheduleTypeButton.dataset.scheduleType);
    return;
  }
  const addQuizTaskButton = event.target.closest("[data-add-quiz-task]");
  if (addQuizTaskButton) {
    const quiz = state.quizzes.find((item) => item.id === addQuizTaskButton.dataset.addQuizTask);
    if (!quiz || hasScheduleTaskToday(quiz)) return;
    const pool = findSchedulePool(quiz);
    state.tasks.push({
      id: createId(),
      quizId: quiz.id,
      ...(pool?.status === "active" ? { poolId: pool.id } : {}),
      title: quiz.title || (quiz.kind === "submission" ? "提出物" : "小テスト"),
      subject: quiz.subject,
      scope: quiz.scope || pool?.scope || "",
      scopeUnit: quiz.unit || pool?.scopeUnit || "",
      unit: pool?.unit || (quiz.kind === "submission" ? (quiz.unit || "件") : "回"),
      memo: "",
      minimum: 1,
      actual: 0,
      date: today,
      completed: false,
    });
    saveState();
    return;
  }
  const addSchedulePoolButton = event.target.closest("[data-add-schedule-pool]");
  if (addSchedulePoolButton) {
    const sourceId = addSchedulePoolButton.dataset.addSchedulePool;
    const schedule = getScheduledQuizzes().find((item) => addSchedulePoolButton.dataset.scheduleSource === "goal"
      ? item.sourceGoalId === sourceId
      : item.id === sourceId);
    if (!schedule) return;
    if (isScheduleComplete(schedule)) return;
    if (createSchedulePool(schedule)) saveState();
    return;
  }
  const duplicateQuizButton = event.target.closest("[data-duplicate-quiz]");
  if (duplicateQuizButton) {
    const quiz = state.quizzes.find((item) => item.id === duplicateQuizButton.dataset.duplicateQuiz);
    if (!quiz) return;
    openDialog(elements.quizDialog);
    const form = elements.quizDialog.querySelector("form");
    setScheduleType(form, quiz.kind === "submission" ? "submission" : "quiz");
    form.elements.title.value = quiz.title || "";
    form.elements.subject.value = quiz.subject;
    form.elements.date.value = quiz.date;
    form.elements.scope.value = quiz.scope || "";
    form.elements.unit.value = quiz.unit || "";
    form.elements.period.value = quiz.period ? String(quiz.period) : "";
    form.elements.eventId.value = quiz.eventId || "";
    document.querySelector("#quiz-dialog-title").textContent = "予定を複製";
    return;
  }
  const addGoalButton = event.target.closest("[data-add-goal]");
  if (addGoalButton) {
    const goalForm = document.querySelector("#goal-form");
    const parentEvent = state.events.find((item) => item.id === addGoalButton.dataset.addGoal);
    if (!parentEvent) return;
    openDialog(elements.goalDialog);
    goalForm.elements.eventId.value = parentEvent.id;
    document.querySelector("#goal-event-title").textContent = `${parentEvent.title} の長期計画`;
    return;
  }
  const taskButton = event.target.closest("[data-add-task]");
  if (taskButton) {
    const pool = state.pools.find((item) => item.id === taskButton.dataset.addTask);
    if (!pool || pool.status !== "active") return;
    const form = document.querySelector("#task-form");
    form.elements.poolId.value = pool.id;
    document.querySelector("#task-pool-title").textContent = `${pool.title}（${pool.unit}）`;
    openDialog(elements.taskDialog);
    form.elements.poolId.value = pool.id;
    form.elements.memo.value = pool.memo || "";
    return;
  }
  const carryOverdueTaskButton = event.target.closest("[data-carry-overdue-task]");
  if (carryOverdueTaskButton) {
    openCarryOverdueDialog([carryOverdueTaskButton.dataset.carryOverdueTask]);
    return;
  }
  const carryWeeklyTaskButton = event.target.closest("[data-carry-weekly-task]");
  if (carryWeeklyTaskButton) {
    const task = state.tasks.find((item) => item.id === carryWeeklyTaskButton.dataset.carryWeeklyTask);
    if (!task || task.completed || task.date >= today || !isExpiredPoolTask(task)) return;
    openCarryOverdueDialog([task.id], { includeClosed: true });
    return;
  }
  const declineWeeklyTaskButton = event.target.closest("[data-decline-weekly-task]");
  if (declineWeeklyTaskButton) {
    const task = state.tasks.find((item) => item.id === declineWeeklyTaskButton.dataset.declineWeeklyTask);
    if (!task || task.completed || task.date >= today || !isExpiredPoolTask(task)) return;
    task.status = "closed";
    saveState();
    return;
  }
  const completeButton = event.target.closest("[data-complete-task]");
  if (completeButton) {
    const task = state.tasks.find((item) => item.id === completeButton.dataset.completeTask);
    if (!task || task.completed || task.status === "closed") return;
    const pool = state.pools.find((item) => item.id === task.poolId);
    const form = document.querySelector("#complete-form");
    openDialog(elements.completeDialog);
    form.elements.taskId.value = task.id;
    form.elements.actual.value = Math.max(0, task.minimum - (task.actual || 0));
    form.elements.memo.value = task.memo || "";
    form.elements.minutes.value = "0";
    document.querySelector("#task-record-minutes-field").hidden = false;
    document.querySelector("#complete-task-title").textContent = `${task.title} — 最低 ${task.minimum} ${pool?.unit || task.unit}`;
    elements.completeDialog.querySelector(".modal-heading h2").textContent = "実績を記録";
    return;
  }
  const markTaskCompleteButton = event.target.closest("[data-mark-task-complete]");
  if (markTaskCompleteButton) {
    const task = state.tasks.find((item) => item.id === markTaskCompleteButton.dataset.markTaskComplete);
    const minimum = Number(task?.minimum);
    if (!task || task.completed || task.status === "closed" || !Number.isSafeInteger(minimum) || minimum < 1
      || Number(task.actual || 0) < minimum) return;
    task.completed = true;
    saveState();
    return;
  }
  const outcomeButton = event.target.closest("[data-task-outcome]");
  if (outcomeButton) {
    if (!pendingTaskRecord) return;
    commitTaskRecord(pendingTaskRecord.taskId, pendingTaskRecord.amount, outcomeButton.dataset.taskOutcome === "complete");
    if (pendingTaskRecord.minutes > 0) {
      const task = state.tasks.find((item) => item.id === pendingTaskRecord.taskId);
      if (task) addTaskStudyMinutes(task, pendingTaskRecord.minutes);
    }
    pendingTaskRecord = null;
    recordingEndTaskId = null;
    const form = elements.completeDialog.querySelector("form");
    saveStateAndClose(elements.completeDialog, form);
    return;
  }
  const carryButton = event.target.closest("[data-carry-pool]");
  if (carryButton) {
    carryPool(carryButton.dataset.carryPool);
    return;
  }
  const returnTaskButton = event.target.closest("[data-return-task]");
  if (returnTaskButton) {
    returnTaskToPool(returnTaskButton.dataset.returnTask);
    return;
  }
  const returnPoolButton = event.target.closest("[data-return-pool]");
  if (returnPoolButton) returnPoolToSource(returnPoolButton.dataset.returnPool);
});

document.querySelectorAll(".quick-amounts").forEach((group) => {
  group.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add]");
    if (!button) return;
    const input = group.closest("form").elements[group.dataset.target];
    input.value = Math.max(0, Number(input.value || 0) + Number(button.dataset.add));
    input.focus();
  });
});

document.querySelector("#study-log-form").elements.taskId.addEventListener("change", (event) => {
  const task = state.tasks.find((item) => item.id === event.currentTarget.value);
  const pool = task && state.pools.find((item) => item.id === task.poolId);
  const unit = pool?.unit || task?.unit;
  document.querySelector("#study-log-unit").textContent = unit
    ? `実施量の単位: ${unit}`
    : "タスクの単位に合わせて入力してください。";
});

document.querySelector("#settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const rows = [...elements.settingsSubjects.querySelectorAll(".settings-subject-row")];
  const subjects = rows.map((row) => row.querySelector('[name="subject"]').value.trim());
  const periodCount = Number(form.elements.periodCount.value);
  const uniqueSubjects = new Set(subjects.map((subject) => subject.toLocaleLowerCase()));
  if (!Number.isSafeInteger(periodCount) || periodCount < 1 || periodCount > MAX_PERIOD_COUNT
    || subjects.length < 1 || subjects.length > MAX_SUBJECTS
    || subjects.some((subject) => !subject || subject.length > MAX_SUBJECT_LENGTH)
    || uniqueSubjects.size !== subjects.length) {
    showError(form, `科目は重複のない1〜${MAX_SUBJECTS}件、校時数は1〜${MAX_PERIOD_COUNT}で入力してください。`);
    return;
  }

  const keptSubjects = new Set(rows.map((row) => row.dataset.originalSubject).filter(Boolean));
  const removedSubjects = state.settings.subjects.filter((subject) => !keptSubjects.has(subject));
  const subjectRecords = [...state.goals, ...state.quizzes, ...state.pools, ...state.tasks];
  const usedSubjects = new Set(subjectRecords.map((record) => record.subject).filter(Boolean));
  const inUse = removedSubjects.find((subject) => usedSubjects.has(subject));
  if (inUse) {
    showError(form, `「${inUse}」は計画や予定で使用中のため削除できません。先に名称を変更してください。`);
    return;
  }

  const renamedSubjects = new Map(rows
    .filter((row) => row.dataset.originalSubject)
    .map((row) => [row.dataset.originalSubject, row.querySelector('[name="subject"]').value.trim()]));
  const previousSettings = state.settings;
  const previousRecordSubjects = subjectRecords.map((record) => record.subject);
  state.settings = { subjects, periodCount };
  subjectRecords.forEach((record) => {
    if (renamedSubjects.has(record.subject)) record.subject = renamedSubjects.get(record.subject);
  });
  if (!saveStateAndClose(elements.settingsDialog, form)) {
    state.settings = previousSettings;
    subjectRecords.forEach((record, index) => { record.subject = previousRecordSubjects[index]; });
  }
});

const goalForm = document.querySelector("#goal-form");
goalForm.elements.submissionDate.addEventListener("input", () => {
  const submissionDate = goalForm.elements.submissionDate.value;
  const deadline = goalForm.elements.deadline;
  if (submissionDate && (!deadline.value || goalForm.dataset.deadlineAutoFilled === "true")) {
    deadline.value = submissionDate;
    goalForm.dataset.deadlineAutoFilled = "true";
  } else if (!submissionDate && goalForm.dataset.deadlineAutoFilled === "true") {
    deadline.value = "";
    delete goalForm.dataset.deadlineAutoFilled;
  }
});
goalForm.elements.deadline.addEventListener("input", () => {
  delete goalForm.dataset.deadlineAutoFilled;
});

document.querySelector("#quiz-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const kind = String(data.get("kind"));
  const title = String(data.get("title")).trim();
  const subject = String(data.get("subject"));
  const date = String(data.get("date"));
  const scope = String(data.get("scope")).trim();
  const unit = String(data.get("unit")).trim();
  const eventId = kind === "submission" ? String(data.get("eventId") || "") : "";
  const associatedEvent = state.events.find((item) => item.id === eventId);
  const rawPeriod = String(data.get("period") || "");
  const period = rawPeriod ? Number(rawPeriod) : null;
  const editingQuiz = state.quizzes.find((quiz) => quiz.id === form.dataset.editId);
  const periodIsValid = period === null
    || (Number.isSafeInteger(period) && period >= 1 && (period <= state.settings.periodCount || period === editingQuiz?.period));
  if (!["quiz", "submission"].includes(kind) || !title || !state.settings.subjects.includes(subject) || !date || !scope || (eventId && !associatedEvent) || (kind === "quiz" && period === null) || !periodIsValid) {
    showError(form, `タイトル・範囲・科目・日付を正しく入力してください。小テストは1〜${state.settings.periodCount}校時を指定してください。`);
    return;
  }
  const updatedQuiz = { id: form.dataset.editId || createId(), kind, title, subject, date, scope, unit, period, eventId: associatedEvent?.id || "" };
  if (form.dataset.editId) {
    const index = state.quizzes.findIndex((quiz) => quiz.id === form.dataset.editId);
    if (index < 0) {
      showError(form, "編集する予定が見つかりません。");
      return;
    }
    state.quizzes[index] = updatedQuiz;
    const schedulePool = state.pools.find((pool) => pool.sourceQuizId === updatedQuiz.id);
    if (schedulePool) {
      const start = getSchedulePoolStart(updatedQuiz.date);
      Object.assign(schedulePool, {
        title: updatedQuiz.title,
        subject: updatedQuiz.subject,
        scope: updatedQuiz.scope,
        scopeUnit: updatedQuiz.unit,
        unit: updatedQuiz.kind === "submission" ? (updatedQuiz.unit || "件") : "回",
        deadline: updatedQuiz.date,
        start,
        end: shiftDate(start, 6),
      });
    }
    state.tasks.filter((task) => task.quizId === updatedQuiz.id).forEach((task) => {
      task.title = title;
      task.subject = subject;
      task.scope = scope;
      task.scopeUnit = unit;
      task.unit = kind === "submission" ? (unit || "件") : "回";
    });
  } else {
    state.quizzes.push(updatedQuiz);
  }
  moveDueSchedulesToPools();
  saveStateAndClose(elements.quizDialog, form);
});

const eventForm = document.querySelector("#event-form");
eventForm.elements.start.addEventListener("input", () => {
  const { start, end } = eventForm.elements;
  if (start.value && (!end.value || end.value <= start.value)) {
    end.value = shiftDate(start.value, 1);
  }
});

const poolForm = document.querySelector("#pool-form");
poolForm.elements.start.addEventListener("input", () => {
  const { start, end } = poolForm.elements;
  if (start.value) end.value = shiftDate(start.value, 6);
});

eventForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const title = String(data.get("title")).trim();
  const start = String(data.get("start"));
  const end = String(data.get("end"));
  const existingEvent = state.events.find((item) => item.id === form.dataset.editId);
  if (!title || start > end) {
    showError(form, "イベント名と期間を正しく入力してください。");
    return;
  }
  if (form.dataset.editId && !existingEvent) {
    showError(form, "編集するイベントが見つかりません。");
    return;
  }
  const updatedEvent = {
    id: form.dataset.editId || createId(),
    title,
    type: String(data.get("type")),
    start,
    end,
    memo: String(data.get("memo") || "").trim(),
    alwaysShow: Boolean(existingEvent?.alwaysShow),
    pinnedAt: existingEvent?.pinnedAt || 0,
  };
  if (form.dataset.editId) {
    const index = state.events.findIndex((item) => item.id === form.dataset.editId);
    state.events[index] = updatedEvent;
  } else {
    state.events.push(updatedEvent);
  }
  saveStateAndClose(elements.eventDialog, form);
});

goalForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const parentEvent = state.events.find((item) => item.id === data.get("eventId"));
  const goal = {
    id: form.dataset.editId || createId(),
    eventId: parentEvent?.id,
    subject: String(data.get("subject")),
    title: String(data.get("title")).trim(),
    scope: String(data.get("scope") || "").trim(),
    unit: String(data.get("unit")).trim(),
    total: Number(data.get("total")),
    laps: Number(data.get("laps")),
    completed: 0,
    deadline: String(data.get("deadline") || ""),
    submissionDate: String(data.get("submissionDate") || ""),
    memo: String(data.get("memo") || "").trim(),
  };
  if (!parentEvent || !state.settings.subjects.includes(goal.subject) || !goal.title || !goal.unit || !Number.isSafeInteger(goal.total) || goal.total < 1 || !Number.isSafeInteger(goal.laps) || goal.laps < 1) {
    showError(form, "イベント・科目を選択し、教材名・単位・量を正しく入力してください。");
    return;
  }
  if (form.dataset.editId) {
    const index = state.goals.findIndex((item) => item.id === form.dataset.editId);
    if (index < 0) {
      showError(form, "編集する長期目標が見つかりません。");
      return;
    }
    goal.completed = state.goals[index].completed || 0;
    state.goals[index] = goal;
    state.pools.filter((pool) => pool.goalId === goal.id).forEach((pool) => {
      pool.goalTitle = goal.title;
      pool.title = goal.title;
      pool.subject = goal.subject;
      pool.unit = goal.unit;
      if (!pool.sourceGoalId) pool.scope = goal.scope;
    });
    const submissionPool = state.pools.find((pool) => pool.sourceGoalId === goal.id);
    if (submissionPool && goal.submissionDate) {
      const start = getSchedulePoolStart(goal.submissionDate);
      submissionPool.scope = formatSubmissionDate(goal.submissionDate);
      submissionPool.deadline = goal.submissionDate;
      submissionPool.start = start;
      submissionPool.end = shiftDate(start, 6);
    }
  } else {
    state.goals.push(goal);
  }
  moveDueSchedulesToPools();
  saveStateAndClose(elements.goalDialog, form);
});

document.querySelector("#pool-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const editingPool = form.dataset.editId
    ? state.pools.find((item) => item.id === form.dataset.editId)
    : null;
  const goal = state.goals.find((item) => item.id === data.get("goalId"));
  const target = Number(data.get("target"));
  const start = String(data.get("start"));
  const end = String(data.get("end"));
  if (form.dataset.editId && !editingPool) {
    showError(form, "編集する週間プールが見つかりません。");
    return;
  }
  if (!form.dataset.editId && !goal) {
    showError(form, "有効な長期目標を選択してください。");
    return;
  }
  if (!Number.isSafeInteger(target) || target < 1 || start > end) {
    showError(form, "目標量と期間を正しく入力してください。");
    return;
  }
  if (editingPool) {
    editingPool.target = target;
    editingPool.start = start;
    editingPool.end = end;
    editingPool.memo = String(data.get("memo") || "").trim();
  } else {
    state.pools.push({
      id: createId(), eventId: goal.eventId, goalId: goal.id, goalTitle: goal.title, title: goal.title, subject: goal.subject,
      unit: goal.unit, scope: goal.scope, start, end, target, completed: 0, status: "active",
      memo: String(data.get("memo") || "").trim(),
    });
  }
  saveStateAndClose(elements.poolDialog, form);
});

document.querySelector("#task-details-memo-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const task = state.tasks.find((item) => item.id === form.elements.taskId.value);
  if (!task) {
    showError(form, "タスクを読み込めませんでした。");
    return;
  }
  task.memo = form.elements.memo.value.trim();
  saveStateAndClose(elements.taskDetailsDialog, form);
});

document.querySelector("#task-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const editingTask = form.dataset.editId
    ? state.tasks.find((item) => item.id === form.dataset.editId)
    : null;
  const pool = state.pools.find((item) => item.id === form.elements.poolId.value);
  const minimum = Number(form.elements.minimum.value);
  if ((form.dataset.editId && !editingTask) || (!form.dataset.editId && (!pool || pool.status !== "active")) || !Number.isSafeInteger(minimum) || minimum < 1) {
    showError(form, "最低量を正しく入力してください。");
    return;
  }
  if (editingTask) {
    editingTask.minimum = minimum;
    editingTask.memo = form.elements.memo.value.trim();
  } else {
    state.tasks.push({
      id: createId(), poolId: pool.id, ...(pool.sourceQuizId ? { quizId: pool.sourceQuizId } : {}),
      title: pool.title, subject: pool.subject, unit: pool.unit,
      scope: pool.scope || "", scopeUnit: pool.scopeUnit || "", minimum, date: today, completed: false,
      status: "active",
      memo: form.elements.memo.value.trim(),
    });
  }
  saveStateAndClose(elements.taskDialog, form);
});

document.querySelector("#complete-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const task = state.tasks.find((item) => item.id === form.elements.taskId.value);
  const pool = task && state.pools.find((item) => item.id === task.poolId);
  const actual = Number(form.elements.actual.value);
  const minutes = Number(form.elements.minutes.value);
  const endingStudy = task && recordingEndTaskId === task.id;
  if (!task || (task.completed && !endingStudy) || !Number.isSafeInteger(actual) || actual < 0
    || !Number.isSafeInteger(minutes) || minutes < 0) {
    showError(form, "実績量と勉強時間を0以上の整数で入力してください。");
    return;
  }
  task.memo = form.elements.memo.value.trim();
  if (task.completed) {
    addTaskActual(task, actual);
    if (minutes > 0 && endingStudy) addTaskStudyMinutes(task, minutes);
    recordingEndTaskId = null;
    saveStateAndClose(elements.completeDialog, form);
    return;
  }
  if (!taskMeetsMinimum(task, actual)) {
    commitTaskRecord(task.id, actual, false);
    if (minutes > 0) addTaskStudyMinutes(task, minutes);
    recordingEndTaskId = null;
    saveStateAndClose(elements.completeDialog, form);
    return;
  }
  pendingTaskRecord = { taskId: task.id, amount: actual, minutes };
  document.querySelector("#task-record-inputs").hidden = true;
  document.querySelector("#task-record-actions").hidden = true;
  document.querySelector("#task-outcome").hidden = false;
});

document.querySelector("#study-log-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const task = state.tasks.find((item) => item.id === form.elements.taskId.value);
  const minutes = Number(form.elements.minutes.value);
  const amount = Number(form.elements.amount.value);
  const seconds = minutes * 60;
  if (!task || !Number.isSafeInteger(minutes) || minutes < 0
    || !Number.isSafeInteger(seconds) || !Number.isSafeInteger(amount) || amount < 0
    || (minutes === 0 && amount === 0)) {
    showError(form, "タスクを選択し、勉強時間または実施量を1以上入力してください。");
    return;
  }
  task.studyLogs ||= [];
  task.studyLogs.push({ date: selectedCalendarDate, seconds, amount });
  if (amount > 0) addTaskActual(task, amount);
  saveStateAndClose(elements.studyLogDialog, form);
});

function addTaskActual(task, amount) {
  task.actual = (task.actual || 0) + amount;
  const pool = getTaskPool(task);
  if (pool) syncTaskProgress(pool.id);
}

function getTaskPool(task) {
  if (task.poolId) return state.pools.find((item) => item.id === task.poolId);
  return state.pools.find((pool) => (task.quizId && pool.sourceQuizId === task.quizId)
    || (task.sourceGoalId && pool.sourceGoalId === task.sourceGoalId));
}

function syncTaskProgress(poolId) {
  const pool = state.pools.find((item) => item.id === poolId);
  if (!pool) return false;
  const goal = state.goals.find((item) => item.id === pool.goalId);
  const relatedPools = goal
    ? state.pools.filter((item) => item.goalId === goal.id)
    : [pool];
  let changed = false;
  relatedPools.forEach((item) => {
    const completed = state.tasks
      .filter((task) => task.poolId === item.id || (!task.poolId && (
        (item.sourceQuizId && task.quizId === item.sourceQuizId)
        || (item.sourceGoalId && task.sourceGoalId === item.sourceGoalId)
      )))
      .reduce((total, task) => total + Number(task.actual || 0), 0);
    if (item.completed !== completed) changed = true;
    item.completed = completed;
  });
  if (goal) {
    const goalCompleted = relatedPools
      .reduce((total, item) => total + Number(item.completed || 0), 0);
    const cappedGoalCompleted = Math.min(goal.total * goal.laps, goalCompleted);
    if (goal.completed !== cappedGoalCompleted) changed = true;
    goal.completed = cappedGoalCompleted;
  }
  return changed;
}

function commitTaskRecord(taskId, amount, complete) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || task.completed || task.status === "closed") return;
  addTaskActual(task, amount);
  task.completed = complete;
}

function addTaskStudyMinutes(task, minutes) {
  task.studyLogs ||= [];
  task.studyLogs.push({
    date: task.date,
    seconds: minutes * 60,
    amount: 0,
  });
}

function completeAchievedPastTasks() {
  let changed = false;
  state.tasks.forEach((task) => {
    const minimum = Number(task.minimum);
    if (!task.completed && task.status !== "closed" && task.date < today && Number.isSafeInteger(minimum) && minimum > 0
      && Number(task.actual || 0) >= minimum) {
      task.completed = true;
      changed = true;
    }
  });
  return changed;
}

elements.completeDialog.addEventListener("close", () => {
  pendingTaskRecord = null;
  recordingEndTaskId = null;
});

function openCarryOverdueDialog(taskIds, { includeClosed = false } = {}) {
  const overdueTasks = state.tasks.filter((task) =>
    !task.completed
    && (includeClosed || task.status !== "closed")
    && task.date < today
    && (!taskIds || taskIds.includes(task.id)));
  if (!overdueTasks.length) return;

  const list = document.querySelector("#carry-overdue-list");
  list.innerHTML = overdueTasks.map((task) => {
    const pool = state.pools.find((item) => item.id === task.poolId);
    const unit = pool?.unit || task.unit || "";
    const title = pool?.title || task.title || "タスク";
    const shortfall = Math.max(0, Number(task.minimum || 0) - Number(task.actual || 0));
    const defaultMinimum = shortfall > 0 ? shortfall : 1;
    return `<div class="carry-overdue-row">
      <span><strong>${escapeHtml(title)}</strong><small>未達分 ${shortfall} ${escapeHtml(unit)}</small></span>
      <span class="carry-overdue-amount">
        <input type="number" name="carry-${escapeHtml(task.id)}" data-carry-task="${escapeHtml(task.id)}" data-carry-closed="${includeClosed && task.status === "closed"}" min="1" step="1" value="${defaultMinimum}" required />
        <span class="quick-amounts carry-overdue-quick">
          <button type="button" data-carry-add="1">＋1</button>
          <button type="button" data-carry-add="5">＋5</button>
          <button type="button" data-carry-add="10">＋10</button>
        </span>
        <label class="carry-memo-field">メモ<textarea data-carry-memo="${escapeHtml(task.id)}" maxlength="2000">${escapeHtml(task.memo || "")}</textarea></label>
      </span>
    </div>`;
  }).join("");
  openDialog(elements.carryOverdueDialog);
}

function archiveTaskRecord(task) {
  task.studyLogs ||= [];
  const loggedAmount = task.studyLogs.reduce((total, log) => total + Number(log.amount || 0), 0);
  const legacyAmount = Math.max(0, Number(task.actual || 0) - loggedAmount);
  if ((task.studySeconds || 0) > 0 || legacyAmount > 0) {
    task.studyLogs.push({
      date: task.date,
      seconds: task.studySeconds || 0,
      amount: legacyAmount,
    });
  }
  task.studySeconds = 0;
}

function carryOverdueTasksToToday() {
  const form = document.querySelector("#carry-overdue-form");
  const inputs = [...form.querySelectorAll("[data-carry-task]")];
  if (!inputs.length) return;

  for (const input of inputs) {
    const minimum = Number(input.value);
    if (!Number.isSafeInteger(minimum) || minimum < 1) {
      showError(form, "今日の最低量を1以上の整数で入力してください。");
      return;
    }
  }

  inputs.forEach((input) => {
    const task = state.tasks.find((item) => item.id === input.dataset.carryTask);
    if (!task || task.completed || (task.status === "closed" && input.dataset.carryClosed !== "true") || task.date >= today) return;
    if (state.studyTimer?.taskId === task.id) {
      addRunningTimeToTask(state.studyTimer, Date.now());
      state.studyTimer = null;
    }
    const archivedAmount = Number(task.actual || 0);
    archiveTaskRecord(task);
    const minimum = Number(input.value);
    const memo = form.querySelector(`[data-carry-memo="${CSS.escape(input.dataset.carryTask)}"]`)?.value.trim() || "";
    task.status = "active";
    const existingTodayTask = state.tasks.find((item) =>
      item.id !== task.id
      && item.date === today
      && !item.completed
      && item.status !== "closed"
      && (task.poolId ? item.poolId === task.poolId : task.quizId && item.quizId === task.quizId));

    if (existingTodayTask) {
      existingTodayTask.status = "active";
      existingTodayTask.minimum += minimum;
      existingTodayTask.actual = (existingTodayTask.actual || 0) + archivedAmount;
      existingTodayTask.studyLogs ||= [];
      existingTodayTask.studyLogs.push(...(task.studyLogs || []));
      existingTodayTask.memo = [existingTodayTask.memo, memo].filter((value, index, values) => value && values.indexOf(value) === index).join("\n");
      existingTodayTask.completed = existingTodayTask.actual >= existingTodayTask.minimum;
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      return;
    }

    task.date = today;
    task.minimum = minimum;
    task.memo = memo;
  });
  saveStateAndClose(elements.carryOverdueDialog, form);
}

document.querySelector("#carry-overdue-form").addEventListener("submit", (event) => {
  event.preventDefault();
  carryOverdueTasksToToday();
});

function carryPool(poolId) {
  const pool = state.pools.find((item) => item.id === poolId);
  if (!pool || pool.status !== "active") return;
  const remaining = Math.max(0, pool.target - pool.completed);
  if (!remaining) return;
  const form = elements.carryPoolDialog.querySelector("form");
  openDialog(elements.carryPoolDialog);
  form.elements.poolId.value = pool.id;
  form.elements.memo.value = pool.memo || "";
}

document.querySelector("#carry-pool-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const pool = state.pools.find((item) => item.id === form.elements.poolId.value);
  if (!pool || pool.status !== "active") {
    showError(form, "繰り越す週間プールが見つかりません。");
    return;
  }
  const remaining = Math.max(0, pool.target - pool.completed);
  if (!remaining) {
    showError(form, "繰り越せる残り量がありません。");
    return;
  }
  const nextStart = getWeekStart(today);
  pool.status = "closed";
  state.pools.push({
    ...pool,
    id: createId(),
    start: nextStart,
    end: shiftDate(nextStart, 6),
    target: remaining,
    completed: 0,
    status: "active",
    memo: form.elements.memo.value.trim(),
  });
  saveStateAndClose(elements.carryPoolDialog, form);
});

function formatDetailDate(value) {
  return value ? formatDate(value, { year: "numeric", month: "long", day: "numeric" }) : "";
}

function formatDetailDateRange(start, end) {
  const formattedStart = formatDetailDate(start);
  const formattedEnd = formatDetailDate(end);
  if (formattedStart && formattedEnd) return `${formattedStart} 〜 ${formattedEnd}`;
  return formattedStart || formattedEnd;
}

function formatDetailDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!total) return "0分";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  return [
    hours ? `${hours}時間` : "",
    minutes ? `${minutes}分` : "",
    remainingSeconds ? `${remainingSeconds}秒` : "",
  ].filter(Boolean).join("");
}

function openTaskDetails(task) {
  const pool = state.pools.find((item) => item.id === task.poolId);
  const recorded = Number(task.actual || 0);
  const unit = pool?.unit || task.unit || "";
  const status = task.completed
    ? "完了"
    : task.status === "closed"
      ? "終了"
      : recorded >= task.minimum
        ? "最低量達成・継続中"
        : recorded > 0
          ? "記録あり"
          : "未着手";
  const studyLogs = (task.studyLogs || []).map((log) =>
    `${formatDetailDate(log.date)}：勉強 ${formatDetailDuration(log.seconds)}、実施量 ${log.amount} ${unit}`.trim());
  const details = [
    { label: "タスク名", value: pool?.title || task.title || "" },
    { label: "科目", value: pool?.subject || task.subject || "" },
    { label: "取り組む日", value: formatDetailDate(task.date) },
    { label: "状態", value: status },
    { label: "今日の最低量", value: task.minimum == null ? "" : `${task.minimum} ${unit}`.trim() },
    { label: "実績量", value: `${recorded} ${unit}`.trim() },
  ];
  const scope = task.scope || pool?.scope;
  const scopeUnit = task.scopeUnit || pool?.scopeUnit;
  if (scope) details.push({ label: "範囲", value: `${scope}${scopeUnit ? `（${scopeUnit}）` : ""}` });
  if (pool?.goalTitle) details.push({ label: "長期計画", value: pool.goalTitle });
  details.push(
    { label: "勉強時間", value: formatDetailDuration(getTaskStudySeconds(task)) },
  );
  if (studyLogs.length) details.push({ label: "勉強記録の内訳", value: studyLogs.join("\n") });
  openRecordDetails("タスクの詳細", details);
  const memoForm = document.querySelector("#task-details-memo-form");
  memoForm.hidden = false;
  memoForm.elements.taskId.value = task.id;
  memoForm.elements.memo.value = task.memo || "";
}

function openPoolDetails(pool) {
  const completed = Number(pool.completed || 0);
  const remaining = Math.max(0, Number(pool.target || 0) - completed);
  const hasTarget = pool.target !== undefined && pool.target !== null;
  const details = [
    { label: "タスク名", value: pool.title || "" },
    { label: "科目", value: pool.subject || "" },
    { label: "範囲", value: pool.scope || pool.goalTitle || "" },
    { label: "期間", value: formatDetailDateRange(pool.start, pool.end) },
    { label: "進捗", value: hasTarget ? `${completed} / ${pool.target} ${pool.unit || ""}`.trim() : "" },
    { label: "残り", value: hasTarget ? `${remaining} ${pool.unit || ""}`.trim() : "" },
    { label: "状態", value: pool.status ? (pool.status === "active" ? "進行中" : "終了") : "" },
  ];
  if (pool.deadline) details.push({ label: "提出日", value: formatDetailDate(pool.deadline) });
  details.push({ label: "メモ", value: pool.memo || "" });
  openRecordDetails("週間プールの詳細", details);
}

function openEventDetails(event) {
  const goals = state.goals.filter((goal) => goal.eventId === event.id);
  openRecordDetails("イベントの詳細", [
    { label: "イベント名", value: event.title || "" },
    { label: "種類", value: event.type ? getEventTypeLabel(event.type) : "" },
    { label: "期間", value: formatDetailDateRange(event.start, event.end) },
    { label: "長期計画", value: goals.map((goal) => goal.title).filter(Boolean).join("\n") },
    { label: "メモ", value: event.memo || "" },
  ]);
}

function openQuizDetails(quiz) {
  const event = state.events.find((item) => item.id === quiz.eventId);
  openRecordDetails("予定の詳細", [
    { label: "タイトル", value: quiz.title || "" },
    { label: "科目", value: quiz.subject || "" },
    { label: "種類", value: quiz.kind === "submission" ? "提出物" : "小テスト" },
    { label: "日付", value: formatDetailDate(quiz.date) },
    { label: "校時", value: quiz.period ? `${quiz.period}校時` : "" },
    { label: "範囲", value: quiz.scope || "" },
    { label: "単位", value: quiz.unit || "" },
    { label: "イベント", value: event?.title || "" },
  ]);
}

function openGoalDetails(goal) {
  const event = state.events.find((item) => item.id === goal.eventId);
  const completed = goalProgress(goal);
  const total = goal.total * goal.laps;
  const deadlineLabel = goal.deadline && goal.deadline === goal.submissionDate ? "提出期限" : "期限";
  const hasTotal = goal.total != null && goal.laps != null && Number.isFinite(total);
  const details = [
    { label: "計画名", value: goal.title || "" },
    { label: "イベント", value: event?.title || "" },
    { label: "科目", value: goal.subject || "" },
    { label: "範囲", value: goal.scope || "" },
    { label: "単位", value: goal.unit || "" },
    { label: "1周あたり", value: goal.total == null ? "" : `${goal.total} ${goal.unit || ""}`.trim() },
    { label: "目標周回数", value: goal.laps == null ? "" : `${goal.laps} 周` },
    { label: "全体の目標量", value: hasTotal ? `${total} ${goal.unit || ""}`.trim() : "" },
    { label: "進捗", value: hasTotal ? `${completed} / ${total} ${goal.unit || ""}`.trim() : "" },
    { label: deadlineLabel, value: formatDetailDate(goal.deadline) },
  ];
  if (goal.submissionDate && goal.submissionDate !== goal.deadline) {
    details.push({ label: "提出日", value: formatDetailDate(goal.submissionDate) });
  }
  details.push({ label: "メモ", value: goal.memo || "" });
  openRecordDetails("長期計画の詳細", details);
}

function openRecordDetails(title, details) {
  document.querySelector("#task-details-title").textContent = title;
  document.querySelector("#task-details-content").innerHTML = details
    .filter(({ value }) => value !== "" && value !== null && value !== undefined)
    .map(({ label, value }) => `<div class="record-detail-row"><dt>${escapeHtml(label)}</dt><dd><pre>${escapeHtml(value)}</pre></dd></div>`)
    .join("");
  document.querySelector("#task-details-memo-form").hidden = true;
  elements.taskDetailsDialog.showModal();
}

function returnTaskToPool(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || hasTaskProgress(task)) return;
  const pool = task.poolId ? state.pools.find((item) => item.id === task.poolId) : null;
  const schedule = !pool && (task.quizId || task.sourceGoalId)
    ? getScheduledQuizzes().find((item) => task.sourceGoalId
      ? item.sourceGoalId === task.sourceGoalId
      : item.id === task.quizId)
    : null;
  if (task.poolId) {
    if (!pool || pool.status !== "active") return;
  } else if (task.quizId || task.sourceGoalId) {
    if (!schedule) return;
    const schedulePool = findSchedulePool(schedule);
    if (schedulePool && schedulePool.status !== "active") return;
  } else {
    return;
  }
  const form = elements.returnTaskDialog.querySelector("form");
  openDialog(elements.returnTaskDialog);
  form.elements.taskId.value = task.id;
  form.elements.memo.value = task.memo || "";
  document.querySelector("#return-task-title").textContent = `「${task.title}」を週間プールへ戻します。ToDoは削除されます。`;
}

document.querySelector("#return-task-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const task = state.tasks.find((item) => item.id === form.elements.taskId.value);
  if (!task || hasTaskProgress(task)) {
    showError(form, "実績や勉強記録のあるタスクは週間プールへ戻せません。");
    return;
  }
  let pool = task.poolId ? state.pools.find((item) => item.id === task.poolId) : null;
  if (pool && pool.status !== "active") {
    showError(form, "戻し先の週間プールが見つかりません。");
    return;
  }
  if (!pool && (task.quizId || task.sourceGoalId)) {
    const schedule = getScheduledQuizzes().find((item) => task.sourceGoalId
      ? item.sourceGoalId === task.sourceGoalId
      : item.id === task.quizId);
    if (!schedule) {
      showError(form, "戻し先の予定が見つかりません。");
      return;
    }
    pool = findSchedulePool(schedule);
    if (pool && pool.status !== "active") {
      showError(form, "戻し先の週間プールが終了しています。");
      return;
    }
    if (!pool) {
      if (!createSchedulePool(schedule)) {
        showError(form, "週間プールを作成できませんでした。");
        return;
      }
      pool = findSchedulePool(schedule);
    }
  }
  if (!pool) {
    showError(form, "戻し先の週間プールが見つかりません。");
    return;
  }
  pool.memo = form.elements.memo.value.trim();
  if (state.studyTimer?.taskId === task.id) state.studyTimer = null;
  state.tasks = state.tasks.filter((item) => item.id !== task.id);
  saveStateAndClose(elements.returnTaskDialog, form);
});

function returnPoolToSource(poolId) {
  const pool = state.pools.find((item) => item.id === poolId);
  const returnDestination = pool && getPoolReturnDestination(pool);
  if (!pool || pool.status !== "active" || !returnDestination) return;
  const poolTasks = state.tasks.filter((task) => task.poolId === pool.id);
  if (Number(pool.completed || 0) > 0 || poolTasks.some(hasTaskProgress)) return;
  if (!window.confirm(`「${pool.title}」を週間プールから${returnDestination}へ戻します。関連する実績のないToDoも削除されます。よろしいですか？`)) return;
  if (poolTasks.some((task) => task.id === state.studyTimer?.taskId)) state.studyTimer = null;
  state.tasks = state.tasks.filter((task) => task.poolId !== pool.id);
  state.pools = state.pools.filter((item) => item.id !== pool.id);
  saveState();
}

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

const bottomNavDesktop = window.matchMedia("(min-width: 701px)");
const bottomNavScrollPositions = new WeakMap();
let bottomNavShowTimer = null;
let bottomNavTouchStart = null;

function showBottomNav() {
  elements.bottomNav.classList.remove("is-hidden");
}

function hideBottomNav() {
  if (bottomNavDesktop.matches) {
    showBottomNav();
    return;
  }
  elements.bottomNav.classList.add("is-hidden");
}

function scheduleBottomNavShow() {
  window.clearTimeout(bottomNavShowTimer);
  if (bottomNavDesktop.matches) return;
  bottomNavShowTimer = window.setTimeout(showBottomNav, 500);
}

function handleBottomNavScroll(scrollTarget) {
  if (bottomNavDesktop.matches) {
    window.clearTimeout(bottomNavShowTimer);
    showBottomNav();
    return;
  }
  const currentY = scrollTarget === window ? window.scrollY : scrollTarget.scrollTop;
  const previousY = bottomNavScrollPositions.get(scrollTarget) ?? currentY;
  const delta = currentY - previousY;
  bottomNavScrollPositions.set(scrollTarget, currentY);
  if (currentY <= 0 || delta < 0) showBottomNav();
  else if (delta > 0) hideBottomNav();
  scheduleBottomNavShow();
}

window.addEventListener("scroll", () => handleBottomNavScroll(window), { passive: true });
elements.recordingView.addEventListener("scroll", () => handleBottomNavScroll(elements.recordingView), { passive: true });
document.addEventListener("touchstart", (event) => {
  if (bottomNavDesktop.matches || event.touches.length !== 1) {
    bottomNavTouchStart = null;
    return;
  }
  const touch = event.touches[0];
  bottomNavTouchStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });
document.addEventListener("touchmove", (event) => {
  if (!bottomNavTouchStart || event.touches.length !== 1) return;
  const touch = event.touches[0];
  const deltaX = touch.clientX - bottomNavTouchStart.x;
  const deltaY = touch.clientY - bottomNavTouchStart.y;
  if (Math.abs(deltaY) < 8 || Math.abs(deltaY) <= Math.abs(deltaX)) return;
  if (deltaY < 0) hideBottomNav();
  else showBottomNav();
}, { passive: true });
document.addEventListener("touchend", () => {
  bottomNavTouchStart = null;
  scheduleBottomNavShow();
}, { passive: true });
document.addEventListener("touchcancel", () => {
  bottomNavTouchStart = null;
  scheduleBottomNavShow();
}, { passive: true });
window.addEventListener("resize", () => {
  if (bottomNavDesktop.matches) {
    window.clearTimeout(bottomNavShowTimer);
    showBottomNav();
  }
}, { passive: true });

setAuthenticatedView(false);
initializeAuth();
scheduleEventRefresh();
window.setInterval(() => {
  if (!elements.recordingView.hidden) renderRecording();
  if (!elements.calendarView.hidden && state.studyTimer?.startedAt
    && calendarRenderedMinute !== Math.floor(Date.now() / 60000)) renderCalendar();
}, 1000);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .then((registration) => {
        registration.update();
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) registration.update();
        });
      })
      .catch((error) => {
        console.error("オフライン機能を有効にできませんでした。", error);
      });

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}
