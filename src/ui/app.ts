import { audio, type SfxName } from '../core/audio';
import { Controller, emptyPad, type DeviceInfo, type InputManager, type MenuInput, type PadState } from '../core/input';
import type { MatchEvents } from '../game/match';
import type { MatchRules, SlotKind } from '../game/types';

export interface Scene {
  enter(): void;
  exit(): void;
  update(): void;
  render(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, time: number): void;
}

export interface Slot {
  kind: SlotKind;
  /** このスロットが握っている入力デバイス */
  devices: Set<string>;
  /** null = おまかせ（ランダム） */
  fighterId: string | null;
  cpuLevel: number;
  locked: boolean;
  cursor: number;
}

const SFX = new Set<string>([
  'swing',
  'swingHeavy',
  'jump',
  'doubleJump',
  'land',
  'dash',
  'shield',
  'shieldHit',
  'shieldBreak',
  'dodge',
  'ledge',
  'grab',
  'throw',
  'ko',
  'respawn',
  'projectile',
  'gun',
  'counter',
  'charge',
  'heal',
  'explosion',
  'clone',
  'teleport',
  'summon',
  'uiMove',
  'uiSelect',
  'uiBack',
  'countdown',
  'go',
  'gameSet',
  'pause',
  'join',
]);

export function sfx(name: string, pan = 0): void {
  if (SFX.has(name)) audio.sfx(name as SfxName, { pan });
}

export function matchAudio(): MatchEvents {
  return {
    sfx: (name, pan) => sfx(name, pan),
    hit: (s, fx, pan) => audio.hit(s, fx, pan),
    element: (fx, pan) => audio.element(fx, { pan }),
    countdown: (n) => sfx(n > 0 ? 'countdown' : 'go'),
  };
}

/** 複数デバイスをまとめて1人分の入力にする（最後に触ったデバイスの特性を使う） */
export class MergedSource {
  info: DeviceInfo = { id: 'merged', label: '', digital: true, flickSmash: false, tapJump: false };
  constructor(
    private input: InputManager,
    private devices: () => Iterable<string>,
  ) {}

  read = (): PadState => {
    const out = emptyPad();
    let best = 0;
    let bestC = 0;
    for (const id of this.devices()) {
      const s = this.input.get(id);
      const active = s.x !== 0 || s.y !== 0 || s.attack || s.special || s.jump || s.shield || s.grab || s.smash;
      if (active) {
        const inf = this.input.info(id);
        this.info.digital = inf.digital;
        this.info.flickSmash = inf.flickSmash;
        this.info.tapJump = inf.tapJump;
        this.info.label = inf.label;
      }
      const mag = Math.hypot(s.x, s.y);
      if (mag > best) {
        best = mag;
        out.x = s.x;
        out.y = s.y;
      }
      const cm = Math.hypot(s.cx, s.cy);
      if (cm > bestC) {
        bestC = cm;
        out.cx = s.cx;
        out.cy = s.cy;
      }
      out.attack ||= s.attack;
      out.special ||= s.special;
      out.jump ||= s.jump;
      out.shield ||= s.shield;
      out.grab ||= s.grab;
      out.smash ||= s.smash;
      out.start ||= s.start;
    }
    return out;
  };
}

export class App {
  scene: Scene | null = null;
  tick = 0;
  slots: Slot[];
  rules: MatchRules = { stocks: 3, time: 0, stageId: 'iga' };
  lastStage = 'iga';
  readonly touchCapable: boolean;

  constructor(
    public input: InputManager,
    public ui: HTMLElement,
    public touchEl: HTMLElement,
  ) {
    this.slots = [
      { kind: 'human', devices: new Set(['kb1', 'touch']), fighterId: null, cpuLevel: 5, locked: false, cursor: 0 },
      { kind: 'cpu', devices: new Set(), fighterId: null, cpuLevel: 5, locked: true, cursor: 1 },
      { kind: 'off', devices: new Set(), fighterId: null, cpuLevel: 5, locked: true, cursor: 2 },
      { kind: 'off', devices: new Set(), fighterId: null, cpuLevel: 5, locked: true, cursor: 3 },
    ];
    this.touchCapable = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    this.load();
  }

  private static KEY = 'cnp-ranbu:v1';

  /** 前回のルールと選択を復元（ブラウザのストレージが使えなければ何もしない） */
  private load(): void {
    try {
      const raw = localStorage.getItem(App.KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { rules?: Partial<MatchRules>; slots?: { kind: SlotKind; fighterId: string | null; cpuLevel: number }[]; stage?: string };
      if (d.rules) {
        this.rules.stocks = Math.max(1, Math.min(5, Number(d.rules.stocks) || 3));
        this.rules.time = [0, 120, 180, 300, 420].includes(Number(d.rules.time)) ? Number(d.rules.time) : 0;
      }
      if (typeof d.stage === 'string') this.lastStage = d.stage;
      d.slots?.slice(0, 4).forEach((s, i) => {
        const slot = this.slots[i];
        if (i > 0 && (s.kind === 'cpu' || s.kind === 'off')) slot.kind = s.kind;
        slot.fighterId = typeof s.fighterId === 'string' ? s.fighterId : null;
        slot.cpuLevel = Math.max(1, Math.min(9, Number(s.cpuLevel) || 5));
      });
    } catch {
      /* 保存なしで続行 */
    }
  }

  save(): void {
    try {
      localStorage.setItem(
        App.KEY,
        JSON.stringify({
          rules: this.rules,
          stage: this.lastStage,
          slots: this.slots.map((s) => ({ kind: s.kind, fighterId: s.fighterId, cpuLevel: s.cpuLevel })),
        }),
      );
    } catch {
      /* 保存できなくても遊べる */
    }
  }

  go(scene: Scene): void {
    this.scene?.exit();
    this.ui.replaceChildren();
    this.scene = scene;
    scene.enter();
  }

  update(): void {
    this.tick++;
    this.claimDevices();
    this.scene?.update();
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number): void {
    this.scene?.render(ctx, w, h, dpr, this.tick);
  }

  /** どのスロットにも属していないデバイスの持ち主を決める */
  claimDevices(): void {
    for (const id of this.input.pressedDevices()) {
      if (this.slots.some((s) => s.devices.has(id))) continue;
      const p1 = this.slots[0];
      const p1HasPad = [...p1.devices].some((d) => d.startsWith('pad'));
      if (id.startsWith('pad') && !p1HasPad && !this.usedKeyboard) {
        p1.devices.add(id);
        p1.kind = 'human';
        continue;
      }
      this.onUnclaimed?.(id);
    }
    if (this.input.get('kb1').x !== 0 || this.input.get('kb1').attack || this.input.get('kb1').jump) this.usedKeyboard = true;
  }

  usedKeyboard = false;
  /** 新しいデバイスがボタンを押した（キャラ選択画面が参加処理に使う） */
  onUnclaimed: ((id: string) => void) | null = null;

  slotSource(i: number): MergedSource {
    const s = this.slots[i];
    return new MergedSource(this.input, () => s.devices);
  }

  controllerFor(i: number): Controller {
    const src = this.slotSource(i);
    return new Controller(src.read, src.info);
  }

  /** スロット i のメニュー入力（持っている全デバイス） */
  menuFor(i: number): MenuInput {
    const out: MenuInput = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, aux: false };
    for (const id of this.slots[i].devices) {
      const m = this.input.menu(id);
      for (const k of Object.keys(out) as (keyof MenuInput)[]) out[k] ||= m[k];
    }
    return out;
  }

  /** 全デバイスのメニュー入力 */
  menuAny(): MenuInput {
    return this.input.menu();
  }
}
