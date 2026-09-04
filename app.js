// ==========================================================
// みんなのToDoリスト
// Firebase Firestore を使って、パソコン・スマホ間でリアルタイムに
// 同じデータを共有するToDo管理アプリ
// ==========================================================

const CURRENT_MEMBER_KEY = "yaritaiList_currentMemberId";
const SHOW_COMPLETED_KEY = "yaritaiList_showCompleted";
const ONLY_MINE_KEY = "yaritaiList_onlyMine";

let members = [];   // [{id, name}]
let tasks = [];      // [{id, title, dueDate, memo, assigneeIds, checks, completed, completedByName, ...}]
let db = null;
let firebaseReady = false;
let editingTaskId = null; // nullなら新規追加モード

// ---------------------------------------------------------
// 初期化
// ---------------------------------------------------------
function init() {
  const isPlaceholder = !firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY";

  if (isPlaceholder) {
    document.getElementById("setupBanner").hidden = false;
    document.getElementById("appArea").hidden = true;
    return;
  }

  document.getElementById("setupBanner").hidden = true;
  document.getElementById("appArea").hidden = false;

  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();

  setStatus("connecting");

  firebase.auth().signInAnonymously().catch((err) => {
    console.error(err);
    setStatus("offline");
    alert("Firebaseへの接続に失敗しました。firebase-config.jsの設定内容と、匿名認証が有効になっているかをご確認ください。\n\n" + err.message);
  });

  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      firebaseReady = true;
      setStatus("online");
      attachListeners();
    }
  });

  restoreUiPrefs();
  bindStaticEvents();
}

function setStatus(state) {
  const dot = document.getElementById("statusDot");
  const label = document.getElementById("statusLabel");
  dot.className = "status-dot" + (state === "online" ? " online" : state === "offline" ? " offline" : "");
  label.textContent =
    state === "online" ? "同期中(オンライン)" :
    state === "offline" ? "接続エラー" : "接続中...";
}

// ---------------------------------------------------------
// Firestore購読
// ---------------------------------------------------------
function attachListeners() {
  db.collection("members").orderBy("createdAt", "asc").onSnapshot((snap) => {
    members = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderMemberSelect();
    renderMemberList();
    render();
  }, (err) => console.error("members listener error", err));

  db.collection("tasks").onSnapshot((snap) => {
    tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => console.error("tasks listener error", err));
}

// ---------------------------------------------------------
// UI状態の保存・復元
// ---------------------------------------------------------
function restoreUiPrefs() {
  const showCompleted = localStorage.getItem(SHOW_COMPLETED_KEY) === "true";
  const onlyMine = localStorage.getItem(ONLY_MINE_KEY) === "true";
  document.getElementById("showCompletedToggle").checked = showCompleted;
  document.getElementById("onlyMineToggle").checked = onlyMine;
}

function getCurrentMemberId() {
  return localStorage.getItem(CURRENT_MEMBER_KEY) || "";
}

// ---------------------------------------------------------
// イベント登録(静的な要素)
// ---------------------------------------------------------
function bindStaticEvents() {
  document.getElementById("addTaskButton").addEventListener("click", () => openTaskModal(null));
  document.getElementById("manageMembersButton").addEventListener("click", () => openMemberModal());

  document.getElementById("currentMemberSelect").addEventListener("change", (e) => {
    localStorage.setItem(CURRENT_MEMBER_KEY, e.target.value);
    render();
  });

  document.getElementById("showCompletedToggle").addEventListener("change", (e) => {
    localStorage.setItem(SHOW_COMPLETED_KEY, e.target.checked);
    render();
  });
  document.getElementById("onlyMineToggle").addEventListener("change", (e) => {
    localStorage.setItem(ONLY_MINE_KEY, e.target.checked);
    render();
  });
  document.getElementById("searchInput").addEventListener("input", render);

  document.getElementById("taskForm").addEventListener("submit", onSubmitTask);
  document.getElementById("taskCancelButton").addEventListener("click", closeTaskModal);
  document.getElementById("taskModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "taskModalOverlay") closeTaskModal();
  });

  document.getElementById("memberCloseButton").addEventListener("click", closeMemberModal);
  document.getElementById("memberModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "memberModalOverlay") closeMemberModal();
  });
  document.getElementById("memberAddForm").addEventListener("submit", onAddMember);
}

// ---------------------------------------------------------
// メンバー選択(自分は誰か)
// ---------------------------------------------------------
function renderMemberSelect() {
  const select = document.getElementById("currentMemberSelect");
  const current = getCurrentMemberId();
  select.innerHTML =
    '<option value="">-- 選択してください --</option>' +
    members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
  select.value = members.some((m) => m.id === current) ? current : "";
}

// ---------------------------------------------------------
// メンバー管理モーダル
// ---------------------------------------------------------
function openMemberModal() {
  renderMemberList();
  document.getElementById("memberModalOverlay").hidden = false;
}
function closeMemberModal() {
  document.getElementById("memberModalOverlay").hidden = true;
}

function renderMemberList() {
  const area = document.getElementById("memberListArea");
  if (!area) return;
  if (members.length === 0) {
    area.innerHTML = '<p style="color:#999;font-size:13px;">まだメンバーがいません。下から追加してください。</p>';
    return;
  }
  area.innerHTML = members
    .map(
      (m) => `
      <div class="member-row">
        <input type="text" value="${escapeHtml(m.name)}" onchange="renameMember('${m.id}', this.value)">
        <button type="button" class="btn-danger btn-small" onclick="deleteMember('${m.id}')">削除</button>
      </div>
    `
    )
    .join("");
}

function onAddMember(e) {
  e.preventDefault();
  const input = document.getElementById("memberNameInput");
  const name = input.value.trim();
  if (!name) return;
  db.collection("members")
    .add({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() })
    .catch((err) => alert("追加に失敗しました: " + err.message));
  input.value = "";
  input.focus();
}

function renameMember(id, newName) {
  const name = newName.trim();
  if (!name) return;
  db.collection("members").doc(id).update({ name }).catch((err) => alert("更新に失敗しました: " + err.message));
}

function deleteMember(id) {
  const name = members.find((m) => m.id === id)?.name || "";
  if (!confirm(`「${name}」をメンバーから削除しますか?\n(このメンバーが割り当てられているToDoからも外れます)`)) return;
  db.collection("members").doc(id).delete().catch((err) => alert("削除に失敗しました: " + err.message));
}

// ---------------------------------------------------------
// タスク追加・編集モーダル
// ---------------------------------------------------------
function openTaskModal(taskId) {
  editingTaskId = taskId;
  const task = taskId ? tasks.find((t) => t.id === taskId) : null;

  document.getElementById("taskModalTitle").textContent = task ? "ToDoを編集" : "新しいToDoを追加";
  document.getElementById("inputTitle").value = task ? task.title : "";
  document.getElementById("inputDueDate").value = task ? task.dueDate || "" : "";
  document.getElementById("inputMemo").value = task ? task.memo || "" : "";

  const assigneeIds = task ? task.assigneeIds || [] : [];
  const picker = document.getElementById("assigneePicker");
  if (members.length === 0) {
    picker.innerHTML = '<p style="color:#999;font-size:13px;">先に「メンバー管理」からメンバーを追加してください。</p>';
  } else {
    picker.innerHTML = members
      .map(
        (m) => `
        <label>
          <input type="checkbox" value="${m.id}" ${assigneeIds.includes(m.id) ? "checked" : ""}>
          ${escapeHtml(m.name)}
        </label>
      `
      )
      .join("");
  }

  document.getElementById("taskModalOverlay").hidden = false;
  document.getElementById("inputTitle").focus();
}

function closeTaskModal() {
  document.getElementById("taskModalOverlay").hidden = true;
  editingTaskId = null;
  document.getElementById("taskForm").reset();
}

function onSubmitTask(e) {
  e.preventDefault();
  const title = document.getElementById("inputTitle").value.trim();
  const dueDate = document.getElementById("inputDueDate").value;
  const memo = document.getElementById("inputMemo").value.trim();
  const assigneeIds = Array.from(document.querySelectorAll("#assigneePicker input:checked")).map((el) => el.value);

  if (!title) {
    alert("タイトルを入力してください。");
    return;
  }
  if (assigneeIds.length === 0) {
    alert("対象者を1人以上選んでください。");
    return;
  }

  if (editingTaskId) {
    const task = tasks.find((t) => t.id === editingTaskId);
    const prevChecks = task ? task.checks || {} : {};
    // 対象者から外れた人のチェックは消し、残った人のチェックは保持する
    const checks = {};
    assigneeIds.forEach((id) => {
      checks[id] = !!prevChecks[id];
    });
    db.collection("tasks")
      .doc(editingTaskId)
      .update({ title, dueDate, memo, assigneeIds, checks })
      .catch((err) => alert("更新に失敗しました: " + err.message));
  } else {
    const checks = {};
    assigneeIds.forEach((id) => (checks[id] = false));
    db.collection("tasks")
      .add({
        title,
        dueDate,
        memo,
        assigneeIds,
        checks,
        completed: false,
        completedByName: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .catch((err) => alert("追加に失敗しました: " + err.message));
  }

  closeTaskModal();
}

function deleteTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!confirm(`「${task ? task.title : "このToDo"}」を削除しますか?`)) return;
  db.collection("tasks").doc(id).delete().catch((err) => alert("削除に失敗しました: " + err.message));
}

// ---------------------------------------------------------
// チェック・完了操作
// ---------------------------------------------------------
function toggleCheck(taskId, memberId, checked) {
  db.collection("tasks")
    .doc(taskId)
    .update({ [`checks.${memberId}`]: checked })
    .catch((err) => alert("更新に失敗しました: " + err.message));
}

function completeTask(taskId) {
  const meId = getCurrentMemberId();
  const meName = meId ? memberName(meId) : "";
  db.collection("tasks")
    .doc(taskId)
    .update({
      completed: true,
      completedByName: meName || "(未選択)",
      completedAt: firebase.firestore.FieldValue.serverTimestamp(),
    })
    .catch((err) => alert("更新に失敗しました: " + err.message));
}

function reopenTask(taskId) {
  db.collection("tasks")
    .doc(taskId)
    .update({ completed: false, completedByName: null, completedAt: null })
    .catch((err) => alert("更新に失敗しました: " + err.message));
}

// ---------------------------------------------------------
// 表示ロジック
// ---------------------------------------------------------
function memberName(id) {
  const m = members.find((mm) => mm.id === id);
  return m ? m.name : "(削除済み)";
}

function getTaskStatus(task) {
  const assigneeIds = task.assigneeIds || [];
  if (task.completed) {
    return { key: "done", label: "対応完了" + (task.completedByName ? `(${task.completedByName})` : "") };
  }
  const checks = task.checks || {};
  const doneCount = assigneeIds.filter((id) => checks[id]).length;
  if (doneCount === 0) return { key: "todo", label: "未対応" };
  if (doneCount === assigneeIds.length) return { key: "ready", label: "全員チェック済み" };
  return { key: "progress", label: `対応中(${doneCount}/${assigneeIds.length})` };
}

function getDueCellClass(task, status) {
  if (status.key === "done") return "due-done";
  if (!task.dueDate) return "";
  const due = new Date(task.dueDate + "T23:59:59");
  const now = new Date();
  const diffDays = (due - now) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "due-overdue";
  if (diffDays <= 2) return "due-soon";
  return "";
}

function formatDate(dateStr) {
  if (!dateStr) return "未設定";
  const [y, m, d] = dateStr.split("-");
  return `${y}/${m}/${d}`;
}

function getVisibleTasks() {
  const showCompleted = document.getElementById("showCompletedToggle").checked;
  const onlyMine = document.getElementById("onlyMineToggle").checked;
  const meId = getCurrentMemberId();
  const q = document.getElementById("searchInput").value.trim().toLowerCase();

  let list = tasks.slice();
  if (!showCompleted) list = list.filter((t) => !t.completed);
  if (onlyMine && meId) list = list.filter((t) => (t.assigneeIds || []).includes(meId));
  if (q) {
    list = list.filter(
      (t) => (t.title || "").toLowerCase().includes(q) || (t.memo || "").toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  return list;
}

function render() {
  if (!firebaseReady) return;

  const tbody = document.getElementById("taskTableBody");
  const emptyMessage = document.getElementById("emptyMessage");
  const meId = getCurrentMemberId();
  const list = getVisibleTasks();

  if (list.length === 0) {
    tbody.innerHTML = "";
    emptyMessage.hidden = false;
    emptyMessage.textContent = tasks.length === 0 ? "まだToDoがありません。「＋ 新しいToDoを追加」から作成しましょう。" : "条件に一致するToDoはありません。";
    return;
  }
  emptyMessage.hidden = true;

  tbody.innerHTML = list
    .map((task) => {
      const status = getTaskStatus(task);
      const dueClass = getDueCellClass(task, status);
      const assigneeIds = task.assigneeIds || [];
      const checks = task.checks || {};

      const assigneeHtml = assigneeIds
        .map((id) => {
          const checked = !!checks[id];
          const isMe = id === meId;
          return `
            <label class="assignee-chip ${checked ? "checked" : ""} ${isMe ? "me" : ""}">
              <input type="checkbox" ${checked ? "checked" : ""} ${task.completed ? "disabled" : ""}
                onchange="toggleCheck('${task.id}','${id}', this.checked)">
              ${escapeHtml(memberName(id))}
            </label>
          `;
        })
        .join("");

      const badgeClass =
        status.key === "done" ? "badge-done" :
        status.key === "ready" ? "badge-ready" :
        status.key === "progress" ? "badge-progress" : "badge-todo";

      let statusExtra = "";
      if (status.key === "ready") {
        statusExtra = `<button type="button" class="btn-complete btn-small" onclick="completeTask('${task.id}')">✅ 対応完了にする</button>`;
      } else if (status.key === "done") {
        statusExtra = `<button type="button" class="btn-secondary btn-small" onclick="reopenTask('${task.id}')">差し戻す</button>`;
      }

      const rowClass = task.completed ? "row-completed" : "";

      return `
        <tr class="${rowClass}">
          <td class="col-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</td>
          <td class="col-due ${dueClass}">${formatDate(task.dueDate)}</td>
          <td><div class="assignee-list">${assigneeHtml}</div></td>
          <td>
            <div class="status-cell">
              <span class="badge ${badgeClass}">${status.label}</span>
              ${statusExtra}
            </div>
          </td>
          <td class="memo-cell" title="${escapeHtml(task.memo || "")}">${escapeHtml(task.memo || "")}</td>
          <td>
            <div class="actions-cell">
              <button type="button" class="btn-secondary btn-small" onclick="openTaskModal('${task.id}')">編集</button>
              <button type="button" class="btn-danger btn-small" onclick="deleteTask('${task.id}')">削除</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

// ---------------------------------------------------------
init();
