import { describe, expect, it } from 'vitest';
import data from '../src/data/roster.generated.json';
import { FIGHTERS, ROSTER_META } from '../src/game/roster';

describe('roster generated from MCP', () => {
  it('contains every character synced from NINJAMCP', () => {
    expect(ROSTER_META.mcp.server).toBe('NINJAMCP');
    expect(ROSTER_META.mcp.tools).toContain('list_characters');
    expect(FIGHTERS.length).toBe(data.characters.length);
    expect(FIGHTERS.length).toBeGreaterThanOrEqual(42);
  });

  it('commits only factual fields (no copied profile text)', () => {
    for (const c of data.characters) {
      expect(Object.keys(c).sort()).toEqual(['birthday', 'clan', 'id', 'image', 'image3d', 'name', 'nameEn', 'ninjutsu', 'ninjutsuEn', 'weapon', 'weaponEn'].sort());
    }
  });

  it('gives every fighter a complete, valid moveset', () => {
    for (const f of FIGHTERS) {
      for (const [slot, mv] of Object.entries(f.moves)) {
        expect(mv.frames, `${f.name} ${slot}`).toBeGreaterThan(0);
        for (const h of mv.hitboxes) {
          expect(h.f1, `${f.name} ${slot}`).toBeGreaterThan(h.f0);
          expect(Number.isFinite(h.dmg + h.bkb + h.kbg + h.r)).toBe(true);
        }
        if (mv.counter) expect(f.extra[mv.counter.then], `${f.name} counter`).toBeDefined();
        if (mv.onLand) expect(f.extra[mv.onLand], `${f.name} onLand`).toBeDefined();
        for (const r of mv.random ?? []) expect(f.extra[r], `${f.name} random`).toBeDefined();
      }
      // 復帰ワザは崖をつかめる
      expect(f.moves.uspec.ledgeGrab, `${f.name} uspec`).toBeDefined();
    }
  });

  it('derives distinct kits from ninjutsu and weapons', () => {
    const kits = new Set(FIGHTERS.map((f) => `${f.weaponKind}/${f.jutsuKind}`));
    expect(kits.size).toBeGreaterThan(35);
  });
});
