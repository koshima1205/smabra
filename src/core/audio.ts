/**
 * 効果音と BGM の手続き合成（Web Audio API のみ・音声ファイル / 外部依存なし）
 *
 * 信号経路:
 *   効果音ボイス → (StereoPanner) → sfx バス ──────┐
 *   BGM の各音 → 曲ごとのゲイン（クロスフェード）→ music バス ┴→ master gain → DynamicsCompressor → destination
 *
 * - AudioContext はユーザー操作から呼ばれる unlock() で初めて作る（import 時には何もしない）
 * - AudioContext が無い環境（Node / vitest など）では全メソッドが黙って何もしない
 * - 音量バランス（master 0.7、オフラインで計測した目安）:
 *   BGM ≈ -25〜-29 LUFS（ピーク -11 dBFS 前後）/ 動作音はそれより 2〜4 dB 上 /
 *   打撃は弱 → 強で約 6 dB 大きく長くなる / 撃墜・勝負あり・爆発が最上位（ピーク ≈ -4 dBFS、BGM をダッキング）。
 *   強打＋撃墜のような重なりはコンプレッサー（リミッター設定）で 0 dBFS 未満に収まる
 */

// ---------------------------------------------------------------------------
// 公開型
// ---------------------------------------------------------------------------

export type HitFx =
  | "normal" | "slash" | "fire" | "elec" | "water" | "wind" | "poison"
  | "dark" | "light" | "petal" | "metal" | "ink" | "sound";
export type SfxName =
  | "swing" | "swingHeavy" | "jump" | "doubleJump" | "land" | "dash"
  | "shield" | "shieldHit" | "shieldBreak" | "dodge" | "ledge" | "grab" | "throw"
  | "ko" | "respawn" | "projectile" | "gun" | "counter" | "charge" | "heal" | "explosion" | "clone" | "teleport" | "summon"
  | "uiMove" | "uiSelect" | "uiBack" | "countdown" | "go" | "gameSet" | "pause" | "join";
export type BgmTheme = "title" | "select" | "iga" | "tenkai" | "nenokuni" | "saika" | "results";
export interface SfxOpts {
  volume?: number;
  pitch?: number;
  pan?: number;
}
export interface AudioApi {
  /** AudioContext を作成 / 再開する。ユーザー操作のハンドラから呼ぶ。何度呼んでもよい */
  unlock(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  /** マスター音量 0..1（既定 0.7） */
  setVolume(master: number): void;
  sfx(name: SfxName, opts?: SfxOpts): void;
  /** 打撃音。strength 0..1（0 = 弱攻撃, 1 = 強烈なスマッシュ）。fx で音色が変わる */
  hit(strength: number, fx: HitFx, pan?: number): void;
  /** 属性ごとの忍術の発動音 */
  element(fx: HitFx, opts?: SfxOpts): void;
  /** BGM を約 0.8 秒のクロスフェードで切り替える。null でフェードアウト。同じテーマなら何もしない */
  bgm(theme: BgmTheme | null): void;
}

// ---------------------------------------------------------------------------
// 定数・小道具
// ---------------------------------------------------------------------------

const MASTER_DEFAULT = 0.7;
const SFX_LEVEL = 1;
const MUSIC_LEVEL = 0.35; // 効果音バスに対して約 0.35（控えめに）
const MAX_VOICES = 24;
const THROTTLE_MS = 25;
const TICK_MS = 25;
const LOOKAHEAD = 0.12; // 秒
const FADE = 0.8; // クロスフェード秒
const LOOP = 256; // 16小節 × 16ステップ
const TINY = 0.0001;

const noop = (): void => {};
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const num = (x: number | undefined, d: number): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const mod = (a: number, n: number): number => ((a % n) + n) % n;
const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);

// ---------------------------------------------------------------------------
// エンジン（AudioContext とバス）
// ---------------------------------------------------------------------------

type Ctor = new (opts?: AudioContextOptions) => AudioContext;

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  sfxBus: GainNode;
  musicBus: GainNode;
  noise: AudioBuffer; // 共有ホワイトノイズ
  resumeAt: number; // resume() を呼んだ時刻（performance.now）
  autoPaused: boolean; // タブ非表示で自動 suspend したか
}

let E: Engine | null = null;
let muted = false;
let volume = MASTER_DEFAULT;
let current: BgmTheme | null = null; // 最後に要求されたテーマ（unlock 前でも保持）

function audioCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function createEngine(C: Ctor): Engine {
  let ctx: AudioContext;
  try {
    ctx = new C({ latencyHint: "interactive" });
  } catch {
    ctx = new C(); // 古い WebKit はオプション非対応
  }
  const comp = ctx.createDynamicsCompressor();
  // 普段は素通しで、大きな音が重なったときだけ頭を抑える安全弁（自動メイクアップゲインも小さめ）
  comp.threshold.value = -6;
  comp.knee.value = 4;
  comp.ratio.value = 12;
  comp.attack.value = 0.002;
  comp.release.value = 0.15;
  const master = amp(ctx, muted ? 0 : volume);
  master.connect(comp);
  comp.connect(ctx.destination);
  const sfxBus = amp(ctx, SFX_LEVEL);
  sfxBus.connect(master);
  const musicBus = amp(ctx, MUSIC_LEVEL);
  musicBus.connect(master);

  const len = Math.floor(ctx.sampleRate * 2);
  const noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const e: Engine = { ctx, master, sfxBus, musicBus, noise, resumeAt: 0, autoPaused: false };
  // タブが隠れたら止め、戻ったら再開（バックグラウンドでタイマーが間引かれて BGM が崩れるのを防ぐ）
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (e.ctx.state === "running") {
          e.autoPaused = true;
          try {
            e.ctx.suspend().catch(noop);
          } catch {
            /* 古い実装 */
          }
        }
      } else if (e.autoPaused) {
        e.autoPaused = false;
        resume(e);
      }
    });
  }
  return e;
}

function resume(e: Engine): void {
  e.resumeAt = performance.now();
  try {
    e.ctx.resume().catch(noop);
  } catch {
    /* resume が Promise を返さない古い実装 */
  }
  // iOS 対策: ユーザー操作中に無音バッファを 1 つ鳴らす
  const s = e.ctx.createBufferSource();
  s.buffer = e.ctx.createBuffer(1, 1, e.ctx.sampleRate);
  s.connect(e.ctx.destination);
  s.onended = () => s.disconnect();
  s.start(0);
}

/** 再生中、または resume 直後（状態が running に変わる前）なら鳴らしてよい */
function ready(e: Engine): boolean {
  return e.ctx.state === "running" || performance.now() - e.resumeAt < 300;
}

function applyMaster(): void {
  if (!E) return;
  const g = E.master.gain;
  const t = E.ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(muted ? 0 : volume, t + 0.03);
}

/** 大きな効果音の間だけ BGM を下げる */
function duck(e: Engine, depth: number, hold: number): void {
  const g = e.musicBus.gain;
  const t = e.ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(MUSIC_LEVEL * (1 - depth), t + 0.04);
  g.setTargetAtTime(MUSIC_LEVEL, t + 0.04 + hold, 0.3);
}

// ---------------------------------------------------------------------------
// ボイス（1 回の発音で作ったノード群。全ソース終了で切り離す）
// ---------------------------------------------------------------------------

interface Voice {
  e: Engine;
  t: number; // 発音開始時刻（AudioContext 時間）
  p: number; // ピッチ倍率
  out: GainNode;
  nodes: AudioNode[];
  srcs: AudioScheduledSourceNode[];
  live: number; // 再生中のソース数
  end: number; // 最後のソースが止まる予定時刻
  done: (() => void) | null;
}

function voice(e: Engine, dest: AudioNode, gain: number, pitch: number, pan: number, t?: number): Voice {
  const ctx = e.ctx;
  const out = amp(ctx, gain);
  const v: Voice = { e, t: t ?? ctx.currentTime + 0.005, p: pitch, out, nodes: [out], srcs: [], live: 0, end: 0, done: null };
  if (pan !== 0 && typeof ctx.createStereoPanner === "function") {
    // モノラル入力の等パワーパンは中央で -3dB になるので、直結（pan=0）と音量が揃うよう補正
    out.gain.value = gain * Math.SQRT2;
    const pn = ctx.createStereoPanner();
    pn.pan.value = clamp(pan, -1, 1);
    out.connect(pn);
    pn.connect(dest);
    v.nodes.push(pn);
  } else {
    out.connect(dest);
  }
  return v;
}

function track(v: Voice, ...nodes: AudioNode[]): void {
  v.nodes.push(...nodes);
}

/** 開始済みのソースを登録して stop を予約する */
function live(v: Voice, s: AudioScheduledSourceNode, stopAt: number): void {
  v.nodes.push(s);
  v.srcs.push(s);
  v.live++;
  if (stopAt > v.end) v.end = stopAt;
  s.onended = () => {
    if (--v.live <= 0) dispose(v);
  };
  s.stop(stopAt);
}

function dispose(v: Voice): void {
  for (const n of v.nodes) {
    try {
      n.disconnect();
    } catch {
      /* 切断済み */
    }
  }
  v.nodes.length = 0;
  v.srcs.length = 0;
  v.live = 0;
  const done = v.done;
  v.done = null;
  done?.();
}

/** 組み立て終了。ソースが 1 つも無ければ即座に片付ける */
function seal(v: Voice): void {
  if (v.live <= 0) dispose(v);
}

/** 鳴っている音を今すぐ止める（onended で片付く） */
function hush(v: Voice): void {
  for (const s of v.srcs) {
    try {
      s.stop();
    } catch {
      /* 停止済み */
    }
  }
}

// ---------------------------------------------------------------------------
// 合成の部品
// ---------------------------------------------------------------------------

const hz = (v: Voice, f: number): number => clamp(f * v.p, 20, 16000);

/** 最初のイベントまで 0 のゲイン（既定値 1 が発音直前の 1 サンプルに漏れてクリックになるのを防ぐ） */
function vca(ctx: BaseAudioContext): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, 0);
  return g;
}

function amp(ctx: BaseAudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

function osc(ctx: BaseAudioContext, type: OscillatorType, f: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  return o;
}

function biquad(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q: number): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

/** 0 → peak（直線）→ hold → 指数減衰。終了時刻を返す */
function env(p: AudioParam, t: number, peak: number, a: number, hold: number, d: number): number {
  const pk = Math.max(peak, TINY * 2);
  p.setValueAtTime(TINY, t);
  p.linearRampToValueAtTime(pk, t + a);
  if (hold > 0) p.setValueAtTime(pk, t + a + hold);
  p.exponentialRampToValueAtTime(TINY, t + a + hold + d);
  return t + a + hold + d;
}

interface ToneOpts {
  w?: OscillatorType; // 波形（既定 sine）
  f: number; // 周波数 Hz
  f2?: number; // グライド先の周波数
  g?: number; // グライド時間（既定 = 音の長さ）
  at?: number; // 開始オフセット（秒）
  a?: number; // アタック
  hold?: number; // ピーク保持
  d: number; // 減衰時間
  v: number; // ピーク音量
  det?: number; // デチューン（cent）
  lp?: number; // ローパス（Hz）
}

function tone(v: Voice, o: ToneOpts, dest: AudioNode = v.out): OscillatorNode {
  const ctx = v.e.ctx;
  const t = v.t + (o.at ?? 0);
  const a = o.a ?? 0.003;
  const hold = o.hold ?? 0;
  const src = osc(ctx, o.w ?? "sine", hz(v, o.f));
  src.frequency.setValueAtTime(hz(v, o.f), t);
  if (o.f2 !== undefined) src.frequency.exponentialRampToValueAtTime(hz(v, o.f2), t + (o.g ?? a + hold + o.d));
  if (o.det) src.detune.value = o.det;
  const g = vca(ctx);
  const end = env(g.gain, t, o.v, a, hold, o.d);
  if (o.lp) {
    const lp = biquad(ctx, "lowpass", hz(v, o.lp), 0);
    src.connect(lp);
    lp.connect(g);
    track(v, lp);
  } else {
    src.connect(g);
  }
  g.connect(dest);
  track(v, g);
  src.start(t);
  live(v, src, end + 0.02);
  return src;
}

interface NoiseOpts {
  ft?: BiquadFilterType; // フィルター種別（既定 bandpass）
  f: number;
  f2?: number;
  g?: number;
  q?: number;
  at?: number;
  a?: number;
  hold?: number;
  d: number;
  v: number;
}

function noiseSrc(v: Voice): AudioBufferSourceNode {
  const src = v.e.ctx.createBufferSource();
  src.buffer = v.e.noise;
  src.loop = true;
  return src;
}

/** 共有ノイズをフィルターに通したバースト。スイープを足せるようフィルターを返す */
function noise(v: Voice, o: NoiseOpts, dest: AudioNode = v.out): BiquadFilterNode {
  const ctx = v.e.ctx;
  const t = v.t + (o.at ?? 0);
  const a = o.a ?? 0.002;
  const hold = o.hold ?? 0;
  const src = noiseSrc(v);
  const fl = biquad(ctx, o.ft ?? "bandpass", hz(v, o.f), o.q ?? 1);
  fl.frequency.setValueAtTime(hz(v, o.f), t);
  if (o.f2 !== undefined) fl.frequency.exponentialRampToValueAtTime(hz(v, o.f2), t + (o.g ?? a + hold + o.d));
  const g = vca(ctx);
  const end = env(g.gain, t, o.v, a, hold, o.d);
  src.connect(fl);
  fl.connect(g);
  g.connect(dest);
  track(v, fl, g);
  src.start(t, Math.random() * 1.5);
  live(v, src, end + 0.02);
  return fl;
}

interface CrackleOpts {
  at?: number;
  span: number; // バーストを散らす時間幅
  n: number; // バースト数
  f: readonly [number, number]; // 中心周波数の範囲
  q?: number;
  ft?: BiquadFilterType;
  v: number;
  d?: readonly [number, number]; // 1 粒の長さの範囲
}

/** パチパチ音: 1 本のノイズのゲインに短いバーストを並べる（ノード数を増やさない） */
function crackle(v: Voice, o: CrackleOpts): void {
  const ctx = v.e.ctx;
  const t0 = v.t + (o.at ?? 0);
  const [d0, d1] = o.d ?? [0.006, 0.02];
  const src = noiseSrc(v);
  const fl = biquad(ctx, o.ft ?? "bandpass", hz(v, o.f[0]), o.q ?? 1);
  const g = vca(ctx);
  const times = Array.from({ length: o.n }, () => Math.random() * o.span).sort((x, y) => x - y);
  let last = t0;
  for (const x of times) {
    const tt = Math.max(t0 + x, last + 0.002);
    const d = rand(d0, d1);
    fl.frequency.setValueAtTime(hz(v, rand(o.f[0], o.f[1])), tt);
    g.gain.setValueAtTime(o.v * rand(0.4, 1), tt);
    g.gain.exponentialRampToValueAtTime(TINY, tt + d);
    last = tt + d;
  }
  src.connect(fl);
  fl.connect(g);
  g.connect(v.out);
  track(v, fl, g);
  src.start(t0, Math.random() * 1.5);
  live(v, src, last + 0.02);
}

/** 低周波発振器を AudioParam に接続する（深さ用のゲインを返す） */
function lfo(v: Voice, rate: number, depth: number, target: AudioParam, at: number, d: number, w: OscillatorType = "sine"): GainNode {
  const ctx = v.e.ctx;
  const t = v.t + at;
  const o = osc(ctx, w, rate);
  const g = amp(ctx, depth);
  o.connect(g);
  g.connect(target);
  track(v, g);
  o.start(t);
  live(v, o, t + d);
  return g;
}

/** 電撃のジリジリ: ノコギリ波＋矩形波を矩形 LFO で刻み、音程を小刻みに揺らす */
function buzz(v: Voice, at: number, d: number, vol: number, f: number): void {
  const ctx = v.e.ctx;
  const t = v.t + at;
  const bp = biquad(ctx, "bandpass", hz(v, 1600), 0.8);
  const chop = amp(ctx, 0.5); // LFO ±0.5 → 0..1 で刻む
  const g = vca(ctx);
  env(g.gain, t, vol, 0.002, d * 0.3, d * 0.7);
  bp.connect(chop);
  chop.connect(g);
  g.connect(v.out);
  track(v, bp, chop, g);
  for (const [w, r] of [["sawtooth", 1], ["square", 1.51]] as const) {
    const o = osc(ctx, w, hz(v, f * r));
    o.frequency.setValueAtTime(hz(v, f * r), t);
    for (let k = 1; k < 6; k++) o.frequency.setValueAtTime(hz(v, f * r * rand(0.8, 1.3)), t + (d * k) / 6);
    o.connect(bp);
    o.start(t);
    live(v, o, t + d + 0.03);
  }
  lfo(v, 42, 0.5, chop.gain, at, d + 0.03, "square");
}

// ---------------------------------------------------------------------------
// 和楽器・金物（効果音と BGM で共用）
// ---------------------------------------------------------------------------

/** 大太鼓「ドン」: ピッチが落ちる低いサイン＋皮の打撃ノイズ */
function taiko(v: Voice, vel: number): void {
  tone(v, { f: 128, f2: 58, g: 0.13, d: 0.3 + 0.35 * vel, v: 0.42 * vel });
  tone(v, { f: 210, f2: 150, g: 0.08, d: 0.12, v: 0.2 * vel });
  noise(v, { ft: "lowpass", f: 1100, f2: 280, q: 0, d: 0.07, v: 0.25 * vel });
}

/** 太鼓の縁「カッ」 */
function ka(v: Voice, vel: number): void {
  noise(v, { f: 2300, q: 3, d: 0.03, v: 0.4 * vel });
  tone(v, { w: "triangle", f: 1180, f2: 900, d: 0.03, v: 0.1 * vel });
}

/** 締太鼓: 高く短い「テン」 */
function shime(v: Voice, vel: number): void {
  tone(v, { f: 560, f2: 380, g: 0.05, d: 0.08, v: 0.22 * vel });
  noise(v, { f: 3200, q: 1.3, d: 0.03, v: 0.16 * vel });
}

/** 当り鉦「チキ」: 非整数倍音の短い金属音 */
function kane(v: Voice, vel: number): void {
  for (const [r, k] of [[1, 1], [1.58, 0.6], [2.31, 0.35]] as const) {
    tone(v, { f: 1750 * r, d: 0.05 + 0.05 * k, v: 0.06 * vel * k });
  }
  noise(v, { ft: "highpass", f: 6500, d: 0.02, v: 0.05 * vel });
}

/** 三味線: ノコギリ波＋閉じていくローパス。撥の当たりと、さわり風のわずかなピッチ落ち */
function shamisen(v: Voice, at: number, f: number, vol: number, d = 0.4): void {
  const ctx = v.e.ctx;
  const t = v.t + at;
  const o = osc(ctx, "sawtooth", hz(v, f));
  o.frequency.setValueAtTime(hz(v, f * 1.012), t);
  o.frequency.exponentialRampToValueAtTime(hz(v, f), t + 0.04);
  const lp = biquad(ctx, "lowpass", hz(v, f * 9), 3);
  lp.frequency.setValueAtTime(hz(v, f * 9), t);
  lp.frequency.exponentialRampToValueAtTime(hz(v, Math.max(f * 1.6, 180)), t + 0.16);
  const g = vca(ctx);
  const end = env(g.gain, t, vol, 0.002, 0, d);
  o.connect(lp);
  lp.connect(g);
  g.connect(v.out);
  track(v, lp, g);
  o.start(t);
  live(v, o, end + 0.02);
  noise(v, { at, f: 2800, q: 1.4, d: 0.014, v: vol * 0.45 });
}

/** 琴: 三角波＋倍音の撥弦 */
function koto(v: Voice, at: number, f: number, vol: number, d = 1): void {
  tone(v, { w: "triangle", f, at, a: 0.002, d, v: vol });
  tone(v, { f: f * 2, at, a: 0.002, d: d * 0.45, v: vol * 0.3 });
  tone(v, { f: f * 3, at, a: 0.002, d: d * 0.2, v: vol * 0.12 });
  noise(v, { at, f: Math.min(f * 4, 9000), q: 2, d: 0.012, v: vol * 0.25 });
}

/** 篠笛: 三角波＋2倍音。長い音はしゃくり上げと遅れて深まるビブラート。息のノイズ付き */
function fue(v: Voice, at: number, f: number, dur: number, vol: number): void {
  const ctx = v.e.ctx;
  const t = v.t + at;
  vol *= Math.min(1, (1100 / f) ** 0.35); // 高音ほど耳につくので少し抑える
  const long = dur > 0.3;
  const end = t + Math.max(dur, 0.08);
  const g = vca(ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.03);
  g.gain.linearRampToValueAtTime(vol * 0.8, Math.max(end - 0.06, t + 0.04));
  g.gain.linearRampToValueAtTime(0, end);
  const lp = biquad(ctx, "lowpass", hz(v, f * 4), 0);
  lp.connect(g);
  g.connect(v.out);
  track(v, lp, g);
  const oscs: OscillatorNode[] = [];
  for (const [w, r, k] of [["triangle", 1, 1], ["sine", 2, 0.14]] as const) {
    const o = osc(ctx, w, hz(v, f * r));
    if (long) {
      o.detune.setValueAtTime(-60, t);
      o.detune.linearRampToValueAtTime(0, t + 0.06);
    }
    const og = amp(ctx, k);
    o.connect(og);
    og.connect(lp);
    track(v, og);
    o.start(t);
    live(v, o, end + 0.02);
    oscs.push(o);
  }
  if (long) {
    const vib = lfo(v, 5.4, 0, oscs[0].detune, at, dur + 0.05);
    vib.connect(oscs[1].detune);
    vib.gain.setValueAtTime(0, t + 0.12);
    vib.gain.linearRampToValueAtTime(14, t + 0.4);
  }
  noise(v, { at, f: f * 2, q: 1.5, d: 0.05, v: vol * 0.3 }); // 吹き始めの息
  noise(v, { at, f: f * 1.5, q: 0.9, a: 0.04, hold: Math.max(dur - 0.12, 0), d: 0.08, v: vol * 0.07 });
}

type PadKind = "drone" | "dark" | "sho";
const PADS: Record<PadKind, { w: OscillatorType; parts: readonly (readonly [number, number])[]; lp: number; a: number }> = {
  drone: { w: "triangle", parts: [[0.5, 0.7], [1, 1], [1.003, 0.6], [1.5, 0.5]], lp: 900, a: 0.5 },
  dark: { w: "sawtooth", parts: [[0.5, 0.8], [1, 0.6], [1.006, 0.6], [1.5, 0.35]], lp: 420, a: 0.6 },
  sho: { w: "sine", parts: [[1, 0.7], [1.5, 0.6], [2, 0.5], [2.25, 0.35], [3, 0.25]], lp: 6000, a: 0.9 }, // 笙の合竹風
};

/** 持続音（ドローン / 暗いうなり / 笙） */
function pad(v: Voice, f: number, dur: number, vol: number, kind: PadKind): void {
  const ctx = v.e.ctx;
  const t = v.t;
  const P = PADS[kind];
  const stop = t + Math.max(dur, P.a + 0.6);
  const lp = biquad(ctx, "lowpass", P.lp, 0);
  const g = vca(ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + P.a);
  g.gain.setValueAtTime(vol, stop - 0.6);
  g.gain.linearRampToValueAtTime(0, stop);
  lp.connect(g);
  g.connect(v.out);
  track(v, lp, g);
  for (const [r, k] of P.parts) {
    const o = osc(ctx, P.w, f * r);
    const og = amp(ctx, k / P.parts.length);
    o.connect(og);
    og.connect(lp);
    track(v, og);
    o.start(t);
    live(v, o, stop + 0.05);
  }
}

/** 鈴・鐘: 非整数倍音のサイン */
function bell(v: Voice, at: number, f: number, d: number, vol: number): void {
  tone(v, { f, at, d, v: vol });
  tone(v, { f: f * 2.76, at, d: d * 0.5, v: vol * 0.45 });
  tone(v, { f: f * 5.4, at, d: d * 0.25, v: vol * 0.2 });
}

const METAL = [1, 1.47, 2.09, 2.56, 3.18, 4.07];
/** 金属の打撃「キィン」 */
function clang(v: Voice, at: number, f: number, d: number, vol: number): void {
  METAL.forEach((r, i) => tone(v, { w: i === 0 ? "triangle" : "sine", f: f * r, at, d: d / (1 + i * 0.35), v: vol / (1 + i * 0.4) }));
}

const GONG = [1, 1.47, 2.03, 2.72, 3.37, 4.15, 5.23];
/** 銅鑼: 高い倍音ほど遅れて膨らみ、わずかに音程が下がる */
function gong(v: Voice, at: number, f: number, vol: number): void {
  GONG.forEach((r, i) =>
    tone(v, { f: f * r, f2: f * r * 0.992, at, a: 0.12 + i * 0.07, hold: 0.1, d: 2.6 - i * 0.28, v: vol / (1 + i * 0.45) }),
  );
  noise(v, { at, f: 1400, q: 0.7, a: 0.35, d: 1.4, v: vol * 0.25 });
}

/** 単音を順に鳴らすチャイム */
function chime(v: Voice, at: number, notes: readonly number[], gap: number, d: number, vol: number): void {
  notes.forEach((f, i) => tone(v, { f, at: at + i * gap, d, v: vol }));
}

// ---------------------------------------------------------------------------
// 効果音
// ---------------------------------------------------------------------------

const SFX: Record<SfxName, (v: Voice) => void> = {
  // --- 動作 ---
  swing: (v) => {
    noise(v, { f: 700, f2: 2600, q: 1.4, a: 0.025, d: 0.1, v: 0.3 });
  },
  swingHeavy: (v) => {
    noise(v, { f: 300, f2: 1500, q: 1.2, a: 0.05, d: 0.2, v: 0.4 });
    tone(v, { f: 150, f2: 70, a: 0.03, d: 0.2, v: 0.16 });
  },
  jump: (v) => {
    tone(v, { w: "triangle", f: 260, f2: 620, g: 0.08, d: 0.1, v: 0.18 });
    noise(v, { f: 1200, f2: 3000, a: 0.01, d: 0.07, v: 0.07 });
  },
  doubleJump: (v) => {
    tone(v, { w: "triangle", f: 420, f2: 960, g: 0.09, d: 0.12, v: 0.14 });
    noise(v, { f: 1800, f2: 4200, q: 1.2, a: 0.02, d: 0.1, v: 0.1 });
  },
  land: (v) => {
    tone(v, { f: 130, f2: 55, d: 0.09, v: 0.28 });
    noise(v, { ft: "lowpass", f: 700, f2: 250, d: 0.07, v: 0.2 });
  },
  dash: (v) => {
    noise(v, { f: 1000, f2: 380, q: 0.9, a: 0.01, d: 0.13, v: 0.22 });
    noise(v, { ft: "lowpass", f: 500, d: 0.05, v: 0.12 });
  },
  shield: (v) => {
    tone(v, { f: 330, f2: 440, g: 0.08, a: 0.02, d: 0.2, v: 0.1 });
    tone(v, { w: "triangle", f: 660, f2: 880, g: 0.08, a: 0.02, d: 0.16, v: 0.05, det: 8 });
  },
  shieldHit: (v) => {
    tone(v, { f: 1250, d: 0.14, v: 0.08 });
    tone(v, { f: 1890, d: 0.1, v: 0.05 });
    noise(v, { f: 3200, q: 3, d: 0.04, v: 0.15 });
    tone(v, { f: 160, f2: 90, d: 0.07, v: 0.15 });
  },
  shieldBreak: (v) => { // ガラスが砕ける＋落ちていく音
    crackle(v, { span: 0.35, n: 14, f: [2500, 8000], q: 4, v: 0.28, d: [0.01, 0.05] });
    tone(v, { w: "triangle", f: 900, f2: 180, g: 0.5, d: 0.55, v: 0.13 });
    tone(v, { f: 110, f2: 45, d: 0.35, v: 0.38 });
    noise(v, { ft: "highpass", f: 3500, d: 0.3, v: 0.1 });
    duck(v.e, 0.3, 0.3);
  },
  dodge: (v) => {
    noise(v, { f: 3200, f2: 1100, q: 1.1, a: 0.035, d: 0.12, v: 0.16 });
  },
  ledge: (v) => {
    noise(v, { f: 1600, q: 2.5, d: 0.03, v: 0.16 });
    tone(v, { w: "triangle", f: 480, f2: 720, at: 0.01, d: 0.08, v: 0.09 });
  },
  grab: (v) => {
    noise(v, { f: 1300, q: 2, d: 0.05, v: 0.22 });
    tone(v, { w: "square", f: 190, f2: 120, d: 0.06, v: 0.06, lp: 900 });
  },
  throw: (v) => {
    noise(v, { f: 500, f2: 2600, q: 1.2, a: 0.04, d: 0.2, v: 0.28 });
    tone(v, { f: 200, f2: 520, d: 0.18, v: 0.1 });
  },
  // --- 撃墜・復帰 ---
  ko: (v) => { // ブーム＋上昇スイープ＋余韻、最後に星のきらめき
    tone(v, { f: 95, f2: 28, g: 0.9, d: 1.1, v: 0.42 });
    tone(v, { w: "triangle", f: 190, f2: 50, g: 0.4, d: 0.45, v: 0.16 });
    noise(v, { ft: "lowpass", f: 4000, f2: 250, g: 0.8, q: 0, d: 0.9, v: 0.36 });
    noise(v, { f: 350, f2: 7000, g: 0.55, q: 2.2, at: 0.05, a: 0.35, d: 0.3, v: 0.2 });
    noise(v, { ft: "lowpass", f: 900, q: 0, at: 0.3, a: 0.3, d: 1.4, v: 0.12 });
    bell(v, 0.62, 2093, 0.5, 0.035);
    duck(v.e, 0.55, 0.9);
  },
  respawn: (v) => {
    chime(v, 0, [587, 659, 784, 880, 1175, 1319], 0.05, 0.35, 0.07);
    noise(v, { ft: "highpass", f: 6000, a: 0.15, d: 0.3, v: 0.035 });
  },
  // --- 忍具・忍術 ---
  projectile: (v) => { // 手裏剣: シュッ＋金属の鳴り
    noise(v, { f: 2000, f2: 900, a: 0.01, d: 0.12, v: 0.12 });
    noise(v, { f: 5200, q: 5, d: 0.06, v: 0.1 });
    tone(v, { f: 2600, f2: 2000, d: 0.1, v: 0.04 });
  },
  gun: (v) => { // 火縄銃: 乾いた破裂＋低い衝撃＋煙の尾
    noise(v, { ft: "highpass", f: 1200, d: 0.035, v: 0.4 });
    noise(v, { ft: "lowpass", f: 2400, f2: 300, d: 0.28, v: 0.32 });
    tone(v, { f: 160, f2: 45, d: 0.18, v: 0.35 });
    noise(v, { ft: "lowpass", f: 500, at: 0.05, a: 0.05, d: 0.6, v: 0.07 });
  },
  counter: (v) => { // 見切り: キンッ＋上昇音
    noise(v, { f: 4000, q: 2, d: 0.03, v: 0.28 });
    clang(v, 0, 1320, 0.35, 0.06);
    tone(v, { f: 1500, f2: 3000, at: 0.05, a: 0.02, d: 0.18, v: 0.035 });
  },
  charge: (v) => { // 溜め: 上昇するうなり
    tone(v, { w: "sawtooth", f: 110, f2: 440, g: 0.55, a: 0.3, hold: 0.15, d: 0.15, v: 0.07, lp: 1400 });
    tone(v, { f: 220, f2: 880, g: 0.55, a: 0.3, hold: 0.15, d: 0.15, v: 0.06 });
    noise(v, { f: 800, f2: 5000, g: 0.6, q: 2, a: 0.45, d: 0.15, v: 0.05 });
  },
  heal: (v) => {
    chime(v, 0, [1047, 1175, 1397, 1568, 1760, 2093], 0.06, 0.4, 0.05);
    tone(v, { f: 523, a: 0.1, hold: 0.1, d: 0.4, v: 0.05 });
  },
  explosion: (v) => {
    tone(v, { f: 80, f2: 30, g: 0.6, d: 0.8, v: 0.45 });
    noise(v, { ft: "lowpass", f: 3000, f2: 180, g: 0.7, q: 0, d: 0.8, v: 0.4 });
    crackle(v, { at: 0.05, span: 0.5, n: 10, f: [800, 3500], q: 1.5, v: 0.18, d: [0.01, 0.04] });
    duck(v.e, 0.4, 0.4);
  },
  clone: (v) => { // 分身の術: ドロン
    tone(v, { f: 700, f2: 180, d: 0.12, v: 0.16 });
    noise(v, { f: 900, f2: 250, q: 0.9, a: 0.02, d: 0.3, v: 0.26 });
    tone(v, { w: "triangle", f: 350, f2: 260, at: 0.08, d: 0.15, v: 0.07 });
  },
  teleport: (v) => { // 瞬身: シュン
    noise(v, { f: 6500, f2: 700, q: 1.8, a: 0.01, d: 0.16, v: 0.2 });
    tone(v, { f: 1800, f2: 350, d: 0.16, v: 0.06 });
    tone(v, { f: 1568, at: 0.14, d: 0.2, v: 0.035 });
  },
  summon: (v) => { // 口寄せ: ボンッ＋立ち上る音
    tone(v, { f: 120, f2: 50, d: 0.5, v: 0.45 });
    noise(v, { ft: "lowpass", f: 1400, f2: 250, q: 0, a: 0.02, d: 0.55, v: 0.36 });
    for (const f of [220, 330]) tone(v, { w: "triangle", f, f2: f * 2, g: 0.25, at: 0.05, a: 0.05, d: 0.3, v: 0.07 });
  },
  // --- UI・進行 ---
  uiMove: (v) => {
    tone(v, { w: "triangle", f: 1320, d: 0.035, v: 0.08 });
    noise(v, { f: 3000, q: 3, d: 0.012, v: 0.04 });
  },
  uiSelect: (v) => {
    koto(v, 0, 1319, 0.1, 0.35);
    koto(v, 0.06, 1760, 0.1, 0.45);
  },
  uiBack: (v) => {
    koto(v, 0, 880, 0.09, 0.25);
    koto(v, 0.06, 659, 0.09, 0.3);
  },
  countdown: (v) => {
    tone(v, { w: "square", f: 880, hold: 0.06, d: 0.12, v: 0.05, lp: 2500 });
    tone(v, { f: 880, hold: 0.06, d: 0.14, v: 0.11 });
  },
  go: (v) => { // 明るい和音のスタブ＋太鼓
    taiko(v, 0.9);
    for (const f of [587.3, 880, 1174.7, 1480]) tone(v, { w: "sawtooth", f, a: 0.005, hold: 0.06, d: 0.45, v: 0.04, lp: 3800 });
    tone(v, { f: 2349, d: 0.4, v: 0.035 });
    noise(v, { ft: "highpass", f: 4000, d: 0.15, v: 0.07 });
  },
  gameSet: (v) => { // 大太鼓の一打＋銅鑼のうねり
    taiko(v, 1.2);
    tone(v, { f: 80, f2: 40, d: 0.9, v: 0.22 });
    gong(v, 0.05, 98, 0.09);
    duck(v.e, 0.6, 1.6);
  },
  pause: (v) => {
    tone(v, { f: 988, d: 0.1, v: 0.09 });
    tone(v, { f: 659, at: 0.08, d: 0.18, v: 0.09 });
  },
  join: (v) => { // 鼓「ポン」＋鈴
    tone(v, { f: 520, f2: 330, g: 0.05, d: 0.25, v: 0.2 });
    tone(v, { w: "triangle", f: 1040, d: 0.05, v: 0.05 });
    noise(v, { f: 1500, q: 2, d: 0.02, v: 0.1 });
    chime(v, 0.12, [1175, 1568], 0.08, 0.3, 0.06);
  },
};

/**
 * 効果音ごとの音量補正（dB）。帯域を絞ったノイズ系は実効音量が小さいので持ち上げ、
 * 日常的な動作音が BGM より少し上、打撃はさらに上、撃墜などの大きな出来事が最上位になるよう揃えてある
 */
const SFX_TRIM: Partial<Record<SfxName, number>> = {
  swing: 12, swingHeavy: 3.5, jump: 7, doubleJump: 7.5, land: 3, dash: 13, shield: 4, shieldHit: 6,
  dodge: 10, ledge: 12, grab: 11, throw: 6, respawn: 4, projectile: 12, counter: 6, charge: 2, heal: 3,
  clone: 4, teleport: 8, uiMove: 11, uiSelect: 3, uiBack: 4, pause: 7,
};

/** 連打しても機械的に聞こえないよう、動作系だけ音程を ±3% 揺らす */
const STEADY: ReadonlySet<SfxName> = new Set<SfxName>([
  "uiMove", "uiSelect", "uiBack", "countdown", "go", "gameSet", "pause", "join", "respawn", "heal",
]);

// ---------------------------------------------------------------------------
// 打撃音と属性ごとの味付け
// ---------------------------------------------------------------------------

const PETAL = [1760, 1976, 2349, 2637];

/** 打撃の上に重ねる属性レイヤー（s = 強さ 0..1） */
const HIT_FX: Record<HitFx, (v: Voice, s: number) => void> = {
  normal: (v, s) => {
    tone(v, { w: "triangle", f: 320 - 100 * s, f2: 140, d: 0.06 + 0.06 * s, v: 0.12 });
  },
  slash: (v, s) => { // 明るいハイパスの斬撃音＋刃鳴り
    noise(v, { ft: "highpass", f: 2800, f2: 6500, q: 0, a: 0.006, d: 0.09 + 0.1 * s, v: 0.3 + 0.12 * s });
    tone(v, { f: 3100, f2: 2850, d: 0.12 + 0.1 * s, v: 0.025 });
  },
  fire: (v, s) => { // パチパチ＋ボッ
    crackle(v, { span: 0.15 + 0.2 * s, n: 5 + Math.round(5 * s), f: [1500, 5000], q: 1.2, v: 0.2 + 0.1 * s });
    noise(v, { ft: "lowpass", f: 900, f2: 180, a: 0.01, d: 0.18 + 0.2 * s, v: 0.18 + 0.1 * s });
  },
  elec: (v, s) => {
    buzz(v, 0, 0.12 + 0.16 * s, 0.1 + 0.05 * s, 110);
    crackle(v, { span: 0.12 + 0.12 * s, n: 4 + Math.round(4 * s), f: [3000, 8000], ft: "highpass", v: 0.14 });
  },
  water: (v, s) => { // 低いバンドパスの「ボコッ」
    tone(v, { f: 240, f2: 560, g: 0.06, d: 0.09, v: 0.15 });
    tone(v, { f: 310, f2: 720, g: 0.05, at: 0.05, d: 0.08, v: 0.09 });
    noise(v, { f: 900, f2: 350, q: 1.4, a: 0.01, d: 0.14 + 0.14 * s, v: 0.2 + 0.08 * s });
  },
  wind: (v, s) => {
    noise(v, { f: 500, f2: 2200, g: 0.12, q: 3, a: 0.03, d: 0.16 + 0.14 * s, v: 0.2 });
    noise(v, { ft: "highpass", f: 1500, f2: 4000, a: 0.02, d: 0.1, v: 0.1 });
  },
  poison: (v, s) => {
    noise(v, { ft: "highpass", f: 3500, a: 0.01, d: 0.22 + 0.2 * s, v: 0.1 });
    lfo(v, 14, 50, tone(v, { f: 150, d: 0.22, v: 0.13, lp: 600 }).frequency, 0, 0.25);
  },
  dark: (v, s) => { // デチューンした低いノコギリ波
    for (const f of [55, 57.5]) tone(v, { w: "sawtooth", f, a: 0.01, d: 0.32 + 0.2 * s, v: 0.13, lp: 480 });
    noise(v, { ft: "lowpass", f: 600, f2: 150, a: 0.04, d: 0.28, v: 0.12 });
  },
  light: (v, s) => {
    bell(v, 0, 1175, 0.45 + 0.4 * s, 0.09);
  },
  petal: (v, s) => {
    noise(v, { f: 2400, f2: 1400, q: 2, a: 0.02, d: 0.14 + 0.1 * s, v: 0.14 });
    for (let i = 0; i < 3; i++) tone(v, { f: pick(PETAL), at: i * 0.04, d: 0.2, v: 0.04 });
  },
  metal: (v, s) => {
    clang(v, 0, 520 - 120 * s, 0.45 + 0.3 * s, 0.07);
    noise(v, { f: 5000, q: 2, d: 0.025, v: 0.22 });
  },
  ink: (v, s) => {
    noise(v, { ft: "lowpass", f: 1600, f2: 260, q: 1.2, a: 0.004, d: 0.13 + 0.1 * s, v: 0.28 });
    tone(v, { f: 170, f2: 80, d: 0.1, v: 0.15 });
    crackle(v, { at: 0.03, span: 0.15, n: 4, f: [1200, 2600], q: 3, v: 0.1, d: [0.008, 0.02] });
  },
  sound: (v, s) => { // 撥の一撃＋音波のうなり
    shamisen(v, 0, 220, 0.14 + 0.08 * s, 0.3);
    lfo(v, 28, 80, tone(v, { f: 660, d: 0.2 + 0.2 * s, v: 0.05 }).frequency, 0, 0.45);
  },
};

/** 低い「ドッ」＋ノイズの破裂音。強いほど大きく長く低く、0.75 超でサブの衝撃 */
function hitSound(v: Voice, s: number, fx: HitFx): void {
  const L = (a: number, b: number): number => a + (b - a) * s;
  const body = fx === "slash" || fx === "petal" || fx === "light" ? 0.6 : 1;
  tone(v, { f: L(190, 110), f2: L(75, 38), g: L(0.08, 0.2), d: L(0.1, 0.3), v: L(0.26, 0.38) * body });
  noise(v, { f: L(2600, 1300), q: 0.8, d: L(0.035, 0.11), v: L(0.2, 0.38) });
  if (s > 0.75) {
    const k = (s - 0.75) * 4;
    tone(v, { f: 62, f2: 26, g: 0.6, d: 0.7, v: 0.12 + 0.13 * k });
    noise(v, { ft: "lowpass", f: 900, f2: 150, q: 0, a: 0.01, d: 0.6, v: 0.12 + 0.16 * k });
    duck(v.e, 0.3, 0.25);
  }
  HIT_FX[fx](v, s);
}

/** 忍術の発動音の音量補正（dB） */
const ELEMENT_TRIM: Partial<Record<HitFx, number>> = {
  normal: 10, slash: 3, fire: 1, elec: 4, water: 8, wind: 8, dark: 3, light: 5, petal: 11, metal: 5, ink: 6,
};

/** 忍術の発動音 */
const ELEMENT: Record<HitFx, (v: Voice) => void> = {
  normal: (v) => { // 印を結んで気を放つ
    noise(v, { f: 600, f2: 2400, q: 1.2, a: 0.03, d: 0.16, v: 0.2 });
    tone(v, { f: 440, f2: 880, d: 0.15, v: 0.07 });
  },
  slash: (v) => { // 斬撃: 抜刀の「シャキン」＋空を裂く音
    noise(v, { f: 4500, q: 6, d: 0.05, v: 0.16 });
    tone(v, { f: 2900, f2: 3300, d: 0.25, v: 0.035 });
    noise(v, { ft: "highpass", f: 1800, f2: 5500, q: 0, at: 0.06, a: 0.03, d: 0.14, v: 0.2 });
  },
  fire: (v) => { // 火遁: 火球の発射
    noise(v, { ft: "lowpass", f: 300, f2: 2600, g: 0.12, a: 0.04, d: 0.35, v: 0.34 });
    tone(v, { f: 110, f2: 60, d: 0.3, v: 0.2 });
    crackle(v, { at: 0.05, span: 0.35, n: 8, f: [1500, 5000], q: 1.2, v: 0.13 });
  },
  elec: (v) => { // 雷遁: バリバリッ
    noise(v, { ft: "highpass", f: 2500, d: 0.04, v: 0.38 });
    crackle(v, { span: 0.35, n: 12, f: [2000, 7000], ft: "highpass", v: 0.2, d: [0.004, 0.018] });
    buzz(v, 0, 0.32, 0.08, 98);
  },
  water: (v) => { // 水遁: しぶき＋泡
    noise(v, { f: 1400, f2: 450, q: 1.1, a: 0.01, d: 0.32, v: 0.26 });
    for (let i = 0; i < 4; i++) {
      const f = rand(280, 700);
      tone(v, { f, f2: f * 2.2, g: 0.05, at: 0.03 + i * 0.055, d: 0.06, v: 0.08 });
    }
  },
  wind: (v) => { // 風遁: 突風（中心周波数が上がって下がる）
    const fl = noise(v, { f: 400, f2: 1800, g: 0.22, q: 2.4, a: 0.14, hold: 0.06, d: 0.32, v: 0.24 });
    fl.frequency.exponentialRampToValueAtTime(hz(v, 600), v.t + 0.55);
    noise(v, { f: 900, f2: 3000, g: 0.25, q: 1.5, at: 0.05, a: 0.1, d: 0.3, v: 0.1 });
  },
  poison: (v) => { // 毒: シューッ＋ぐつぐつ
    noise(v, { ft: "highpass", f: 3200, a: 0.06, hold: 0.1, d: 0.4, v: 0.13 });
    lfo(v, 13, 70, tone(v, { f: 170, a: 0.02, d: 0.45, v: 0.12, lp: 700 }).frequency, 0, 0.5, "square");
  },
  dark: (v) => { // 闇: 低いうねり
    noise(v, { ft: "lowpass", f: 200, f2: 1300, g: 0.25, q: 1.5, a: 0.2, d: 0.3, v: 0.24 });
    for (const f of [55, 58.3]) tone(v, { w: "sawtooth", f, a: 0.15, d: 0.4, v: 0.1, lp: 420 });
  },
  light: (v) => { // 光: 聖なる鈴
    bell(v, 0, 1319, 0.9, 0.07);
    bell(v, 0.07, 1760, 0.9, 0.055);
    bell(v, 0.14, 2637, 0.8, 0.04);
  },
  petal: (v) => { // 花: ひらひら舞う
    lfo(v, 5, 700, noise(v, { f: 1500, q: 2.5, a: 0.08, hold: 0.1, d: 0.3, v: 0.12 }).frequency, 0, 0.5);
    for (let i = 0; i < 4; i++) tone(v, { f: pick(PETAL), at: 0.03 + i * 0.07, d: 0.25, v: 0.035 });
  },
  metal: (v) => { // 金: キィン
    clang(v, 0, 740, 0.7, 0.07);
    noise(v, { f: 6000, q: 2, d: 0.02, v: 0.28 });
  },
  ink: (v) => { // 墨: べちゃっ＋飛沫
    noise(v, { ft: "lowpass", f: 1800, f2: 280, q: 1.5, a: 0.005, d: 0.18, v: 0.3 });
    tone(v, { f: 190, f2: 75, d: 0.12, v: 0.15 });
    crackle(v, { at: 0.05, span: 0.2, n: 5, f: [900, 2400], q: 4, v: 0.11, d: [0.01, 0.03] });
  },
  sound: (v) => { // 音: 三味線ベベン
    shamisen(v, 0, 294, 0.2, 0.5);
    shamisen(v, 0.13, 392, 0.2, 0.6);
  },
};

// ---------------------------------------------------------------------------
// BGM: テーマ定義
// ---------------------------------------------------------------------------

// 5音音階（主音からの半音数）。度数は 5 で 1 オクターブ上がる
const YO = [0, 2, 5, 7, 9]; // 陽音階（民謡の明るい響き）
const MIYAKO = [0, 1, 5, 7, 8]; // 都節（陰音階）
const INSEN = [0, 1, 5, 7, 10]; // 陰旋法
const RITSU = [0, 2, 5, 7, 10]; // 律音階（雅楽）
const RYUKYU = [0, 4, 5, 7, 11]; // 琉球音階

type Inst = "fue" | "koto" | "shamisen";
interface Theme {
  bpm: number;
  key: number; // 主音（MIDI）
  scale: readonly number[];
  prog: readonly number[]; // 8 小節ぶんの根音（度数）
  seed: number;
  swing: number;
  range: readonly [number, number]; // 旋律の音域（度数）
  dens: number; // 旋律の密度 0..1
  lead: readonly [Inst, Inst]; // 前半 / 後半 8 小節の旋律楽器
  low: number; // 低音の基準度数
  // 16 ステップの譜面 [基本, 後半, フィル（各 8 小節目）]
  taiko: readonly string[]; // X=強 x=弱 k=縁
  shime: readonly string[]; // x=強 o=弱
  kane?: readonly string[];
  bass: readonly string[]; // 数字 = 根音からの度数
  bassInst: Inst;
  arp?: readonly string[]; // 琴のアルペジオ（数字 = 度数）
  pad: PadKind | null;
}

const THEMES: Record<BgmTheme, Theme> = {
  // タイトル: 重い太鼓とドローンに篠笛がゆったり乗る、劇的なループ
  title: {
    bpm: 96, key: 64, scale: INSEN, prog: [0, 0, 0, 0, 1, 1, 4, 3], seed: 11, swing: 0,
    range: [4, 11], dens: 0.35, lead: ["fue", "fue"], low: -5,
    taiko: ["X.......X...x...", "X.....x.X...x.x.", "X...X...X.X.XXXX"],
    shime: ["........x.......", "....x.......x...", "....x...x.x.xxxx"],
    bass: ["0.......0.....3.", "0.......0...3.2."], bassInst: "shamisen",
    pad: "drone",
  },
  // キャラ選択: 琴が主役の軽いループ
  select: {
    bpm: 118, key: 57, scale: YO, prog: [0, 3, 2, 3, 0, 3, 4, 3], seed: 23, swing: 0.06,
    range: [4, 11], dens: 0.6, lead: ["koto", "fue"], low: -5,
    taiko: ["x.......x.......", "x.....x.x.......", "x.......x...x.x."],
    shime: ["..o...o...o...o.", "..o...o...o.o.o.", "..o...o.o.o.oooo"],
    bass: ["0...3...5...3...", "0...3...5.3.2..."], bassInst: "koto",
    pad: null,
  },
  // 伊賀: 勇ましく疾走する
  iga: {
    bpm: 150, key: 62, scale: YO, prog: [0, 0, 2, 3, 0, 0, 4, 3], seed: 7, swing: 0,
    range: [4, 11], dens: 0.75, lead: ["fue", "fue"], low: -5,
    taiko: ["X..x..x.X...x.k.", "X..x..x.X..xx.k.", "X.x.x.x.XxxxXxXX"],
    shime: ["x.o.x.o.x.o.x.oo", "x.oox.o.x.oox.oo", "x.o.x.o.xoxoxxxx"],
    bass: ["0.0.5.0.3.0.5.3.", "0.05.03.0.05.32."], bassInst: "shamisen",
    pad: "drone",
  },
  // 天界: 笙と琴のアルペジオで空に抜ける、雄大で軽やか
  tenkai: {
    bpm: 140, key: 53, scale: RITSU, prog: [0, 0, 2, 2, 3, 3, 4, 3], seed: 31, swing: 0,
    range: [6, 13], dens: 0.45, lead: ["fue", "koto"], low: 0,
    taiko: ["X.......x.......", "X.......x...x...", "X...x...X.x.x.x."],
    shime: ["....x.......x...", "..o.x...o.o.x...", "..o.x.o.x.o.xoxo"],
    bass: ["0.......3.......", "0.......3...2..."], bassInst: "koto",
    arp: ["0.2.3.5.7.5.3.2.", "0.3.5.8.7.5.3.2."],
    pad: "sho",
  },
  // 根の国: 都節と暗いうなり、低い三味線で不穏に
  nenokuni: {
    bpm: 144, key: 57, scale: MIYAKO, prog: [0, 0, 1, 0, 0, 0, 4, 3], seed: 13, swing: 0,
    range: [5, 12], dens: 0.6, lead: ["fue", "shamisen"], low: -5,
    taiko: ["X..x...xX..x....", "X..x..xxX..x..x.", "XxxxX.x.XxXxXXXX"],
    shime: ["o.o.o.o.o.o.o.o.", "o.o.x.o.o.o.x.o.", "o.o.o.o.xoxoxoxo"],
    bass: ["0.00.0..1.0.0.3.", "0.00.0.01.0.3.1."], bassInst: "shamisen",
    pad: "dark",
  },
  // 雑賀: 跳ねる祭囃子（琉球音階＋当り鉦）
  saika: {
    bpm: 160, key: 55, scale: RYUKYU, prog: [0, 0, 2, 3, 0, 0, 2, 3], seed: 5, swing: 0.12,
    range: [6, 13], dens: 0.8, lead: ["fue", "shamisen"], low: 0,
    taiko: ["X.k.x.k.X.k.x.kk", "X.k.x.kxX.k.x.kk", "X.x.x.xxX.xxXkXk"],
    shime: ["x.oox.oox.oox.oo", "x.oox.oox.ooxxoo", "xoxoxoxoxxxxxxxx"],
    kane: ["x..x..x.x..x..x.", "x..x..x.x..x.xx.", "x.x.x.x.xxxxxxxx"],
    bass: ["0.3.5.3.0.3.5.3.", "0.3.5.30.3.5.32."], bassInst: "shamisen",
    pad: null,
  },
  // リザルト: 落ち着いた凱歌
  results: {
    bpm: 92, key: 60, scale: YO, prog: [0, 0, 2, 2, 3, 3, 0, 0], seed: 3, swing: 0,
    range: [4, 11], dens: 0.5, lead: ["fue", "koto"], low: -5,
    taiko: ["X...............", "X.......x.......", "X.......x...x.x."],
    shime: ["........x.......", "....x.......x...", "....x...x.x.x.x."],
    bass: ["0...3...5...3...", "0...3...5...7..."], bassInst: "koto",
    pad: "sho",
  },
};

// ---------------------------------------------------------------------------
// BGM: 旋律の自動作曲（シード付き乱数で毎回同じ曲になる）
// ---------------------------------------------------------------------------

type Rand = () => number;
interface Note {
  d: number; // 度数
  len: number; // ステップ数
}
type Line = (Note | null)[];

function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function semi(scale: readonly number[], d: number): number {
  const o = Math.floor(d / 5);
  return o * 12 + scale[d - o * 5];
}

const degHz = (th: Theme, d: number): number => mtof(th.key + semi(th.scale, d));

/** 小節の根音に対して 1度 / 4度 / 5度 になる音（四度和声で落ち着いて響く） */
function stable(scale: readonly number[], d: number, root: number): boolean {
  const iv = mod(semi(scale, d) - semi(scale, root), 12);
  return iv === 0 || iv === 5 || iv === 7;
}

/** 条件を満たす最寄りの度数。dir の向きを優先する（旋律の流れを保つ） */
function near(d: number, ok: (x: number) => boolean, dir = -1): number {
  for (let k = 0; k <= 6; k++) {
    if (ok(d + dir * k)) return d + dir * k;
    if (ok(d - dir * k)) return d - dir * k;
  }
  return d;
}

const WALK = [-2, -1, -1, -1, 0, 1, 1, 1, 2];

/**
 * 2 小節のモチーフ。3 拍目（24 ステップ目）で着地して伸ばし、呼びかけ / 応答の間を作る。
 * cadence=true なら主音で終止、false なら主音以外の安定音で「開いた」終わり方にする
 */
function motif(r: Rand, th: Theme, bar0: number, start: number, lo: number, hi: number, dens: number, bias: number, cadence: boolean): Line {
  const line: Line = new Array<Note | null>(32).fill(null);
  const on: number[] = [];
  for (let p = 0; p < 24; p++) {
    let w = p % 16 === 0 ? 0.92 : p % 8 === 0 ? 0.7 : p % 4 === 0 ? 0.3 + 0.35 * dens : p % 2 === 0 ? 0.45 * dens : 0.12 * dens;
    if (on[on.length - 1] === p - 1) w *= 0.35; // 16 分の連続は控えめに
    if (r() < w) on.push(p);
  }
  if (on.length === 0 || on[0] > 4) on.unshift(0);
  on.push(24);
  const inR = (x: number): boolean => x >= lo && x <= hi;
  let d = start;
  on.forEach((p, i) => {
    const root = th.prog[(bar0 + (p >> 4)) % 8];
    const ok = (x: number): boolean => inR(x) && stable(th.scale, x, root);
    if (i === on.length - 1) {
      d = cadence ? near(d, (x) => inR(x) && mod(x, 5) === 0) : near(d, (x) => ok(x) && mod(x, 5) !== 0);
    } else if (i === 0) {
      d = near(d, ok);
    } else {
      let step = WALK[Math.floor(r() * WALK.length)] + (r() < 0.25 ? bias : 0);
      if (step === 0 && r() < 0.75) step = r() < 0.5 ? -1 : 1; // 同音の連続は控えめに
      d += step;
      if (d < lo) d = 2 * lo - d;
      if (d > hi) d = 2 * hi - d;
      d = clamp(d, lo, hi);
      if (p % 8 === 0) d = near(d, ok, step >= 0 ? 1 : -1);
    }
    const next = i + 1 < on.length ? on[i + 1] : 32;
    line[p] = { d, len: Math.min(next - p, i === on.length - 1 ? 8 : 6) };
  });
  return line;
}

/** 1 小節目はそのまま、2 小節目を 1 度ずらした変奏（反復進行） */
function vary(r: Rand, th: Theme, src: Line, bar0: number, lo: number, hi: number): Line {
  const shift = r() < 0.5 ? 1 : -1;
  const root = th.prog[(bar0 + 1) % 8];
  const ok = (x: number): boolean => x >= lo && x <= hi && stable(th.scale, x, root);
  return src.map((n, p) => {
    if (!n || p < 16) return n;
    let d = p === 24 ? n.d : clamp(n.d + shift, lo, hi);
    if (p % 8 === 0) d = near(d, p === 24 ? (x) => ok(x) && mod(x, 5) !== 0 : ok);
    return { d, len: n.len };
  });
}

/** 16 小節: [A 呼 | B 応 | A' | B' 終止] [C | D | C' | B' 終止] */
function compose(th: Theme): Line {
  const r = mulberry32(th.seed);
  const [lo, hi] = th.range;
  const mid = (lo + hi) >> 1;
  const last = (l: Line): number => {
    for (let i = l.length - 1; i >= 0; i--) {
      const n = l[i];
      if (n) return n.d;
    }
    return mid;
  };
  const dB = Math.min(1, th.dens + 0.15);
  const A = motif(r, th, 0, mid, lo, hi, th.dens, 1, false);
  const B = motif(r, th, 2, last(A) + 1, lo, hi, th.dens, -1, false);
  const A2 = vary(r, th, A, 4, lo, hi);
  const B2 = motif(r, th, 6, last(A2), lo, hi, th.dens, -1, true);
  const C = motif(r, th, 8, hi, lo + 1, hi, dB, -1, false); // 後半は高めの音域で
  const D = motif(r, th, 10, last(C), lo + 1, hi, dB, 1, false);
  const C2 = vary(r, th, C, 12, lo + 1, hi);
  return [...A, ...B, ...A2, ...B2, ...C, ...D, ...C2, ...B2];
}

// ---------------------------------------------------------------------------
// BGM: 先読みスケジューラー
// ---------------------------------------------------------------------------

interface Song {
  th: Theme;
  out: GainNode; // クロスフェード用
  mel: Line;
  step: number;
  next: number; // 次のステップの時刻
  stopAt: number; // フェードアウト完了時刻（再生中は Infinity）
  voices: Set<Voice>; // 鳴っている音（曲を外すときに止める）
}

let songs: Song[] = [];
let timer: ReturnType<typeof setInterval> | undefined;

function pat(list: readonly string[] | undefined, bar: number): string {
  if (!list || list.length === 0) return "";
  if (bar % 8 === 7 && list.length > 2) return list[2];
  return list[bar >= 8 && list.length > 1 ? 1 : 0];
}

const digit = (c: string): number => (c >= "0" && c <= "9" ? Number(c) : -1);

function playStep(e: Engine, s: Song, t: number): void {
  const th = s.th;
  const st = s.step % LOOP;
  const bar = st >> 4;
  const pos = st & 15;
  const root = th.prog[bar % 8];
  const base = 15 / th.bpm; // 16 分音符の長さ
  const at = (pan: number, fn: (v: Voice) => void): void => {
    const v = voice(e, s.out, 1, 1, pan, t);
    s.voices.add(v);
    v.done = () => {
      s.voices.delete(v);
    };
    try {
      fn(v);
    } finally {
      seal(v);
    }
  };
  const ch = (list: readonly string[] | undefined): string => pat(list, bar).charAt(pos);

  // 打楽器
  const tk = ch(th.taiko);
  if (tk === "X" || tk === "x") at(0, (v) => taiko(v, tk === "X" ? 1 : 0.7));
  else if (tk === "k") at(-0.15, (v) => ka(v, 1));
  const sh = ch(th.shime);
  if (sh === "x" || sh === "o") at(0.2, (v) => shime(v, sh === "x" ? 1 : 0.5));
  if (ch(th.kane) === "x") at(-0.3, (v) => kane(v, 1));

  // 低音リフとアルペジオ（根音から度数で数えるので音階どおりに移調される）
  const b = digit(ch(th.bass));
  if (b >= 0) {
    const f = degHz(th, th.low + root + b);
    at(-0.2, (v) => (th.bassInst === "koto" ? koto(v, 0, f, 0.18, 0.8) : shamisen(v, 0, f, 0.17, 0.35)));
  }
  const ar = digit(ch(th.arp));
  if (ar >= 0) at(0.35, (v) => koto(v, 0, degHz(th, th.low + 5 + root + ar), 0.09, 0.6));

  // 旋律
  const n = s.mel[st];
  if (n) {
    const inst = th.lead[bar < 8 ? 0 : 1];
    const f = degHz(th, n.d);
    const dur = n.len * base - 0.015;
    at(0.1, (v) => {
      if (inst === "fue") fue(v, 0, f, dur, 0.15);
      else if (inst === "koto") koto(v, 0, f, 0.2, 0.9);
      else shamisen(v, 0, f, 0.12, 0.35);
    });
  }

  // 持続音: 根音が変わる小節頭で、同じ根音が続く長さぶん鳴らす
  const kind = th.pad;
  if (kind && pos === 0) {
    const b8 = bar % 8;
    if (b8 === 0 || th.prog[b8] !== th.prog[b8 - 1]) {
      let k = 1;
      while (b8 + k < 8 && th.prog[b8 + k] === root) k++;
      const f = degHz(th, th.low + root + (kind === "sho" ? 5 : 0));
      at(0, (v) => pad(v, f, k * 16 * base + 0.25, 0.15, kind));
    }
  }
}

function tick(): void {
  const e = E;
  if (!e) return;
  const now = e.ctx.currentTime;
  for (const s of songs) {
    if (s.next < now - 0.1) s.next = now + 0.02; // 大きく遅れたら取りこぼし分は鳴らさず再同期
    while (s.next < now + LOOKAHEAD && s.next < s.stopAt) {
      try {
        playStep(e, s, s.next);
      } catch {
        /* 1 音の失敗で曲を止めない */
      }
      const base = 15 / s.th.bpm;
      s.next += base * (s.step % 2 === 0 ? 1 + s.th.swing : 1 - s.th.swing);
      s.step++;
    }
  }
  const expired = songs.filter((s) => now > s.stopAt + 0.2);
  if (expired.length) {
    expired.forEach(dropSong);
    songs = songs.filter((s) => !expired.includes(s));
  }
  if (songs.length === 0 && timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}

/** 曲を外す。長い持続音も打ち切ってノードを片付ける */
function dropSong(s: Song): void {
  for (const v of s.voices) hush(v);
  s.out.disconnect();
}

/** 再生中の曲をすべてフェードアウトさせる */
function fadeOutAll(e: Engine): void {
  const now = e.ctx.currentTime;
  for (const s of songs) {
    if (s.stopAt !== Infinity) continue;
    const g = s.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + FADE);
    s.stopAt = now + FADE;
  }
  // 短時間に何度も切り替えられても重ならないよう、古いフェード中の曲は打ち切る
  for (const old of songs.splice(0, Math.max(0, songs.length - 2))) dropSong(old);
}

function startSong(e: Engine, theme: BgmTheme, fade: number): void {
  const now = e.ctx.currentTime;
  const th = THEMES[theme];
  const out = vca(e.ctx);
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(1, now + fade);
  out.connect(e.musicBus);
  songs.push({ th, out, mel: compose(th), step: 0, next: now + 0.05, stopAt: Infinity, voices: new Set() });
  if (timer === undefined) timer = setInterval(tick, TICK_MS);
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

const lastAt = new Map<string, number>();
const active = new Set<Voice>();

/** 効果音 1 発ぶんのボイスを確保して組み立てる（間引き・同時発音数の上限つき） */
function emit(key: string, o: SfxOpts | undefined, trimDb: number, jitter: boolean, build: (v: Voice) => void): void {
  try {
    const e = E;
    if (!e || muted || !ready(e)) return;
    const now = performance.now();
    const last = lastAt.get(key);
    if (last !== undefined && now - last < THROTTLE_MS) return;
    if (active.size >= MAX_VOICES) {
      // onended が届かず残ったボイスを掃除してから判定
      const ct = e.ctx.currentTime;
      for (const v of active) if (v.end < ct - 0.5) dispose(v);
      if (active.size >= MAX_VOICES) return;
    }
    lastAt.set(key, now);
    const pitch = clamp(num(o?.pitch, 1), 0.25, 4) * (jitter ? rand(0.97, 1.03) : 1);
    const gain = clamp(num(o?.volume, 1), 0, 2) * 10 ** (trimDb / 20);
    const v = voice(e, e.sfxBus, gain, pitch, clamp(num(o?.pan, 0), -1, 1));
    v.done = () => {
      active.delete(v);
    };
    active.add(v);
    try {
      build(v);
    } finally {
      seal(v);
    }
  } catch {
    /* 音が出ないだけでゲームは止めない */
  }
}

export const audio: AudioApi = {
  unlock() {
    try {
      const C = audioCtor();
      if (!C) return;
      if (!E) E = createEngine(C);
      const e = E;
      if (e.ctx.state !== "running") resume(e);
      // unlock 前に要求されていた BGM を開始
      if (current && !songs.some((s) => s.stopAt === Infinity)) startSong(e, current, 0.05);
    } catch {
      /* AudioContext を作れない環境 */
    }
  },

  setMuted(m) {
    muted = !!m;
    try {
      applyMaster();
    } catch {
      /* noop */
    }
  },

  isMuted() {
    return muted;
  },

  setVolume(master) {
    volume = clamp(num(master, MASTER_DEFAULT), 0, 1);
    try {
      applyMaster();
    } catch {
      /* noop */
    }
  },

  sfx(name, opts) {
    emit(name, opts, SFX_TRIM[name] ?? 0, !STEADY.has(name), (v) => SFX[name](v));
  },

  hit(strength, fx, pan) {
    const s = clamp(num(strength, 0.5), 0, 1);
    // 弱い打撃ほど相対的に少し持ち上げる（0 → +2dB, 1 → ±0dB）
    emit(`hit:${fx}`, { pan }, 2 * (1 - s), true, (v) => hitSound(v, s, fx));
  },

  element(fx, opts) {
    emit(`el:${fx}`, opts, ELEMENT_TRIM[fx] ?? 0, true, (v) => ELEMENT[fx](v));
  },

  bgm(theme) {
    if (theme === current) return;
    current = theme;
    const e = E;
    if (!e) return; // unlock 時に開始する
    try {
      fadeOutAll(e);
      // まだ鳴っている曲（フェード中を含む）があればクロスフェード、無音からならすぐ立ち上げる
      if (theme) startSong(e, theme, songs.length ? FADE : 0.05);
    } catch {
      /* noop */
    }
  },
};
