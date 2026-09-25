import type { BuildStage } from '../types';
import { buildFallback } from './fallback';
import { buildIga } from './iga';
import { buildNenokuni } from './nenokuni';
import { buildSaika } from './saika';
import { buildTenkai } from './tenkai';

/**
 * ステージの 3D モデルを作る（ID で振り分け。未知の ID は簡素な床）。
 * 作ったものは呼び出し側がキャッシュして使い回す前提。
 */
export const buildStage: BuildStage = (stage, opts) => {
  const q = opts.quality;
  try {
    switch (stage.id) {
      case 'iga':
        return buildIga(stage, q);
      case 'tenkai':
        return buildTenkai(stage, q);
      case 'nenokuni':
        return buildNenokuni(stage, q);
      case 'saika':
        return buildSaika(stage, q);
    }
  } catch (e) {
    console.error(`stage ${stage.id}: 3D モデルの生成に失敗したので簡易ステージにします`, e);
  }
  return buildFallback(stage, q);
};
