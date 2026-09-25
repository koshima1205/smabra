/**
 * ステージ共通の部品。
 * - Kit: 作った geometry / material / texture を覚えておき dispose でまとめて捨てる。update の登録。
 * - Batch: 静的な部品を頂点カラー付きで 1 メッシュに結合する（ドローコール削減）。輪郭（反転ハル）も同時に作る。
 * - 空（ワールド空間のグラデーション板）、光、粒子（Points のシェーダー）、発光板、足場の配置など。
 *
 * 座標は three のワールド（y 上・z 手前）。カメラは回転しないので +z を向いた板は常に正面を向く。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../../core/math';
import { platformAt } from '../../game/stage';
import type { Platform, StageDef } from '../../game/types';
import { outlineMat, toonMat, type ToonOpts } from '../toon';
import type { Quality, StageInstance } from '../types';

export { Rng };

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 標準の輪郭色（キャラと同じ） */
export const INK = 0x1b1726;

export type Updater = (frame: number, camX: number, camY: number) => void;

// ─────────────────────────────────────────────────────────────
// Kit: 資源管理
// ─────────────────────────────────────────────────────────────

export class Kit {
  readonly group = new THREE.Group();
  readonly high: boolean;
  private readonly geos = new Set<THREE.BufferGeometry>();
  private readonly mats = new Set<THREE.Material>();
  private readonly texs = new Set<THREE.Texture>();
  /** toon.ts の共有マテリアル（キャラも使うので捨てない） */
  private readonly shared = new Set<THREE.Material>();
  private readonly ups: Updater[] = [];
  private glowT: THREE.Texture | null = null;

  constructor(
    readonly quality: Quality,
    readonly stage: StageDef,
  ) {
    this.high = quality === 'high';
    this.group.name = `stage:${stage.id}`;
  }

  geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.add(g);
    return g;
  }
  mat<T extends THREE.Material>(m: T): T {
    this.mats.add(m);
    return m;
  }
  tex<T extends THREE.Texture>(t: T): T {
    this.texs.add(t);
    return t;
  }

  toon(color: THREE.ColorRepresentation, o: ToonOpts = {}): THREE.MeshToonMaterial {
    return this.mat(toonMat(color, o));
  }
  /** 頂点カラーで塗るトゥーン（Batch 用） */
  vtoon(o: ToonOpts = {}): THREE.MeshToonMaterial {
    const m = toonMat(0xffffff, o);
    m.vertexColors = true;
    return this.mat(m);
  }
  /** 頂点カラーで塗る発光（ライティングなし） */
  vbasic(o: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
    return this.mat(new THREE.MeshBasicMaterial({ vertexColors: true, ...o }));
  }
  basic(o: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
    return this.mat(new THREE.MeshBasicMaterial(o));
  }
  outline(color: THREE.ColorRepresentation = INK): THREE.MeshBasicMaterial {
    const m = outlineMat(color);
    this.shared.add(m);
    return m;
  }

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = this.group): THREE.Mesh {
    this.geo(geo);
    const m = new THREE.Mesh(geo, mat);
    parent.add(m);
    return m;
  }

  onUpdate(fn: Updater): void {
    this.ups.push(fn);
  }

  /** 柔らかい光の玉（白。色はマテリアル側で付ける） */
  glowTex(): THREE.Texture {
    if (!this.glowT) {
      this.glowT = canvasTex(this, 128, 128, (g) => {
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.16, 'rgba(255,255,255,0.62)');
        gr.addColorStop(0.42, 'rgba(255,255,255,0.2)');
        gr.addColorStop(0.72, 'rgba(255,255,255,0.05)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 128, 128);
      });
    }
    return this.glowT;
  }

  finish(o: { sun: THREE.DirectionalLight; background: THREE.Color | THREE.Texture; fog: THREE.Fog | THREE.FogExp2 | null }): StageInstance {
    const ups = this.ups;
    let alive = true;
    return {
      group: this.group,
      background: o.background,
      fog: o.fog,
      sun: o.sun,
      update: (frame, camX, camY) => {
        if (!alive) return;
        for (let i = 0; i < ups.length; i++) ups[i](frame, camX, camY);
      },
      dispose: () => {
        if (!alive) return;
        alive = false;
        // 登録漏れも拾う（ジオメトリはステージ専用）
        this.group.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.geometry) this.geos.add(m.geometry);
          const mm = m.material;
          if (mm) for (const x of Array.isArray(mm) ? mm : [mm]) if (!this.shared.has(x)) this.mats.add(x);
        });
        for (const g of this.geos) g.dispose();
        for (const m of this.mats) if (!this.shared.has(m)) m.dispose();
        for (const t of this.texs) t.dispose();
        this.geos.clear();
        this.mats.clear();
        this.texs.clear();
        this.ups.length = 0;
        this.group.removeFromParent();
        this.group.clear();
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────
// 変換
// ─────────────────────────────────────────────────────────────

const _o = new THREE.Object3D();
/** 位置・回転（XYZ）・拡大から行列を作る（組み立て時専用） */
export function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  _o.position.set(x, y, z);
  _o.rotation.set(rx, ry, rz);
  _o.scale.set(sx, sy, sz);
  _o.updateMatrix();
  return _o.matrix.clone();
}

// ─────────────────────────────────────────────────────────────
// Batch: 頂点カラーで結合する静的メッシュ
// ─────────────────────────────────────────────────────────────

export type ColorFn = (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void;
export type Paint = THREE.ColorRepresentation | ColorFn;

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();

/** 結合できる形にそろえる: position / normal（/ uv）だけ・index あり */
function prep(g: THREE.BufferGeometry, m: THREE.Matrix4 | null, uv: boolean): THREE.BufferGeometry {
  if (m) g.applyMatrix4(m);
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && !(uv && name === 'uv')) g.deleteAttribute(name);
  }
  g.morphAttributes = {};
  g.clearGroups();
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const n = g.getAttribute('position').count;
  if (uv && !g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.index) {
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return g;
}

function paintGeo(g: THREE.BufferGeometry, paint: Paint): void {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  if (typeof paint === 'function') {
    for (let i = 0; i < n; i++) {
      _p.fromBufferAttribute(pos, i);
      _n.fromBufferAttribute(nor, i);
      _c.setRGB(1, 1, 1);
      paint(_p, _n, _c);
      arr[i * 3] = _c.r;
      arr[i * 3 + 1] = _c.g;
      arr[i * 3 + 2] = _c.b;
    }
  } else {
    _c.set(paint);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = _c.r;
      arr[i * 3 + 1] = _c.g;
      arr[i * 3 + 2] = _c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/**
 * 反転ハル用の膨らませた形。同じ位置の頂点の法線を平均し、角でも面が t だけ外へ出るように伸ばす。
 * 返り値は position と index のみ。
 */
export function hullOf(g: THREE.BufferGeometry, t: number): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const n = pos.count;
  const ids = new Int32Array(n);
  const map = new Map<string, number>();
  const sum: number[] = [];
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos.getX(i) * 32)},${Math.round(pos.getY(i) * 32)},${Math.round(pos.getZ(i) * 32)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = sum.length / 3;
      map.set(key, id);
      sum.push(0, 0, 0);
    }
    ids[i] = id;
    sum[id * 3] += nor.getX(i);
    sum[id * 3 + 1] += nor.getY(i);
    sum[id * 3 + 2] += nor.getZ(i);
  }
  const cnt = sum.length / 3;
  const minDot = new Float32Array(cnt).fill(1);
  for (let id = 0; id < cnt; id++) {
    const l = Math.hypot(sum[id * 3], sum[id * 3 + 1], sum[id * 3 + 2]);
    if (l > 1e-5) {
      sum[id * 3] /= l;
      sum[id * 3 + 1] /= l;
      sum[id * 3 + 2] /= l;
    }
  }
  for (let i = 0; i < n; i++) {
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    if (nx * nx + ny * ny + nz * nz < 0.25) continue;
    const id = ids[i];
    const d = sum[id * 3] * nx + sum[id * 3 + 1] * ny + sum[id * 3 + 2] * nz;
    if (d < minDot[id]) minDot[id] = d;
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const id = ids[i];
    let nx = sum[id * 3];
    let ny = sum[id * 3 + 1];
    let nz = sum[id * 3 + 2];
    if (nx === 0 && ny === 0 && nz === 0) {
      nx = nor.getX(i);
      ny = nor.getY(i);
      nz = nor.getZ(i);
    }
    const k = t / Math.max(0.45, minDot[id]);
    out[i * 3] = pos.getX(i) + nx * k;
    out[i * 3 + 1] = pos.getY(i) + ny * k;
    out[i * 3 + 2] = pos.getZ(i) + nz * k;
  }
  const h = new THREE.BufferGeometry();
  h.setAttribute('position', new THREE.BufferAttribute(out, 3));
  if (g.index) h.setIndex(g.index.clone());
  return h;
}

export interface BuildOpts {
  /** 結合後の全頂点に掛ける色の後処理（高さで暗く・奥ほど霞むなど） */
  shade?: ColorFn;
  outline?: THREE.ColorRepresentation;
  parent?: THREE.Object3D;
  receive?: boolean;
  cast?: boolean;
  name?: string;
  renderOrder?: number;
}

export interface PieceOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  /** 輪郭の太さ（ワールド単位）。0 なら無し */
  ol?: number;
}

/** 単位球（正二十面体の分割）の雛形。複製して使う（組み立てを速く） */
const balls = new Map<number, THREE.BufferGeometry>();
function unitBall(detail: number): THREE.BufferGeometry {
  let g = balls.get(detail);
  if (!g) {
    const ico = new THREE.IcosahedronGeometry(1, detail);
    g = ico.index ? ico : prep(ico, null, false);
    g.deleteAttribute('uv');
    balls.set(detail, g);
  }
  return g;
}

export class Batch {
  private parts: THREE.BufferGeometry[] = [];
  private hulls: THREE.BufferGeometry[] = [];

  constructor(
    private readonly kit: Kit,
    private readonly uv = false,
  ) {}

  get size(): number {
    return this.parts.length;
  }

  /** geo は取り込まれる（呼び出し側で使い回さないこと） */
  add(geo: THREE.BufferGeometry, paint: Paint, m: THREE.Matrix4 | null = null, ol = 0): this {
    const g = prep(geo, m, this.uv);
    paintGeo(g, paint);
    this.parts.push(g);
    if (ol > 0) this.hulls.push(hullOf(g, ol));
    return this;
  }

  box(w: number, h: number, d: number, paint: Paint, x: number, y: number, z: number, o: PieceOpts = {}): this {
    return this.add(new THREE.BoxGeometry(w, h, d), paint, mat4(x, y, z, o.rx ?? 0, o.ry ?? 0, o.rz ?? 0), o.ol ?? 0);
  }

  /** 上面の高さ top を指定する箱（足場向け） */
  slab(x1: number, x2: number, top: number, h: number, z1: number, z2: number, paint: Paint, ol = 0): this {
    return this.box(x2 - x1, h, z2 - z1, paint, (x1 + x2) / 2, top - h / 2, (z1 + z2) / 2, { ol });
  }

  cyl(rTop: number, rBot: number, h: number, paint: Paint, x: number, y: number, z: number, o: PieceOpts & { seg?: number } = {}): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, o.seg ?? 10, 1), paint, mat4(x, y, z, o.rx ?? 0, o.ry ?? 0, o.rz ?? 0), o.ol ?? 0);
  }

  ball(r: number, paint: Paint, x: number, y: number, z: number, o: PieceOpts & { sx?: number; sy?: number; sz?: number; detail?: number } = {}): this {
    const g = unitBall(o.detail ?? 1).clone();
    return this.add(g, paint, mat4(x, y, z, o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, r * (o.sx ?? 1), r * (o.sy ?? 1), r * (o.sz ?? 1)), o.ol ?? 0);
  }

  /** 結合してメッシュにする（空なら null） */
  build(mat: THREE.Material, o: BuildOpts = {}): THREE.Mesh | null {
    if (this.parts.length === 0) return null;
    const merged = this.parts.length === 1 ? this.parts[0] : mergeGeometries(this.parts, false);
    if (!merged) throw new Error('stage batch merge failed');
    if (merged !== this.parts[0]) for (const p of this.parts) p.dispose();
    this.parts = [];
    if (o.shade) {
      const pos = merged.getAttribute('position');
      const nor = merged.getAttribute('normal');
      const colA = merged.getAttribute('color');
      for (let i = 0; i < pos.count; i++) {
        _p.fromBufferAttribute(pos, i);
        _n.fromBufferAttribute(nor, i);
        _c.fromBufferAttribute(colA as THREE.BufferAttribute, i);
        o.shade(_p, _n, _c);
        colA.setXYZ(i, _c.r, _c.g, _c.b);
      }
    }
    merged.computeBoundingSphere();
    const mesh = this.kit.mesh(merged, mat, o.parent ?? this.kit.group);
    mesh.receiveShadow = !!o.receive;
    mesh.castShadow = !!o.cast;
    if (o.name) mesh.name = o.name;
    if (o.renderOrder !== undefined) mesh.renderOrder = o.renderOrder;
    if (this.hulls.length > 0) {
      const hm = this.hulls.length === 1 ? this.hulls[0] : mergeGeometries(this.hulls, false);
      if (hm) {
        if (hm !== this.hulls[0]) for (const h of this.hulls) h.dispose();
        hm.computeBoundingSphere();
        const ol = this.kit.mesh(hm, this.kit.outline(o.outline ?? INK), mesh);
        ol.name = 'outline';
        ol.userData.outline = true;
      }
      this.hulls = [];
    }
    return mesh;
  }
}

// ─────────────────────────────────────────────────────────────
// 形
// ─────────────────────────────────────────────────────────────

/** 先細りの管（綱・幹・根・鯱の胴など）。radius(t) は t=0..1 に沿った半径 */
export function tube(pts: THREE.Vector3[], radius: (t: number) => number, radial = 8, seg = 24, caps = true): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  // 点と接線（弧長ではなく t で均等に取る）、射影で回転の少ない枠を作る
  const cps: THREE.Vector3[] = [];
  for (let i = 0; i <= seg; i++) cps.push(curve.getPoint(i / seg));
  const tans: THREE.Vector3[] = cps.map((_, i) => new THREE.Vector3().subVectors(cps[Math.min(seg, i + 1)], cps[Math.max(0, i - 1)]).normalize());
  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];
  {
    const t0 = tans[0];
    const ax = Math.abs(t0.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    let n = new THREE.Vector3().crossVectors(t0, ax).normalize();
    for (let i = 0; i <= seg; i++) {
      const t = tans[i];
      n = n.clone().addScaledVector(t, -n.dot(t));
      if (n.lengthSq() < 1e-8) n.set(0, 0, 1).addScaledVector(t, -t.z);
      n.normalize();
      normals.push(n);
      binormals.push(new THREE.Vector3().crossVectors(t, n));
    }
  }
  const fr = { tangents: tans, normals, binormals };
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const P = new THREE.Vector3();
  const D = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    P.copy(cps[i]);
    const r = Math.max(0.01, radius(t));
    const N = fr.normals[i];
    const B = fr.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      D.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      pos.push(P.x + D.x * r, P.y + D.y * r, P.z + D.z * r);
      nor.push(D.x, D.y, D.z);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  if (caps) {
    for (const end of [0, 1]) {
      const i = end * seg;
      const T = fr.tangents[i].clone().multiplyScalar(end ? 1 : -1);
      P.copy(cps[i]);
      const c = pos.length / 3;
      pos.push(P.x, P.y, P.z);
      nor.push(T.x, T.y, T.z);
      const base = pos.length / 3;
      for (let j = 0; j <= radial; j++) {
        const k = (i * row + j) * 3;
        pos.push(pos[k], pos[k + 1], pos[k + 2]);
        nor.push(T.x, T.y, T.z);
      }
      for (let j = 0; j < radial; j++) {
        if (end) idx.push(c, base + j, base + j + 1);
        else idx.push(c, base + j + 1, base + j);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/**
 * 和風の反り屋根（寄棟）。原点 = 軒先の高さの中心。w×d は軒先の外寸、h は棟までの高さ。
 * 厚み th の殻として閉じた形にする（輪郭が付けられる）。
 */
export function roofGeo(w: number, d: number, h: number, o: { th?: number; curve?: number; up?: number; nx?: number; nz?: number; ridge?: number } = {}): THREE.BufferGeometry {
  const th = o.th ?? Math.max(4, h * 0.08);
  const curve = o.curve ?? 1.55;
  const up = o.up ?? h * 0.18;
  const nx = o.nx ?? 16;
  const nz = o.nz ?? 8;
  const ridge = o.ridge ?? 1;
  const hw = w / 2;
  const hd = d / 2;
  const height = (u: number, v: number): number => {
    const ez = 1 - Math.abs(v);
    const ex = (1 - Math.abs(u)) * (w / d) * ridge;
    const e = Math.min(1, ex, ez);
    const au = Math.abs(u);
    const av = Math.abs(v);
    return h * Math.pow(e, curve) + up * Math.pow(Math.max(au, 0.0001) * av, 3) + up * 0.6 * Math.pow(au, 8);
  };
  const pos: number[] = [];
  const idx: number[] = [];
  const cols = nx + 1;
  const rows = nz + 1;
  // 上面
  for (let j = 0; j < rows; j++) {
    const v = (j / nz) * 2 - 1;
    for (let i = 0; i < cols; i++) {
      const u = (i / nx) * 2 - 1;
      pos.push(u * hw, height(u, v), v * hd);
    }
  }
  // 下面（厚みぶん下げ、少し内側）
  const off = cols * rows;
  for (let j = 0; j < rows; j++) {
    const v = (j / nz) * 2 - 1;
    for (let i = 0; i < cols; i++) {
      const u = (i / nx) * 2 - 1;
      pos.push(u * hw * 0.985, height(u, v) - th, v * hd * 0.985);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const e = c + 1;
      idx.push(a, c, b, b, c, e);
      idx.push(off + a, off + b, off + c, off + b, off + e, off + c);
    }
  }
  // 周囲の帯
  const ring: number[] = [];
  for (let i = 0; i < nx; i++) ring.push(i);
  for (let j = 0; j < nz; j++) ring.push(j * cols + nx);
  for (let i = nx; i > 0; i--) ring.push(nz * cols + i);
  for (let j = nz; j > 0; j--) ring.push(j * cols);
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k];
    const b = ring[(k + 1) % ring.length];
    idx.push(a, b, off + a, b, off + b, off + a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // 面ごとに法線を分けて角を立てる（トゥーンの段がきれいに出る）
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  return flat;
}

/**
 * パラメトリックな面に厚みを付けた閉じた板（反った屋根・破風・帆・布など）。
 * f(u, v, out) が上面の点（u, v ∈ [0, 1]）。下面は off 方向へ th だけずらす。上面は off と逆を向く。
 */
export function sheet(nu: number, nv: number, f: (u: number, v: number, out: THREE.Vector3) => void, th: number, off: THREE.Vector3 = new THREE.Vector3(0, -1, 0)): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const P = new THREE.Vector3();
  const cols = nu + 1;
  const rows = nv + 1;
  const grid = (dx: number, dy: number, dz: number): number => {
    const base = pos.length / 3;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        f(i / nu, j / nv, P);
        pos.push(P.x + dx, P.y + dy, P.z + dz);
        uvs.push(i / nu, 1 - j / nv);
      }
    }
    return base;
  };
  const T = grid(0, 0, 0);
  const B = grid(off.x * th, off.y * th, off.z * th);
  const idx: number[] = [];
  const at = (base: number, i: number, j: number): number => base + j * cols + i;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = at(T, i, j);
      const b = at(T, i + 1, j);
      const c = at(T, i, j + 1);
      const e = at(T, i + 1, j + 1);
      idx.push(a, c, b, b, c, e);
      const a2 = at(B, i, j);
      const b2 = at(B, i + 1, j);
      const c2 = at(B, i, j + 1);
      const e2 = at(B, i + 1, j + 1);
      idx.push(a2, b2, c2, b2, e2, c2);
    }
  }
  // 側面は頂点を分けて角を立てる（周囲の辺だけ複製）
  const edge = (list: [number, number][], outward: boolean): void => {
    const s = pos.length / 3;
    for (const [i, j] of list) {
      const k = at(T, i, j) * 3;
      pos.push(pos[k], pos[k + 1], pos[k + 2]);
      const k2 = at(B, i, j) * 3;
      pos.push(pos[k2], pos[k2 + 1], pos[k2 + 2]);
      uvs.push(i / nu, 1 - j / nv, i / nu, 1 - j / nv);
    }
    for (let n = 0; n < list.length - 1; n++) {
      const a = s + n * 2;
      const a2 = a + 1;
      const b = a + 2;
      const b2 = a + 3;
      if (outward) idx.push(a, b, a2, b, b2, a2);
      else idx.push(a, a2, b, b, a2, b2);
    }
  };
  const e0: [number, number][] = [];
  const e1: [number, number][] = [];
  for (let i = 0; i <= nu; i++) {
    e0.push([i, 0]);
    e1.push([i, nv]);
  }
  const e2: [number, number][] = [];
  const e3: [number, number][] = [];
  for (let j = 0; j <= nv; j++) {
    e2.push([0, j]);
    e3.push([nu, j]);
  }
  edge(e0, true);
  edge(e1, false);
  edge(e2, false);
  edge(e3, true);
  // 上面が off と逆を向いていなければ全体を裏返す
  const v0 = new THREE.Vector3(pos[idx[0] * 3], pos[idx[0] * 3 + 1], pos[idx[0] * 3 + 2]);
  const v1 = new THREE.Vector3(pos[idx[1] * 3], pos[idx[1] * 3 + 1], pos[idx[1] * 3 + 2]);
  const v2 = new THREE.Vector3(pos[idx[2] * 3], pos[idx[2] * 3 + 1], pos[idx[2] * 3 + 2]);
  const nrm = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0));
  if (nrm.dot(off) > 0) {
    for (let k = 0; k < idx.length; k += 3) {
      const t = idx[k + 1];
      idx[k + 1] = idx[k + 2];
      idx[k + 2] = t;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 高さ場の地形（山並み・丘）。y = base + hgt(x, z)。上面のみ */
export function terrain(x0: number, x1: number, z0: number, z1: number, nx: number, nz: number, base: number, hgt: (x: number, z: number) => number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, base + hgt(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  return g;
}

/** 中点変位の 1D ノイズ（n は 2 の累乗）。[-amp, amp] 程度 */
export function noise1d(rng: Rng, n: number, amp: number, rough = 0.55): Float32Array {
  const a = new Float32Array(n + 1);
  a[0] = rng.range(-1, 1) * amp;
  a[n] = rng.range(-1, 1) * amp;
  let step = n;
  let s = amp;
  while (step > 1) {
    const half = step >> 1;
    for (let i = half; i < n; i += step) a[i] = (a[i - half] + a[i + half]) / 2 + rng.range(-1, 1) * s;
    s *= rough;
    step = half;
  }
  return a;
}

/** noise1d を 0..1 の t で線形補間して読む */
export function sample1d(a: Float32Array, t: number): number {
  const n = a.length - 1;
  const u = clamp(t, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(u));
  return a[i] + (a[i + 1] - a[i]) * (u - i);
}

/** 山並みの稜線関数を作る: 峰の max 合成 + 細かいノイズ。戻り値は x → 高さ */
export function ridgeLine(rng: Rng, x0: number, x1: number, peaks: number, hMin: number, hMax: number, wMin: number, wMax: number, rough: number): (x: number) => number {
  const ps: { x: number; h: number; w: number; p: number }[] = [];
  for (let i = 0; i < peaks; i++) {
    ps.push({ x: x0 + ((x1 - x0) * (i + rng.range(0.15, 0.85))) / peaks, h: rng.range(hMin, hMax), w: rng.range(wMin, wMax), p: rng.range(1.2, 1.9) });
  }
  const nz = noise1d(rng, 256, rough);
  return (x: number) => {
    let hg = 0;
    for (const p of ps) {
      const t = Math.abs(x - p.x) / p.w;
      if (t < 1) hg = Math.max(hg, p.h * Math.pow(1 - t, p.p));
    }
    return Math.max(0, hg + sample1d(nz, (x - x0) / (x1 - x0)) * (0.3 + (hg / hMax) * 0.7));
  };
}

// ─────────────────────────────────────────────────────────────
// テクスチャ
// ─────────────────────────────────────────────────────────────

export function canvasTex(kit: Kit, w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void, o: { repeat?: boolean; mip?: boolean } = {}): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) paint(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (o.repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  if (o.mip === false) {
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
  }
  t.anisotropy = 4;
  return kit.tex(t);
}

/** トゥーンの段（0..1 の明るさを暗→明の順に）。雲など共通の 3 段と違う塗りにしたいとき */
export function rampTex(kit: Kit, steps: number[]): THREE.DataTexture {
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => {
    const b = Math.round(clamp(v, 0, 1) * 255);
    data.set([b, b, b, 255], i * 4);
  });
  const t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return kit.tex(t);
}

// ─────────────────────────────────────────────────────────────
// 空・光・発光
// ─────────────────────────────────────────────────────────────

/**
 * ワールド空間の空（遠くに立てた巨大な板に縦グラデ）。scene.background と違いカメラの上下で視差が付く。
 * stops は [ワールド y, 色]。
 */
export function skyPlane(kit: Kit, stops: [number, THREE.ColorRepresentation][], z = -9800, o: { x0?: number; x1?: number; y0?: number; y1?: number } = {}): THREE.Mesh {
  const x0 = o.x0 ?? -13000;
  const x1 = o.x1 ?? 13000;
  const y0 = o.y0 ?? -12000;
  const y1 = o.y1 ?? 4200;
  const seg = 110;
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0, 1, seg);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  const pos = g.getAttribute('position');
  const cols = new Float32Array(pos.count * 3);
  const cs = stops.map(([y, c]) => [y, new THREE.Color(c)] as const);
  const a = new THREE.Color();
  // sRGB で補間してから線形へ（CSS のグラデと同じ見え方）
  const sa = { r: 0, g: 0, b: 0 };
  const sb = { r: 0, g: 0, b: 0 };
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    let k = 0;
    while (k < cs.length - 1 && y > cs[k + 1][0]) k++;
    if (y <= cs[0][0]) a.copy(cs[0][1]);
    else if (k >= cs.length - 1) a.copy(cs[cs.length - 1][1]);
    else {
      const t = smooth(0, 1, (y - cs[k][0]) / (cs[k + 1][0] - cs[k][0]));
      cs[k][1].getRGB(sa, THREE.SRGBColorSpace);
      cs[k + 1][1].getRGB(sb, THREE.SRGBColorSpace);
      a.setRGB(lerp(sa.r, sb.r, t), lerp(sa.g, sb.g, t), lerp(sa.b, sb.b, t), THREE.SRGBColorSpace);
    }
    cols[i * 3] = a.r;
    cols[i * 3 + 1] = a.g;
    cols[i * 3 + 2] = a.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = kit.mesh(g, kit.basic({ vertexColors: true, fog: false, dithering: true, depthWrite: false }));
  m.name = 'sky';
  m.renderOrder = -10;
  return m;
}

export interface LightSpec {
  sky: THREE.ColorRepresentation;
  ground: THREE.ColorRepresentation;
  hemi: number;
  sun: THREE.ColorRepresentation;
  sunI: number;
  /** 光の来る方向（ステージ中心から見た太陽の方向） */
  dir: [number, number, number];
}

/** 半球光 + 太陽（影を落とすメインライト）。target も group に入れる */
export function addLights(kit: Kit, s: LightSpec): THREE.DirectionalLight {
  const hemi = new THREE.HemisphereLight(s.sky, s.ground, s.hemi);
  hemi.name = 'hemi';
  kit.group.add(hemi);
  const sun = new THREE.DirectionalLight(s.sun, s.sunI);
  sun.name = 'sun';
  const d = new THREE.Vector3(...s.dir).normalize().multiplyScalar(2600);
  sun.position.copy(d);
  sun.target.position.set(0, 0, 0);
  sun.target.name = 'sunTarget';
  kit.group.add(sun, sun.target);
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -1100;
  sc.right = 1100;
  sc.top = 1100;
  sc.bottom = -1100;
  sc.near = 100;
  sc.far = 6000;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 1.5;
  return sun;
}

/** カメラを向いた発光の板（加算）。月・太陽の光輪、灯りの滲みなど */
export function glowQuad(kit: Kit, color: THREE.ColorRepresentation, size: number, x: number, y: number, z: number, opacity = 1, parent: THREE.Object3D = kit.group, sy = size): THREE.Mesh {
  const mat = kit.basic({
    map: kit.glowTex(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const m = kit.mesh(new THREE.PlaneGeometry(1, 1), mat, parent);
  m.scale.set(size, sy, 1);
  m.position.set(x, y, z);
  return m;
}

// ─────────────────────────────────────────────────────────────
// 粒子（星・光の粒・花びら・火の粉・波のきらめき）
// ─────────────────────────────────────────────────────────────

const FIELD_VS = /* glsl */ `
uniform float uTime;
uniform float uViewH;
uniform float uPR;
uniform float uWorld;
uniform vec3 uMin;
uniform vec3 uSize;
uniform float uSway;
uniform float uTwinkle;
uniform float uTwSpeed;
uniform float uSpin;
uniform float uTumble;
uniform float uEdge;
attribute float aSize;
attribute float aPhase;
attribute vec3 aVel;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
varying float vRot;
varying float vSquash;
void main() {
  vec3 p = position + aVel * uTime;
  p = uMin + mod(p - uMin, uSize);
  p.x += sin(uTime * 0.021 + aPhase * 6.2832) * uSway;
  p.y += cos(uTime * 0.017 + aPhase * 4.0) * uSway * 0.4;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = aSize * uPR;
  if (uWorld > 0.5) s = aSize * projectionMatrix[1][1] * uViewH * 0.5 / max(1.0, -mv.z);
  gl_PointSize = clamp(s, 0.0, 96.0);
  vec3 q = (p - uMin) / uSize;
  float e = smoothstep(0.0, uEdge, q.x) * smoothstep(1.0, 1.0 - uEdge, q.x) * smoothstep(0.0, uEdge, q.y) * smoothstep(1.0, 1.0 - uEdge, q.y);
  float tw = 0.5 + 0.5 * sin(uTime * uTwSpeed * (0.55 + aPhase) + aPhase * 37.0);
  vAlpha = mix(1.0, tw * tw, uTwinkle) * e * clamp(s * 0.8, 0.0, 1.0);
  vColor = aColor;
  vRot = aPhase * 6.2832 + uTime * uSpin * (aPhase - 0.5);
  vSquash = mix(1.0, 0.25 + 0.75 * abs(cos(uTime * 0.035 * (0.5 + aPhase) + aPhase * 9.0)), uTumble);
}
`;

const FIELD_FS = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
varying float vRot;
varying float vSquash;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float c = cos(vRot);
  float s = sin(vRot);
  uv = mat2(c, -s, s, c) * uv;
  uv.y /= vSquash;
  uv += 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  vec4 t = texture2D(uMap, uv);
  float a = t.a * vAlpha * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * t.rgb, a);
  #include <colorspace_fragment>
}
`;

export interface FieldOpts {
  count: number;
  /** 出現・折り返しの箱 [x0, y0, z0, x1, y1, z1] */
  box: [number, number, number, number, number, number];
  map: THREE.Texture;
  colors: THREE.ColorRepresentation[];
  /** 大きさ [最小, 最大]（world=true ならワールド単位、false ならピクセル） */
  size: [number, number];
  world?: boolean;
  /** 1F あたりの速度 */
  vel?: (r: Rng, out: THREE.Vector3) => void;
  /** 分布の偏り（true を返した位置だけ採用） */
  accept?: (x: number, y: number, z: number, r: Rng) => boolean;
  /** 位置を指定する場合（count より優先）。[x, y, z, 大きさ?, 色?] */
  at?: [number, number, number, number?, THREE.ColorRepresentation?][];
  additive?: boolean;
  opacity?: number;
  twinkle?: number;
  twSpeed?: number;
  spin?: number;
  tumble?: boolean;
  sway?: number;
  edge?: number;
  seed: number;
  renderOrder?: number;
}

/** GPU で動かす粒子。update では uTime を進めるだけ（割り当てなし） */
export function pointField(kit: Kit, o: FieldOpts): THREE.Points {
  const r = new Rng(o.seed);
  const [x0, y0, z0, x1, y1, z1] = o.box;
  const n = o.at ? o.at.length : o.count;
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  const colr = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  const cs = o.colors.map((c) => new THREE.Color(c));
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 40; k++) {
      x = r.range(x0, x1);
      y = r.range(y0, y1);
      z = r.range(z0, z1);
      if (!o.accept || o.accept(x, y, z, r)) break;
    }
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    v.set(0, 0, 0);
    o.vel?.(r, v);
    vel[i * 3] = v.x;
    vel[i * 3 + 1] = v.y;
    vel[i * 3 + 2] = v.z;
    size[i] = r.range(o.size[0], o.size[1]);
    phase[i] = r.next();
    let c = cs[Math.floor(r.next() * cs.length)];
    const a = o.at?.[i];
    if (a) {
      pos[i * 3] = a[0];
      pos[i * 3 + 1] = a[1];
      pos[i * 3 + 2] = a[2];
      if (a[3] !== undefined) size[i] = a[3];
      if (a[4] !== undefined) c = new THREE.Color(a[4]);
    }
    colr[i * 3] = c.r;
    colr[i * 3 + 1] = c.g;
    colr[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setAttribute('aColor', new THREE.BufferAttribute(colr, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 200);
  kit.geo(g);
  const uniforms = {
    uTime: { value: 0 },
    uViewH: { value: 720 },
    uPR: { value: 1 },
    uWorld: { value: o.world ? 1 : 0 },
    uMin: { value: new THREE.Vector3(x0, y0, z0) },
    uSize: { value: new THREE.Vector3(Math.max(1, x1 - x0), Math.max(1, y1 - y0), Math.max(1, z1 - z0)) },
    uSway: { value: o.sway ?? 0 },
    uTwinkle: { value: o.twinkle ?? 0 },
    uTwSpeed: { value: o.twSpeed ?? 0.05 },
    uSpin: { value: o.spin ?? 0 },
    uTumble: { value: o.tumble ? 1 : 0 },
    uEdge: { value: o.edge ?? 0.04 },
    uMap: { value: o.map },
    uOpacity: { value: o.opacity ?? 1 },
  };
  const mat = kit.mat(
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: FIELD_VS,
      fragmentShader: FIELD_FS,
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }),
  );
  const pts = new THREE.Points(g, mat);
  pts.renderOrder = o.renderOrder ?? 0;
  const size2 = new THREE.Vector2();
  pts.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(size2);
    uniforms.uViewH.value = size2.y;
    uniforms.uPR.value = renderer.getPixelRatio();
  };
  kit.group.add(pts);
  kit.onUpdate((frame) => {
    uniforms.uTime.value = frame;
  });
  return pts;
}

/** 粒子用の丸い光（白） */
export function dotTex(kit: Kit, soft = 0.5): THREE.Texture {
  return canvasTex(kit, 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(clamp(0.5 - soft * 0.4, 0.05, 0.9), 'rgba(255,255,255,0.8)');
    gr.addColorStop(clamp(0.8 - soft * 0.3, 0.1, 0.95), 'rgba(255,255,255,0.18)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/** 十字のきらめき */
export function sparkTex(kit: Kit): THREE.Texture {
  return canvasTex(kit, 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.moveTo(32, 2);
    g.quadraticCurveTo(34, 30, 62, 32);
    g.quadraticCurveTo(34, 34, 32, 62);
    g.quadraticCurveTo(30, 34, 2, 32);
    g.quadraticCurveTo(30, 30, 32, 2);
    g.fill();
  });
}

/** 桜の花びら */
export function petalTex(kit: Kit): THREE.Texture {
  return canvasTex(kit, 64, 64, (g) => {
    g.translate(32, 32);
    const gr = g.createLinearGradient(0, -28, 0, 28);
    gr.addColorStop(0, '#fff2f6');
    gr.addColorStop(1, '#ffb3cb');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, 28);
    g.bezierCurveTo(26, 12, 22, -20, 6, -26);
    g.lineTo(0, -18);
    g.lineTo(-6, -26);
    g.bezierCurveTo(-22, -20, -26, 12, 0, 28);
    g.fill();
  });
}

// ─────────────────────────────────────────────────────────────
// 足場
// ─────────────────────────────────────────────────────────────

/**
 * すり抜け床を置く。obj の原点は「上面の中心」で作っておくこと。
 * 動く床は毎フレーム platformAt と同じ位置へ（物理と一致させる）。
 */
export function placePlatform(kit: Kit, p: Platform, obj: THREE.Object3D, onMove?: (x: number, y: number, frame: number) => void): void {
  obj.position.set((p.x1 + p.x2) / 2, -p.y, 0);
  kit.group.add(obj);
  if (!p.move) return;
  kit.onUpdate((frame) => {
    const s = platformAt(p, frame);
    const x = (s.x1 + s.x2) / 2;
    obj.position.set(x, -s.y, 0);
    onMove?.(x, -s.y, frame);
  });
}

/** 霞: 奥（-z）ほど色を c へ寄せる shade 関数 */
export function haze(c: THREE.ColorRepresentation, zNear: number, zFar: number, max = 1): ColorFn {
  const h = new THREE.Color(c);
  return (p, _n, out) => {
    out.lerp(h, smooth(zNear, zFar, -p.z) * max);
  };
}

/** Instanced の組み立て（行列と色を関数で決める） */
export function instanced(
  kit: Kit,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  count: number,
  set: (i: number, o: THREE.Object3D, c: THREE.Color) => void,
  parent: THREE.Object3D = kit.group,
): THREE.InstancedMesh {
  kit.geo(geo);
  const im = new THREE.InstancedMesh(geo, mat, count);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  const cols = new Float32Array(count * 3);
  let colored = false;
  for (let i = 0; i < count; i++) {
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.set(1, 1, 1);
    c.setRGB(1, 1, 1);
    set(i, o, c);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
    if (c.r !== 1 || c.g !== 1 || c.b !== 1) colored = true;
  }
  if (colored) im.instanceColor = new THREE.InstancedBufferAttribute(cols, 3);
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  parent.add(im);
  return im;
}

/** 平らな形（Shape）を厚み depth で押し出し、z 中心にそろえる */
export function extrude(shape: THREE.Shape, depth: number, bevel = 0, curveSegments = 8): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/**
 * 吊り提灯（紐の付け根 pivots から下がる）。本体・金具・輪郭を instanced でまとめて毎フレーム揺らし、灯りの滲みは粒子で。
 */
export function swayLanterns(kit: Kit, pivots: THREE.Vector3[], o: { drop?: number; color?: THREE.ColorRepresentation; halo?: number } = {}): void {
  const n = pivots.length;
  if (n === 0) return;
  const drop = o.drop ?? 0;
  const shell = new THREE.SphereGeometry(10.5, 14, 10);
  shell.scale(1, 1.2, 1);
  shell.translate(0, -34 - drop, 0);
  const lamps = instanced(kit, shell, kit.basic({ color: o.color ?? '#ffb866', fog: false }), n, (i, obj) => obj.position.copy(pivots[i]));
  const ol = new THREE.InstancedMesh(kit.geo(hullOf(shell, 1.5)), kit.outline(), n);
  ol.instanceMatrix = lamps.instanceMatrix;
  lamps.add(ol);
  const pb = new Batch(kit);
  pb.cyl(0.9, 0.9, 20 + drop, '#1a120c', 0, -(10 + drop) / 1, 0, { seg: 4 });
  pb.cyl(6.2, 6.2, 3.5, '#1a120c', 0, -20 - drop, 0, { seg: 10 });
  pb.cyl(6.2, 6.2, 3.5, '#1a120c', 0, -48 - drop, 0, { seg: 10 });
  pb.cyl(2.5, 0.6, 9, '#c0392b', 0, -54 - drop, 0, { seg: 6 });
  const pm = pb.build(kit.vtoon());
  if (!pm) return;
  pm.removeFromParent();
  const parts = instanced(kit, pm.geometry, pm.material as THREE.Material, n, (i, obj) => obj.position.copy(pivots[i]));
  const obj = new THREE.Object3D();
  kit.onUpdate((frame) => {
    for (let i = 0; i < n; i++) {
      obj.position.copy(pivots[i]);
      obj.rotation.set(Math.sin(frame * 0.021 + i * 1.7) * 0.05, 0, Math.sin(frame * 0.033 + i * 2.3) * 0.07);
      obj.updateMatrix();
      lamps.setMatrixAt(i, obj.matrix);
      parts.setMatrixAt(i, obj.matrix);
    }
    lamps.instanceMatrix.needsUpdate = true;
    parts.instanceMatrix.needsUpdate = true;
  });
  pointField(kit, {
    count: n,
    at: pivots.map((p) => [p.x, p.y - 34 - drop, p.z + 6] as [number, number, number]),
    box: [-20000, -20000, -20000, 20000, 20000, 20000],
    map: kit.glowTex(),
    colors: [o.color ?? '#ff9a4a'],
    size: [o.halo ?? 120, o.halo ?? 120],
    world: true,
    additive: true,
    twinkle: 0.22,
    twSpeed: 0.12,
    edge: 0.00001,
    opacity: 0.55,
    seed: 3,
  });
}
