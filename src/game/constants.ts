/** 物理・戦闘の定数（1F = 1/60 秒、距離はワールド単位 ≒ px） */

/** 吹っ飛び値 → 初速（単位/F） */
export const LAUNCH_MUL = 0.2;
/** 吹っ飛び速度の毎F減衰 */
export const LAUNCH_DECAY = 0.34;
/** 吹っ飛び値 → ヒットストップ後の硬直F */
export const HITSTUN_MUL = 0.4;
/** これ以上の吹っ飛びできりもみ（受け身が必要） */
export const TUMBLE_KB = 80;
/** ずらし（DI）の最大角度（度） */
export const DI_MAX = 16;

export const SHIELD_MAX = 50;
export const SHIELD_DECAY = 0.13;
export const SHIELD_REGEN = 0.075;
export const SHIELD_BREAK_STUN = 200;

export const JUMPSQUAT = 4;
export const LAND_LAG = 4;
export const HELPLESS_LAND_LAG = 22;
export const AIRDODGE_LAND_LAG = 10;

export const LEDGE_INVULN = 30;
export const LEDGE_MAX_HANG = 300;
export const LEDGE_REGRAB = 32;

export const RESPAWN_DELAY = 80;
export const RESPAWN_WAIT = 240;
export const RESPAWN_INVULN = 120;

export const TECH_WINDOW = 20;
export const DOWN_MAX = 90;

export const MAX_DAMAGE = 999;
export const MAX_HITLAG = 22;
