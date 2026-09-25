import { describe, expect, it } from 'vitest';
import { Controller, emptyPad } from '../src/core/input';
import { FIGHTERS } from '../src/game/roster';
import { cpuMatch, skipIntro } from './helpers';

describe('Controller', () => {
  it('buffers a press for a few frames and consumes it once', () => {
    const pad = emptyPad();
    const c = new Controller(() => pad, { id: 't', label: 't', digital: true, flickSmash: false, tapJump: false });
    pad.attack = true;
    c.update();
    pad.attack = false;
    for (let i = 0; i < 3; i++) c.update();
    expect(c.buffered('attack')).toBe(true);
    c.consume('attack');
    expect(c.buffered('attack')).toBe(false);
    for (let i = 0; i < Controller.BUFFER + 1; i++) c.update();
    expect(c.buffered('attack')).toBe(false);
  });

  it('detects a stick flick but not a slow tilt', () => {
    const pad = emptyPad();
    const c = new Controller(() => pad, { id: 't', label: 't', digital: false, flickSmash: true, tapJump: true });
    c.update();
    pad.x = 1;
    c.update();
    expect(c.flickX(1)).toBe(true);
    const slow = new Controller(() => pad, { id: 't2', label: 't', digital: false, flickSmash: true, tapJump: true });
    for (const x of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
      pad.x = x;
      slow.update();
    }
    expect(slow.flickX(1)).toBe(false);
  });
});

describe('CPU recovery', () => {
  it('gets back to the stage from off-stage most of the time', () => {
    let saved = 0;
    const trials = 24;
    for (let k = 0; k < trials; k++) {
      const m = cpuMatch([k % FIGHTERS.length, (k + 21) % FIGHTERS.length], 'tenkai', 9);
      skipIntro(m);
      const f = m.fighters[0];
      const side = k % 2 === 0 ? 1 : -1;
      f.x = side > 0 ? m.stage.main.x2 + 190 : m.stage.main.x1 - 190;
      f.y = 60;
      f.grounded = false;
      f.ground = -1;
      f.setState('air');
      f.vy = 2;
      // 相手は遠くに置く
      m.fighters[1].x = -side * 300;
      let ok = false;
      for (let i = 0; i < 300; i++) {
        m.step();
        if (f.state === 'ledge' || (f.grounded && f.ground === 0)) {
          ok = true;
          break;
        }
        if (f.state === 'dead') break;
      }
      if (ok) saved++;
    }
    expect(saved / trials).toBeGreaterThan(0.75);
  });
});
