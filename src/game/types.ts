/** ヒット時の属性（エフェクト・サウンド・色に使う） */
export type Effect =
  | 'normal'
  | 'slash'
  | 'fire'
  | 'elec'
  | 'water'
  | 'wind'
  | 'poison'
  | 'dark'
  | 'light'
  | 'petal'
  | 'metal'
  | 'ink'
  | 'sound';

/** 得物（MCP の weapon から決まる）: 見た目と通常技の型 */
export type WeaponKind =
  | 'shuriken'
  | 'katana'
  | 'lasersword'
  | 'bigblade'
  | 'dagger'
  | 'claw'
  | 'fist'
  | 'scroll'
  | 'bow'
  | 'dango'
  | 'bomb'
  | 'club'
  | 'falcon'
  | 'talisman'
  | 'beads'
  | 'halo'
  | 'shamisen'
  | 'chain'
  | 'brush'
  | 'wings'
  | 'mallet'
  | 'onibi'
  | 'gun'
  | 'box'
  | 'spirit'
  | 'abyss';

/** 忍術（MCP の ninjutsu から決まる）: 必殺ワザ4種の型 */
export type JutsuKind =
  | 'katon'
  | 'suiton'
  | 'fuuton'
  | 'raiton'
  | 'kinton'
  | 'laser'
  | 'poisonMist'
  | 'poisonStar'
  | 'kuchiyose'
  | 'kagebunshin'
  | 'kawarimi'
  | 'kagenui'
  | 'illusion'
  | 'sakura'
  | 'sacrifice'
  | 'nirvana'
  | 'mantra'
  | 'realm'
  | 'iroha'
  | 'paint'
  | 'hawkeye'
  | 'foxfire'
  | 'titan'
  | 'thistle'
  | 'curse'
  | 'catseye'
  | 'sniper'
  | 'ritual'
  | 'thread'
  | 'izuna'
  | 'mutodori'
  | 'omen'
  | 'abyss';

export type MoveSlot =
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
  | 'nspec'
  | 'sspec'
  | 'uspec'
  | 'dspec'
  | 'grab'
  | 'pummel'
  | 'fthrow'
  | 'bthrow'
  | 'uthrow'
  | 'dthrow'
  | 'getupAtk';

export type AnimId =
  | 'jab1'
  | 'jab2'
  | 'jab3'
  | 'ftilt'
  | 'utilt'
  | 'dtilt'
  | 'dash'
  | 'fsmash'
  | 'usmash'
  | 'dsmash'
  | 'nair'
  | 'fair'
  | 'bair'
  | 'uair'
  | 'dair'
  | 'cast'
  | 'castUp'
  | 'castDown'
  | 'lunge'
  | 'rise'
  | 'counter'
  | 'slam'
  | 'grab'
  | 'pummel'
  | 'throwF'
  | 'throwB'
  | 'throwU'
  | 'throwD'
  | 'getupAtk'
  | 'buff'
  | 'spin'
  | 'blink';

/** 攻撃判定（円）。座標はファイターの足元中心基準・右向き（+x 前、-y 上） */
export interface HitboxBase {
  dmg: number;
  /** 吹っ飛び角度（度）。0=前、90=上、270=下。361=地上低%は横・それ以外は斜め上 */
  ang: number;
  /** ベース吹っ飛び */
  bkb: number;
  /** 吹っ飛び成長率 */
  kbg: number;
  fx?: Effect;
  /** 同じ group は1ワザ中に同じ相手へ1回だけ当たる（rehit 指定時を除く） */
  group?: number;
  /** 多段: この間隔（F）で同じ相手に再ヒット */
  rehit?: number;
  /** 'away' = 相手が背後にいれば逆向きに飛ばす */
  dir?: 'face' | 'away';
  hitlag?: number;
  /** 追加シールド削り */
  sdmg?: number;
  /** 固定吹っ飛び（％に依存しない） */
  setKb?: number;
  /** 影縫い: 吹っ飛ばさずにこの F 数だけ硬直 */
  stun?: number;
  /** 毒: dmg を every F ごとに ticks 回 */
  poison?: { dmg: number; ticks: number; every: number };
  /** 風判定: ダメージ・ひるみ無しで押し出す */
  wind?: boolean;
  /** 多段連結: 攻撃者の位置へ引き寄せる */
  link?: boolean;
  /** つかみ判定 */
  grab?: boolean;
}

export interface HitboxDef extends HitboxBase {
  x: number;
  y: number;
  r: number;
  /** 有効フレーム [f0, f1) */
  f0: number;
  f1: number;
}

export type ProjDraw =
  | 'orb'
  | 'shuriken'
  | 'kunai'
  | 'blade'
  | 'bolt'
  | 'beam'
  | 'petal'
  | 'cloud'
  | 'creature'
  | 'glyph'
  | 'bullet'
  | 'arrow'
  | 'note'
  | 'bomb'
  | 'wave'
  | 'ring'
  | 'pillar'
  | 'hawk'
  | 'fox'
  | 'ink'
  | 'thorn'
  | 'doll'
  | 'clone'
  | 'coin'
  | 'dango'
  | 'tornado'
  | 'thread'
  | 'spider';

export interface ProjectileDef {
  draw: ProjDraw;
  fx: Effect;
  /** 出現位置（右向き基準） */
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity?: number;
  /** 横方向の加速度（向き基準。負ならブーメランのように戻る） */
  accelX?: number;
  /** 速度減衰（毎F 乗算） */
  drag?: number;
  life: number;
  r: number;
  hit: HitboxBase;
  /** 当たっても消えない */
  pierce?: boolean;
  /** 同じ相手への再ヒット間隔 */
  rehit?: number;
  /** 最寄りの敵へ誘導（1Fあたりの旋回率 0..1） */
  homing?: number;
  /** 地面に触れたとき */
  ground?: 'die' | 'bounce' | 'slide' | 'stop';
  /** 消滅時の爆発 */
  explode?: { r: number; hit: HitboxBase };
  reflectable?: boolean;
  /** 持ち主に追従する（周囲に展開する結界など） */
  follow?: boolean;
  /** 持ち主ごとの同時存在数上限 */
  maxAlive?: number;
  /** 半径の成長（毎F） */
  grow?: number;
  /** 見た目の回転速度 */
  spin?: number;
  /** 設置型（持続し、触れると起爆） */
  trap?: boolean;
  /** 触れた相手を拘束・引き寄せる（糸） */
  tether?: boolean;
}

export interface SpawnDef {
  f: number;
  proj: ProjectileDef;
  /** 複数発射時の角度（度、右向き基準）。未指定なら vx/vy のまま1発 */
  spread?: number[];
  /** スティック方向に向ける（上下のみ） */
  aim?: boolean;
}

export interface Impulse {
  f: number;
  vx?: number;
  vy?: number;
  /** true: 速度をセット / false: 加算 */
  set?: boolean;
  /** スティック方向への追加操作量 */
  steer?: number;
  /** 空中で使ったときだけ */
  airOnly?: boolean;
}

export interface MoveDef {
  name: string;
  anim: AnimId;
  frames: number;
  hitboxes: HitboxDef[];
  /** 空中ワザの着地隙 */
  landLag?: number;
  /** この F 以降の着地は隙なし */
  autoCancel?: number;
  /** スマッシュホールド: at F で最大 max F まで溜め */
  charge?: { at: number; max: number };
  impulses?: Impulse[];
  gravity?: number;
  fallCap?: number;
  /** 空中で使ったとき落下をいったん止める */
  stall?: boolean;
  spawns?: SpawnDef[];
  /** 空中で終わると しりもち落下 */
  helpless?: boolean;
  armor?: { f0: number; f1: number; threshold: number };
  invuln?: [number, number];
  /** カウンター受付。then = 反撃ワザ（extra のキー）。behind = 相手の背後へ回り込む */
  counter?: { f0: number; f1: number; then: string; mult: number; behind?: boolean };
  reflect?: { f0: number; f1: number; x: number; y: number; r: number };
  /** この F 以降は崖つかまり可能（復帰ワザ） */
  ledgeGrab?: number;
  /** 着地したらワザ終了（着地隙 landLag） */
  landCancel?: boolean;
  /** 着地時に派生するワザ（extra のキー） */
  onLand?: string;
  /** 出始めにスティックで振り向ける */
  turn?: boolean;
  teleport?: { f: number; dist: number };
  selfDmg?: number;
  buff?: { mult: number; frames: number };
  heal?: number;
  fx?: Effect;
  /** 武器の軌跡を描く F 範囲 */
  trail?: [number, number];
  /** 地上で使ったときの横慣性の保持率 */
  keepVx?: number;
  /** 空中で使える回数（着地でリセット）。横必殺などの連続使用を防ぐ */
  airLimit?: boolean;
  /** 地上で出したときはこのワザ（extra のキー）に置き換える */
  groundAlt?: string;
  /** 候補からランダムに派生（猫の目の選択） */
  random?: string[];
  /** 奥義（最後の切り札） */
  final?: boolean;
  /** 移動中に左右入力で向きを変えられる（空中横必殺など） */
  drift?: number;
  sfx?: { f: number; name: string }[];
}

export interface FighterStats {
  weight: number;
  gravity: number;
  maxFall: number;
  fastFall: number;
  walk: number;
  run: number;
  dashInit: number;
  traction: number;
  airSpeed: number;
  airAccel: number;
  airFriction: number;
  jumpV: number;
  shortHopV: number;
  airJumpV: number;
  /** 空中ジャンプ回数 */
  airJumps: number;
  width: number;
  height: number;
  scale: number;
}

export interface Look {
  /** テーマ色（UI・マフラー） */
  color: string;
  /** エフェクト（オーラ・軌跡）の色 */
  aura: string;
  trail: string;
}

export interface Ratings {
  power: number;
  speed: number;
  weight: number;
  range: number;
  recovery: number;
}

/** パートナーの忍者（NINJAMCP から同期した事実情報） */
export interface PartnerNinja {
  id: string;
  name: string;
  nameEn: string;
  clan: string;
  ninjutsu: string | null;
  ninjutsuEn: string | null;
  weapon: string | null;
  weaponEn: string | null;
  birthday: string | null;
}

export interface FighterSpec {
  id: string;
  name: string;
  nameEn: string;
  /** 種族（パンダ・白蛇など） */
  species: string;
  partner: PartnerNinja | null;
  /** パートナー関係が MCP（忍者のプロフィール）に記載されているか */
  partnerInMcp: boolean;
  /** パートナーの忍者のクラン */
  clan: string;
  weaponKind: WeaponKind;
  jutsuKind: JutsuKind;
  stats: FighterStats;
  look: Look;
  moves: Record<MoveSlot, MoveDef>;
  extra: Record<string, MoveDef>;
  blurb: string;
  tags: string[];
  ratings: Ratings;
}

export interface Platform {
  x1: number;
  x2: number;
  y: number;
  /** すり抜け床 */
  soft: boolean;
  /** 移動床: 振幅と周期（F） */
  move?: { ax: number; ay: number; period: number; phase: number };
}

export interface StageDef {
  id: string;
  name: string;
  sub: string;
  bgm: 'iga' | 'tenkai' | 'nenokuni' | 'saika';
  /** メインの足場（崖つかまり可能な固い床） */
  main: { x1: number; x2: number; y: number; depth: number };
  platforms: Platform[];
  blast: { l: number; r: number; t: number; b: number };
  spawns: { x: number; y: number }[];
  respawn: { x: number; y: number };
}

export type SlotKind = 'human' | 'cpu' | 'off';

export interface PlayerConfig {
  port: number;
  kind: SlotKind;
  device: string | null;
  fighterId: string | null;
  cpuLevel: number;
  team: number;
}

export interface MatchRules {
  stocks: number;
  /** 秒。0 なら無制限 */
  time: number;
  stageId: string;
}
