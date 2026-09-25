import type { FighterSpec } from '../game/types';
import { emblem } from '../render/images';
import { h } from './dom';

/** 公式イラスト（読めなければ紋章）を表示する要素 */
export function portraitEl(spec: FighterSpec, size = 160): HTMLElement {
  const wrap = h('div', { style: 'position:relative;width:100%;height:100%' });
  const cv = h('canvas', { width: size, height: size, 'aria-hidden': 'true' });
  const ctx = cv.getContext('2d');
  if (ctx) emblem(ctx, spec, size / 2, size / 2, size / 2);
  wrap.append(cv);
  if (spec.image) {
    const img = h('img', { alt: spec.name, loading: 'lazy', referrerpolicy: 'no-referrer', draggable: 'false' });
    img.addEventListener('error', () => img.remove());
    img.src = spec.image;
    wrap.append(img);
  }
  return wrap;
}
