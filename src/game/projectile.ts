import type { Fighter } from './fighter';
import type { Match } from './match';
import type { ProjectileDef } from './types';

let nextId = 1;

export class Projectile {
  readonly id = nextId++;
  age = 0;
  dead = false;
  rot = 0;
  r: number;
  life: number;
  /** 対象 port → 最後に当たった age */
  hits = new Map<number, number>();
  prevX: number;
  prevY: number;
  /** 着地して止まった（設置型） */
  settled = false;
  /** 溜め倍率（発射時の持ち主の chargeMul） */
  mult = 1;

  constructor(
    public owner: Fighter,
    public def: ProjectileDef,
    public face: 1 | -1,
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
  ) {
    this.r = def.r;
    this.life = def.life;
    this.prevX = x;
    this.prevY = y;
  }

  get team(): number {
    return this.owner.team;
  }

  step(m: Match): void {
    const d = this.def;
    this.age++;
    this.prevX = this.x;
    this.prevY = this.y;
    if (d.follow) {
      this.x = this.owner.x + d.x * this.owner.facing;
      this.y = this.owner.y + d.y;
      if (!this.owner.alive) this.kill(m, false);
    } else {
      if (d.homing && !this.settled) {
        let best: Fighter | null = null;
        let bd = Infinity;
        for (const f of m.fighters) {
          if (f.team === this.team || !f.alive || f.state === 'respawn') continue;
          const dd = (f.x - this.x) ** 2 + (f.cy - this.y) ** 2;
          if (dd < bd) {
            bd = dd;
            best = f;
          }
        }
        if (best) {
          const sp = Math.hypot(this.vx, this.vy) || 1;
          const want = Math.atan2(best.cy - this.y, best.x - this.x);
          const cur = Math.atan2(this.vy, this.vx);
          let diff = want - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const na = cur + diff * d.homing;
          this.vx = Math.cos(na) * sp;
          this.vy = Math.sin(na) * sp;
        }
      }
      if (!this.settled) {
        this.vy += d.gravity ?? 0;
        if (d.accelX) this.vx += d.accelX * this.face;
        if (d.drag) {
          this.vx *= d.drag;
          this.vy *= d.drag;
        }
        this.x += this.vx;
        this.y += this.vy;
        this.groundCheck(m);
      }
    }
    if (d.grow) this.r = Math.max(2, this.r + d.grow);
    this.rot += d.spin ?? 0;
    const b = m.stage.blast;
    if (this.x < b.l - 200 || this.x > b.r + 200 || this.y > b.b + 200 || this.y < b.t - 200) this.dead = true;
    if (--this.life <= 0) this.kill(m, true);
  }

  private groundCheck(m: Match): void {
    const d = this.def;
    const mode = d.ground ?? 'die';
    const surfaces: { x1: number; x2: number; y: number }[] = [m.stage.main];
    if (mode !== 'die' || d.trap) for (const p of m.plats) surfaces.push(p);
    for (const s of surfaces) {
      if (this.x < s.x1 || this.x > s.x2) continue;
      if (this.vy >= 0 && this.prevY + this.r * 0.5 <= s.y + 1 && this.y + this.r * 0.5 >= s.y) {
        if (d.trap) {
          this.y = s.y - this.r * 0.5;
          this.vx = this.vy = 0;
          this.settled = true;
          return;
        }
        switch (mode) {
          case 'die':
            this.kill(m, true);
            return;
          case 'bounce':
            this.y = s.y - this.r * 0.5;
            this.vy = -Math.abs(this.vy) * 0.6;
            if (Math.abs(this.vy) < 1.5) this.vy = -4;
            return;
          case 'slide':
            this.y = s.y - this.r * 0.5;
            this.vy = 0;
            return;
          case 'stop':
            this.y = s.y - this.r * 0.5;
            this.vx = this.vy = 0;
            this.settled = true;
            return;
        }
      }
    }
    // メイン足場の側面に当たったら消える
    const main = m.stage.main;
    if (mode === 'die' && this.x > main.x1 && this.x < main.x2 && this.y > main.y + 8 && this.y < main.y + main.depth) this.kill(m, true);
  }

  kill(m: Match, explode: boolean): void {
    if (this.dead) return;
    this.dead = true;
    if (explode && this.def.explode) m.explode(this);
  }
}
