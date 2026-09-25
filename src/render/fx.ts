import { FX_COLOR, type Particle } from '../game/effects';
import type { Match } from '../game/match';
import type { Projectile } from '../game/projectile';

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
}

function glowOrb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, main: string, hot: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, hot);
  g.addColorStop(0.6, main);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  circle(ctx, x, y, r * 1.8);
  ctx.fill();
}

function starPath(ctx: CanvasRenderingContext2D, r1: number, r2: number, n: number): void {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? r1 : r2;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

const GLYPHS = ['忍', '火', '風', '雷', '水', '影', '闇', '光'];

export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, time: number): void {
  const c = FX_COLOR[p.def.fx];
  const r = p.r;
  const ang = Math.atan2(p.vy, p.vx || p.face);
  const fade = p.life < 8 && !p.def.explode ? p.life / 8 : 1;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(p.x, p.y);
  switch (p.def.draw) {
    case 'orb': {
      ctx.globalCompositeOperation = 'lighter';
      glowOrb(ctx, 0, 0, r, c.main, c.hot);
      if (p.def.fx === 'fire' || p.def.fx === 'dark') {
        for (let i = 0; i < 3; i++) {
          const a = time * 0.3 + i * 2.1;
          glowOrb(ctx, -Math.cos(ang) * r * 0.8 + Math.cos(a) * r * 0.3, -Math.sin(ang) * r * 0.8 + Math.sin(a) * r * 0.3, r * 0.5, c.main, c.hot);
        }
      }
      break;
    }
    case 'shuriken':
      ctx.rotate(p.rot);
      starPath(ctx, r, r * 0.35, 4);
      ctx.fillStyle = '#c3cad6';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = c.main;
      ctx.stroke();
      circle(ctx, 0, 0, r * 0.18);
      ctx.fillStyle = '#333';
      ctx.fill();
      break;
    case 'kunai':
    case 'arrow':
    case 'thorn': {
      ctx.rotate(ang);
      const l = p.def.draw === 'arrow' ? 34 : 22;
      ctx.strokeStyle = p.def.draw === 'arrow' ? '#7a5230' : '#3a3f4a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-l, 0);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.fillStyle = p.def.draw === 'thorn' ? c.main : '#d0d6de';
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-4, -5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      if (p.def.fx !== 'slash' && p.def.fx !== 'normal') {
        ctx.globalCompositeOperation = 'lighter';
        glowOrb(ctx, 2, 0, 6, c.main, c.hot);
      }
      break;
    }
    case 'blade': {
      ctx.rotate(ang);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = c.main;
      ctx.beginPath();
      ctx.moveTo(r * 0.6, -r * 1.4);
      ctx.quadraticCurveTo(r * 1.6, 0, r * 0.6, r * 1.4);
      ctx.quadraticCurveTo(r * 1.0, 0, r * 0.6, -r * 1.4);
      ctx.fill();
      ctx.fillStyle = c.hot;
      ctx.beginPath();
      ctx.moveTo(r * 0.7, -r);
      ctx.quadraticCurveTo(r * 1.35, 0, r * 0.7, r);
      ctx.quadraticCurveTo(r * 1.05, 0, r * 0.7, -r);
      ctx.fill();
      break;
    }
    case 'bolt': {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = c.hot;
      ctx.lineWidth = 4;
      ctx.beginPath();
      let x = 0;
      ctx.moveTo(0, 0);
      for (let y = -24; y > -520; y -= 26) {
        x = (Math.sin(y * 0.7 + time * 3) * 14) | 0;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = c.main;
      ctx.lineWidth = 12;
      ctx.globalAlpha = 0.35 * fade;
      ctx.stroke();
      glowOrb(ctx, 0, 0, r, c.main, c.hot);
      break;
    }
    case 'beam': {
      ctx.rotate(ang);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = c.main;
      ctx.lineWidth = r * 1.6;
      ctx.beginPath();
      ctx.moveTo(-70, 0);
      ctx.lineTo(r, 0);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = r * 0.6;
      ctx.stroke();
      break;
    }
    case 'petal':
      for (let i = 0; i < 10; i++) {
        const a = time * 0.15 + i * 0.63;
        const rr = r * (0.4 + ((i * 37) % 10) / 16);
        ctx.save();
        ctx.translate(Math.cos(a) * rr, Math.sin(a * 1.3) * rr * 0.8);
        ctx.rotate(a * 2);
        ctx.fillStyle = i % 2 ? '#ffc3dc' : '#ff8fbf';
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    case 'cloud':
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + time * 0.02;
        ctx.fillStyle = `rgba(150,80,220,${0.18 + (i % 3) * 0.05})`;
        circle(ctx, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.35, r * 0.7);
        ctx.fill();
      }
      break;
    case 'ring': {
      ctx.globalCompositeOperation = 'lighter';
      if (p.def.life <= 8) {
        // 爆発
        const k = 1 - p.life / p.def.life;
        ctx.globalAlpha = 1 - k;
        glowOrb(ctx, 0, 0, r * (0.6 + k * 0.5), c.main, c.hot);
      } else {
        ctx.rotate(p.rot);
        ctx.strokeStyle = c.main;
        ctx.lineWidth = Math.max(3, r * 0.2);
        circle(ctx, 0, 0, r * 0.8);
        ctx.stroke();
        ctx.strokeStyle = c.hot;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (p.def.follow) {
          ctx.globalAlpha = 0.12 * fade;
          ctx.fillStyle = c.main;
          circle(ctx, 0, 0, r);
          ctx.fill();
        }
      }
      break;
    }
    case 'creature':
    case 'spider': {
      const dir = Math.sign(p.vx) || p.face;
      ctx.scale(dir, 1);
      const bob = Math.sin(time * 0.6) * 3;
      ctx.globalCompositeOperation = 'lighter';
      glowOrb(ctx, 0, bob, r * 0.9, c.main, c.hot);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = p.def.draw === 'spider' ? '#2a1030' : c.main;
      ctx.beginPath();
      ctx.ellipse(0, bob, r * 0.9, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      circle(ctx, r * 0.8, bob - r * 0.3, r * 0.35);
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 3;
      for (let i = 0; i < (p.def.draw === 'spider' ? 4 : 2); i++) {
        const lx = -r * 0.5 + i * r * 0.4;
        ctx.beginPath();
        ctx.moveTo(lx, bob);
        ctx.lineTo(lx + Math.sin(time * 0.8 + i) * 6, r * 0.8);
        ctx.stroke();
      }
      break;
    }
    case 'clone': {
      const dir = Math.sign(p.vx) || p.face;
      ctx.scale(dir, 1);
      ctx.globalAlpha = 0.55 * fade;
      ctx.fillStyle = p.owner.spec.look.aura;
      ctx.beginPath();
      ctx.ellipse(0, -10, 14, 26, 0.9, 0, Math.PI * 2);
      ctx.fill();
      circle(ctx, 20, -28, 11);
      ctx.fill();
      ctx.strokeStyle = p.owner.spec.look.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(10, -30);
      ctx.lineTo(-30, -36 + Math.sin(time) * 4);
      ctx.stroke();
      break;
    }
    case 'glyph': {
      ctx.rotate(Math.sin(time * 0.1 + p.id) * 0.2);
      ctx.fillStyle = p.def.fx === 'ink' ? '#f4ecd8' : '#fff4d6';
      ctx.fillRect(-r * 0.7, -r, r * 1.4, r * 2);
      ctx.strokeStyle = c.main;
      ctx.lineWidth = 2;
      ctx.strokeRect(-r * 0.7, -r, r * 1.4, r * 2);
      ctx.fillStyle = p.def.fx === 'ink' ? '#1d1d2b' : '#c62f2f';
      ctx.font = `900 ${Math.round(r * 1.1)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(GLYPHS[p.id % GLYPHS.length], 0, 1);
      if (p.settled) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.3 + 0.2 * Math.sin(time * 0.2);
        glowOrb(ctx, 0, 0, r, c.main, c.hot);
      }
      break;
    }
    case 'bullet':
      ctx.rotate(ang);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,200,120,0.6)';
      ctx.lineWidth = r;
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(0, 0);
      ctx.stroke();
      glowOrb(ctx, 0, 0, r * 0.8, '#ffb347', '#fff6d8');
      break;
    case 'note':
      ctx.globalCompositeOperation = 'lighter';
      glowOrb(ctx, 0, 0, r * 0.8, c.main, c.hot);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#3a2a10';
      ctx.font = `bold ${Math.round(r * 1.6)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♪', 0, 0);
      break;
    case 'bomb':
      circle(ctx, 0, 0, r);
      ctx.fillStyle = '#22222a';
      ctx.fill();
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      glowOrb(ctx, r * 0.6, -r * 0.9, 4 + Math.sin(time) * 2, '#ff8a2a', '#fff2b0');
      break;
    case 'wave': {
      ctx.globalCompositeOperation = 'lighter';
      const dir = Math.sign(p.vx) || p.face;
      ctx.scale(dir, 1);
      ctx.fillStyle = c.main;
      ctx.globalAlpha = 0.75 * fade;
      ctx.beginPath();
      ctx.moveTo(-r * 1.2, r * 0.5);
      ctx.quadraticCurveTo(-r * 0.2, -r * 1.6, r, r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c.hot;
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, r * 0.5);
      ctx.quadraticCurveTo(r * 0.2, -r * 0.9, r * 0.8, r * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'hawk':
    case 'fox': {
      ctx.rotate(ang);
      ctx.globalCompositeOperation = 'lighter';
      glowOrb(ctx, -r * 0.4, 0, r * 0.8, c.main, c.hot);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = p.def.draw === 'fox' ? '#ffb45a' : p.def.fx === 'ink' ? '#2b2b44' : '#7a5a3a';
      if (p.def.draw === 'hawk') {
        const flap = Math.sin(time * 0.8) * r * 0.9;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(-r * 0.2, -flap);
        ctx.lineTo(-r * 0.6, 0);
        ctx.lineTo(-r * 0.2, flap * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.7, r * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.7, r * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(r * 0.6, -r * 0.2);
        ctx.lineTo(r * 0.9, -r * 0.7);
        ctx.lineTo(r * 0.95, -r * 0.1);
        ctx.fill();
      }
      break;
    }
    case 'coin':
      ctx.scale(Math.cos(p.rot), 1);
      circle(ctx, 0, 0, r);
      ctx.fillStyle = '#ffcf33';
      ctx.fill();
      ctx.strokeStyle = '#a57812';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#a57812';
      ctx.fillRect(-2, -4, 4, 8);
      break;
    case 'tornado': {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const yy = r * 0.9 - i * r * 0.36;
        const w = r * (0.35 + i * 0.16);
        ctx.strokeStyle = i % 2 ? c.main : c.hot;
        ctx.globalAlpha = 0.5 * fade;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(Math.sin(time * 0.4 + i) * 4, yy, w, w * 0.25, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'thread': {
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = 'rgba(240,240,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.owner.x + p.owner.facing * 18, p.owner.y - p.owner.stats.height * 0.6);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.translate(p.x, p.y);
      circle(ctx, 0, 0, r * 0.6);
      ctx.fillStyle = '#f4f4ff';
      ctx.fill();
      break;
    }
    case 'ink':
    case 'dango':
    case 'doll':
    case 'pillar':
    default:
      ctx.globalCompositeOperation = 'lighter';
      glowOrb(ctx, 0, 0, r, c.main, c.hot);
      break;
  }
  ctx.restore();
}

export function drawParticles(ctx: CanvasRenderingContext2D, m: Match, front: boolean): void {
  for (const p of m.fx.parts) {
    if (!!p.front !== front) continue;
    drawParticle(ctx, p);
  }
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  const k = p.life / p.max;
  ctx.save();
  switch (p.kind) {
    case 'spark':
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 1.6, p.y - p.vy * 1.6);
      ctx.stroke();
      break;
    case 'dust':
    case 'smoke':
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      circle(ctx, p.x, p.y, p.size * (1.4 - k * 0.4));
      ctx.fill();
      break;
    case 'ring': {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2 + 4 * k;
      circle(ctx, p.x, p.y, p.size + (p.max - p.life) * p.vr);
      ctx.stroke();
      break;
    }
    case 'flash': {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, k * 1.4);
      const r = p.size * (0.6 + (1 - k) * 0.6);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, p.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      circle(ctx, p.x, p.y, r);
      ctx.fill();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = p.color;
      starPath(ctx, r * 1.1, r * 0.12, 4);
      ctx.fill();
      break;
    }
    case 'line':
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3 * k + 1;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.moveTo(-p.size / 2, 0);
      ctx.lineTo(p.size / 2, 0);
      ctx.stroke();
      break;
    case 'petal':
      ctx.globalAlpha = k;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 1.6, p.size, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'star':
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      starPath(ctx, p.size, p.size * 0.4, 5);
      ctx.fill();
      break;
    case 'shard':
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.size, -p.size / 3, p.size * 2, p.size / 1.5);
      break;
    case 'blast': {
      // 撃墜の光の柱（画面中央へ向かって細くなる光）
      ctx.globalCompositeOperation = 'lighter';
      const len = 1100;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot + Math.PI);
      const w = p.size * 0.38 * (0.35 + k * 0.65);
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.12, p.color);
      g.addColorStop(0.55, 'rgba(255,255,255,0.08)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = Math.min(0.85, k * 1.2);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -w);
      ctx.quadraticCurveTo(len * 0.35, -w * 0.55, len, 0);
      ctx.quadraticCurveTo(len * 0.35, w * 0.55, 0, w);
      ctx.closePath();
      ctx.fill();
      // 根元の強い光
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 1.6);
      rg.addColorStop(0, 'rgba(255,255,255,0.9)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, w * 1.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'text': {
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `900 ${p.size}px "M PLUS Rounded 1c", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(p.text ?? '', p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text ?? '', p.x, p.y);
      break;
    }
  }
  ctx.restore();
}
