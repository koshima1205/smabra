import type { Effect, MoveDef, WeaponKind } from '../types';
import { hb, hit, mv, powerMove, proj, reachMove, shiftMove, withFx } from './dsl';

export type NormalSlot =
  | 'jab1'
  | 'jab2'
  | 'jab3'
  | 'ftilt'
  | 'utilt'
  | 'dtilt'
  | 'dashAtk'
  | 'fsmash'
  | 'usmash'
  | 'dsmash'
  | 'nair'
  | 'fair'
  | 'bair'
  | 'uair'
  | 'dair'
  | 'grab'
  | 'pummel'
  | 'fthrow'
  | 'bthrow'
  | 'uthrow'
  | 'dthrow'
  | 'getupAtk';

/** 素手（体術）を基準にした通常ワザ。座標は身長100の体格基準 */
function base(): Record<NormalSlot, MoveDef> {
  return {
    jab1: mv('弱攻撃1', 'jab1', 16, [hb(30, -60, 15, 3, 5, 2.5, 361, 12, 30)]),
    jab2: mv('弱攻撃2', 'jab2', 18, [hb(34, -60, 15, 3, 5, 2.5, 361, 14, 30)]),
    jab3: mv('弱攻撃3', 'jab3', 30, [hb(42, -52, 19, 4, 7, 5, 40, 42, 90)], { trail: [3, 8] }),
    ftilt: mv('横強攻撃', 'ftilt', 28, [hb(46, -50, 17, 6, 9, 9, 36, 30, 95), hb(22, -52, 14, 6, 9, 8, 36, 28, 90)], { trail: [5, 10] }),
    utilt: mv('上強攻撃', 'utilt', 28, [hb(22, -92, 19, 5, 8, 7, 88, 34, 108), hb(-8, -104, 18, 7, 10, 7, 95, 34, 104)], {
      trail: [4, 11],
    }),
    dtilt: mv('下強攻撃', 'dtilt', 22, [hb(42, -12, 16, 5, 7, 6, 76, 40, 62)], { trail: [4, 8] }),
    dashAtk: mv('ダッシュ攻撃', 'dash', 36, [hb(30, -50, 22, 6, 12, 10, 45, 42, 84), hb(30, -50, 18, 12, 18, 6, 50, 32, 70)], {
      impulses: [{ f: 2, vx: 9.5, set: true }],
      trail: [5, 16],
    }),
    fsmash: mv('横スマッシュ攻撃', 'fsmash', 48, [hb(52, -54, 23, 14, 17, 16, 40, 32, 102), hb(26, -56, 17, 14, 17, 14, 40, 30, 98)], {
      charge: { at: 9, max: 60 },
      impulses: [{ f: 12, vx: 3.5, set: true }],
      trail: [12, 19],
    }),
    usmash: mv('上スマッシュ攻撃', 'usmash', 46, [hb(0, -112, 26, 12, 16, 15, 88, 34, 104), hb(8, -72, 20, 11, 13, 5, 90, 60, 20, { group: 1 })], {
      charge: { at: 7, max: 60 },
      trail: [10, 17],
    }),
    dsmash: mv(
      '下スマッシュ攻撃',
      'dsmash',
      46,
      [hb(40, -14, 20, 11, 13, 14, 30, 30, 98), hb(-40, -14, 20, 16, 18, 13, 150, 30, 96)],
      { charge: { at: 6, max: 60 }, trail: [10, 19] },
    ),
    nair: mv('ニュートラル空中攻撃', 'nair', 36, [hb(0, -52, 34, 5, 10, 9, 361, 22, 95, { dir: 'away' }), hb(0, -52, 28, 10, 20, 6, 361, 16, 80, { dir: 'away' })], {
      landLag: 7,
      autoCancel: 26,
    }),
    fair: mv('前空中攻撃', 'fair', 40, [hb(42, -56, 22, 10, 13, 12, 42, 30, 100), hb(20, -60, 16, 10, 13, 10, 42, 28, 96)], {
      landLag: 12,
      autoCancel: 32,
      trail: [8, 15],
    }),
    bair: mv('後空中攻撃', 'bair', 34, [hb(-44, -50, 22, 7, 10, 12, 140, 32, 98)], { landLag: 9, autoCancel: 24, trail: [6, 11] }),
    uair: mv('上空中攻撃', 'uair', 32, [hb(4, -112, 26, 6, 10, 9, 85, 30, 100)], { landLag: 8, autoCancel: 22, trail: [5, 11] }),
    dair: mv('下空中攻撃', 'dair', 42, [hb(0, -4, 23, 12, 15, 14, 270, 25, 90), hb(0, -8, 18, 16, 21, 8, 361, 20, 70)], {
      landLag: 16,
      autoCancel: 34,
      trail: [11, 17],
    }),
    grab: mv('つかみ', 'grab', 30, [hb(38, -56, 20, 6, 9, 0, 0, 0, 0, { grab: true })]),
    pummel: mv('つかみ打撃', 'pummel', 16, [hb(30, -56, 12, 5, 6, 1.5, 0, 0, 0)]),
    fthrow: mv('前投げ', 'throwF', 30, [hb(30, -50, 12, 10, 11, 7, 40, 62, 62)]),
    bthrow: mv('後投げ', 'throwB', 34, [hb(-30, -50, 12, 14, 15, 9, 140, 62, 70)]),
    uthrow: mv('上投げ', 'throwU', 34, [hb(0, -90, 12, 12, 13, 6, 90, 70, 62)]),
    dthrow: mv('下投げ', 'throwD', 32, [hb(20, -10, 12, 12, 13, 5, 76, 52, 40)]),
    getupAtk: mv('起き上がり攻撃', 'getupAtk', 40, [hb(40, -30, 22, 18, 21, 7, 361, 50, 30), hb(-40, -30, 22, 21, 24, 7, 361, 50, 30, { dir: 'away', group: 1 })]),
  };
}

interface Style {
  reach: number;
  size: number;
  power: number;
  kbg: number;
  /** 発生の早さ（負で速い） */
  speed: number;
  fx: Effect;
}

const STYLE: Record<WeaponKind, Style> = {
  shuriken: { reach: 8, size: 1, power: 0.95, kbg: 0, speed: -1, fx: 'slash' },
  katana: { reach: 22, size: 1.05, power: 1.08, kbg: 2, speed: 1, fx: 'slash' },
  lasersword: { reach: 26, size: 1.05, power: 1.05, kbg: 2, speed: 1, fx: 'light' },
  bigblade: { reach: 24, size: 1.2, power: 1.2, kbg: 6, speed: 3, fx: 'slash' },
  dagger: { reach: 6, size: 0.95, power: 0.9, kbg: 0, speed: -2, fx: 'slash' },
  claw: { reach: 10, size: 1, power: 0.95, kbg: 0, speed: -1, fx: 'slash' },
  fist: { reach: 0, size: 1, power: 1, kbg: 0, speed: -1, fx: 'normal' },
  scroll: { reach: 16, size: 1.1, power: 0.95, kbg: 0, speed: 0, fx: 'normal' },
  bow: { reach: 6, size: 1, power: 0.95, kbg: 0, speed: 0, fx: 'normal' },
  dango: { reach: 24, size: 0.95, power: 1, kbg: 0, speed: 1, fx: 'normal' },
  bomb: { reach: 4, size: 1.1, power: 1.05, kbg: 3, speed: 1, fx: 'fire' },
  club: { reach: 18, size: 1.2, power: 1.18, kbg: 6, speed: 3, fx: 'normal' },
  falcon: { reach: 10, size: 1, power: 0.95, kbg: 0, speed: -1, fx: 'wind' },
  talisman: { reach: 14, size: 1.05, power: 0.96, kbg: 0, speed: 0, fx: 'light' },
  beads: { reach: 22, size: 1, power: 1, kbg: 2, speed: 1, fx: 'dark' },
  halo: { reach: 16, size: 1.15, power: 1, kbg: 0, speed: 0, fx: 'light' },
  shamisen: { reach: 12, size: 1.05, power: 1, kbg: 0, speed: 0, fx: 'sound' },
  chain: { reach: 36, size: 0.95, power: 1.02, kbg: 2, speed: 3, fx: 'slash' },
  brush: { reach: 14, size: 1.05, power: 0.97, kbg: 0, speed: 0, fx: 'ink' },
  wings: { reach: 8, size: 1.1, power: 0.95, kbg: 0, speed: -1, fx: 'wind' },
  mallet: { reach: 16, size: 1.18, power: 1.16, kbg: 6, speed: 3, fx: 'normal' },
  onibi: { reach: 12, size: 1.1, power: 0.98, kbg: 0, speed: 0, fx: 'fire' },
  gun: { reach: 0, size: 1, power: 1, kbg: 0, speed: 0, fx: 'normal' },
  box: { reach: 10, size: 1.2, power: 1.14, kbg: 5, speed: 3, fx: 'normal' },
  spirit: { reach: 10, size: 1.05, power: 1, kbg: 0, speed: 0, fx: 'fire' },
  abyss: { reach: 20, size: 1.1, power: 1.05, kbg: 3, speed: 1, fx: 'dark' },
};

/** 武器で振る（リーチ・属性が乗る）ワザ */
const WEAPON_SLOTS: NormalSlot[] = ['jab3', 'ftilt', 'utilt', 'dashAtk', 'fsmash', 'usmash', 'dsmash', 'fair', 'bair', 'uair', 'dair', 'nair'];

export function styleOf(kind: WeaponKind): Style {
  return STYLE[kind];
}

export function buildNormals(kind: WeaponKind, weaponName: string | null): Record<NormalSlot, MoveDef> {
  const m = base();
  const st = STYLE[kind];
  const armed = kind !== 'fist' && kind !== 'gun' && kind !== 'bow';
  for (const slot of WEAPON_SLOTS) {
    const x = m[slot];
    if (armed) {
      reachMove(x, st.reach * (slot === 'nair' ? 0.3 : slot.endsWith('smash') ? 1 : 0.8), st.size);
      withFx(x, st.fx);
    }
    powerMove(x, st.power, st.kbg);
    const d = slot.endsWith('smash') ? st.speed : Math.round(st.speed * 0.6);
    shiftMove(x, d);
  }
  for (const slot of ['jab1', 'jab2', 'dtilt'] as NormalSlot[]) {
    powerMove(m[slot], st.power);
    if (armed && st.reach > 12) reachMove(m[slot], st.reach * 0.4);
  }
  const w = weaponName ?? '体術';
  m.fsmash.name = `${w}・${FSMASH_NAME[kind]}`;
  m.usmash.name = `${w}・${USMASH_NAME[kind]}`;
  m.dsmash.name = `${w}・旋風払い`;

  // ───── 武器ごとの個性 ─────
  switch (kind) {
    case 'shuriken':
      m.fsmash.spawns = [{ f: 14, proj: proj('shuriken', 'slash', { vx: 13, r: 20, life: 20, spin: 0.6, pierce: true, rehit: 6, hit: hit(4, 40, 22, 60) }) }];
      m.nair = mv('手裏剣・円舞', 'nair', 34, [hb(0, -52, 36, 5, 22, 2, 0, 20, 0, { rehit: 5, link: true, fx: 'slash' }), hb(0, -52, 38, 22, 25, 5, 361, 40, 100, { group: 1, fx: 'slash' })], { landLag: 8, autoCancel: 28 });
      break;
    case 'dagger':
    case 'claw':
      m.jab1 = mv('連撃', 'jab1', 26, [hb(34, -58, 17, 2, 22, 1.2, 0, 6, 0, { rehit: 3, link: true, fx: 'slash' })], { trail: [2, 22] });
      m.jab2 = m.jab1;
      m.jab3 = mv('連撃フィニッシュ', 'jab3', 26, [hb(40, -56, 20, 3, 6, 4, 40, 45, 110, { fx: 'slash' })], { trail: [2, 7] });
      m.fair = mv('乱れ裂き', 'fair', 38, [hb(38, -54, 22, 6, 18, 2, 0, 10, 0, { rehit: 4, link: true, fx: 'slash' }), hb(44, -54, 24, 18, 21, 4, 40, 40, 110, { group: 1, fx: 'slash' })], { landLag: 11, autoCancel: 30, trail: [5, 21] });
      break;
    case 'gun':
      m.fsmash = mv('銃撃・零距離', 'fsmash', 50, [hb(50, -60, 22, 15, 17, 17, 38, 34, 100, { fx: 'fire' })], {
        charge: { at: 9, max: 60 },
        spawns: [{ f: 15, proj: proj('bullet', 'fire', { x: 56, y: -60, vx: 26, r: 8, life: 16, hit: hit(6, 30, 24, 50) }) }],
        sfx: [{ f: 15, name: 'gun' }],
      });
      m.ftilt = mv('銃床打ち', 'ftilt', 28, [hb(44, -54, 18, 6, 9, 9, 36, 32, 94)]);
      break;
    case 'bow':
      m.fsmash = mv('強弓', 'fsmash', 48, [hb(28, -56, 16, 14, 16, 6, 40, 30, 60)], {
        charge: { at: 9, max: 60 },
        spawns: [{ f: 15, proj: proj('arrow', 'poison', { x: 40, y: -60, vx: 20, r: 9, life: 34, gravity: 0.05, hit: hit(12, 38, 30, 90, { poison: { dmg: 1, ticks: 3, every: 30 } }) }) }],
      });
      break;
    case 'bomb':
      m.dsmash = mv('焙烙玉・爆散', 'dsmash', 50, [hb(0, -30, 60, 14, 18, 15, 60, 34, 96, { fx: 'fire', dir: 'away' })], { charge: { at: 7, max: 60 } });
      m.fsmash = mv('焙烙玉・投擲', 'fsmash', 46, [], {
        charge: { at: 8, max: 60 },
        spawns: [{ f: 14, proj: proj('bomb', 'fire', { vx: 8.5, vy: -7, gravity: 0.45, r: 12, life: 60, ground: 'die', hit: hit(5, 45, 20, 40), explode: { r: 56, hit: hit(12, 50, 36, 92, { fx: 'fire', dir: 'away' }) } }) }],
      });
      break;
    case 'chain':
      m.grab = mv('鎖鎌つかみ', 'grab', 40, [hb(60, -56, 22, 9, 13, 0, 0, 0, 0, { grab: true }), hb(100, -56, 18, 10, 13, 0, 0, 0, 0, { grab: true })]);
      break;
    case 'falcon':
      m.fsmash = mv('鷹・突撃', 'fsmash', 48, [hb(30, -58, 18, 14, 16, 7, 40, 30, 70, { fx: 'wind' })], {
        charge: { at: 9, max: 60 },
        spawns: [{ f: 14, proj: proj('hawk', 'wind', { vx: 14, r: 20, life: 22, pierce: true, hit: hit(12, 40, 32, 94, { fx: 'wind' }) }) }],
      });
      m.uair = mv('鷹・舞い上がり', 'uair', 34, [hb(0, -120, 30, 6, 12, 9, 85, 32, 98, { fx: 'wind' })], { landLag: 8, autoCancel: 24 });
      break;
    case 'scroll':
    case 'brush':
    case 'talisman':
    case 'halo':
    case 'onibi':
    case 'shamisen':
    case 'spirit': {
      const draw = kind === 'brush' ? 'ink' : kind === 'shamisen' ? 'note' : kind === 'onibi' || kind === 'spirit' ? 'orb' : kind === 'halo' ? 'ring' : 'glyph';
      m.fsmash.spawns = [{ f: 15, proj: proj(draw, st.fx, { x: 50, vx: 9, r: 18, life: 18, drag: 0.94, pierce: true, hit: hit(5, 40, 30, 70) }) }];
      break;
    }
    case 'wings':
      m.fair = mv('羽ばたき斬り', 'fair', 38, [hb(40, -56, 30, 8, 13, 11, 45, 30, 98, { fx: 'wind' })], { landLag: 10, autoCancel: 30, trail: [7, 14] });
      break;
    case 'abyss':
      m.nair = mv('奈落の脚', 'nair', 38, [hb(0, -50, 44, 6, 18, 3, 0, 16, 0, { rehit: 6, link: true, fx: 'dark' }), hb(0, -50, 46, 18, 21, 5, 361, 36, 100, { group: 1, fx: 'dark' })], { landLag: 9, autoCancel: 30 });
      break;
    default:
      break;
  }
  return m;
}

const FSMASH_NAME: Record<WeaponKind, string> = {
  shuriken: '風車斬り',
  katana: '袈裟斬り',
  lasersword: '閃光一閃',
  bigblade: '兜割り',
  dagger: '急所突き',
  claw: '裂爪',
  fist: '正拳突き',
  scroll: '巻物打ち',
  bow: '強弓',
  dango: '串突き',
  bomb: '焙烙投げ',
  club: '大振り',
  falcon: '鷹突撃',
  talisman: '符術',
  beads: '数珠鞭',
  halo: '光輪打ち',
  shamisen: '撥打ち',
  chain: '分銅飛ばし',
  brush: '大筆払い',
  wings: '翼撃',
  mallet: '槌落とし',
  onibi: '鬼火放ち',
  gun: '零距離射撃',
  box: '笈振り回し',
  spirit: '狐火突き',
  abyss: '奈落の爪',
};

const USMASH_NAME: Record<WeaponKind, string> = {
  ...FSMASH_NAME,
  shuriken: '昇り風車',
  katana: '逆袈裟',
  lasersword: '昇光',
  bigblade: '天衝',
  fist: '昇拳',
  club: '天突き',
  mallet: '打ち上げ',
  gun: '天撃ち',
};
