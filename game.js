// =====================================================
// game.js  ―― 階段ゲーム本体（Firebaseとは無関係の部分）
// =====================================================

// ---- 画面と見た目の設定 ----
const W = 400;          // キャンバスの論理的な幅
const H = 600;          // キャンバスの論理的な高さ
const STEP_X = 44;      // 1段登るごとに横へ進む距離
const STEP_Y = 34;      // 1段登るごとに上へ進む距離
const STAIR_W = 58;     // 段の幅
const STAIR_H = 14;     // 段の厚み
const PLAYER_SCREEN_Y = H * 0.66; // プレイヤーを画面のどの高さに表示するか

// ---- 難易度の設定 ----
const TIME_MAX = 100;   // 時間ゲージの最大値
const TIME_GAIN = 7;    // 1段登るごとに回復する量
const FALL_SECONDS = 1.0; // 落下アニメーションの長さ

// 時間ゲージが1秒あたりに減る量（スコアが上がるほど速くなる）
function drainRate(score) {
  return Math.min(15 + score * 0.2, 70);
}

// 階段が曲がる確率（高く登るほど曲がりやすくなる）
function turnChance(stairIndex) {
  return Math.min(0.12 + stairIndex * 0.0025, 0.5);
}

export class StairsGame {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {(score:number, reason:string) => void} onGameOver ゲームオーバー時に呼ばれる
   */
  constructor(canvas, onGameOver) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onGameOver = onGameOver;
    this.running = false;

    // 高解像度ディスプレイでもくっきり描画する
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 背景の星（位置をランダムに決めておく）
    this.stars = Array.from({ length: 45 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: Math.random() < 0.3 ? 2 : 1,
    }));

    // this を固定しておく（イベントやrequestAnimationFrameで使うため）
    this.loop = this.loop.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  // ---------- ゲーム開始・終了 ----------

  start() {
    // 階段データ：stairs[i].x が i段目の横位置（1マス単位）
    this.stairs = [{ x: 0 }];
    this.genDir = 1; // 階段を生成するときの今の向き
    for (let i = 0; i < 40; i++) this.addStair();

    this.index = 0;          // プレイヤーが立っている段の番号
    this.facing = 1;         // プレイヤーの向き（-1:左 / 1:右）
    this.score = 0;
    this.time = TIME_MAX;
    this.started = false;    // 最初のキー入力までは時間が減らない
    this.state = "playing";  // "playing" → "falling" → "over"
    this.reason = "";

    const p = this.standPos(0);
    this.player = { x: p.x, y: p.y };   // 描画上のプレイヤー位置
    this.cam = { x: p.x, y: p.y };      // カメラ位置
    this.fall = { vx: 0, vy: 0, t: 0 };

    window.addEventListener("keydown", this.onKeyDown);
    this.lastTime = performance.now();
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(this.loop);
    }
  }

  stop() {
    this.running = false;
    window.removeEventListener("keydown", this.onKeyDown);
  }

  // ---------- 階段の生成 ----------

  addStair() {
    const n = this.stairs.length;
    const last = this.stairs[n - 1];
    // 最初の数段はまっすぐ。それ以降はランダムで曲がる
    if (n > 3 && Math.random() < turnChance(n)) {
      this.genDir *= -1;
    }
    this.stairs.push({ x: last.x + this.genDir });
  }

  // i段目の上に立ったときの足元の座標（ワールド座標）
  standPos(i) {
    return { x: this.stairs[i].x * STEP_X, y: -i * STEP_Y };
  }

  // ---------- 入力 ----------

  onKeyDown(e) {
    if (e.repeat) return; // 押しっぱなしで連続入力されないように
    if (e.key === "ArrowLeft") { e.preventDefault(); this.move(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); this.move(1); }
  }

  /** dir: -1 = 左上へ / 1 = 右上へ */
  move(dir) {
    if (this.state !== "playing") return;
    this.started = true;
    this.facing = dir;

    const cur = this.stairs[this.index];
    const next = this.stairs[this.index + 1];

    if (next.x === cur.x + dir) {
      // 正解：1段登る
      this.index++;
      this.score++;
      this.time = Math.min(TIME_MAX, this.time + TIME_GAIN);
      // 先の階段が足りなくならないよう補充
      while (this.stairs.length < this.index + 40) this.addStair();
    } else {
      // 不正解：段がない方向へ踏み出して落下
      this.startFall(dir, "踏み外した！");
    }
  }

  startFall(dir, reason) {
    this.state = "falling";
    this.reason = reason;
    this.fall = { vx: dir * 110, vy: -260, t: 0 }; // 少し跳ねてから落ちる
  }

  // ---------- 毎フレームの処理 ----------

  loop(now) {
    if (!this.running) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.05); // 経過秒（重い時は上限）
    this.lastTime = now;
    this.update(dt);
    this.draw();
    requestAnimationFrame(this.loop);
  }

  update(dt) {
    if (this.state === "playing") {
      // 時間ゲージを減らす
      if (this.started) {
        this.time -= drainRate(this.score) * dt;
        if (this.time <= 0) {
          this.time = 0;
          this.startFall(this.facing, "時間切れ！");
        }
      }
      // プレイヤーを今の段へなめらかに移動
      const target = this.standPos(this.index);
      const k = 1 - Math.pow(0.000001, dt);
      this.player.x += (target.x - this.player.x) * k;
      this.player.y += (target.y - this.player.y) * k;
    } else if (this.state === "falling") {
      // 重力で落下
      this.fall.vy += 1500 * dt;
      this.player.x += this.fall.vx * dt;
      this.player.y += this.fall.vy * dt;
      this.fall.t += dt;
      if (this.fall.t >= FALL_SECONDS) {
        this.state = "over";
        this.onGameOver(this.score, this.reason);
      }
      return; // 落下中はカメラを止める
    }

    // カメラはプレイヤーを少し遅れて追いかける
    const c = 1 - Math.pow(0.001, dt);
    this.cam.x += (this.player.x - this.cam.x) * c;
    this.cam.y += (this.player.y - this.cam.y) * c;
  }

  // ---------- 描画 ----------

  draw() {
    const ctx = this.ctx;

    // 背景：登るほど空の色が変わっていく
    const hue = (230 + this.score * 0.6) % 360;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `hsl(${hue}, 55%, 14%)`);
    g.addColorStop(1, `hsl(${(hue + 40) % 360}, 55%, 32%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    this.drawStars();

    // ここからワールド座標（カメラに合わせてずらす）
    ctx.save();
    ctx.translate(W / 2 - this.cam.x, PLAYER_SCREEN_Y - this.cam.y);

    const from = Math.max(0, this.index - 16);
    const to = Math.min(this.stairs.length - 1, this.index + 22);
    for (let i = from; i <= to; i++) this.drawStair(i);
    this.drawPlayer();

    ctx.restore();

    this.drawHud();
  }

  drawStars() {
    // カメラに合わせてゆっくり動く星（パララックス）
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (const s of this.stars) {
      // ((a % b) + b) % b でマイナスにならない余りを出す（画面の端でループさせる）
      const x = (((s.x - this.cam.x * 0.15) % W) + W) % W;
      const y = (((s.y - this.cam.y * 0.15) % H) + H) % H;
      ctx.fillRect(x, y, s.size, s.size);
    }
  }

  drawStair(i) {
    const ctx = this.ctx;
    const p = this.standPos(i);
    const hue = (40 + i * 2) % 360;
    // 側面
    ctx.fillStyle = `hsl(${hue}, 45%, 38%)`;
    ctx.beginPath();
    ctx.roundRect(p.x - STAIR_W / 2, p.y, STAIR_W, STAIR_H, 4);
    ctx.fill();
    // 上面（明るい色）
    ctx.fillStyle = i % 10 === 0 && i > 0 ? "#ffe27a" : `hsl(${hue}, 70%, 68%)`;
    ctx.beginPath();
    ctx.roundRect(p.x - STAIR_W / 2, p.y, STAIR_W, 5, [4, 4, 0, 0]);
    ctx.fill();
    // 10段ごとに段数を表示
    if (i % 10 === 0 && i > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(i, p.x, p.y + 13);
    }
  }

  drawPlayer() {
    const ctx = this.ctx;
    const { x, y } = this.player; // 足元の位置
    const f = this.facing;

    // 体
    ctx.fillStyle = "#ff6b9a";
    ctx.beginPath();
    ctx.roundRect(x - 11, y - 26, 22, 24, 8);
    ctx.fill();
    // 足
    ctx.fillStyle = "#3a2350";
    ctx.fillRect(x - 8, y - 4, 6, 4);
    ctx.fillRect(x + 2, y - 4, 6, 4);
    // 頭
    ctx.fillStyle = "#ffe0c2";
    ctx.beginPath();
    ctx.arc(x, y - 36, 12, 0, Math.PI * 2);
    ctx.fill();
    // 目（向いている方向に寄せる）
    ctx.fillStyle = "#2a1a33";
    ctx.beginPath();
    ctx.arc(x + f * 4, y - 37, 2.2, 0, Math.PI * 2);
    ctx.arc(x + f * 9, y - 37, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHud() {
    const ctx = this.ctx;

    // 上部を少し暗くしてスコアを読みやすくする
    const shade = ctx.createLinearGradient(0, 0, 0, 120);
    shade.addColorStop(0, "rgba(0,0,0,0.45)");
    shade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, 120);

    // スコア
    ctx.textAlign = "center";
    ctx.font = "800 46px 'M PLUS Rounded 1c', sans-serif";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.strokeText(this.score, W / 2, 62);
    ctx.fillStyle = "#fff";
    ctx.fillText(this.score, W / 2, 62);

    // 時間ゲージ
    const bw = 240, bh = 12, bx = (W - bw) / 2, by = 80;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6);
    ctx.fill();
    const ratio = this.time / TIME_MAX;
    ctx.fillStyle = ratio > 0.5 ? "#6be3a5" : ratio > 0.25 ? "#ffcf4a" : "#ff6b6b";
    ctx.beginPath();
    ctx.roundRect(bx, by, Math.max(bw * ratio, 0.1), bh, 6);
    ctx.fill();

    // スタート前のヒント
    if (!this.started && this.state === "playing") {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "bold 18px 'M PLUS Rounded 1c', sans-serif";
      ctx.fillText("← → キーで登ろう！", W / 2, H - 40);
    }
  }
}
