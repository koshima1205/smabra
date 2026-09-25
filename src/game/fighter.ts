import { Controller } from '../core/input';
import { approach, clamp, DEG } from '../core/math';
import * as K from './constants';
import type { Match } from './match';
import type { Ledge } from './stage';
import type { FighterSpec, HitboxDef, MoveDef, MoveSlot } from './types';

export type FState =
  | 'idle'
  | 'walk'
  | 'dash'
  | 'run'
  | 'skid'
  | 'crouch'
  | 'jumpsquat'
  | 'air'
  | 'land'
  | 'attack'
  | 'shield'
  | 'shieldstun'
  | 'unshield'
  | 'dizzy'
  | 'roll'
  | 'spotdodge'
  | 'airdodge'
  | 'hurt'
  | 'tumble'
  | 'helpless'
  | 'ledge'
  | 'ledgeclimb'
  | 'ledgeroll'
  | 'holding'
  | 'grabbed'
  | 'down'
  | 'getup'
  | 'stun'
  | 'respawn'
  | 'dead';

export interface ActiveHitbox {
  hb: HitboxDef;
  x: number;
  y: number;
  r: number;
}

/** 物理を適用しない（位置を直接決める）状態 */
const LOCKED = new Set<FState>(['ledge', 'ledgeclimb', 'ledgeroll', 'grabbed', 'respawn', 'dead']);
/** 空中で左右に流せる状態 */
const DRIFT = new Set<FState>(['air', 'tumble', 'helpless', 'attack']);
/** 崖から落ちずに止まる地上状態 */
const EDGE_STOP = new Set<FState>(['roll', 'spotdodge', 'shield', 'shieldstun', 'unshield', 'getup', 'down', 'dizzy', 'land', 'holding']);
const AERIALS = new Set(['nair', 'fair', 'bair', 'uair', 'dair']);
const THROWS = new Set(['fthrow', 'bthrow', 'uthrow', 'dthrow', 'pummel']);

export class Fighter {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** 吹っ飛びによる速度（自分の速度とは別に減衰する） */
  kbx = 0;
  kby = 0;
  prevX = 0;
  prevY = 0;
  facing: 1 | -1 = 1;
  state: FState = 'idle';
  /** 現在の状態になってからのF */
  t = 0;
  grounded = true;
  /** 0 = メイン足場, n = すり抜け床 n-1, -1 = 空中 */
  ground = 0;
  airJumps = 1;
  fastFall = false;
  dropT = 0;
  dropWait = 0;
  airDodged = false;
  airUsed = new Set<string>();
  damage = 0;
  stocks = 3;
  shield = K.SHIELD_MAX;
  hitlag = 0;
  hitstun = 0;
  tumble = false;
  pendingLaunch: { lx: number; ly: number; speed: number } | null = null;
  move: MoveDef | null = null;
  moveKey = '';
  mf = 0;
  charge = 0;
  chargeMul = 1;
  private chargeSrc: 'smash' | 'attack' | 'cstick' | 'special' = 'smash';
  /** `${port}:${group}` → 最後に当てたF（mf） */
  moveHits = new Map<string, number>();
  /** 無敵（すり抜け）F */
  intang = 0;
  respawnInv = 0;
  ledge: Ledge | null = null;
  ledgeCd = 0;
  ledgeFresh = true;
  ledgeT = 0;
  holding: Fighter | null = null;
  heldBy: Fighter | null = null;
  holdT = 0;
  lastHitBy: Fighter | null = null;
  lastHitT = 0;
  buffMul = 1;
  buffT = 0;
  counterMul = 1;
  poison: { dmg: number; left: number; every: number; t: number; by: Fighter | null } | null = null;
  stunT = 0;
  landLag = 0;
  rollDir = 1;
  /** 走行中の反転（スキッド後にこの向きへ走る） */
  skidTurn = 0;
  airdodgeDir: { x: number; y: number } | null = null;
  shieldStunT = 0;
  techAt = -999;
  respawnT = 0;
  /** 撃墜数など */
  kos = 0;
  falls = 0;
  sds = 0;
  dealt = 0;
  taken = 0;
  eliminatedAt = -1;
  /** 奥義ゲージ（100 で発動可能） */
  meter = 0;
  /** 描画用 */
  flash = 0;
  walkPhase = 0;
  hudShake = 0;
  /** 武器の軌跡 (world) */
  trail: { x: number; y: number; age: number }[] = [];

  constructor(
    public readonly spec: FighterSpec,
    public readonly port: number,
    public team: number,
    public ctrl: Controller,
    public cpu: boolean,
  ) {
    this.airJumps = spec.stats.airJumps;
  }

  get stats() {
    return this.spec.stats;
  }
  get w(): number {
    return this.spec.stats.width;
  }
  /** 現在の喰らい判定の高さ */
  get h(): number {
    const H = this.spec.stats.height;
    switch (this.state) {
      case 'crouch':
        return H * 0.62;
      case 'down':
        return H * 0.34;
      case 'roll':
      case 'ledgeroll':
        return H * 0.6;
      default:
        return H;
    }
  }
  get alive(): boolean {
    return this.state !== 'dead';
  }
  get intangible(): boolean {
    return this.intang > 0 || this.respawnInv > 0 || this.state === 'dead' || this.state === 'respawn';
  }
  hurtbox(): { x: number; y: number; w: number; h: number } {
    const h = this.h;
    let y = this.y - h;
    if (this.state === 'ledge') y = this.y - this.spec.stats.height;
    return { x: this.x - this.w / 2, y, w: this.w, h };
  }
  /** 体の中心 */
  get cy(): number {
    return this.y - this.h / 2;
  }

  spawnAt(x: number, y: number, facing: 1 | -1): void {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.facing = facing;
    this.vx = this.vy = this.kbx = this.kby = 0;
    this.grounded = true;
    this.ground = 0;
    this.setState('idle');
  }

  setState(s: FState): void {
    this.state = s;
    this.t = 0;
    if (s !== 'attack') {
      this.move = null;
      this.moveKey = '';
    }
  }

  // ───────────────────────────── メインループ ─────────────────────────────

  step(m: Match): void {
    if (this.state === 'dead') {
      this.stepDead(m);
      return;
    }
    if (this.hitlag > 0) {
      this.hitlag--;
      if (this.hitlag === 0 && this.pendingLaunch) this.launch(m);
      return;
    }
    this.t++;
    if (this.intang > 0) this.intang--;
    if (this.respawnInv > 0) this.respawnInv--;
    if (this.ledgeCd > 0) this.ledgeCd--;
    if (this.dropT > 0) this.dropT--;
    if (this.flash > 0) this.flash--;
    if (this.hudShake > 0) this.hudShake--;
    if (this.buffT > 0 && --this.buffT === 0) this.buffMul = 1;
    if (this.lastHitT > 0 && --this.lastHitT === 0) this.lastHitBy = null;
    this.tickPoison(m);
    if (this.state !== 'shield' && this.state !== 'shieldstun') this.shield = Math.min(K.SHIELD_MAX, this.shield + K.SHIELD_REGEN);
    for (const p of this.trail) p.age++;
    this.trail = this.trail.filter((p) => p.age < 7);

    this.prevX = this.x;
    this.prevY = this.y;
    this.stepState(m);
    this.physics(m);
    this.checkLedge(m);
    if (this.holding) this.positionHeld();
  }

  private stepState(m: Match): void {
    const c = this.ctrl;
    const s = this.stats;
    switch (this.state) {
      case 'idle':
      case 'walk':
      case 'crouch': {
        if (this.dropCheck(m)) break;
        if (this.groundActions(m)) break;
        const sx = c.cur.x;
        if (c.cur.y > 0.6 && Math.abs(sx) < 0.6) {
          if (this.state !== 'crouch') this.setState('crouch');
          this.vx = approach(this.vx, 0, s.traction);
          break;
        }
        if (this.wantsDash()) {
          this.startDash(c.dirX);
          break;
        }
        if (Math.abs(sx) > 0.2) {
          if (this.state !== 'walk') this.setState('walk');
          this.facing = sx > 0 ? 1 : -1;
          this.vx = approach(this.vx, sx * s.walk, s.traction * 1.5);
          this.walkPhase += Math.abs(this.vx) * 0.05;
        } else {
          if (this.state !== 'idle') this.setState('idle');
          this.vx = approach(this.vx, 0, s.traction);
        }
        break;
      }
      case 'dash': {
        if (this.groundActions(m)) break;
        // ダッシュ反転（ステップ）
        if (c.dirX === -this.facing && (this.ctrl.info.digital ? c.holdX === 1 : c.flickX(1))) {
          this.startDash(c.dirX);
          break;
        }
        this.vx = approach(this.vx, this.facing * s.run, s.traction * 1.2);
        this.walkPhase += Math.abs(this.vx) * 0.05;
        if (this.t >= 11) {
          if (c.dirX === this.facing) this.setState('run');
          else {
            this.setState('skid');
            this.skidTurn = 0;
          }
        }
        break;
      }
      case 'run': {
        if (this.groundActions(m)) break;
        this.walkPhase += Math.abs(this.vx) * 0.05;
        if (c.cur.y > 0.6 && Math.abs(c.cur.x) < 0.6) {
          this.setState('crouch');
        } else if (c.dirX === this.facing) {
          this.vx = approach(this.vx, this.facing * s.run, s.traction * 1.5);
        } else {
          this.setState('skid');
          this.skidTurn = c.dirX === -this.facing ? -this.facing : 0;
        }
        break;
      }
      case 'skid': {
        if (this.jumpInput()) {
          this.startJumpsquat();
          break;
        }
        this.vx = approach(this.vx, 0, s.traction * 1.6);
        if (this.t >= 9) {
          if (this.skidTurn !== 0 && c.dirX === this.skidTurn) {
            this.facing = this.skidTurn > 0 ? 1 : -1;
            this.setState('run');
          } else this.setState('idle');
          this.skidTurn = 0;
        }
        break;
      }
      case 'jumpsquat': {
        if (c.dirY < 0 || (c.cDir && c.cDir.y < -0.5)) {
          const sm = this.smashDir();
          if (sm && sm.y < 0 && Math.abs(sm.y) >= Math.abs(sm.x)) {
            this.startMove('usmash');
            break;
          }
        }
        if (c.buffered('special') && c.dirY < 0) {
          c.consume('special');
          this.startMove('uspec');
          break;
        }
        this.vx = approach(this.vx, 0, s.traction * 0.4);
        if (this.t >= K.JUMPSQUAT) {
          const full = c.held('jump') || (this.ctrl.info.tapJump && c.cur.y < -0.5);
          this.grounded = false;
          this.ground = -1;
          this.vy = -(full ? s.jumpV : s.shortHopV);
          this.vx = clamp(this.vx, -s.airSpeed * 1.15, s.airSpeed * 1.15) + c.cur.x * 0.9;
          this.setState('air');
          m.sfx('jump', this);
          m.fx.dust(this.x, this.y, 0, 5);
        }
        break;
      }
      case 'air':
      case 'tumble':
        this.airActions(m);
        break;
      case 'helpless':
        break;
      case 'land':
        this.vx = approach(this.vx, 0, s.traction);
        if (this.t >= this.landLag) {
          this.setState('idle');
          this.groundActions(m);
        }
        break;
      case 'attack':
        this.stepMove(m);
        break;
      case 'shield':
        this.stepShield(m);
        break;
      case 'shieldstun':
        this.vx = approach(this.vx, 0, s.traction * 0.8);
        if (this.t >= this.shieldStunT) this.setState(c.held('shield') ? 'shield' : 'unshield');
        break;
      case 'unshield':
        this.vx = approach(this.vx, 0, s.traction);
        if (this.t >= 5) this.setState('idle');
        break;
      case 'dizzy':
        this.vx = approach(this.vx, 0, s.traction);
        // 連打で早く復帰
        if (c.pressed('attack') || c.pressed('special') || c.pressed('jump') || c.pressed('shield')) this.stunT -= 6;
        if (--this.stunT <= 0) this.setState('idle');
        break;
      case 'roll': {
        const f = this.t;
        if (f === 2) this.intang = Math.max(this.intang, 14);
        if (f >= 2 && f <= 16) this.vx = this.rollDir * 10.5 * (1 - (f - 2) / 22);
        else this.vx = approach(this.vx, 0, s.traction * 2);
        if (f >= 26) this.setState('idle');
        break;
      }
      case 'spotdodge':
        this.vx = 0;
        if (this.t === 2) this.intang = Math.max(this.intang, 15);
        if (this.t >= 22) this.setState('idle');
        break;
      case 'airdodge':
        this.stepAirdodge();
        break;
      case 'hurt':
        if (c.pressed('shield')) this.techAt = m.frame;
        if (this.grounded) this.vx = approach(this.vx, 0, s.traction * 0.6);
        if (--this.hitstun <= 0) {
          if (this.grounded) this.setState('idle');
          else this.setState(this.tumble ? 'tumble' : 'air');
        }
        break;
      case 'stun':
        if (this.grounded) this.vx = approach(this.vx, 0, s.traction);
        if (--this.stunT <= 0) this.setState(this.grounded ? 'idle' : 'air');
        break;
      case 'ledge':
        this.stepLedge(m);
        break;
      case 'ledgeclimb':
        if (this.t >= 24) this.finishClimb(m, 0);
        break;
      case 'ledgeroll':
        if (this.t >= 32) this.finishClimb(m, 150);
        break;
      case 'holding':
        this.stepHolding(m);
        break;
      case 'grabbed': {
        const h = this.heldBy;
        if (!h || h.holding !== this) {
          this.heldBy = null;
          this.setState(this.grounded ? 'idle' : 'air');
          break;
        }
        // レバガチャで拘束時間を減らす
        const mash =
          c.pressed('attack') || c.pressed('special') || c.pressed('jump') || c.pressed('shield') || c.pressed('grab') ||
          (c.dirX !== 0 && Math.sign(c.prev.x) !== c.dirX) || (c.dirY !== 0 && Math.sign(c.prev.y) !== c.dirY);
        if (mash) h.holdT -= 5;
        break;
      }
      case 'down':
        this.vx = approach(this.vx, 0, s.traction);
        if (this.t >= 16) {
          if (c.buffered('attack') || c.buffered('smash')) {
            c.consume('attack');
            c.consume('smash');
            this.startMove('getupAtk');
            this.intang = Math.max(this.intang, 14);
          } else if (c.dirX !== 0) {
            this.startRoll(c.dirX);
          } else if (c.buffered('jump') || c.buffered('shield') || c.dirY < 0 || this.t >= K.DOWN_MAX) {
            c.consume('jump');
            c.consume('shield');
            this.setState('getup');
            this.intang = Math.max(this.intang, 20);
          }
        }
        break;
      case 'getup':
        this.vx = approach(this.vx, 0, s.traction);
        if (this.t >= 26) this.setState('idle');
        break;
      case 'respawn':
        this.stepRespawn(m);
        break;
      case 'dead':
        break;
    }
  }

  // ───────────────────────────── 地上 ─────────────────────────────

  /** 地上で使える行動（ジャンプ・攻撃・シールドなど）。行動したら true */
  private groundActions(m: Match): boolean {
    const c = this.ctrl;
    if (this.jumpInput()) {
      this.startJumpsquat();
      return true;
    }
    if (c.buffered('grab')) {
      c.consume('grab');
      this.startMove('grab');
      return true;
    }
    if (c.held('shield')) {
      c.consume('shield');
      this.setState('shield');
      m.sfx('shield', this);
      return true;
    }
    if (c.buffered('special')) {
      c.consume('special');
      if (this.startSpecial()) return true;
    }
    const sm = this.smashDir();
    if (sm) {
      this.startSmash(sm);
      return true;
    }
    if (c.buffered('attack')) {
      c.consume('attack');
      this.startGroundAttack();
      return true;
    }
    return false;
  }

  /** すり抜け床の上で下を押したら少し待ってから落ちる（下強攻撃の猶予） */
  private dropCheck(m: Match): boolean {
    const c = this.ctrl;
    if (this.ground <= 0) {
      this.dropWait = 0;
      return false;
    }
    if (this.dropWait > 0) {
      if (c.buffered('attack') || c.buffered('special') || c.buffered('smash') || c.cur.y < 0.5) {
        this.dropWait = 0;
        return false;
      }
      if (--this.dropWait === 0) {
        this.leaveGround(m);
        this.dropT = 14;
        this.y += 2;
        this.vy = 1.5;
        return true;
      }
      return false;
    }
    if (c.downPressed()) this.dropWait = 3;
    return false;
  }

  private wantsDash(): boolean {
    const c = this.ctrl;
    if (c.dirX === 0) return false;
    if (c.info.digital) return c.holdX >= 3;
    return c.flickX(2) && Math.abs(c.cur.x) > 0.75;
  }

  private startDash(dir: number): void {
    this.facing = dir > 0 ? 1 : -1;
    this.setState('dash');
    this.vx = this.facing * this.stats.dashInit;
  }

  private jumpInput(): boolean {
    const c = this.ctrl;
    if (c.buffered('jump')) {
      c.consume('jump');
      return true;
    }
    if (c.info.tapJump && c.flickY(1) && c.flickDirY < 0 && c.cur.y < -0.7) {
      c.flickYAge = 99;
      return true;
    }
    return false;
  }

  private startJumpsquat(): void {
    this.setState('jumpsquat');
  }

  /** スマッシュ入力（スマッシュボタン / Cスティック / はじき+攻撃）の方向 */
  private smashDir(): { x: number; y: number } | null {
    const c = this.ctrl;
    if (c.cDir) {
      this.chargeSrc = 'cstick';
      const d = c.cDir;
      c.cDir = null;
      return d;
    }
    if (c.buffered('smash')) {
      c.consume('smash');
      this.chargeSrc = 'smash';
      return { x: c.dirX || this.facing, y: c.dirY };
    }
    if (c.info.flickSmash && c.buffered('attack') && (c.flickX(4) || c.flickY(4))) {
      c.consume('attack');
      this.chargeSrc = 'attack';
      return { x: c.flickX(4) ? c.flickDirX : 0, y: c.flickY(4) ? c.flickDirY : 0 };
    }
    return null;
  }

  private startSmash(d: { x: number; y: number }): void {
    if (Math.abs(d.y) > Math.abs(d.x) && d.y !== 0) {
      this.startMove(d.y < 0 ? 'usmash' : 'dsmash');
    } else {
      if (d.x !== 0) this.facing = d.x > 0 ? 1 : -1;
      this.startMove('fsmash');
    }
  }

  private startGroundAttack(): void {
    const c = this.ctrl;
    if ((this.state === 'dash' || this.state === 'run') && Math.abs(this.vx) > this.stats.walk * 0.8) {
      this.startMove('dashAtk');
      return;
    }
    if (c.dirY < 0 && Math.abs(c.cur.y) >= Math.abs(c.cur.x) * 0.8) this.startMove('utilt');
    else if (c.dirY > 0 && Math.abs(c.cur.y) >= Math.abs(c.cur.x) * 0.8) this.startMove('dtilt');
    else if (c.dirX !== 0) {
      this.facing = c.dirX > 0 ? 1 : -1;
      this.startMove('ftilt');
    } else this.startMove('jab1');
  }

  private startSpecial(): boolean {
    const c = this.ctrl;
    let slot: MoveSlot = 'nspec';
    const ax = Math.abs(c.cur.x);
    const ay = Math.abs(c.cur.y);
    if (c.dirY < 0 && ay >= ax * 0.8) slot = 'uspec';
    else if (c.dirY > 0 && ay >= ax * 0.8) slot = 'dspec';
    else if (c.dirX !== 0) slot = 'sspec';
    if (slot === 'nspec' && this.meter >= 100 && this.spec.extra.final) {
      this.meter = 0;
      this.startMove('final');
      return true;
    }
    const mv = this.spec.moves[slot];
    if (!this.grounded && mv.airLimit) {
      if (this.airUsed.has(slot)) return false;
      this.airUsed.add(slot);
    }
    if (slot === 'sspec') this.facing = c.dirX > 0 ? 1 : -1;
    this.chargeSrc = 'special';
    this.startMove(slot);
    return true;
  }

  // ───────────────────────────── 空中 ─────────────────────────────

  private airActions(m: Match): void {
    const c = this.ctrl;
    const s = this.stats;
    if (this.jumpInput()) {
      if (this.airJumps > 0) {
        this.airJumps--;
        this.vy = -s.airJumpV;
        this.vx = c.cur.x * s.airSpeed;
        this.fastFall = false;
        this.setState('air');
        this.t = 1;
        m.sfx('doubleJump', this);
        m.fx.ring(this.x, this.y - 4, 26, this.spec.look.aura, 14);
        return;
      }
    }
    if (c.buffered('shield') && !this.airDodged) {
      c.consume('shield');
      this.startAirdodge();
      return;
    }
    if (c.buffered('special')) {
      c.consume('special');
      if (this.startSpecial()) return;
    }
    const cd = c.cDir;
    if (cd || c.buffered('attack') || c.buffered('smash')) {
      c.consume('attack');
      c.consume('smash');
      c.cDir = null;
      this.startAerial(cd);
      return;
    }
    if (c.downPressed() && this.vy + this.kby > -1) this.fastFall = true;
  }

  private startAerial(cd: { x: number; y: number } | null): void {
    const c = this.ctrl;
    const dx = cd ? cd.x : c.cur.x;
    const dy = cd ? cd.y : c.cur.y;
    let slot: MoveSlot = 'nair';
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 0.5) slot = dy < 0 ? 'uair' : 'dair';
    else if (Math.abs(dx) > 0.5) slot = Math.sign(dx) === this.facing ? 'fair' : 'bair';
    this.startMove(slot);
  }

  private startAirdodge(): void {
    const c = this.ctrl;
    this.airDodged = true;
    this.fastFall = false;
    this.setState('airdodge');
    const mag = Math.hypot(c.cur.x, c.cur.y);
    if (mag > 0.5) {
      const d = { x: c.cur.x / mag, y: c.cur.y / mag };
      this.airdodgeDir = d;
      this.vx = d.x * 12;
      this.vy = d.y * 12;
    } else {
      this.airdodgeDir = null;
    }
    this.intang = Math.max(this.intang, this.airdodgeDir ? 17 : 25);
  }

  private stepAirdodge(): void {
    if (this.airdodgeDir) {
      if (this.t < 14) {
        this.vx *= 0.88;
        this.vy *= 0.88;
      }
      if (this.t >= 32) this.setState('air');
    } else if (this.t >= 34) this.setState('air');
  }

  // ───────────────────────────── ワザ ─────────────────────────────

  startMove(key: string): void {
    const mv = (this.spec.moves as Record<string, MoveDef | undefined>)[key] ?? this.spec.extra[key];
    if (!mv) return;
    if (mv.groundAlt && this.grounded && this.spec.extra[mv.groundAlt]) {
      this.startMove(mv.groundAlt);
      return;
    }
    if (mv.random && mv.random.length > 0) {
      const pick = mv.random[Math.floor(Math.random() * mv.random.length)];
      if (pick !== key) {
        this.startMove(pick);
        return;
      }
    }
    this.state = 'attack';
    this.t = 0;
    this.move = mv;
    this.moveKey = key;
    this.mf = 0;
    this.charge = 0;
    this.chargeMul = 1;
    this.moveHits.clear();
    this.trail = [];
    if (mv.turn && this.ctrl.dirX === -this.facing) this.facing = this.facing === 1 ? -1 : 1;
    if (mv.stall && !this.grounded) {
      this.vy = Math.min(this.vy, 0) * 0.3;
      this.fastFall = false;
    }
    if (this.grounded && mv.keepVx !== undefined) this.vx *= mv.keepVx;
    if (mv.selfDmg) this.damage = Math.min(K.MAX_DAMAGE, this.damage + mv.selfDmg);
    if (!AERIALS.has(key)) this.fastFall = false;
    this.hooks?.onMoveStart(this);
    this.runFrameEvents();
  }

  /** match 側のフック（効果音・エフェクト）。Match が設定する */
  hooks: { onMoveStart(f: Fighter): void; onMoveFrame(f: Fighter): void } | null = null;

  private chargeHeld(): boolean {
    const c = this.ctrl;
    switch (this.chargeSrc) {
      case 'smash':
        return c.held('smash');
      case 'attack':
        return c.held('attack');
      case 'special':
        return c.held('special');
      case 'cstick':
        return Math.hypot(c.cur.cx, c.cur.cy) > 0.5;
    }
  }

  private stepMove(m: Match): void {
    const mv = this.move;
    if (!mv) {
      this.setState(this.grounded ? 'idle' : 'air');
      return;
    }
    const c = this.ctrl;
    // 弱攻撃の連携
    if ((this.moveKey === 'jab1' && this.mf >= 5) || (this.moveKey === 'jab2' && this.mf >= 6)) {
      if (c.buffered('attack') && c.dirX === 0 && c.dirY === 0) {
        c.consume('attack');
        this.startMove(this.moveKey === 'jab1' ? 'jab2' : 'jab3');
        return;
      }
    }
    // スマッシュホールド
    if (mv.charge && this.mf === mv.charge.at && this.charge < mv.charge.max && this.chargeHeld()) {
      this.charge++;
      this.chargeMul = 1 + 0.4 * (this.charge / mv.charge.max);
      if (this.charge % 8 === 0) this.flash = 3;
      if (this.grounded) this.vx = approach(this.vx, 0, this.stats.traction);
      return;
    }
    this.mf++;
    if (this.mf >= mv.frames) {
      this.endMove();
      return;
    }
    this.runFrameEvents();
    // 投げ・つかみ打撃は持っている相手に直接当てる
    if (this.holding && THROWS.has(this.moveKey)) {
      const hb = mv.hitboxes[0];
      if (hb && this.mf === hb.f0) m.throwHit(this, this.holding, hb, this.moveKey !== 'pummel');
    }
    if (this.grounded) {
      this.vx = approach(this.vx, 0, this.stats.traction * 0.7);
    } else if (mv.drift) {
      this.vx = approach(this.vx, c.cur.x * this.stats.airSpeed * mv.drift, this.stats.airAccel);
    }
    if (!this.grounded && AERIALS.has(this.moveKey) && c.downPressed() && this.vy > -1) this.fastFall = true;
  }

  /** 現在の mf で起きること（移動・飛び道具・テレポート等） */
  private runFrameEvents(): void {
    const mv = this.move;
    if (!mv) return;
    const f = this.mf;
    if (mv.impulses) {
      for (const im of mv.impulses) {
        if (im.f !== f) continue;
        if (im.airOnly && this.grounded) continue;
        if (im.set) {
          if (im.vx !== undefined) this.vx = im.vx * this.facing;
          if (im.vy !== undefined) this.vy = im.vy;
        } else {
          if (im.vx !== undefined) this.vx += im.vx * this.facing;
          if (im.vy !== undefined) this.vy += im.vy;
        }
        if (im.steer) {
          this.vx += this.ctrl.cur.x * im.steer;
          if (this.vy < 0) this.vy += Math.min(0, this.ctrl.cur.y) * im.steer * 0.5;
        }
        if (im.vy !== undefined && im.vy < 0) {
          this.grounded = false;
          this.ground = -1;
          this.fastFall = false;
        }
      }
    }
    if (mv.invuln && mv.invuln[0] === f) this.intang = Math.max(this.intang, mv.invuln[1] - mv.invuln[0]);
    if (mv.teleport && mv.teleport.f === f) {
      const c = this.ctrl;
      let dx = c.cur.x;
      let dy = c.cur.y;
      const mag = Math.hypot(dx, dy);
      if (mag < 0.3) {
        dx = 0;
        dy = -1;
      } else {
        dx /= mag;
        dy /= mag;
      }
      if (this.grounded && dy > 0) dy = 0;
      this.x += dx * mv.teleport.dist;
      this.y += dy * mv.teleport.dist;
      if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
      this.grounded = false;
      this.ground = -1;
      this.vx = dx * 3;
      this.vy = dy * 3;
      this.prevX = this.x;
      this.prevY = this.y - 1;
    }
    if (mv.heal && f === 12) this.damage = Math.max(0, this.damage - mv.heal);
    if (mv.buff && f === 12) {
      this.buffMul = mv.buff.mult;
      this.buffT = mv.buff.frames;
      this.flash = 10;
    }
    this.hooks?.onMoveFrame(this);
  }

  endMove(): void {
    const mv = this.move;
    const key = this.moveKey;
    this.move = null;
    this.moveKey = '';
    this.charge = 0;
    this.chargeMul = 1;
    this.counterMul = 1;
    if (this.holding && key === 'pummel') {
      this.setState('holding');
      this.t = 8;
      return;
    }
    if (this.grounded) this.setState('idle');
    else this.setState(mv?.helpless ? 'helpless' : 'air');
  }

  activeHitboxes(): ActiveHitbox[] {
    if (this.state !== 'attack' || !this.move || THROWS.has(this.moveKey)) return [];
    const out: ActiveHitbox[] = [];
    for (const hb of this.move.hitboxes) {
      if (hb.f0 <= this.mf && this.mf < hb.f1) out.push({ hb, x: this.x + hb.x * this.facing, y: this.y + hb.y, r: hb.r });
    }
    return out;
  }

  counterActive(): boolean {
    const mv = this.move;
    return this.state === 'attack' && !!mv?.counter && this.mf >= mv.counter.f0 && this.mf < mv.counter.f1;
  }

  armorAgainst(kb: number): boolean {
    const a = this.move?.armor;
    return this.state === 'attack' && !!a && this.mf >= a.f0 && this.mf < a.f1 && kb < a.threshold;
  }

  reflectBox(): { x: number; y: number; r: number } | null {
    const rf = this.move?.reflect;
    if (this.state !== 'attack' || !rf || this.mf < rf.f0 || this.mf >= rf.f1) return null;
    return { x: this.x + rf.x * this.facing, y: this.y + rf.y, r: rf.r };
  }

  // ───────────────────────────── 防御 ─────────────────────────────

  private stepShield(m: Match): void {
    const c = this.ctrl;
    this.vx = approach(this.vx, 0, this.stats.traction);
    this.shield -= K.SHIELD_DECAY;
    if (this.shield <= 0) {
      this.breakShield(m);
      return;
    }
    if (this.jumpInput()) {
      this.startJumpsquat();
      return;
    }
    if (c.buffered('attack') || c.buffered('grab')) {
      c.consume('attack');
      c.consume('grab');
      this.startMove('grab');
      return;
    }
    if (c.buffered('special') && c.dirY < 0) {
      c.consume('special');
      this.startMove('uspec');
      return;
    }
    if (c.dirY < 0 || (c.cDir && c.cDir.y < -0.5)) {
      const sm = this.smashDir();
      if (sm && sm.y < 0) {
        this.startMove('usmash');
        return;
      }
    }
    const xEdge = c.info.digital ? c.dirX !== 0 && Math.sign(c.prev.x) !== c.dirX : c.flickX(2);
    if (xEdge && c.dirX !== 0) {
      this.startRoll(c.dirX);
      return;
    }
    if (c.downPressed()) {
      this.setState('spotdodge');
      m.sfx('dodge', this);
      return;
    }
    if (!c.held('shield') && this.t >= 4) this.setState('unshield');
  }

  private startRoll(dir: number): void {
    this.rollDir = dir > 0 ? 1 : -1;
    this.facing = this.rollDir === 1 ? -1 : 1;
    this.setState('roll');
  }

  breakShield(m: Match): void {
    this.shield = K.SHIELD_MAX * 0.4;
    this.setState('dizzy');
    this.stunT = K.SHIELD_BREAK_STUN;
    this.vy = -9;
    this.grounded = false;
    this.ground = -1;
    m.sfx('shieldBreak', this);
    m.fx.burst(this.x, this.cy, this.spec.look.aura, 26);
  }

  // ───────────────────────────── 崖 ─────────────────────────────

  private checkLedge(m: Match): void {
    if (this.grounded || this.ledgeCd > 0 || this.state === 'ledge') return;
    const st = this.state;
    const mv = this.move;
    const recovering = st === 'attack' && mv?.ledgeGrab !== undefined && this.mf >= mv.ledgeGrab;
    if (!(st === 'air' || st === 'tumble' || st === 'helpless' || recovering)) return;
    if (!recovering && this.vy + this.kby < -1) return;
    const auto = st === 'helpless' || recovering;
    const H = this.stats.height;
    for (const L of m.ledges) {
      if (!auto && this.facing !== -L.side) continue;
      const hx = L.x + L.side * (this.w / 2 + 2);
      const handY = this.y - H * 0.85;
      if (Math.abs(this.x - hx) < 46 && handY > L.y - 30 && handY < L.y + 44) {
        this.grabLedge(m, L);
        return;
      }
    }
  }

  private grabLedge(m: Match, L: Ledge): void {
    for (const o of m.fighters) {
      if (o !== this && o.ledge === L && o.state === 'ledge') o.trumped(L);
    }
    this.ledge = L;
    this.facing = L.side === 1 ? -1 : 1;
    this.setState('ledge');
    this.vx = this.vy = this.kbx = this.kby = 0;
    this.fastFall = false;
    this.x = L.x + L.side * (this.w / 2 + 2);
    this.y = L.y + this.stats.height * 0.8;
    this.airJumps = this.stats.airJumps;
    this.airDodged = false;
    this.airUsed.clear();
    if (this.ledgeFresh) {
      this.intang = Math.max(this.intang, K.LEDGE_INVULN);
      this.ledgeFresh = false;
    }
    this.ledgeT = 0;
    m.sfx('ledge', this);
  }

  trumped(L: Ledge): void {
    this.ledge = null;
    this.setState('hurt');
    this.hitstun = 16;
    this.tumble = false;
    this.vx = L.side * 3;
    this.vy = -3;
    this.intang = 0;
    this.ledgeCd = K.LEDGE_REGRAB;
  }

  private stepLedge(m: Match): void {
    const L = this.ledge;
    if (!L) {
      this.setState('air');
      return;
    }
    const c = this.ctrl;
    this.ledgeT++;
    this.x = L.x + L.side * (this.w / 2 + 2);
    this.y = L.y + this.stats.height * 0.8;
    if (this.t < 8) return;
    const toward = -L.side;
    if (this.ledgeT > K.LEDGE_MAX_HANG) {
      this.dropLedge();
      return;
    }
    if (this.jumpInput()) {
      this.ledge = null;
      this.setState('air');
      this.y = L.y - 4;
      this.x = L.x + L.side * (this.w / 2 - 6);
      this.vy = -this.stats.jumpV * 1.02;
      this.vx = toward * 1.5;
      this.intang = Math.max(this.intang, 5);
      this.ledgeCd = 12;
      m.sfx('jump', this);
      return;
    }
    if (c.buffered('attack') || c.buffered('smash') || c.buffered('special')) {
      c.consume('attack');
      c.consume('smash');
      c.consume('special');
      this.placeOnStage(m, 0);
      this.startMove('getupAtk');
      this.intang = Math.max(this.intang, 14);
      return;
    }
    if (c.buffered('shield')) {
      c.consume('shield');
      this.setState('ledgeroll');
      this.intang = Math.max(this.intang, 28);
      return;
    }
    if (this.t >= 10 && (c.dirY < 0 || c.dirX === toward)) {
      this.setState('ledgeclimb');
      this.intang = Math.max(this.intang, 22);
      return;
    }
    if (c.dirY > 0 || c.dirX === L.side) this.dropLedge();
  }

  private dropLedge(): void {
    const L = this.ledge;
    this.ledge = null;
    this.setState('air');
    this.vy = 1;
    this.ledgeCd = K.LEDGE_REGRAB;
    if (L) this.x = L.x + L.side * (this.w / 2 + 4);
  }

  private placeOnStage(m: Match, inward: number): void {
    const L = this.ledge;
    if (!L) return;
    this.ledge = null;
    this.x = L.x - L.side * (this.w / 2 + 6 + inward);
    this.y = L.y;
    this.prevY = this.y;
    this.grounded = true;
    this.ground = 0;
    this.vx = this.vy = 0;
    this.facing = L.side === 1 ? -1 : 1;
    void m;
  }

  private finishClimb(m: Match, inward: number): void {
    this.placeOnStage(m, inward);
    this.setState('idle');
  }

  // ───────────────────────────── つかみ ─────────────────────────────

  private stepHolding(m: Match): void {
    const tgt = this.holding;
    const c = this.ctrl;
    this.vx = approach(this.vx, 0, this.stats.traction);
    if (!tgt || tgt.heldBy !== this || tgt.state !== 'grabbed') {
      this.holding = null;
      this.setState('idle');
      return;
    }
    this.holdT--;
    if (this.holdT <= 0) {
      this.releaseHold(m);
      return;
    }
    if (this.t < 6) return;
    if (c.buffered('attack') || c.buffered('grab')) {
      c.consume('attack');
      c.consume('grab');
      this.startMove('pummel');
      return;
    }
    if (c.dirX === this.facing) this.startMove('fthrow');
    else if (c.dirX === -this.facing) this.startMove('bthrow');
    else if (c.dirY < 0) this.startMove('uthrow');
    else if (c.dirY > 0) this.startMove('dthrow');
  }

  /** つかみ成立 */
  grabbed(target: Fighter, m: Match): void {
    this.holding = target;
    this.setState('holding');
    this.holdT = 80 + target.damage * 0.9;
    target.heldBy = this;
    target.setState('grabbed');
    target.vx = target.vy = target.kbx = target.kby = 0;
    target.grounded = this.grounded;
    target.ground = this.ground;
    target.fastFall = false;
    this.positionHeld();
    m.sfx('grab', this);
  }

  positionHeld(): void {
    const tgt = this.holding;
    if (!tgt || tgt.state !== 'grabbed') return;
    tgt.x = this.x + this.facing * (this.w / 2 + tgt.w / 2 - 14);
    tgt.y = this.y;
    tgt.prevY = tgt.y;
    tgt.facing = this.facing === 1 ? -1 : 1;
    tgt.grounded = this.grounded;
    tgt.ground = this.ground;
  }

  releaseHold(m: Match): void {
    const tgt = this.holding;
    this.holding = null;
    if (this.state === 'holding' || (this.state === 'attack' && THROWS.has(this.moveKey))) this.setState(this.grounded ? 'idle' : 'air');
    this.vx = -this.facing * 4;
    if (tgt && tgt.heldBy === this) {
      tgt.heldBy = null;
      tgt.setState(tgt.grounded ? 'land' : 'air');
      tgt.landLag = 14;
      tgt.vx = this.facing * 6;
      if (!tgt.grounded) tgt.vy = -4;
    }
    void m;
  }

  // ───────────────────────────── 被弾 ─────────────────────────────

  /** 吹っ飛ばし（ヒットストップ明けに DI を反映して発射） */
  launch(m: Match): void {
    const p = this.pendingLaunch;
    this.pendingLaunch = null;
    if (!p) return;
    let a = Math.atan2(p.ly, p.lx);
    // ずらし: 吹っ飛び方向に垂直なスティック成分で角度を変える
    const sx = this.ctrl.cur.x;
    const sy = this.ctrl.cur.y;
    const px = -Math.sin(a);
    const py = Math.cos(a);
    const comp = clamp(sx * px + sy * py, -1, 1);
    if (p.speed > 4) a += comp * K.DI_MAX * DEG;
    this.kbx = Math.cos(a) * p.speed;
    this.kby = Math.sin(a) * p.speed;
    if (this.grounded && this.kby < -0.5) {
      this.grounded = false;
      this.ground = -1;
    }
    if (this.grounded) {
      // 地上で横に飛ばされた場合は滑らせる
      this.vx = this.kbx;
      this.kbx = 0;
      this.kby = 0;
    }
    void m;
  }

  /** 着地 */
  land(m: Match, y: number, ground: number): void {
    const impact = this.vy + this.kby;
    this.y = y;
    this.grounded = true;
    this.ground = ground;
    this.vy = 0;
    this.kby = 0;
    this.vx += this.kbx * 0.4;
    this.kbx = 0;
    this.airJumps = this.stats.airJumps;
    this.fastFall = false;
    this.airDodged = false;
    this.airUsed.clear();
    this.ledgeFresh = true;
    switch (this.state) {
      case 'attack': {
        const mv = this.move;
        if (!mv) break;
        if (mv.onLand) {
          this.startMove(mv.onLand);
          break;
        }
        if (AERIALS.has(this.moveKey)) {
          const first = mv.hitboxes.length ? Math.min(...mv.hitboxes.map((h) => h.f0)) : 0;
          const ac = mv.autoCancel !== undefined && (this.mf >= mv.autoCancel || this.mf < first);
          this.landLag = ac ? 3 : (mv.landLag ?? 8);
          this.setState('land');
          m.fx.dust(this.x, y, 0, 3);
        } else if (mv.landCancel) {
          this.landLag = mv.landLag ?? 10;
          this.setState('land');
        }
        // それ以外（空中で出した飛び道具など）はそのまま続行
        break;
      }
      case 'helpless':
        this.landLag = K.HELPLESS_LAND_LAG;
        this.setState('land');
        break;
      case 'airdodge':
        this.landLag = K.AIRDODGE_LAND_LAG;
        this.setState('land');
        break;
      case 'hurt':
      case 'tumble':
        if (this.state === 'hurt' && !this.tumble) break;
        if (m.frame - this.techAt <= K.TECH_WINDOW) {
          // 受け身
          this.techAt = -999;
          const d = this.ctrl.dirX;
          if (d !== 0) this.startRoll(d);
          else {
            this.setState('getup');
            this.intang = Math.max(this.intang, 20);
          }
          m.fx.ring(this.x, this.y - 10, 36, '#ffffff', 12);
          m.sfx('dodge', this);
        } else if (impact > 9 && this.state === 'hurt') {
          // 地面でバウンド
          this.grounded = false;
          this.ground = -1;
          this.vy = -impact * 0.45;
          this.y = y - 1;
          m.fx.dust(this.x, y, 0, 10);
        } else {
          this.setState('down');
          m.fx.dust(this.x, y, 0, 8);
          m.sfx('land', this);
        }
        break;
      case 'air':
        this.landLag = K.LAND_LAG;
        this.setState('land');
        m.fx.dust(this.x, y, 0, 3);
        break;
      case 'dizzy':
      case 'stun':
      case 'grabbed':
        break;
      default:
        break;
    }
  }

  leaveGround(m: Match): void {
    this.grounded = false;
    this.ground = -1;
    this.dropWait = 0;
    switch (this.state) {
      case 'attack':
      case 'hurt':
      case 'stun':
      case 'dizzy':
      case 'airdodge':
        break;
      case 'holding':
        this.releaseHold(m);
        this.setState('air');
        break;
      default:
        this.setState('air');
    }
  }

  private tickPoison(m: Match): void {
    const p = this.poison;
    if (!p) return;
    if (++p.t >= p.every) {
      p.t = 0;
      this.damage = Math.min(K.MAX_DAMAGE, this.damage + p.dmg);
      this.taken += p.dmg;
      if (p.by) p.by.dealt += p.dmg;
      this.hudShake = 6;
      m.fx.poisonPuff(this.x, this.cy);
      if (--p.left <= 0) this.poison = null;
    }
  }

  // ───────────────────────────── 物理 ─────────────────────────────

  private physics(m: Match): void {
    if (LOCKED.has(this.state)) return;
    const s = this.stats;
    if (!this.grounded) {
      const mv = this.state === 'attack' ? this.move : null;
      let g = s.gravity * (mv?.gravity ?? 1);
      if (this.state === 'airdodge' && this.airdodgeDir && this.t < 16) g = 0;
      const cap = this.fastFall ? s.fastFall : (mv?.fallCap ?? s.maxFall);
      if (this.fastFall && this.vy >= 0) this.vy = Math.max(this.vy, s.fastFall);
      else this.vy = Math.min(this.vy + g, cap);
      if (DRIFT.has(this.state) && !(this.state === 'attack' && mv?.drift !== undefined)) {
        const mul = this.state === 'helpless' ? 0.65 : 1;
        const sx = this.ctrl.cur.x;
        if (Math.abs(sx) > 0.1) this.vx = approach(this.vx, sx * s.airSpeed * mul, s.airAccel * mul);
        else this.vx = approach(this.vx, 0, s.airFriction);
      }
    }
    // 吹っ飛び速度の減衰
    if (this.kbx !== 0 || this.kby !== 0) {
      const sp = Math.hypot(this.kbx, this.kby);
      const ns = Math.max(0, sp - K.LAUNCH_DECAY);
      if (ns === 0) {
        this.kbx = 0;
        this.kby = 0;
      } else {
        this.kbx *= ns / sp;
        this.kby *= ns / sp;
      }
    }
    this.x += this.vx + this.kbx;
    this.y += this.vy + this.kby;
    this.collide(m);
  }

  private collide(m: Match): void {
    const main = m.stage.main;
    const w2 = this.w / 2;
    const H = this.stats.height;
    if (this.grounded) {
      if (this.ground === 0) {
        if (this.x < main.x1 || this.x > main.x2) {
          if (EDGE_STOP.has(this.state) || (this.state === 'attack' && this.moveKey === 'getupAtk')) {
            this.x = clamp(this.x, main.x1, main.x2);
            this.vx = 0;
          } else this.leaveGround(m);
        } else this.y = main.y;
      } else {
        const ps = m.plats[this.ground - 1];
        if (!ps) {
          this.leaveGround(m);
          return;
        }
        this.x += ps.dx;
        this.y = ps.y;
        if (this.x < ps.x1 || this.x > ps.x2) {
          if (EDGE_STOP.has(this.state)) {
            this.x = clamp(this.x, ps.x1, ps.x2);
            this.vx = 0;
          } else this.leaveGround(m);
        }
      }
      if (this.grounded) return;
    }
    const vyTot = this.vy + this.kby;
    // メイン足場の上面
    if (vyTot >= 0 && this.prevY <= main.y + 0.5 && this.y >= main.y && this.x >= main.x1 && this.x <= main.x2) {
      this.land(m, main.y, 0);
      return;
    }
    // メイン足場の側面・底面
    if (this.x > main.x1 - w2 && this.x < main.x2 + w2 && this.y > main.y && this.y - H < main.y + main.depth) {
      const fromBelow = this.prevY - H >= main.y + main.depth - 2 && this.prevX > main.x1 - w2 && this.prevX < main.x2 + w2;
      if (fromBelow) {
        this.y = main.y + main.depth + H;
        if (this.vy < 0) this.vy = 0;
        if (this.kby < 0) this.kby = -this.kby * 0.4;
      } else if (this.prevX <= (main.x1 + main.x2) / 2) {
        this.x = main.x1 - w2;
        if (this.vx > 0) this.vx = 0;
        if (this.kbx > 0) this.kbx = -this.kbx * 0.5;
      } else {
        this.x = main.x2 + w2;
        if (this.vx < 0) this.vx = 0;
        if (this.kbx < 0) this.kbx = -this.kbx * 0.5;
      }
    }
    // すり抜け床
    const passDown = this.ctrl.cur.y > 0.75 && this.state !== 'hurt' && this.state !== 'tumble';
    if (this.dropT === 0 && vyTot >= 0 && !passDown) {
      for (let i = 0; i < m.plats.length; i++) {
        const ps = m.plats[i];
        if (this.x < ps.x1 || this.x > ps.x2) continue;
        if (this.prevY <= ps.y - ps.dy + 0.5 && this.y >= ps.y) {
          this.land(m, ps.y, i + 1);
          return;
        }
      }
    }
  }

  // ───────────────────────────── 撃墜・復活 ─────────────────────────────

  ko(m: Match): void {
    this.stocks--;
    this.falls++;
    const killer = this.lastHitBy;
    if (killer && killer !== this) killer.kos++;
    else this.sds++;
    if (this.holding) this.releaseHold(m);
    if (this.heldBy) this.heldBy.releaseHold(m);
    this.setState('dead');
    this.respawnT = K.RESPAWN_DELAY;
    this.vx = this.vy = this.kbx = this.kby = 0;
    this.poison = null;
    this.lastHitBy = null;
    this.ledge = null;
    this.buffMul = 1;
    this.buffT = 0;
    this.pendingLaunch = null;
    this.hitlag = 0;
    this.meter = Math.max(0, this.meter - 20);
    if (this.stocks <= 0) this.eliminatedAt = m.frame;
  }

  private stepDead(m: Match): void {
    if (this.stocks <= 0) return;
    if (--this.respawnT > 0) return;
    const r = m.stage.respawn;
    const offset = (this.port % 2 === 0 ? -1 : 1) * (this.port >= 2 ? 90 : 30);
    this.x = this.prevX = r.x + offset;
    this.y = this.prevY = r.y;
    this.damage = 0;
    this.shield = K.SHIELD_MAX;
    this.facing = this.x < 0 ? 1 : -1;
    this.grounded = false;
    this.ground = -1;
    this.setState('respawn');
    this.respawnInv = K.RESPAWN_WAIT + K.RESPAWN_INVULN;
    m.sfx('respawn', this);
  }

  private stepRespawn(m: Match): void {
    const c = this.ctrl;
    const acted =
      c.dirX !== 0 || c.dirY !== 0 || c.pressed('attack') || c.pressed('special') || c.pressed('jump') || c.pressed('shield');
    if (acted || this.t >= K.RESPAWN_WAIT) {
      this.setState('air');
      this.respawnInv = K.RESPAWN_INVULN;
      this.vy = 0;
      this.airJumps = this.stats.airJumps;
      void m;
    }
  }
}
