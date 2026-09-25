import type { Effect } from './types';

export const FX_COLOR: Record<Effect, { main: string; hot: string }> = {
  normal: { main: '#ffb347', hot: '#fff6d8' },
  slash: { main: '#9fe8ff', hot: '#ffffff' },
  fire: { main: '#ff6a1f', hot: '#ffe08a' },
  elec: { main: '#7fe6ff', hot: '#fffb9e' },
  water: { main: '#3fb4ff', hot: '#d6f3ff' },
  wind: { main: '#8dffc8', hot: '#f0fff7' },
  poison: { main: '#a45cff', hot: '#e8c9ff' },
  dark: { main: '#7a3cff', hot: '#ff5fd2' },
  light: { main: '#ffd76b', hot: '#fffbe6' },
  petal: { main: '#ff8fc0', hot: '#ffe6f1' },
  metal: { main: '#ffc233', hot: '#fff3c4' },
  ink: { main: '#2b2b44', hot: '#8a8aa8' },
  sound: { main: '#ffcf70', hot: '#fff4d6' },
};

export type ParticleKind = 'spark' | 'dust' | 'ring' | 'shard' | 'smoke' | 'petal' | 'flash' | 'line' | 'blast' | 'star' | 'text';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  color2?: string;
  rot: number;
  vr: number;
  grav: number;
  drag: number;
  text?: string;
  /** 前面に描く（ファイターより手前） */
  front?: boolean;
}

export class Effects {
  parts: Particle[] = [];
  /** 画面全体のフラッシュ（撃墜・決定打） */
  screenFlash = 0;
  screenFlashColor = '#ffffff';

  add(p: Partial<Particle> & { kind: ParticleKind; x: number; y: number }): void {
    if (this.parts.length > 900) this.parts.shift();
    this.parts.push({
      vx: 0,
      vy: 0,
      life: 20,
      max: p.life ?? 20,
      size: 6,
      color: '#fff',
      rot: 0,
      vr: 0,
      grav: 0,
      drag: 1,
      ...p,
    });
  }

  step(): void {
    for (const p of this.parts) {
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.grav;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life--;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.screenFlash > 0) this.screenFlash--;
  }

  dust(x: number, y: number, dir: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random();
      this.add({
        kind: 'dust',
        x: x + (Math.random() - 0.5) * 30,
        y: y - 4,
        vx: (dir === 0 ? (Math.random() - 0.5) * 4 : -dir * (1 + Math.random() * 3)) * (0.6 + a),
        vy: -Math.random() * 1.6,
        life: 18 + Math.random() * 14,
        size: 8 + Math.random() * 10,
        color: 'rgba(230,220,200,0.55)',
        drag: 0.92,
      });
    }
  }

  /** ヒットエフェクト。strength 0..1 */
  spark(x: number, y: number, strength: number, fx: Effect, angle: number): void {
    const c = FX_COLOR[fx];
    const s = 0.5 + strength;
    this.add({ kind: 'flash', x, y, life: 7 + strength * 6, size: 34 * s, color: c.hot, color2: c.main, front: true });
    this.add({ kind: 'ring', x, y, life: 12 + strength * 8, size: 20 * s, color: c.main, vr: 3 + strength * 5, front: true });
    const n = Math.round(6 + strength * 14);
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * 1.8;
      const sp = (4 + Math.random() * 10) * s;
      this.add({
        kind: fx === 'petal' ? 'petal' : fx === 'slash' ? 'line' : 'spark',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 10 + Math.random() * 12,
        size: (2 + Math.random() * 3) * s,
        color: Math.random() < 0.5 ? c.hot : c.main,
        drag: 0.86,
        rot: a,
        vr: fx === 'petal' ? 0.2 : 0,
        front: true,
      });
    }
    if (fx === 'slash') {
      this.add({ kind: 'line', x, y, life: 8, size: 70 * s, color: c.hot, rot: angle + Math.PI / 2 + (Math.random() - 0.5), front: true });
    }
  }

  ring(x: number, y: number, r: number, color: string, life: number): void {
    this.add({ kind: 'ring', x, y, life, size: r, color, vr: 2.2 });
  }

  burst(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = 3 + Math.random() * 6;
      this.add({ kind: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 24 + Math.random() * 12, size: 5, color, drag: 0.9, vr: 0.3 });
    }
  }

  poisonPuff(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      this.add({
        kind: 'smoke',
        x: x + (Math.random() - 0.5) * 30,
        y: y + (Math.random() - 0.5) * 30,
        vy: -0.8 - Math.random(),
        life: 26,
        size: 10 + Math.random() * 8,
        color: 'rgba(170,90,255,0.5)',
        drag: 0.95,
      });
    }
  }

  /** 撃墜: 画面外へ向かう光の柱 */
  blast(x: number, y: number, angle: number, color: string): void {
    this.add({ kind: 'blast', x, y, life: 55, size: 160, color, rot: angle, front: true });
    for (let i = 0; i < 40; i++) {
      const a = angle + Math.PI + (Math.random() - 0.5) * 1.6;
      const sp = 6 + Math.random() * 22;
      this.add({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 30 + Math.random() * 30,
        size: 3 + Math.random() * 5,
        color: Math.random() < 0.5 ? '#ffffff' : color,
        drag: 0.93,
        front: true,
      });
    }
    this.screenFlash = 8;
    this.screenFlashColor = color;
  }

  text(x: number, y: number, text: string, color: string): void {
    this.add({ kind: 'text', x, y, vy: -1.2, life: 50, size: 30, color, text, drag: 0.97, front: true });
  }
}
