import { describe, expect, it } from 'vitest';
import { CNP } from '../src/data/cnp';
import data from '../src/data/roster.generated.json';
import { FIGHTERS, ROSTER_META } from '../src/game/roster';

describe('CNP roster with partner data from MCP', () => {
  it('has the 9 CNP characters, each linked to its partner ninja synced from NINJAMCP', () => {
    expect(ROSTER_META.mcp.server).toBe('NINJAMCP');
    expect(ROSTER_META.mcp.tools).toEqual(expect.arrayContaining(['get_character', 'search_lore', 'get_worldview']));
    expect(FIGHTERS.filter((f) => f.series === 'cnp').map((f) => f.id)).toEqual(['leelee', 'mitama', 'narukami', 'orochi', 'luna', 'yama', 'makami', 'towa', 'setsuna']);
    for (const f of FIGHTERS.filter((x) => x.series === 'cnp')) {
      const def = CNP.find((c) => c.id === f.id)!;
      expect(f.partner?.name, f.name).toBe(def.partner);
      expect(f.clan, f.name).toBe(f.partner?.clan);
    }
  });

  it('confirms partnerships that the MCP lore mentions', () => {
    const inMcp = FIGHTERS.filter((f) => f.partnerInMcp).map((f) => f.id);
    expect(inMcp).toEqual(expect.arrayContaining(['leelee', 'mitama', 'narukami', 'orochi', 'yama']));
  });

  it('commits only factual fields (no copied profile text)', () => {
    for (const p of data.partners) {
      expect(Object.keys(p).sort()).toEqual(['cnp', 'loreMention', 'ninja']);
      expect(Object.keys(p.ninja).sort()).toEqual(['birthday', 'clan', 'id', 'name', 'nameEn', 'ninjutsu', 'ninjutsuEn', 'weapon', 'weaponEn'].sort());
      for (const field of p.loreMention) expect(field).toMatch(/^[a-z_]+$/);
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
      expect(f.extra.final?.final, `${f.name} final`).toBe(true);
    }
  });

  it('adds the Luna Occulta spirits after the CNP 9, with their own home and element', () => {
    const kitan = FIGHTERS.filter((f) => f.series === 'kitan');
    expect(kitan.map((f) => f.id)).toEqual(['k_oto', 'k_xiaolan', 'k_orochi', 'k_emma']);
    expect(FIGHTERS.slice(9).map((f) => f.id)).toEqual(kitan.map((f) => f.id));
    for (const f of kitan) {
      expect(f.partner, f.name).toBeNull();
      expect(['甲賀', '伊賀', '風魔', '雑賀'], f.name).toContain(f.clan);
      expect(['火', '水', '木', '金', '土'], f.name).toContain(f.element);
      expect(f.ninjutsu, f.name).toBeTruthy();
    }
    // CNP と名前がかぶるオロチ・エマも ID は別
    expect(new Set(FIGHTERS.map((f) => f.id)).size).toBe(FIGHTERS.length);
  });

  it('gives each character its own kit and body', () => {
    // 得物と忍術の型が同じでも（拳の於兎とリーリーなど）、必殺ワザまで同じキャラはいない
    const kits = new Set(FIGHTERS.map((f) => `${f.weaponKind}/${f.jutsuKind}/${f.moves.nspec.name}`));
    expect(kits.size).toBe(FIGHTERS.length);
    const names = new Set(FIGHTERS.map((f) => f.moves.nspec.name));
    expect(names.size).toBe(FIGHTERS.length);
    const heavy = FIGHTERS.find((f) => f.id === 'leelee')!;
    const light = FIGHTERS.find((f) => f.id === 'mitama')!;
    expect(heavy.stats.weight).toBeGreaterThan(light.stats.weight + 30);
    expect(light.stats.airJumps).toBeGreaterThan(heavy.stats.airJumps);
  });
});
