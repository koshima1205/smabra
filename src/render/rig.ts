import { clamp, easeInOutQuad, easeOutCubic, lerp } from '../core/math';
import type { Fighter } from '../game/fighter';
import type { AnimId, MoveDef } from '../game/types';

/**
 * 手続き的なボーン姿勢。角度はラジアン。
 * 手足の角度は「真下 = 0、前方向へ回すと +」（前 = 向いている方向）。
 */
export interface Pose {
  /** 腰位置のずらし（身長100基準、+y で下がる） */
  x: number;
  y: number;
  /** 胴の前傾（+ で前のめり） */
  torso: number;
  head: number;
  fsh: number;
  fel: number;
  bsh: number;
  bel: number;
  fhip: number;
  fkn: number;
  bhip: number;
  bkn: number;
  /** 体全体の回転（宙返りなど） */
  spin: number;
  /** 武器の手首角度 */
  weapon: number;
  /** 縦方向の伸縮 */
  squash: number;
}

export const P = (o: Partial<Pose> = {}): Pose => ({
  x: 0,
  y: 0,
  torso: 0.05,
  head: 0,
  fsh: 0.5,
  fel: 1.3,
  bsh: 0.15,
  bel: 1.0,
  fhip: 0.14,
  fkn: 0.2,
  bhip: -0.12,
  bkn: 0.15,
  spin: 0,
  weapon: 0,
  squash: 1,
  ...o,
});

function mix(a: Pose, b: Pose, t: number): Pose {
  const o = {} as Pose;
  for (const k of Object.keys(a) as (keyof Pose)[]) o[k] = lerp(a[k], b[k], t);
  return o;
}

const IDLE = P();

/** 攻撃の [構え, 打撃] の姿勢 */
const ATTACK: Record<AnimId, [Partial<Pose>, Partial<Pose>]> = {
  jab1: [{ fsh: -0.2, fel: 1.8, torso: 0 }, { fsh: 1.55, fel: 0.08, torso: 0.18, bsh: -0.3 }],
  jab2: [{ bsh: -0.3, bel: 1.8 }, { bsh: 1.55, bel: 0.08, fsh: -0.2, torso: 0.22 }],
  jab3: [{ fhip: -0.4, fkn: 1.4, torso: 0.1 }, { fhip: 1.45, fkn: 0.05, torso: -0.25, fsh: -0.4, bsh: 0.8 }],
  ftilt: [{ fsh: -1.3, fel: 0.5, torso: -0.1, weapon: -0.4 }, { fsh: 1.55, fel: 0.1, torso: 0.3, fhip: 0.6, bhip: -0.5, weapon: 0.1 }],
  utilt: [{ fsh: 0.2, fel: 0.6, y: 6 }, { fsh: 2.9, fel: 0.15, torso: -0.12, bsh: 0.6, weapon: 0.2 }],
  dtilt: [{ y: 16, torso: 0.4, fhip: 1.0, fkn: 1.8, bhip: 0.5, bkn: 1.6 }, { y: 22, torso: 0.55, fhip: 1.45, fkn: 0.05, bhip: 0.3, bkn: 1.9, fsh: 1.1, fel: 0.3 }],
  dash: [{ torso: 0.3, fsh: 1.0 }, { y: -6, torso: -0.2, fhip: 1.35, fkn: 0.05, bhip: -0.5, bkn: 1.3, fsh: 1.5, fel: 0.1 }],
  fsmash: [
    { torso: -0.35, fsh: -2.2, fel: 0.4, bsh: 0.9, fhip: -0.2, bhip: 0.3, y: 4, weapon: -0.6 },
    { torso: 0.55, fsh: 1.75, fel: 0.02, bsh: -0.8, fhip: 0.85, fkn: 0.25, bhip: -0.8, bkn: 0.3, y: 6, weapon: 0.1 },
  ],
  usmash: [{ y: 14, torso: 0.3, fsh: 0.2, fkn: 1.2, bkn: 1.2, fhip: 0.6, bhip: 0.4 }, { y: -12, torso: -0.1, fsh: 3.05, fel: 0.05, bsh: 2.7, bel: 0.1, fhip: 0.1, bhip: -0.2 }],
  dsmash: [{ y: 10, torso: 0.2, fsh: 0.5, bsh: -0.5 }, { y: 20, torso: 0, fhip: 1.45, fkn: 0, bhip: -1.45, bkn: 0, fsh: 1.6, fel: 0.1, bsh: -1.6, bel: 0.1 }],
  nair: [{ fhip: 0.7, fkn: 1.4, bhip: 0.2, bkn: 1.4 }, { fhip: 1.1, fkn: 0.1, bhip: -1.1, bkn: 0.1, fsh: 1.5, fel: 0.1, bsh: -1.5, bel: 0.1 }],
  fair: [{ fsh: 2.9, fel: 0.3, torso: -0.15, weapon: 0.3 }, { fsh: 0.9, fel: 0.05, torso: 0.35, fhip: 0.9, fkn: 0.9 }],
  bair: [{ torso: 0.2, bhip: 0.3, bkn: 1.6 }, { torso: 0.55, bhip: -1.65, bkn: 0.05, fhip: 0.6, fkn: 1.2, head: -0.3 }],
  uair: [{ fhip: 0.6, fkn: 1.3 }, { fhip: 2.6, fkn: 0.05, bhip: 0.4, bkn: 1.2, torso: -0.3, fsh: -0.8, bsh: -0.6 }],
  dair: [{ fhip: 1.2, fkn: 1.8, bhip: 1.0, bkn: 1.8, fsh: 2.4, bsh: 2.2, y: -10 }, { fhip: 0.05, fkn: 0, bhip: -0.05, bkn: 0, fsh: 2.8, bsh: 2.6, torso: 0.05, y: 6, weapon: 1.2 }],
  cast: [{ fsh: -0.6, fel: 1.6, torso: -0.1 }, { fsh: 1.55, fel: 0.05, torso: 0.2, bsh: -0.5, bel: 1.2 }],
  castUp: [{ fsh: 0.4, bsh: 0.3, y: 8 }, { fsh: 2.95, fel: 0.1, bsh: 2.8, bel: 0.1, torso: -0.15, head: -0.3 }],
  castDown: [{ fsh: 2.2, bsh: 2.0, y: -4 }, { fsh: 0.9, fel: 0.3, bsh: 0.7, bel: 0.3, y: 18, torso: 0.45, fkn: 1.2, bkn: 1.2, fhip: 0.8, bhip: 0.3 }],
  lunge: [{ torso: 0.2, y: 8, fkn: 1, bkn: 1 }, { torso: 1.15, fsh: 1.6, fel: 0.05, bsh: -0.4, fhip: 0.5, fkn: 0.2, bhip: -1.3, bkn: 0.4, y: -4 }],
  rise: [{ y: 12, fkn: 1.3, bkn: 1.3, fhip: 0.6 }, { fsh: 3.0, fel: 0.1, bsh: 2.4, torso: -0.05, fhip: 0.2, bhip: -0.4, bkn: 0.8 }],
  counter: [{ torso: -0.1 }, { torso: -0.2, fsh: 0.9, fel: 2.0, bsh: 0.4, bel: 1.6, y: 8, fkn: 0.6, bkn: 0.6, fhip: 0.5, bhip: -0.3 }],
  slam: [{ fhip: 1.2, fkn: 1.8, bhip: 1.1, bkn: 1.8, y: -6 }, { fhip: 0.1, fkn: 0.05, bhip: -0.1, bkn: 0.05, fsh: 2.9, bsh: 2.8, torso: 0.1 }],
  grab: [{ fsh: 0.3, bsh: 0.2 }, { fsh: 1.5, fel: 0.2, bsh: 1.35, bel: 0.3, torso: 0.3 }],
  pummel: [{ fhip: 0.2, fkn: 0.4 }, { fhip: 1.3, fkn: 1.6, fsh: 1.4, bsh: 1.3, torso: 0.2 }],
  throwF: [{ fsh: -1.0, bsh: -0.8, torso: -0.2 }, { fsh: 1.8, fel: 0.1, bsh: 1.6, torso: 0.4, fhip: 0.6, bhip: -0.6 }],
  throwB: [{ fsh: 1.4, bsh: 1.4, torso: 0.2 }, { fsh: -2.2, bsh: -2.0, torso: -0.5, head: -0.4, bhip: -0.8, fhip: 0.4 }],
  throwU: [{ fsh: 1.2, bsh: 1.1, y: 10 }, { fsh: 3.05, fel: 0.05, bsh: 3.0, bel: 0.05, y: -6, torso: -0.1 }],
  throwD: [{ fsh: 2.8, bsh: 2.6, y: -4 }, { fsh: 0.6, bsh: 0.5, torso: 0.8, y: 14 }],
  getupAtk: [{ y: 26, torso: 0.6, fkn: 1.8, bkn: 1.8, fhip: 1.2, bhip: 1.0 }, { y: 16, fhip: 1.45, fkn: 0.05, bhip: -1.4, bkn: 0.05, torso: 0.2 }],
  buff: [{ fsh: 0.5, bsh: 0.4, y: 6 }, { fsh: 1.8, fel: 0.4, bsh: -1.6, bel: 0.4, head: -0.35, torso: -0.2 }],
  spin: [{ fhip: 0.6, fkn: 1.3 }, { fhip: 1.1, fkn: 0.1, bhip: -1.1, bkn: 0.1, fsh: 1.5, fel: 0.1, bsh: -1.5 }],
  blink: [{ y: 14, fkn: 1.3, bkn: 1.3, fhip: 0.6, fsh: 1.2, fel: 1.8 }, { y: -4, fsh: 2.8, bsh: 2.8, squash: 1.1 }],
};

/** 攻撃中に体ごと回るワザ */
const SPIN: Partial<Record<AnimId, number>> = {
  nair: Math.PI * 2,
  uair: -Math.PI * 2,
  getupAtk: Math.PI * 2,
  spin: Math.PI * 2,
  rise: Math.PI * 4,
  throwB: Math.PI,
};

function moveTiming(m: MoveDef): { start: number; end: number } {
  let start = Infinity;
  let end = 0;
  for (const h of m.hitboxes) {
    start = Math.min(start, h.f0);
    end = Math.max(end, h.f1);
  }
  for (const s of m.spawns ?? []) {
    start = Math.min(start, s.f);
    end = Math.max(end, s.f + 4);
  }
  if (m.counter) {
    start = Math.min(start, m.counter.f0);
    end = Math.max(end, m.counter.f1);
  }
  if (m.buff || m.heal) {
    start = Math.min(start, 12);
    end = Math.max(end, 20);
  }
  if (!Number.isFinite(start)) {
    start = Math.min(10, m.frames * 0.3);
    end = Math.min(m.frames, start + 8);
  }
  return { start: Math.max(1, start), end: Math.max(end, start + 1) };
}

function attackPose(f: Fighter): Pose {
  const m = f.move;
  if (!m) return IDLE;
  const [w, s] = ATTACK[m.anim] ?? ATTACK.jab1;
  const W = P({ ...w });
  const S = P({ ...s });
  const { start, end } = moveTiming(m);
  const t = f.mf;
  let pose: Pose;
  if (t < start) {
    const a = start * 0.75;
    pose = t < a ? mix(IDLE, W, easeOutCubic(t / Math.max(1, a))) : mix(W, S, easeInOutQuad((t - a) / Math.max(1, start - a)));
    // スマッシュホールド中は構えで震える
    if (m.charge && t === m.charge.at && f.charge > 0) pose = mix(W, S, 0.05);
  } else if (t < end) {
    pose = S;
  } else {
    const rec = (t - end) / Math.max(1, m.frames - end);
    pose = mix(S, IDLE, easeInOutQuad(clamp(rec, 0, 1)));
  }
  const spin = SPIN[m.anim];
  if (spin) {
    const k = clamp((t - start + 2) / Math.max(1, end - start + 2), 0, 1);
    pose.spin = spin * easeOutCubic(k);
  }
  return pose;
}

const RUN = (ph: number): Pose =>
  P({
    torso: 0.38,
    fhip: Math.sin(ph) * 0.95 + 0.15,
    fkn: 0.5 + Math.max(0, -Math.cos(ph)) * 1.4,
    bhip: -Math.sin(ph) * 0.95 + 0.15,
    bkn: 0.5 + Math.max(0, Math.cos(ph)) * 1.4,
    fsh: -Math.sin(ph) * 1.0,
    fel: 1.5,
    bsh: Math.sin(ph) * 1.0,
    bel: 1.5,
    y: -Math.abs(Math.cos(ph)) * 4 + 2,
    head: -0.2,
  });

const WALK = (ph: number): Pose =>
  P({
    torso: 0.08,
    fhip: Math.sin(ph) * 0.55,
    fkn: 0.15 + Math.max(0, -Math.cos(ph)) * 0.7,
    bhip: -Math.sin(ph) * 0.55,
    bkn: 0.15 + Math.max(0, Math.cos(ph)) * 0.7,
    fsh: -Math.sin(ph) * 0.5,
    fel: 0.6,
    bsh: Math.sin(ph) * 0.5,
    bel: 0.6,
    y: -Math.abs(Math.cos(ph)) * 2,
  });

/** 状態から姿勢を決める */
export function poseFor(f: Fighter, time: number): Pose {
  const breath = Math.sin(time * 0.07 + f.port) * 0.03;
  switch (f.state) {
    case 'idle':
      return P({ torso: 0.08 + breath, y: breath * 30, fsh: 0.65, fel: 1.5, bsh: 0.25, bel: 1.2 });
    case 'walk':
      return WALK(f.walkPhase * 1.4);
    case 'dash':
    case 'run':
      return RUN(f.walkPhase * 1.2);
    case 'skid':
      return P({ torso: -0.35, fhip: 0.9, fkn: 0.2, bhip: -0.5, bkn: 0.9, fsh: -0.6, bsh: 1.0, y: 6 });
    case 'crouch':
      return P({ y: 22, torso: 0.45, fhip: 1.2, fkn: 2.1, bhip: 0.7, bkn: 2.0, fsh: 0.9, fel: 1.4, bsh: 0.6 });
    case 'jumpsquat':
    case 'land':
      return P({ y: 14, torso: 0.3, fhip: 0.9, fkn: 1.6, bhip: 0.5, bkn: 1.5, fsh: 0.2, bsh: -0.4 });
    case 'air':
    case 'respawn': {
      const vy = f.vy;
      if (f.state === 'air' && f.t < 16 && f.airJumps < f.stats.airJumps && vy < -4) {
        return P({ spin: -Math.PI * 2 * easeOutCubic(f.t / 16), fhip: 1.3, fkn: 1.9, bhip: 1.1, bkn: 1.9, fsh: 1.2, bsh: 1.1, fel: 1.8, bel: 1.8 });
      }
      return vy < 0
        ? P({ fhip: 0.9, fkn: 1.5, bhip: -0.2, bkn: 0.7, fsh: 1.0, fel: 1.0, bsh: -0.5, torso: 0.05 })
        : P({ fhip: 0.35, fkn: 0.35, bhip: -0.3, bkn: 0.7, fsh: 1.2, fel: 0.6, bsh: -0.7, bel: 0.6, torso: 0.05 });
    }
    case 'attack':
      return attackPose(f);
    case 'shield':
    case 'shieldstun':
    case 'unshield':
      return P({ y: 10, torso: 0.25, fsh: 1.2, fel: 2.0, bsh: 0.9, bel: 1.9, fhip: 0.5, fkn: 0.8, bhip: -0.2, bkn: 0.7 });
    case 'roll':
    case 'ledgeroll':
      return P({ y: 20, spin: (f.t / 26) * Math.PI * 2 * (f.state === 'roll' ? f.rollDir * f.facing : 1), fhip: 1.4, fkn: 2.2, bhip: 1.3, bkn: 2.2, fsh: 1.4, fel: 2.2, bsh: 1.2, bel: 2.2, torso: 0.6 });
    case 'spotdodge':
      return P({ y: 6, squash: 0.92, torso: -0.2, fsh: 0.1, bsh: -0.1 });
    case 'airdodge':
      return P({ fhip: 1.2, fkn: 2.0, bhip: 1.0, bkn: 2.0, fsh: 1.1, fel: 2.1, bsh: 1.0, bel: 2.1, torso: 0.5, spin: f.airdodgeDir ? 0 : (f.t / 34) * Math.PI * 2 });
    case 'hurt':
    case 'grabbed':
    case 'stun': {
      const tumble = f.state === 'hurt' && f.tumble && !f.grounded;
      return P({
        torso: -0.55,
        head: -0.4,
        fsh: -0.9 + Math.sin(time * 0.5) * 0.3,
        fel: 0.5,
        bsh: 1.6,
        bel: 0.4,
        fhip: 0.9,
        fkn: 0.8,
        bhip: -0.5,
        bkn: 1.1,
        spin: tumble ? -time * 0.35 * f.facing : 0,
      });
    }
    case 'tumble':
      return P({ torso: -0.3, fsh: 2.2, bsh: 1.6, fhip: 0.6, fkn: 1.2, bhip: -0.4, bkn: 1.0, spin: -time * 0.2 });
    case 'helpless':
      return P({ torso: -0.1, fsh: 2.6 + Math.sin(time * 0.4) * 0.3, bsh: 2.4 + Math.cos(time * 0.4) * 0.3, fhip: 0.4, fkn: 0.9, bhip: -0.2, bkn: 1.2 });
    case 'ledge':
      return P({ y: -26, torso: 0.1, fsh: 3.05, fel: 0.1, bsh: 2.9, bel: 0.2, fhip: 0.3, fkn: 0.4, bhip: 0.1, bkn: 0.6 });
    case 'ledgeclimb':
      return mix(P({ y: -26, fsh: 3.05, bsh: 2.9, fhip: 0.3 }), P({ y: 18, torso: 0.5, fhip: 1.3, fkn: 1.9, bhip: 0.6, bkn: 1.8, fsh: 0.8, bsh: 0.6 }), clamp(f.t / 18, 0, 1));
    case 'holding':
      return P({ fsh: 1.45, fel: 0.3, bsh: 1.3, bel: 0.4, torso: 0.2 });
    case 'down':
      return P({ y: 30, spin: -Math.PI / 2, torso: 0, fhip: 0.1, fkn: 0.2, bhip: -0.1, bkn: 0.4, fsh: 2.4, bsh: 2.8 });
    case 'getup':
      return mix(P({ y: 30, spin: -Math.PI / 2, fsh: 2.4, bsh: 2.8 }), P({ y: 14, torso: 0.3, fkn: 1.4, bkn: 1.4, fhip: 0.8, bhip: 0.4 }), clamp(f.t / 20, 0, 1));
    case 'dizzy':
      return P({ torso: Math.sin(time * 0.15) * 0.35, head: Math.sin(time * 0.15 + 1) * 0.4, fsh: 0.2, bsh: 0.1, fel: 0.2, bel: 0.2, fkn: 0.5, bkn: 0.5, y: 6 });
    default:
      return IDLE;
  }
}

/** 骨格の関節位置（ファイター基準・右向き・単位は身長100基準） */
export interface Joints {
  hip: [number, number];
  neck: [number, number];
  head: [number, number];
  sh: [number, number];
  fel: [number, number];
  fha: [number, number];
  bel: [number, number];
  bha: [number, number];
  fkn: [number, number];
  ffo: [number, number];
  bkn: [number, number];
  bfo: [number, number];
  /** 前腕の向き（武器の角度） */
  fArmAng: number;
  bArmAng: number;
  torsoAng: number;
}

const THIGH = 22;
const SHIN = 22;
const TORSO = 30;
const UPPER = 17;
const FORE = 16;

const dirv = (a: number, len: number): [number, number] => [Math.sin(a) * len, Math.cos(a) * len];

export function solve(p: Pose, plant: boolean): Joints {
  const hip: [number, number] = [p.x, -44 + p.y];
  const up: [number, number] = [Math.sin(p.torso), -Math.cos(p.torso)];
  const neck: [number, number] = [hip[0] + up[0] * TORSO, hip[1] + up[1] * TORSO];
  const ha = p.torso + p.head;
  const head: [number, number] = [neck[0] + Math.sin(ha) * 12, neck[1] - Math.cos(ha) * 12];
  const sh: [number, number] = [lerp(neck[0], hip[0], 0.1), lerp(neck[1], hip[1], 0.1)];
  const fa1 = p.torso + p.fsh;
  const fe = dirv(fa1, UPPER);
  const felj: [number, number] = [sh[0] + fe[0], sh[1] + fe[1]];
  const fa2 = fa1 + p.fel;
  const fh = dirv(fa2, FORE);
  const fha: [number, number] = [felj[0] + fh[0], felj[1] + fh[1]];
  const ba1 = p.torso + p.bsh;
  const be = dirv(ba1, UPPER);
  const belj: [number, number] = [sh[0] + be[0], sh[1] + be[1]];
  const ba2 = ba1 + p.bel;
  const bh = dirv(ba2, FORE);
  const bha: [number, number] = [belj[0] + bh[0], belj[1] + bh[1]];
  const fk = dirv(p.fhip, THIGH);
  const fknj: [number, number] = [hip[0] + fk[0], hip[1] + fk[1]];
  const ff = dirv(p.fhip - p.fkn, SHIN);
  const ffo: [number, number] = [fknj[0] + ff[0], fknj[1] + ff[1]];
  const bk = dirv(p.bhip, THIGH);
  const bknj: [number, number] = [hip[0] + bk[0], hip[1] + bk[1]];
  const bf = dirv(p.bhip - p.bkn, SHIN);
  const bfo: [number, number] = [bknj[0] + bf[0], bknj[1] + bf[1]];
  const j: Joints = { hip, neck, head, sh, fel: felj, fha, bel: belj, bha, fkn: fknj, ffo, bkn: bknj, bfo, fArmAng: fa2, bArmAng: ba2, torsoAng: p.torso };
  if (plant) {
    // 足を地面に着ける
    const low = Math.max(ffo[1], bfo[1]);
    const dy = -low;
    for (const k of ['hip', 'neck', 'head', 'sh', 'fel', 'fha', 'bel', 'bha', 'fkn', 'ffo', 'bkn', 'bfo'] as const) j[k][1] += dy;
  }
  return j;
}
