import type { FighterSpec } from '../game/types';
import { characterThumb, type ThumbMode } from '../render3d/snapshots';
import { h } from './dom';

/** 3D モデルから描いたキャラのアイコン（描けない環境では頭文字） */
export function portraitEl(spec: FighterSpec, size = 160, mode: ThumbMode = 'bust'): HTMLElement {
  const wrap = h('div', { class: 'portrait', style: `position:relative;width:100%;height:100%;--c:${spec.look.color}` });
  const src = characterThumb(spec.id, { size: Math.min(320, Math.round(size * 1.5)), mode });
  if (src) {
    const cv = h('canvas', { width: src.width, height: src.height, 'aria-label': spec.name, role: 'img' });
    cv.getContext('2d')?.drawImage(src, 0, 0);
    wrap.append(cv);
  } else {
    wrap.append(h('div', { class: 'portrait-fallback' }, spec.name.slice(0, 1)));
  }
  return wrap;
}
