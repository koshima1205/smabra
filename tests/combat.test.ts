import { describe, expect, it } from 'vitest';
import { knockback, predictKo } from '../src/game/combat';
import { Match } from '../src/game/match';
import { stageById } from '../src/game/stage';
import { manualFighter, skipIntro } from './helpers';

describe('knockback', () => {
  it('grows with damage and shrinks with weight', () => {
    const low = knockback(20, 12, 100, 30, 100);
    const high = knockback(120, 12, 100, 30, 100);
    const heavy = knockback(120, 12, 130, 30, 100);
    expect(high).toBeGreaterThan(low);
    expect(heavy).toBeLessThan(high);
  });

  it('predicts KOs for strong hits only', () => {
    const blast = stageById('iga').blast;
    expect(predictKo(500, -50, Math.cos(0.7), -Math.sin(0.7), 45, 0.62, 11, blast)).toBe(true);
    expect(predictKo(0, -50, Math.cos(0.7), -Math.sin(0.7), 8, 0.62, 11, blast)).toBe(false);
  });
});

describe('fighter basics', () => {
  function duel() {
    const a = manualFighter(0, 0);
    const b = manualFighter(1, 1);
    const m = new Match(stageById('tenkai'), { stocks: 3, time: 0, stageId: 'tenkai' }, [a.f, b.f], {});
    skipIntro(m);
    return { m, a, b };
  }

  it('jumps and lands back on the stage', () => {
    const { m, a } = duel();
    a.pad.jump = true;
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      m.step();
      peak = Math.min(peak, a.f.y);
    }
    a.pad.jump = false;
    for (let i = 0; i < 60; i++) m.step();
    expect(peak).toBeLessThan(-150);
    expect(a.f.grounded).toBe(true);
    expect(a.f.y).toBe(0);
  });

  it('a forward smash launches and damages the opponent', () => {
    const { m, a, b } = duel();
    a.f.x = -40;
    b.f.x = 40;
    a.f.facing = 1;
    a.pad.smash = true;
    a.pad.x = 1;
    m.step();
    a.pad.smash = false;
    a.pad.x = 0;
    for (let i = 0; i < 40; i++) m.step();
    expect(b.f.damage).toBeGreaterThan(10);
    expect(b.f.x).toBeGreaterThan(60);
  });

  it('shield blocks damage and wears down', () => {
    const { m, a, b } = duel();
    a.f.x = -40;
    b.f.x = 40;
    b.pad.shield = true;
    m.step();
    a.pad.smash = true;
    m.step();
    a.pad.smash = false;
    for (let i = 0; i < 30; i++) m.step();
    expect(b.f.damage).toBe(0);
    expect(b.f.shield).toBeLessThan(45);
  });

  it('knocked off-stage fighters lose a stock and respawn', () => {
    const { m, b } = duel();
    b.f.x = 2400;
    b.f.grounded = false;
    b.f.setState('air');
    m.step();
    expect(b.f.stocks).toBe(2);
    expect(b.f.state).toBe('dead');
    for (let i = 0; i < 120; i++) m.step();
    expect(b.f.state === 'respawn' || b.f.state === 'air').toBe(true);
  });

  it('grabs the ledge when falling beside the stage', () => {
    const { m, a } = duel();
    const main = m.stage.main;
    a.f.x = main.x2 + a.f.w / 2 + 2;
    a.f.y = main.y + a.f.stats.height * 0.9;
    a.f.grounded = false;
    a.f.ground = -1;
    a.f.facing = -1;
    a.f.setState('air');
    a.f.vy = 2;
    for (let i = 0; i < 3; i++) m.step();
    expect(a.f.state).toBe('ledge');
    expect(a.f.intang).toBeGreaterThan(0);
  });
});

describe('奥義（final smash）', () => {
  it('fires from a full meter with neutral special, freezes others and launches', () => {
    const a = manualFighter(0, 0);
    const b = manualFighter(5, 1);
    const m = new Match(stageById('tenkai'), { stocks: 3, time: 0, stageId: 'tenkai' }, [a.f, b.f], {});
    skipIntro(m);
    a.f.x = -80;
    b.f.x = 80;
    b.f.damage = 90;
    a.f.meter = 100;
    a.pad.special = true;
    m.step();
    a.pad.special = false;
    expect(a.f.moveKey).toBe('final');
    expect(m.cinematic).not.toBeNull();
    const bx = b.f.x;
    for (let i = 0; i < 20; i++) m.step();
    expect(b.f.x).toBe(bx);
    for (let i = 0; i < 60; i++) m.step();
    expect(b.f.damage).toBeGreaterThan(110);
    expect(a.f.meter).toBe(0);
  });
});
