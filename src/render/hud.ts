import { clamp } from '../core/math';
import type { Fighter } from '../game/fighter';
import type { Match } from '../game/match';
import { drawPortrait } from './images';

export interface HudPlayer {
  f: Fighter;
  color: string;
  label: string;
}

const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", system-ui, sans-serif';

/** ダメージ％の色（白 → 黄 → 橙 → 赤 → 暗赤） */
export function damageColor(d: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [255, 255, 255]],
    [40, [255, 236, 140]],
    [80, [255, 170, 60]],
    [120, [255, 70, 50]],
    [180, [170, 20, 40]],
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (d >= stops[i][0] && d <= stops[i + 1][0]) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  if (d > stops[stops.length - 1][0]) a = b;
  const t = b[0] === a[0] ? 0 : clamp((d - a[0]) / (b[0] - a[0]), 0, 1);
  const c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function drawHud(ctx: CanvasRenderingContext2D, m: Match, players: HudPlayer[], w: number, h: number, time: number): void {
  const n = players.length;
  const pw = Math.min(250, (w - 40) / n - 12);
  const ph = 92;
  const total = n * pw + (n - 1) * 14;
  const x0 = (w - total) / 2;
  const y0 = h - ph - 14;
  const sc = pw / 250;

  players.forEach((p, i) => {
    const f = p.f;
    const x = x0 + i * (pw + 14);
    ctx.save();
    ctx.translate(x, y0);
    ctx.scale(sc, sc);
    const out = f.stocks <= 0;
    ctx.globalAlpha = out ? 0.45 : 1;
    // 台座
    const g = ctx.createLinearGradient(0, 0, 250, 0);
    g.addColorStop(0, p.color);
    g.addColorStop(0.35, 'rgba(20,20,34,0.82)');
    g.addColorStop(1, 'rgba(20,20,34,0.55)');
    ctx.fillStyle = g;
    roundRect(ctx, 0, 14, 250, 74, 16);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.stroke();
    // 顔
    drawPortrait(ctx, f.spec, 46, 48, 38, p.color);
    // 名前
    ctx.font = `800 17px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(f.spec.name, 92, 34);
    ctx.font = `700 11px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`${p.label}  ${f.spec.nameEn}`, 92, 49);
    // ダメージ
    if (!out) {
      const shake = f.hudShake > 0 ? (Math.random() - 0.5) * f.hudShake * 0.8 : 0;
      const dmg = Math.floor(f.damage);
      ctx.save();
      ctx.translate(236 + shake, 80 + shake * 0.5);
      ctx.textAlign = 'right';
      ctx.font = `900 italic 40px ${FONT}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const txt = `${dmg}`;
      ctx.strokeText(txt, -22, 0);
      ctx.fillStyle = damageColor(f.damage);
      ctx.fillText(txt, -22, 0);
      ctx.font = `900 italic 22px ${FONT}`;
      ctx.strokeText('%', 0, 0);
      ctx.fillText('%', 0, 0);
      ctx.restore();
    } else {
      ctx.font = `900 22px ${FONT}`;
      ctx.fillStyle = '#ccc';
      ctx.textAlign = 'right';
      ctx.fillText('脱落', 236, 80);
    }
    // 奥義ゲージ
    if (!out) {
      const full = f.meter >= 100;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      roundRect(ctx, 92, 74, 76, 6, 3);
      ctx.fill();
      ctx.fillStyle = full ? (Math.floor(time / 6) % 2 ? '#fff3c4' : '#f2c14e') : '#c9a24a';
      roundRect(ctx, 92, 74, Math.max(4, 76 * Math.min(1, f.meter / 100)), 6, 3);
      ctx.fill();
      if (full) {
        ctx.font = `900 11px ${FONT}`;
        ctx.fillStyle = '#ffe28a';
        ctx.fillText('奥義 OK', 172, 80);
      }
    }
    // ストック
    for (let s = 0; s < Math.min(f.stocks, 8); s++) {
      ctx.beginPath();
      ctx.arc(98 + s * 15, 66, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = f.spec.look.scarf;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    ctx.restore();
  });

  // 制限時間
  if (m.timeLeft >= 0) {
    const secs = Math.ceil(m.timeLeft / 60);
    const txt = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    ctx.save();
    ctx.font = `900 34px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(txt, w / 2, 46);
    ctx.fillStyle = secs <= 10 ? '#ff6b6b' : '#fff';
    ctx.fillText(txt, w / 2, 46);
    ctx.restore();
  }

  offscreen(ctx, m, players, w, h);

  // 画面フラッシュ
  if (m.fx.screenFlash > 0) {
    ctx.save();
    ctx.globalAlpha = (m.fx.screenFlash / 8) * 0.35;
    ctx.fillStyle = m.fx.screenFlashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // カウントダウン
  if (m.phase === 'intro' || (m.phase === 'play' && m.frame < 150 + 50)) {
    let label = '';
    let k = 0;
    if (m.phase === 'intro') {
      const n2 = Math.ceil(m.introT / 50);
      label = n2 > 3 ? '' : String(n2);
      k = 1 - ((m.introT - 1) % 50) / 50;
    } else {
      label = '開戦！';
      k = clamp((m.frame - 150) / 50, 0, 1);
    }
    if (label) {
      ctx.save();
      ctx.translate(w / 2, h * 0.42);
      const s = label === '開戦！' ? 1 + k * 0.3 : 1.6 - k * 0.6;
      ctx.scale(s, s);
      ctx.globalAlpha = label === '開戦！' ? 1 - k : Math.min(1, (1 - k) * 3);
      ctx.font = `900 ${label === '開戦！' ? 110 : 150}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 14;
      ctx.strokeStyle = 'rgba(20,10,30,0.9)';
      ctx.strokeText(label, 0, 0);
      const g = ctx.createLinearGradient(0, -60, 0, 60);
      g.addColorStop(0, '#fff7d6');
      g.addColorStop(1, label === '開戦！' ? '#ff5a3c' : '#ffc233');
      ctx.fillStyle = g;
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }

  if (m.cinematic) {
    const c = m.cinematic;
    const k = 1 - c.t / c.max;
    ctx.save();
    ctx.translate(w / 2, h * 0.22);
    ctx.globalAlpha = Math.min(1, k * 4);
    ctx.font = `900 ${Math.round(Math.min(72, w / 12))}px "Yuji Syuku", "Noto Serif JP", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(c.name, 0, 0);
    const g = ctx.createLinearGradient(0, -40, 0, 40);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#f2c14e');
    ctx.fillStyle = g;
    ctx.fillText(c.name, 0, 0);
    ctx.font = `800 18px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(c.f.spec.name, 0, 48);
    ctx.restore();
  }

  if (m.banner) {
    const b = m.banner;
    const k = clamp(1 - b.t / 150, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, b.t / 20);
    ctx.fillStyle = 'rgba(10,6,20,0.55)';
    ctx.fillRect(0, h * 0.42 - 80, w, 160);
    ctx.translate(w / 2, h * 0.42);
    const s = 1.25 - Math.min(0.25, k * 2);
    ctx.scale(s, s);
    ctx.font = `900 italic 120px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText(b.text, 0, 0);
    const g = ctx.createLinearGradient(0, -60, 0, 60);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, b.color);
    ctx.fillStyle = g;
    ctx.fillText(b.text, 0, 0);
    ctx.restore();
  }
  void time;
}

/** 画面外にいるファイターの位置を示す */
function offscreen(ctx: CanvasRenderingContext2D, m: Match, players: HudPlayer[], w: number, h: number): void {
  for (const p of players) {
    const f = p.f;
    if (!f.alive || f.state === 'respawn') continue;
    const s = m.camera.worldToScreen(f.x, f.y - f.stats.height / 2);
    const margin = 40;
    if (s.x > -10 && s.x < w + 10 && s.y > -10 && s.y < h - 100) continue;
    const cx = clamp(s.x, margin, w - margin);
    const cy = clamp(s.y, margin, h - 150);
    const ang = Math.atan2(s.y - cy, s.x - cx);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * 38, Math.sin(ang) * 38);
    ctx.lineTo(Math.cos(ang + 0.5) * 26, Math.sin(ang + 0.5) * 26);
    ctx.lineTo(Math.cos(ang - 0.5) * 26, Math.sin(ang - 0.5) * 26);
    ctx.fill();
    ctx.restore();
    drawPortrait(ctx, f.spec, cx, cy, 24, p.color);
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
