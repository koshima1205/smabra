import { emptyPad, type PadState } from '../core/input';
import { Rng } from '../core/math';
import type { Fighter } from './fighter';
import type { Brain, Match } from './match';

type Step = { n: number; pad: Partial<PadState> };

/**
 * CPU。レベル 1〜9。
 * 行動は「数F 分の入力列」をキューに積んで順に出す（押しっぱなし・ボタンの離しも表現できる）。
 */
export class CpuBrain implements Brain {
  pad: PadState = emptyPad();
  private queue: Step[] = [];
  private rng: Rng;
  private target: Fighter | null = null;
  private retarget = 0;
  private wait = 0;
  private ledgeWait = -1;

  constructor(
    public level: number,
    seed: number,
  ) {
    this.rng = new Rng(seed * 7919 + level);
  }

  /** 反応の遅さ（F） */
  private get reaction(): number {
    return Math.max(2, 22 - this.level * 2.2);
  }
  private chance(p: number): boolean {
    return this.rng.next() < p;
  }

  think(m: Match, me: Fighter): void {
    this.pad = emptyPad();
    if (m.phase !== 'play' && m.phase !== 'end') return;
    if (this.queue.length > 0) {
      const s = this.queue[0];
      Object.assign(this.pad, s.pad);
      if (--s.n <= 0) this.queue.shift();
      return;
    }
    if (me.state === 'dead') return;
    if (me.state === 'respawn') {
      if (me.t > 30 + this.rng.int(0, 60)) this.pad.y = 1;
      return;
    }
    this.pickTarget(m, me);
    if (me.state === 'hurt') {
      this.di(m, me);
      return;
    }
    if (me.state === 'tumble' && this.chance(0.04 * this.level)) this.pad.shield = me.vy > 4;
    if (me.state === 'grabbed') {
      if (this.chance(0.15 + this.level * 0.06)) this.pad.attack = true;
      this.pad.x = this.rng.pick([-1, 1]);
      return;
    }
    if (me.state === 'holding') {
      this.throwChoice(m, me);
      return;
    }
    if (me.state === 'ledge') {
      this.ledge(m, me);
      return;
    }
    this.ledgeWait = -1;
    if (this.offstage(m, me)) {
      this.recover(m, me);
      return;
    }
    if (me.state === 'down' && me.t > 16) {
      const r = this.rng.next();
      if (r < 0.35) this.pad.attack = true;
      else if (r < 0.7) this.pad.x = this.rng.pick([-1, 1]);
      else this.pad.jump = true;
      return;
    }
    if (this.wait > 0) {
      this.wait--;
      this.drift(m, me);
      return;
    }
    this.neutral(m, me);
  }

  private pickTarget(m: Match, me: Fighter): void {
    if (this.target && this.target.alive && this.target.stocks > 0 && --this.retarget > 0) return;
    let best: Fighter | null = null;
    let bd = Infinity;
    for (const f of m.fighters) {
      if (f.team === me.team || !f.alive || f.stocks <= 0) continue;
      const d = Math.abs(f.x - me.x) + Math.abs(f.y - me.y) * 0.5 + (f.state === 'respawn' ? 600 : 0);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    this.target = best;
    this.retarget = 60 + this.rng.int(0, 90);
  }

  private offstage(m: Match, me: Fighter): boolean {
    const s = m.stage.main;
    if (me.grounded) return false;
    return me.x < s.x1 - 6 || me.x > s.x2 + 6 || me.y > s.y + 30;
  }

  /** ずらし: 撃墜方向と逆・ステージ側へ */
  private di(m: Match, me: Fighter): void {
    if (!this.chance(0.2 + this.level * 0.09)) return;
    const cx = (m.stage.main.x1 + m.stage.main.x2) / 2;
    this.pad.x = me.x < cx ? 1 : -1;
    this.pad.y = me.kby < -6 ? 1 : -0.4;
    // 受け身
    if (me.tumble && me.vy + me.kby > 2 && me.y > m.stage.main.y - 90 && this.chance(0.05 * this.level)) this.pad.shield = true;
  }

  private recover(m: Match, me: Fighter): void {
    const s = m.stage.main;
    const left = me.x < (s.x1 + s.x2) / 2;
    const ledgeX = left ? s.x1 : s.x2;
    const toward = left ? 1 : -1;
    const dx = ledgeX - me.x;
    const below = me.y - s.y; // 正なら崖より下
    this.pad.x = toward;
    if (me.state === 'helpless' || me.state === 'attack' || me.state === 'airdodge') {
      if (me.state === 'attack' && me.move?.drift) this.pad.x = toward;
      return;
    }
    const vy = me.vy + me.kby;
    // 空中ジャンプ
    if (me.airJumps > 0 && vy > -2 && (below > -40 || Math.abs(dx) > 260)) {
      this.queue.push({ n: 1, pad: { x: toward, jump: true } }, { n: 3, pad: { x: toward } });
      return;
    }
    // 上必殺ワザ
    const needUp = me.airJumps === 0 && vy > -1 && (below > -60 || Math.abs(dx) > 170);
    if (needUp) {
      const up = me.spec.moves.uspec;
      const tele = !!up.teleport;
      const aimX = tele ? (Math.abs(dx) > 120 ? toward * 0.7 : 0) : toward;
      this.queue.push({ n: 1, pad: { x: aimX, y: -1, special: true } }, { n: 16, pad: { x: aimX, y: -0.9 } });
      return;
    }
    if (me.state === 'air' && vy > 0 && below < -120 && Math.abs(dx) < 120 && this.chance(0.3)) this.pad.y = 0;
  }

  private ledge(m: Match, me: Fighter): void {
    if (this.ledgeWait < 0) this.ledgeWait = 10 + this.rng.int(0, Math.max(6, 50 - this.level * 4));
    if (me.t < this.ledgeWait) return;
    this.ledgeWait = -1;
    const r = this.rng.next();
    const L = me.ledge;
    const toward = L ? -L.side : 1;
    if (r < 0.45) this.pad.x = toward;
    else if (r < 0.65) this.pad.jump = true;
    else if (r < 0.82) this.pad.attack = true;
    else this.pad.shield = true;
    void m;
  }

  private throwChoice(m: Match, me: Fighter): void {
    if (me.t < 8) return;
    const s = m.stage.main;
    const r = this.rng.next();
    const toEdge = me.x < (s.x1 + s.x2) / 2 ? -1 : 1;
    if (r < 0.25) this.pad.attack = true;
    else if (r < 0.6) this.pad.x = toEdge;
    else if (r < 0.8) this.pad.y = -1;
    else this.pad.y = 1;
  }

  /** 攻撃を控えて間合いを調整 */
  private drift(m: Match, me: Fighter): void {
    const t = this.target;
    if (!t) return;
    const dx = t.x - me.x;
    if (Math.abs(dx) > 180) this.pad.x = Math.sign(dx) * 0.6;
    void m;
  }

  private neutral(m: Match, me: Fighter): void {
    const t = this.target;
    const s = m.stage.main;
    if (!t) {
      // 相手がいない（復活待ち）ならステージ中央へ
      const cx = (s.x1 + s.x2) / 2;
      if (Math.abs(me.x - cx) > 80) this.pad.x = Math.sign(cx - me.x);
      return;
    }
    const dx = t.x - me.x;
    const dy = t.cy - me.cy;
    const dist = Math.abs(dx);
    const dir = Math.sign(dx) || 1;
    const lv = this.level;
    const actionable = ['idle', 'walk', 'dash', 'run', 'crouch', 'land', 'air', 'tumble', 'shield', 'skid'].includes(me.state);
    if (!actionable) return;

    // 危険: 近くで相手が攻撃中 → ガード / 回避
    const threat = t.state === 'attack' && t.move && dist < 150 && Math.abs(dy) < 120 && t.mf < (t.move.hitboxes[0]?.f0 ?? 0) + 2;
    if (threat && me.grounded && this.chance(0.08 * lv)) {
      const r = this.rng.next();
      if (r < 0.6) this.queue.push({ n: 10 + this.rng.int(0, 12), pad: { shield: true } });
      else if (r < 0.8) this.queue.push({ n: 1, pad: { shield: true } }, { n: 1, pad: { shield: true, y: 1 } }, { n: 20, pad: {} });
      else this.queue.push({ n: 1, pad: { jump: true, x: -dir } }, { n: 6, pad: { jump: true, x: -dir } });
      return;
    }
    // ガード中の相手にはつかみ
    if (t.state === 'shield' && dist < 90 && me.grounded && this.chance(0.1 + lv * 0.05)) {
      this.queue.push({ n: 1, pad: { grab: true, x: dir } }, { n: 4, pad: {} });
      return;
    }
    // 飛び道具への対処
    for (const p of m.projectiles) {
      if (p.team === me.team || p.def.follow) continue;
      const pdx = me.x - p.x;
      if (Math.abs(pdx) < 160 && Math.sign(p.vx) === Math.sign(pdx) && Math.abs(p.y - me.cy) < 80 && this.chance(0.03 * lv)) {
        this.queue.push(this.chance(0.5) ? { n: 12, pad: { shield: true } } : { n: 6, pad: { jump: true } });
        return;
      }
    }

    // 崖外の相手を待ち構える
    if (t.state !== 'ledge' && (t.x < s.x1 - 20 || t.x > s.x2 + 20) && me.grounded) {
      const edge = t.x < s.x1 ? s.x1 + 50 : s.x2 - 50;
      if (Math.abs(me.x - edge) > 30) this.pad.x = Math.sign(edge - me.x);
      else if (dist < 170 && t.y > s.y - 80 && t.y < s.y + 120 && this.chance(0.05 * lv)) {
        this.queue.push({ n: 1, pad: { smash: true, x: dir } }, { n: 10, pad: { smash: true } });
      } else if (this.chance(0.01 * lv) && me.spec.moves.nspec.spawns) {
        this.queue.push({ n: 1, pad: { special: true, x: 0 } }, { n: 14, pad: {} });
      }
      return;
    }
    if (t.state === 'ledge' && me.grounded) {
      const L = t.ledge;
      if (L) {
        const spot = L.x - L.side * 70;
        if (Math.abs(me.x - spot) > 25) this.pad.x = Math.sign(spot - me.x);
        else if (this.chance(0.02 * lv)) this.queue.push({ n: 1, pad: { smash: true, y: 1 } }, { n: 8, pad: { smash: true } });
      }
      return;
    }

    // 高さが違う: 上の足場へ跳ぶ / 下へ降りる
    if (me.grounded && dy < -110) {
      if (dist < 170 && this.chance(0.06 + lv * 0.02)) {
        this.queue.push({ n: 7, pad: { jump: true, x: dir } }, { n: 8, pad: { x: dir } });
        if (this.chance(0.7)) this.queue.push({ n: 1, pad: { attack: true, y: dy < -200 ? -1 : 0, x: dy < -200 ? 0 : dir } }, { n: 10, pad: { x: dir * 0.5 } });
      } else if (dist > 30) this.pad.x = dir;
      return;
    }
    if (me.grounded && dy > 110 && me.ground > 0) {
      this.queue.push({ n: 6, pad: { y: 1 } }, { n: 6, pad: { x: dir } });
      return;
    }
    if (!me.grounded && dist > 60) this.pad.x = dir;

    // 遠い: 飛び道具か接近
    if (dist > 240) {
      if (me.spec.moves.nspec.spawns && this.chance(0.012 * lv) && Math.abs(dy) < 90) {
        this.queue.push({ n: 1, pad: { x: dir * 0.3 } }, { n: 1, pad: { special: true } }, { n: 16, pad: {} });
        return;
      }
      this.pad.x = dir;
      if (me.grounded && dy < -140 && this.chance(0.05)) this.queue.push({ n: 6, pad: { jump: true, x: dir } });
      return;
    }
    // 中距離: 攻め方を選ぶ
    if (dist > 110) {
      const aggro = 0.25 + lv * 0.07;
      if (!this.chance(aggro * 0.25)) {
        this.pad.x = dir;
        if (this.chance(0.02)) this.wait = this.rng.int(4, 20);
        return;
      }
      const r = this.rng.next();
      if (me.grounded && r < 0.35) {
        // ダッシュ攻撃
        this.queue.push({ n: 8, pad: { x: dir } }, { n: 1, pad: { x: dir, attack: true } }, { n: 12, pad: {} });
      } else if (me.grounded && r < 0.7) {
        // 小ジャンプ前空中
        this.queue.push({ n: 2, pad: { jump: true, x: dir } }, { n: 5, pad: { x: dir } }, { n: 1, pad: { x: dir, attack: true } }, { n: 10, pad: { x: dir } });
      } else if (me.spec.moves.sspec.hitboxes.length > 0 && r < 0.85) {
        this.queue.push({ n: 1, pad: { x: dir, special: true } }, { n: 20, pad: {} });
      } else {
        this.pad.x = dir;
      }
      return;
    }
    // 近距離
    this.react(m, me, t, dy, dir);
  }

  private react(m: Match, me: Fighter, t: Fighter, dy: number, dir: number): void {
    const lv = this.level;
    if (!this.chance(0.18 + lv * 0.07)) {
      if (this.chance(0.5)) this.pad.x = dir * 0.4;
      return;
    }
    // 反応が遅いレベルは少し待つ
    if (this.chance(0.5)) this.queue.push({ n: Math.round(this.reaction / 3), pad: {} });
    const face = me.facing === dir;
    const heavy = t.damage > 85 + (9 - lv) * 6;
    if (me.grounded) {
      if (dy < -150) {
        this.pad.x = dir * 0.5;
        return;
      }
      if (dy < -70) {
        this.queue.push(heavy && this.chance(0.6) ? { n: 1, pad: { smash: true, y: -1 } } : { n: 1, pad: { attack: true, y: -1 } }, { n: heavy ? 10 : 2, pad: heavy ? { smash: true } : {} });
        return;
      }
      if (heavy && this.chance(0.55)) {
        const r = this.rng.next();
        const charge = this.rng.int(0, 20);
        if (r < 0.6) this.queue.push({ n: 1, pad: { smash: true, x: dir } }, { n: 1 + charge, pad: { smash: true } });
        else this.queue.push({ n: 1, pad: { smash: true, y: 1 } }, { n: 1 + charge, pad: { smash: true } });
        return;
      }
      const r = this.rng.next();
      if (r < 0.2) this.queue.push({ n: 1, pad: { grab: true } }, { n: 3, pad: {} });
      else if (r < 0.45) this.queue.push({ n: 1, pad: { attack: true } }, { n: 4, pad: {} }, { n: 1, pad: { attack: true } }, { n: 4, pad: {} }, { n: 1, pad: { attack: true } });
      else if (r < 0.7) this.queue.push({ n: 1, pad: { attack: true, x: dir } }, { n: 3, pad: {} });
      else if (r < 0.85) this.queue.push({ n: 1, pad: { attack: true, y: 1 } }, { n: 3, pad: {} });
      else if (r < 0.93) this.queue.push({ n: 2, pad: { jump: true } }, { n: 4, pad: { x: dir } }, { n: 1, pad: { attack: true, y: -1 } });
      else this.queue.push({ n: 1, pad: { special: true, y: 1 } }, { n: 10, pad: {} });
      return;
    }
    // 空中
    if (dy > 50) this.queue.push({ n: 1, pad: { attack: true, y: 1 } });
    else if (dy < -60) this.queue.push({ n: 1, pad: { attack: true, y: -1 } });
    else if (face) this.queue.push({ n: 1, pad: { attack: true, x: dir } });
    else this.queue.push({ n: 1, pad: { attack: true, x: dir } });
    void m;
  }
}
