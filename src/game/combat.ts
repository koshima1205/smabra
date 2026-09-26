import * as K from './constants';
import type { HitboxBase } from './types';

/**
 * 吹っ飛び値（プラットフォーム対戦でよく使われる形の式）
 * p: 攻撃後の蓄積％, d: ダメージ, w: 重さ(100 が標準), bkb: ベース, kbg: 成長率
 */
export function knockback(p: number, d: number, w: number, bkb: number, kbg: number): number {
  return ((p / 10 + (p * d) / 20) * (200 / (w + 100)) * 1.4 + 18) * (kbg / 100) + bkb;
}

/** ヒットストップF */
export function hitlagFrames(dmg: number, hb: HitboxBase): number {
  const base = (dmg * 0.45 + 4) * (hb.hitlag ?? 1) * (hb.fx === 'elec' ? 1.4 : 1);
  return Math.min(K.MAX_HITLAG, Math.max(1, Math.floor(base)));
}

/**
 * 吹っ飛びをシミュレートして撃墜されそうか判定（決定打演出用）
 */
export function predictKo(
  x: number,
  y: number,
  lx: number,
  ly: number,
  speed: number,
  gravity: number,
  maxFall: number,
  blast: { l: number; r: number; t: number; b: number },
): boolean {
  let kx = lx * speed;
  let ky = ly * speed;
  let vy = 0;
  for (let i = 0; i < 240; i++) {
    const sp = Math.hypot(kx, ky);
    const ns = Math.max(0, sp - K.LAUNCH_DECAY);
    if (sp > 0) {
      kx *= ns / sp;
      ky *= ns / sp;
    }
    vy = Math.min(vy + gravity, maxFall);
    x += kx;
    y += ky + vy;
    if (x < blast.l || x > blast.r || y < blast.t || y > blast.b) return true;
    if (ns === 0 && vy >= maxFall) return false;
  }
  return false;
}
