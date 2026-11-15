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
  goalDialog: document.querySelector("#goal-dialog"),
  poolDialog: document.querySelector("#pool-dialog"),
  taskDialog: document.querySelector("#task-dialog"),
  completeDialog: document.querySelector("#complete-dialog"),
  settingsDialog: document.querySelector("#settings-dialog"),
  settingsSubjects: document.querySelector("#settings-subject-list"),
  menuDialog: document.querySelector("#menu-dialog"),
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
  calendarAgendaTitle: document.querySelector("#calendar-agenda-title"),
  calendarAgenda: document.querySelector("#calendar-agenda-list"),
  calendarAgendaEmpty: document.querySelector("#calendar-agenda-empty"),
  calendarStudyTotal: document.querySelector("#calendar-study-total"),
  calendarStudyList: document.querySelector("#calendar-study-list"),
  calendarStudyEmpty: document.querySelector("#calendar-study-empty"),
};

let today = dateKeyInJst(new Date());
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = today;
let calendarRenderedMinute = -1;
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

function normalizeState(stored) {
  stored = stored && typeof stored === "object" ? stored : {};
  const events = Array.isArray(stored.events) ? stored.events : [];
  const goals = Array.isArray(stored.goals) ? stored.goals : [];
  const ungroupedGoals = goals.filter((goal) => !events.some((event) => event.id === goal.eventId));
  if (ungroupedGoals.length) {
    const legacyEvent = {
      id: createId(),
      title: "イベント未設定の長期計画",
      type: "other",
      start: "",
      end: "",
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
  tasks.forEach((task) => {
    const seconds = Number(task.studySeconds);
    task.studySeconds = Number.isSafeInteger(seconds) && seconds > 0 ? seconds : 0;
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
    pools: Array.isArray(stored.pools) ? stored.pools : [],
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
  render();
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

function goalProgress(goal) {
  return Math.min(goal.total * goal.laps, goal.completed);
}

function taskMeetsMinimum(task, amount) {
  return (task.actual || 0) + amount >= task.minimum;
}

function render() {
  elements.dateLabel.textContent = formatDate(today, { month: "long", day: "numeric", weekday: "short" });
  renderSubjectOptions();
  renderEventOptions();
  renderPeriodOptions();
  renderTasks();
  renderEvents();
  renderQuizzes();
  renderPools();
  renderSummary();
  renderPoolOptions();
  renderRecording();
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
  return (task.studySeconds || 0) + activeSeconds;
}

function getStudySecondsForDate(date) {
  return state.tasks
    .filter((task) => task.date === date)
    .reduce((total, task) => total + getTaskStudySeconds(task), 0);
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
  const todayTasks = state.tasks.filter((item) => item.date === today);
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
  elements.recordingTaskTitle.textContent = pool?.title || task.title;
  elements.recordingElapsed.textContent = formatDuration(getRecordingElapsedSeconds());
  elements.recordingStart.hidden = Boolean(state.studyTimer.startedAt);
  elements.recordingStart.textContent = state.studyTimer.elapsedSeconds ? "記録を再開" : "記録開始";
  elements.recordingPause.hidden = !state.studyTimer.startedAt;
  elements.recordingEnd.hidden = !state.studyTimer.hasStarted;
  renderRecordingClock();
}

function openRecordingView() {
  selectingRecordingTask = !getRecordingTask();
  elements.menuDialog.close();
  elements.dashboard.hidden = true;
  elements.calendarView.hidden = true;
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
}

function renderSummary() {
  const todaysTasks = state.tasks.filter((task) => task.date === today);
  const completed = todaysTasks.filter((task) => task.completed).length;
  elements.summary.innerHTML = `<span class="stat-number">${completed}<span style="font-size:13px;color:#93a099"> / ${todaysTasks.length}</span></span><span class="stat-caption">今日の完了</span>`;
}

function renderTasks() {
  const visibleTasks = state.tasks
    .filter((task) => task.date === today || (task.date < today && !task.completed))
    .sort((a, b) => {
      if ((a.date === today) !== (b.date === today)) return a.date === today ? -1 : 1;
      return b.date.localeCompare(a.date);
    });
  const pastTasks = state.tasks
    .filter((task) => task.date < today && task.completed)
    .sort((a, b) => b.date.localeCompare(a.date));
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
  const completeLabel = task.completed ? "記録済み" : "実績を記録";
  const recorded = task.actual || 0;
  const achieved = recorded >= task.minimum;
  const surplus = task.completed && achieved && recorded > task.minimum
    ? `<span class="surplus">＋${recorded - task.minimum} ${escapeHtml(unit)} できた！</span>`
    : "";
  const shortfall = !task.completed && !achieved
    ? `<span class="shortfall">あと ${task.minimum - recorded} ${escapeHtml(unit)}</span>`
    : "";
  const taskState = task.completed ? "完了" : achieved ? "最低達成・継続中" : recorded > 0 ? "記録あり" : "未着手";
  const isPast = task.date < today;
  const date = isPast ? `${formatDate(task.date, { month: "numeric", day: "numeric", weekday: "short" })} ・ ` : "";
  const details = task.scope ? ` ・ 範囲: ${escapeHtml(task.scope)}${task.scopeUnit ? ` ${escapeHtml(task.scopeUnit)}` : ""}` : "";
  return `<article class="task-card${task.completed ? " done" : ""}${isPast && !task.completed ? " past-uncompleted" : ""}">
    <div class="task-main"><p class="card-title">${escapeHtml(title)}</p>
        <p class="task-detail">${date}${escapeHtml(subject)} ・ ${taskState} ・ 最低 ${task.minimum} ${escapeHtml(unit)} ・ 累計 ${recorded} ${escapeHtml(unit)} ・ 勉強 ${formatDuration(task.studySeconds || 0)}${details}</p>
    </div>
      <div class="task-actions"><button class="text-button icon-action" type="button" data-edit-task="${escapeHtml(task.id)}" aria-label="タスクを編集" title="編集">✏️</button>${surplus}${shortfall}${task.completed ? "" : `<button class="task-complete" type="button" data-complete-task="${escapeHtml(task.id)}">${completeLabel}</button>`}</div>
  </article>`;
}

function renderEvents() {
  const futureThreshold = dateKey(addMonths(new Date(), 2));
  const pastEvents = state.events
    .filter((event) => event.end && event.end < today)
    .sort((a, b) => b.end.localeCompare(a.end));
  const upcomingEvents = state.events.filter((event) => !event.end || event.end >= today);
  const currentEvents = upcomingEvents.filter((event) => !event.start || event.start < futureThreshold);
  const futureEvents = upcomingEvents.filter((event) => event.start && event.start >= futureThreshold);
  elements.eventsEmpty.hidden = currentEvents.length > 0;
  elements.futureEventsEmpty.hidden = futureEvents.length > 0;
  elements.pastEventsEmpty.hidden = pastEvents.length > 0;
  elements.events.innerHTML = currentEvents.map(renderEventCard).join("");
  elements.futureEvents.innerHTML = futureEvents.map(renderEventCard).join("");
  elements.pastEvents.innerHTML = pastEvents.map(renderEventCard).join("");
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
    render();
    renderCalendar();
    scheduleEventRefresh();
  }, nextDay.getTime() - now.getTime() + 50);
}

function renderEventCard(event) {
  const eventGoals = state.goals.filter((goal) => goal.eventId === event.id);
  const typeLabel = {
    holiday: "長期休暇",
    regular_exam: "定期試験",
    mock_exam: "模擬試験",
    other: "その他",
  }[event.type] || "その他";
  const eventDates = event.start && event.end
    ? `${formatDate(event.start)} — ${formatDate(event.end)}`
    : "日程未設定";
  return `<article class="event-card">
    <div class="event-heading">
      <div class="card-top"><div><p class="card-title">${escapeHtml(event.title)}</p><p class="card-subtitle">${eventDates}</p></div>
        <span class="badge">${typeLabel}</span>
      </div>
      <div class="event-actions"><button class="text-button icon-action" type="button" data-edit-event="${escapeHtml(event.id)}" aria-label="イベントを編集" title="編集">✏️</button><button class="text-button icon-action delete-button" type="button" data-delete-event="${escapeHtml(event.id)}" aria-label="イベントを削除" title="削除">🗑️</button><button class="button button-secondary button-small" type="button" data-add-goal="${escapeHtml(event.id)}">＋ 長期計画を追加</button></div>
    </div>
    <div class="event-goals">${eventGoals.length
      ? eventGoals.map((goal) => renderGoalCard(goal)).join("")
      : `<p class="muted-empty">このイベントの長期計画はまだありません。</p>`}
    </div>
  </article>`;
}

function renderGoalCard(goal) {
  const total = goal.total * goal.laps;
  const completed = goalProgress(goal);
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const lap = Math.min(goal.laps, Math.floor(completed / goal.total) + 1);
  const status = completed >= total ? "完了" : `${lap}周目 / ${goal.laps}周`;
  const deadline = goal.deadline ? `期限 ${formatDate(goal.deadline)}` : "期限なし";
  const submissionDate = goal.submissionDate ? ` ・ 提出 ${formatDate(goal.submissionDate)}` : "";
  return `<article class="goal-card">
    <div class="card-top"><div><p class="card-title">${escapeHtml(goal.title)}</p><p class="card-subtitle">${escapeHtml(goal.subject || "科目未設定")} ・ ${escapeHtml(goal.total)} ${escapeHtml(goal.unit)} × ${escapeHtml(goal.laps)}周 ・ ${deadline}${submissionDate}</p></div>
      <div class="goal-actions"><span class="badge${percent === 100 ? " complete" : ""}">${status}</span><button class="text-button icon-action" type="button" data-edit-goal="${escapeHtml(goal.id)}" aria-label="長期計画を編集" title="編集">✏️</button><button class="text-button icon-action delete-button" type="button" data-delete-goal="${escapeHtml(goal.id)}" aria-label="長期計画を削除" title="削除">🗑️</button></div>
    </div>
    <div class="progress-track" role="progressbar" aria-label="${escapeHtml(goal.title)}の進捗" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${percent}%"></div></div>
    <div class="progress-meta"><span>${completed} / ${total} ${escapeHtml(goal.unit)}</span><span>${percent}%</span></div>
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
      scope: "長期計画の提出日",
      period: null,
      eventId: goal.eventId,
    }));
  return [...state.quizzes, ...goalSubmissions]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.period || 99) - (b.period || 99));
}

function renderQuizzes() {
  const quizzes = getScheduledQuizzes();
  elements.quizzesEmpty.hidden = quizzes.length > 0;
  elements.quizzes.innerHTML = quizzes.map((quiz) => {
    const event = state.events.find((item) => item.id === quiz.eventId);
    const actions = quiz.sourceGoalId
      ? `<button class="text-button icon-action" type="button" data-edit-goal="${escapeHtml(quiz.sourceGoalId)}" aria-label="長期計画を編集" title="編集">✏️</button>`
      : `<button class="text-button icon-action" type="button" data-edit-quiz="${escapeHtml(quiz.id)}" aria-label="予定を編集" title="編集">✏️</button>
         <button class="text-button" type="button" data-add-quiz-task="${escapeHtml(quiz.id)}"${state.tasks.some((task) => task.quizId === quiz.id && task.date === today) ? " disabled" : ""}>${state.tasks.some((task) => task.quizId === quiz.id && task.date === today) ? "ToDo作成済み" : "今日のToDoへ"}</button>
         <button class="text-button icon-action" type="button" data-duplicate-quiz="${escapeHtml(quiz.id)}" aria-label="予定を複製" title="複製">📑</button>
         <button class="text-button icon-action delete-button" type="button" data-delete-quiz="${escapeHtml(quiz.id)}" aria-label="予定を削除" title="削除">🗑️</button>`;
    return `<article class="quiz-card">
      <div class="quiz-info">
        <p class="card-title">${escapeHtml(quiz.title || "小テスト・提出物")}</p>
        <p class="card-subtitle">${escapeHtml(quiz.scope || (quiz.sourceGoalId ? "長期計画の提出日" : "範囲未設定"))}${quiz.unit ? ` ${escapeHtml(quiz.unit)}` : ""}</p>
        <div class="quiz-meta"><span>${formatDate(quiz.date, { month: "numeric", day: "numeric", weekday: "short" })}</span>${quiz.period ? `<strong>${quiz.period}<span>校時</span></strong>` : ""}<span class="badge">${escapeHtml(quiz.subject)}</span><span class="badge">${quiz.kind === "submission" ? "提出物" : "小テスト"}</span>${event ? `<span class="badge">${escapeHtml(event.title)}</span>` : ""}</div>
      </div>
      <div class="quiz-actions">${actions}</div>
    </article>`;
  }).join("");
}

function getSchedulesForDate(date) {
  const events = state.events
    .filter((event) => event.start && event.end && event.start <= date && event.end >= date)
    .map((event) => ({ kind: "event", event }));
  const quizzes = getScheduledQuizzes()
    .filter((quiz) => quiz.date === date)
    .map((quiz) => ({ kind: "quiz", quiz }));
  return [...events, ...quizzes];
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
      const schedules = getSchedulesForDate(date);
      const quizzes = schedules.filter((schedule) => schedule.kind === "quiz").map((schedule) => schedule.quiz);
      const isToday = date === today;
      const selected = date === selectedCalendarDate;
      const scheduleCount = schedules.length;
      const studySeconds = getStudySecondsForDate(date);
      const studyMinutes = Math.floor(studySeconds / 60);
      const heatLevel = studyHeatLevel(studySeconds);
      cells.push(`<button class="calendar-cell${isToday ? " is-today" : ""}${selected ? " is-selected" : ""}${heatLevel ? ` study-level-${heatLevel}` : ""}" type="button" role="gridcell" data-calendar-date="${date}" aria-label="${formatDate(date, { year: "numeric", month: "long", day: "numeric", weekday: "long" })}${scheduleCount ? `、予定${scheduleCount}件` : ""}${studySeconds ? `、勉強時間${formatDuration(studySeconds)}` : ""}" aria-pressed="${selected}">
        <span class="calendar-day-number">${Number(date.slice(-2))}</span>
        ${quizzes.slice(0, 2).map((quiz) => `<span class="calendar-marker quiz">${escapeHtml(quiz.subject)}${quiz.period ? ` ${quiz.period}校時` : ""} ${quiz.kind === "submission" ? "提出物" : "小テスト"}</span>`).join("")}
        ${quizzes.length > 2 ? `<span class="calendar-marker-more">ほか${quizzes.length - 2}件</span>` : ""}
        ${studyMinutes ? `<span class="calendar-study-time" title="勉強時間 ${formatDuration(studySeconds)}">${formatCalendarDuration(studySeconds)}</span>` : ""}
      </button>`);
    }

    const overlappingEvents = state.events
      .filter((item) => item.start && item.end && item.start <= weekEnd && item.end >= weekStart && item.start <= monthEnd && item.end >= monthStart)
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
}

function renderCalendarAgenda() {
  const date = selectedCalendarDate;
  const schedules = getSchedulesForDate(date);
  elements.calendarAgendaTitle.textContent = formatDate(date, { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  elements.calendarAgendaEmpty.hidden = schedules.length > 0;
  elements.calendarAgenda.innerHTML = schedules.map((schedule) => {
    if (schedule.kind === "event") {
      return `<article class="agenda-item agenda-event"><span class="agenda-kind">イベント</span><strong>${escapeHtml(schedule.event.title)}</strong></article>`;
    }
    const quiz = schedule.quiz;
    const scope = quiz.scope ? `範囲: ${escapeHtml(quiz.scope)}${quiz.unit ? ` ${escapeHtml(quiz.unit)}` : ""}` : "範囲未設定";
    const kind = quiz.kind === "submission" ? "提出物" : "小テスト";
    const period = quiz.period ? ` ・ ${quiz.period}校時` : "";
    const event = state.events.find((item) => item.id === quiz.eventId);
    return `<article class="agenda-item agenda-quiz"><span class="agenda-kind">${kind}</span><p>${escapeHtml(quiz.subject)}${period} ・ ${escapeHtml(quiz.title || kind)} ・ ${scope}${event ? ` ・ ${escapeHtml(event.title)}` : ""}</p></article>`;
  }).join("");
  const studyTasks = state.tasks
    .filter((task) => task.date === date)
    .map((task) => ({ task, seconds: getTaskStudySeconds(task) }))
    .filter(({ task, seconds }) => seconds > 0 || task.actual > 0)
    .sort((a, b) => b.seconds - a.seconds || a.task.title.localeCompare(b.task.title));
  const totalSeconds = getStudySecondsForDate(date);
  elements.calendarStudyTotal.textContent = `合計 ${formatDuration(totalSeconds)}`;
  elements.calendarStudyEmpty.hidden = studyTasks.length > 0;
  elements.calendarStudyList.innerHTML = studyTasks.map(({ task, seconds }) => {
    const pool = state.pools.find((item) => item.id === task.poolId);
    const title = pool?.title || task.title;
    const subject = pool?.subject || task.subject || "科目未設定";
    const amount = task.actual > 0 ? `実績 ${task.actual} ${pool?.unit || task.unit || ""}` : "実績なし";
    return `<article class="calendar-study-item"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subject)} ・ ${amount}</span></div><time>${formatDuration(seconds)}</time></article>`;
  }).join("");
}

function renderPools() {
  elements.poolsEmpty.hidden = state.pools.length > 0;
  const pools = [...state.pools].sort((a, b) => a.start.localeCompare(b.start));
  elements.pools.innerHTML = pools.map((pool) => {
    const remaining = Math.max(0, pool.target - pool.completed);
    const percent = pool.target ? Math.min(100, Math.round(pool.completed / pool.target * 100)) : 0;
    const active = pool.status === "active";
    const buttons = active
      ? `<button class="text-button" type="button" data-add-task="${escapeHtml(pool.id)}">＋ 今日のToDoへ</button>
         <button class="text-button" type="button" data-carry-pool="${escapeHtml(pool.id)}"${remaining === 0 ? " disabled" : ""}>残りを繰り越す</button>`
      : `<span class="badge">終了</span>`;
    return `<article class="pool-card">
      <div class="card-top"><div><p class="card-title">${escapeHtml(pool.title)}</p><p class="card-subtitle">${escapeHtml(pool.subject || "科目未設定")} ・ ${escapeHtml(pool.goalTitle)}から</p></div>
        <span class="badge${remaining === 0 ? " complete" : ""}">${remaining === 0 ? "達成" : `残り ${remaining} ${escapeHtml(pool.unit)}`}</span>
      </div>
      <div class="progress-track" role="progressbar" aria-label="${escapeHtml(pool.title)}の進捗" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${percent}%"></div></div>
      <div class="progress-meta"><span>${pool.completed} / ${pool.target} ${escapeHtml(pool.unit)} 完了</span><span>${percent}%</span></div>
      <div class="card-footer"><span class="date-range">${formatDate(pool.start)} — ${formatDate(pool.end)}</span><div class="pool-actions"><button class="text-button icon-action" type="button" data-edit-pool="${escapeHtml(pool.id)}" aria-label="週間プールを編集" title="編集">✏️</button>${buttons}</div></div>
    </article>`;
  }).join("");
}

function renderPoolOptions() {
  const select = elements.poolDialog.querySelector('[name="goalId"]');
  const activeGoals = state.goals.filter((goal) => goal.completed < goal.total * goal.laps);
  select.innerHTML = activeGoals.length
    ? activeGoals.map((goal) => {
      const event = state.events.find((item) => item.id === goal.eventId);
      return `<option value="${escapeHtml(goal.id)}">${escapeHtml(event?.title || "イベント未設定")} — ${escapeHtml(goal.subject || "科目未設定")} / ${escapeHtml(goal.title)}</option>`;
    }).join("")
    : `<option value="">先にイベント内に長期計画を追加してください</option>`;
  elements.poolDialog.querySelector('[type="submit"]').disabled = activeGoals.length === 0;
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
  dialog.close();
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
  state.tasks = state.tasks.filter((task) => !poolIds.has(task.poolId));
  saveState();
}

function deleteGoal(goalId) {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal) return;
  const poolIds = new Set(state.pools.filter((pool) => pool.goalId === goalId).map((pool) => pool.id));
  if (!window.confirm(`「${goal.title}」と、その週間プール・関連する今日のToDoを削除します。この操作は取り消せません。`)) return;
  state.goals = state.goals.filter((item) => item.id !== goalId);
  state.pools = state.pools.filter((pool) => !poolIds.has(pool.id));
  state.tasks = state.tasks.filter((task) => !poolIds.has(task.poolId));
  saveState();
}

function deleteQuiz(quizId) {
  const quiz = state.quizzes.find((item) => item.id === quizId);
  if (!quiz) return;
  if (!window.confirm(`「${quiz.title || "小テスト・提出物"}」と、そこから作成した今日のToDoを削除します。この操作は取り消せません。`)) return;
  state.quizzes = state.quizzes.filter((item) => item.id !== quizId);
  state.tasks = state.tasks.filter((task) => task.quizId !== quizId);
  saveState();
}

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
  }
  if (form) showError(form, "");
  if (dialog === elements.completeDialog) {
    pendingTaskRecord = null;
    document.querySelector("#task-record-inputs").hidden = false;
    document.querySelector("#task-record-actions").hidden = false;
    document.querySelector("#task-outcome").hidden = true;
  }
  if (dialog === elements.poolDialog) {
    form.elements.goalId.disabled = false;
    form.elements.goalId.required = true;
    form.elements.start.value = today;
    form.elements.end.value = shiftDate(today, 6);
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
  if (dialog === elements.settingsDialog) renderSettingsForm();
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
  if (event.target.closest(".menu-button")) {
    elements.menuDialog.showModal();
    return;
  }
  if (event.target.closest("[data-menu-record]")) {
    openRecordingView();
    return;
  }
  if (event.target.closest("[data-record-home]")) {
    selectingRecordingTask = false;
    elements.recordingView.hidden = true;
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
    const pool = state.pools.find((item) => item.id === task.poolId);
    const title = pool?.title || task.title;
    document.querySelector("#complete-task-title").textContent = `${title} — 計測 ${formatDuration(elapsedSeconds)} ・ 最低 ${task.minimum} ${pool?.unit || task.unit}`;
    elements.completeDialog.querySelector(".modal-heading h2").textContent = "勉強記録を終了";
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
    elements.menuDialog.close();
    calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    selectedCalendarDate = today;
    renderCalendar();
    elements.dashboard.hidden = true;
    elements.recordingView.hidden = true;
    document.body.classList.remove("recording-fullscreen");
    elements.calendarView.hidden = false;
    window.scrollTo({ top: 0 });
    return;
  }
  if (event.target.closest("[data-menu-home]")) {
    elements.menuDialog.close();
    elements.calendarView.hidden = true;
    elements.recordingView.hidden = true;
    document.body.classList.remove("recording-fullscreen");
    elements.dashboard.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (event.target.closest("[data-calendar-home]")) {
    elements.calendarView.hidden = true;
    elements.recordingView.hidden = true;
    document.body.classList.remove("recording-fullscreen");
    elements.dashboard.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
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
  const addSettingSubject = event.target.closest("[data-add-setting-subject]");
  if (addSettingSubject) {
    const rows = elements.settingsSubjects.querySelectorAll(".settings-subject-row");
    if (rows.length >= MAX_SUBJECTS) return;
    elements.settingsSubjects.insertAdjacentHTML("beforeend", settingsSubjectRow());
    elements.settingsDialog.querySelector("[data-add-setting-subject]").disabled = rows.length + 1 >= MAX_SUBJECTS;
    elements.settingsSubjects.querySelector(".settings-subject-row:last-child input").focus();
    return;
  }
  const removeSettingSubject = event.target.closest("[data-remove-setting-subject]");
  if (removeSettingSubject) {
    removeSettingSubject.closest(".settings-subject-row").remove();
    elements.settingsDialog.querySelector("[data-add-setting-subject]").disabled = false;
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
  if (editEventButton) {
    const item = state.events.find((eventItem) => eventItem.id === editEventButton.dataset.editEvent);
    if (!item) return;
    const form = openEditDialog(elements.eventDialog, item, "イベントを編集", "変更を保存");
    form.elements.title.value = item.title;
    form.elements.type.value = item.type;
    form.elements.start.value = item.start;
    form.elements.end.value = item.end;
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
    form.elements.unit.value = item.unit;
    form.elements.total.value = item.total;
    form.elements.laps.value = item.laps;
    form.elements.deadline.value = item.deadline || "";
    form.elements.submissionDate.value = item.submissionDate || "";
    const parentEvent = state.events.find((eventItem) => eventItem.id === item.eventId);
    document.querySelector("#goal-event-title").textContent = `${parentEvent?.title || "イベント未設定"} の長期計画`;
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
    form.elements.goalId.disabled = true;
    form.elements.goalId.required = false;
    form.elements.target.value = item.target;
    form.elements.start.value = item.start;
    form.elements.end.value = item.end;
    return;
  }
  const editTaskButton = event.target.closest("[data-edit-task]");
  if (editTaskButton) {
    const item = state.tasks.find((task) => task.id === editTaskButton.dataset.editTask);
    if (!item) return;
    const form = openEditDialog(elements.taskDialog, item, "今日の最低ラインを編集", "変更を保存");
    form.elements.poolId.value = item.poolId || "";
    form.elements.minimum.value = item.minimum;
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
    if (!quiz || state.tasks.some((task) => task.quizId === quiz.id && task.date === today)) return;
    state.tasks.push({
      id: createId(),
      quizId: quiz.id,
      title: quiz.title || (quiz.kind === "submission" ? "提出物" : "小テスト"),
      subject: quiz.subject,
      scope: quiz.scope || "",
      scopeUnit: quiz.unit || "",
      unit: quiz.kind === "submission" ? (quiz.unit || "件") : "回",
      minimum: 1,
      actual: 0,
      date: today,
      completed: false,
    });
    saveState();
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
    return;
  }
  const completeButton = event.target.closest("[data-complete-task]");
  if (completeButton) {
    const task = state.tasks.find((item) => item.id === completeButton.dataset.completeTask);
    if (!task || task.completed) return;
    const pool = state.pools.find((item) => item.id === task.poolId);
    const form = document.querySelector("#complete-form");
    form.elements.taskId.value = task.id;
    form.elements.actual.value = Math.max(0, task.minimum - (task.actual || 0));
    document.querySelector("#complete-task-title").textContent = `${task.title} — 最低 ${task.minimum} ${pool?.unit || task.unit}`;
    openDialog(elements.completeDialog);
    form.elements.taskId.value = task.id;
    form.elements.actual.value = Math.max(0, task.minimum - (task.actual || 0));
    return;
  }
  const outcomeButton = event.target.closest("[data-task-outcome]");
  if (outcomeButton) {
    if (!pendingTaskRecord) return;
    commitTaskRecord(pendingTaskRecord.taskId, pendingTaskRecord.amount, outcomeButton.dataset.taskOutcome === "complete");
    pendingTaskRecord = null;
    recordingEndTaskId = null;
    const form = elements.completeDialog.querySelector("form");
    saveStateAndClose(elements.completeDialog, form);
    return;
  }
  const carryButton = event.target.closest("[data-carry-pool]");
  if (carryButton) carryPool(carryButton.dataset.carryPool);
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
  saveStateAndClose(elements.quizDialog, form);
});

const eventForm = document.querySelector("#event-form");
eventForm.elements.start.addEventListener("input", () => {
  const { start, end } = eventForm.elements;
  if (start.value && (!end.value || end.value <= start.value)) {
    end.value = shiftDate(start.value, 1);
  }
});

eventForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const title = String(data.get("title")).trim();
  const start = String(data.get("start"));
  const end = String(data.get("end"));
  if (!title || start > end) {
    showError(form, "イベント名と期間を正しく入力してください。");
    return;
  }
  const updatedEvent = {
    id: form.dataset.editId || createId(),
    title,
    type: String(data.get("type")),
    start,
    end,
  };
  if (form.dataset.editId) {
    const index = state.events.findIndex((item) => item.id === form.dataset.editId);
    if (index < 0) {
      showError(form, "編集するイベントが見つかりません。");
      return;
    }
    state.events[index] = updatedEvent;
  } else {
    state.events.push(updatedEvent);
  }
  saveStateAndClose(elements.eventDialog, form);
});

document.querySelector("#goal-form").addEventListener("submit", (event) => {
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
    unit: String(data.get("unit")).trim(),
    total: Number(data.get("total")),
    laps: Number(data.get("laps")),
    completed: 0,
    deadline: String(data.get("deadline") || ""),
    submissionDate: String(data.get("submissionDate") || ""),
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
    });
  } else {
    state.goals.push(goal);
  }
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
  if (!form.dataset.editId && (!goal || goal.completed >= goal.total * goal.laps)) {
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
  } else {
    state.pools.push({
      id: createId(), eventId: goal.eventId, goalId: goal.id, goalTitle: goal.title, title: goal.title, subject: goal.subject,
      unit: goal.unit, start, end, target, completed: 0, status: "active",
    });
  }
  saveStateAndClose(elements.poolDialog, form);
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
  } else {
    state.tasks.push({ id: createId(), poolId: pool.id, title: pool.title, subject: pool.subject, unit: pool.unit, minimum, date: today, completed: false });
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
  const endingStudy = task && recordingEndTaskId === task.id;
  if (!task || (task.completed && !endingStudy) || !Number.isSafeInteger(actual) || actual < 0) {
    showError(form, "実績量を0以上の整数で入力してください。");
    return;
  }
  if (task.completed) {
    task.actual = (task.actual || 0) + actual;
    recordingEndTaskId = null;
    saveStateAndClose(elements.completeDialog, form);
    return;
  }
  if (!taskMeetsMinimum(task, actual)) {
    commitTaskRecord(task.id, actual, false);
    recordingEndTaskId = null;
    saveStateAndClose(elements.completeDialog, form);
    return;
  }
  pendingTaskRecord = { taskId: task.id, amount: actual };
  document.querySelector("#task-record-inputs").hidden = true;
  document.querySelector("#task-record-actions").hidden = true;
  document.querySelector("#task-outcome").hidden = false;
});

function commitTaskRecord(taskId, amount, complete) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || task.completed) return;
  task.actual = (task.actual || 0) + amount;
  task.completed = complete;
  const pool = state.pools.find((item) => item.id === task.poolId);
  if (!pool) return;
  pool.completed += amount;
  const goal = state.goals.find((item) => item.id === pool.goalId);
  if (goal) goal.completed = Math.min(goal.total * goal.laps, goal.completed + amount);
}

elements.completeDialog.addEventListener("close", () => {
  pendingTaskRecord = null;
  recordingEndTaskId = null;
});

function carryPool(poolId) {
  const pool = state.pools.find((item) => item.id === poolId);
  if (!pool || pool.status !== "active") return;
  const remaining = Math.max(0, pool.target - pool.completed);
  if (!remaining) return;
  const nextStart = shiftDate(pool.end, 1);
  pool.status = "closed";
  state.pools.push({
    ...pool,
    id: createId(),
    start: nextStart,
    end: shiftDate(nextStart, 6),
    target: remaining,
    completed: 0,
    status: "active",
  });
  saveState();
}

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

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
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("オフライン機能を有効にできませんでした。", error);
    });
  });
}
