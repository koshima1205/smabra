import { Controller, emptyPad, type PadState } from '../src/core/input';
import { CpuBrain } from '../src/game/ai';
import { Fighter } from '../src/game/fighter';
import { Match } from '../src/game/match';
import { FIGHTERS } from '../src/game/roster';
import { stageById } from '../src/game/stage';

export const CPU_INFO = { id: 'cpu', label: 'CPU', digital: false, flickSmash: false, tapJump: false };

/** 手動入力のファイター（pad を書き換えて操作する） */
export function manualFighter(index: number, port: number, digital = true): { f: Fighter; pad: PadState } {
  const pad = emptyPad();
  const ctrl = new Controller(() => pad, { id: `t${port}`, label: 'test', digital, flickSmash: !digital, tapJump: false });
  return { f: new Fighter(FIGHTERS[index], port, port, ctrl, false), pad };
}

export function cpuMatch(ids: number[], stageId = 'iga', level = 9, stocks = 3): Match {
  const fighters: Fighter[] = [];
  const brains: CpuBrain[] = [];
  ids.forEach((idx, i) => {
    const b = new CpuBrain(level, i + 11);
    fighters.push(new Fighter(FIGHTERS[idx], i, i, new Controller(() => b.pad, CPU_INFO), true));
    brains.push(b);
  });
  const m = new Match(stageById(stageId), { stocks, time: 0, stageId }, fighters, {});
  fighters.forEach((f, i) => m.brains.set(f, brains[i]));
  return m;
}

export function skipIntro(m: Match): void {
  while (m.phase === 'intro') m.step();
}
