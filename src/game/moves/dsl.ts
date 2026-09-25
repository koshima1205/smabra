import type { AnimId, Effect, HitboxBase, HitboxDef, MoveDef, ProjDraw, ProjectileDef } from '../types';

/** 攻撃判定 */
export function hb(
  x: number,
  y: number,
  r: number,
  f0: number,
  f1: number,
  dmg: number,
  ang: number,
  bkb: number,
  kbg: number,
  o: Partial<HitboxDef> = {},
): HitboxDef {
  return { x, y, r, f0, f1, dmg, ang, bkb, kbg, ...o };
}

/** ワザ */
export function mv(name: string, anim: AnimId, frames: number, hitboxes: HitboxDef[], o: Partial<MoveDef> = {}): MoveDef {
  return { name, anim, frames, hitboxes, ...o };
}

/** 判定パラメータのみ（飛び道具用） */
export function hit(dmg: number, ang: number, bkb: number, kbg: number, o: Partial<HitboxBase> = {}): HitboxBase {
  return { dmg, ang, bkb, kbg, ...o };
}

/** 飛び道具 */
export function proj(
  draw: ProjDraw,
  fx: Effect,
  o: Omit<Partial<ProjectileDef>, 'draw' | 'fx'> & { hit: HitboxBase; life: number; r: number; vx: number },
): ProjectileDef {
  return { draw, fx, x: 34, y: -55, vy: 0, ...o };
}

export function cloneMove(m: MoveDef): MoveDef {
  return structuredClone(m);
}

/** 発生を d F ずらす（ワザ全体の時間も伸縮） */
export function shiftMove(m: MoveDef, d: number): MoveDef {
  if (d === 0) return m;
  const firstHit = Math.min(...m.hitboxes.map((h) => h.f0), m.spawns?.[0]?.f ?? 999);
  const dd = Math.max(d, 1 - (Number.isFinite(firstHit) ? firstHit : 1));
  for (const h of m.hitboxes) {
    h.f0 += dd;
    h.f1 += dd;
  }
  m.frames = Math.max(8, m.frames + dd);
  if (m.charge) m.charge.at = Math.max(1, m.charge.at + dd);
  if (m.spawns) for (const s of m.spawns) s.f = Math.max(1, s.f + dd);
  if (m.impulses) for (const i of m.impulses) i.f = Math.max(0, i.f + dd);
  if (m.autoCancel !== undefined) m.autoCancel += dd;
  if (m.trail) m.trail = [m.trail[0] + dd, m.trail[1] + dd];
  return m;
}

/** 体格に合わせて判定位置・大きさを拡大 */
export function scaleMove(m: MoveDef, s: number): MoveDef {
  if (s === 1) return m;
  for (const h of m.hitboxes) {
    h.x *= s;
    h.y *= s;
    h.r *= s;
  }
  if (m.spawns) {
    for (const sp of m.spawns) {
      sp.proj.x *= s;
      sp.proj.y *= s;
      sp.proj.r *= s;
    }
  }
  if (m.reflect) {
    m.reflect.x *= s;
    m.reflect.y *= s;
    m.reflect.r *= s;
  }
  return m;
}

/** 前方向のリーチを伸ばす（x>0 の判定を外側へ） */
export function reachMove(m: MoveDef, add: number, sizeMul = 1): MoveDef {
  for (const h of m.hitboxes) {
    if (h.grab) continue;
    if (h.x > 8) h.x += add;
    else if (h.x < -8) h.x -= add;
    h.r *= sizeMul;
  }
  return m;
}

/** ダメージと吹っ飛びを調整 */
export function powerMove(m: MoveDef, dmgMul: number, kbgAdd = 0): MoveDef {
  for (const h of m.hitboxes) {
    if (h.grab) continue;
    h.dmg = Math.round(h.dmg * dmgMul * 10) / 10;
    h.kbg += kbgAdd;
  }
  if (m.spawns) for (const sp of m.spawns) sp.proj.hit.dmg = Math.round(sp.proj.hit.dmg * dmgMul * 10) / 10;
  return m;
}

export function withFx(m: MoveDef, fx: Effect): MoveDef {
  for (const h of m.hitboxes) if (!h.grab) h.fx = fx;
  m.fx = fx;
  return m;
}
