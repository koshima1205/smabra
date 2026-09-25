import { CLAN_COLOR } from '../game/roster';
import type { FighterSpec } from '../game/types';

/**
 * 公式イラスト（MCP が返す画像URL）の読み込み。
 * リポジトリには画像を同梱せず、実行時にブラウザが直接読み込む。失敗時は紋章で代用。
 */
const cache = new Map<string, { img: HTMLImageElement; ok: boolean; failed: boolean }>();

export function portrait(url: string | null): HTMLImageElement | null {
  if (!url || typeof Image === 'undefined') return null;
  let e = cache.get(url);
  if (!e) {
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    e = { img, ok: false, failed: false };
    const entry = e;
    img.onload = () => (entry.ok = true);
    img.onerror = () => (entry.failed = true);
    img.src = url;
    cache.set(url, e);
  }
  return e.ok ? e.img : null;
}

/** 画像（なければ紋章）を円形に描く */
export function drawPortrait(ctx: CanvasRenderingContext2D, spec: FighterSpec, x: number, y: number, r: number, ring = '#ffffff'): void {
  const img = portrait(spec.image);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.save();
  ctx.clip();
  if (img) {
    const s = Math.max((r * 2) / img.width, (r * 2) / img.height) * 1.15;
    ctx.drawImage(img, x - (img.width * s) / 2, y - (img.height * s) / 2 - r * 0.12, img.width * s, img.height * s);
  } else {
    emblem(ctx, spec, x, y, r);
  }
  ctx.restore();
  ctx.lineWidth = Math.max(2, r * 0.1);
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.restore();
}

export function emblem(ctx: CanvasRenderingContext2D, spec: FighterSpec, x: number, y: number, r: number): void {
  const col = CLAN_COLOR[spec.clan] ?? '#888';
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, spec.look.accent);
  g.addColorStop(1, col);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `900 ${Math.round(r * 1.05)}px "Yuji Syuku", "Noto Serif JP", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.name.slice(0, 1), x, y + r * 0.06);
  ctx.textBaseline = 'alphabetic';
}
