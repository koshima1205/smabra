import type { AnimId, Effect, JutsuKind, MoveDef, ProjDraw, ProjectileDef } from '../types';
import { hb, hit, mv, proj } from './dsl';

export interface SpecialSet {
  nspec: MoveDef;
  sspec: MoveDef;
  uspec: MoveDef;
  dspec: MoveDef;
  extra: Record<string, MoveDef>;
}

// ───────────────────────── テンプレート ─────────────────────────

/** 飛び道具を放つ */
function shoot(
  name: string,
  fx: Effect,
  p: ProjectileDef,
  o: { f?: number; frames?: number; spread?: number[]; anim?: AnimId; aim?: boolean; charge?: { at: number; max: number } } = {},
): MoveDef {
  const f = o.f ?? 14;
  return mv(name, o.anim ?? 'cast', o.frames ?? 40, [], {
    fx,
    spawns: [{ f, proj: p, spread: o.spread, aim: o.aim }],
    turn: true,
    stall: true,
    gravity: 0.7,
    charge: o.charge,
  });
}

/** 横に突進して斬る */
function lunge(
  name: string,
  fx: Effect,
  o: { speed?: number; dmg?: number; ang?: number; bkb?: number; kbg?: number; start?: number; dur?: number; frames?: number; multi?: boolean; armor?: number; invuln?: [number, number]; r?: number } = {},
): MoveDef {
  const start = o.start ?? 8;
  const dur = o.dur ?? 12;
  const speed = o.speed ?? 13;
  const r = o.r ?? 24;
  const hits = o.multi
    ? [
        hb(34, -52, r, start, start + dur, 2, 0, 12, 0, { rehit: 4, link: true, fx }),
        hb(40, -52, r + 4, start + dur, start + dur + 3, o.dmg ?? 7, o.ang ?? 40, o.bkb ?? 40, o.kbg ?? 90, { group: 1, fx }),
      ]
    : [hb(36, -52, r, start, start + dur, o.dmg ?? 11, o.ang ?? 40, o.bkb ?? 36, o.kbg ?? 86, { fx })];
  return mv(name, 'lunge', o.frames ?? 42, hits, {
    fx,
    impulses: [
      { f: start - 1, vx: speed, set: true },
      { f: start - 1, vy: -3.5, set: true, airOnly: true },
    ],
    gravity: 0.35,
    airLimit: true,
    armor: o.armor ? { f0: 2, f1: start + dur, threshold: o.armor } : undefined,
    invuln: o.invuln,
    trail: [start - 1, start + dur],
  });
}

/** 上昇しながら多段攻撃（復帰ワザ） */
function rise(name: string, fx: Effect, o: { vy?: number; dmg?: number; final?: number; steer?: number; frames?: number; armor?: boolean } = {}): MoveDef {
  const vy = o.vy ?? -18.5;
  return mv(
    name,
    'rise',
    o.frames ?? 46,
    [
      hb(12, -64, 30, 4, 20, o.dmg ?? 2.5, 0, 18, 0, { rehit: 4, link: true, fx }),
      hb(10, -96, 34, 20, 24, o.final ?? 6, 85, 50, 104, { group: 1, fx }),
    ],
    {
      fx,
      impulses: [
        { f: 3, vy, set: true, steer: o.steer ?? 2.4 },
        { f: 3, vx: 1.5, set: true },
      ],
      gravity: 0.85,
      helpless: true,
      ledgeGrab: 8,
      landCancel: true,
      landLag: 16,
      armor: o.armor ? { f0: 1, f1: 10, threshold: 90 } : undefined,
      trail: [4, 24],
    },
  );
}

/** 瞬間移動（復帰ワザ） */
function blink(name: string, fx: Effect, o: { dist?: number; dmg?: number } = {}): MoveDef {
  const f = 14;
  return mv(name, 'blink', 34, [hb(0, -50, 34, f + 1, f + 5, o.dmg ?? 6, 70, 44, 70, { fx, dir: 'away' })], {
    fx,
    invuln: [4, f + 4],
    teleport: { f, dist: o.dist ?? 250 },
    helpless: true,
    ledgeGrab: f,
    stall: true,
    gravity: 0.12,
    landCancel: true,
    landLag: 14,
  });
}

/** 口寄せした乗り物で飛ぶ（復帰ワザ） */
function fly(name: string, fx: Effect, o: { lift?: number; frames?: number; dmg?: number } = {}): MoveDef {
  return mv(name, 'castUp', o.frames ?? 56, [hb(0, -30, 32, 4, 10, o.dmg ?? 7, 80, 40, 80, { fx })], {
    fx,
    impulses: [{ f: 4, vy: o.lift ?? -9.5, set: true }],
    gravity: 0.16,
    drift: 1.15,
    helpless: true,
    ledgeGrab: 6,
    landCancel: true,
    landLag: 12,
  });
}

/** カウンター（反撃ワザは extra に入れる） */
function counter(name: string, fx: Effect, then: string, o: { behind?: boolean; mult?: number } = {}): MoveDef {
  return mv(name, 'counter', 46, [], {
    fx,
    counter: { f0: 5, f1: 28, then, mult: o.mult ?? 1.25, behind: o.behind },
    stall: true,
    gravity: 0.35,
  });
}

function counterHit(name: string, fx: Effect, dmg = 10): MoveDef {
  return mv(name, 'fsmash', 30, [hb(48, -54, 32, 3, 7, dmg, 38, 52, 96, { fx })], { fx, invuln: [0, 8], trail: [2, 8] });
}

/** 自分の周囲に爆発 */
function burst(
  name: string,
  fx: Effect,
  o: { r?: number; dmg?: number; f?: number; frames?: number; stun?: number; poison?: boolean; multi?: boolean } = {},
): MoveDef {
  const f = o.f ?? 12;
  const r = o.r ?? 78;
  const hits = o.multi
    ? [hb(0, -50, r, f, f + 16, 2, 0, 10, 0, { rehit: 4, link: true, fx }), hb(0, -50, r + 6, f + 16, f + 19, o.dmg ?? 8, 70, 50, 96, { group: 1, fx, dir: 'away' })]
    : [
        hb(0, -50, r, f, f + 4, o.dmg ?? 13, 70, 40, 92, {
          fx,
          dir: 'away',
          stun: o.stun,
          poison: o.poison ? { dmg: 1, ticks: 5, every: 30 } : undefined,
        }),
      ];
  return mv(name, 'castDown', o.frames ?? 46, hits, { fx, stall: true, gravity: 0.5 });
}

/** 急降下（着地で衝撃波。地上では衝撃波のみ） */
function slam(name: string, fx: Effect, key: string): [MoveDef, Record<string, MoveDef>] {
  const air = mv(name, 'slam', 70, [hb(0, -20, 28, 8, 70, 9, 270, 30, 80, { fx })], {
    fx,
    impulses: [
      { f: 6, vy: 18, set: true },
      { f: 6, vx: 0, set: true },
    ],
    fallCap: 20,
    onLand: `${key}Land`,
    stall: true,
    groundAlt: `${key}Land`,
  });
  const land = mv(`${name}・衝撃`, 'castDown', 28, [hb(0, -24, 74, 2, 6, 11, 70, 45, 90, { fx, dir: 'away' })], { fx });
  return [air, { [`${key}Land`]: land }];
}

/** 自己強化・回復 */
function power(name: string, fx: Effect, o: { mult?: number; frames?: number; selfDmg?: number; heal?: number; burst?: number } = {}): MoveDef {
  const hits = o.burst ? [hb(0, -50, 60, 12, 15, o.burst, 70, 40, 60, { fx, dir: 'away' })] : [];
  return mv(name, 'buff', 42, hits, {
    fx,
    buff: o.mult ? { mult: o.mult, frames: o.frames ?? 360 } : undefined,
    selfDmg: o.selfDmg,
    heal: o.heal,
    stall: true,
    gravity: 0.4,
  });
}

/** 周囲に残る結界・毒霧 */
function field(name: string, fx: Effect, draw: ProjDraw, o: { follow?: boolean; r?: number; life?: number; dmg?: number; vx?: number; poison?: boolean } = {}): MoveDef {
  return shoot(
    name,
    fx,
    proj(draw, fx, {
      x: o.follow ? 0 : 50,
      y: -50,
      vx: o.vx ?? 1.2,
      r: o.r ?? 44,
      life: o.life ?? 150,
      drag: 0.97,
      pierce: true,
      rehit: 28,
      follow: o.follow,
      maxAlive: 1,
      reflectable: false,
      hit: hit(o.dmg ?? 3, 60, 22, 30, { fx, poison: o.poison ? { dmg: 1, ticks: 4, every: 30 } : undefined }),
    }),
    { f: 12, frames: 44, anim: 'castDown' },
  );
}

/** 地面に仕掛ける罠 */
function trap(name: string, fx: Effect, draw: ProjDraw, dmg = 10): MoveDef {
  return shoot(
    name,
    fx,
    proj(draw, fx, {
      x: 40,
      y: -20,
      vx: 1.5,
      vy: 3,
      gravity: 0.5,
      r: 20,
      life: 900,
      trap: true,
      maxAlive: 2,
      reflectable: false,
      hit: hit(1, 80, 10, 10),
      explode: { r: 50, hit: hit(dmg, 80, 45, 80, { fx }) },
    }),
    { f: 12, frames: 36, anim: 'castDown' },
  );
}

/** 反射 */
function mirror(name: string, fx: Effect): MoveDef {
  return mv(name, 'counter', 40, [hb(0, -50, 46, 4, 7, 5, 70, 40, 50, { fx, dir: 'away' })], {
    fx,
    reflect: { f0: 4, f1: 30, x: 0, y: -50, r: 64 },
    stall: true,
    gravity: 0.3,
  });
}

/** 分身・妖などが前方へ突撃する */
function charger(name: string, fx: Effect, draw: ProjDraw, o: { speed?: number; dmg?: number; life?: number; ground?: boolean } = {}): MoveDef {
  return shoot(
    name,
    fx,
    proj(draw, fx, {
      x: 20,
      y: o.ground ? -30 : -52,
      vx: o.speed ?? 14,
      r: 30,
      life: o.life ?? 26,
      pierce: true,
      rehit: 30,
      ground: o.ground ? 'slide' : undefined,
      gravity: o.ground ? 0.6 : 0,
      hit: hit(o.dmg ?? 9, 40, 40, 82, { fx }),
    }),
    { f: 10, frames: 40, anim: 'cast' },
  );
}

/** 相手を引き寄せる糸・鎖 */
function tether(name: string, fx: Effect, draw: ProjDraw): MoveDef {
  return shoot(
    name,
    fx,
    proj(draw, fx, {
      x: 30,
      vx: 16,
      r: 16,
      life: 18,
      tether: true,
      reflectable: false,
      hit: hit(5, 0, 0, 0, { fx, link: true, setKb: 70 }),
    }),
    { f: 10, frames: 44 },
  );
}

// 共通の飛び道具
const orb = (fx: Effect, o: Partial<ProjectileDef> & { dmg?: number } = {}) =>
  proj('orb', fx, { vx: 7.5, r: 16, life: 70, hit: hit(o.dmg ?? 8, 40, 30, 62, { fx }), ...o });

// ───────────────────────── 忍術ごとのセット ─────────────────────────

export function buildSpecials(kind: JutsuKind, seed: number): SpecialSet {
  const extra: Record<string, MoveDef> = {};
  const set = (n: MoveDef, s: MoveDef, u: MoveDef, d: MoveDef): SpecialSet => ({ nspec: n, sspec: s, uspec: u, dspec: d, extra });

  switch (kind) {
    case 'katon':
      return set(
        shoot('火遁・豪火球の術', 'fire', orb('fire', { maxAlive: 2, explode: { r: 40, hit: hit(4, 50, 30, 50, { fx: 'fire' }) } })),
        lunge('火遁・炎走り', 'fire', { dmg: 10 }),
        rise('火遁・昇炎', 'fire'),
        burst('火遁・爆炎陣', 'fire', { r: 82, dmg: 13 }),
      );
    case 'suiton':
      return set(
        shoot('水遁・水鉄砲', 'water', proj('orb', 'water', { vx: 11, r: 11, life: 45, maxAlive: 3, hit: hit(5, 30, 18, 40, { fx: 'water' }) }), { f: 9, frames: 30 }),
        shoot('水遁・大瀑布', 'water', proj('wave', 'water', { x: 30, y: -24, vx: 6, r: 28, life: 50, pierce: true, rehit: 60, ground: 'slide', gravity: 0.6, hit: hit(6, 30, 52, 30, { fx: 'water' }) }), { f: 12, frames: 42 }),
        rise('水遁・水柱昇り', 'water', { vy: -19.5 }),
        mirror('水遁・水鏡の術', 'water'),
      );
    case 'fuuton':
      return set(
        shoot('風遁・鎌鼬', 'wind', proj('blade', 'wind', { vx: 10.5, r: 18, life: 42, pierce: true, rehit: 60, hit: hit(6, 35, 26, 60, { fx: 'wind' }) })),
        shoot('風遁・突風', 'wind', proj('tornado', 'wind', { vx: 5, r: 40, life: 40, pierce: true, rehit: 2, reflectable: false, hit: hit(0, 0, 90, 0, { wind: true, fx: 'wind' }) }), { f: 10, frames: 40 }),
        rise('風遁・竜巻昇り', 'wind', { vy: -19.5, steer: 3 }),
        burst('風遁・旋風陣', 'wind', { r: 76, multi: true, dmg: 7 }),
      );
    case 'raiton': {
      const n = shoot(
        '雷遁・落雷',
        'elec',
        proj('bolt', 'elec', { x: 190, y: -520, vx: 0, vy: 24, r: 22, life: 30, ground: 'die', reflectable: false, hit: hit(9, 80, 40, 70, { fx: 'elec' }), explode: { r: 44, hit: hit(5, 70, 36, 50, { fx: 'elec' }) } }),
        { f: 16, frames: 44, anim: 'castUp' },
      );
      return set(n, lunge('雷遁・迅雷', 'elec', { speed: 17, dur: 9, frames: 36, dmg: 9 }), blink('雷遁・雷鳴天翔', 'elec', { dist: 270, dmg: 8 }), burst('雷遁・放電', 'elec', { r: 72, dmg: 11 }));
    }
    case 'kinton': {
      const coin = proj('coin', 'metal', { vx: 7, vy: -6, gravity: 0.4, r: 11, life: 60, spin: 0.3, ground: 'die', hit: hit(4, 45, 22, 40, { fx: 'metal' }) });
      const [sl, sx] = slam('金遁・金剛落とし', 'metal', 'kinSlam');
      Object.assign(extra, sx);
      sl.armor = { f0: 1, f1: 70, threshold: 100 };
      return set(
        shoot('金遁・小判撃ち', 'metal', coin, { spread: [30, 45, 60], frames: 42 }),
        lunge('金遁・黄金槌', 'metal', { speed: 10, dmg: 15, start: 14, frames: 52, armor: 110, kbg: 95 }),
        rise('金遁・金剛昇', 'metal', { vy: -17.5, armor: true }),
        sl,
      );
    }
    case 'laser':
      return set(
        shoot('閃光・レーザー', 'light', proj('beam', 'light', { vx: 24, r: 10, life: 30, maxAlive: 2, hit: hit(7, 20, 26, 40, { fx: 'light' }) }), { f: 10, frames: 34 }),
        lunge('閃光・光刃突進', 'light', { speed: 16, dmg: 11 }),
        blink('閃光・光速転移', 'light', { dist: 260, dmg: 7 }),
        burst('閃光・閃光弾', 'light', { r: 70, dmg: 4, stun: 42 }),
      );
    case 'poisonMist':
      return set(
        field('毒霧の術', 'poison', 'cloud', { poison: true, dmg: 2 }),
        shoot('毒矢・三連', 'poison', proj('arrow', 'poison', { vx: 13, r: 8, life: 30, gravity: 0.04, hit: hit(3, 35, 18, 40, { fx: 'poison', poison: { dmg: 1, ticks: 3, every: 30 } }) }), { spread: [-8, 0, 8] }),
        blink('毒霧・煙遁', 'poison', { dist: 240, dmg: 4 }),
        burst('毒霧・瘴気爆', 'poison', { r: 76, dmg: 9, poison: true }),
      );
    case 'poisonStar':
      return set(
        shoot('毒手裏剣', 'poison', proj('shuriken', 'poison', { vx: 11, r: 12, life: 40, spin: 0.5, hit: hit(4, 30, 18, 40, { fx: 'poison', poison: { dmg: 1, ticks: 4, every: 30 } }) }), { f: 10, frames: 30 }),
        shoot('毒手裏剣・三連打ち', 'poison', proj('shuriken', 'poison', { vx: 11, r: 11, life: 34, spin: 0.5, hit: hit(3, 30, 16, 40, { fx: 'poison' }) }), { spread: [-12, 0, 12], frames: 40 }),
        fly('酉の舞', 'wind', { lift: -10 }),
        trap('毒撒菱', 'poison', 'thorn', 8),
      );
    case 'kuchiyose': {
      const [sl, sx] = slam('口寄せ・大蝦蟇落とし', 'water', 'toadSlam');
      Object.assign(extra, sx);
      const variant = seed % 2;
      return set(
        charger('口寄せ・獣走り', 'normal', 'creature', { ground: true, speed: 9, life: 50, dmg: 9 }),
        variant === 0 ? charger('口寄せ・大蛇絡み', 'poison', 'creature', { speed: 16, life: 18, dmg: 10 }) : lunge('口寄せ・獣の爪', 'normal', { dmg: 11 }),
        fly('口寄せ・大鷹乗り', 'wind'),
        sl,
      );
    }
    case 'kagebunshin':
      extra.cloneStrike = counterHit('影分身・変わり身返し', 'dark', 11);
      return set(
        shoot('影分身・分身手裏剣', 'slash', proj('shuriken', 'slash', { vx: 12, r: 12, life: 36, spin: 0.6, hit: hit(4, 30, 20, 40, { fx: 'slash' }) }), { spread: [-6, 6], f: 10, frames: 34 }),
        charger('影分身・分身突撃', 'dark', 'clone', { speed: 15, dmg: 9 }),
        rise('影分身・分身跳躍', 'dark'),
        counter('影分身・身代わり', 'dark', 'cloneStrike', { behind: true }),
      );
    case 'kawarimi':
      extra.logStrike = counterHit('変わり身・背後斬り', 'slash', 12);
      return set(
        shoot('苦無投げ', 'slash', proj('kunai', 'slash', { vx: 15, r: 10, life: 30, hit: hit(5, 30, 20, 45, { fx: 'slash' }) }), { f: 8, frames: 28 }),
        lunge('変わり身・瞬身斬り', 'slash', { speed: 18, dur: 8, frames: 38, dmg: 10, invuln: [3, 10] }),
        blink('変わり身・丸太跳び', 'slash', { dist: 270, dmg: 5 }),
        counter('変わり身の術', 'slash', 'logStrike', { behind: true, mult: 1.35 }),
      );
    case 'kagenui':
      return set(
        shoot('影縫い・影針', 'dark', proj('kunai', 'dark', { vx: 13, r: 10, life: 36, hit: hit(3, 0, 0, 0, { fx: 'dark', stun: 46 }) }), { f: 10, frames: 34 }),
        lunge('影縫い・影走り', 'dark', { speed: 15, dmg: 9, invuln: [4, 12] }),
        rise('影縫い・影昇り', 'dark'),
        burst('影縫い・影牢', 'dark', { r: 72, dmg: 5, stun: 36 }),
      );
    case 'illusion':
      extra.darkBurst = counterHit('幻術・漆黒返し', 'dark', 11);
      return set(
        shoot('幻術・漆黒球', 'dark', orb('dark', { vx: 5, r: 20, life: 100, homing: 0.03, maxAlive: 1, dmg: 10 }), { f: 16, frames: 44 }),
        (() => {
          // 横移動のすり抜けはしりもち落下にしない（空中では1回まで）
          const side = blink('幻術・幻影歩法', 'dark', { dist: 190, dmg: 6 });
          side.helpless = false;
          side.airLimit = true;
          return side;
        })(),
        blink('幻術・霧隠れ', 'dark', { dist: 250, dmg: 4 }),
        counter('幻術・闇夜の帳', 'dark', 'darkBurst'),
      );
    case 'sakura':
      return set(
        shoot('桜吹雪の術', 'petal', proj('petal', 'petal', { vx: 4.5, r: 32, life: 60, pierce: true, rehit: 7, hit: hit(1.5, 50, 16, 20, { fx: 'petal' }) }), { f: 14, frames: 42 }),
        lunge('桜花一閃', 'petal', { dmg: 10, multi: true }),
        rise('花舞い昇り', 'petal'),
        burst('千本桜', 'petal', { r: 82, multi: true, dmg: 8 }),
      );
    case 'sacrifice':
      return set(
        shoot('暗器・匕首投げ', 'slash', proj('kunai', 'slash', { vx: 16, r: 10, life: 28, hit: hit(6, 30, 22, 48, { fx: 'slash' }) }), { f: 8, frames: 30 }),
        lunge('暗殺歩法', 'dark', { speed: 16, dur: 8, frames: 34, dmg: 9 }),
        rise('影踏み跳躍', 'dark'),
        power('人身御供', 'dark', { mult: 1.5, frames: 300, selfDmg: 8 }),
      );
    case 'nirvana':
      return set(
        shoot('円光・光輪', 'light', proj('ring', 'light', { vx: 11, accelX: -0.36, r: 22, life: 62, pierce: true, rehit: 22, spin: 0.3, reflectable: false, hit: hit(6, 45, 28, 55, { fx: 'light' }) }), { f: 12, frames: 36 }),
        lunge('光明突進', 'light', { dmg: 10 }),
        fly('昇天', 'light', { lift: -10 }),
        power('涅槃', 'light', { heal: 12, burst: 6 }),
      );
    case 'mantra':
      return set(
        shoot('祝詞・音撃', 'sound', proj('note', 'sound', { vx: 8.5, r: 20, life: 50, pierce: true, rehit: 60, hit: hit(6, 40, 26, 60, { fx: 'sound' }) }), { f: 12, frames: 38 }),
        lunge('撥さばき', 'sound', { dmg: 9, multi: true }),
        fly('天女の舞', 'sound'),
        power('祝詞・言霊結界', 'sound', { mult: 1.25, frames: 480, burst: 5 }),
      );
    case 'realm':
      return set(
        shoot('鎖鎌・分銅投げ', 'metal', proj('ring', 'metal', { vx: 13, accelX: -0.5, r: 16, life: 50, pierce: true, rehit: 26, spin: 0.4, reflectable: false, hit: hit(7, 40, 30, 60, { fx: 'metal' }) }), { f: 12, frames: 38 }),
        tether('鎖鎌・引き寄せ', 'dark', 'thread'),
        rise('罪業昇り', 'dark'),
        field('領域・罪業', 'dark', 'ring', { follow: true, r: 120, life: 180, dmg: 3 }),
      );
    case 'iroha':
      return set(
        shoot('忍びいろは・墨文字', 'ink', proj('glyph', 'ink', { vx: 6, r: 20, life: 70, hit: hit(8, 40, 30, 62, { fx: 'ink' }) }), { f: 14, frames: 40 }),
        lunge('一筆書き', 'ink', { dmg: 10 }),
        rise('墨昇り', 'ink'),
        trap('忍びいろは・罠文字', 'ink', 'glyph', 11),
      );
    case 'paint':
      return set(
        shoot('動植綵絵・花鳥', 'ink', proj('hawk', 'ink', { vx: 7, r: 18, life: 80, homing: 0.04, hit: hit(7, 40, 28, 60, { fx: 'ink' }) }), { f: 14, frames: 40 }),
        charger('動植綵絵・猛虎', 'ink', 'creature', { ground: true, speed: 10, life: 44, dmg: 10 }),
        fly('動植綵絵・鶴乗り', 'ink'),
        burst('絵の具爆発', 'petal', { r: 78, dmg: 12 }),
      );
    case 'hawkeye':
      extra.hawkStrike = counterHit('鷹の目・返し爪', 'wind', 10);
      return set(
        shoot('鷹の目・急降下', 'wind', proj('hawk', 'wind', { vx: 9, r: 18, life: 70, homing: 0.05, hit: hit(8, 40, 30, 62, { fx: 'wind' }) }), { f: 12, frames: 38 }),
        lunge('鷹の爪', 'wind', { dmg: 10, speed: 15 }),
        fly('鷹掴み飛翔', 'wind', { lift: -10.5 }),
        counter('鷹の目・見切り', 'wind', 'hawkStrike'),
      );
    case 'foxfire':
      return set(
        shoot('九尾の焔', 'fire', proj('orb', 'fire', { vx: 6, r: 12, life: 70, homing: 0.045, hit: hit(4, 40, 22, 45, { fx: 'fire' }) }), { spread: [-20, 0, 20], f: 14, frames: 42 }),
        lunge('狐火走り', 'fire', { dmg: 10, multi: true }),
        rise('九尾昇天', 'fire'),
        burst('九尾・焔結界', 'fire', { r: 88, dmg: 13 }),
      );
    case 'titan': {
      const n = mv('巨人の一撃', 'fsmash', 60, [hb(56, -56, 34, 18, 22, 20, 38, 40, 100, { fx: 'metal' })], {
        fx: 'metal',
        charge: { at: 10, max: 80 },
        armor: { f0: 4, f1: 22, threshold: 130 },
        impulses: [{ f: 17, vx: 5, set: true }],
        stall: true,
        gravity: 0.5,
        trail: [16, 23],
      });
      const wave = proj('wave', 'metal', { x: 30, y: -24, vx: 8, r: 26, life: 36, pierce: true, rehit: 60, ground: 'slide', gravity: 0.6, reflectable: false, hit: hit(8, 70, 40, 70, { fx: 'metal' }) });
      const d = mv('大地割り', 'castDown', 48, [hb(0, -20, 50, 14, 17, 10, 80, 40, 80, { fx: 'metal', dir: 'away' })], { fx: 'metal', spawns: [{ f: 14, proj: wave, spread: [0, 180] }], stall: true });
      return set(n, lunge('剛腕突進', 'metal', { speed: 11, dmg: 13, armor: 100, start: 12, frames: 48 }), rise('大跳躍', 'metal', { vy: -17.5, armor: true }), d);
    }
    case 'thistle':
      return set(
        shoot('野アザミ・棘飛ばし', 'petal', proj('thorn', 'petal', { vx: 11, r: 10, life: 32, hit: hit(3, 30, 16, 40, { fx: 'petal' }) }), { spread: [-10, 0, 10], f: 11, frames: 36 }),
        lunge('鉤爪・連撃', 'slash', { multi: true, dmg: 7 }),
        rise('棘昇り', 'petal'),
        trap('野アザミ・棘罠', 'petal', 'thorn', 10),
      );
    case 'curse':
      extra.curseStrike = counterHit('藁人形・呪い返し', 'dark', 13);
      return set(
        shoot('丑の刻参り・呪い釘', 'dark', proj('kunai', 'dark', { vx: 12, r: 10, life: 34, hit: hit(4, 30, 20, 40, { fx: 'dark', poison: { dmg: 1, ticks: 6, every: 25 } }) }), { f: 12, frames: 34 }),
        lunge('木槌振り', 'normal', { speed: 10, dmg: 14, start: 12, frames: 48, kbg: 95 }),
        blink('怨念渡り', 'dark', { dist: 250 }),
        counter('藁人形の呪い', 'dark', 'curseStrike', { mult: 1.4 }),
      );
    case 'catseye': {
      extra.catFire = burst('猫の目・大吉（大爆発）', 'fire', { r: 96, dmg: 18 });
      extra.catHeal = power('猫の目・中吉（回復）', 'light', { heal: 15, burst: 4 });
      extra.catBuff = power('猫の目・小吉（強化）', 'petal', { mult: 1.35, frames: 420, burst: 4 });
      extra.catBad = power('猫の目・凶（自爆）', 'dark', { selfDmg: 10, burst: 9 });
      const d = power('猫の目の選択', 'light', {});
      d.random = ['catFire', 'catHeal', 'catBuff', 'catFire', 'catBad'];
      return set(
        shoot('鬼火', 'fire', orb('fire', { vx: 6.5, r: 15, life: 80, homing: 0.025, maxAlive: 2, dmg: 7 }), { f: 12, frames: 36 }),
        lunge('猫走り', 'normal', { speed: 16, dmg: 9, frames: 34, dur: 9 }),
        rise('猫跳び', 'normal', { vy: -19.5 }),
        d,
      );
    }
    case 'sniper': {
      const up = mv('反動跳躍', 'castDown', 46, [hb(0, 10, 26, 6, 9, 7, 270, 30, 70, { fx: 'fire' })], {
        fx: 'fire',
        impulses: [{ f: 6, vy: -19, set: true, steer: 2.5 }],
        spawns: [{ f: 6, proj: proj('bullet', 'fire', { x: 0, y: 0, vx: 0, vy: 24, r: 8, life: 20, hit: hit(5, 270, 20, 40) }) }],
        helpless: true,
        ledgeGrab: 8,
        landCancel: true,
        landLag: 14,
        gravity: 0.9,
        sfx: [{ f: 6, name: 'gun' }],
      });
      return set(
        shoot('一発必中', 'fire', proj('bullet', 'fire', { x: 52, y: -60, vx: 28, r: 9, life: 40, hit: hit(10, 25, 32, 72, { fx: 'fire' }) }), { f: 10, frames: 36, charge: { at: 8, max: 70 } }),
        shoot('早撃ち', 'fire', proj('bullet', 'fire', { x: 52, y: -60, vx: 26, r: 7, life: 26, hit: hit(4, 25, 16, 30) }), { f: 6, frames: 24 }),
        up,
        trap('焙烙・地雷', 'fire', 'bomb', 13),
      );
    }
    case 'ritual':
      return set(
        shoot('呪符・火札', 'fire', proj('glyph', 'fire', { vx: 8, r: 16, life: 60, homing: 0.03, hit: hit(6, 40, 26, 55, { fx: 'fire' }) }), { f: 12, frames: 36 }),
        shoot('呪符・連札', 'light', proj('glyph', 'light', { vx: 10, r: 13, life: 40, hit: hit(4, 35, 20, 45, { fx: 'light' }) }), { spread: [-10, 0, 10], f: 12, frames: 40 }),
        blink('泰山府君・転移', 'light', { dist: 250 }),
        (() => {
          const d = mirror('泰山府君祭', 'light');
          d.heal = 8;
          return d;
        })(),
      );
    case 'thread': {
      const [sl, sx] = slam('笈落とし', 'normal', 'boxSlam');
      Object.assign(extra, sx);
      return set(
        shoot('糸脈・糸玉', 'normal', proj('thread', 'normal', { vx: 10, r: 14, life: 40, hit: hit(3, 0, 0, 0, { stun: 34 }) }), { f: 12, frames: 34 }),
        tether('糸脈・手繰り寄せ', 'normal', 'thread'),
        fly('糸渡り', 'normal', { lift: -10 }),
        sl,
      );
    }
    case 'izuna':
      extra.foxStrike = counterHit('飯綱・狐返し', 'fire', 11);
      return set(
        shoot('管狐', 'fire', proj('fox', 'fire', { vx: 8, r: 18, life: 70, homing: 0.045, hit: hit(7, 40, 28, 58, { fx: 'fire' }) }), { f: 12, frames: 38 }),
        lunge('飯綱落とし', 'fire', { dmg: 10, ang: 60 }),
        blink('飯綱昇り', 'fire', { dist: 260 }),
        counter('飯綱の法・狐結界', 'fire', 'foxStrike'),
      );
    case 'mutodori':
      extra.mutoStrike = counterHit('無刀取り・斬り返し', 'slash', 14);
      return set(
        shoot('居合・飛燕', 'slash', proj('blade', 'slash', { vx: 12, r: 20, life: 34, pierce: true, rehit: 60, hit: hit(8, 38, 30, 66, { fx: 'slash' }) }), { f: 14, frames: 40 }),
        lunge('縮地斬り', 'slash', { speed: 19, dur: 8, frames: 40, dmg: 12 }),
        rise('昇竜斬', 'slash'),
        counter('無刀取り', 'slash', 'mutoStrike', { behind: true, mult: 1.5 }),
      );
    case 'omen':
      return set(
        shoot('逢魔の黒炎', 'dark', orb('dark', { vx: 4.5, r: 24, life: 90, grow: 0.08, maxAlive: 1, dmg: 11 }), { f: 16, frames: 44 }),
        charger('百鬼夜行', 'dark', 'clone', { speed: 12, dmg: 10, life: 32 }),
        rise('魔翼昇り', 'dark'),
        field('逢魔刻', 'dark', 'ring', { follow: true, r: 130, life: 200, dmg: 3 }),
      );
    case 'abyss':
    default: {
      const v = seed % 4;
      const n =
        v === 0
          ? shoot('奈落の糸', 'dark', proj('thread', 'dark', { vx: 11, r: 14, life: 40, hit: hit(3, 0, 0, 0, { fx: 'dark', stun: 34 }) }), { f: 12, frames: 34 })
          : v === 1
            ? shoot('奈落の鬼火', 'dark', orb('dark', { vx: 6, r: 16, life: 80, homing: 0.035, dmg: 8 }), { f: 14, frames: 40 })
            : v === 2
              ? shoot('百足走り', 'poison', proj('spider', 'poison', { x: 20, y: -30, vx: 9, r: 22, life: 50, ground: 'slide', gravity: 0.6, pierce: true, rehit: 30, hit: hit(8, 40, 34, 70, { fx: 'poison', poison: { dmg: 1, ticks: 3, every: 30 } }) }), { f: 12, frames: 40 })
              : shoot('奈落の波動', 'dark', proj('wave', 'dark', { x: 30, y: -24, vx: 7, r: 26, life: 44, ground: 'slide', gravity: 0.6, pierce: true, rehit: 60, hit: hit(8, 60, 36, 70, { fx: 'dark' }) }), { f: 12, frames: 40 });
      return set(n, lunge('奈落這い', 'dark', { dmg: 11, multi: v === 2 }), rise('奈落昇り', 'dark'), burst('根の国・瘴気', 'dark', { r: 80, dmg: 10, poison: true }));
    }
  }
}
