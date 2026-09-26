import type { CharacterModel, CharacterOpts } from '../types';
import { buildCat } from './cat';
import { GREEN, PURPLE, RED } from './parts';

/**
 * セツナ（白猫・刹那）: ふわふわの長い毛（頬の毛）で、口まわり・手足の先・尻尾の先がくすんだ灰色、
 * 大きな黄色い目。空色のリボンに金の鈴
 */
export function buildSetsuna(opts: CharacterOpts = {}): CharacterModel {
  return buildCat(opts, {
    fur: '#ececef',
    earIn: '#f9f9fb',
    eye: { top: '#e0b000', bot: '#ffe63a', pupil: [1.9, 2.7, 0.05, '#18181e'], lid: 1.0, hl: 1.1 },
    nose: '#2a2a30',
    blush: '#ee7a8a',
    whisker: '#55556a',
    mask: { col: '#9d9d98', w: 7.5, h: 5.2 },
    paws: '#b9b9b6',
    tailTip: '#a3a39e',
    brows: '#1d1c6e',
    tufts: true,
    ribbon: '#3aa6d9',
    alts: [RED, GREEN, PURPLE],
    claws: '#a8a1ba',
    curl: 0.6,
  });
}
