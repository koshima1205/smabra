import type { Fighter } from '../game/fighter';

export const PORT_COLORS = ['#ff4d4d', '#3d8bff', '#ffd23d', '#3ddc6a'];
export const CPU_COLOR = '#9aa0ab';

export interface OverlayOpts {
  time: number;
  zoom: number;
  tag: string;
  tagColor: string;
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, n: number): void {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

/**
 * ファイターの上に重ねる 2D の表示（溜めの光・シールド・ピヨり・プレイヤー表示など）。
 * キャラ本体は 3D（src/render3d）で描く。ctx はワールド座標変換済み。
 */
export function drawFighterOverlay(ctx: CanvasRenderingContext2D, f: Fighter, o: OverlayOpts): void {
  if (!f.alive) return;
  const look = f.spec.look;
  const time = o.time;
  const s = f.stats.height / 100;
  const wx = f.x;
  const wy = f.y;
  const cx = wx;
  const cy = wy - f.stats.height * 0.5;
  // 溜め（被弾の白フラッシュは 3D モデル側）
  if (f.state === 'attack' && f.charge > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 70 * s);
    const col = 'rgba(255,230,120,0.45)';
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
