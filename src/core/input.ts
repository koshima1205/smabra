/**
 * 入力: キーボード（2レイアウト）・ゲームパッド・タッチを共通の PadState にまとめる。
 * ファイターは Controller（1F ごとに PadState を読んで押下/バッファ/はじき入力を判定）を通して操作される。
 */

export type Button = 'attack' | 'special' | 'jump' | 'shield' | 'grab' | 'smash' | 'start';
export const BUTTONS: readonly Button[] = ['attack', 'special', 'jump', 'shield', 'grab', 'smash', 'start'];

export interface PadState {
  /** メインスティック（上 = -1） */
  x: number;
  y: number;
  /** Cスティック（スマッシュ攻撃） */
  cx: number;
  cy: number;
  attack: boolean;
  special: boolean;
  jump: boolean;
  shield: boolean;
  grab: boolean;
  smash: boolean;
  start: boolean;
}

export const emptyPad = (): PadState => ({
  x: 0,
  y: 0,
  cx: 0,
  cy: 0,
  attack: false,
  special: false,
  jump: false,
  shield: false,
  grab: false,
  smash: false,
  start: false,
});

export interface DeviceInfo {
  id: string;
  label: string;
  /** デジタル入力（キーボード）か */
  digital: boolean;
  /** はじき入力でスマッシュ攻撃 */
  flickSmash: boolean;
  /** スティック上はじきでジャンプ */
  tapJump: boolean;
}

interface KeyLayout {
  label: string;
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  buttons: Record<Button, string[]>;
}

export const KEY_LAYOUTS: Record<'kb1' | 'kb2', KeyLayout> = {
  kb1: {
    label: 'キーボード1',
    left: ['KeyA'],
    right: ['KeyD'],
    up: ['KeyW'],
    down: ['KeyS'],
    buttons: {
      attack: ['KeyJ', 'KeyF'],
      special: ['KeyK', 'KeyG'],
      jump: ['Space'],
      shield: ['KeyL', 'ShiftLeft'],
      grab: ['KeyU', 'KeyT'],
      smash: ['KeyI', 'KeyR'],
      start: ['Enter', 'Escape'],
    },
  },
  kb2: {
    label: 'キーボード2',
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    buttons: {
      attack: ['Comma', 'Numpad1'],
      special: ['Period', 'Numpad2'],
      jump: ['Slash', 'Numpad0'],
      shield: ['Quote', 'ShiftRight', 'NumpadEnter'],
      grab: ['KeyP', 'Numpad5'],
      smash: ['Semicolon', 'Numpad3'],
      start: [],
    },
  },
};

/** ゲーム用に既定動作（スクロール等）を止めるキー */
const CAPTURE = new Set<string>();
for (const l of Object.values(KEY_LAYOUTS)) {
  for (const k of [...l.left, ...l.right, ...l.up, ...l.down]) CAPTURE.add(k);
  for (const ks of Object.values(l.buttons)) for (const k of ks) CAPTURE.add(k);
}

export interface MenuInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  confirm: boolean;
  back: boolean;
  start: boolean;
  /** 補助ボタン（CPU 追加など） */
  aux: boolean;
}

const emptyMenu = (): MenuInput => ({
  up: false,
  down: false,
  left: false,
  right: false,
  confirm: false,
  back: false,
  start: false,
  aux: false,
});

/** タッチ操作の状態（仮想パッドが書き込む） */
export const touchPad: PadState & { active: boolean } = { ...emptyPad(), active: false };

export class InputManager {
  private keys = new Set<string>();
  /** poll 間に押されて離されたキー（一瞬のタップも1F は拾う） */
  private tapped = new Set<string>();
  private prevKeys = new Set<string>();
  private keyEdges = new Set<string>();
  private states = new Map<string, PadState>();
  private prevStates = new Map<string, PadState>();
  private repeat = new Map<string, number>();
  private infos = new Map<string, DeviceInfo>();
  /** キーボードで使われたレイアウト（参加判定用） */
  private kbUsed = new Set<string>();

  constructor(target: Window | null = typeof window !== 'undefined' ? window : null) {
    if (!target) return;
    target.addEventListener('keydown', (e) => {
      if (CAPTURE.has(e.code) && !(e.target instanceof HTMLInputElement)) e.preventDefault();
      if (!e.repeat) this.tapped.add(e.code);
      this.keys.add(e.code);
    });
    target.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    target.addEventListener('blur', () => this.keys.clear());
  }

  /** 1F に1回呼ぶ */
  poll(): void {
    const down = new Set([...this.keys, ...this.tapped]);
    this.tapped.clear();
    this.keyEdges.clear();
    for (const k of down) if (!this.prevKeys.has(k)) this.keyEdges.add(k);
    this.prevKeys = new Set(this.keys);
    this.frameKeys = down;
    for (const [id, s] of this.states) this.prevStates.set(id, s);
    const next = new Map<string, PadState>();
    for (const id of ['kb1', 'kb2'] as const) {
      const s = this.readKeyboard(id);
      next.set(id, s);
      if (!this.infos.has(id)) {
        this.infos.set(id, { id, label: KEY_LAYOUTS[id].label, digital: true, flickSmash: false, tapJump: false });
      }
      if (isActive(s)) this.kbUsed.add(id);
    }
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const id = `pad${gp.index}`;
      next.set(id, readGamepad(gp));
      if (!this.infos.has(id)) {
        this.infos.set(id, {
          id,
          label: `パッド${gp.index + 1}`,
          digital: false,
          flickSmash: true,
          tapJump: true,
        });
      }
    }
    if (touchPad.active) {
      const { active: _a, ...s } = touchPad;
      next.set('touch', { ...s });
      if (!this.infos.has('touch')) {
        this.infos.set('touch', { id: 'touch', label: 'タッチ', digital: false, flickSmash: true, tapJump: true });
      }
    }
    this.states = next;
    this.buildMenus();
  }

  get(id: string): PadState {
    return this.states.get(id) ?? emptyPad();
  }

  info(id: string): DeviceInfo {
    return (
      this.infos.get(id) ?? { id, label: id, digital: id.startsWith('kb'), flickSmash: !id.startsWith('kb'), tapJump: false }
    );
  }

  devices(): string[] {
    return [...this.states.keys()];
  }

  /** このFにボタンを押したデバイス（参加・操作の割り当て用） */
  pressedDevices(): string[] {
    const out: string[] = [];
    for (const [id, s] of this.states) {
      const p = this.prevStates.get(id) ?? emptyPad();
      if (BUTTONS.some((b) => s[b] && !p[b])) out.push(id);
    }
    return out;
  }

  /** poll ごとに計算したメニュー入力のキャッシュ */
  private menuCache = new Map<string, MenuInput>();

  /** メニュー操作（キーリピート付き）。device 省略時は全デバイスの合成 */
  menu(device?: string): MenuInput {
    if (device) return this.menuCache.get(device) ?? emptyMenu();
    const out = emptyMenu();
    for (const m of this.menuCache.values()) {
      for (const k of Object.keys(out) as (keyof MenuInput)[]) out[k] ||= m[k];
    }
    return out;
  }

  private buildMenus(): void {
    this.menuCache.clear();
    for (const id of this.states.keys()) {
      const out = emptyMenu();
      const s = this.get(id);
      const p = this.prevStates.get(id) ?? emptyPad();
      const dirs: [keyof MenuInput, boolean][] = [
        ['up', s.y < -0.5],
        ['down', s.y > 0.5],
        ['left', s.x < -0.5],
        ['right', s.x > 0.5],
      ];
      for (const [name, on] of dirs) {
        const key = `${id}:${name}`;
        if (!on) {
          this.repeat.delete(key);
          continue;
        }
        const t = (this.repeat.get(key) ?? -1) + 1;
        this.repeat.set(key, t);
        if (t === 0 || (t >= 18 && (t - 18) % 5 === 0)) out[name] = true;
      }
      if (s.attack && !p.attack) out.confirm = true;
      if (s.special && !p.special) out.back = true;
      if (s.start && !p.start) out.start = true;
      if (s.grab && !p.grab) out.aux = true;
      if (!id.startsWith('kb') && s.jump && !p.jump) out.confirm = true;
      // キーボード共通: Space=決定 / Esc・Backspace=戻る
      if (id === 'kb1') {
        if (this.keyPressed('Space')) out.confirm = true;
        if (this.keyPressed('Escape') || this.keyPressed('Backspace')) {
          out.back = true;
          out.start = false;
        }
      }
      this.menuCache.set(id, out);
    }
  }

  /** このFで有効なキー（押しっぱなし + 一瞬のタップ） */
  private frameKeys = new Set<string>();
  keyPressed(code: string): boolean {
    return this.keyEdges.has(code);
  }
  keyHeld(code: string): boolean {
    return this.keys.has(code);
  }

  private readKeyboard(id: 'kb1' | 'kb2'): PadState {
    const l = KEY_LAYOUTS[id];
    const any = (codes: string[]) => codes.some((c) => this.frameKeys.has(c));
    const s = emptyPad();
    s.x = (any(l.right) ? 1 : 0) - (any(l.left) ? 1 : 0);
    s.y = (any(l.down) ? 1 : 0) - (any(l.up) ? 1 : 0);
    for (const b of BUTTONS) s[b] = any(l.buttons[b]);
    return s;
  }
}

function isActive(s: PadState): boolean {
  return s.x !== 0 || s.y !== 0 || BUTTONS.some((b) => s[b]);
}

const DEAD = 0.22;
function axis(v: number | undefined): number {
  if (v === undefined || Math.abs(v) < DEAD) return 0;
  return Math.sign(v) * Math.min(1, (Math.abs(v) - DEAD) / (1 - DEAD));
}

function readGamepad(gp: Gamepad): PadState {
  const b = (i: number) => {
    const btn = gp.buttons[i];
    return !!btn && (btn.pressed || btn.value > 0.35);
  };
  const s = emptyPad();
  s.x = axis(gp.axes[0]);
  s.y = axis(gp.axes[1]);
  if (b(14)) s.x = -1;
  if (b(15)) s.x = 1;
  if (b(12)) s.y = -1;
  if (b(13)) s.y = 1;
  s.cx = axis(gp.axes[2]);
  s.cy = axis(gp.axes[3]);
  s.attack = b(0);
  s.special = b(1);
  s.jump = b(2) || b(3);
  s.grab = b(4);
  s.shield = b(5) || b(6) || b(7);
  s.start = b(9);
  return s;
}

/**
 * ファイター用コントローラ: 押下エッジ・入力バッファ・はじき判定
 */
export class Controller {
  cur: PadState = emptyPad();
  prev: PadState = emptyPad();
  /** 入力バッファ（残りF） */
  private buf: Record<Button, number> = { attack: 0, special: 0, jump: 0, shield: 0, grab: 0, smash: 0, start: 0 };
  private hist: { x: number; y: number }[] = [];
  /** はじき入力が起きてからの経過F（大きいほど古い） */
  flickXAge = 99;
  flickYAge = 99;
  flickDirX = 0;
  flickDirY = 0;
  /** Cスティックの押下エッジ方向 */
  cDir: { x: number; y: number } | null = null;
  /** 方向キーを押し続けているF数（デジタル用） */
  holdX = 0;

  constructor(
    public source: () => PadState,
    public info: DeviceInfo,
  ) {}

  static BUFFER = 6;

  update(): void {
    this.prev = this.cur;
    this.cur = { ...this.source() };
    for (const b of BUTTONS) {
      if (this.cur[b] && !this.prev[b]) this.buf[b] = Controller.BUFFER;
      else if (this.buf[b] > 0) this.buf[b]--;
    }
    // Cスティック
    const cOn = Math.hypot(this.cur.cx, this.cur.cy) > 0.6;
    const cWas = Math.hypot(this.prev.cx, this.prev.cy) > 0.6;
    this.cDir = cOn && !cWas ? { x: this.cur.cx, y: this.cur.cy } : null;

    this.hist.unshift({ x: this.cur.x, y: this.cur.y });
    if (this.hist.length > 5) this.hist.pop();
    this.flickXAge++;
    this.flickYAge++;
    if (Math.abs(this.cur.x) > 0.75 && this.hist.slice(1, 4).some((h) => Math.abs(h.x) < 0.3)) {
      if (this.flickXAge > 3 || Math.sign(this.cur.x) !== this.flickDirX) {
        this.flickXAge = 0;
        this.flickDirX = Math.sign(this.cur.x);
      }
    }
    if (Math.abs(this.cur.y) > 0.7 && this.hist.slice(1, 4).some((h) => Math.abs(h.y) < 0.3)) {
      if (this.flickYAge > 3 || Math.sign(this.cur.y) !== this.flickDirY) {
        this.flickYAge = 0;
        this.flickDirY = Math.sign(this.cur.y);
      }
    }
    this.holdX = this.dirX !== 0 && Math.sign(this.prev.x) === this.dirX ? this.holdX + 1 : this.dirX !== 0 ? 1 : 0;
  }

  pressed(b: Button): boolean {
    return this.cur[b] && !this.prev[b];
  }
  held(b: Button): boolean {
    return this.cur[b];
  }
  released(b: Button): boolean {
    return !this.cur[b] && this.prev[b];
  }
  /** バッファ込みの押下。消費するとバッファは空になる */
  buffered(b: Button): boolean {
    return this.buf[b] > 0;
  }
  consume(b: Button): void {
    this.buf[b] = 0;
  }
  clearBuffers(): void {
    for (const b of BUTTONS) this.buf[b] = 0;
  }

  get dirX(): number {
    return this.cur.x > 0.5 ? 1 : this.cur.x < -0.5 ? -1 : 0;
  }
  get dirY(): number {
    return this.cur.y > 0.5 ? 1 : this.cur.y < -0.5 ? -1 : 0;
  }
  /** 横はじき（ダッシュ開始） */
  flickX(within = 3): boolean {
    return this.flickXAge <= within;
  }
  flickY(within = 3): boolean {
    return this.flickYAge <= within;
  }
  /** 下を「押した瞬間」（すり抜け・急降下） */
  downPressed(): boolean {
    return this.cur.y > 0.6 && this.prev.y <= 0.6;
  }
  upPressed(): boolean {
    return this.cur.y < -0.6 && this.prev.y >= -0.6;
  }
}
