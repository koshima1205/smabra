import type { CharacterModel, CharacterOpts } from '../types';
import { buildCat } from './cat';
import { BLUE, GREEN, PURPLE } from './parts';

/**
 * トワ（黒猫・永遠）: 濃い灰色の毛にハチワレの白い口元と白い手足、大きな水色の目、ピンクの耳の内側。
 * 先の巻いた長い尻尾、手元に青白い鬼火（ゲーム用）。赤いリボンに金の鈴
 */
export function buildTowa(opts: CharacterOpts = {}): CharacterModel {
  return buildCat(opts, {
    fur: '#5c5c68',
    earIn: '#e8a3b4',
    eye: { top: '#3aa2d6', bot: '#a4e4fb', pupil: [1.9, 2.7, 0.05, '#1a1c80'], lid: 1.0, hl: 1.1, shut: '#e6e0f4' },
    nose: '#2a2436',
    blush: '#e87f94',
    whisker: '#d9d4ea',
    mask: {
      col: '#f7f6fb',
      pts: [
        [-8.5, -8],
        [8.5, -8],
        [7.5, -2.5],
        [3, 1.6],
        [0, 4.2],
        [-3, 1.6],
        [-7.5, -2.5],
      ],
    },
    paws: '#f7f6fb',
    brows: '#1d1c6e',
    ribbon: '#c23a4a',
    alts: [BLUE, GREEN, PURPLE],
    flame: '#5fc4ff',
    curl: 1.35,
  });
}
