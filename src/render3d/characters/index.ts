import type { BuildCharacter, CnpId } from '../types';
import { buildLeeLee } from './leelee';
import { buildLuna } from './luna';
import { buildMakami } from './makami';
import { buildMitama } from './mitama';
import { buildNarukami } from './narukami';
import { buildOrochi } from './orochi';
import { buildSetsuna } from './setsuna';
import { buildTowa } from './towa';
import { buildYama } from './yama';

/** CNP のモデル一覧（選択画面などの並び順） */
export const CNP_MODEL_IDS: CnpId[] = ['leelee', 'mitama', 'narukami', 'orochi', 'luna', 'yama', 'makami', 'towa', 'setsuna'];

/** CNP キャラの 3D モデルを作る（知らない ID は例外） */
export const buildCharacter: BuildCharacter = (id, opts = {}) => {
  switch (id) {
    case 'leelee':
      return buildLeeLee(opts);
    case 'mitama':
      return buildMitama(opts);
    case 'narukami':
      return buildNarukami(opts);
    case 'orochi':
      return buildOrochi(opts);
    case 'luna':
      return buildLuna(opts);
    case 'yama':
      return buildYama(opts);
    case 'makami':
      return buildMakami(opts);
    case 'towa':
      return buildTowa(opts);
    case 'setsuna':
      return buildSetsuna(opts);
    default:
      throw new Error(`unknown CNP id: ${String(id)}`);
  }
};
