import * as THREE from 'three';
import { clamp, lerp } from '../core/math';
import type { Fighter } from '../game/fighter';
import type { Match } from '../game/match';
import { platformAt } from '../game/stage';
import type { StageDef } from '../game/types';
import { poseFor } from '../render/rig';
import { Ribbon3D } from './ribbon';
import { Trail3D } from './trail';
import type { BuildCharacter, BuildStage, CharacterModel, CnpId, ModelPose, Quality, StageInstance } from './types';
import { createRenderer, syncCamera } from './view';

/** カメラの方へ少し振り向かせる角度 */
const YAW = 0.36;
/** 奥義のとき発動者だけを描き直すレイヤー */
const STAR = 1;

export interface WorldDeps {
  buildStage: BuildStage;
  buildCharacter: BuildCharacter;
}

interface FighterView {
  f: Fighter;
  model: CharacterModel;
  scarves: Ribbon3D[];
  trail: Trail3D;
  blob: THREE.Mesh;
  blobMat: THREE.MeshBasicMaterial;
  pose: ModelPose;
  lastTime: number;
  lastX: number;
  lastY: number;
  wasAlive: boolean;
  star: boolean;
}

interface StageEntry {
  inst: StageInstance;
  dir: THREE.Vector3;
}

const HURT = new Set(['hurt', 'tumble', 'dizzy', 'grabbed', 'stun']);

function newPose(): ModelPose {
  return { torso: 0, head: 0, fsh: 0, fel: 0, bsh: 0, bel: 0, fhip: 0, fkn: 0, bhip: 0, bkn: 0, spin: 0, squash: 1, y: 0, time: 0, air: false, run: 0, expression: 'normal' };
}

/** ファイターの状態 → モデルの姿勢（2D 版と同じ姿勢ライブラリを使う） */
export function poseOf(f: Fighter, time: number, out: ModelPose): ModelPose {
  const p = poseFor(f, time);
  out.torso = p.torso;
  out.head = p.head;
  out.fsh = p.fsh;
  out.fel = p.fel;
  out.bsh = p.bsh;
  out.bel = p.bel;
  out.fhip = p.fhip;
  out.fkn = p.fkn;
  out.bhip = p.bhip;
  out.bkn = p.bkn;
  out.spin = p.spin;
  out.squash = p.squash;
  out.y = p.y;
  out.time = time;
  out.air = !f.grounded;
  out.run = clamp(Math.abs(f.vx) / Math.max(1, f.stats.run), 0, 1);
  const blink = Math.floor((time + f.port * 37) / 6) % 40 === 0;
  out.expression = HURT.has(f.state) ? 'hurt' : f.state === 'attack' ? 'attack' : blink ? 'blink' : 'normal';
  return out;
}

const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/**
 * 3D の対戦画面。ゲームの状態（Match）をそのまま three.js のシーンに写す。
 * ステージ・キャラのモデルは deps から作る（ステージは作ったものを使い回す）。
 */
export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 10, 20000);
  /** 影（重い端末では切る） */
  shadows = true;
  private readonly stages = new Map<string, StageEntry>();
  private stage: StageEntry | null = null;
  private match: Match | null = null;
  private readonly views = new Map<Fighter, FighterView>();
  private readonly actors = new THREE.Group();
  private readonly dimScene = new THREE.Scene();
  private readonly dimCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly dimMat: THREE.MeshBasicMaterial;
  private readonly blobGeo: THREE.CircleGeometry;
  private readonly tmp = new THREE.Vector3();
  private w = 1;
  private h = 1;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly deps: WorldDeps,
    readonly quality: Quality = 'high',
  ) {
    this.renderer = createRenderer({ canvas, antialias: quality === 'high' });
    this.scene.add(this.actors);
    this.dimMat = new THREE.MeshBasicMaterial({ color: 0x05030c, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    this.dimScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.dimMat));
    this.blobGeo = new THREE.CircleGeometry(1, 24);
    this.blobGeo.rotateX(-Math.PI / 2);
  }

  setSize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
  }

  /** ステージを切り替える（一度作ったものは使い回す） */
  private useStage(def: StageDef): StageEntry {
    let e = this.stages.get(def.id);
    if (!e) {
      const inst = this.deps.buildStage(def, { quality: this.quality });
      inst.group.traverse((o) => {
        if ((o as THREE.Light).isLight) o.layers.enable(STAR);
      });
      const sun = inst.sun;
      const dir = new THREE.Vector3().subVectors(sun.position, sun.target.position);
      if (dir.lengthSq() < 1e-6) dir.set(0.4, 1, 0.6);
      dir.normalize();
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 1.2;
      if (!sun.target.parent) inst.group.add(sun.target);
      e = { inst, dir };
      this.stages.set(def.id, e);
    }
    if (this.stage !== e) {
      if (this.stage) this.scene.remove(this.stage.inst.group);
      this.scene.add(e.inst.group);
      this.scene.background = e.inst.background;
      this.scene.fog = e.inst.fog;
      this.stage = e;
    }
    return e;
  }

  private useMatch(m: Match): void {
    const keep = new Set(m.fighters);
    for (const [f, v] of this.views) {
      if (keep.has(f)) continue;
      this.disposeView(v);
      this.views.delete(f);
    }
    this.match = m;
  }

  private viewOf(f: Fighter, m: Match): FighterView {
    let v = this.views.get(f);
    if (v) return v;
    // 同じキャラが複数いるときは色違い
    let variant = 0;
    for (const o of m.fighters) {
      if (o === f) break;
      if (o.spec.id === f.spec.id) variant++;
    }
    const model = this.deps.buildCharacter(f.spec.id as CnpId, { variant, quality: this.quality });
    const scarves = model.scarves.map((s) => new Ribbon3D(s.color, s.width, s.length));
    const trail = new Trail3D(f.spec.look.trail, 18 * f.stats.scale);
    const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
    const blob = new THREE.Mesh(this.blobGeo, blobMat);
    blob.renderOrder = 1;
    this.actors.add(model.root, trail.mesh, blob, ...scarves.map((s) => s.mesh));
    v = { f, model, scarves, trail, blob, blobMat, pose: newPose(), lastTime: -1, lastX: f.x, lastY: f.y, wasAlive: false, star: false };
    this.views.set(f, v);
    return v;
  }

  private disposeView(v: FighterView): void {
    this.actors.remove(v.model.root, v.trail.mesh, v.blob, ...v.scarves.map((s) => s.mesh));
    v.model.dispose();
    v.trail.dispose();
    v.blobMat.dispose();
    for (const s of v.scarves) s.dispose();
  }

  private setStar(v: FighterView, on: boolean): void {
    if (v.star === on) return;
    v.star = on;
    const objs: THREE.Object3D[] = [v.model.root, v.trail.mesh, ...v.scarves.map((s) => s.mesh)];
    for (const o of objs)
      o.traverse((c) => {
        if (on) c.layers.enable(STAR);
        else c.layers.disable(STAR);
      });
  }

  private updateFighter(v: FighterView, m: Match, time: number): void {
    const f = v.f;
    const model = v.model;
    const root = model.root;
    const visible = f.alive;
    root.visible = visible;
    v.trail.mesh.visible = visible;
    for (const s of v.scarves) s.mesh.visible = visible;
    if (!visible) {
      v.blob.visible = false;
      v.wasAlive = false;
      v.trail.clear();
      return;
    }
    let wx = f.x;
    let wy = f.y;
    if (f.hitlag > 0 && (f.state === 'hurt' || f.state === 'stun')) wx += (Math.floor(time) % 2 ? 1 : -1) * 3.5;
    if ((f.state === 'ledgeclimb' || f.state === 'ledgeroll') && f.ledge) {
      const L = f.ledge;
      const k = clamp(f.t / (f.state === 'ledgeclimb' ? 24 : 32), 0, 1);
      const tx = L.x - L.side * (f.w / 2 + 6 + (f.state === 'ledgeroll' ? (150 * Math.max(0, k - 0.4)) / 0.6 : 0));
      wx = lerp(f.x, tx, Math.min(1, k * 1.4));
      wy = lerp(f.y, L.y, Math.min(1, k * 1.6));
    }
    const face = f.facing;
    // 奥義: 巨大化してから元に戻る
    let s = 1;
    if (f.state === 'attack' && f.move?.final) {
      const n = f.move.frames;
      s = 1 + 1.15 * smooth(f.mf / 16) * (1 - smooth((f.mf - (n - 18)) / 18));
    }
    root.position.set(wx, -wy, 0);
    root.scale.set(face * s, s, s);
    const lying = f.state === 'down' || f.state === 'getup';
    root.rotation.set(0, -face * (lying ? YAW * 0.5 : YAW), 0);
    model.pose(poseOf(f, time, v.pose));

    // 被弾フラッシュ・溜め・無敵の点滅
    const charge = f.state === 'attack' && f.charge > 0 ? 0.25 + 0.2 * Math.sin(time * 0.6) : 0;
    model.setFlash(f.flash > 0 ? 0.85 : charge);
    let alpha = 1;
    if (f.state === 'attack' && f.move?.final) alpha = 1;
    else if (f.state === 'attack' && f.move?.teleport && f.intang > 0) alpha = 0.18;
    else if (f.intang > 0 && f.state !== 'ledge') alpha = 0.6 + 0.25 * Math.sin(time * 0.9);
    if (f.respawnInv > 0 && f.state !== 'respawn') alpha = Math.floor(time / 4) % 2 ? 0.45 : 0.9;
    model.setOpacity(alpha);

    if (v.lastTime !== time) {
      root.updateMatrixWorld(true);
      const jump = !v.wasAlive || Math.hypot(f.x - v.lastX, f.y - v.lastY) > 240;
      model.scarves.forEach((sc, i) => {
        const a = sc.anchor.getWorldPosition(this.tmp);
        if (jump) v.scarves[i].reset(a.x, a.y, a.z);
        v.scarves[i].step(a.x, a.y, a.z, face, time);
      });
      const mv = f.move;
      const active = f.state === 'attack' && !!mv?.trail && f.mf >= mv.trail[0] && f.mf <= mv.trail[1];
      if (jump) v.trail.clear();
      v.trail.step(active ? model.tip(this.tmp) : null);
      v.lastTime = time;
      v.lastX = f.x;
      v.lastY = f.y;
    }
    v.wasAlive = true;

    // 足元の丸い影（リアルタイムの影を切っているとき）
    v.blob.visible = false;
    if (!(this.shadows && this.quality === 'high')) {
      let top = Infinity;
      const st = m.stage;
      if (wx >= st.main.x1 && wx <= st.main.x2 && wy <= st.main.y + 2) top = st.main.y;
      for (const p of st.platforms) {
        const ps = platformAt(p, m.frame);
        if (wx >= ps.x1 && wx <= ps.x2 && wy <= ps.y + 2 && ps.y < top) top = ps.y;
      }
      if (Number.isFinite(top)) {
        const k = clamp(1 - (top - wy) / 520, 0.25, 1);
        v.blob.visible = true;
        v.blob.position.set(wx, -top + 0.6, 0);
        v.blob.scale.set(f.w * 0.62 * k, 1, 22 * k);
        v.blobMat.opacity = 0.34 * k;
      }
    }
  }

  private fitShadow(e: StageEntry, cx: number, cy: number, zoom: number): void {
    const sun = e.inst.sun;
    const on = this.shadows && this.quality === 'high';
    this.renderer.shadowMap.enabled = on;
    sun.castShadow = on;
    if (!on) return;
    const half = Math.max(this.w, this.h) / (2 * zoom);
    const ext = clamp(half * 1.15, 500, 2600);
    sun.target.position.set(cx, cy, 0);
    sun.position.copy(e.dir).multiplyScalar(4000).add(sun.target.position);
    const sc = sun.shadow.camera;
    sc.left = -ext;
    sc.right = ext;
    sc.top = ext;
    sc.bottom = -ext;
    sc.near = 100;
    sc.far = 9000;
    sc.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
  }

  /** 対戦画面を描く（m.camera は呼び出し側で resize 済み） */
  render(m: Match, time: number): void {
    const e = this.useStage(m.stage);
    if (m !== this.match) this.useMatch(m);
    const v2 = m.camera.view();
    syncCamera(this.camera, v2, this.w, this.h);
    e.inst.update(m.frame, v2.x, -v2.y);
    const star = m.cinematic?.f ?? null;
    for (const f of m.fighters) {
      const v = this.viewOf(f, m);
      this.updateFighter(v, m, time);
      this.setStar(v, f === star);
    }
    this.fitShadow(e, v2.x, -v2.y, v2.zoom);
    const r = this.renderer;
    r.autoClear = true;
    r.render(this.scene, this.camera);
    if (star && m.cinematic) {
      // 奥義: 周りを暗くして発動者だけを照らす
      const c = m.cinematic;
      this.dimMat.opacity = Math.min(0.72, (c.max - c.t) / 12);
      r.autoClear = false;
      r.render(this.dimScene, this.dimCam);
      r.clearDepth();
      const bg = this.scene.background;
      this.scene.background = null;
      this.camera.layers.set(STAR);
      r.render(this.scene, this.camera);
      this.camera.layers.set(0);
      this.scene.background = bg;
      r.autoClear = true;
    }
  }

  /** 何も映さない（背景色で塗る） */
  clear(color = 0x0b0a14): void {
    this.renderer.setClearColor(color, 1);
    this.renderer.clear();
  }

  dispose(): void {
    for (const v of this.views.values()) this.disposeView(v);
    this.views.clear();
    for (const e of this.stages.values()) e.inst.dispose();
    this.stages.clear();
    this.blobGeo.dispose();
    this.dimMat.dispose();
    this.renderer.dispose();
  }
}

let current: World3D | null = null;

/** ゲーム全体で使う 3D 描画（WebGL が使えない環境では null） */
export function getWorld(): World3D | null {
  return current;
}

export function setWorld(w: World3D | null): void {
  current = w;
}
