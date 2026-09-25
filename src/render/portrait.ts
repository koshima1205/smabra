import type { FighterSpec } from '../game/types';
import { characterThumb } from '../render3d/snapshots';

/** 3D モデルの顔アイコン（作れなければ頭文字の紋章）を円形に描く */
export function drawPortrait(ctx: CanvasRenderingContext2D, spec: FighterSpec, x: number, y: number, r: number, ring = '#ffffff'): void {
  const img = characterThumb(spec.id, { size: 128, mode: 'face' });
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.save();
  ctx.clip();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff6e0');
  g.addColorStop(1, spec.look.color);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  if (img) ctx.drawImage(img, x - r * 1.1, y - r * 1.05, r * 2.2, r * 2.2);
  else emblem(ctx, spec, x, y, r);
  ctx.restore();
  ctx.lineWidth = Math.max(2, r * 0.1);
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.restore();
}

export function emblem(ctx: CanvasRenderingContext2D, spec: FighterSpec, x: number, y: number, r: number): void {
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `900 ${Math.round(r * 1.05)}px "Yuji Syuku", "Noto Serif JP", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.name.slice(0, 1), x, y + r * 0.06);
  ctx.textBaseline = 'alphabetic';
}
