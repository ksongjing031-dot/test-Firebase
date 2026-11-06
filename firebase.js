// =====================================================
// firebase.js  ―― Firebaseとやりとりする部分をここにまとめる
//   ・Authentication（アカウント）
//   ・Cloud Firestore（ランキング）
// =====================================================

// Firebase の SDK を CDN から読み込む（npm などのインストールは不要）
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

// ---- 初期化 ----
const app = initializeApp(firebaseConfig); // Firebaseプロジェクトに接続
const auth = getAuth(app);                 // アカウント機能
const db = getFirestore(app);              // データベース

// =====================================================
// アカウント（Authentication）
// =====================================================

/** 新規登録：メール＋パスワードでアカウントを作り、ニックネームを保存 */
export async function signUp(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  return cred.user;
}

/** ログイン */
export async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

/** ログアウト */
export function logOut() {
  return signOut(auth);
}

/** ログイン状態が変わるたびに callback(user) を呼ぶ（未ログインなら user は null） */
export function watchUser(callback) {
  return onAuthStateChanged(auth, callback);
}

// =====================================================
// ランキング（Cloud Firestore）
// データの形：
//   scores（コレクション）
//     └ {ユーザーID}（ドキュメント）
//          name: "ニックネーム"
//          best: 123            ← 自己ベスト
//          updatedAt: 日時
// =====================================================

/**
 * スコアを保存する（自己ベストを超えたときだけ書き込む）
 * @returns {{updated:boolean, best:number}}
 */
export async function saveScore(score) {
  const user = auth.currentUser;
  if (!user) throw new Error("ログインしていません");

  const ref = doc(db, "scores", user.uid);
  const snap = await getDoc(ref);
  const oldBest = snap.exists() ? snap.data().best : -1;

  if (score <= oldBest) {
    return { updated: false, best: oldBest };
  }

  await setDoc(ref, {
    name: user.displayName || "名無し",
    best: score,
    updatedAt: serverTimestamp(),
  });
  return { updated: true, best: score };
}

/** ランキング上位を取得する */
export async function fetchRanking(count = 10) {
  const q = query(collection(db, "scores"), orderBy("best", "desc"), limit(count));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

// =====================================================
// エラーを日本語にする
// =====================================================
export function toJapaneseError(err) {
  const messages = {
    "auth/email-already-in-use": "このメールアドレスはすでに登録されています",
    "auth/invalid-email": "メールアドレスの形式が正しくありません",
    "auth/weak-password": "パスワードは6文字以上にしてください",
    "auth/password-does-not-meet-requirements": "パスワードが条件を満たしていません",
    "auth/invalid-credential": "メールアドレスかパスワードが違います",
    "auth/user-not-found": "メールアドレスかパスワードが違います",
    "auth/wrong-password": "メールアドレスかパスワードが違います",
    "auth/missing-password": "パスワードを入力してください",
    "auth/too-many-requests": "試行回数が多すぎます。少し待ってからもう一度お試しください",
    "auth/network-request-failed": "ネットワークに接続できません",
    "auth/operation-not-allowed": "メール/パスワードのログインが有効になっていません（Firebaseコンソールで有効にしてください）",
    "auth/configuration-not-found": "Authenticationがまだ設定されていません（Firebaseコンソールで「始める」を押してください）",
    "auth/unauthorized-domain": "このドメインは許可されていません（Authentication → 設定 → 承認済みドメイン）",
    "auth/invalid-api-key": "firebase-config.js の apiKey が正しくありません",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "firebase-config.js の apiKey が正しくありません",
    "permission-denied": "権限がありません（Firestoreのセキュリティルールを確認してください）",
    "unavailable": "データベースに接続できません",
    "not-found": "Firestoreのデータベースがまだ作られていません",
  };
  return messages[err.code] || err.message || String(err);
}
