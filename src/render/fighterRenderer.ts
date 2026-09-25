import { clamp, lerp } from '../core/math';
import type { Fighter } from '../game/fighter';
import type { Look, WeaponKind } from '../game/types';
import { poseFor, solve, type Joints, type Pose } from './rig';

export const PORT_COLORS = ['#ff4d4d', '#3d8bff', '#ffd23d', '#3ddc6a'];
export const CPU_COLOR = '#9aa0ab';

interface Ribbon {
  pts: { x: number; y: number; px: number; py: number }[];
}

interface RenderState {
  scarf: Ribbon;
  band: Ribbon;
  trail: { hx: number; hy: number; tx: number; ty: number; age: number }[];
  lastTime: number;
}

const states = new WeakMap<Fighter, RenderState>();

function ribbon(n: number, x: number, y: number): Ribbon {
  return { pts: Array.from({ length: n }, () => ({ x, y, px: x, py: y })) };
}

function rs(f: Fighter): RenderState {
  let s = states.get(f);
  if (!s) {
    s = { scarf: ribbon(8, f.x, f.y - 70), band: ribbon(6, f.x, f.y - 90), trail: [], lastTime: -1 };
    states.set(f, s);
  }
  return s;
}

function stepRibbon(r: Ribbon, ax: number, ay: number, seg: number, time: number, facing: number): void {
  const p0 = r.pts[0];
  p0.px = p0.x;
  p0.py = p0.y;
  p0.x = ax;
  p0.y = ay;
  for (let i = 1; i < r.pts.length; i++) {
    const p = r.pts[i];
    const vx = (p.x - p.px) * 0.88;
    const vy = (p.y - p.py) * 0.88;
    p.px = p.x;
    p.py = p.y;
    p.x += vx - facing * 0.25 + Math.sin(time * 0.13 + i) * 0.25;
    p.y += vy + 0.32;
  }
  for (let k = 0; k < 2; k++) {
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1];
      const b = r.pts[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const diff = (d - seg) / d;
      b.x -= dx * diff;
      b.y -= dy * diff;
    }
  }
}

function drawRibbon(ctx: CanvasRenderingContext2D, r: Ribbon, w0: number, color: string, outline: string): void {
  const pts = r.pts;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b.y - a.y);
    let ny = b.x - a.x;
    const d = Math.hypot(nx, ny) || 1;
    nx /= d;
    ny /= d;
    const w = w0 * (1 - (i / pts.length) * 0.75);
    left.push([pts[i].x + nx * w, pts[i].y + ny * w]);
    right.push([pts[i].x - nx * w, pts[i].y - ny * w]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = outline;
  ctx.stroke();
}

function limb(ctx: CanvasRenderingContext2D, pts: [number, number][], w: number, color: string, outline: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineWidth = w + 3.2;
  ctx.strokeStyle = outline;
  ctx.stroke();
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** 武器の長さ（先端位置の計算・軌跡用） */
export function weaponLength(k: WeaponKind): number {
  switch (k) {
    case 'katana':
    case 'lasersword':
      return 60;
    case 'bigblade':
      return 48;
    case 'club':
    case 'mallet':
      return 50;
    case 'chain':
      return 44;
    case 'dango':
      return 44;
    case 'gun':
      return 42;
    case 'brush':
      return 38;
    case 'shamisen':
      return 40;
    case 'dagger':
      return 24;
    case 'beads':
      return 30;
    default:
      return 16;
  }
}

function drawWeapon(ctx: CanvasRenderingContext2D, k: WeaponKind, look: Look, time: number): void {
  const c = look.weapon;
  ctx.lineCap = 'round';
  switch (k) {
    case 'katana':
    case 'bigblade':
    case 'dagger': {
      const len = weaponLength(k);
      const w = k === 'bigblade' ? 13 : k === 'dagger' ? 5 : 5.5;
      // 柄
      ctx.fillStyle = '#2a1d17';
      ctx.fillRect(-10, -2.8, 13, 5.6);
      ctx.fillStyle = '#c9a24a';
      ctx.fillRect(2, -5, 3, 10);
      // 刃
      ctx.beginPath();
      ctx.moveTo(5, -w / 2);
      ctx.lineTo(len - 6, -w / 2);
      ctx.quadraticCurveTo(len + 2, -w / 2, len, w / 2);
      ctx.lineTo(5, w / 2);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,50,70,0.8)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(8, -w / 2 + 1.2);
      ctx.lineTo(len - 6, -w / 2 + 1.2);
      ctx.stroke();
      break;
    }
    case 'lasersword': {
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(-10, -3, 14, 6);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(80,220,255,0.35)';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(60, 0);
      ctx.stroke();
      ctx.strokeStyle = c;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'claw':
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.5;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(2, i * 4);
        ctx.quadraticCurveTo(12, i * 5, 18, i * 6 + 3);
        ctx.stroke();
      }
      break;
    case 'shuriken': {
      ctx.save();
      ctx.translate(6, 0);
      ctx.rotate(time * 0.2);
      star(ctx, 0, 0, 8, 3, 4);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = '#3b4252';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'club':
    case 'mallet': {
      ctx.fillStyle = '#5b3a22';
      ctx.fillRect(-6, -3, 34, 6);
      ctx.fillStyle = c;
      if (k === 'mallet') {
        ctx.fillRect(28, -11, 16, 22);
        ctx.strokeStyle = '#3a2412';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(28, -11, 16, 22);
      } else {
        ctx.beginPath();
        ctx.moveTo(10, -4);
        ctx.lineTo(50, -9);
        ctx.quadraticCurveTo(56, 0, 50, 9);
        ctx.lineTo(10, 4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#3a2412';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      break;
    }
    case 'scroll':
      ctx.fillStyle = c;
      ctx.fillRect(0, -5, 22, 10);
      ctx.fillStyle = '#b8322a';
      ctx.fillRect(0, -6, 3, 12);
      ctx.fillRect(19, -6, 3, 12);
      break;
    case 'bow':
      ctx.strokeStyle = c;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(-4, 0, 26, -1.1, 1.1);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-4 + Math.cos(-1.1) * 26, Math.sin(-1.1) * 26);
      ctx.lineTo(-4 + Math.cos(1.1) * 26, Math.sin(1.1) * 26);
      ctx.stroke();
      break;
    case 'dango': {
      ctx.strokeStyle = '#c8a878';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(44, 0);
      ctx.stroke();
      const cols = ['#f7a8c4', '#fff6ea', '#9bd28a'];
      cols.forEach((col, i) => {
        circle(ctx, 18 + i * 9, 0, 5.5);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      break;
    }
    case 'bomb':
      circle(ctx, 8, 0, 8);
      ctx.fillStyle = '#26262e';
      ctx.fill();
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(12, -6);
      ctx.lineTo(16, -11);
      ctx.stroke();
      circle(ctx, 16, -12, 2 + Math.sin(time * 0.8));
      ctx.fillStyle = '#ffe07a';
      ctx.fill();
      break;
    case 'talisman':
      ctx.fillStyle = c;
      ctx.fillRect(2, -4, 8, 20);
      ctx.fillStyle = '#c62f2f';
      ctx.fillRect(4, 0, 4, 10);
      break;
    case 'beads': {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI;
        circle(ctx, 6 + Math.sin(a) * 14, Math.cos(a) * 14 - 2, 3);
        ctx.fillStyle = i === 0 ? '#e0c060' : c;
        ctx.fill();
      }
      break;
    }
    case 'halo':
      ctx.strokeStyle = c;
      ctx.lineWidth = 3;
      circle(ctx, 10, 0, 10);
      ctx.stroke();
      break;
    case 'shamisen':
      ctx.fillStyle = '#4a2a14';
      ctx.fillRect(0, -2, 40, 4);
      ctx.fillStyle = c;
      ctx.fillRect(-12, -9, 14, 18);
      ctx.fillStyle = '#f5ecd8';
      ctx.fillRect(-10, -7, 10, 14);
      break;
    case 'chain': {
      ctx.strokeStyle = '#6b4a2e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(18, 0);
      ctx.stroke();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(16, -2);
      ctx.quadraticCurveTo(30, -18, 40, -4);
      ctx.quadraticCurveTo(28, -10, 18, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,210,220,0.8)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-10, 18, -22, 10);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'brush':
      ctx.strokeStyle = '#6a4a2a';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(30, 0);
      ctx.stroke();
      ctx.fillStyle = '#16161e';
      ctx.beginPath();
      ctx.moveTo(30, -4);
      ctx.quadraticCurveTo(42, 0, 30, 4);
      ctx.fill();
      break;
    case 'gun':
      ctx.fillStyle = '#5b3a22';
      ctx.beginPath();
      ctx.moveTo(-8, -3);
      ctx.lineTo(8, -3);
      ctx.lineTo(4, 7);
      ctx.lineTo(-10, 5);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.fillRect(4, -4, 38, 4.5);
      ctx.fillStyle = '#c9a24a';
      ctx.fillRect(12, -5, 3, 6);
      break;
    case 'onibi':
    case 'spirit':
      // 手元に浮かぶ火の玉
      glow(ctx, 10, -4 + Math.sin(time * 0.2) * 3, 7, c);
      break;
    case 'fist':
    case 'falcon':
    case 'wings':
    case 'box':
    case 'abyss':
    default:
      break;
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, n: number): void {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? r1 : r2;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  circle(ctx, x, y, r * 2.2);
  ctx.fill();
}

// ───────────────────────── 本体 ─────────────────────────

function drawHead(ctx: CanvasRenderingContext2D, j: Joints, look: Look, hurt: boolean, time: number, blink: boolean): void {
  const [hx, hy] = j.head;
  const r = 13;
  ctx.save();
  ctx.translate(hx, hy - 2);
  ctx.rotate(j.torsoAng * 0.6);
  ctx.scale(1.2, 1.2);
  // 耳（後ろ側）
  if (look.ears) ears(ctx, look, r);
  // 後ろ髪
  if (look.hairStyle === 'long' || look.hairStyle === 'twin') {
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    if (look.hairStyle === 'long') {
      ctx.moveTo(-4, -r + 2);
      ctx.quadraticCurveTo(-r - 10, 4, -r - 4, r + 16 + Math.sin(time * 0.1) * 2);
      ctx.quadraticCurveTo(-6, r + 6, 2, 0);
    } else {
      circle(ctx, -r - 2, -2, 5);
      ctx.moveTo(-r - 2, 0);
      ctx.quadraticCurveTo(-r - 12, 10, -r - 8, r + 14 + Math.sin(time * 0.12) * 3);
      ctx.quadraticCurveTo(-r - 2, 12, -r + 2, 2);
    }
    ctx.fill();
  }
  if (look.hairStyle === 'bun') {
    circle(ctx, -r * 0.55, -r * 0.95, 6.5);
    ctx.fillStyle = look.hair;
    ctx.fill();
  }
  // 頭巾（頭全体）
  circle(ctx, 0, 0, r);
  ctx.fillStyle = look.hairStyle === 'hood' ? look.body : look.hair;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = look.body2;
  ctx.stroke();
  // 顔（口元は覆面）
  ctx.beginPath();
  ctx.ellipse(3.5, 1.5, 9.5, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = look.skin;
  ctx.fill();
  // 覆面
  ctx.beginPath();
  ctx.moveTo(-8, 3);
  ctx.quadraticCurveTo(4, 14, 13, 3.5);
  ctx.lineTo(13, 12);
  ctx.quadraticCurveTo(2, 18, -8, 10);
  ctx.closePath();
  ctx.fillStyle = look.body;
  ctx.fill();
  if (look.beard) {
    ctx.fillStyle = '#f2f2f2';
    ctx.beginPath();
    ctx.moveTo(-2, 8);
    ctx.quadraticCurveTo(6, 26, 12, 8);
    ctx.fill();
  }
  // 額当て（鉢巻）
  ctx.fillStyle = look.scarf;
  ctx.fillRect(-r + 1, -7.5, r * 2 - 1, 5.5);
  ctx.fillStyle = '#b9c3cf';
  ctx.fillRect(3, -8.5, 9, 7);
  ctx.strokeStyle = '#5c6570';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(3, -8.5, 9, 7);
  // 前髪
  if (look.hairStyle === 'spiky' || look.hairStyle === 'short' || look.hairStyle === 'twin' || look.hairStyle === 'bun' || look.hairStyle === 'long') {
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    if (look.hairStyle === 'spiky') {
      ctx.moveTo(-12, -6);
      ctx.lineTo(-10, -20);
      ctx.lineTo(-4, -12);
      ctx.lineTo(0, -22);
      ctx.lineTo(4, -12);
      ctx.lineTo(10, -19);
      ctx.lineTo(12, -8);
    } else {
      ctx.moveTo(-10, -8);
      ctx.quadraticCurveTo(0, -18, 12, -9);
      ctx.lineTo(12, -7);
      ctx.lineTo(-10, -7);
    }
    ctx.fill();
  }
  // 目
  if (hurt) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.6;
    for (const ex of [3.5, 10]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2, -1);
      ctx.lineTo(ex + 1.5, 1);
      ctx.lineTo(ex - 2, 3);
      ctx.stroke();
    }
  } else if (blink) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.6;
    for (const ex of [4, 10.5]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2, 1);
      ctx.lineTo(ex + 2, 1);
      ctx.stroke();
    }
  } else {
    for (const ex of [4, 10.5]) {
      ctx.beginPath();
      ctx.ellipse(ex, 1, 2.2, 3, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#1b1b24';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(ex + 0.3, 1.4, 1.4, 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = look.eye;
      ctx.fill();
      circle(ctx, ex + 0.8, -0.4, 0.7);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }
  if (look.horns) {
    ctx.fillStyle = '#ffd766';
    for (const hx2 of [-4, 6]) {
      ctx.beginPath();
      ctx.moveTo(hx2 - 3, -r + 3);
      ctx.quadraticCurveTo(hx2 - 2, -r - 12, hx2 + 3, -r - 13);
      ctx.quadraticCurveTo(hx2 + 1, -r - 4, hx2 + 3, -r + 3);
      ctx.fill();
    }
  }
  ctx.restore();
  if (look.halo) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,220,120,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(hx - 6, hy - 6, 12, 18, 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function ears(ctx: CanvasRenderingContext2D, look: Look, r: number): void {
  const c = look.hairStyle === 'hood' ? look.body : look.hair;
  ctx.fillStyle = c;
  ctx.strokeStyle = look.body2;
  ctx.lineWidth = 1.5;
  const pairs: [number, number][] = [
    [-7, -r + 3],
    [3, -r + 2],
  ];
  for (const [ex, ey] of pairs) {
    ctx.beginPath();
    switch (look.ears) {
      case 'rabbit':
        ctx.ellipse(ex, ey - 14, 4.5, 14, ex < 0 ? -0.25 : 0.15, 0, Math.PI * 2);
        break;
      case 'dog':
        ctx.moveTo(ex - 5, ey + 2);
        ctx.lineTo(ex, ey - 9);
        ctx.lineTo(ex + 6, ey + 4);
        break;
      default: {
        const h = look.ears === 'fox' ? 14 : 10;
        ctx.moveTo(ex - 5, ey + 3);
        ctx.lineTo(ex, ey - h);
        ctx.lineTo(ex + 5, ey + 3);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function tails(ctx: CanvasRenderingContext2D, j: Joints, look: Look, time: number): void {
  const n = look.tails;
  if (n <= 0) return;
  const [x, y] = j.hip;
  for (let i = 0; i < n; i++) {
    const spread = (i - (n - 1) / 2) * 0.35;
    const sway = Math.sin(time * 0.08 + i) * 0.25;
    const a = -2.3 + spread + sway;
    const len = look.ears === 'fox' ? 34 : 30;
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    ctx.beginPath();
    ctx.moveTo(x - 2, y - 2);
    ctx.quadraticCurveTo(x - 20, y + 6, ex, ey);
    if (look.ears === 'fox') {
      ctx.quadraticCurveTo(x - 10, y - 10, x + 2, y + 2);
      ctx.fillStyle = look.hair;
      ctx.fill();
      circle(ctx, ex, ey, 4);
      ctx.fillStyle = '#fff7ea';
      ctx.fill();
    } else {
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = look.hair;
      ctx.stroke();
    }
  }
}

function wings(ctx: CanvasRenderingContext2D, j: Joints, time: number, air: boolean): void {
  const [x, y] = j.sh;
  const flap = air ? Math.sin(time * 0.35) * 0.5 : Math.sin(time * 0.05) * 0.1;
  for (const k of [1, 0.8]) {
    ctx.save();
    ctx.translate(x - 4, y + 4);
    ctx.rotate(-0.6 - flap * k);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-30 * k, -40 * k, -58 * k, -24 * k);
    ctx.lineTo(-44 * k, -14 * k);
    ctx.lineTo(-50 * k, -4 * k);
    ctx.lineTo(-36 * k, 0);
    ctx.lineTo(-40 * k, 10 * k);
    ctx.closePath();
    ctx.fillStyle = k === 1 ? '#f7f3ff' : '#e0d8f0';
    ctx.fill();
    ctx.strokeStyle = '#a79cc0';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
}

function spiderLegs(ctx: CanvasRenderingContext2D, j: Joints, time: number): void {
  const [x, y] = j.sh;
  ctx.strokeStyle = '#2a1030';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const a = -2.5 + i * 0.35 + Math.sin(time * 0.2 + i) * 0.08;
    const kx = x - 6 + Math.cos(a) * 26;
    const ky = y + 8 + Math.sin(a) * 26;
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 8);
    ctx.lineTo(kx, ky);
    ctx.lineTo(kx - 12, ky + 22);
    ctx.stroke();
  }
}

export interface DrawOpts {
  time: number;
  zoom: number;
  tag: string;
  tagColor: string;
}

/** ファイター1体を描く（ctx はワールド座標変換済み） */
export function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, o: DrawOpts): void {
  if (!f.alive) return;
  const look = f.spec.look;
  const time = o.time;
  const s = f.stats.height / 100;
  const pose: Pose = poseFor(f, time);
  const plant = f.grounded && Math.abs(pose.spin) < 0.01 && f.state !== 'ledge' && f.state !== 'down';
  const j = solve(pose, plant);
  let wx = f.x;
  let wy = f.y;
  if (f.hitlag > 0 && (f.state === 'hurt' || f.state === 'stun')) wx += (Math.floor(time) % 2 ? 1 : -1) * 3.5;
  if ((f.state === 'ledgeclimb' || f.state === 'ledgeroll') && f.ledge) {
    const L = f.ledge;
    const k = clamp(f.t / (f.state === 'ledgeclimb' ? 24 : 32), 0, 1);
    const tx = L.x - L.side * (f.w / 2 + 6 + (f.state === 'ledgeroll' ? 150 * Math.max(0, k - 0.4) / 0.6 : 0));
    wx = lerp(f.x, tx, Math.min(1, k * 1.4));
    wy = lerp(f.y, L.y, Math.min(1, k * 1.6));
  }
  const face = f.facing;
  const spinCy = (j.hip[1] + j.neck[1]) / 2;
  const toWorld = (lx: number, ly: number): [number, number] => {
    let x = lx;
    let y = ly;
    if (pose.spin) {
      const c = Math.cos(pose.spin);
      const sn = Math.sin(pose.spin);
      const dy = y - spinCy;
      x = lx * c - dy * sn;
      y = spinCy + lx * sn + dy * c;
    }
    return [wx + x * face * s, wy + y * s * pose.squash];
  };

  // マフラー・鉢巻の物理（ワールド座標）
  const st = rs(f);
  if (st.lastTime !== time) {
    const neckBack = toWorld(j.neck[0] - 5, j.neck[1] + 3);
    const headBack = toWorld(j.head[0] - 11, j.head[1] - 5);
    stepRibbon(st.scarf, neckBack[0], neckBack[1], 7.5 * s, time, face);
    stepRibbon(st.band, headBack[0], headBack[1], 5.5 * s, time, face);
    // 武器の軌跡
    const mv = f.move;
    for (const p of st.trail) p.age++;
    st.trail = st.trail.filter((p) => p.age < 6);
    if (f.state === 'attack' && mv?.trail && f.mf >= mv.trail[0] && f.mf <= mv.trail[1]) {
      const len = weaponLength(f.spec.weaponKind) + 10;
      const a = j.fArmAng + pose.weapon;
      const hand = toWorld(j.fha[0], j.fha[1]);
      const tip = toWorld(j.fha[0] + Math.sin(a) * len, j.fha[1] + Math.cos(a) * len);
      st.trail.push({ hx: hand[0], hy: hand[1], tx: tip[0], ty: tip[1], age: 0 });
    }
    st.lastTime = time;
  }

  let alpha = 1;
  if (f.state === 'attack' && f.move?.final) alpha = 1;
  else if (f.state === 'attack' && f.move?.teleport && f.intang > 0) alpha = 0.15;
  else if (f.intang > 0 && f.state !== 'ledge') alpha = 0.55 + 0.25 * Math.sin(time * 0.9);
  if (f.respawnInv > 0 && f.state !== 'respawn') alpha = Math.floor(time / 4) % 2 ? 0.45 : 0.9;

  ctx.save();
  ctx.globalAlpha = alpha;

  // 軌跡（武器の残像）
  if (st.trail.length > 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < st.trail.length; i++) {
      const a = st.trail[i - 1];
      const b = st.trail[i];
      ctx.beginPath();
      ctx.moveTo(a.hx, a.hy);
      ctx.lineTo(a.tx, a.ty);
      ctx.lineTo(b.tx, b.ty);
      ctx.lineTo(b.hx, b.hy);
      ctx.closePath();
      ctx.fillStyle = look.trail;
      ctx.globalAlpha = alpha * 0.45 * (1 - b.age / 6);
      ctx.fill();
    }
    ctx.restore();
  }

  // マフラー（体の後ろ）
  drawRibbon(ctx, st.scarf, 5.5 * s, look.scarf, 'rgba(0,0,0,0.35)');
  drawRibbon(ctx, st.band, 3 * s, look.scarf, 'rgba(0,0,0,0.3)');

  ctx.translate(wx, wy);
  ctx.scale(face * s, s * pose.squash);
  if (pose.spin) {
    ctx.translate(0, spinCy);
    ctx.rotate(pose.spin);
    ctx.translate(0, -spinCy);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const air = !f.grounded;
  if (look.wings) wings(ctx, j, time, air);
  if (look.spiderLegs) spiderLegs(ctx, j, time);
  tails(ctx, j, look, time);
  if (f.spec.weaponKind === 'box') {
    ctx.save();
    ctx.translate(j.sh[0] - 12, j.sh[1] + 4);
    ctx.rotate(j.torsoAng);
    ctx.fillStyle = '#9a6b3f';
    ctx.fillRect(-10, -6, 16, 26);
    ctx.strokeStyle = '#5a3a1f';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-10, -6, 16, 26);
    ctx.restore();
  }
  if (f.spec.weaponKind === 'falcon') {
    // 肩の鷹
    ctx.save();
    ctx.translate(j.sh[0] - 8, j.sh[1] - 10);
    ctx.fillStyle = '#7a5a3a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4, -2);
    ctx.lineTo(-16, -8 - Math.sin(time * 0.3) * 4);
    ctx.lineTo(-6, 2);
    ctx.fill();
    circle(ctx, 6, -4, 3.5);
    ctx.fill();
    ctx.fillStyle = '#ffcc33';
    ctx.beginPath();
    ctx.moveTo(9, -4);
    ctx.lineTo(13, -3);
    ctx.lineTo(9, -2);
    ctx.fill();
    ctx.restore();
  }

  const dark = look.body2;
  const out = 'rgba(12,10,20,0.85)';
  // 奥の腕・脚
  limb(ctx, [j.sh, j.bel, j.bha], 10, dark, out);
  limb(ctx, [j.hip, j.bkn, j.bfo], 12.5, dark, out);
  ctx.beginPath();
  ctx.ellipse(j.bfo[0] + 3, j.bfo[1], 7.5, 4.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a22';
  ctx.fill();
  // 胴
  limb(ctx, [j.hip, j.neck], 27, look.body, out);
  // 帯
  const bx = lerp(j.hip[0], j.neck[0], 0.12);
  const by = lerp(j.hip[1], j.neck[1], 0.12);
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(j.torsoAng);
  ctx.fillStyle = look.accent;
  ctx.fillRect(-14, -4, 28, 8);
  ctx.restore();
  // 襟
  ctx.strokeStyle = look.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(j.neck[0] - 5, j.neck[1] + 1);
  ctx.lineTo(lerp(j.neck[0], j.hip[0], 0.45) + 3, lerp(j.neck[1], j.hip[1], 0.45));
  ctx.stroke();
  // 手前の脚
  limb(ctx, [j.hip, j.fkn, j.ffo], 12.5, look.body, out);
  ctx.beginPath();
  ctx.ellipse(j.ffo[0] + 3, j.ffo[1], 7.5, 4.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a22';
  ctx.fill();
  // 頭
  const hurt = f.state === 'hurt' || f.state === 'tumble' || f.state === 'dizzy' || f.state === 'grabbed' || f.state === 'stun';
  const blink = Math.floor((time + f.port * 37) / 6) % 40 === 0;
  drawHead(ctx, j, look, hurt, time, blink);
  // 手前の腕 + 武器
  limb(ctx, [j.sh, j.fel, j.fha], 10, look.body, out);
  ctx.save();
  ctx.translate(j.fha[0], j.fha[1]);
  ctx.rotate(Math.PI / 2 - (j.fArmAng + pose.weapon));
  drawWeapon(ctx, f.spec.weaponKind, look, time);
  ctx.restore();
  circle(ctx, j.fha[0], j.fha[1], 5.4);
  ctx.fillStyle = look.skin;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = out;
  ctx.stroke();
  ctx.restore();

  // ─── オーバーレイ ───
  const cx = wx;
  const cy = wy - f.stats.height * 0.5;
  // 被弾の白フラッシュ / 溜め
  if (f.flash > 0 || (f.state === 'attack' && f.charge > 0)) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 70 * s);
    const col = f.charge > 0 ? 'rgba(255,230,120,0.5)' : 'rgba(255,255,255,0.55)';
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    circle(ctx, cx, cy, 70 * s);
    ctx.fill();
    ctx.restore();
  }
  // 奥義ゲージ満タン
  if (f.meter >= 100) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const a = 0.25 + 0.2 * Math.sin(time * 0.25);
    const g = ctx.createRadialGradient(cx, cy, 10 * s, cx, cy, 80 * s);
    g.addColorStop(0, `rgba(255,220,120,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    circle(ctx, cx, cy, 80 * s);
    ctx.fill();
    ctx.restore();
  }
  // 強化オーラ
  if (f.buffT > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time * 0.3);
    ctx.strokeStyle = look.aura;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 36 * s, 62 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // 毒
  if (f.poison) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#9b4dff';
    circle(ctx, cx, cy, 30 * s);
    ctx.fill();
    ctx.restore();
  }
  // 影縫い
  if (f.state === 'stun') {
    ctx.save();
    ctx.strokeStyle = 'rgba(120,60,200,0.9)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + time * 0.05;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 44 * s, cy + Math.sin(a) * 56 * s);
      ctx.lineTo(cx + Math.cos(a) * 14 * s, cy + Math.sin(a) * 18 * s);
      ctx.stroke();
    }
    ctx.restore();
  }
  // シールド
  if (f.state === 'shield' || f.state === 'shieldstun') {
    const r = (0.35 + 0.65 * (f.shield / 50)) * 62 * s;
    ctx.save();
    ctx.fillStyle = o.tagColor;
    ctx.globalAlpha = 0.28;
    circle(ctx, cx, cy + 6 * s, r);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.strokeStyle = o.tagColor;
    ctx.stroke();
    ctx.restore();
  }
  // ピヨり
  if (f.state === 'dizzy') {
    ctx.save();
    ctx.fillStyle = '#ffe36b';
    for (let i = 0; i < 3; i++) {
      const a = time * 0.12 + (i / 3) * Math.PI * 2;
      star(ctx, cx + Math.cos(a) * 24 * s, wy - f.stats.height - 10 + Math.sin(a) * 6, 6, 2.5, 5);
      ctx.fill();
    }
    ctx.restore();
  }
  // 復活台
  if (f.state === 'respawn') {
    ctx.save();
    const g = ctx.createLinearGradient(wx - 50, wy, wx + 50, wy);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,240,200,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(wx, wy + 4, 56, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // プレイヤー表示
  if (!o.tag) return;
  const ts = 1 / Math.max(0.35, o.zoom);
  const ty = wy - f.stats.height * (f.state === 'crouch' ? 0.7 : 1.05) - 16 * ts - (f.state === 'ledge' ? 0 : 0);
  ctx.save();
  ctx.translate(wx, ty);
  ctx.scale(ts, ts);
  ctx.fillStyle = o.tagColor;
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(7, 0);
  ctx.lineTo(0, 8);
  ctx.closePath();
  ctx.fill();
  ctx.font = 'bold 15px "M PLUS Rounded 1c", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(o.tag, 0, -4);
  ctx.fillStyle = o.tagColor;
  ctx.fillText(o.tag, 0, -4);
  ctx.restore();
}
