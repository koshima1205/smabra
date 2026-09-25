/**
 * ステージの絵作り（背景・足場・前景・ステージ選択サムネイル）。
 *
 * - 背景（画面空間）: 静的な遠景はオフスクリーンに一度だけ描いてキャッシュし、
 *   毎フレームは視差でずらして drawImage するだけ。動くのは少数の要素のみ。
 * - 足場（ワールド空間）: カメラ変換済みの ctx に直接描く。上面は必ず y に一致させる。
 * - 前景（画面空間）: ファイターの上に重なる薄い粒子。視認性を優先して低アルファ。
 *
 * 背景は「デザイン単位」で描く: 1280x720 の画面を基準に s 倍、画面中心が原点。
 */
import { clamp, hash32, Rng } from '../core/math';
import type { Camera } from '../game/camera';
import { platformAt } from '../game/stage';
import type { StageDef } from '../game/types';

type Ctx = CanvasRenderingContext2D;
type Surface = HTMLCanvasElement | OffscreenCanvas;
type Stop = [number, string];
interface Pt {
  x: number;
  y: number;
}
interface View {
  x: number;
  y: number;
  zoom: number;
}

const TAU = Math.PI * 2;
/** 背景の縦視差の基準となるカメラ y（地上戦の典型値） */
const Y_REF = -150;

// ─────────────────────────────────────────────────────────────
// オフスクリーン & キャッシュ
// ─────────────────────────────────────────────────────────────

function makeSurface(w: number, h: number): { c: Surface; g: Ctx } {
  const cw = Math.max(1, Math.ceil(w));
  const ch = Math.max(1, Math.ceil(h));
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const g = c.getContext('2d');
    if (g) return { c, g };
  }
  const c = new OffscreenCanvas(cw, ch);
  return { c, g: c.getContext('2d') as unknown as Ctx };
}

/** 背景レイヤーに焼き込んだ灯り（毎フレーム揺らめかせて加算で重ねる） */
interface Light {
  x: number;
  y: number;
  r: number;
  rgb: string;
  a: number;
  ph: number;
}

interface Entry {
  c: Surface;
  px: number;
  used: number;
  lights: Light[];
}

const cache = new Map<string, Entry>();
let cachePx = 0;
/** キャッシュの総ピクセル上限（超えたら最近使っていないものから捨てる） */
const CACHE_BUDGET = 36e6;
const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function cached(key: string, w: number, h: number, paint: (g: Ctx, lights: Light[]) => void): Entry {
  const t = nowMs();
  const hit = cache.get(key);
  if (hit) {
    hit.used = t;
    return hit;
  }
  const { c, g } = makeSurface(w, h);
  const lights: Light[] = [];
  paint(g, lights);
  const e: Entry = { c, px: c.width * c.height, used: t, lights };
  cache.set(key, e);
  cachePx += e.px;
  if (cachePx > CACHE_BUDGET) trimCache(t);
  return e;
}

function trimCache(t: number): void {
  // 直近 1.5 秒に使われたもの（＝今表示中のもの）は捨てない
  const old = [...cache.entries()].filter(([, e]) => t - e.used > 1500).sort((a, b) => a[1].used - b[1].used);
  for (const [k, e] of old) {
    if (cachePx <= CACHE_BUDGET * 0.75) break;
    cache.delete(k);
    cachePx -= e.px;
  }
}

// ─────────────────────────────────────────────────────────────
// 色・グラデーション
// ─────────────────────────────────────────────────────────────

const rgba = (rgb: string, a: number): string => `rgba(${rgb},${clamp(a, 0, 1).toFixed(3)})`;

function linGrad(g: Ctx, x0: number, y0: number, x1: number, y1: number, stops: Stop[]): CanvasGradient {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(clamp(o, 0, 1), c);
  return gr;
}

function radGrad(g: Ctx, x: number, y: number, r0: number, r1: number, stops: Stop[]): CanvasGradient {
  const gr = g.createRadialGradient(x, y, r0, x, y, Math.max(r0 + 0.01, r1));
  for (const [o, c] of stops) gr.addColorStop(clamp(o, 0, 1), c);
  return gr;
}

/** 縦グラデ。stops の位置は y 座標そのもの */
function yGrad(g: Ctx, stops: Stop[]): CanvasGradient {
  const y0 = stops[0][0];
  const y1 = stops[stops.length - 1][0];
  const span = y1 - y0 || 1;
  const gr = g.createLinearGradient(0, y0, 0, y0 + span);
  for (const [y, c] of stops) gr.addColorStop(clamp((y - y0) / span, 0, 1), c);
  return gr;
}

/** 横グラデ。stops の位置は x 座標そのもの */
function xGrad(g: Ctx, stops: Stop[]): CanvasGradient {
  const x0 = stops[0][0];
  const x1 = stops[stops.length - 1][0];
  const span = x1 - x0 || 1;
  const gr = g.createLinearGradient(x0, 0, x0 + span, 0);
  for (const [x, c] of stops) gr.addColorStop(clamp((x - x0) / span, 0, 1), c);
  return gr;
}

/** 柔らかい光の玉（加算合成用のスプライト） */
function glowSprite(rgb: string): Surface {
  return cached(`glow:${rgb}`, 64, 64, (g) => {
    g.fillStyle = radGrad(g, 32, 32, 0, 32, [
      [0, rgba(rgb, 1)],
      [0.18, rgba(rgb, 0.62)],
      [0.45, rgba(rgb, 0.2)],
      [0.75, rgba(rgb, 0.05)],
      [1, rgba(rgb, 0)],
    ]);
    g.fillRect(0, 0, 64, 64);
  }).c;
}

function glow(ctx: Ctx, x: number, y: number, r: number, rgb: string, a: number): void {
  if (a <= 0.004 || r <= 0.5) return;
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(glowSprite(rgb), x - r, y - r, r * 2, r * 2);
}

// ─────────────────────────────────────────────────────────────
// 形のヘルパ（シルエット）
// ─────────────────────────────────────────────────────────────

const qb = (a: number, b: number, c: number, t: number): number => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
const fract = (v: number): number => v - Math.floor(v);
const wrap = (v: number, m: number): number => ((v % m) + m) % m;

/** 中点変位の 1D ノイズ（n は 2 の累乗） */
function noise1d(rng: Rng, n: number, amp: number, rough = 0.55): number[] {
  const a = new Array<number>(n + 1).fill(0);
  a[0] = rng.range(-1, 1) * amp;
  a[n] = rng.range(-1, 1) * amp;
  let step = n;
  let s = amp;
  while (step > 1) {
    const half = step >> 1;
    for (let i = half; i < n; i += step) a[i] = (a[i - half] + a[i + half]) / 2 + rng.range(-1, 1) * s;
    s *= rough;
    step = half;
  }
  return a;
}

/** 山並みの稜線: 凹カーブのピークを max 合成 + 細かいノイズ */
function mountainPts(
  rng: Rng,
  x0: number,
  x1: number,
  base: number,
  count: number,
  hMin: number,
  hMax: number,
  wMin: number,
  wMax: number,
  noise: number,
): Pt[] {
  const peaks: { x: number; h: number; w: number; p: number }[] = [];
  for (let i = 0; i < count; i++) {
    peaks.push({
      x: x0 + ((x1 - x0) * (i + rng.range(0.15, 0.85))) / count,
      h: rng.range(hMin, hMax),
      w: rng.range(wMin, wMax),
      p: rng.range(1.25, 1.9),
    });
  }
  const nz = noise1d(rng, 128, noise);
  const cnt = Math.max(8, Math.ceil((x1 - x0) / 5));
  const pts: Pt[] = [];
  for (let i = 0; i <= cnt; i++) {
    const x = x0 + ((x1 - x0) * i) / cnt;
    let hg = 0;
    for (const p of peaks) {
      const t = Math.abs(x - p.x) / p.w;
      if (t < 1) hg = Math.max(hg, p.h * Math.pow(1 - t, p.p));
    }
    const u = (i / cnt) * 128;
    const i0 = Math.min(127, Math.floor(u));
    const nv = nz[i0] + (nz[i0 + 1] - nz[i0]) * (u - i0);
    pts.push({ x, y: base - hg + nv * (0.35 + (hg / hMax) * 0.65) });
  }
  return pts;
}

function fillPts(g: Ctx, pts: Pt[], bottom: number, style: string | CanvasGradient): void {
  g.beginPath();
  g.moveTo(pts[0].x, bottom);
  for (const p of pts) g.lineTo(p.x, p.y);
  g.lineTo(pts[pts.length - 1].x, bottom);
  g.closePath();
  g.fillStyle = style;
  g.fill();
}

/** 稜線のうち光源側（dir=1: 右, -1: 左）を向いた斜面だけにリムライト */
function rimPts(g: Ctx, pts: Pt[], dir: 1 | -1, color: string, width: number): void {
  g.beginPath();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if ((b.y - a.y) * dir > 0.15) {
      g.moveTo(a.x, a.y + width * 0.4);
      g.lineTo(b.x, b.y + width * 0.4);
    }
  }
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.stroke();
}

/** もくもく雲: 影色の本体 → 各パフの上部に光のハイライト */
function cloud(
  g: Ctx,
  rng: Rng,
  cx: number,
  base: number,
  w: number,
  h: number,
  body: string,
  shade: string,
  lightRgb: string,
  lightA: number,
): void {
  const n = Math.max(3, Math.round(w / (h * 0.75)));
  const cs: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const bump = Math.sin(t * Math.PI);
    const r = h * (0.3 + 0.45 * bump) * rng.range(0.85, 1.15);
    cs.push([cx - w / 2 + w * t + rng.range(-0.25, 0.25) * r, base - r * rng.range(0.5, 0.85) - bump * h * 0.12, r]);
  }
  g.save();
  g.beginPath();
  g.rect(cx - w, base - h * 3, w * 2, h * 3);
  g.clip();
  g.beginPath();
  for (const [x, y, r] of cs) {
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, TAU);
  }
  g.fillStyle = yGrad(g, [
    [base - h, body],
    [base, shade],
  ]);
  g.fill();
  for (const [x, y, r] of cs) {
    g.fillStyle = radGrad(g, x - r * 0.15, y - r * 0.5, 0, r, [
      [0, rgba(lightRgb, lightA)],
      [0.6, rgba(lightRgb, lightA * 0.35)],
      [1, rgba(lightRgb, 0)],
    ]);
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  g.restore();
}

/** 横に流れる薄雲（夜空・夕空用） */
function wisp(g: Ctx, rng: Rng, cx: number, cy: number, w: number, h: number, top: string, bottom: string): void {
  g.beginPath();
  const n = 5 + rng.int(0, 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    const rx = w * rng.range(0.18, 0.3);
    const ry = h * rng.range(0.35, 0.6) * (1 - Math.abs(t));
    const ex = cx + t * w * 0.75;
    const ey = cy + rng.range(-0.25, 0.25) * h;
    g.moveTo(ex + rx, ey);
    g.ellipse(ex, ey, rx, Math.max(2, ry), 0, 0, TAU);
  }
  g.fillStyle = yGrad(g, [
    [cy - h * 0.5, top],
    [cy + h * 0.5, bottom],
  ]);
  g.fill();
}

/** 松のシルエット（平たい葉の層） */
function pine(g: Ctx, rng: Rng, x: number, base: number, H: number, lean: number, fill: string): void {
  const mx = x - lean * H * 0.1;
  const my = base - H * 0.42;
  const tx = x + lean * H * 0.32;
  const ty = base - H * 0.8;
  const tw = H * 0.04;
  g.fillStyle = fill;
  g.strokeStyle = fill;
  g.beginPath();
  g.moveTo(x - tw * 1.3, base + 2);
  g.quadraticCurveTo(mx - tw, my, tx - tw * 0.3, ty);
  g.lineTo(tx + tw * 0.3, ty);
  g.quadraticCurveTo(mx + tw, my, x + tw * 1.3, base + 2);
  g.closePath();
  g.fill();
  const pad = (cx: number, cy: number, w: number, h: number): void => {
    g.beginPath();
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) - 0.5;
      const rx = w * rng.range(0.16, 0.24);
      const ry = h * rng.range(0.55, 0.9) * (1.1 - Math.abs(t));
      const ex = cx + t * w * 0.85;
      const ey = cy - (0.5 - Math.abs(t)) * h * 0.6 + rng.range(-0.15, 0.15) * h;
      g.moveTo(ex + rx, ey);
      g.ellipse(ex, ey, rx, ry, 0, 0, TAU);
    }
    g.fill();
  };
  const tiers = 4 + rng.int(0, 1);
  for (let i = 0; i < tiers; i++) {
    const t = 0.38 + (i / (tiers - 1)) * 0.6;
    const px = qb(x, mx, tx, t);
    const py = qb(base, my, ty, t);
    const side = i % 2 === 0 ? -lean || 1 : lean || -1;
    const sd = side > 0 ? 1 : -1;
    const len = H * rng.range(0.2, 0.3) * (1.15 - t * 0.5);
    const ex = px + sd * len;
    const ey = py - H * rng.range(0.01, 0.05);
    g.beginPath();
    g.moveTo(px, py);
    g.quadraticCurveTo((px + ex) / 2, py + H * 0.025, ex, ey);
    g.lineWidth = H * 0.016;
    g.stroke();
    pad(ex - sd * len * 0.15, ey, len * 1.2, H * 0.08);
  }
  pad(tx, ty, H * 0.32, H * 0.09);
}

/** 反りのある屋根のパス（cx 中心、y = 軒先、w 幅、h 高さ） */
function roofPath(g: Ctx, cx: number, y: number, w: number, h: number): void {
  const hw = w / 2;
  g.moveTo(cx - hw, y - h * 0.22);
  g.quadraticCurveTo(cx - hw * 0.82, y + h * 0.04, cx - hw * 0.56, y);
  g.lineTo(cx + hw * 0.56, y);
  g.quadraticCurveTo(cx + hw * 0.82, y + h * 0.04, cx + hw, y - h * 0.22);
  g.quadraticCurveTo(cx + hw * 0.62, y - h * 0.4, cx + hw * 0.4, y - h);
  g.lineTo(cx - hw * 0.4, y - h);
  g.quadraticCurveTo(cx - hw * 0.62, y - h * 0.4, cx - hw, y - h * 0.22);
  g.closePath();
}

/** 鳥居（broken: 笠木の片側が折れて傾いた廃鳥居） */
function torii(g: Ctx, x: number, base: number, w: number, h: number, red: string, dark: string, broken = false): void {
  g.save();
  if (broken) {
    g.translate(x, base);
    g.rotate(-0.07);
    g.translate(-x, -base);
  }
  const pw = w * 0.075;
  const px = w * 0.36;
  g.fillStyle = red;
  for (const sd of [-1, 1]) {
    const topY = broken && sd === 1 ? base - h * 0.52 : base - h * 0.9;
    g.beginPath();
    g.moveTo(x + sd * (px + w * 0.025) - pw / 2, base);
    g.lineTo(x + sd * px - pw * 0.45, topY);
    if (broken && sd === 1) {
      g.lineTo(x + sd * px - pw * 0.1, topY - h * 0.05);
      g.lineTo(x + sd * px + pw * 0.15, topY + h * 0.02);
    }
    g.lineTo(x + sd * px + pw * 0.45, topY);
    g.lineTo(x + sd * (px + w * 0.025) + pw / 2, base);
    g.closePath();
    g.fill();
    // 根巻き
    g.fillStyle = dark;
    g.fillRect(x + sd * (px + w * 0.024) - pw * 0.6, base - h * 0.07, pw * 1.2, h * 0.07);
    g.fillStyle = red;
  }
  const nukiW = broken ? w * 0.5 : w * 0.96;
  g.fillRect(x - w * 0.48, base - h * 0.7, nukiW, h * 0.055);
  if (!broken) g.fillRect(x - pw * 0.35, base - h * 0.9, pw * 0.7, h * 0.2);
  // 島木 + 笠木（反り上がる黒い最上部）
  const ky = base - h * 0.9;
  const reach = broken ? 0.12 : 0.62;
  g.beginPath();
  g.moveTo(x - w * 0.6, ky - h * 0.1);
  g.quadraticCurveTo(x - w * 0.3, ky - h * 0.04, x, ky - h * 0.045);
  g.lineTo(x + w * reach * 0.5, ky - h * 0.045);
  g.lineTo(x + w * reach * 0.5, ky + h * 0.02);
  g.lineTo(x - w * 0.52, ky + h * 0.02);
  g.closePath();
  g.fill();
  if (!broken) {
    g.beginPath();
    g.moveTo(x, ky - h * 0.045);
    g.quadraticCurveTo(x + w * 0.3, ky - h * 0.04, x + w * 0.6, ky - h * 0.1);
    g.lineTo(x + w * 0.52, ky + h * 0.02);
    g.lineTo(x, ky + h * 0.02);
    g.closePath();
    g.fill();
  }
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(x - w * 0.64, ky - h * 0.15);
  g.quadraticCurveTo(x - w * 0.3, ky - h * 0.075, x, ky - h * 0.08);
  if (broken) {
    g.lineTo(x + w * 0.08, ky - h * 0.1);
    g.lineTo(x + w * 0.02, ky - h * 0.05);
  } else {
    g.quadraticCurveTo(x + w * 0.3, ky - h * 0.075, x + w * 0.64, ky - h * 0.15);
    g.lineTo(x + w * 0.6, ky - h * 0.08);
    g.quadraticCurveTo(x + w * 0.3, ky - h * 0.035, x, ky - h * 0.04);
  }
  g.quadraticCurveTo(x - w * 0.3, ky - h * 0.035, x - w * 0.6, ky - h * 0.08);
  g.closePath();
  g.fill();
  g.restore();
}

/** 天守閣のシルエット（窓の灯りを lights に登録） */
function castleKeep(g: Ctx, cx: number, base: number, sc: number, wall: string, roofC: string, rim: string, lights: Light[]): void {
  // 石垣
  g.fillStyle = roofC;
  g.beginPath();
  g.moveTo(cx - 130 * sc, base);
  g.quadraticCurveTo(cx - 108 * sc, base - 30 * sc, cx - 95 * sc, base - 58 * sc);
  g.lineTo(cx + 95 * sc, base - 58 * sc);
  g.quadraticCurveTo(cx + 108 * sc, base - 30 * sc, cx + 130 * sc, base);
  g.closePath();
  g.fill();
  const tiers = [
    { w: 170, h: 44, rw: 226, rh: 34 },
    { w: 132, h: 38, rw: 184, rh: 30 },
    { w: 100, h: 34, rw: 146, rh: 28 },
    { w: 72, h: 32, rw: 112, rh: 32 },
  ];
  let y = base - 58 * sc;
  tiers.forEach((t, i) => {
    const tw = t.w * sc;
    const th = t.h * sc;
    g.fillStyle = wall;
    g.fillRect(cx - tw / 2, y - th, tw, th);
    // 窓の灯り
    const nWin = Math.max(2, Math.round(tw / (26 * sc)));
    for (let k = 0; k < nWin; k++) {
      if ((k + i) % 3 === 1) continue;
      const wx = cx - tw / 2 + ((k + 0.5) * tw) / nWin;
      const wy = y - th * 0.55;
      g.fillStyle = '#ffb45c';
      g.fillRect(wx - 3.2 * sc, wy - 4 * sc, 6.4 * sc, 8 * sc);
      lights.push({ x: wx, y: wy, r: 16 * sc, rgb: '255,170,80', a: 0.5, ph: (k * 1.7 + i) % TAU });
    }
    const ry = y - th + t.rh * sc * 0.22;
    g.fillStyle = roofC;
    g.beginPath();
    roofPath(g, cx, ry + 6 * sc, t.rw * sc, t.rh * sc);
    g.fill();
    // 月光のリム（右側）
    g.strokeStyle = rim;
    g.lineWidth = 1.4 * sc;
    g.beginPath();
    g.moveTo(cx + t.rw * sc * 0.2, ry + 6 * sc - t.rh * sc);
    g.lineTo(cx + t.rw * sc * 0.2, ry + 6 * sc - t.rh * sc);
    g.quadraticCurveTo(cx + t.rw * sc * 0.31, ry + 6 * sc - t.rh * sc * 0.4, cx + t.rw * sc * 0.5, ry + 6 * sc - t.rh * sc * 0.22);
    g.stroke();
    y = ry - t.rh * sc * 0.55;
  });
  // 鯱
  g.fillStyle = roofC;
  for (const sd of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + sd * 20 * sc, y + 4 * sc, 4 * sc, 9 * sc, sd * 0.4, 0, TAU);
    g.fill();
  }
}

/** 五重塔のシルエット */
function pagoda(g: Ctx, cx: number, base: number, sc: number, fill: string, rim: string): void {
  g.fillStyle = fill;
  let y = base;
  for (let i = 0; i < 5; i++) {
    const bw = (58 - i * 7) * sc;
    const bh = 26 * sc;
    g.fillRect(cx - bw / 2, y - bh, bw, bh + 1);
    const rw = (118 - i * 13) * sc;
    g.beginPath();
    roofPath(g, cx, y - bh + 8 * sc, rw, 18 * sc);
    g.fill();
    g.strokeStyle = rim;
    g.lineWidth = 1.2 * sc;
    g.beginPath();
    g.moveTo(cx + rw * 0.2, y - bh + 8 * sc - 18 * sc);
    g.quadraticCurveTo(cx + rw * 0.31, y - bh + 8 * sc - 7 * sc, cx + rw * 0.5, y - bh + 8 * sc - 4 * sc);
    g.stroke();
    y -= bh + 10 * sc;
  }
  // 相輪
  g.fillRect(cx - 2 * sc, y - 70 * sc, 4 * sc, 80 * sc);
  for (let k = 0; k < 7; k++) g.fillRect(cx - 7 * sc, y - 12 * sc - k * 8 * sc, 14 * sc, 2.4 * sc);
}

/** 町家の屋根並び（右へ詰めて並べる）。灯りの窓を lights に登録 */
function rooftops(
  g: Ctx,
  rng: Rng,
  x0: number,
  x1: number,
  base: number,
  sc: number,
  wall: string,
  roofC: string,
  lights: Light[] | null,
  lightRgb: string,
): void {
  let x = x0;
  while (x < x1) {
    const w = rng.range(70, 130) * sc;
    const hWall = rng.range(26, 46) * sc;
    const cx = x + w / 2;
    const top = base - hWall;
    g.fillStyle = wall;
    g.fillRect(x + 4 * sc, top, w - 8 * sc, hWall + 400 * sc);
    g.fillStyle = roofC;
    g.beginPath();
    roofPath(g, cx, top + 4 * sc, w * 1.04, rng.range(20, 34) * sc);
    g.fill();
    if (lights && rng.chance(0.55)) {
      const wx = cx + rng.range(-0.25, 0.25) * w;
      const wy = top + hWall * 0.55;
      g.fillStyle = `rgb(${lightRgb})`;
      g.fillRect(wx - 5 * sc, wy - 4 * sc, 10 * sc, 8 * sc);
      lights.push({ x: wx, y: wy, r: 22 * sc, rgb: lightRgb, a: 0.45, ph: rng.range(0, TAU) });
    }
    x += w * rng.range(0.82, 1.0);
  }
}

// ─────────────────────────────────────────────────────────────
// 背景レイヤーの仕組み
// ─────────────────────────────────────────────────────────────

/** キャッシュ描画時の範囲（デザイン単位、画面中心が原点） */
interface Frame {
  s: number;
  xl: number;
  xr: number;
  yt: number;
  yb: number;
}

/** 毎フレーム描画用: デザイン原点の画面位置 (x, y) と倍率 u（= s * ズーム視差） */
interface Origin {
  x: number;
  y: number;
  u: number;
  w: number;
  h: number;
  /** デザイン倍率と解像度倍率（スプライトのキャッシュ用） */
  s: number;
  q: number;
}

interface LayerSpec {
  id: string;
  /** 横・縦の視差係数（遠いほど小さい） */
  f: number;
  fy: number;
  /** キャッシュする縦範囲（デザイン単位）。省略時は全面 */
  band?: [number, number];
  /** 横タイル（流れる雲）: タイル幅（デザイン単位）とドリフト速度（単位/F） */
  tile?: { width: number; speed: number };
  paint?: (g: Ctx, fr: Frame, rng: Rng, lights: Light[]) => void;
  live?: (ctx: Ctx, o: Origin, frame: number) => void;
}

function margins(f: number, fy: number, s: number): { mx: number; my: number } {
  return { mx: Math.ceil(1400 * f * s) + 6, my: Math.ceil(1000 * fy * s) + 6 };
}

function originFor(f: number, fy: number, v: View, w: number, h: number, s: number, q: number): Origin {
  const { mx, my } = margins(f, fy, s);
  const ox = clamp(-v.x * f * s, -mx, mx);
  const oy = clamp(-(v.y - Y_REF) * fy * s, -my, my);
  // ズームインで近いレイヤーほどわずかに拡大（縮小はしない＝端が見えない）
  const k = 1 + clamp((v.zoom - 0.35) / 1.05, 0, 1) * f * 0.6;
  return { x: w / 2 + ox, y: h / 2 + oy, u: s * k, w, h, s, q };
}

function drawLayer(ctx: Ctx, themeId: string, L: LayerSpec, o: Origin, w: number, h: number, s: number, q: number, frame: number): void {
  if (!L.paint) return;
  const paint = L.paint;
  const { mx, my } = margins(L.f, L.fy, s);
  const W = w + mx * 2;
  const H = h + my * 2;
  const band = L.band ?? [-1e5, 1e5];
  const top = clamp(H / 2 + band[0] * s, 0, H);
  const bot = clamp(H / 2 + band[1] * s, top + 1, H);
  const cw = L.tile ? L.tile.width * s : W;
  const key = `L:${themeId}:${L.id}:${Math.round(w)}x${Math.round(h)}@${q}`;
  const e = cached(key, cw * q, (bot - top) * q, (g, lights) => {
    g.setTransform(q * s, 0, 0, q * s, L.tile ? 0 : (q * W) / 2, q * (H / 2 - top));
    const fr: Frame = {
      s,
      xl: L.tile ? 0 : -W / 2 / s,
      xr: L.tile ? L.tile.width : W / 2 / s,
      yt: (top - H / 2) / s,
      yb: (bot - H / 2) / s,
    };
    paint(g, fr, new Rng(hash32(`${themeId}:${L.id}`)), lights);
  });
  const k = o.u / s;
  const y = o.y + (top - H / 2) * k;
  const dh = (bot - top) * k;
  if (L.tile) {
    const tw = cw * k;
    let x = o.x - frame * L.tile.speed * o.u;
    x -= Math.ceil(x / tw) * tw;
    for (; x < w; x += tw) ctx.drawImage(e.c, x, y, tw + 0.5, dh);
    return;
  }
  ctx.drawImage(e.c, o.x - (W / 2) * k, y, W * k, dh);
  if (e.lights.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const l of e.lights) {
      const fl = 0.78 + 0.14 * Math.sin(frame * 0.071 + l.ph) + 0.08 * Math.sin(frame * 0.23 + l.ph * 2.3);
      glow(ctx, o.x + l.x * o.u, o.y + l.y * o.u, l.r * o.u, l.rgb, l.a * fl);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

/** 空のグラデーション（毎フレーム、画面全面） */
function skyLayer(stops: Stop[]): LayerSpec {
  return {
    id: 'sky',
    f: 0.005,
    fy: 0.006,
    live: (ctx, o) => {
      ctx.fillStyle = yGrad(
        ctx,
        stops.map(([y, c]) => [o.y + y * o.u, c] as Stop),
      );
      ctx.fillRect(0, 0, o.w, o.h);
    },
  };
}

/** 星空（キャッシュ）: 上ほど密 */
function paintStars(g: Ctx, fr: Frame, rng: Rng, count: number, yMax: number, tint: string[]): void {
  for (let i = 0; i < count; i++) {
    const x = rng.range(fr.xl, fr.xr);
    const y = fr.yt + Math.pow(rng.next(), 1.7) * (yMax - fr.yt);
    const r = rng.chance(0.08) ? rng.range(1.1, 1.7) : rng.range(0.35, 1.0);
    g.globalAlpha = rng.range(0.25, 0.95) * (1 - Math.max(0, (y - (yMax - 160)) / 160) * 0.8);
    g.fillStyle = rng.pick(tint);
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    if (r > 1.2) {
      g.globalAlpha *= 0.35;
      g.fillRect(x - r * 4, y - 0.3, r * 8, 0.6);
      g.fillRect(x - 0.3, y - r * 4, 0.6, r * 8);
    }
  }
  g.globalAlpha = 1;
}

/** 瞬く星（毎フレーム、少数） */
function twinkles(ctx: Ctx, o: Origin, frame: number, seed: string, n: number, yMin: number, yMax: number, rgb: string): void {
  const rng = new Rng(hash32(seed));
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x = o.x + rng.range(-700, 700) * o.u;
    const y = o.y + rng.range(yMin, yMax) * o.u;
    const sp = rng.range(0.02, 0.05);
    const a = Math.max(0, Math.sin(frame * sp + rng.range(0, TAU)));
    glow(ctx, x, y, 7 * o.u, rgb, a * a * 0.9);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** デザイン単位で描くスプライトのキャッシュ（ox, oy = スプライト内の原点） */
function sprite(key: string, o: Origin, w: number, h: number, ox: number, oy: number, paint: (g: Ctx) => void): Surface {
  const sc = o.s * o.q;
  return cached(`S:${key}@${sc.toFixed(3)}`, w * sc, h * sc, (g) => {
    g.setTransform(sc, 0, 0, sc, ox * sc, oy * sc);
    paint(g);
  }).c;
}

function drawSprite(ctx: Ctx, c: Surface, o: Origin, x: number, y: number, w: number, h: number, ox: number, oy: number): void {
  ctx.drawImage(c, o.x + (x - ox) * o.u, o.y + (y - oy) * o.u, w * o.u, h * o.u);
}

// ─────────────────────────────────────────────────────────────
// 共通モチーフ: 月蝕の月・根・鬼火
// ─────────────────────────────────────────────────────────────

/** 月（blood=true で皆既の赤い月、false で部分月蝕） */
function eclipseMoon(g: Ctx, x: number, y: number, r: number, cover: number, blood: boolean): void {
  g.fillStyle = radGrad(
    g,
    x,
    y,
    r * 0.8,
    r * 3.6,
    blood
      ? [
          [0, 'rgba(255,60,40,0.55)'],
          [0.18, 'rgba(200,30,40,0.25)'],
          [0.5, 'rgba(120,10,40,0.1)'],
          [1, 'rgba(80,0,30,0)'],
        ]
      : [
          [0, 'rgba(255,238,215,0.42)'],
          [0.14, 'rgba(255,190,160,0.16)'],
          [0.45, 'rgba(150,120,190,0.07)'],
          [1, 'rgba(120,100,170,0)'],
        ],
  );
  g.beginPath();
  g.arc(x, y, r * 3.6, 0, TAU);
  g.fill();
  g.fillStyle = radGrad(
    g,
    x - r * 0.3,
    y - r * 0.3,
    0,
    r * 1.35,
    blood
      ? [
          [0, '#c8412c'],
          [0.55, '#8a1a14'],
          [1, '#3c0707'],
        ]
      : [
          [0, '#fffbf2'],
          [0.55, '#f2e7cf'],
          [1, '#c7b596'],
        ],
  );
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.clip();
  const rng = new Rng(771);
  g.fillStyle = blood ? 'rgba(30,0,0,0.22)' : 'rgba(125,115,105,0.13)';
  for (let i = 0; i < 10; i++) {
    g.beginPath();
    g.ellipse(x + rng.range(-0.65, 0.6) * r, y + rng.range(-0.6, 0.6) * r, rng.range(0.1, 0.3) * r, rng.range(0.07, 0.2) * r, rng.range(0, 3), 0, TAU);
    g.fill();
  }
  // 地球の本影（左下から差し込む）
  const R = r * 2.6;
  const d = R + r - cover * 2 * r;
  const ux = x + Math.cos(Math.PI * 0.8) * d;
  const uy = y + Math.sin(Math.PI * 0.8) * d;
  if (!blood) {
    const tot = R + r * 0.2;
    g.fillStyle = radGrad(g, ux, uy, 0, tot, [
      [0, 'rgba(46,8,8,0.95)'],
      [(R - r * 0.6) / tot, 'rgba(58,10,12,0.93)'],
      [(R - r * 0.05) / tot, 'rgba(140,40,26,0.86)'],
      [1, 'rgba(140,40,26,0)'],
    ]);
    g.fillRect(x - r, y - r, r * 2, r * 2);
  } else {
    g.fillStyle = radGrad(g, x + r * 0.25, y + r * 0.3, 0, r * 1.1, [
      [0, 'rgba(20,0,0,0.55)'],
      [1, 'rgba(20,0,0,0)'],
    ]);
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.restore();
  // 赤いリムの輝き（影側）
  g.save();
  if (!blood) {
    g.beginPath();
    g.arc(ux, uy, R + r * 0.35, 0, TAU);
    g.clip();
  }
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = radGrad(g, x, y, r * 0.9, r * 1.4, [
    [0, 'rgba(255,70,40,0)'],
    [0.2, blood ? 'rgba(255,70,50,0.6)' : 'rgba(255,90,60,0.45)'],
    [1, 'rgba(255,60,40,0)'],
  ]);
  g.beginPath();
  g.arc(x, y, r * 1.4, 0, TAU);
  g.fill();
  g.restore();
}

const cubic = (a: number, b: number, c: number, d: number, t: number): number => {
  const m = 1 - t;
  return m * m * m * a + 3 * m * m * t * b + 3 * m * t * t * c + t * t * t * d;
};
const dcubic = (a: number, b: number, c: number, d: number, t: number): number => {
  const m = 1 - t;
  return 3 * m * m * (b - a) + 6 * m * t * (c - b) + 3 * t * t * (d - c);
};

/** 先細りのねじれた根（ベジェの中心線に沿った帯） */
function root(g: Ctx, p0: Pt, c1: Pt, c2: Pt, p1: Pt, w0: number, fill: string | CanvasGradient, rim: string | null): void {
  const N = 30;
  const L: Pt[] = [];
  const R: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = cubic(p0.x, c1.x, c2.x, p1.x, t);
    const y = cubic(p0.y, c1.y, c2.y, p1.y, t);
    const dx = dcubic(p0.x, c1.x, c2.x, p1.x, t);
    const dy = dcubic(p0.y, c1.y, c2.y, p1.y, t);
    const len = Math.hypot(dx, dy) || 1;
    const wd = w0 * 0.5 * Math.pow(1 - t, 0.85) * (1 + 0.14 * Math.sin(t * 21 + w0));
    L.push({ x: x - (dy / len) * wd, y: y + (dx / len) * wd });
    R.push({ x: x + (dy / len) * wd, y: y - (dx / len) * wd });
  }
  g.beginPath();
  g.moveTo(L[0].x, L[0].y);
  for (const p of L) g.lineTo(p.x, p.y);
  for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i].x, R[i].y);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (rim) {
    g.beginPath();
    g.moveTo(R[0].x, R[0].y);
    for (const p of R) g.lineTo(p.x, p.y);
    g.strokeStyle = rim;
    g.lineWidth = Math.max(1, w0 * 0.05);
    g.stroke();
  }
}

/** 蜘蛛の巣（隅の点 cx,cy から角度 a0..a1 に張る） */
function web(g: Ctx, cx: number, cy: number, r: number, a0: number, a1: number, color: string): void {
  const spokes = 7;
  const rings = 7;
  g.strokeStyle = color;
  g.lineWidth = 0.9;
  g.beginPath();
  const da = (a1 - a0) / (spokes - 1);
  for (let i = 0; i < spokes; i++) {
    const a = a0 + da * i;
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  for (let k = 1; k <= rings; k++) {
    const rr = (r * k) / rings;
    for (let i = 0; i < spokes; i++) {
      const a = a0 + da * i;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y);
      else g.quadraticCurveTo(cx + Math.cos(a - da / 2) * rr * 0.86, cy + Math.sin(a - da / 2) * rr * 0.86, x, y);
    }
  }
  g.stroke();
}

/** 鬼火（青白い炎）。毎フレーム描く */
function onibi(ctx: Ctx, x: number, y: number, r: number, frame: number, ph: number): void {
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, r * 3.4, '80,160,255', 0.3 + 0.1 * Math.sin(frame * 0.13 + ph));
  const sway = Math.sin(frame * 0.09 + ph) * r * 0.45;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = radGrad(ctx, x, y + r * 0.25, 0, r * 1.5, [
    [0, 'rgba(240,252,255,1)'],
    [0.3, 'rgba(150,215,255,0.9)'],
    [1, 'rgba(50,100,255,0)'],
  ]);
  ctx.beginPath();
  ctx.moveTo(x + sway, y - r * 2.2);
  ctx.bezierCurveTo(x + r * 0.9, y - r * 0.8, x + r * 1.1, y + r * 0.9, x, y + r);
  ctx.bezierCurveTo(x - r * 1.1, y + r * 0.9, x - r * 0.9, y - r * 0.8, x + sway, y - r * 2.2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** 横タイル用: 位置 x とその ±T に同じものを描く（継ぎ目なし） */
function tiled(T: number, x: number, draw: (x: number) => void): void {
  draw(x);
  draw(x - T);
  draw(x + T);
}

// ─────────────────────────────────────────────────────────────
// 背景: 伊賀の里（月蝕の夜）
// ─────────────────────────────────────────────────────────────

const IGA_BG: LayerSpec[] = [
  skyLayer([
    [-360, '#05071a'],
    [-210, '#0c1233'],
    [-60, '#1b2052'],
    [60, '#2f2d5e'],
    [125, '#3c3058'],
    [360, '#111127'],
  ]),
  {
    id: 'moon',
    f: 0.012,
    fy: 0.008,
    band: [-560, 190],
    paint: (g, fr, rng) => {
      paintStars(g, fr, rng, Math.round((fr.xr - fr.xl) * 0.22), 110, ['#ffffff', '#dfe6ff', '#fff1d6', '#c9d4ff']);
      eclipseMoon(g, 300, -165, 104, 0.4, false);
    },
    live: (ctx, o, frame) => twinkles(ctx, o, frame, 'iga-tw', 14, -330, -20, '220,230,255'),
  },
  {
    id: 'cloud',
    f: 0.02,
    fy: 0.012,
    band: [-340, 70],
    tile: { width: 2600, speed: 0.09 },
    paint: (g, _fr, rng) => {
      for (let i = 0; i < 8; i++) {
        const seed = rng.int(1, 1e9);
        const cx = rng.range(0, 2600);
        const cy = rng.range(-290, 30);
        const w = rng.range(240, 560);
        const h = rng.range(20, 44);
        tiled(2600, cx, (x) => wisp(g, new Rng(seed), x, cy, w, h, 'rgba(150,160,215,0.24)', 'rgba(35,36,80,0.32)'));
      }
    },
  },
  {
    id: 'mount',
    f: 0.045,
    fy: 0.03,
    band: [-120, 1e5],
    paint: (g, fr, rng) => {
      const far = mountainPts(rng, fr.xl, fr.xr, 115, 9, 70, 160, 150, 320, 10);
      fillPts(g, far, fr.yb, yGrad(g, [
        [-40, '#2e3168'],
        [115, '#1f214a'],
      ]));
      rimPts(g, far, 1, 'rgba(175,190,255,0.28)', 1.5);
      g.fillStyle = yGrad(g, [
        [30, 'rgba(120,118,190,0)'],
        [105, 'rgba(120,118,190,0.24)'],
        [150, 'rgba(120,118,190,0)'],
      ]);
      g.fillRect(fr.xl, 30, fr.xr - fr.xl, 120);
      const near = mountainPts(rng, fr.xl, fr.xr, 160, 7, 40, 95, 160, 340, 8);
      fillPts(g, near, fr.yb, yGrad(g, [
        [70, '#1b1c42'],
        [160, '#121330'],
      ]));
      rimPts(g, near, 1, 'rgba(160,175,255,0.2)', 1.2);
    },
  },
  {
    id: 'castle',
    f: 0.09,
    fy: 0.05,
    band: [-260, 1e5],
    paint: (g, fr, rng, lights) => {
      castleKeep(g, -400, 132, 0.95, '#1e2148', '#111331', 'rgba(175,190,255,0.5)', lights);
      pagoda(g, 470, 150, 0.9, '#131534', 'rgba(175,190,255,0.42)');
      rooftops(g, rng, fr.xl, fr.xr, 182, 0.9, '#181b3c', '#0f1129', lights, '255,176,92');
    },
  },
  {
    id: 'near',
    f: 0.19,
    fy: 0.1,
    band: [-460, 1e5],
    paint: (g, fr, rng, lights) => {
      rooftops(g, rng, fr.xl, fr.xr, 318, 1.45, '#0d0e22', '#08091a', lights, '255,150,70');
      pine(g, rng, -660, 350, 560, 1, '#06070f');
      pine(g, rng, 690, 350, 480, -1, '#06070f');
    },
  },
];

// ─────────────────────────────────────────────────────────────
// 背景: 天界（金色の空・雲海・浮かぶ鳥居）
// ─────────────────────────────────────────────────────────────

function cloudSea(g: Ctx, fr: Frame, rng: Rng, T: number, base: number, rMin: number, rMax: number, c: [string, string, string], lightA: number): void {
  const puffs: [number, number, number][] = [];
  for (let x = 0; x < T; ) {
    const r = rng.range(rMin, rMax);
    puffs.push([x, base - r * rng.range(0.15, 0.55), r]);
    x += r * rng.range(0.8, 1.3);
  }
  g.beginPath();
  for (const [px, py, r] of puffs) {
    tiled(T, px, (x) => {
      g.moveTo(x + r, py);
      g.arc(x, py, r, 0, TAU);
    });
  }
  g.rect(-T, base, T * 3, fr.yb - base + 4);
  g.fillStyle = yGrad(g, [
    [base - rMax, c[0]],
    [base + rMax * 0.6, c[1]],
    [Math.max(base + rMax, fr.yb), c[2]],
  ]);
  g.fill();
  for (const [px, py, r] of puffs) {
    tiled(T, px, (x) => {
      g.fillStyle = radGrad(g, x - r * 0.2, py - r * 0.45, 0, r, [
        [0, rgba('255,252,240', lightA)],
        [0.55, rgba('255,244,225', lightA * 0.35)],
        [1, rgba('255,240,220', 0)],
      ]);
      g.beginPath();
      g.arc(x, py, r, 0, TAU);
      g.fill();
    });
  }
}

function palace(g: Ctx, cx: number, base: number, sc: number, fill: string, rim: string): void {
  g.fillStyle = fill;
  g.fillRect(cx - 90 * sc, base - 42 * sc, 180 * sc, 44 * sc);
  g.beginPath();
  roofPath(g, cx, base - 38 * sc, 260 * sc, 40 * sc);
  g.fill();
  g.fillRect(cx - 52 * sc, base - 104 * sc, 104 * sc, 30 * sc);
  g.beginPath();
  roofPath(g, cx, base - 98 * sc, 160 * sc, 36 * sc);
  g.fill();
  g.fillRect(cx - 2 * sc, base - 160 * sc, 4 * sc, 30 * sc);
  pagoda(g, cx - 160 * sc, base + 2 * sc, sc * 0.55, fill, rim);
  pagoda(g, cx + 160 * sc, base + 2 * sc, sc * 0.55, fill, rim);
}

function raysSprite(): Surface {
  return cached('rays', 512, 512, (g) => {
    const rng = new Rng(4242);
    g.translate(256, 256);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + rng.range(-0.15, 0.15);
      const wd = rng.range(0.025, 0.07);
      for (let k = 0; k < 3; k++) {
        const kw = wd * (1 + k * 0.9);
        const ka = 0.45 * (1 - k * 0.3);
        g.fillStyle = radGrad(g, 0, 0, 0, 256, [
          [0, `rgba(255,246,215,${ka})`],
          [0.45, `rgba(255,236,190,${ka * 0.3})`],
          [1, 'rgba(255,230,180,0)'],
        ]);
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, 256, a - kw, a + kw);
        g.closePath();
        g.fill();
      }
    }
  }).c;
}

const TENKAI_BG: LayerSpec[] = [
  skyLayer([
    [-360, '#6b93d6'],
    [-230, '#9db1e6'],
    [-100, '#d8c3e0'],
    [10, '#fbd6b2'],
    [80, '#ffe6b6'],
    [360, '#f3cf9c'],
  ]),
  {
    id: 'sun',
    f: 0.01,
    fy: 0.008,
    band: [-600, 420],
    paint: (g) => {
      g.fillStyle = radGrad(g, 170, -140, 0, 560, [
        [0, 'rgba(255,253,240,1)'],
        [0.07, 'rgba(255,249,225,0.95)'],
        [0.2, 'rgba(255,232,175,0.5)'],
        [0.5, 'rgba(255,212,150,0.16)'],
        [1, 'rgba(255,200,140,0)'],
      ]);
      g.fillRect(170 - 560, -140 - 560, 1120, 1120);
    },
    live: (ctx, o, frame) => {
      const R = 950 * o.u;
      ctx.save();
      ctx.translate(o.x + 170 * o.u, o.y - 140 * o.u);
      ctx.rotate(frame * 0.0005);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.09 + 0.03 * Math.sin(frame * 0.012);
      ctx.drawImage(raysSprite(), -R, -R, R * 2, R * 2);
      ctx.restore();
    },
  },
  {
    id: 'palace',
    f: 0.035,
    fy: 0.025,
    band: [-300, 240],
    paint: (g, _fr, rng) => {
      const spots: [number, number, number][] = [
        [-500, 40, 0.85],
        [430, 22, 1],
        [60, 70, 0.5],
      ];
      for (const [cx, base, sc] of spots) {
        palace(g, cx, base, sc, 'rgba(204,156,92,0.72)', 'rgba(255,238,190,0.9)');
        cloud(g, rng, cx, base + 34 * sc, 460 * sc, 80 * sc, '#fff2de', '#e8cbd0', '255,252,240', 0.85);
      }
    },
  },
  {
    id: 'sea1',
    f: 0.05,
    fy: 0.035,
    band: [0, 1e5],
    tile: { width: 2400, speed: 0.05 },
    paint: (g, fr, rng) => cloudSea(g, fr, rng, 2400, 95, 26, 60, ['#fff0dc', '#e9c9d3', '#c8b2d8'], 0.85),
  },
  {
    id: 'torii',
    f: 0.08,
    fy: 0.05,
    live: (ctx, o, frame) => {
      const c = sprite('tenkai-torii', o, 440, 400, 220, 330, (g) => {
        g.fillStyle = radGrad(g, 0, -120, 0, 210, [
          [0, 'rgba(255,225,170,0.55)'],
          [1, 'rgba(255,225,170,0)'],
        ]);
        g.fillRect(-220, -330, 440, 400);
        g.beginPath();
        g.moveTo(-120, -6);
        g.quadraticCurveTo(0, -16, 120, -6);
        g.lineTo(60, 30);
        g.lineTo(6, 66);
        g.lineTo(-50, 26);
        g.closePath();
        g.fillStyle = yGrad(g, [
          [-10, '#eadacb'],
          [66, '#9c89aa'],
        ]);
        g.fill();
        torii(g, 0, -4, 190, 200, '#e0442c', '#2b1719');
        cloud(g, new Rng(5), 0, 10, 300, 40, '#fff6ea', '#e2c8d4', '255,255,245', 0.9);
      });
      const bob = Math.sin(frame * 0.012) * 7;
      drawSprite(ctx, c, o, -455, 70 + bob, 440, 400, 220, 330);
    },
  },
  {
    id: 'sea2',
    f: 0.11,
    fy: 0.07,
    band: [80, 1e5],
    tile: { width: 2200, speed: 0.13 },
    paint: (g, fr, rng) => cloudSea(g, fr, rng, 2200, 175, 40, 90, ['#fff5e8', '#efd3d8', '#d3bde0'], 0.9),
  },
  {
    id: 'sea3',
    f: 0.2,
    fy: 0.11,
    band: [180, 1e5],
    tile: { width: 2000, speed: 0.24 },
    paint: (g, fr, rng) => cloudSea(g, fr, rng, 2000, 300, 60, 130, ['#fffaf0', '#f3dbe0', '#dcc6e6'], 0.95),
  },
];

// ─────────────────────────────────────────────────────────────
// 背景: 根の国（血の月・巨大な根・鬼火）
// ─────────────────────────────────────────────────────────────

const ONIBI_FAR: [number, number, number][] = [
  [-520, -40, 7],
  [-250, 40, 6],
  [300, -10, 7],
  [560, 60, 6],
];
const ONIBI_NEAR: [number, number, number][] = [
  [-600, -150, 11],
  [-330, -250, 9],
  [380, -220, 10],
  [620, -90, 12],
  [140, -300, 8],
];

function onibiLayer(list: [number, number, number][], seed: number): (ctx: Ctx, o: Origin, frame: number) => void {
  return (ctx, o, frame) => {
    list.forEach(([x, y, r], i) => {
      const ph = seed + i * 2.1;
      const bx = x + Math.sin(frame * 0.011 + ph) * 18;
      const by = y + Math.sin(frame * 0.023 + ph * 1.3) * 12;
      onibi(ctx, o.x + bx * o.u, o.y + by * o.u, r * 1.5 * o.u, frame, ph);
    });
  };
}

const NENO_BG: LayerSpec[] = [
  skyLayer([
    [-360, '#040207'],
    [-220, '#130512'],
    [-70, '#2c0a1c'],
    [50, '#4e0f20'],
    [120, '#3a0a18'],
    [360, '#0d0308'],
  ]),
  {
    id: 'moon',
    f: 0.01,
    fy: 0.008,
    band: [-560, 220],
    paint: (g, fr, rng) => {
      paintStars(g, fr, rng, 110, 40, ['#ffd6d6', '#ffb0b0', '#e2c4ff']);
      eclipseMoon(g, -30, -175, 92, 1, true);
    },
    live: (ctx, o, frame) => twinkles(ctx, o, frame, 'neno-tw', 8, -330, -60, '255,150,150'),
  },
  {
    id: 'smoke',
    f: 0.02,
    fy: 0.012,
    band: [-340, 90],
    tile: { width: 2400, speed: 0.12 },
    paint: (g, _fr, rng) => {
      for (let i = 0; i < 8; i++) {
        const seed = rng.int(1, 1e9);
        const cx = rng.range(0, 2400);
        const cy = rng.range(-300, 40);
        const w = rng.range(260, 600);
        const h = rng.range(22, 48);
        tiled(2400, cx, (x) => wisp(g, new Rng(seed), x, cy, w, h, 'rgba(20,6,20,0.55)', 'rgba(150,30,50,0.3)'));
      }
    },
  },
  {
    id: 'cliffs',
    f: 0.045,
    fy: 0.03,
    band: [-180, 1e5],
    paint: (g, fr, rng) => {
      const far = mountainPts(rng, fr.xl, fr.xr, 120, 12, 60, 190, 60, 150, 14);
      fillPts(g, far, fr.yb, yGrad(g, [
        [-60, '#2a0c24'],
        [120, '#1a0716'],
      ]));
      rimPts(g, far, -1, 'rgba(255,70,80,0.22)', 1.4);
      torii(g, -250, 108, 90, 90, '#12050e', '#12050e', true);
      torii(g, 360, 96, 70, 72, '#12050e', '#12050e', true);
      g.fillStyle = yGrad(g, [
        [40, 'rgba(160,20,40,0)'],
        [110, 'rgba(160,20,40,0.22)'],
        [170, 'rgba(160,20,40,0)'],
      ]);
      g.fillRect(fr.xl, 40, fr.xr - fr.xl, 130);
      const near = mountainPts(rng, fr.xl, fr.xr, 175, 9, 40, 110, 70, 170, 10);
      fillPts(g, near, fr.yb, '#12040e');
      rimPts(g, near, -1, 'rgba(255,60,70,0.16)', 1.2);
    },
  },
  { id: 'onibi-far', f: 0.07, fy: 0.045, live: onibiLayer(ONIBI_FAR, 1) },
  {
    id: 'roots',
    f: 0.11,
    fy: 0.07,
    paint: (g, fr) => {
      const top = fr.yt;
      const fill = '#120610';
      const rim = 'rgba(210,50,70,0.5)';
      // 天井から垂れる巨大な根
      root(g, { x: -760, y: top }, { x: -560, y: -250 }, { x: -700, y: -120 }, { x: -520, y: 20 }, 120, fill, rim);
      root(g, { x: -600, y: top }, { x: -430, y: -300 }, { x: -380, y: -230 }, { x: -300, y: -150 }, 60, fill, rim);
      root(g, { x: 820, y: top }, { x: 560, y: -220 }, { x: 720, y: -80 }, { x: 540, y: 60 }, 130, fill, rim);
      root(g, { x: 560, y: top }, { x: 470, y: -320 }, { x: 420, y: -260 }, { x: 360, y: -190 }, 55, fill, rim);
      root(g, { x: -120, y: top }, { x: -60, y: -330 }, { x: -170, y: -300 }, { x: -110, y: -260 }, 40, fill, rim);
      root(g, { x: 180, y: top }, { x: 230, y: -330 }, { x: 150, y: -310 }, { x: 210, y: -275 }, 34, fill, rim);
      // 下から這い上がる根
      root(g, { x: -800, y: fr.yb }, { x: -620, y: 150 }, { x: -680, y: 60 }, { x: -560, y: 0 }, 110, fill, rim);
      root(g, { x: 820, y: fr.yb }, { x: 640, y: 170 }, { x: 700, y: 90 }, { x: 600, y: 30 }, 110, fill, rim);
      web(g, fr.xl + 40, top + 40, 240, 0.05, 1.5, 'rgba(230,205,225,0.2)');
      web(g, fr.xr - 30, top + 30, 220, Math.PI - 1.45, Math.PI - 0.05, 'rgba(230,205,225,0.18)');
      web(g, -300, -150, 90, -2.6, -0.6, 'rgba(230,205,225,0.14)');
    },
  },
  {
    id: 'near',
    f: 0.19,
    fy: 0.11,
    band: [-420, 1e5],
    paint: (g, fr, rng) => {
      torii(g, 700, 330, 300, 330, '#0a0308', '#0a0308', true);
      const fl = mountainPts(rng, fr.xl, fr.xr, 360, 10, 20, 70, 60, 160, 10);
      fillPts(g, fl, fr.yb, '#08020a');
      // 石灯籠のシルエット
      for (const [x, sc] of [
        [-560, 1],
        [470, 0.8],
      ] as [number, number][]) {
        g.fillStyle = '#08020a';
        g.fillRect(x - 10 * sc, 330 - 70 * sc, 20 * sc, 70 * sc);
        g.fillRect(x - 26 * sc, 330 - 88 * sc, 52 * sc, 20 * sc);
        g.beginPath();
        roofPath(g, x, 330 - 86 * sc, 76 * sc, 26 * sc);
        g.fill();
        g.fillStyle = 'rgba(255,90,60,0.8)';
        g.fillRect(x - 8 * sc, 330 - 84 * sc, 16 * sc, 12 * sc);
      }
    },
  },
  { id: 'onibi', f: 0.14, fy: 0.08, live: onibiLayer(ONIBI_NEAR, 4) },
];

// ─────────────────────────────────────────────────────────────
// 背景: 雑賀の港（夕焼けの海・帆船・港の灯）
// ─────────────────────────────────────────────────────────────

const SUN_X = -230;
const HORIZON = 62;

function ship(g: Ctx, sc: number, sailLit: string, sailShade: string, hull: string): void {
  g.save();
  g.scale(sc, sc);
  // 船体
  g.fillStyle = hull;
  g.beginPath();
  g.moveTo(-86, -22);
  g.quadraticCurveTo(-70, 4, -40, 6);
  g.lineTo(52, 6);
  g.quadraticCurveTo(80, 2, 94, -30);
  g.lineTo(70, -18);
  g.lineTo(-60, -18);
  g.closePath();
  g.fill();
  g.fillRect(-58, -30, 110, 13);
  // 帆柱
  g.fillRect(-3, -150, 5, 130);
  // 帆（横縞入りの大きな四角帆）
  g.fillStyle = xGrad(g, [
    [-46, sailLit],
    [46, sailShade],
  ]);
  g.beginPath();
  g.moveTo(-46, -138);
  g.quadraticCurveTo(0, -146, 46, -138);
  g.quadraticCurveTo(52, -90, 44, -42);
  g.quadraticCurveTo(0, -36, -44, -42);
  g.quadraticCurveTo(-52, -90, -46, -138);
  g.fill();
  g.strokeStyle = 'rgba(70,35,50,0.35)';
  g.lineWidth = 1.5;
  g.beginPath();
  for (let i = 1; i < 6; i++) {
    const x = -46 + i * 15.3;
    g.moveTo(x, -140);
    g.lineTo(x + 1, -40);
  }
  g.stroke();
  // 旗
  g.fillStyle = '#c0392b';
  g.beginPath();
  g.moveTo(2, -150);
  g.lineTo(26, -146);
  g.lineTo(2, -140);
  g.fill();
  g.restore();
}

function kura(g: Ctx, x: number, base: number, w: number, h: number, wall: string, roofC: string): void {
  g.fillStyle = wall;
  g.fillRect(x - w / 2, base - h, w, h + 400);
  g.fillStyle = roofC;
  g.beginPath();
  roofPath(g, x, base - h + 6, w * 1.18, h * 0.42);
  g.fill();
  g.fillRect(x - w / 2, base - h * 0.34, w, h * 0.12);
}

const SAIKA_BG: LayerSpec[] = [
  skyLayer([
    [-360, '#1f1845'],
    [-240, '#422b6a'],
    [-120, '#8e4677'],
    [-30, '#dc6f5c'],
    [30, '#ffa864'],
    [HORIZON, '#ffcf8a'],
    [360, '#ffcf8a'],
  ]),
  {
    id: 'sun',
    f: 0.008,
    fy: 0.006,
    band: [-600, 260],
    paint: (g, fr, rng) => {
      paintStars(g, fr, rng, 60, -190, ['#ffffff', '#ffe6f2']);
      g.fillStyle = radGrad(g, SUN_X, 40, 0, 560, [
        [0, 'rgba(255,238,195,0.95)'],
        [0.1, 'rgba(255,205,125,0.6)'],
        [0.35, 'rgba(255,150,95,0.22)'],
        [1, 'rgba(255,120,90,0)'],
      ]);
      g.fillRect(SUN_X - 560, 40 - 560, 1120, 1120);
      g.fillStyle = radGrad(g, SUN_X, 40, 0, 60, [
        [0, '#fff7d8'],
        [0.7, '#ffd47e'],
        [1, '#ffb052'],
      ]);
      g.beginPath();
      g.arc(SUN_X, 40, 60, 0, TAU);
      g.fill();
    },
  },
  {
    id: 'streak',
    f: 0.018,
    fy: 0.01,
    band: [-340, 70],
    tile: { width: 2800, speed: 0.06 },
    paint: (g, _fr, rng) => {
      for (let i = 0; i < 9; i++) {
        const seed = rng.int(1, 1e9);
        const cx = rng.range(0, 2800);
        const cy = rng.range(-290, 10);
        const w = rng.range(320, 720);
        const h = rng.range(14, 30);
        const warm = (cy + 290) / 300;
        tiled(2800, cx, (x) =>
          wisp(g, new Rng(seed), x, cy, w, h, `rgba(${Math.round(70 + warm * 60)},${Math.round(40 + warm * 20)},${Math.round(100 - warm * 20)},0.55)`, `rgba(255,${Math.round(130 + warm * 40)},110,0.55)`),
        );
      }
    },
  },
  {
    id: 'coast',
    f: 0.035,
    fy: 0.025,
    band: [-120, HORIZON + 4],
    paint: (g, fr, rng) => {
      const left = mountainPts(rng, fr.xl, -330, HORIZON + 2, 5, 25, 85, 90, 220, 6);
      fillPts(g, left, HORIZON + 4, '#5b3766');
      const right = mountainPts(rng, 120, fr.xr, HORIZON + 2, 6, 20, 70, 90, 200, 6);
      fillPts(g, right, HORIZON + 4, '#56345f');
      rimPts(g, left, -1, 'rgba(255,190,140,0.35)', 1.2);
      rimPts(g, right, -1, 'rgba(255,190,140,0.3)', 1.2);
    },
  },
  {
    id: 'sea',
    f: 0.05,
    fy: 0.035,
    band: [HORIZON - 2, 1e5],
    paint: (g, fr, rng) => {
      g.fillStyle = yGrad(g, [
        [HORIZON, '#f4b27a'],
        [HORIZON + 22, '#d98a7c'],
        [HORIZON + 90, '#8b527f'],
        [HORIZON + 220, '#4b3572'],
        [Math.max(HORIZON + 300, fr.yb), '#241c4c'],
      ]);
      g.fillRect(fr.xl, HORIZON, fr.xr - fr.xl, fr.yb - HORIZON);
      g.fillStyle = 'rgba(255,225,170,0.6)';
      g.fillRect(fr.xl, HORIZON, fr.xr - fr.xl, 1.2);
      for (let i = 0; i < 60; i++) {
        const t = i / 60;
        const y = HORIZON + 4 + Math.pow(t, 1.7) * (fr.yb - HORIZON);
        const len = 16 + t * 150;
        const count = Math.ceil((fr.xr - fr.xl) / (len * 2.6));
        g.strokeStyle = i % 3 === 0 ? 'rgba(255,200,150,0.2)' : 'rgba(35,20,65,0.22)';
        g.lineWidth = 0.7 + t * 2.2;
        g.beginPath();
        for (let k = 0; k < count; k++) {
          const x = rng.range(fr.xl, fr.xr);
          g.moveTo(x, y);
          g.lineTo(x + len * rng.range(0.4, 1), y);
        }
        g.stroke();
      }
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 70; i++) {
        const t = rng.next();
        const y = HORIZON + 3 + Math.pow(t, 1.4) * 280;
        const wd = (12 + t * 80) * rng.range(0.4, 1.2);
        const x = SUN_X + rng.range(-1, 1) * (8 + t * 60);
        g.fillStyle = rgba('255,190,110', 0.4 * (1 - t));
        g.fillRect(x - wd / 2, y, wd, 1 + t * 3);
      }
      g.globalCompositeOperation = 'source-over';
    },
    live: (ctx, o, frame) => {
      const rng = new Rng(9090);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffd9a0';
      for (let i = 0; i < 26; i++) {
        const t = rng.next();
        const y = HORIZON + 4 + Math.pow(t, 1.3) * 240;
        const x = SUN_X + rng.range(-1, 1) * (10 + t * 70);
        const a = Math.max(0, Math.sin(frame * rng.range(0.04, 0.09) + rng.range(0, TAU)));
        const wd = (6 + t * 26) * o.u;
        ctx.globalAlpha = a * 0.55 * (1 - t * 0.6);
        ctx.fillRect(o.x + x * o.u - wd / 2, o.y + y * o.u, wd, (1 + t * 1.5) * o.u);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'ships',
    f: 0.06,
    fy: 0.04,
    live: (ctx, o, frame) => {
      const c = sprite('saika-ship', o, 200, 180, 100, 160, (g) => ship(g, 1, '#f0c49a', '#9a6070', '#2b1d36'));
      const list: [number, number, number][] = [
        [120, HORIZON + 5, 0.62],
        [440, HORIZON + 4, 0.42],
        [-560, HORIZON + 7, 0.55],
      ];
      list.forEach(([x, y, sc], i) => {
        const bob = Math.sin(frame * 0.03 + i * 2) * 1.2;
        const drift = Math.sin(frame * 0.0015 + i) * 30;
        drawSprite(ctx, c, o, x + drift - 100 * sc + 100, y + bob - 160 * sc + 160, 200 * sc, 180 * sc, 100, 160);
      });
    },
  },
  {
    id: 'docks',
    f: 0.15,
    fy: 0.09,
    band: [-200, 1e5],
    paint: (g, _fr, rng, lights) => {
      const wall = '#2a1c38';
      const roofC = '#160f22';
      kura(g, -640, 250, 150, 110, wall, roofC);
      kura(g, -500, 262, 120, 86, '#261a33', roofC);
      kura(g, 600, 258, 140, 96, wall, roofC);
      // 物見櫓
      g.fillStyle = roofC;
      g.fillRect(470, 40, 8, 230);
      g.fillRect(530, 40, 8, 230);
      g.fillRect(462, 20, 84, 36);
      g.beginPath();
      roofPath(g, 504, 24, 120, 34);
      g.fill();
      g.strokeStyle = roofC;
      g.lineWidth = 4;
      g.beginPath();
      for (let yy = 80; yy < 260; yy += 60) {
        g.moveTo(474, yy);
        g.lineTo(534, yy + 50);
        g.moveTo(534, yy);
        g.lineTo(474, yy + 50);
      }
      g.stroke();
      // 提灯
      const lamps: Pt[] = [
        { x: -690, y: 170 },
        { x: -590, y: 176 },
        { x: -470, y: 205 },
        { x: 560, y: 190 },
        { x: 650, y: 186 },
        { x: 504, y: 40 },
      ];
      for (const p of lamps) {
        g.fillStyle = '#ff9a4a';
        g.beginPath();
        g.ellipse(p.x, p.y, 6, 8, 0, 0, TAU);
        g.fill();
        lights.push({ x: p.x, y: p.y, r: 34, rgb: '255,150,70', a: 0.55, ph: rng.range(0, TAU) });
      }
      // 手前の杭
      g.fillStyle = '#140d1c';
      for (const x of [-700, -610, -520, 540, 630, 720]) g.fillRect(x - 7, 250, 14, 400);
    },
  },
  {
    id: 'gulls',
    f: 0.08,
    fy: 0.05,
    live: (ctx, o, frame) => {
      ctx.strokeStyle = 'rgba(40,24,50,0.75)';
      ctx.lineWidth = Math.max(1, 2 * o.u);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const span = 2000;
        const x = wrap(i * 430 + frame * (0.35 + i * 0.05), span) - span / 2;
        const y = -170 + i * 34 + Math.sin(frame * 0.02 + i) * 10;
        const fl = Math.sin(frame * 0.16 + i * 1.7) * 6;
        const sx = o.x + x * o.u;
        const sy = o.y + y * o.u;
        const wg = 11 * o.u;
        ctx.moveTo(sx - wg, sy - fl * o.u);
        ctx.quadraticCurveTo(sx - wg * 0.4, sy - 5 * o.u, sx, sy);
        ctx.quadraticCurveTo(sx + wg * 0.4, sy - 5 * o.u, sx + wg, sy - fl * o.u);
      }
      ctx.stroke();
    },
  },
];

// ─────────────────────────────────────────────────────────────
// 足場（ワールド空間）
// ─────────────────────────────────────────────────────────────

/** 現在の変換から見えているワールド範囲 */
function visibleRect(ctx: Ctx): { x0: number; y0: number; x1: number; y1: number } {
  const inv = ctx.getTransform().inverse();
  const a = inv.transformPoint(new DOMPoint(0, 0));
  const b = inv.transformPoint(new DOMPoint(ctx.canvas.width, ctx.canvas.height));
  return { x0: Math.min(a.x, b.x) - 10, y0: Math.min(a.y, b.y) - 10, x1: Math.max(a.x, b.x) + 10, y1: Math.max(a.y, b.y) + 10 };
}

function addGlow(ctx: Ctx, x: number, y: number, r: number, rgb: string, a: number): void {
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, r, rgb, a);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** 提灯（吊り下げ）。top = 紐の付け根 */
function lantern(ctx: Ctx, x: number, top: number, frame: number, ph: number, sc = 1): void {
  const sw = Math.sin(frame * 0.04 + ph) * 1.6 * sc;
  const lx = x + sw;
  const cy = top + 20 * sc;
  ctx.strokeStyle = '#1a120c';
  ctx.lineWidth = 1.2 * sc;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(lx, top + 10 * sc);
  ctx.stroke();
  ctx.fillStyle = radGrad(ctx, lx - 2 * sc, cy - 2 * sc, 0, 12 * sc, [
    [0, '#ffe09a'],
    [0.55, '#f27a36'],
    [1, '#a8381a'],
  ]);
  ctx.beginPath();
  ctx.ellipse(lx, cy, 8 * sc, 10 * sc, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1a120c';
  ctx.fillRect(lx - 5 * sc, cy - 11 * sc, 10 * sc, 3 * sc);
  ctx.fillRect(lx - 5 * sc, cy + 8 * sc, 10 * sc, 3 * sc);
  addGlow(ctx, lx, cy, 46 * sc, '255,150,70', 0.34 + 0.07 * Math.sin(frame * 0.09 + ph * 3));
}

// ── 伊賀: 天守の瓦屋根 ──

/** 鯱（dir=1 で頭が右向き＝ステージ内側） */
function shachi(ctx: Ctx, x: number, y: number, dir: 1 | -1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.quadraticCurveTo(27, -10, 18, -21);
  ctx.quadraticCurveTo(8, -28, 4, -36);
  ctx.quadraticCurveTo(0, -45, -9, -51);
  ctx.lineTo(-24, -62);
  ctx.lineTo(-14, -48);
  ctx.lineTo(-3, -60);
  ctx.quadraticCurveTo(-8, -38, -13, -24);
  ctx.quadraticCurveTo(-15, -8, -8, 0);
  ctx.closePath();
  ctx.fillStyle = linGrad(ctx, -20, -60, 22, 0, [
    [0, '#fff2bf'],
    [0.45, '#e4b44c'],
    [1, '#8a6118'],
  ]);
  ctx.fill();
  ctx.strokeStyle = '#3a280c';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#2a1a06';
  ctx.beginPath();
  ctx.arc(15, -15, 2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(100,66,12,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(-3 - i * 2, -10 - i * 8);
    ctx.quadraticCurveTo(3 - i * 2, -15 - i * 8, 6 - i * 3, -9 - i * 8);
  }
  ctx.stroke();
  ctx.fillStyle = '#c8962e';
  ctx.beginPath();
  ctx.moveTo(6, -18);
  ctx.lineTo(-7, -11);
  ctx.lineTo(4, -7);
  ctx.fill();
  ctx.restore();
}

function beamPlatform(ctx: Ctx, x1: number, x2: number, y: number, frame: number, i: number): void {
  const W = x2 - x1;
  ctx.fillStyle = '#26180f';
  const nb = Math.max(2, Math.round(W / 60));
  for (let k = 0; k <= nb; k++) ctx.fillRect(x1 + 10 + ((W - 20) * k) / nb - 5, y + 16, 10, 8);
  ctx.fillStyle = yGrad(ctx, [
    [y + 7, '#5a3a26'],
    [y + 18, '#2e1d13'],
  ]);
  ctx.fillRect(x1 + 4, y + 7, W - 8, 11);
  ctx.fillStyle = yGrad(ctx, [
    [y, '#a57a52'],
    [y + 8, '#6a4630'],
  ]);
  ctx.fillRect(x1, y, W, 8);
  ctx.fillStyle = '#f4e0b6';
  ctx.fillRect(x1, y, W, 1.8);
  ctx.fillStyle = '#d4ab52';
  ctx.fillRect(x1 - 2, y + 1, 8, 16);
  ctx.fillRect(x2 - 6, y + 1, 8, 16);
  lantern(ctx, x1 + W * 0.22, y + 18, frame, i * 1.3);
  lantern(ctx, x1 + W * 0.78, y + 18, frame, i * 1.3 + 2);
}

function geoIga(ctx: Ctx, st: StageDef, frame: number): void {
  const { x1, x2, y, depth } = st.main;
  const W = x2 - x1;
  const bot = y + depth;
  const eave = y + Math.min(150, depth * 0.58);
  const wallTop = eave + 24;
  // 下に続く天守の壁（装飾・フェードアウト）
  ctx.fillStyle = yGrad(ctx, [
    [bot - 10, 'rgba(80,86,122,1)'],
    [bot + 230, 'rgba(50,54,90,0)'],
  ]);
  ctx.fillRect(x1 + 30, bot - 10, W - 60, 240);
  ctx.fillStyle = yGrad(ctx, [
    [bot, 'rgba(21,21,31,1)'],
    [bot + 210, 'rgba(21,21,31,0)'],
  ]);
  for (let x = x1 + 60; x < x2 - 40; x += 150) ctx.fillRect(x, bot - 10, 12, 220);
  // 軒下の白壁と格子窓
  if (bot > wallTop) {
    ctx.fillStyle = yGrad(ctx, [
      [wallTop, '#878eb3'],
      [bot, '#50567a'],
    ]);
    ctx.fillRect(x1 + 6, wallTop, W - 12, bot - wallTop);
    ctx.fillStyle = '#16161f';
    ctx.fillRect(x1 + 6, wallTop + 10, W - 12, 9);
    ctx.fillRect(x1 + 6, bot - 14, W - 12, 10);
    const nPost = Math.max(2, Math.round(W / 150));
    const span = W - 24;
    for (let i = 0; i <= nPost; i++) ctx.fillRect(x1 + 6 + (span * i) / nPost, wallTop, 12, bot - wallTop);
    const wy = wallTop + 26;
    const wh = Math.min(40, bot - wallTop - 46);
    if (wh >= 12) {
      for (let i = 0; i < nPost; i += 2) {
        const cx = x1 + 12 + (span * (i + 0.5)) / nPost;
        ctx.fillStyle = yGrad(ctx, [
          [wy, '#ffd285'],
          [wy + wh, '#dc7230'],
        ]);
        ctx.fillRect(cx - 26, wy, 52, wh);
        ctx.fillStyle = '#2a1a12';
        for (let k = 0; k <= 6; k++) ctx.fillRect(cx - 27 + (k * 52) / 6, wy, 2.4, wh);
        ctx.fillRect(cx - 28, wy - 3, 56, 4);
        ctx.fillRect(cx - 28, wy + wh - 1, 56, 4);
        addGlow(ctx, cx, wy + wh / 2, 72, '255,160,70', 0.26 + 0.05 * Math.sin(frame * 0.07 + i));
      }
    }
    ctx.fillStyle = yGrad(ctx, [
      [wallTop, 'rgba(8,8,16,0.9)'],
      [wallTop + 36, 'rgba(8,8,16,0)'],
    ]);
    ctx.fillRect(x1 + 6, wallTop, W - 12, 36);
  }
  // 瓦の斜面
  ctx.fillStyle = yGrad(ctx, [
    [y + 24, '#30365a'],
    [eave, '#1b1e36'],
  ]);
  ctx.fillRect(x1, y + 24, W, eave - y - 22);
  const rib = 24;
  const nR = Math.floor(W / rib);
  const off = x1 + (W - nR * rib) / 2;
  ctx.fillStyle = '#383f68';
  ctx.beginPath();
  for (let i = 0; i < nR; i++) ctx.rect(off + i * rib + 6, y + 28, 11, eave - y - 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(140,155,230,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < nR; i++) {
    ctx.moveTo(off + i * rib + 16.2, y + 28);
    ctx.lineTo(off + i * rib + 16.2, eave);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(8,9,20,0.55)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let yy = y + 44; yy < eave - 4; yy += 17) {
    ctx.moveTo(x1, yy);
    ctx.lineTo(x2, yy);
  }
  ctx.stroke();
  ctx.fillStyle = linGrad(ctx, x2, y, x1, eave, [
    [0, 'rgba(150,170,255,0.16)'],
    [0.6, 'rgba(150,170,255,0)'],
  ]);
  ctx.fillRect(x1, y + 24, W, eave - y - 24);
  // 軒の鼻隠しと反り上がる軒先
  ctx.fillStyle = '#14141e';
  ctx.fillRect(x1, eave + 4, W, 20);
  for (const [ex, d] of [
    [x1, -1],
    [x2, 1],
  ] as [number, number][]) {
    ctx.beginPath();
    ctx.moveTo(ex - d * 40, eave + 4);
    ctx.quadraticCurveTo(ex, eave + 5, ex + d * 28, eave - 18);
    ctx.quadraticCurveTo(ex + d * 8, eave + 22, ex - d * 40, eave + 24);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d4ab52';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(ex - d * 20, eave + 23);
    ctx.quadraticCurveTo(ex + d * 10, eave + 20, ex + d * 28, eave - 18);
    ctx.stroke();
  }
  ctx.fillStyle = '#d4ab52';
  ctx.fillRect(x1, eave + 21, W, 2.6);
  // 軒先の巴瓦（金縁）
  ctx.fillStyle = '#2a2f50';
  ctx.strokeStyle = '#c9a04a';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let i = 0; i < nR; i++) {
    const cx = off + i * rib + 11.5;
    ctx.moveTo(cx + 6.5, eave + 1);
    ctx.arc(cx, eave + 1, 6.5, 0, TAU);
  }
  ctx.fill();
  ctx.stroke();
  // 棟（歩ける上面）: 暗い瓦 + 金の帯 + 月光のハイライト
  ctx.fillStyle = yGrad(ctx, [
    [y, '#3c426c'],
    [y + 24, '#1d2038'],
  ]);
  ctx.fillRect(x1, y, W, 24);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  for (let x = x1 + 8; x < x2 - 4; x += 16) {
    ctx.moveTo(x + 4.5, y + 14);
    ctx.arc(x, y + 14, 4.5, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = '#d6ad54';
  ctx.fillRect(x1, y + 21, W, 3.5);
  ctx.fillStyle = '#6d5220';
  ctx.fillRect(x1, y + 24.5, W, 1.5);
  ctx.fillStyle = yGrad(ctx, [
    [y, 'rgba(214,222,255,0.95)'],
    [y + 7, 'rgba(120,135,200,0)'],
  ]);
  ctx.fillRect(x1, y, W, 7);
  ctx.fillStyle = '#eef1ff';
  ctx.fillRect(x1, y, W, 1.6);
  // 鬼瓦と鯱（崖の両端）
  for (const [ex, d] of [
    [x1, 1],
    [x2, -1],
  ] as [number, 1 | -1][]) {
    ctx.fillStyle = '#23263f';
    ctx.fillRect(d > 0 ? ex : ex - 26, y + 1, 26, 26);
    ctx.strokeStyle = '#d6ad54';
    ctx.lineWidth = 2;
    ctx.strokeRect(d > 0 ? ex + 1 : ex - 25, y + 2, 24, 24);
    shachi(ctx, ex + d * 16, y + 1, d);
  }
}

// ── 天界: 浮かぶ白石の舞台 ──

function geoTenkai(ctx: Ctx, st: StageDef, frame: number): void {
  const { x1, x2, y, depth } = st.main;
  const W = x2 - x1;
  const cx = (x1 + x2) / 2;
  const side = y + depth * 0.8;
  const tipY = y + depth + 150;
  // 下面の光
  ctx.save();
  ctx.translate(cx, y + depth);
  ctx.scale(1, 0.45);
  ctx.fillStyle = radGrad(ctx, 0, 0, 0, W * 0.55, [
    [0, 'rgba(255,214,140,0.6)'],
    [0.5, 'rgba(255,200,150,0.25)'],
    [1, 'rgba(255,200,150,0)'],
  ]);
  ctx.beginPath();
  ctx.arc(0, 0, W * 0.55, 0, TAU);
  ctx.fill();
  ctx.restore();
  // 先細りの岩（下端が一点に）
  const rng = new Rng(hash32(`tenkai-rock:${W}`));
  const pts: Pt[] = [];
  const N = 26;
  for (let i = 1; i < N; i++) {
    const t = i / N;
    const u = Math.abs(t - 0.5) * 2;
    pts.push({ x: x1 + W * t + rng.range(-8, 8), y: side + (1 - Math.pow(u, 1.5)) * (tipY - side) + rng.range(-12, 12) * (1 - u * 0.5) });
  }
  ctx.beginPath();
  ctx.moveTo(x1, y + 40);
  ctx.lineTo(x1 + 6, side);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.lineTo(x2 - 6, side);
  ctx.lineTo(x2, y + 40);
  ctx.closePath();
  ctx.fillStyle = yGrad(ctx, [
    [y + 40, '#e8dfd0'],
    [side, '#b6a7bd'],
    [tipY, '#76699a'],
  ]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,70,120,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 1; i < pts.length - 1; i += 2) {
    const p = pts[i];
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + (cx - p.x) * 0.2 + rng.range(-20, 20), y + 80 + rng.range(0, 40));
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,212,120,0.8)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    let vx = cx + rng.range(-0.38, 0.38) * W;
    let vy = y + 90;
    ctx.moveTo(vx, vy);
    for (let s = 0; s < 5; s++) {
      vx += rng.range(-26, 26);
      vy += rng.range(14, 28);
      ctx.lineTo(vx, vy);
    }
  }
  ctx.stroke();
  // 下面を包む雲
  const puffs: [number, number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const u = Math.abs(t - 0.5) * 2;
    puffs.push([x1 + W * t, side + (1 - Math.pow(u, 1.5)) * (tipY - side) * 0.72 - 6, 64 + (1 - u) * 36]);
  }
  for (const t of [0.015, 0.09, 0.91, 0.985]) puffs.push([x1 + W * t, y + 118, 58]);
  puffs.forEach(([px, py0, r], i) => {
    const py = py0 + Math.sin(frame * 0.013 + i * 1.7) * 4;
    ctx.fillStyle = radGrad(ctx, px, py, 0, r, [
      [0, 'rgba(255,253,250,0.88)'],
      [0.5, 'rgba(248,234,242,0.55)'],
      [1, 'rgba(226,206,232,0)'],
    ]);
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
  });
  // 白石の舞台
  ctx.fillStyle = yGrad(ctx, [
    [y, '#fbf6ec'],
    [y + 26, '#e6dbc8'],
    [y + 66, '#c4b39c'],
  ]);
  ctx.fillRect(x1, y, W, 66);
  ctx.fillStyle = yGrad(ctx, [
    [y + 26, '#2d3c86'],
    [y + 48, '#1b255e'],
  ]);
  ctx.fillRect(x1, y + 26, W, 22);
  // 金の青海波と点飾り
  ctx.strokeStyle = '#e2b54c';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let fx = x1 + 22; fx < x2; fx += 44) {
    for (const r of [9, 5]) {
      ctx.moveTo(fx + r, y + 48);
      ctx.arc(fx, y + 48, r, 0, Math.PI, true);
    }
  }
  ctx.stroke();
  ctx.fillStyle = '#f1cd6a';
  ctx.beginPath();
  for (let fx = x1 + 44; fx < x2 - 10; fx += 44) {
    ctx.moveTo(fx + 2.2, y + 33);
    ctx.arc(fx, y + 33, 2.2, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = '#e8bd52';
  ctx.fillRect(x1, y + 25, W, 2.6);
  ctx.fillRect(x1, y + 47, W, 2.6);
  // 金帯を流れる光
  const sx = x1 - 200 + wrap(frame * 2.2, W + 400);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = xGrad(ctx, [
    [sx - 90, 'rgba(255,236,190,0)'],
    [sx, 'rgba(255,236,190,0.35)'],
    [sx + 90, 'rgba(255,236,190,0)'],
  ]);
  const gx0 = Math.max(x1, sx - 90);
  const gx1 = Math.min(x2, sx + 90);
  if (gx1 > gx0) ctx.fillRect(gx0, y + 25, gx1 - gx0, 25);
  ctx.globalCompositeOperation = 'source-over';
  // 上面のハイライト（最重要: 立ち位置が読めること）
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x1, y, W, 3);
  ctx.fillStyle = 'rgba(190,150,70,0.95)';
  ctx.fillRect(x1, y + 3, W, 1.6);
  ctx.fillStyle = 'rgba(90,70,100,0.35)';
  ctx.fillRect(x1, y + 62, W, 4);
  // 崖の金具と房
  for (const [ex, d] of [
    [x1, 1],
    [x2, -1],
  ] as [number, number][]) {
    ctx.fillStyle = linGrad(ctx, ex, y, ex + d * 22, y + 66, [
      [0, '#fff2bc'],
      [0.5, '#e0b04a'],
      [1, '#94671a'],
    ]);
    ctx.fillRect(d > 0 ? ex - 2 : ex - 20, y - 1, 22, 68);
    ctx.strokeStyle = '#8a5f16';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(d > 0 ? ex - 2 : ex - 20, y - 1, 22, 68);
    const tx = ex + d * 9;
    const sw = Math.sin(frame * 0.04 + d) * 3;
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tx, y + 67);
    ctx.quadraticCurveTo(tx + sw * 0.5, y + 80, tx + sw, y + 92);
    ctx.stroke();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(tx + sw - 5, y + 92);
    ctx.lineTo(tx + sw + 5, y + 92);
    ctx.lineTo(tx + sw * 1.3 + 3, y + 112);
    ctx.lineTo(tx + sw * 1.3 - 3, y + 112);
    ctx.fill();
    ctx.fillStyle = '#e8bd52';
    ctx.beginPath();
    ctx.arc(tx + sw, y + 91, 4, 0, TAU);
    ctx.fill();
  }
}

/** 天界テーマのすり抜け床（雲の板）: 現在のステージには無いが汎用に */
function cloudPlatform(ctx: Ctx, x1: number, x2: number, y: number, frame: number): void {
  const W = x2 - x1;
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    const px = x1 + W * t;
    const r = 18 + Math.sin(t * Math.PI) * 10;
    ctx.fillStyle = radGrad(ctx, px, y + 8, 0, r, [
      [0, 'rgba(255,255,255,0.95)'],
      [1, 'rgba(230,210,235,0)'],
    ]);
    ctx.beginPath();
    ctx.arc(px, y + 10 + Math.sin(frame * 0.02 + i) * 2, r, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = yGrad(ctx, [
    [y, '#fffaf0'],
    [y + 10, '#e2d4c0'],
  ]);
  ctx.fillRect(x1, y, W, 10);
  ctx.fillStyle = '#e8bd52';
  ctx.fillRect(x1, y + 9, W, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x1, y, W, 2);
}

// ── 根の国: 封印の祠の石組み ──

/** 御札（ox, oy = 上端中央） */
function ofuda(ctx: Ctx, x: number, y: number, rot: number, sc = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(sc, sc);
  ctx.fillStyle = '#efe7d4';
  ctx.fillRect(-9, 0, 18, 44);
  ctx.strokeStyle = 'rgba(120,90,60,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-9, 0, 18, 44);
  ctx.fillStyle = '#b3201a';
  ctx.beginPath();
  ctx.arc(0, 10, 5, 0, TAU);
  ctx.fill();
  ctx.fillRect(-1.2, 17, 2.4, 22);
  ctx.fillRect(-5, 22, 10, 1.8);
  ctx.fillRect(-4, 29, 8, 1.8);
  ctx.fillRect(-5, 35, 10, 1.8);
  ctx.fillStyle = '#efe7d4';
  ctx.beginPath();
  ctx.arc(0, 10, 2.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** 紙垂（ジグザグの白い紙） */
function shide(ctx: Ctx, x: number, y: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = '#f7f3ea';
  for (let k = 0; k < 4; k++) ctx.fillRect(k % 2 ? 0 : -4, k * 10, 8, 11);
  ctx.strokeStyle = 'rgba(120,110,100,0.5)';
  ctx.lineWidth = 0.8;
  for (let k = 0; k < 4; k++) ctx.strokeRect(k % 2 ? 0 : -4, k * 10, 8, 11);
  ctx.restore();
}

function slabPlatform(ctx: Ctx, x1: number, x2: number, y: number, frame: number, i: number): void {
  const W = x2 - x1;
  const cx = (x1 + x2) / 2;
  addGlow(ctx, cx, y + 36, W * 0.55, '210,40,90', 0.26 + 0.08 * Math.sin(frame * 0.05 + i));
  const rng = new Rng(hash32(`slab:${i}`));
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.lineTo(x2 - 2, y + 16);
  const n = 9;
  for (let k = n - 1; k >= 1; k--) {
    const t = k / n;
    const u = Math.abs(t - 0.5) * 2;
    ctx.lineTo(x1 + W * t + rng.range(-6, 6), y + 18 + (1 - u) * 28 + rng.range(-5, 5));
  }
  ctx.lineTo(x1 + 2, y + 16);
  ctx.closePath();
  ctx.fillStyle = yGrad(ctx, [
    [y, '#5d4854'],
    [y + 46, '#221720'],
  ]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,8,14,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1 + W * 0.3, y + 10);
  ctx.lineTo(x1 + W * 0.34, y + 22);
  ctx.lineTo(x1 + W * 0.3, y + 32);
  ctx.moveTo(x1 + W * 0.7, y + 10);
  ctx.lineTo(x1 + W * 0.66, y + 26);
  ctx.stroke();
  ctx.fillStyle = yGrad(ctx, [
    [y, '#7f6974'],
    [y + 10, '#54404b'],
  ]);
  ctx.fillRect(x1, y, W, 10);
  ctx.fillStyle = '#f1e2e8';
  ctx.fillRect(x1, y, W, 2.4);
  for (const t of [0.2, 0.5, 0.8]) {
    const u = Math.abs(t - 0.5) * 2;
    ofuda(ctx, x1 + W * t, y + 12 + (1 - u) * 22, Math.sin(frame * 0.05 + t * 9 + i) * 0.12, 0.72);
  }
}

function geoNeno(ctx: Ctx, st: StageDef, frame: number): void {
  const { x1, x2, y, depth } = st.main;
  const W = x2 - x1;
  const cx = (x1 + x2) / 2;
  const bot = y + depth;
  const rng = new Rng(hash32(`neno-geo:${W}`));
  // 祠を掴む根（下に垂れる）
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    const rx = x1 + W * t + rng.range(-30, 30);
    root(
      ctx,
      { x: rx, y: bot - 40 },
      { x: rx + rng.range(-60, 60), y: bot + 60 },
      { x: rx + rng.range(-80, 80), y: bot + 120 },
      { x: rx + rng.range(-60, 60), y: bot + rng.range(150, 260) },
      rng.range(26, 48),
      '#1a0a12',
      'rgba(200,50,70,0.45)',
    );
  }
  // 石組みの本体
  ctx.fillStyle = yGrad(ctx, [
    [y, '#56424e'],
    [y + 70, '#3e2d38'],
    [bot, '#1c1219'],
  ]);
  ctx.fillRect(x1, y, W, depth);
  const rowH = 46;
  ctx.strokeStyle = '#150b11';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  let r = 0;
  for (let yy = y + 22; yy < bot; yy += rowH, r++) {
    ctx.moveTo(x1, yy);
    ctx.lineTo(x2, yy);
    for (let xx = x1 + (r % 2) * 48 + 96; xx < x2 - 10; xx += 96) {
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx, Math.min(yy + rowH, bot));
    }
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,205,220,0.09)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let yy = y + 24.5; yy < bot; yy += rowH) {
    ctx.moveTo(x1, yy);
    ctx.lineTo(x2, yy);
  }
  ctx.stroke();
  // ひび割れ（奥から紅く光る）
  ctx.strokeStyle = 'rgba(255,60,80,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let k = 0; k < 5; k++) {
    let px = x1 + W * rng.range(0.08, 0.92);
    let py = y + rng.range(60, depth - 60);
    ctx.moveTo(px, py);
    for (let s = 0; s < 4; s++) {
      px += rng.range(-18, 18);
      py += rng.range(8, 18);
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  ctx.fillStyle = xGrad(ctx, [
    [x1, 'rgba(255,60,70,0.3)'],
    [x1 + 44, 'rgba(255,60,70,0)'],
  ]);
  ctx.fillRect(x1, y, 44, depth);
  ctx.fillStyle = xGrad(ctx, [
    [x2 - 44, 'rgba(255,60,70,0)'],
    [x2, 'rgba(255,60,70,0.3)'],
  ]);
  ctx.fillRect(x2 - 44, y, 44, depth);
  ctx.fillStyle = yGrad(ctx, [
    [bot - 80, 'rgba(10,3,8,0)'],
    [bot, 'rgba(10,3,8,0.7)'],
  ]);
  ctx.fillRect(x1, bot - 80, W, 80);
  // 御札（封印）
  const tal: [number, number, number][] = [
    [0.09, 96, -0.1],
    [0.23, 150, 0.08],
    [0.38, 104, -0.05],
    [0.62, 118, 0.1],
    [0.77, 160, -0.08],
    [0.91, 98, 0.06],
  ];
  tal.forEach(([t, oy, rot], i) => {
    const tx = x1 + W * t;
    addGlow(ctx, tx, y + oy + 22, 42, '255,40,60', 0.12 + 0.1 * Math.max(0, Math.sin(frame * 0.03 + i * 1.9)));
    ofuda(ctx, tx, y + oy, rot);
  });
  // 笠石（歩ける上面）
  ctx.fillStyle = yGrad(ctx, [
    [y, '#7b6671'],
    [y + 22, '#4a3842'],
  ]);
  ctx.fillRect(x1, y, W, 22);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x1, y + 22, W, 3);
  ctx.fillStyle = '#f0e0e8';
  ctx.fillRect(x1, y, W, 2.6);
  // 注連縄と紙垂
  const anchors = [x1 + 28, cx, x2 - 28];
  const ry = y + 34;
  const sag = 32;
  ctx.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    const a = anchors[k];
    const b = anchors[k + 1];
    const m = (a + b) / 2;
    const path = (dy: number): void => {
      ctx.beginPath();
      ctx.moveTo(a, ry + dy);
      ctx.quadraticCurveTo(m, ry + sag * 2 + dy, b, ry + dy);
    };
    path(0);
    ctx.strokeStyle = '#5e4a26';
    ctx.lineWidth = 17;
    ctx.stroke();
    ctx.strokeStyle = '#d4bd82';
    ctx.lineWidth = 12.5;
    ctx.stroke();
    path(-3);
    ctx.strokeStyle = 'rgba(255,246,214,0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(96,74,32,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 1; i < 18; i++) {
      const t = i / 18;
      const px = qb(a, m, b, t);
      const py = qb(ry, ry + sag * 2, ry, t);
      ctx.moveTo(px - 4, py - 6);
      ctx.lineTo(px + 4, py + 6);
    }
    ctx.stroke();
    for (const t of [0.28, 0.72]) {
      const px = qb(a, m, b, t);
      const py = qb(ry, ry + sag * 2, ry, t) + 6;
      shide(ctx, px, py, Math.sin(frame * 0.035 + px * 0.05) * 0.1);
    }
  }
  ctx.lineCap = 'butt';
  for (const a of anchors) {
    ctx.fillStyle = '#c9ae6c';
    ctx.beginPath();
    ctx.ellipse(a, ry, 10, 12, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#b89a58';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = -3; k <= 3; k++) {
      ctx.moveTo(a + k * 2, ry + 8);
      ctx.lineTo(a + k * 2.6, ry + 34);
    }
    ctx.stroke();
  }
}

// ── 雑賀: 桟橋と小舟 ──

function crowMon(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.fillStyle = '#1a120c';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#e0b04a';
  ctx.lineWidth = r * 0.14;
  ctx.stroke();
  ctx.fillStyle = '#e0b04a';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.05, r * 0.2, r * 0.32, 0, 0, TAU);
  ctx.moveTo(x, y - r * 0.08);
  ctx.lineTo(x - r * 0.74, y - r * 0.36);
  ctx.lineTo(x - r * 0.46, y + r * 0.06);
  ctx.closePath();
  ctx.moveTo(x, y - r * 0.08);
  ctx.lineTo(x + r * 0.74, y - r * 0.36);
  ctx.lineTo(x + r * 0.46, y + r * 0.06);
  ctx.closePath();
  ctx.moveTo(x + r * 0.15, y - r * 0.42);
  ctx.arc(x, y - r * 0.42, r * 0.15, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#e0b04a';
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  for (const dx of [-0.12, 0, 0.12]) {
    ctx.moveTo(x + dx * r, y + r * 0.3);
    ctx.lineTo(x + dx * r * 1.8, y + r * 0.62);
  }
  ctx.stroke();
}

function boatPlatform(ctx: Ctx, x1: number, x2: number, y: number, frame: number): void {
  const W = x2 - x1;
  const cx = (x1 + x2) / 2;
  // 艫の旗（外側に向かってはためく）
  const px = x1 - 18;
  ctx.fillStyle = '#2a170c';
  ctx.fillRect(px - 2, y - 104, 4, 92);
  ctx.beginPath();
  const fw = 30;
  ctx.moveTo(px, y - 100);
  for (let k = 0; k <= 6; k++) {
    const yy = y - 100 + k * 11;
    ctx.lineTo(px - fw + Math.sin(frame * 0.12 + k * 0.9) * 4 * (k / 6 + 0.3), yy);
  }
  ctx.lineTo(px, y - 34);
  ctx.closePath();
  ctx.fillStyle = '#b8261c';
  ctx.fill();
  crowMon(ctx, px - fw * 0.5, y - 76, 9);
  // 船体
  ctx.beginPath();
  ctx.moveTo(x1 - 28, y - 24);
  ctx.quadraticCurveTo(x1 - 8, y + 40, x1 + 50, y + 46);
  ctx.lineTo(x2 - 50, y + 46);
  ctx.quadraticCurveTo(x2 + 8, y + 40, x2 + 32, y - 30);
  ctx.lineTo(x2 + 16, y - 26);
  ctx.quadraticCurveTo(x2 + 6, y - 2, x2 - 6, y);
  ctx.lineTo(x1 + 6, y);
  ctx.quadraticCurveTo(x1 - 4, y - 2, x1 - 14, y - 20);
  ctx.closePath();
  ctx.fillStyle = yGrad(ctx, [
    [y - 24, '#a06a40'],
    [y + 46, '#4a2a16'],
  ]);
  ctx.fill();
  ctx.strokeStyle = '#2a170c';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40,20,10,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const k of [16, 30]) {
    ctx.moveTo(x1 + 2, y + k - 6);
    ctx.quadraticCurveTo(cx, y + k + 8, x2 - 2, y + k - 6);
  }
  ctx.stroke();
  ctx.fillStyle = '#6a4024';
  ctx.fillRect(x1, y, W, 7);
  ctx.fillStyle = '#ffdcaa';
  ctx.fillRect(x1, y, W, 2.2);
  crowMon(ctx, cx, y + 24, 12);
}

function plankPlatform(ctx: Ctx, x1: number, x2: number, y: number): void {
  const W = x2 - x1;
  ctx.fillStyle = yGrad(ctx, [
    [y, '#a87448'],
    [y + 14, '#5e3a22'],
  ]);
  ctx.fillRect(x1, y, W, 14);
  ctx.fillStyle = '#ffdcaa';
  ctx.fillRect(x1, y, W, 2.2);
}

function geoSaika(ctx: Ctx, st: StageDef, frame: number): void {
  const { x1, x2, y, depth } = st.main;
  const W = x2 - x1;
  const bot = y + depth;
  const wl = y + Math.min(150, depth * 0.62);
  const vr = visibleRect(ctx);
  // 手前の海（桟橋の杭が沈む水面）
  const seaG = yGrad(ctx, [
    [wl, '#7c4f80'],
    [wl + 160, '#4a3570'],
    [wl + 700, '#221b48'],
  ]);
  if (vr.y1 > wl - 50) {
    ctx.fillStyle = yGrad(ctx, [
      [wl - 50, 'rgba(124,79,128,0)'],
      [wl + 20, 'rgba(124,79,128,1)'],
      [wl + 160, '#4a3570'],
      [wl + 700, '#221b48'],
    ]);
    ctx.fillRect(vr.x0, wl - 50, vr.x1 - vr.x0, vr.y1 - wl + 50);
    for (let r = 0; r < 4; r++) {
      const yy = wl + 6 + r * r * 14 + r * 10;
      const sp = 120 + r * 50;
      const len = 30 + r * 18;
      const off = wrap(frame * (0.3 + r * 0.12) * (r % 2 ? 1 : -1), sp);
      ctx.strokeStyle = rgba('255,190,140', 0.42 - r * 0.09);
      ctx.lineWidth = 2 + r;
      ctx.beginPath();
      for (let x = Math.floor((vr.x0 - off) / sp) * sp + off; x < vr.x1; x += sp) {
        const j = fract(Math.sin(Math.round((x - off) / sp) * 12.9898 + r * 7.1) * 43758.5453);
        ctx.moveTo(x + j * 40, yy);
        ctx.lineTo(x + j * 40 + len, yy);
      }
      ctx.stroke();
    }
  }
  // 桟橋の下（暗い奥）と筋交い・杭
  ctx.fillStyle = yGrad(ctx, [
    [y + 30, '#22152c'],
    [wl, '#150c1d'],
  ]);
  ctx.fillRect(x1 + 4, y + 30, W - 8, depth - 30);
  const nP = Math.max(2, Math.round(W / 80));
  const postX = (i: number): number => x1 + 12 + ((W - 24) * i) / nP;
  ctx.strokeStyle = '#3e2818';
  ctx.lineWidth = 7;
  ctx.beginPath();
  for (let i = 0; i < nP; i++) {
    ctx.moveTo(postX(i), y + 44);
    ctx.lineTo(postX(i + 1), wl - 4);
    ctx.moveTo(postX(i + 1), y + 44);
    ctx.lineTo(postX(i), wl - 4);
  }
  ctx.stroke();
  ctx.fillStyle = '#3a2415';
  ctx.fillRect(x1 + 4, y + 88, W - 8, 9);
  const postG = xGrad(ctx, [
    [-12, '#24160e'],
    [-4, '#8e603a'],
    [4, '#5c3b22'],
    [12, '#1e120a'],
  ]);
  for (let i = 0; i <= nP; i++) {
    ctx.save();
    ctx.translate(postX(i), 0);
    ctx.fillStyle = postG;
    ctx.fillRect(-12, y + 30, 24, depth + 40);
    ctx.restore();
  }
  // 水中部分（海の色を重ねる）と波紋
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = seaG;
  ctx.fillRect(x1 - 20, wl, W + 40, bot + 80 - wl);
  ctx.globalAlpha = 0.9;
  ctx.fillRect(x1 - 20, bot, W + 40, 80);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,205,165,0.6)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i <= nP; i++) {
    const rr = 17 + Math.sin(frame * 0.05 + i * 1.3) * 3;
    ctx.moveTo(postX(i) + rr, wl + 2);
    ctx.ellipse(postX(i), wl + 2, rr, 3.5, 0, 0, TAU);
  }
  ctx.stroke();
  // 縁の梁（鉄の鋲）
  ctx.fillStyle = yGrad(ctx, [
    [y + 14, '#5c3a24'],
    [y + 36, '#341f12'],
  ]);
  ctx.fillRect(x1, y + 14, W, 22);
  ctx.fillStyle = '#1a1210';
  ctx.beginPath();
  for (let x = x1 + 20; x < x2 - 10; x += 60) {
    ctx.moveTo(x + 3.2, y + 25);
    ctx.arc(x, y + 25, 3.2, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = 'rgba(255,210,160,0.5)';
  ctx.beginPath();
  for (let x = x1 + 20; x < x2 - 10; x += 60) {
    ctx.moveTo(x, y + 24);
    ctx.arc(x - 1, y + 24, 1.2, 0, TAU);
  }
  ctx.fill();
  // 甲板（歩ける上面）
  ctx.fillStyle = yGrad(ctx, [
    [y, '#b27c4e'],
    [y + 14, '#7a4e2e'],
  ]);
  ctx.fillRect(x1, y, W, 14);
  ctx.strokeStyle = 'rgba(50,28,14,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = x1 + 56, k = 0; x < x2; x += 56, k++) {
    ctx.moveTo(x + (k % 2) * 6, y + 3);
    ctx.lineTo(x + (k % 2) * 6, y + 14);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffdcaa';
  ctx.fillRect(x1, y, W, 2.5);
  // 縁の提灯と端の綱
  for (const t of [0.12, 0.36, 0.64, 0.88]) lantern(ctx, x1 + W * t, y + 36, frame, t * 11);
  ctx.strokeStyle = '#c8a870';
  ctx.lineWidth = 3;
  for (const [ex, d] of [
    [x1, -1],
    [x2, 1],
  ] as [number, number][]) {
    ctx.beginPath();
    ctx.ellipse(ex + d * 2, y + 58, 8, 16, 0, 0, TAU);
    ctx.moveTo(ex + d * 2, y + 74);
    ctx.quadraticCurveTo(ex + d * 10, y + 92, ex + d * 4, y + 110);
    ctx.stroke();
  }
}

// ─────────────────────────────────────────────────────────────
// 前景（画面空間・ファイターの上）: 薄い粒子のみ
// ─────────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  ph: number;
  sp: number;
  a: number;
}

const particleSets = new Map<string, Particle[]>();
function particles(key: string, n: number, init: (r: Rng) => Particle): Particle[] {
  let ps = particleSets.get(key);
  if (!ps) {
    const r = new Rng(hash32(`fg:${key}`));
    ps = Array.from({ length: n }, () => init(r));
    particleSets.set(key, ps);
  }
  return ps;
}

/** 画面をループする位置（depth: 前景の視差の強さ） */
function fgPos(p: Particle, frame: number, w: number, h: number, pad: number, v: View, s: number, depth: number): Pt {
  const W = w + pad * 2;
  const H = h + pad * 2;
  return {
    x: wrap(p.x * W + p.vx * frame * s - v.x * depth * s, W) - pad,
    y: wrap(p.y * H + p.vy * frame * s - (v.y - Y_REF) * depth * 0.6 * s, H) - pad,
  };
}

type FgFn = (ctx: Ctx, v: View, w: number, h: number, s: number, frame: number) => void;

const fgIga: FgFn = (ctx, v, w, h, s, frame) => {
  const ps = particles('iga', 26, (r) => ({
    x: r.next(),
    y: r.next(),
    vx: r.range(0.25, 0.6),
    vy: r.range(0.35, 0.75),
    s: r.range(3.2, 6.2),
    ph: r.range(0, TAU),
    sp: r.range(0.02, 0.05),
    a: r.range(0.4, 0.7),
  }));
  for (const p of ps) {
    const pos = fgPos(p, frame, w, h, 30, v, s, 0.3 + p.s * 0.04);
    const sz = p.s * s;
    ctx.save();
    ctx.translate(pos.x + Math.sin(frame * p.sp + p.ph) * 18 * s, pos.y);
    ctx.rotate(frame * p.sp * 1.3 + p.ph);
    ctx.scale(1, 0.3 + 0.7 * Math.abs(Math.cos(frame * p.sp * 1.7 + p.ph)));
    ctx.globalAlpha = p.a;
    ctx.fillStyle = p.ph > 3 ? '#ffc6dc' : '#ffd9e6';
    ctx.beginPath();
    ctx.moveTo(0, -sz);
    ctx.quadraticCurveTo(sz * 0.95, -sz * 0.25, 0, sz);
    ctx.quadraticCurveTo(-sz * 0.95, -sz * 0.25, 0, -sz);
    ctx.fill();
    ctx.restore();
  }
};

const fgTenkai: FgFn = (ctx, v, w, h, s, frame) => {
  const ps = particles('tenkai', 30, (r) => ({
    x: r.next(),
    y: r.next(),
    vx: r.range(-0.08, 0.08),
    vy: r.range(-0.45, -0.15),
    s: r.range(2, 5),
    ph: r.range(0, TAU),
    sp: r.range(0.02, 0.06),
    a: r.range(0.25, 0.5),
  }));
  ctx.globalCompositeOperation = 'lighter';
  for (const p of ps) {
    const pos = fgPos(p, frame, w, h, 40, v, s, 0.25 + p.s * 0.04);
    const tw = 0.55 + 0.45 * Math.sin(frame * p.sp + p.ph);
    glow(ctx, pos.x + Math.sin(frame * 0.01 + p.ph) * 12 * s, pos.y, p.s * 3.2 * s, '255,236,180', p.a * tw);
  }
};

function fogSprite(): Surface {
  return cached('fog', 256, 64, (g) => {
    g.translate(128, 32);
    g.scale(1, 0.25);
    g.fillStyle = radGrad(g, 0, 0, 0, 128, [
      [0, 'rgba(150,80,110,1)'],
      [0.5, 'rgba(150,80,110,0.45)'],
      [1, 'rgba(150,80,110,0)'],
    ]);
    g.beginPath();
    g.arc(0, 0, 128, 0, TAU);
    g.fill();
  }).c;
}

const fgNeno: FgFn = (ctx, v, w, h, s, frame) => {
  // 低く漂う霧
  const fog = fogSprite();
  for (let i = 0; i < 3; i++) {
    const fw = w * 0.9;
    const x = wrap(i * fw * 0.7 + frame * (0.25 + i * 0.1) * s - v.x * 0.3 * s, w + fw) - fw;
    ctx.globalAlpha = 0.1 + 0.03 * Math.sin(frame * 0.01 + i);
    ctx.drawImage(fog, x, h * (0.78 + i * 0.06), fw, fw * 0.22);
  }
  // 灰（落ちる）
  const ash = particles('neno-ash', 14, (r) => ({
    x: r.next(),
    y: r.next(),
    vx: r.range(-0.15, 0.15),
    vy: r.range(0.2, 0.45),
    s: r.range(1.2, 2.4),
    ph: r.range(0, TAU),
    sp: r.range(0.02, 0.04),
    a: r.range(0.2, 0.35),
  }));
  ctx.fillStyle = '#b8a8b4';
  for (const p of ash) {
    const pos = fgPos(p, frame, w, h, 20, v, s, 0.35);
    ctx.globalAlpha = p.a;
    ctx.fillRect(pos.x + Math.sin(frame * p.sp + p.ph) * 10 * s, pos.y, p.s * s, p.s * s * 0.7);
  }
  // 火の粉（昇る）
  const em = particles('neno-ember', 22, (r) => ({
    x: r.next(),
    y: r.next(),
    vx: r.range(-0.1, 0.25),
    vy: r.range(-0.9, -0.35),
    s: r.range(1.5, 3),
    ph: r.range(0, TAU),
    sp: r.range(0.05, 0.12),
    a: r.range(0.35, 0.6),
  }));
  ctx.globalCompositeOperation = 'lighter';
  for (const p of em) {
    const pos = fgPos(p, frame, w, h, 20, v, s, 0.4);
    const tw = 0.6 + 0.4 * Math.sin(frame * p.sp + p.ph);
    glow(ctx, pos.x + Math.sin(frame * 0.03 + p.ph) * 14 * s, pos.y, p.s * 3.5 * s, '255,110,50', p.a * tw);
  }
};

const fgSaika: FgFn = (ctx, v, w, h, s, frame) => {
  // 港の提灯の灯りが画面の隅に滲む
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, w * 0.02, h * 1.02, h * 0.55, '255,140,60', 0.1 + 0.02 * Math.sin(frame * 0.07));
  glow(ctx, w * 0.98, h * 1.02, h * 0.55, '255,140,60', 0.1 + 0.02 * Math.sin(frame * 0.06 + 2));
  ctx.globalCompositeOperation = 'source-over';
  // 波しぶき（画面下で弧を描く）
  const sp = particles('saika-spray', 18, (r) => ({
    x: r.next(),
    y: r.range(0.9, 1.05),
    vx: r.range(-0.6, 0.6),
    vy: r.range(40, 90),
    s: r.range(1.4, 2.8),
    ph: r.next(),
    sp: r.range(0.006, 0.012),
    a: r.range(0.3, 0.5),
  }));
  ctx.fillStyle = '#fff1e4';
  for (const p of sp) {
    const t = fract(frame * p.sp + p.ph);
    const x = wrap(p.x * (w + 40) - v.x * 0.4 * s, w + 40) - 20 + p.vx * t * 60 * s;
    const y = p.y * h - Math.sin(t * Math.PI) * p.vy * s;
    ctx.globalAlpha = p.a * Math.sin(t * Math.PI);
    ctx.beginPath();
    ctx.arc(x, y, p.s * s, 0, TAU);
    ctx.fill();
  }
};

// ─────────────────────────────────────────────────────────────
// テーマ表と公開 API
// ─────────────────────────────────────────────────────────────

type PlatFn = (ctx: Ctx, x1: number, x2: number, y: number, frame: number, i: number, moving: boolean) => void;

interface Theme {
  id: string;
  bg: LayerSpec[];
  geo: (ctx: Ctx, st: StageDef, frame: number) => void;
  plat: PlatFn;
  fg: FgFn;
  /** 周辺減光の色と強さ */
  vig: string;
  vigA: number;
}

const THEMES: Record<string, Theme> = {
  iga: {
    id: 'iga',
    bg: IGA_BG,
    geo: geoIga,
    plat: (ctx, x1, x2, y, frame, i) => beamPlatform(ctx, x1, x2, y, frame, i),
    fg: fgIga,
    vig: '4,5,18',
    vigA: 0.55,
  },
  tenkai: {
    id: 'tenkai',
    bg: TENKAI_BG,
    geo: geoTenkai,
    plat: (ctx, x1, x2, y, frame) => cloudPlatform(ctx, x1, x2, y, frame),
    fg: fgTenkai,
    vig: '120,80,110',
    vigA: 0.22,
  },
  nenokuni: {
    id: 'nenokuni',
    bg: NENO_BG,
    geo: geoNeno,
    plat: (ctx, x1, x2, y, frame, i) => slabPlatform(ctx, x1, x2, y, frame, i),
    fg: fgNeno,
    vig: '6,0,4',
    vigA: 0.65,
  },
  saika: {
    id: 'saika',
    bg: SAIKA_BG,
    geo: geoSaika,
    plat: (ctx, x1, x2, y, frame, _i, moving) => (moving ? boatPlatform(ctx, x1, x2, y, frame) : plankPlatform(ctx, x1, x2, y)),
    fg: fgSaika,
    vig: '20,8,30',
    vigA: 0.45,
  },
};

const themeOf = (id: string): Theme => THEMES[id] ?? THEMES.iga;

/** 背景キャッシュの解像度倍率（dpr に追従、ただし 1.5 まで） */
function qualityOf(ctx: Ctx): number {
  const m = ctx.getTransform();
  const d = Math.hypot(m.a, m.b) || 1;
  return Math.round(clamp(d, 1, 1.5) * 4) / 4;
}

function renderBackground(ctx: Ctx, th: Theme, v: View, w: number, h: number, frame: number, q: number): void {
  const s = Math.min(w / 1280, h / 720);
  ctx.save();
  for (const L of th.bg) {
    const o = originFor(L.f, L.fy, v, w, h, s, q);
    drawLayer(ctx, th.id, L, o, w, h, s, q, frame);
    if (L.live) L.live(ctx, o, frame);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.45, Math.hypot(w, h) * 0.62);
  vg.addColorStop(0, rgba(th.vig, 0));
  vg.addColorStop(1, rgba(th.vig, th.vigA));
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Full-screen background in SCREEN space. Caller sets ctx.setTransform(dpr,0,0,dpr,0,0) beforehand; w/h are CSS px. */
export function drawStageBackground(ctx: CanvasRenderingContext2D, stage: StageDef, cam: Camera, w: number, h: number, frame: number): void {
  renderBackground(ctx, themeOf(stage.id), cam.view(), w, h, frame, qualityOf(ctx));
}

/** Stage geometry in WORLD space (camera transform already applied). Walkable tops are exactly at each platform's y. */
export function drawStageGeometry(ctx: CanvasRenderingContext2D, stage: StageDef, frame: number): void {
  const th = themeOf(stage.id);
  ctx.save();
  th.geo(ctx, stage, frame);
  stage.platforms.forEach((p, i) => {
    const ps = platformAt(p, frame);
    th.plat(ctx, ps.x1, ps.x2, ps.y, frame, i, !!p.move);
  });
  ctx.restore();
}

/** Foreground ambience in SCREEN space drawn over fighters (low alpha). */
export function drawStageForeground(ctx: CanvasRenderingContext2D, stage: StageDef, cam: Camera, w: number, h: number, frame: number): void {
  const s = Math.min(w / 1280, h / 720);
  ctx.save();
  themeOf(stage.id).fg(ctx, cam.view(), w, h, s, frame);
  ctx.restore();
}

function stageBounds(st: StageDef): { x0: number; x1: number; y0: number; y1: number } {
  let x0 = st.main.x1;
  let x1 = st.main.x2;
  let y0 = st.main.y - 140;
  for (const p of st.platforms) {
    const ax = Math.abs(p.move?.ax ?? 0);
    const ay = Math.abs(p.move?.ay ?? 0);
    x0 = Math.min(x0, p.x1 - ax);
    x1 = Math.max(x1, p.x2 + ax);
    y0 = Math.min(y0, p.y - ay - 70);
  }
  return { x0: x0 - 70, x1: x1 + 70, y0, y1: st.main.y + st.main.depth + 30 };
}

/** Stylized thumbnail for the stage-select screen. Identity transform; w/h in canvas px. */
export function drawStagePreview(ctx: CanvasRenderingContext2D, stage: StageDef, w: number, h: number): void {
  const th = themeOf(stage.id);
  const e = cached(`P:${stage.id}:${Math.round(w)}x${Math.round(h)}`, w, h, (g) => {
    renderBackground(g, th, { x: 0, y: Y_REF - 40, zoom: 0.6 }, w, h, 0, 1);
    const b = stageBounds(stage);
    const sc = Math.min((w * 0.86) / (b.x1 - b.x0), (h * 0.72) / (b.y1 - b.y0));
    g.setTransform(sc, 0, 0, sc, w / 2 - ((b.x0 + b.x1) / 2) * sc, h * 0.95 - b.y1 * sc);
    // 動く足場の可動域をうっすら示す
    for (const p of stage.platforms) {
      if (!p.move) continue;
      for (const k of [-1, 1]) {
        const dx = p.move.ax * k;
        const dy = p.move.ay * k;
        g.fillStyle = 'rgba(255,255,255,0.14)';
        g.fillRect(p.x1 + dx, p.y + dy, p.x2 - p.x1, 14);
        g.setLineDash([10, 8]);
        g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.lineWidth = 2 / Math.max(0.2, sc) * 0.5;
        g.strokeRect(p.x1 + dx, p.y + dy, p.x2 - p.x1, 14);
        g.setLineDash([]);
      }
    }
    drawStageGeometry(g, stage, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const vg = g.createLinearGradient(0, 0, 0, h);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.75, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
  });
  ctx.drawImage(e.c, 0, 0, w, h);
}
