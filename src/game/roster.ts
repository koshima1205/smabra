import { CNP, type CnpDef } from '../data/cnp';
import { KITAN } from '../data/kitan';
import data from '../data/roster.generated.json';
import type { CnpId } from '../render3d/types';
import { hb, hit, mv, powerMove, proj, scaleMove, shiftMove } from './moves/dsl';
import { buildNormals, styleOf } from './moves/normals';
import { buildSpecials, charger, counter, counterHit, fly, lunge, rise, shoot, slam, type SpecialSet } from './moves/specials';
import type { Effect, FighterSpec, FighterStats, JutsuKind, MoveDef, MoveSlot, PartnerNinja, Ratings, WeaponKind } from './types';

/** MCP（NINJAMCP）から同期したメタ情報 */
export const ROSTER_META = {
  mcp: data.mcp,
  credit: data.credit,
  clans: data.clans,
};

interface PartnerEntry {
  cnp: string;
  loreMention: string[];
  ninja: PartnerNinja;
}

const PARTNERS = new Map<string, PartnerEntry>((data.partners as PartnerEntry[]).map((p) => [p.cnp, p]));

export const CLAN_COLOR: Record<string, string> = {
  伊賀: '#e0443a',
  甲賀: '#3b7be0',
  風魔: '#8a4fd6',
  雑賀: '#34a864',
  天界: '#f2c14e',
  根の国: '#b0204a',
};

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

/**
 * キャラごとの設計。
 * weapon / jutsu は基本的にパートナーの忍者（MCP）の得物・忍術から。種族に合わない場合だけ置き換える。
 */
interface Design {
  weapon: WeaponKind;
  /** 通常ワザの名前に付ける得物名 */
  weaponName: string;
  jutsu: JutsuKind;
  fx: Effect;
  stats: Partial<FighterStats>;
  /** 必殺ワザ（パートナーの忍術のセットを使わない場合） */
  specials?: (seed: number) => SpecialSet;
  /** 必殺ワザの名前の付け替え */
  rename?: Partial<Record<'nspec' | 'sspec' | 'uspec' | 'dspec', string>>;
  /** 性能の微調整（CPU 同士の総当たりで勝率が偏りすぎないように） */
  tune?: (m: Record<MoveSlot, MoveDef>) => void;
  finalName: string;
}

const SMASHES: MoveSlot[] = ['fsmash', 'usmash', 'dsmash'];
const AERIALS: MoveSlot[] = ['nair', 'fair', 'bair', 'uair', 'dair'];

const DESIGN: Record<CnpId, Design> = {
  // パンダ: シャオランの太極拳 × 巨大化する力（MCP の設定）
  leelee: {
    weapon: 'fist',
    weaponName: '太極拳',
    jutsu: 'titan',
    fx: 'metal',
    stats: { weight: 128, run: 7.3, walk: 3.1, jumpV: 15.4, airJumpV: 14.4, gravity: 0.66, maxFall: 11.5, airSpeed: 4.8, width: 66, height: 100, scale: 1.1 },
    tune: (m) => {
      for (const k of [...SMASHES, 'ftilt', 'fair'] as MoveSlot[]) powerMove(m[k], 1.14, 3);
    },
    rename: { nspec: '巨大化パンチ', sspec: 'パンダ突進', uspec: '竹林大跳躍', dspec: 'パンダ・大地割り' },
    finalName: '奥義・巨大化',
  },
  // おばけ: 瀬織の木槌 × 丑の刻参り
  mitama: {
    weapon: 'mallet',
    weaponName: '木槌',
    jutsu: 'curse',
    fx: 'dark',
    stats: { weight: 76, gravity: 0.49, maxFall: 8.8, run: 7.0, walk: 3.2, airSpeed: 5.2, airAccel: 0.5, jumpV: 14.5, airJumpV: 13.2, airJumps: 3, width: 50, height: 84, scale: 0.95 },
    tune: (m) => {
      for (const k of SMASHES) powerMove(m[k], 0.88, -6);
      for (const k of AERIALS) powerMove(m[k], 0.92, -3);
    },
    finalName: '奥義・丑の刻参り',
  },
  // 鷹: ハヤテの鷹の目 × 鳴神（雷）
  narukami: {
    weapon: 'wings',
    weaponName: '翼',
    jutsu: 'hawkeye',
    fx: 'elec',
    stats: { weight: 92, gravity: 0.56, maxFall: 10.2, run: 8.3, airSpeed: 5.8, airAccel: 0.48, jumpV: 16, airJumpV: 14.8, airJumps: 2, width: 50, height: 88, scale: 0.97 },
    tune: (m) => {
      for (const k of [...SMASHES, ...AERIALS]) powerMove(m[k], 1.1, 3);
    },
    specials: () => {
      const extra: Record<string, MoveDef> = { hawkStrike: counterHit('鷹の目・返し爪', 'elec', 11) };
      return {
        nspec: shoot(
          '鳴神・落雷',
          'elec',
          proj('bolt', 'elec', { x: 190, y: -520, vx: 0, vy: 24, r: 22, life: 30, ground: 'die', reflectable: false, hit: hit(9, 80, 40, 70, { fx: 'elec' }), explode: { r: 44, hit: hit(5, 70, 36, 50, { fx: 'elec' }) } }),
          { f: 16, frames: 44, anim: 'castUp' },
        ),
        sspec: lunge('鷹の爪・迅雷', 'elec', { dmg: 10, speed: 16 }),
        uspec: fly('鷹の舞い上がり', 'wind', { lift: -10.5 }),
        dspec: counter('鷹の目・見切り', 'elec', 'hawkStrike'),
        extra,
      };
    },
    finalName: '奥義・鳴神',
  },
  // 白蛇: 長い尾のムチ × 毒（蛇ノ目の毒手裏剣から）
  orochi: {
    weapon: 'chain',
    weaponName: '尾',
    jutsu: 'poisonMist',
    fx: 'poison',
    stats: { weight: 104, run: 7.8, walk: 3.5, traction: 0.62, airSpeed: 5, jumpV: 15.6, width: 56, height: 80, scale: 0.98 },
    rename: { nspec: '毒霧の息', sspec: '毒牙・三連', uspec: '白蛇・脱皮', dspec: '毒霧・瘴気爆' },
    tune: (m) => {
      // 尾のムチは長いぶん出が遅いので少し速く・強く
      for (const k of [...SMASHES, ...AERIALS, 'ftilt', 'utilt', 'dashAtk'] as MoveSlot[]) {
        shiftMove(m[k], -2);
        powerMove(m[k], 1.08);
      }
      // 毒牙は矢ではなく毒液を吐く
      for (const sp of m.sspec.spawns ?? []) {
        sp.proj.draw = 'orb';
        sp.proj.r = 9;
      }
    },
    finalName: '奥義・八岐大蛇',
  },
  // うさぎ: 於兎の口寄せ（兎を呼ぶ）× 月
  luna: {
    weapon: 'fist',
    weaponName: '兎脚',
    jutsu: 'kuchiyose',
    fx: 'light',
    stats: { weight: 84, run: 8.4, jumpV: 18.2, airJumpV: 16.8, gravity: 0.64, airSpeed: 5.2, width: 48, height: 84, scale: 0.95 },
    specials: () => {
      const [sl, sx] = slam('月落とし', 'light', 'moonSlam');
      return {
        nspec: charger('口寄せ・兎走り', 'light', 'creature', { ground: true, speed: 9.5, life: 50, dmg: 9 }),
        sspec: lunge('月兎蹴り', 'light', { dmg: 11, speed: 15 }),
        uspec: rise('月跳び', 'light', { vy: -21 }),
        dspec: sl,
        extra: { ...sx },
      };
    },
    finalName: '奥義・月読',
  },
  // 小鬼: イブキの泰山府君祭と呪符 × 閻魔の金棒
  yama: {
    weapon: 'club',
    weaponName: '金棒',
    jutsu: 'ritual',
    fx: 'fire',
    stats: { weight: 106, run: 7.2, walk: 3.1, jumpV: 15.4, gravity: 0.65, airSpeed: 4.8, width: 56, height: 86, scale: 1.04 },
    finalName: '奥義・閻魔大王',
  },
  // オオカミ: 紫苑の鉤爪 × 野アザミ
  makami: {
    weapon: 'claw',
    weaponName: '鉤爪',
    jutsu: 'thistle',
    fx: 'slash',
    stats: { weight: 100, run: 9.3, dashInit: 9.9, walk: 3.8, traction: 0.5, airSpeed: 5.1, jumpV: 16.2, width: 58, height: 90, scale: 1 },
    finalName: '奥義・大口真神',
  },
  // 黒猫: 久遠の鬼火 × 猫の目の選択
  towa: {
    weapon: 'onibi',
    weaponName: '鬼火',
    jutsu: 'catseye',
    fx: 'fire',
    stats: { weight: 100, run: 8.4, airSpeed: 5.2, jumpV: 16.4, width: 50, height: 82, scale: 0.96 },
    tune: (m) => {
      for (const k of [...SMASHES, ...AERIALS]) powerMove(m[k], 1.16, 4);
    },
    finalName: '奥義・永久の鬼火',
  },
  // 白猫: 刹那（一瞬）の速攻
  setsuna: {
    weapon: 'claw',
    weaponName: '猫爪',
    jutsu: 'kawarimi',
    fx: 'slash',
    stats: { weight: 80, run: 8.6, dashInit: 9.3, traction: 0.48, airSpeed: 5.3, jumpV: 16.8, airJumpV: 15.6, width: 50, height: 82, scale: 0.95 },
    tune: (m) => {
      for (const k of SMASHES) powerMove(m[k], 0.86, -5);
      powerMove(m.sspec, 0.8, -6);
      // 苦無ではなく爪の斬撃を飛ばす
      for (const sp of m.nspec.spawns ?? []) sp.proj.draw = 'blade';
    },
    rename: { nspec: '刹那・爪飛ばし', sspec: '刹那・瞬身斬り', uspec: '刹那・瞬歩', dspec: '刹那・見切り' },
    finalName: '奥義・刹那',
  },

  // ───── 月蝕綺譚（ワザの名前は公式の忍術から。性能は本作オリジナル） ─────
  // 於兎（甲賀・土）: 兎の拳で地面ごと殴る重い一撃
  k_oto: {
    weapon: 'fist',
    weaponName: '兎拳',
    jutsu: 'titan',
    fx: 'metal',
    stats: { weight: 106, run: 7.6, walk: 3.3, jumpV: 17, airJumpV: 15.6, gravity: 0.64, airSpeed: 5, width: 56, height: 96, scale: 1.02 },
    tune: (m) => {
      for (const k of [...SMASHES, 'ftilt', 'fair', 'dashAtk'] as MoveSlot[]) powerMove(m[k], 1.12, 2);
      for (const k of AERIALS) shiftMove(m[k], -1);
    },
    rename: { nspec: 'うさぎどーん！', sspec: 'うさぎどっかーん！', uspec: '月兎跳び', dspec: '月兎・地ならし' },
    finalName: '奥義・月兎・満月どーん！',
  },
  // シャオラン（甲賀・土）: 太極拳 × 口寄せ・リーリー
  k_xiaolan: {
    weapon: 'fist',
    weaponName: '太極拳',
    jutsu: 'kuchiyose',
    fx: 'metal',
    stats: { weight: 98, run: 7.8, walk: 3.4, jumpV: 16, airSpeed: 5, width: 52, height: 100, scale: 1 },
    specials: () => ({
      nspec: charger('口寄せ・リーリー', 'metal', 'creature', { ground: true, speed: 8.5, life: 50, dmg: 9 }),
      sspec: lunge('肩ならべ双掌打', 'metal', { dmg: 8, speed: 12, multi: true }),
      uspec: rise('点心跳び', 'wind', { vy: -20 }),
      dspec: counter('太極・化勁', 'metal', 'taichiHit'),
      extra: { taichiHit: counterHit('太極・発勁', 'metal', 10) },
    }),
    finalName: '奥義・大きく描かれた頁',
  },
  // オロチ（風魔・水）: 口から抜く黒鉄の剣「叢雲」× 水
  k_orochi: {
    weapon: 'katana',
    weaponName: '叢雲',
    jutsu: 'suiton',
    fx: 'water',
    stats: { weight: 96, run: 8, walk: 3.5, jumpV: 16.2, airSpeed: 5.2, width: 50, height: 100, scale: 1 },
    tune: (m) => {
      // 刀は出が早く鋭く
      for (const k of [...SMASHES, ...AERIALS, 'ftilt', 'utilt', 'dashAtk'] as MoveSlot[]) {
        shiftMove(m[k], -1);
        powerMove(m[k], 1.12, 2);
      }
    },
    rename: { nspec: '水遁・白露', sspec: '鎌首', uspec: '叢雲抜き放ち', dspec: '水鏡の術' },
    finalName: '奥義・大蛇顕現・八重の大波',
  },
  // エマ（甲賀・金）: 一角槍 × 夢の幻術
  k_emma: {
    weapon: 'bigblade',
    weaponName: '一角槍',
    jutsu: 'illusion',
    fx: 'light',
    stats: { weight: 88, run: 8.2, walk: 3.6, jumpV: 16.8, airJumpV: 15.6, airJumps: 2, airSpeed: 5.3, width: 50, height: 100, scale: 1 },
    tune: (m) => {
      for (const k of SMASHES) powerMove(m[k], 0.94, -2);
    },
    rename: { nspec: '夢路・星こぼし', sspec: '一角突き', uspec: '蝕夢・角むすび', dspec: '幻術・夢の帳' },
    finalName: '奥義・幻月・一角の目醒め',
  },
};

const FX_COLOR: Record<string, string> = {
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

function statsFor(d: Design): FighterStats {
  const s: FighterStats = { ...BASE, ...d.stats };
  if (d.stats.dashInit === undefined) s.dashInit = s.run + 0.8;
  if (d.stats.fastFall === undefined) s.fastFall = s.maxFall * 1.5;
  if (d.stats.shortHopV === undefined) s.shortHopV = s.jumpV * 0.66;
  return s;
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
    power: clamp5((p * s.scale - 14) / 2.2 + 3),
    speed: clamp5((s.run - 7.8) * 1.6 + 3),
    weight: clamp5((s.weight - 100) / 9 + 3),
    range: clamp5(reach / 10 + (hasProj ? 1.2 : 0) + 1.4),
    recovery: clamp5(rec),
  };
}

function tagsFor(s: FighterStats, moves: Record<MoveSlot, MoveDef>, r: Ratings): string[] {
  const t: string[] = [];
  if (r.power >= 4) t.push('パワー');
  if (r.speed >= 4) t.push('スピード');
  if (moves.nspec.spawns) t.push('飛び道具');
  if (moves.dspec.counter) t.push('カウンター');
  if (moves.dspec.reflect) t.push('反射');
  if (s.weight >= 110) t.push('重量級');
  if (s.weight <= 88) t.push('軽量級');
  if (s.airJumps >= 2) t.push('空中戦');
  if (r.range >= 4) t.push('リーチ');
  const tricky = [moves.nspec, moves.sspec, moves.dspec].some(
    (m) => m.random || m.teleport || m.spawns?.some((sp) => sp.proj.trap || sp.proj.hit.stun || sp.proj.homing),
  );
  if (tricky) t.push('トリッキー');
  return t.slice(0, 4);
}

/** 奥義: 画面を覆う大技 */
function finalMove(name: string, fx: Effect): MoveDef {
  return mv(name, 'castUp', 96, [hb(0, -60, 430, 48, 54, 30, 55, 72, 86, { fx, dir: 'away', hitlag: 1.5 })], {
    fx,
    final: true,
    invuln: [0, 70],
    stall: true,
    gravity: 0,
  });
}

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function buildSpec(c: CnpDef): FighterSpec {
  const d = DESIGN[c.id];
  const entry = PARTNERS.get(c.id);
  const partner = entry?.ninja ?? null;
  const stats = statsFor(d);
  const normals = buildNormals(d.weapon, d.weaponName);
  const sp = d.specials ? d.specials(hashId(c.id)) : buildSpecials(d.jutsu, hashId(c.id));
  for (const [k, name] of Object.entries(d.rename ?? {}) as [keyof SpecialSet, string][]) (sp[k] as MoveDef).name = name;
  const moves: Record<MoveSlot, MoveDef> = { ...normals, nspec: sp.nspec, sspec: sp.sspec, uspec: sp.uspec, dspec: sp.dspec };
  d.tune?.(moves);
  for (const m of [...Object.values(moves), ...Object.values(sp.extra)]) scaleMove(m, stats.scale);
  const fx = sp.nspec.fx ?? d.fx;
  sp.extra.final = finalMove(d.finalName, d.fx);
  const ratings = ratingsFor(stats, moves, d.weapon);
  return {
    id: c.id,
    name: c.name,
    nameEn: c.nameEn,
    species: c.species,
    partner,
    partnerInMcp: (entry?.loreMention.length ?? 0) > 0,
    clan: partner?.clan ?? c.clan ?? '',
    series: c.series ?? 'cnp',
    element: c.element,
    ninjutsu: c.ninjutsu,
    weaponKind: d.weapon,
    jutsuKind: d.jutsu,
    stats,
    look: { color: c.color, aura: FX_COLOR[fx] ?? '#ffffff', trail: FX_COLOR[d.fx] ?? '#ffffff' },
    moves,
    extra: sp.extra,
    blurb: c.blurb,
    tags: tagsFor(stats, moves, ratings),
    ratings,
  };
}

/** 選べるキャラ（CNP 9体のあとに月蝕綺譚） */
export const FIGHTERS: FighterSpec[] = [...CNP, ...KITAN].map(buildSpec);

export function fighterById(id: string): FighterSpec {
  return FIGHTERS.find((f) => f.id === id) ?? FIGHTERS[0];
}
