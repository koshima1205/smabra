import type { CharacterModel, CharacterOpts } from '../types';
import { buildCat } from './cat';
import { GREEN, PURPLE, RED } from './parts';

/** セツナ（白猫・刹那）: 空色の目で元気な表情、ピンクの耳と鼻、小さな爪。空色のリボンに金の鈴 */
export function buildSetsuna(opts: CharacterOpts = {}): CharacterModel {
  return buildCat(opts, {
    fur: '#fbfaff',
    earIn: '#ffb3c8',
    eye: { top: '#1c5a9c', bot: '#8fe2ff', pupil: [1.7, 3.2, 0.25, '#0f1d38'], cut: [0.86, 0.24], lid: 0.95, lash: 1.3, hl: 1.2 },
    nose: '#ff8fb1',
    blush: '#ffb0c6',
    whisker: '#8a83a0',
    ribbon: '#3aa6d9',
    alts: [RED, GREEN, PURPLE],
    claws: '#a8a1ba',
    curl: 0.6,
  });
}
