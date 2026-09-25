import { hash32, hsl } from '../core/math';
import data from '../data/roster.generated.json';
import { hb, mv, scaleMove } from './moves/dsl';
import { buildNormals, styleOf } from './moves/normals';
import { buildSpecials } from './moves/specials';
import type { Effect, FighterSpec, FighterStats, JutsuKind, Look, MoveDef, MoveSlot, Ratings, WeaponKind } from './types';

/** MCP（NINJAMCP）から同期した生データ */
export interface RosterEntry {
  id: string;
  name: string;
  nameEn: string;
  clan: string;
  ninjutsu: string | null;
  ninjutsuEn: string | null;
  weapon: string | null;
  weaponEn: string | null;
  birthday: string | null;
  image: string | null;
  image3d: string | null;
}

export const ROSTER_META = {
  mcp: data.mcp,
  credit: data.credit,
  clans: data.clans,
};

const WEAPON_MAP: Record<string, WeaponKind> = {
  手裏剣: 'shuriken',
  毒手裏剣: 'shuriken',
  刀: 'katana',
  正宗: 'katana',
  妖刀村正: 'katana',
  大典太: 'katana',
  閃光刀: 'lasersword',
  牛刀: 'bigblade',
  匕首: 'dagger',
  鉤爪: 'claw',
  空手: 'fist',
  拳: 'fist',
  太極拳: 'fist',
  巻物: 'scroll',
  毒矢: 'bow',
  団子: 'dango',
  焙烙玉: 'bomb',
  棍棒: 'club',
  鷹: 'falcon',
  護符: 'talisman',
  呪符: 'talisman',
  数珠: 'beads',
  円光: 'halo',
  三味線: 'shamisen',
  鎖鎌: 'chain',
  筆: 'brush',
  絵筆: 'brush',
  羽: 'wings',
  木槌: 'mallet',
  鬼火: 'onibi',
  銃: 'gun',
  笈: 'box',
  なし: 'spirit',
};

const JUTSU_MAP: Record<string, JutsuKind> = {
  火遁: 'katon',
  水遁: 'suiton',
  風遁: 'fuuton',
  雷遁: 'raiton',
  金遁: 'kinton',
  閃光: 'laser',
  毒霧: 'poisonMist',
  毒手裏剣: 'poisonStar',
  口寄せ: 'kuchiyose',
  影分身: 'kagebunshin',
  影分身の術: 'kagebunshin',
  変わり身: 'kawarimi',
  影縫い: 'kagenui',
  '幻術・漆黒': 'illusion',
  桜吹雪: 'sakura',
  人身御供: 'sacrifice',
  涅槃: 'nirvana',
  祝詞: 'mantra',
  '領域・罪業': 'realm',
  忍びいろは: 'iroha',
  動植綵絵: 'paint',
  鷹の目: 'hawkeye',
  九尾の焔: 'foxfire',
  巨人の一撃: 'titan',
  野アザミ: 'thistle',
  丑の刻参り: 'curse',
  猫の目の選択: 'catseye',
  一発必中: 'sniper',
  泰山府君祭: 'ritual',
  糸脈: 'thread',
  飯綱の法: 'izuna',
  無刀取り: 'mutodori',
  逢魔刻: 'omen',
};

/** 未知の忍術（MCP 側に新キャラが増えた場合）の割り当て候補 */
const FALLBACK_JUTSU: JutsuKind[] = ['katon', 'suiton', 'fuuton', 'raiton', 'kagebunshin', 'kawarimi', 'sakura', 'kagenui'];

export const CLAN_COLOR: Record<string, string> = {
  伊賀: '#e0443a',
  甲賀: '#3b7be0',
  風魔: '#8a4fd6',
  雑賀: '#34a864',
  天界: '#f2c14e',
  根の国: '#b0204a',
};

const HEAVY: WeaponKind[] = ['club', 'mallet', 'bigblade', 'box'];
const LIGHT: WeaponKind[] = ['dagger', 'claw', 'shuriken', 'fist'];
const BLADES: WeaponKind[] = ['katana', 'lasersword', 'bigblade', 'dagger', 'claw'];

const BASE: FighterStats = {
  weight: 100,
  gravity: 0.62,
  maxFall: 11,
  fastFall: 16.5,
  walk: 3.4,
  run: 7.8,
  dashInit: 8.6,
  traction: 0.55,
  airSpeed: 5,
  airAccel: 0.42,
  airFriction: 0.18,
  jumpV: 16,
  shortHopV: 10.5,
  airJumpV: 15,
  airJumps: 1,
  width: 54,
  height: 100,
  scale: 1,
};

function jitter(h: number, shift: number, amount: number): number {
  return (((h >>> shift) & 0xff) / 255 - 0.5) * 2 * amount;
}

function statsFor(e: RosterEntry, weapon: WeaponKind, h: number): FighterStats {
  const s = { ...BASE };
  if (HEAVY.includes(weapon)) {
    s.weight += 16;
    s.run -= 0.9;
    s.walk -= 0.3;
    s.jumpV -= 0.6;
    s.scale = 1.08;
  }
  if (LIGHT.includes(weapon)) {
    s.weight -= 8;
    s.run += 0.6;
    s.airSpeed += 0.2;
  }
  if (weapon === 'wings') {
    s.airJumps = 2;
    s.gravity -= 0.06;
    s.weight -= 10;
    s.airSpeed += 0.3;
  }
  switch (e.clan) {
    case '伊賀':
      s.run += 0.4;
      break;
    case '甲賀':
      s.airJumpV += 0.6;
      break;
    case '風魔':
      s.weight += 6;
      break;
    case '雑賀':
      s.airAccel += 0.03;
      break;
    case '天界':
      s.gravity -= 0.1;
      s.maxFall -= 2;
      s.weight -= 10;
      s.airJumps += 1;
      break;
    case '根の国':
      s.weight += 10;
      s.gravity += 0.04;
      s.maxFall += 1;
      break;
  }
  const n = e.name;
  if (n.includes('爺') || n === '石舟斎') {
    s.weight += 8;
    s.run -= 0.7;
    s.jumpV -= 0.4;
  }
  if (['アウン', 'アトザ', 'コンガ'].includes(n)) {
    s.scale = 1.16;
    s.weight += 20;
    s.run -= 0.6;
  }
  if (n.includes('兎')) {
    s.jumpV += 1.2;
    s.airJumpV += 1;
  }
  if (n.includes('猫') || n === '久遠') {
    s.run += 0.6;
    s.traction -= 0.05;
  }
  if (n.includes('柴')) s.run += 0.8;
  s.weight = Math.round(s.weight + jitter(h, 0, 4));
  s.run += jitter(h, 8, 0.3);
  s.airSpeed += jitter(h, 16, 0.2);
  s.dashInit = s.run + 0.8;
  s.width = Math.round(54 * s.scale);
  s.height = Math.round(100 * s.scale);
  s.fastFall = s.maxFall * 1.5;
  s.shortHopV = s.jumpV * 0.66;
  return s;
}

const SKINS = ['#f6d7b8', '#eec29c', '#d9a77f', '#f3e0cf', '#e8b98f'];
const HAIRS = ['#1e1e28', '#5a3a22', '#2d4f8a', '#b33a3a', '#e8e2d0', '#f0c85a', '#e58bb8', '#3c6e4a'];
const STYLES: Look['hairStyle'][] = ['spiky', 'long', 'bun', 'short', 'twin', 'hood'];

const WEAPON_COLOR: Partial<Record<WeaponKind, string>> = {
  katana: '#dfe8f2',
  lasersword: '#8ff6ff',
  bigblade: '#c9d2dc',
  dagger: '#d9e0ea',
  claw: '#b8c0cc',
  shuriken: '#aab4c4',
  club: '#7a5234',
  mallet: '#8b5e3c',
  box: '#9a6b3f',
  gun: '#3a3a44',
  bow: '#8a5a2b',
  chain: '#9aa3ad',
  dango: '#f2c6d8',
  bomb: '#2b2b33',
  scroll: '#f2e6c8',
  brush: '#3a2a1a',
  talisman: '#fff4d6',
  beads: '#6b3f8a',
  halo: '#ffe28a',
  shamisen: '#6a3b1f',
  onibi: '#7fd0ff',
  falcon: '#8a6a4a',
  wings: '#f4f0ff',
  fist: '#e8e0d0',
  spirit: '#ffcf8a',
  abyss: '#3a1030',
};

function lookFor(e: RosterEntry, weapon: WeaponKind, auraFx: string, h: number): Look {
  const clan = CLAN_COLOR[e.clan] ?? '#cccccc';
  const hue = h % 360;
  const n = e.name;
  const heaven = e.clan === '天界';
  const abyss = e.clan === '根の国';
  const old = n.includes('爺') || n === '石舟斎';
  const hair = old ? '#e9e9ef' : heaven ? '#fff0c2' : abyss ? '#d9d2ea' : HAIRS[(h >>> 5) % HAIRS.length];
  return {
    body: heaven ? '#f4efe4' : abyss ? hsl(hue, 30, 14) : hsl(hue, 28, 22),
    body2: heaven ? '#d9cfb8' : abyss ? hsl(hue, 34, 9) : hsl(hue, 30, 15),
    accent: heaven ? '#e2b34a' : hsl((hue + 150) % 360, 70, 58),
    scarf: clan,
    skin: abyss ? '#cfc6e0' : heaven ? '#fff1dc' : SKINS[(h >>> 9) % SKINS.length],
    hair,
    eye: abyss ? '#ff4d6d' : heaven ? '#ffb000' : hsl((hue + 190) % 360, 80, 62),
    weapon: WEAPON_COLOR[weapon] ?? '#cccccc',
    trail: auraFx,
    aura: auraFx,
    ears: n.includes('狐') || n === '宇迦' || n === 'イズナ' ? 'fox' : n.includes('兎') ? 'rabbit' : n.includes('猫') || n === '久遠' ? 'cat' : n.includes('柴') ? 'dog' : null,
    horns: n.includes('鬼'),
    beard: old,
    halo: heaven || weapon === 'halo',
    wings: weapon === 'wings',
    tails: n === '猫又' ? 2 : n === '宇迦' ? 5 : n.includes('狐') ? 1 : 0,
    spiderLegs: n === 'ささがね',
    hairStyle: old ? 'short' : STYLES[(h >>> 13) % STYLES.length],
  };
}

const JUTSU_FX_COLOR: Record<string, string> = {
  fire: '#ff7a2f',
  water: '#48b8ff',
  wind: '#7dffc2',
  elec: '#8fe9ff',
  metal: '#ffc233',
  light: '#ffe07a',
  poison: '#b06bff',
  dark: '#9b5cff',
  petal: '#ff8fc0',
  ink: '#8f8fb8',
  sound: '#ffcf70',
  slash: '#bfefff',
  normal: '#ffb347',
};

function allMoves(m: Record<MoveSlot, MoveDef>, extra: Record<string, MoveDef>): MoveDef[] {
  return [...Object.values(m), ...Object.values(extra)];
}

function ratingsFor(s: FighterStats, moves: Record<MoveSlot, MoveDef>, weapon: WeaponKind): Ratings {
  const smash = ['fsmash', 'usmash', 'dsmash'] as const;
  let p = 0;
  for (const k of smash) p += Math.max(0, ...moves[k].hitboxes.map((h) => h.dmg * (1 + h.kbg / 200)), ...(moves[k].spawns ?? []).map((sp) => sp.proj.hit.dmg));
  p /= 3;
  const clamp5 = (v: number) => Math.max(1, Math.min(5, Math.round(v)));
  const up = moves.uspec;
  const rec = (up.teleport ? 3.6 : up.drift ? 4.2 : 3.2) + (s.airJumps - 1) * 0.9 + (s.gravity < 0.6 ? 0.5 : 0);
  const reach = styleOf(weapon).reach;
  const hasProj = !!moves.nspec.spawns;
  return {
    power: clamp5((p - 14) / 2.2 + 3),
    speed: clamp5((s.run - 7.8) * 1.6 + 3),
    weight: clamp5((s.weight - 100) / 9 + 3),
    range: clamp5(reach / 10 + (hasProj ? 1.2 : 0) + 1.4),
    recovery: clamp5(rec),
  };
}

function tagsFor(s: FighterStats, moves: Record<MoveSlot, MoveDef>, weapon: WeaponKind, r: Ratings): string[] {
  const t: string[] = [];
  if (BLADES.includes(weapon)) t.push('剣士');
  if (r.power >= 4) t.push('パワー');
  if (r.speed >= 4) t.push('スピード');
  if (moves.nspec.spawns) t.push('飛び道具');
  if (moves.dspec.counter) t.push('カウンター');
  if (moves.dspec.reflect) t.push('反射');
  if (s.weight >= 112) t.push('重量級');
  if (s.weight <= 90) t.push('軽量級');
  if (s.airJumps >= 2) t.push('空中戦');
  const tricky = [moves.nspec, moves.sspec, moves.dspec].some(
    (m) => m.random || m.teleport || m.spawns?.some((sp) => sp.proj.trap || sp.proj.hit.stun || sp.proj.homing),
  );
  if (tricky) t.push('トリッキー');
  return t.slice(0, 4);
}

function blurbFor(e: RosterEntry): string {
  const who = e.clan === '天界' ? '天界の神' : e.clan === '根の国' ? '根の国の妖' : `${e.clan}の忍`;
  const j = e.ninjutsu ? `${e.ninjutsu}の使い手` : '正体不明の力を操る';
  const w = e.weapon && e.weapon !== 'なし' ? `得物は${e.weapon}。` : '素手で戦う。';
  return `${who}。${j}。${w}`;
}

/** 奥義: 画面を覆う大技。名前は MCP の忍術名から */
function finalMove(e: RosterEntry, fx: Effect): MoveDef {
  const name = e.ninjutsu ? `奥義・${e.ninjutsu}` : '奥義・根の国開門';
  return mv(name, 'castUp', 96, [hb(0, -60, 430, 48, 54, 30, 55, 72, 86, { fx, dir: 'away', hitlag: 1.5 })], {
    fx,
    final: true,
    invuln: [0, 70],
    stall: true,
    gravity: 0,
  });
}

export function buildSpec(e: RosterEntry): FighterSpec {
  const h = hash32(e.id + e.name);
  const weapon: WeaponKind = e.weapon ? (WEAPON_MAP[e.weapon] ?? 'fist') : e.clan === '根の国' ? 'abyss' : 'fist';
  const jutsu: JutsuKind = e.ninjutsu ? (JUTSU_MAP[e.ninjutsu] ?? FALLBACK_JUTSU[h % FALLBACK_JUTSU.length]) : 'abyss';
  const stats = statsFor(e, weapon, h);
  const normals = buildNormals(weapon, e.weapon && e.weapon !== 'なし' ? e.weapon : null);
  const sp = buildSpecials(jutsu, h);
  const moves: Record<MoveSlot, MoveDef> = { ...normals, nspec: sp.nspec, sspec: sp.sspec, uspec: sp.uspec, dspec: sp.dspec };
  for (const m of allMoves(moves, sp.extra)) scaleMove(m, stats.scale);
  const auraFx = sp.nspec.fx ?? sp.dspec.fx ?? 'normal';
  sp.extra.final = finalMove(e, auraFx);
  const look = lookFor(e, weapon, JUTSU_FX_COLOR[auraFx] ?? '#ffffff', h);
  const ratings = ratingsFor(stats, moves, weapon);
  return {
    id: e.id,
    name: e.name,
    nameEn: e.nameEn,
    clan: e.clan,
    ninjutsu: e.ninjutsu,
    ninjutsuEn: e.ninjutsuEn,
    weapon: e.weapon,
    weaponEn: e.weaponEn,
    birthday: e.birthday,
    image: e.image,
    image3d: e.image3d,
    weaponKind: weapon,
    jutsuKind: jutsu,
    stats,
    look,
    moves,
    extra: sp.extra,
    blurb: blurbFor(e),
    tags: tagsFor(stats, moves, weapon, ratings),
    ratings,
  };
}

export const FIGHTERS: FighterSpec[] = (data.characters as RosterEntry[]).map(buildSpec);

export function fighterById(id: string): FighterSpec {
  return FIGHTERS.find((f) => f.id === id) ?? FIGHTERS[0];
}
