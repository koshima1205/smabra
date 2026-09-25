import type { CharacterModel, CharacterOpts } from '../types';
import { buildCat } from './cat';
import { BLUE, GREEN, PURPLE } from './parts';

/** トワ（黒猫・永遠）: 金の目で落ち着いた表情、先の巻いた長い尻尾、手元に青白い鬼火。赤いリボンに金の鈴 */
export function buildTowa(opts: CharacterOpts = {}): CharacterModel {
  return buildCat(opts, {
    fur: '#3b3654',
    earIn: '#7b5570',
    eye: { top: '#8c5200', bot: '#ffd84a', pupil: [1.05, 3.7, 0.15, '#150d1d'], cut: [0.42, -0.08], lid: 1.2, hl: 0.95, shut: '#e6e0f4' },
    nose: '#d88aa8',
    blush: '#c0638a',
    whisker: '#d9d4ea',
    ribbon: '#c23a4a',
    alts: [BLUE, GREEN, PURPLE],
    flame: '#5fc4ff',
    curl: 1.35,
  });
}
