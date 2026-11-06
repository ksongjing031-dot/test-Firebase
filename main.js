// =====================================================
// main.js  ―― 画面の切り替えとボタンの処理
//   game.js（ゲーム本体）と firebase.js（Firebase）をつなぐ役
// =====================================================
import { StairsGame } from "./game.js";
import {
  signUp,
  logIn,
  logOut,
  watchUser,
  saveScore,
  fetchRanking,
  toJapaneseError,
} from "./firebase.js";

const $ = (id) => document.getElementById(id);

let currentUser = null; // ログイン中のユーザー（未ログインなら null）

// ---------- 画面切り替え ----------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => {
    el.classList.toggle("active", el.id === id);
  });
}

// =====================================================
// アカウント
// =====================================================

// ログイン状態が変わったら表示を更新（ページを開いた時も1回呼ばれる）
watchUser((user) => {
  currentUser = user;
  renderUser();
  loadRanking(); // 自分の行を目立たせるため再読み込み
});

function renderUser() {
  const loggedIn = !!currentUser;
  $("loggedOut").hidden = loggedIn;
  $("loggedIn").hidden = !loggedIn;
  $("guestNote").hidden = loggedIn;
  if (loggedIn) {
    $("userName").textContent = currentUser.displayName || "名無し";
  }
}

function setAuthMsg(text, type = "") {
  const el = $("authMsg");
  el.textContent = text;
  el.className = "msg " + type;
}

// 「新規登録」「ログイン」タブの切り替え
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    $("signupForm").hidden = tab.dataset.tab !== "signupForm";
    $("loginForm").hidden = tab.dataset.tab !== "loginForm";
    setAuthMsg("");
  });
});

// 新規登録
$("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault(); // フォーム送信でページが再読み込みされるのを防ぐ
  const button = e.submitter;
  const name = $("signupName").value.trim();
  if (!name) return setAuthMsg("ニックネームを入力してください", "error");

  button.disabled = true;
  setAuthMsg("登録中…");
  try {
    currentUser = await signUp(name, $("signupEmail").value, $("signupPassword").value);
    renderUser(); // ニックネームを表示に反映
    setAuthMsg("登録しました！ようこそ " + name + " さん", "ok");
    e.target.reset();
  } catch (err) {
    setAuthMsg(toJapaneseError(err), "error");
  } finally {
    button.disabled = false;
  }
});

// ログイン
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.submitter;
  button.disabled = true;
  setAuthMsg("ログイン中…");
  try {
    await logIn($("loginEmail").value, $("loginPassword").value);
    setAuthMsg("ログインしました", "ok");
    e.target.reset();
  } catch (err) {
    setAuthMsg(toJapaneseError(err), "error");
  } finally {
    button.disabled = false;
  }
});

// ログアウト
$("logoutBtn").addEventListener("click", async () => {
  await logOut();
  setAuthMsg("ログアウトしました");
});

// =====================================================
// ランキング
// =====================================================
async function loadRanking() {
  const list = $("rankingList");
  try {
    const rows = await fetchRanking(10);
    list.innerHTML = "";
    if (rows.length === 0) {
      list.innerHTML = '<li class="empty">まだ記録がありません</li>';
      return;
    }
    for (const row of rows) {
      const li = document.createElement("li");
      if (currentUser && row.uid === currentUser.uid) li.classList.add("me");
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = row.name; // textContent を使うと名前に<タグ>が入っても安全
      const score = document.createElement("span");
      score.className = "score";
      score.textContent = row.best + " 段";
      li.append(name, score);
      list.append(li);
    }
  } catch (err) {
    list.innerHTML = "";
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "ランキングを読み込めません：" + toJapaneseError(err);
    list.append(li);
  }
}

// =====================================================
// ゲーム
// =====================================================
const game = new StairsGame($("canvas"), handleGameOver);

function startGame() {
  $("overlay").hidden = true;
  showScreen("game");
  game.start();
}

async function handleGameOver(score, reason) {
  $("reason").textContent = reason;
  $("finalScore").textContent = score;
  $("overlay").hidden = false;

  const msg = $("saveMsg");
  msg.className = "msg";
  if (!currentUser) {
    msg.textContent = "ログインするとランキングに記録されます";
    return;
  }
  msg.textContent = "記録を保存中…";
  try {
    const result = await saveScore(score);
    if (result.updated) {
      msg.textContent = `自己ベスト更新！ ${result.best} 段`;
      msg.classList.add("ok");
    } else {
      msg.textContent = `自己ベスト：${result.best} 段`;
    }
  } catch (err) {
    msg.textContent = "保存できませんでした：" + toJapaneseError(err);
    msg.classList.add("error");
  }
}

$("startBtn").addEventListener("click", startGame);
$("retryBtn").addEventListener("click", startGame);
$("homeBtn").addEventListener("click", () => {
  game.stop();
  showScreen("home");
  loadRanking();
});

// ゲームオーバー画面で Enter を押すともう一度
window.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !$("overlay").hidden && $("game").classList.contains("active")) {
    startGame();
  }
});

// スマホ用の ← → ボタン
document.querySelectorAll(".touch-btn").forEach((btn) => {
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    game.move(Number(btn.dataset.dir));
  });
});
