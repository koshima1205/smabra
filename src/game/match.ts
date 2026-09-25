import { circleRect, clamp, DEG } from '../core/math';
import { Camera } from './camera';
import { hitlagFrames, knockback, predictKo } from './combat';
import * as K from './constants';
import { Effects, FX_COLOR } from './effects';
import type { Fighter } from './fighter';
import { Projectile } from './projectile';
import { ledgesOf, platformAt, type Ledge, type PlatformState } from './stage';
import type { Effect, HitboxBase, MatchRules, ProjectileDef, SpawnDef, StageDef } from './types';

export interface MatchEvents {
  sfx?(name: string, pan: number): void;
  hit?(strength: number, fx: Effect, pan: number): void;
  element?(fx: Effect, pan: number): void;
  ko?(f: Fighter): void;
  countdown?(n: number): void;
}

export type HitResult = 'miss' | 'hit' | 'shielded' | 'countered' | 'armored' | 'stunned';

export type Phase = 'intro' | 'play' | 'end' | 'done';

/** CPU など、毎F コントローラ入力を作るもの */
export interface Brain {
  think(m: Match, self: Fighter): void;
}

export class Match {
  frame = 0;
  phase: Phase = 'intro';
  introT = 150;
  endT = 0;
  /** 残り時間（F）。無制限なら -1 */
  timeLeft: number;
  projectiles: Projectile[] = [];
  fx = new Effects();
  camera = new Camera();
  plats: PlatformState[] = [];
  ledges: Ledge[];
  winner: Fighter | null = null;
  /** スローモーション残りF（呼び出し側が更新頻度を落とす） */
  slowmo = 0;
  private lastPunch = -999;
  brains = new Map<Fighter, Brain>();
  /** 撃墜演出メッセージなど */
  banner: { text: string; t: number; color: string } | null = null;
  /** 奥義の発動演出（この間は発動者以外が止まる） */
  cinematic: { f: Fighter; t: number; max: number; name: string } | null = null;

  constructor(
    public stage: StageDef,
    public rules: MatchRules,
    public fighters: Fighter[],
    public events: MatchEvents = {},
  ) {
    this.ledges = ledgesOf(stage);
    this.timeLeft = rules.time > 0 ? rules.time * 60 : -1;
    this.plats = stage.platforms.map((p) => platformAt(p, 0));
    fighters.forEach((f, i) => {
      const sp = stage.spawns[i % stage.spawns.length];
      f.spawnAt(sp.x, sp.y, sp.x < 0 ? 1 : -1);
      f.stocks = rules.stocks;
      f.hooks = this;
    });
    this.camera.snap(stage);
  }

  // ───────────── Fighter からのフック ─────────────

  onMoveStart(f: Fighter): void {
    const mv = f.move;
    if (!mv) return;
    if (mv.final) {
      const hit0 = mv.hitboxes[0]?.f0 ?? 40;
      this.cinematic = { f, t: hit0, max: hit0, name: mv.name };
      this.camera.punch = 1.4;
      this.camera.punchX = f.x;
      this.camera.punchY = f.cy;
      this.sfx('charge', f);
      return;
    }
    if (f.moveKey === 'nspec' || f.moveKey === 'sspec' || f.moveKey === 'uspec' || f.moveKey === 'dspec') {
      if (mv.fx && mv.fx !== 'normal') this.events.element?.(mv.fx, this.pan(f));
    }
  }

  onMoveFrame(f: Fighter): void {
    const mv = f.move;
    if (!mv) return;
    const first = mv.hitboxes.find((h) => !h.grab);
    if (mv.final && first && f.mf === first.f0) {
      const c = FX_COLOR[mv.fx ?? 'light'];
      this.fx.ring(f.x, f.cy, first.r * 0.9, c.main, 40);
      this.fx.ring(f.x, f.cy, first.r * 0.5, c.hot, 30);
      this.fx.burst(f.x, f.cy, c.main, 48);
      for (let i = 0; i < 3; i++) this.fx.spark(f.x + (Math.random() - 0.5) * first.r, f.cy + (Math.random() - 0.5) * first.r * 0.6, 1, mv.fx ?? 'light', Math.random() * 6.28);
      this.fx.screenFlash = 10;
      this.fx.screenFlashColor = c.hot;
      this.camera.shake(28, 30);
      this.sfx('explosion', f);
      this.events.element?.(mv.fx ?? 'light', this.pan(f));
    }
    if (first && f.mf === first.f0) {
      const heavy = f.moveKey.endsWith('smash') || first.dmg >= 13;
      this.sfx(heavy ? 'swingHeavy' : 'swing', f);
    }
    if (mv.sfx) for (const s of mv.sfx) if (s.f === f.mf) this.sfx(s.name, f);
    if (mv.spawns) for (const s of mv.spawns) if (s.f === f.mf) this.spawn(f, s);
    if (mv.teleport && mv.teleport.f === f.mf) {
      this.fx.burst(f.x, f.cy, f.spec.look.aura, 14);
      this.sfx('teleport', f);
    }
    if (mv.heal && f.mf === 12) {
      this.fx.ring(f.x, f.cy, 50, '#b8ffcf', 24);
      this.sfx('heal', f);
    }
    if (mv.buff && f.mf === 12) {
      this.fx.ring(f.x, f.cy, 60, f.spec.look.aura, 26);
      this.sfx('charge', f);
    }
  }

  // ───────────── メインループ ─────────────

  step(): void {
    this.frame++;
    this.plats = this.stage.platforms.map((p) => platformAt(p, this.frame));
    for (const f of this.fighters) {
      const b = this.brains.get(f);
      if (b && f.alive) b.think(this, f);
      f.ctrl.update();
    }
    if (this.phase === 'intro') {
      const before = Math.ceil(this.introT / 50);
      this.introT--;
      const after = Math.ceil(this.introT / 50);
      if (after !== before && after > 0) this.events.countdown?.(after);
      for (const f of this.fighters) {
        f.t++;
        f.ctrl.clearBuffers();
      }
      if (this.introT <= 0) {
        this.phase = 'play';
        this.events.countdown?.(0);
      }
    } else if (this.cinematic) {
      // 奥義の溜め: 発動者だけ動く
      this.cinematic.f.step(this);
      if (--this.cinematic.t <= 0 || this.cinematic.f.move?.final !== true) this.cinematic = null;
    } else if (this.phase !== 'done') {
      for (const f of this.fighters) f.step(this);
      for (const p of this.projectiles) if (!p.dead) p.step(this);
      this.resolveHits();
      this.projectiles = this.projectiles.filter((p) => !p.dead);
      this.checkBlast();
      if (this.phase === 'play') {
        if (this.timeLeft > 0) {
          this.timeLeft--;
          if (this.timeLeft === 0) this.finish();
        }
        this.checkEnd();
      } else if (this.phase === 'end') {
        if (--this.endT <= 0) this.phase = 'done';
      }
    }
    if (this.banner && --this.banner.t <= 0) this.banner = null;
    this.fx.step();
    const targets = this.fighters
      .filter((f) => f.alive)
      .map((f) => ({ x: f.x, y: f.y, h: f.stats.height }));
    this.camera.follow(targets, this.stage);
  }

  // ───────────── 飛び道具 ─────────────

  spawn(owner: Fighter, s: SpawnDef): void {
    const d = s.proj;
    if (d.maxAlive) {
      const mine = this.projectiles.filter((p) => p.owner === owner && p.def === d && !p.dead);
      if (mine.length >= d.maxAlive) mine[0].kill(this, false);
    }
    const face = owner.facing;
    const angles = s.spread ?? [null];
    for (const a of angles) {
      let vx = d.vx;
      let vy = d.vy;
      if (a !== null) {
        const sp = Math.hypot(d.vx, d.vy);
        vx = Math.cos(-a * DEG) * sp;
        vy = Math.sin(-a * DEG) * sp;
      }
      if (s.aim) {
        const sy = owner.ctrl.cur.y;
        if (Math.abs(sy) > 0.4) {
          const sp = Math.hypot(vx, vy);
          const ang = Math.atan2(vy, vx) + clamp(sy, -1, 1) * 0.6;
          vx = Math.cos(ang) * sp;
          vy = Math.sin(ang) * sp;
        }
      }
      const p = new Projectile(owner, d, face, owner.x + d.x * face, owner.y + d.y, vx * face, vy);
      p.mult = owner.chargeMul;
      this.projectiles.push(p);
    }
  }

  explode(p: Projectile): void {
    const e = p.def.explode;
    if (!e) return;
    const def: ProjectileDef = {
      draw: 'ring',
      fx: p.def.fx,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 6,
      r: e.r,
      hit: e.hit,
      pierce: true,
      reflectable: false,
    };
    const ex = new Projectile(p.owner, def, p.face, p.x, p.y, 0, 0);
    ex.settled = true;
    this.projectiles.push(ex);
    const c = FX_COLOR[p.def.fx];
    this.fx.spark(p.x, p.y, 0.7, p.def.fx, -Math.PI / 2);
    this.fx.ring(p.x, p.y, e.r, c.main, 16);
    this.camera.shake(6);
    this.sfx('explosion', p.owner, p.x);
  }

  // ───────────── 当たり判定 ─────────────

  private enemies(a: Fighter, b: Fighter): boolean {
    return a !== b && a.team !== b.team;
  }

  private resolveHits(): void {
    // 近接攻撃
    for (const a of this.fighters) {
      if (a.hitlag > 0 || !a.alive) continue;
      const boxes = a.activeHitboxes();
      if (boxes.length === 0) continue;
      let stop = false;
      for (const b of boxes) {
        if (stop) break;
        for (const t of this.fighters) {
          if (!this.enemies(a, t) || !t.alive) continue;
          if (t.heldBy === a) continue;
          const key = `${t.port}:${b.hb.group ?? 0}`;
          const last = a.moveHits.get(key);
          if (last !== undefined && !(b.hb.rehit && a.mf - last >= b.hb.rehit)) continue;
          const hb = t.hurtbox();
          if (!circleRect(b.x, b.y, b.r, hb.x, hb.y, hb.w, hb.h)) continue;
          if (b.hb.grab) {
            if (t.intangible || a.holding || t.heldBy || t.state === 'ledge' || t.state === 'holding' || a.state !== 'attack') continue;
            a.moveHits.set(key, a.mf);
            a.grabbed(t, this);
            stop = true;
            break;
          }
          const res = this.applyHit(a, t, b.hb, b.x, b.y, a.facing, a.chargeMul * a.counterMul, null);
          if (res !== 'miss') a.moveHits.set(key, a.mf);
          if (res === 'countered') {
            stop = true;
            break;
          }
        }
      }
    }
    // 飛び道具
    for (const p of this.projectiles) {
      if (p.dead) continue;
      let reflected = false;
      if (p.def.reflectable !== false && !p.def.follow) {
        for (const t of this.fighters) {
          if (t.team === p.team || !t.alive) continue;
          const rb = t.reflectBox();
          if (rb && (p.x - rb.x) ** 2 + (p.y - rb.y) ** 2 < (rb.r + p.r) ** 2) {
            p.owner = t;
            p.vx = -p.vx * 1.15;
            p.vy = -p.vy * 0.5;
            p.face = p.face === 1 ? -1 : 1;
            p.hits.clear();
            p.life = Math.max(p.life, 70);
            p.settled = false;
            this.fx.ring(p.x, p.y, 40, '#ffffff', 12);
            this.sfx('counter', t);
            reflected = true;
            break;
          }
        }
      }
      if (reflected) continue;
      for (const t of this.fighters) {
        if (t.team === p.team || !t.alive) continue;
        const last = p.hits.get(t.port);
        if (last !== undefined && !(p.def.rehit && p.age - last >= p.def.rehit)) continue;
        const hb = t.hurtbox();
        if (!circleRect(p.x, p.y, p.r, hb.x, hb.y, hb.w, hb.h)) continue;
        if (t.intangible) continue;
        if (p.def.trap && p.def.explode) {
          p.kill(this, true);
          break;
        }
        const face: 1 | -1 = p.def.follow ? (t.x >= p.x ? 1 : -1) : p.vx > 0.5 ? 1 : p.vx < -0.5 ? -1 : p.face;
        const res = this.applyHit(p.owner, t, p.def.hit, p.x, p.y, face, p.mult, p);
        if (res === 'miss') continue;
        p.hits.set(t.port, p.age);
        if (p.def.tether && res === 'hit') {
          t.stunT = 0;
        }
        if (!p.def.pierce || res === 'countered') {
          p.kill(this, true);
          break;
        }
      }
    }
  }

  /** ヒット処理本体 */
  applyHit(
    att: Fighter,
    t: Fighter,
    hb: HitboxBase,
    hx: number,
    hy: number,
    face: 1 | -1,
    mult: number,
    proj: Projectile | null,
  ): HitResult {
    if (t.intangible) return 'miss';
    // カウンター
    if (t.counterActive() && t.move?.counter) {
      const ct = t.move.counter;
      t.counterMul = clamp(1 + (hb.dmg * mult * ct.mult) / 12, 1.2, 2.8);
      if (ct.behind && !proj) {
        t.x = att.x - att.facing * (att.w / 2 + t.w / 2 + 8);
        t.y = att.y;
        t.facing = att.facing;
        t.grounded = att.grounded;
        t.ground = att.ground;
      } else {
        t.facing = att.x >= t.x ? 1 : -1;
      }
      const cm = t.counterMul;
      t.startMove(ct.then);
      t.counterMul = cm;
      t.intang = Math.max(t.intang, 12);
      if (!proj) att.hitlag = 16;
      this.fx.burst(t.x, t.cy, '#ffffff', 18);
      this.fx.text(t.x, t.y - t.stats.height - 20, 'カウンター！', '#ffe36b');
      this.sfx('counter', t);
      this.camera.shake(6);
      return 'countered';
    }
    // 掴まれている相手を第三者が攻撃したら離す
    if (t.heldBy && t.heldBy !== att) t.heldBy.releaseHold(this);
    const dmgBase = hb.dmg * mult;
    // シールド
    if ((t.state === 'shield' || t.state === 'shieldstun') && !hb.wind) {
      t.shield -= (dmgBase * 1.2 + (hb.sdmg ?? 0)) * (proj ? 0.8 : 1);
      const lag = Math.floor(hitlagFrames(dmgBase, hb) * 0.7);
      if (!proj) att.hitlag = lag;
      t.hitlag = lag;
      if (t.shield <= 0) t.breakShield(this);
      else {
        t.setState('shieldstun');
        t.shieldStunT = Math.floor(dmgBase * 0.75 + 3);
        t.vx = face * Math.min(7, 1 + dmgBase * 0.35);
      }
      this.fx.spark((hx + t.x) / 2, (hy + t.cy) / 2, 0.2, 'light', 0);
      this.sfx('shieldHit', t);
      return 'shielded';
    }
    // 風判定
    if (hb.wind) {
      const push = hb.bkb * 0.06;
      t.kbx += face * push;
      if (!t.grounded) t.kby = Math.min(t.kby, 0) - push * 0.15;
      return 'hit';
    }
    const dmg = dmgBase * att.buffMul;
    if (!att.move?.final) att.meter = Math.min(100, att.meter + dmg * 0.4);
    t.meter = Math.min(100, t.meter + dmg * 0.22);
    t.damage = Math.min(K.MAX_DAMAGE, t.damage + dmg);
    t.taken += dmg;
    att.dealt += dmg;
    t.hudShake = Math.min(24, 6 + dmg);
    t.flash = 4;
    t.lastHitBy = att;
    t.lastHitT = 600;
    if (hb.poison) t.poison = { dmg: hb.poison.dmg, left: hb.poison.ticks, every: hb.poison.every, t: 0, by: att };
    if (t.holding) t.releaseHold(this);

    let kb = hb.setKb !== undefined ? hb.setKb : knockback(t.damage, dmg, t.stats.weight, hb.bkb, hb.kbg);
    if (t.state === 'crouch') kb *= 0.85;
    const lag = hitlagFrames(dmg, hb);
    if (!proj) att.hitlag = lag;
    const fx = hb.fx ?? 'normal';
    const pan = this.pan(t);
    const sx = (hx + t.x) / 2;
    const sy = clamp(hy, t.y - t.h, t.y);

    // 影縫い（硬直）
    if (hb.stun) {
      t.hitlag = lag;
      t.move = null;
      t.setState('stun');
      t.stunT = hb.stun + Math.floor(t.damage * 0.15);
      t.vx = 0;
      t.vy = Math.min(t.vy, 0) * 0.2;
      t.kbx = t.kby = 0;
      this.fx.spark(sx, sy, 0.4, fx, 0);
      this.events.hit?.(0.4, fx, pan);
      return 'stunned';
    }
    // スーパーアーマー
    if (t.armorAgainst(kb)) {
      t.hitlag = lag;
      this.fx.spark(sx, sy, 0.3, 'metal', 0);
      this.events.hit?.(0.3, 'metal', pan);
      return 'armored';
    }

    let ang = hb.ang;
    if (ang === 361) ang = t.grounded && kb < 60 ? 0 : 42;
    let dx = face;
    if (hb.dir === 'away') dx = t.x >= hx ? 1 : -1;
    let lx = Math.cos(ang * DEG) * dx;
    let ly = -Math.sin(ang * DEG);
    if (hb.link) {
      // 攻撃者の少し先へ引き寄せて多段をつなぐ
      const tx = att.x + att.vx * 4 + att.facing * 10;
      const ty = att.cy + att.vy * 4;
      const ddx = tx - t.x;
      const ddy = ty - t.cy;
      const d = Math.hypot(ddx, ddy) || 1;
      lx = ddx / d;
      ly = ddy / d;
      kb = hb.setKb ?? Math.min(60, 18 + d * 0.8);
    }
    if (t.grounded && ly > 0.1) ly = -ly * 0.75;

    const wasLedge = t.state === 'ledge';
    t.move = null;
    t.moveKey = '';
    t.ledge = null;
    t.setState('hurt');
    t.hitstun = Math.max(1, Math.floor(kb * K.HITSTUN_MUL));
    t.tumble = kb >= K.TUMBLE_KB;
    t.vx = 0;
    t.vy = 0;
    t.kbx = 0;
    t.kby = 0;
    t.fastFall = false;
    t.stunT = 0;
    if (wasLedge) {
      t.grounded = false;
      t.ground = -1;
      t.ledgeCd = K.LEDGE_REGRAB;
    }
    t.pendingLaunch = { lx, ly, speed: kb * K.LAUNCH_MUL };
    t.hitlag = lag;

    const strength = clamp(kb / 170, 0, 1);
    this.fx.spark(sx, sy, strength, fx, Math.atan2(ly, lx));
    if (kb > 70) this.camera.shake(Math.min(22, kb / 14), 14);
    this.events.hit?.(strength, fx, pan);

    // 決定打の演出
    if (
      kb > 120 &&
      t.stocks >= 1 &&
      this.frame - this.lastPunch > 200 &&
      predictKo(t.x, t.cy, lx, ly, kb * K.LAUNCH_MUL, t.stats.gravity, t.stats.maxFall, this.stage.blast)
    ) {
      this.lastPunch = this.frame;
      this.camera.punch = 1;
      this.camera.punchX = t.x;
      this.camera.punchY = t.cy;
      this.slowmo = 26;
      this.fx.screenFlash = 5;
      this.fx.screenFlashColor = FX_COLOR[fx].hot;
      t.hitlag = Math.max(t.hitlag, 16);
      if (!proj) att.hitlag = Math.max(att.hitlag, 16);
    }
    return 'hit';
  }

  /** 投げ・つかみ打撃 */
  throwHit(att: Fighter, t: Fighter, hb: HitboxBase, release: boolean): void {
    if (t.heldBy !== att) return;
    if (!release) {
      t.damage = Math.min(K.MAX_DAMAGE, t.damage + hb.dmg);
      t.taken += hb.dmg;
      att.dealt += hb.dmg;
      t.hudShake = 6;
      t.flash = 3;
      att.hitlag = t.hitlag = 5;
      this.fx.spark(t.x, t.cy, 0.15, hb.fx ?? 'normal', 0);
      this.events.hit?.(0.15, hb.fx ?? 'normal', this.pan(t));
      return;
    }
    att.holding = null;
    t.heldBy = null;
    t.setState('hurt');
    const saved = t.intang;
    t.intang = 0;
    t.respawnInv = 0;
    this.applyHit(att, t, hb, t.x, t.cy, att.facing, 1, null);
    t.intang = saved;
    this.sfx('throw', att);
  }

  // ───────────── 撃墜・勝敗 ─────────────

  private checkBlast(): void {
    const b = this.stage.blast;
    for (const f of this.fighters) {
      if (!f.alive || f.state === 'respawn') continue;
      const out = f.x < b.l || f.x > b.r || f.y > b.b || f.y < b.t;
      if (!out) continue;
      const cx = clamp(f.x, b.l + 30, b.r - 30);
      const cy = clamp(f.y - f.h / 2, b.t + 30, b.b - 30);
      const ang = Math.atan2(f.y - this.camera.y, f.x - this.camera.x);
      this.fx.blast(cx, cy, ang, f.spec.look.aura);
      this.camera.shake(20, 24);
      this.sfx('ko', f);
      f.ko(this);
      this.events.ko?.(f);
    }
  }

  private teamsAlive(): number[] {
    const teams = new Set<number>();
    for (const f of this.fighters) if (f.stocks > 0) teams.add(f.team);
    return [...teams];
  }

  private checkEnd(): void {
    const teams = this.teamsAlive();
    if (teams.length <= 1) this.finish();
  }

  private finish(): void {
    if (this.phase !== 'play') return;
    this.phase = 'end';
    this.endT = 150;
    this.slowmo = Math.max(this.slowmo, 40);
    const ranking = this.ranking();
    this.winner = ranking[0] ?? null;
    this.sfx('gameSet', null);
    this.banner = { text: 'GAME SET', t: 150, color: '#fff3c4' };
  }

  /** 順位（1位から） */
  ranking(): Fighter[] {
    const score = (f: Fighter) => {
      if (this.timeLeft === 0) return (f.kos - f.falls) * 1000 - f.damage;
      // ストック制: 残った人 > 後に脱落した人
      return f.stocks > 0 ? 1e9 + f.stocks * 1e6 - f.damage : f.eliminatedAt;
    };
    return [...this.fighters].sort((a, b) => score(b) - score(a));
  }

  // ───────────── サウンド ─────────────

  pan(f: Fighter | null, x?: number): number {
    const px = x ?? f?.x ?? this.camera.x;
    return clamp((px - this.camera.x) / 900, -1, 1);
  }

  sfx(name: string, f: Fighter | null, x?: number): void {
    this.events.sfx?.(name, this.pan(f, x));
  }
}
