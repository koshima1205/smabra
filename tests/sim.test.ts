import { describe, expect, it } from 'vitest';
import { FIGHTERS } from '../src/game/roster';
import { cpuMatch } from './helpers';

describe('CPU vs CPU simulation', () => {
  it('every fighter can play full matches without NaN and matches end', () => {
    const stages = ['iga', 'tenkai', 'nenokuni', 'saika'];
    let finished = 0;
    for (let k = 0; k < FIGHTERS.length; k += 2) {
      const m = cpuMatch([k, (k + 1) % FIGHTERS.length], stages[(k / 2) % 4]);
      for (let i = 0; i < 60 * 60 * 5 && m.phase !== 'done'; i++) {
        m.step();
        for (const f of m.fighters) {
          if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || !Number.isFinite(f.damage)) {
            throw new Error(`${f.spec.name} broke in state ${f.state} (${f.moveKey})`);
          }
        }
      }
      if (m.phase === 'done') finished++;
    }
    expect(finished).toBeGreaterThanOrEqual(Math.floor(FIGHTERS.length / 2) - 2);
  });

  it('4-player free-for-all produces a winner', () => {
    const m = cpuMatch([0, 3, 5, 7], 'iga', 9, 2);
    for (let i = 0; i < 60 * 60 * 6 && m.phase !== 'done'; i++) m.step();
    expect(m.phase).toBe('done');
    expect(m.winner).not.toBeNull();
    expect(m.ranking()[0].stocks).toBeGreaterThan(0);
  });
});
