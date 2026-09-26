import * as THREE from 'three';
import { finishModel, type ModelParts } from '../model';
import type { Rig } from '../rig';
import { outlineMat, toonMat } from '../toon';
import type { CharacterModel, ModelPose, Quality } from '../types';

/**
 * CNP キャラのモデル部品（共通）。
 * - 形はすべて手続き生成（回転体・チューブ・押し出し）。テクスチャは使わない。
 * - 顔の目・口・模様は頭の楕円体に沿わせた「デカール」メッシュで描く。
 * - 輪郭線は法線方向に膨らませた反転ハル（厚さはワールド単位で一定）。
 */

export type Col = THREE.ColorRepresentation;
export type V2 = [number, number];
export type Expr = ModelPose['expression'];

/** 輪郭線（公式イラストの線に合わせた濃い藍） */
export const INK = '#1c1a52';
/** 顔の線（まぶた・口） */
export const LINE = '#1d1c6e';

export const RED = '#e0443a';
export const BLUE = '#3b7be0';
export const YELLOW = '#f2c14e';
export const GREEN = '#34a864';
export const PURPLE = '#8a4fd6';

/** 顔（頭）をカメラ側 +z へ向ける角度。描画側は体を 0.36 だけ振り向かせ、左向きは scale.x = -1 で反転する */
export const LOOK = 0.5;

const TAU = Math.PI * 2;

/** variant 0 = 基本色、1〜3 = alts */
export function accent(variant: number | undefined, base: string, alts: [string, string, string]): string {
  const v = Math.abs(Math.floor(variant ?? 0)) % 4;
  return v === 0 ? base : alts[v - 1];
}

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

// ---------------------------------------------------------------- キット

/** 1 体分の生成コンテキスト（分割数・ジオメトリとマテリアルの使い回し） */
export class Kit {
  readonly hi: boolean;
  private readonly geos = new Map<string, THREE.BufferGeometry>();
  private readonly mats = new Map<string, THREE.Material>();

  constructor(q?: Quality) {
    this.hi = q !== 'low';
  }

  /** 分割数（low では約半分） */
  n(v: number, min = 5): number {
    return Math.max(min, Math.round(this.hi ? v : v * 0.55));
  }

  geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
    let g = this.geos.get(key);
    if (!g) {
      g = make();
      this.geos.set(key, g);
    }
    return g as T;
  }

  /** 細かい版（描画用）と粗い版（輪郭用、userData.lo）を作る。make(k) の k は分割数の倍率 */
  lod(key: string, make: (k: number) => THREE.BufferGeometry): THREE.BufferGeometry {
    return this.geo(key, () => {
      const g = make(1);
      g.userData.lo = make(0.62);
      return g;
    });
  }

  toon(color: Col, o: { vc?: boolean; emissive?: Col; ei?: number; side?: THREE.Side } = {}): THREE.MeshToonMaterial {
    const key = `t|${new THREE.Color(color).getHexString()}|${o.vc ? 1 : 0}|${o.emissive ?? ''}|${o.ei ?? ''}|${o.side ?? ''}`;
    let m = this.mats.get(key) as THREE.MeshToonMaterial | undefined;
    if (!m) {
      m = toonMat(color, { emissive: o.emissive, emissiveIntensity: o.ei, side: o.side });
      if (o.vc) m.vertexColors = true;
      this.mats.set(key, m);
    }
    return m;
  }

  /** 陰影なしの色（目・口・炎） */
  flat(color: Col, o: { opacity?: number; add?: boolean; vc?: boolean; side?: THREE.Side } = {}): THREE.MeshBasicMaterial {
    const key = `f|${new THREE.Color(color).getHexString()}|${o.opacity ?? 1}|${o.add ? 1 : 0}|${o.vc ? 1 : 0}|${o.side ?? ''}`;
    let m = this.mats.get(key) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      const op = o.opacity ?? 1;
      m = new THREE.MeshBasicMaterial({
        color,
        transparent: op < 1 || !!o.add,
        opacity: op,
        vertexColors: !!o.vc,
        side: o.side ?? THREE.FrontSide,
        blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: !o.add,
      });
      this.mats.set(key, m);
    }
    return m;
  }

  group(parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  /** 影を落とさない小物（顔のデカールなど） */
  deco(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, order = 1): THREE.Mesh {
    const m = this.mesh(geo, mat, parent, x, y, z);
    m.userData.noShadow = true;
    m.renderOrder = order;
    return m;
  }

  /** 反転ハルの輪郭（t = ワールド単位の太さ）。src を渡すとそれ（粗い版など）から作る */
  outline(mesh: THREE.Mesh, t = 0.9, src?: THREE.BufferGeometry): THREE.Mesh {
    const g = src ?? (mesh.geometry.userData.lo as THREE.BufferGeometry | undefined) ?? mesh.geometry;
    const hull = this.geo(`hull|${g.uuid}|${t}`, () => hullGeo(g, t));
    const o = new THREE.Mesh(hull, outlineMat(INK));
    o.name = 'outline';
    o.userData.outline = true;
    o.castShadow = false;
    o.receiveShadow = false;
    o.renderOrder = 1;
    mesh.add(o);
    return o;
  }

  /** メッシュ＋輪郭 */
  solid(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], parent: THREE.Object3D, x = 0, y = 0, z = 0, t = 0.9): THREE.Mesh {
    const m = this.mesh(geo, mat, parent, x, y, z);
    if (t > 0) this.outline(m, t);
    return m;
  }
}

/**
 * finishModel の薄い包み。半透明（無敵の点滅など）で深度を書かなくなると輪郭の裏面が体越しに透けて
 * 全体が黒ずむので、そのときは輪郭を隠す。
 */
export function finish(parts: ModelParts): CharacterModel {
  const m = finishModel(parts);
  const hulls: THREE.Object3D[] = [];
  m.root.traverse((o) => {
    if (o.userData.outline) hulls.push(o);
  });
  const setOpacity = m.setOpacity.bind(m);
  let shown = true;
  m.setOpacity = (a: number) => {
    setOpacity(a);
    const v = a > 0.62;
    if (v === shown) return;
    shown = v;
    for (const h of hulls) h.visible = v;
  };
  return m;
}

// ---------------------------------------------------------------- ジオメトリ

/**
 * 回転体。pts は下→上の [半径, 高さ]（閉じた輪にするなら最初と最後を同じ点に）。
 * sx / sz で断面を楕円に。cols は行ごとの頂点色。法線は解析的に出すので継ぎ目で割れない。
 */
export function lathe(pts: V2[], seg: number, sx = 1, sz = 1, cols?: Col[], phi0 = 0, phiLen = TAU): THREE.BufferGeometry {
  const P = pts.length;
  const W = seg + 1;
  const f = pts[0];
  const l = pts[P - 1];
  const closed = P > 3 && Math.abs(f[0] - l[0]) < 1e-6 && Math.abs(f[1] - l[1]) < 1e-6;
  const pos = new Float32Array(P * W * 3);
  const nor = new Float32Array(P * W * 3);
  const col = cols ? new Float32Array(P * W * 3) : null;
  const c0 = new THREE.Color();
  for (let j = 0; j < P; j++) {
    const a = j > 0 ? pts[j - 1] : closed ? pts[P - 2] : pts[j];
    const b = j < P - 1 ? pts[j + 1] : closed ? pts[1] : pts[j];
    const dr = b[0] - a[0];
    const dy = b[1] - a[1];
    const r = pts[j][0];
    const y = pts[j][1];
    if (col && cols) c0.set(cols[j]);
    for (let i = 0; i < W; i++) {
      const ph = phi0 + (i / seg) * phiLen;
      const c = Math.cos(ph);
      const s = Math.sin(ph);
      const k = (j * W + i) * 3;
      pos[k] = r * c * sx;
      pos[k + 1] = y;
      pos[k + 2] = r * s * sz;
      let nx = dy * c * sz;
      let ny = -dr * sx * sz;
      let nz = dy * s * sx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-9) {
        nx = 0;
        ny = y >= 0 ? 1 : -1;
        nz = 0;
      } else {
        nx /= len;
        ny /= len;
        nz /= len;
      }
      nor[k] = nx;
      nor[k + 1] = ny;
      nor[k + 2] = nz;
      if (col) {
        col[k] = c0.r;
        col[k + 1] = c0.g;
        col[k + 2] = c0.b;
      }
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < P - 1; j++) {
    const pole0 = pts[j][0] < 1e-6;
    const pole1 = pts[j + 1][0] < 1e-6;
    for (let i = 0; i < seg; i++) {
      const a = j * W + i;
      const b = a + 1;
      const c = a + W + 1;
      const d = a + W;
      if (!pole1) idx.push(a, d, c);
      if (!pole0) idx.push(a, c, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** 楕円体 */
export function ellGeo(rx: number, ry: number, rz: number, ws: number, hs: number): THREE.BufferGeometry {
  const pts: V2[] = [];
  for (let k = 0; k <= hs; k++) {
    const t = (k / hs) * Math.PI;
    pts.push([Math.sin(t), -ry * Math.cos(t)]);
  }
  return lathe(pts, ws, rx, rz);
}

/** 付け根（y=0）から -y へ len 伸びる先細りのカプセル（両端は半球） */
export function limbGeo(r0: number, r1: number, len: number, ws: number, cs = 4, sz = 1): THREE.BufferGeometry {
  const pts: V2[] = [];
  for (let k = 0; k <= cs; k++) {
    const a = (k / cs) * (Math.PI / 2);
    pts.push([r1 * Math.sin(a), -len - r1 * Math.cos(a)]);
  }
  for (let k = 0; k <= cs; k++) {
    const a = Math.PI / 2 + (k / cs) * (Math.PI / 2);
    pts.push([r0 * Math.sin(a), -r0 * Math.cos(a)]);
  }
  return lathe(pts, ws, 1, sz);
}

/** 先の丸い円錐（+y 向き、底面 y=0 の半径 r、高さ h、先の丸み tip） */
export function coneGeo(r: number, h: number, ws: number, rows = 6, tip = 0.15, sx = 1, sz = 1, bend = 1): THREE.BufferGeometry {
  const pts: V2[] = [[0, -r * 0.35]];
  pts.push([r * 0.75, -r * 0.2]);
  for (let k = 0; k <= rows; k++) {
    const t = k / rows;
    const w = Math.pow(1 - t, bend);
    pts.push([Math.max(r * tip * (1 - t * 0.6), r * w), h * t * (1 - tip * 0.3)]);
  }
  pts.push([0, h]);
  return lathe(pts, ws, sx, sz);
}

/** 輪（首巻き・襟）。半径 R、断面は横 a・縦 b の楕円 */
export function ringGeo(R: number, a: number, b: number, seg: number, rows: number, sx = 1, sz = 1): THREE.BufferGeometry {
  const pts: V2[] = [];
  for (let k = 0; k <= rows; k++) {
    const t = -Math.PI / 2 + (k / rows) * TAU;
    pts.push([R + a * Math.cos(t), b * Math.sin(t)]);
  }
  pts[rows] = [pts[0][0], pts[0][1]];
  return lathe(pts, seg, sx, sz);
}

/** 楕円体（rx,ry,rz）の表面に沿った帯（鉢巻など）。lat0..lat1 は緯度、t は厚み */
export function bandGeo(rx: number, ry: number, rz: number, lat0: number, lat1: number, t: number, seg: number, rows = 3): THREE.BufferGeometry {
  const rho = (rx + rz) / 2;
  const o = 1 + t / rho;
  const i = 1 - 0.4 / rho;
  const p = (k: number, lat: number): V2 => [k * Math.cos(lat), ry * k * Math.sin(lat)];
  const pts: V2[] = [p(i, lat0), p(o, lat0)];
  for (let r = 1; r < rows; r++) pts.push(p(o, lat0 + ((lat1 - lat0) * r) / rows));
  pts.push(p(o, lat1), p(i, lat1));
  for (let r = rows - 1; r > 0; r--) pts.push(p(i, lat0 + ((lat1 - lat0) * r) / rows));
  pts.push(p(i, lat0));
  return lathe(pts, seg, rx, rz);
}

/** 平たい形の押し出し（z 方向に厚み depth、中心を z=0 に） */
export function flatGeo(pts: V2[], depth: number, bevel = 0.35, curve = 2): THREE.BufferGeometry {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: curve,
  });
  g.translate(0, 0, -depth / 2);
  g.deleteAttribute('uv');
  return g;
}

/** 平行移動・回転・拡大をまとめてかける（自身を返す） */
export function xf(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1): THREE.BufferGeometry {
  if (s !== 1) g.scale(s, s, s);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  if (x || y || z) g.translate(x, y, z);
  return g;
}

/** 位置・法線（・頂点色）だけを持つ 1 つのジオメトリに結合 */
export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let nv = 0;
  let ni = 0;
  const withCol = list.every((g) => !!g.getAttribute('color'));
  for (const g of list) {
    const c = g.getAttribute('position').count;
    nv += c;
    ni += g.index ? g.index.count : c;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const col = withCol ? new Float32Array(nv * 3) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const c = g.getAttribute('color');
    for (let i = 0; i < p.count; i++) {
      const k = (vo + i) * 3;
      pos[k] = p.getX(i);
      pos[k + 1] = p.getY(i);
      pos[k + 2] = p.getZ(i);
      if (n) {
        nor[k] = n.getX(i);
        nor[k + 1] = n.getY(i);
        nor[k + 2] = n.getZ(i);
      } else nor[k + 1] = 1;
      if (col && c) {
        col[k] = c.getX(i);
        col[k + 1] = c.getY(i);
        col[k + 2] = c.getZ(i);
      }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < p.count; i++) idx[io++] = i + vo;
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/** 輪郭用: 同じ位置の頂点の法線を平均して t だけ外へ膨らませる（角や継ぎ目でも割れない） */
export function hullGeo(src: THREE.BufferGeometry, t: number): THREE.BufferGeometry {
  const pos = src.getAttribute('position');
  let nor = src.getAttribute('normal');
  if (!nor) {
    const tmp = src.clone();
    tmp.computeVertexNormals();
    nor = tmp.getAttribute('normal');
  }
  const n = pos.count;
  const keys: string[] = new Array(n);
  const acc = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos.getX(i) * 100)},${Math.round(pos.getY(i) * 100)},${Math.round(pos.getZ(i) * 100)}`;
    keys[i] = key;
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    let e = acc.get(key);
    if (!e) {
      e = [0, 0, 0];
      acc.set(key, e);
    }
    let dup = false;
    for (let j = 3; j < e.length; j += 3) {
      if (e[j] * nx + e[j + 1] * ny + e[j + 2] * nz > 0.995) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      e.push(nx, ny, nz);
      e[0] += nx;
      e[1] += ny;
      e[2] += nz;
    }
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const e = acc.get(keys[i]) as number[];
    let dx = e[0];
    let dy = e[1];
    let dz = e[2];
    let l = Math.hypot(dx, dy, dz);
    if (l < 1e-6) {
      dx = nor.getX(i);
      dy = nor.getY(i);
      dz = nor.getZ(i);
      l = Math.hypot(dx, dy, dz) || 1;
    }
    out[i * 3] = pos.getX(i) + (dx / l) * t;
    out[i * 3 + 1] = pos.getY(i) + (dy / l) * t;
    out[i * 3 + 2] = pos.getZ(i) + (dz / l) * t;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  if (src.index) g.setIndex(src.index.clone());
  return g;
}

// ---------------------------------------------------------------- 向き・位置

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** 単位球の方向（yaw: +x から +z 側へ、pitch: 上へ） */
export function sdir(yaw: number, pitch: number, out = new THREE.Vector3()): THREE.Vector3 {
  const cp = Math.cos(pitch);
  return out.set(cp * Math.cos(yaw), Math.sin(pitch), cp * Math.sin(yaw));
}

/** オブジェクトの +y を dir に向ける */
export function aimY(o: THREE.Object3D, dir: THREE.Vector3): void {
  o.quaternion.setFromUnitVectors(Y_AXIS, dir.clone().normalize());
}

/** オブジェクトの +z を dir に向ける */
export function aimZ(o: THREE.Object3D, dir: THREE.Vector3): void {
  o.quaternion.setFromUnitVectors(Z_AXIS, dir.clone().normalize());
}

/** 楕円体の表面（またはその外側 k 倍）の点 */
export function onSurf(s: Surf, yaw: number, pitch: number, k = 1, out = new THREE.Vector3()): THREE.Vector3 {
  sdir(yaw, pitch, out);
  return out.set(s.cx + out.x * s.rx * k, s.cy + out.y * s.ry * k, s.cz + out.z * s.rz * k);
}

/** 楕円体の法線 */
export function surfNormal(s: Surf, yaw: number, pitch: number, out = new THREE.Vector3()): THREE.Vector3 {
  sdir(yaw, pitch, out);
  return out.set(out.x / s.rx, out.y / s.ry, out.z / s.rz).normalize();
}

const _v = new THREE.Vector3();

/** obj の中の点 (x,y,z) を anc（祖先）の座標にする。行列を更新しながら親をたどる */
export function posIn(obj: THREE.Object3D, anc: THREE.Object3D, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  out.set(x, y, z);
  for (let o: THREE.Object3D | null = obj; o && o !== anc; o = o.parent) {
    o.updateMatrix();
    out.applyMatrix4(o.matrix);
  }
  return out;
}

/** 接地判定の点 [オブジェクト, x, y, z, 半径] */
export type Probe = [THREE.Object3D, number, number, number, number];

/**
 * 地上で体ごと回っている姿勢（ダウン・転がり）では、一番低い所が地面に付くよう体を上下させる。
 * 2D 版はダウン中に浮いて見えるので 3D ではここで補正する。
 */
export function groundSpin(rig: Rig, probes: Probe[], p: ModelPose): void {
  if (p.air || Math.abs(p.spin) < 0.01) return;
  let low = Infinity;
  for (let i = 0; i < probes.length; i++) {
    const q = probes[i];
    posIn(q[0], rig.root, q[1], q[2], q[3], _v);
    const y = _v.y - q[4];
    if (y < low) low = y;
  }
  if (Number.isFinite(low)) rig.body.position.y -= low;
}

// ---------------------------------------------------------------- 動くチューブ（尻尾・蛇の体）

/**
 * 中心線 pts と半径 rad で毎フレーム作り直すチューブ（輪郭付き）。update() で頂点だけ書き換える。
 * belly を渡すと ref 方向（腹側）を別の色にする。
 */
export class Tube {
  readonly mesh: THREE.Mesh;
  readonly pts: THREE.Vector3[];
  /** 最初の輪の「腹」の向き（平行移動フレームの基準） */
  readonly ref = new THREE.Vector3(1, 0, 0);
  readonly rad: number[];
  private readonly cos: number[] = [];
  private readonly sin: number[] = [];
  private readonly posA: THREE.BufferAttribute;
  private readonly norA: THREE.BufferAttribute;
  private readonly hullA: THREE.BufferAttribute | null;
  private readonly t: number;
  private readonly T = new THREE.Vector3();
  private readonly N = new THREE.Vector3();
  private readonly B = new THREE.Vector3();
  private readonly cap: [number, number];

  /**
   * belly.half = 0 なら腹の色分けなし。belly.paint を渡すと節 i・周の k ごとに色を上書きできる（模様・先だけ色違いなど。
   * 1 頂点だけ塗ると周りへぼけて小さなひし形になる）。k = -1 は両端のふた
   */
  constructor(
    kit: Kit,
    parent: THREE.Object3D,
    mat: THREE.Material,
    rad: number[],
    radial: number,
    ol: number,
    belly?: { col: Col; back: Col; half: number; paint?: (i: number, k: number) => Col | null },
    cap: [number, number] = [0.9, 0.9],
  ) {
    const n = rad.length;
    this.rad = rad;
    this.t = ol;
    this.cap = cap;
    this.pts = Array.from({ length: n }, () => new THREE.Vector3());
    const ang: number[] = [];
    const isBelly: boolean[] = [];
    const push = (a0: number, a1: number, b: boolean) => {
      const m = Math.max(1, Math.round(((a1 - a0) / TAU) * radial));
      for (let k = 0; k <= m; k++) {
        ang.push(a0 + ((a1 - a0) * k) / m);
        isBelly.push(b);
      }
    };
    if (belly && belly.half > 0) {
      push(0, belly.half, true);
      push(belly.half, TAU - belly.half, false);
      push(TAU - belly.half, TAU, true);
    } else push(0, TAU, false);
    for (const a of ang) {
      this.cos.push(Math.cos(a));
      this.sin.push(Math.sin(a));
    }
    const R = ang.length;
    const nv = 2 + n * R;
    const idx: number[] = [];
    for (let k = 0; k < R - 1; k++) idx.push(0, 1 + k + 1, 1 + k);
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < R - 1; k++) {
        const a = 1 + i * R + k;
        const b = a + 1;
        const c = a + R + 1;
        const d = a + R;
        idx.push(a, b, c, a, c, d);
      }
    }
    const L = 1 + (n - 1) * R;
    for (let k = 0; k < R - 1; k++) idx.push(nv - 1, L + k, L + k + 1);
    const g = new THREE.BufferGeometry();
    this.posA = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
    this.norA = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
    this.posA.setUsage(THREE.DynamicDrawUsage);
    this.norA.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posA);
    g.setAttribute('normal', this.norA);
    if (belly) {
      const c = new Float32Array(nv * 3);
      const cb = new THREE.Color(belly.col);
      const ck = new THREE.Color(belly.back);
      const cp = new THREE.Color();
      for (let v = 0; v < nv; v++) {
        const k = v === 0 || v === nv - 1 ? -1 : (v - 1) % R;
        const i = v === 0 ? 0 : v === nv - 1 ? n - 1 : Math.floor((v - 1) / R);
        const pc = belly.paint?.(i, k);
        const cc = pc != null ? cp.set(pc) : k >= 0 && isBelly[k] ? cb : ck;
        c[v * 3] = cc.r;
        c[v * 3 + 1] = cc.g;
        c[v * 3 + 2] = cc.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    g.setIndex(idx);
    this.mesh = kit.mesh(g, mat, parent);
    this.mesh.frustumCulled = false;
    if (ol > 0) {
      const hg = new THREE.BufferGeometry();
      this.hullA = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
      this.hullA.setUsage(THREE.DynamicDrawUsage);
      hg.setAttribute('position', this.hullA);
      hg.setIndex(idx);
      const o = new THREE.Mesh(hg, outlineMat(INK));
      o.name = 'outline';
      o.userData.outline = true;
      o.frustumCulled = false;
      o.renderOrder = 1;
      this.mesh.add(o);
    } else this.hullA = null;
  }

  update(): void {
    const P = this.pts;
    const n = P.length;
    const R = this.cos.length;
    const pos = this.posA.array as Float32Array;
    const nor = this.norA.array as Float32Array;
    const hp = this.hullA ? (this.hullA.array as Float32Array) : null;
    const T = this.T;
    const N = this.N;
    const B = this.B;
    const t = this.t;
    const nv = 2 + n * R;
    for (let i = 0; i < n; i++) {
      const a = P[i > 0 ? i - 1 : 0];
      const b = P[i < n - 1 ? i + 1 : n - 1];
      T.subVectors(b, a);
      if (T.lengthSq() < 1e-12) T.set(0, 1, 0);
      T.normalize();
      if (i === 0) N.copy(this.ref);
      N.addScaledVector(T, -N.dot(T));
      if (N.lengthSq() < 1e-8) N.set(T.y, -T.x, 0).addScaledVector(T, 0);
      if (N.lengthSq() < 1e-8) N.set(0, 0, 1);
      N.normalize();
      B.crossVectors(T, N);
      const r = this.rad[i];
      const p = P[i];
      const base = 1 + i * R;
      for (let k = 0; k < R; k++) {
        const c = this.cos[k];
        const s = this.sin[k];
        const dx = N.x * c + B.x * s;
        const dy = N.y * c + B.y * s;
        const dz = N.z * c + B.z * s;
        const o = (base + k) * 3;
        pos[o] = p.x + dx * r;
        pos[o + 1] = p.y + dy * r;
        pos[o + 2] = p.z + dz * r;
        nor[o] = dx;
        nor[o + 1] = dy;
        nor[o + 2] = dz;
        if (hp) {
          hp[o] = p.x + dx * (r + t);
          hp[o + 1] = p.y + dy * (r + t);
          hp[o + 2] = p.z + dz * (r + t);
        }
      }
      if (i === 0 || i === n - 1) {
        const sgn = i === 0 ? -1 : 1;
        const o = i === 0 ? 0 : (nv - 1) * 3;
        const k = this.cap[i === 0 ? 0 : 1];
        pos[o] = p.x + T.x * r * k * sgn;
        pos[o + 1] = p.y + T.y * r * k * sgn;
        pos[o + 2] = p.z + T.z * r * k * sgn;
        nor[o] = T.x * sgn;
        nor[o + 1] = T.y * sgn;
        nor[o + 2] = T.z * sgn;
        if (hp) {
          hp[o] = p.x + T.x * (r * k + t) * sgn;
          hp[o + 1] = p.y + T.y * (r * k + t) * sgn;
          hp[o + 2] = p.z + T.z * (r * k + t) * sgn;
        }
      }
    }
    this.posA.needsUpdate = true;
    this.norA.needsUpdate = true;
    if (this.hullA) this.hullA.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- デカール（表面に貼る平たい形）

/** 楕円体の表面（cyl = true なら縦の円柱。そのとき pitch は中心からの高さ） */
export class Surf {
  constructor(
    readonly cx: number,
    readonly cy: number,
    readonly cz: number,
    readonly rx: number,
    readonly ry: number,
    readonly rz: number,
    readonly cyl = false,
  ) {}
}

/** 貼る位置（u は見る側の右 = 顔の中心へ、v は上。単位はワールド） */
export interface At {
  yaw: number;
  pitch: number;
  rot?: number;
  mirror?: boolean;
  lift?: number;
}

const _c = new THREE.Color();

/** デカールを溜めて 1 つのジオメトリにする */
export class Decal {
  private readonly P: number[] = [];
  private readonly N: number[] = [];
  private readonly C: number[] = [];
  private readonly I: number[] = [];
  private col = false;

  constructor(readonly s: Surf) {}

  get empty(): boolean {
    return this.I.length === 0;
  }

  private vert(at: At, u: number, v: number, color?: THREE.Color): number {
    const r = at.rot ?? 0;
    const cr = Math.cos(r);
    const sr = Math.sin(r);
    let x = u * cr - v * sr;
    const y = u * sr + v * cr;
    if (at.mirror) x = -x;
    const s = this.s;
    const lift = at.lift ?? 0.15;
    let px: number;
    let py: number;
    let pz: number;
    let nx: number;
    let ny: number;
    let nz: number;
    if (s.cyl) {
      const R = (s.rx + s.rz) / 2;
      const a = at.yaw - x / R;
      nx = Math.cos(a);
      ny = 0;
      nz = Math.sin(a);
      px = s.cx + (s.rx + lift) * nx;
      py = s.cy + at.pitch + y;
      pz = s.cz + (s.rz + lift) * nz;
    } else {
      const cy = Math.cos(at.yaw);
      const sy = Math.sin(at.yaw);
      const cp = Math.cos(at.pitch);
      const sp = Math.sin(at.pitch);
      const rho = (s.rx + s.ry + s.rz) / 3;
      const a = x / rho;
      const b = y / rho;
      let qx = cp * cy + a * sy - b * sp * cy;
      let qy = sp + b * cp;
      let qz = cp * sy - a * cy - b * sp * sy;
      const ql = Math.hypot(qx, qy, qz);
      qx /= ql;
      qy /= ql;
      qz /= ql;
      nx = qx / s.rx;
      ny = qy / s.ry;
      nz = qz / s.rz;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl;
      ny /= nl;
      nz /= nl;
      px = s.cx + s.rx * qx + nx * lift;
      py = s.cy + s.ry * qy + ny * lift;
      pz = s.cz + s.rz * qz + nz * lift;
    }
    this.P.push(px, py, pz);
    this.N.push(nx, ny, nz);
    if (color) {
      this.col = true;
      this.C.push(color.r, color.g, color.b);
    } else this.C.push(1, 1, 1);
    return this.P.length / 3 - 1;
  }

  private tri(at: At, a: number, b: number, c: number): void {
    if (at.mirror) this.I.push(a, c, b);
    else this.I.push(a, b, c);
  }

  /** 中心から放射状に張って塗る（ring は反時計回りの輪郭） */
  fill(at: At, ring: V2[], center: V2 = [0, 0], rings = 2, color?: (u: number, v: number) => THREE.Color): this {
    const m = ring.length;
    // 大きい形は輪を増やす（平らな三角形が曲面の下に沈まないように）
    let far = 0;
    for (const q of ring) far = Math.max(far, Math.hypot(q[0] - center[0], q[1] - center[1]));
    rings = Math.max(rings, Math.ceil(far / 2));
    const c0 = this.vert(at, center[0], center[1], color?.(center[0], center[1]));
    let prev: number[] = [];
    for (let k = 1; k <= rings; k++) {
      const f = k / rings;
      const cur: number[] = [];
      for (let j = 0; j < m; j++) {
        const u = center[0] + (ring[j][0] - center[0]) * f;
        const v = center[1] + (ring[j][1] - center[1]) * f;
        cur.push(this.vert(at, u, v, color?.(u, v)));
      }
      for (let j = 0; j < m; j++) {
        const j2 = (j + 1) % m;
        if (k === 1) this.tri(at, c0, cur[j], cur[j2]);
        else {
          this.tri(at, prev[j], cur[j], cur[j2]);
          this.tri(at, prev[j], cur[j2], prev[j2]);
        }
      }
      prev = cur;
    }
    return this;
  }

  /** 楕円（中心 cu,cv、半径 w,h） */
  ellipse(at: At, cu: number, cv: number, w: number, h: number, seg = 20, rings = 2, color?: (u: number, v: number) => THREE.Color): this {
    return this.fill(at, ellPts(cu, cv, w, h, seg), [cu, cv], rings, color);
  }

  /** 折れ線に沿った帯（width は太さ、関数なら 0..1 の位置ごと） */
  line(at: At, pts: V2[], width: number | ((s: number) => number)): this {
    const n = pts.length;
    if (n < 2) return this;
    const cum: number[] = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[n - 1] || 1;
    let prevL = -1;
    let prevR = -1;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0];
      let ty = b[1] - a[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const w = (typeof width === 'number' ? width : width(cum[i] / total)) / 2;
      const L = this.vert(at, pts[i][0] - ty * w, pts[i][1] + tx * w);
      const R = this.vert(at, pts[i][0] + ty * w, pts[i][1] - tx * w);
      if (i > 0) {
        this.tri(at, prevR, R, L);
        this.tri(at, prevR, L, prevL);
      }
      prevL = L;
      prevR = R;
    }
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setIndex(this.I);
    return g;
  }
}

export function ellPts(cu: number, cv: number, w: number, h: number, seg = 20): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU;
    out.push([cu + w * Math.cos(a), cv + h * Math.sin(a)]);
  }
  return out;
}

/** 弧の点列（楕円の a0→a1） */
export function arcPts(cu: number, cv: number, w: number, h: number, a0: number, a1: number, n = 10): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cu + w * Math.cos(a), cv + h * Math.sin(a)]);
  }
  return out;
}

/** 両端が細い太さ */
export const taper =
  (w: number, min = 0.25) =>
  (s: number): number =>
    w * (min + (1 - min) * Math.sin(Math.PI * s));

// ---------------------------------------------------------------- 顔

export interface EyeSpec {
  /** +z 側の目の位置（反対側は鏡像） */
  yaw: number;
  pitch: number;
  /** 虹彩の半径 */
  w: number;
  h: number;
  rot?: number;
  /** 虹彩の上・下の色（縦グラデーション） */
  top: Col;
  bot: Col;
  /** 瞳 [幅, 高さ, 上下, 色] */
  pupil?: [number, number, number, Col];
  /** 白目・縁 [太さ, 色] */
  white?: [number, Col];
  /** 上を斜めに切る [高さ(h 比), 傾き(+ で内側が下がる=鋭い)] */
  cut?: [number, number];
  /** 上まぶたの線の太さ（0 で無し） */
  lid?: number;
  /** 目尻のまつげ */
  lash?: number;
  /** ハイライトの大きさ（1 = 標準） */
  hl?: number;
  /** 閉じた目・><の線の色（顔が暗い色のときは明るく） */
  shut?: Col;
}

export interface FaceSpec {
  s: Surf;
  /** 口・鼻を貼る面（鼻先のある顔など。既定は s） */
  ms?: Surf;
  eye: EyeSpec;
  nose?: { pitch: number; w: number; h: number; col: Col; tri?: boolean; lift?: number };
  mouth?: { pitch: number; w: number; kind: 'w' | 'smile' | 'cat' | 'none'; thick?: number; open: [number, number]; gap?: number };
  blush?: { yaw: number; pitch: number; w: number; h: number; col: Col };
  /** 攻撃時の眉 [上へのずれ(h 比), 太さ] */
  brow?: [number, number];
  line?: Col;
}

export interface Face {
  set(e: Expr): void;
  /** 開いた目のメッシュ（まばたき以外で表示） */
  open: THREE.Object3D[];
}

function eyeRing(w: number, h: number, n: number, cut?: [number, number]): V2[] {
  const out: V2[] = [];
  const y0 = cut ? cut[0] * h : 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    let u = w * Math.cos(a);
    let v = h * Math.sin(a);
    if (cut && v > y0 - cut[1] * u) {
      const den = h * Math.sin(a) + cut[1] * w * Math.cos(a);
      if (den > 1e-6) {
        const t = y0 / den;
        if (t < 1) {
          u *= t;
          v *= t;
        }
      }
    }
    out.push([u, v]);
  }
  return out;
}

/** 目・口・鼻・頬と表情の切り替え */
export function buildFace(kit: Kit, parent: THREE.Object3D, f: FaceSpec): Face {
  const s = f.s;
  const e = f.eye;
  const line = f.line ?? LINE;
  const seg = kit.n(24, 14);
  const D = () => new Decal(s);
  const white = D();
  const iris = D();
  const pupil = D();
  const hl = D();
  const lid = D();
  const closed = D();
  const hurt = D();
  const brow = D();
  const top = new THREE.Color(e.top);
  const bot = new THREE.Color(e.bot);
  const grad = (_u: number, v: number) => _c.copy(bot).lerp(top, Math.pow(clamp01((v / e.h + 1) / 2), 1.15));
  const ring = eyeRing(e.w, e.h, seg, e.cut);
  const hk = e.hl ?? 1;
  for (const side of [1, -1]) {
    const at: At = { yaw: e.yaw * side, pitch: e.pitch, rot: e.rot ?? 0, mirror: side < 0 };
    if (e.white) {
      const pad = e.white[0];
      white.fill({ ...at, lift: 0.18 }, eyeRing(e.w + pad, e.h + pad, seg, e.cut ? [e.cut[0] * (e.h / (e.h + pad)) + pad / (e.h + pad), e.cut[1]] : undefined), [0, 0], 2);
    }
    iris.fill({ ...at, lift: 0.28 }, ring, [0, 0], 3, grad);
    if (e.pupil) {
      const [pw, ph, pdy] = e.pupil;
      pupil.fill(
        { ...at, lift: 0.36 },
        eyeRing(pw, ph, seg)
          .map(([u, v]): V2 => [u, v + pdy])
          .map(([u, v]): V2 => clipTo(ring, u, v)),
        [0, pdy],
        2,
      );
    }
    // ハイライト（どちらの目も画面の右上）
    const hx = e.w * 0.3 * side;
    hl.ellipse({ ...at, lift: 0.46 }, hx, e.h * 0.36, e.w * 0.36 * hk, e.h * 0.28 * hk, 14, 1);
    hl.ellipse({ ...at, lift: 0.46 }, -hx * 1.05, -e.h * 0.46, e.w * 0.17 * hk, e.w * 0.17 * hk, 10, 1);
    // 上まぶた
    if (e.lid) {
      const pts: V2[] = [];
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const a = Math.PI * (0.97 - (0.9 * i) / n);
        const k = Math.round((a / TAU) * seg) % seg;
        const p = ring[k];
        pts.push([p[0] * 1.04, p[1] * 1.04 + e.lid * 0.25]);
      }
      if (e.lash) {
        const p0 = pts[0];
        pts.unshift([p0[0] - e.lash * 0.9, p0[1] + e.lash * 0.35]);
      }
      lid.line({ ...at, lift: 0.4 }, pts, (t) => e.lid! * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.25))));
    }
    // 閉じた目・><
    closed.line({ ...at, lift: 0.3 }, arcPts(0, -e.h * 0.1, e.w * 1.05, e.h * 0.32, Math.PI * 1.05, Math.PI * 1.95, 10), taper(Math.max(1, e.w * 0.3), 0.4));
    hurt.line(
      { ...at, lift: 0.3 },
      [
        [-e.w * 0.85, e.h * 0.55],
        [e.w * 0.75, 0],
        [-e.w * 0.85, -e.h * 0.55],
      ],
      Math.max(1, e.w * 0.32),
    );
    if (f.brow) {
      const [by, bt] = f.brow;
      brow.line(
        { ...at, lift: 0.3 },
        [
          [-e.w * 1.05, e.h * (1 + by) + e.h * 0.28],
          [e.w * 0.95, e.h * (1 + by) - e.h * 0.05],
        ],
        taper(bt, 0.45),
      );
    }
  }
  const mk = (d: Decal, mat: THREE.Material, order = 2): THREE.Mesh | null => (d.empty ? null : kit.deco(d.build(), mat, parent, 0, 0, 0, order));
  const lineMat = kit.flat(line);
  const mWhite = e.white ? mk(white, kit.flat(e.white[1])) : null;
  const mIris = mk(iris, kit.flat('#ffffff', { vc: true }), 3);
  const mPupil = e.pupil ? mk(pupil, kit.flat(e.pupil[3]), 4) : null;
  const mHl = mk(hl, kit.flat('#ffffff'), 5);
  const mLid = mk(lid, lineMat, 4);
  const shutMat = e.shut ? kit.flat(e.shut) : lineMat;
  const mClosed = mk(closed, shutMat);
  const mHurt = mk(hurt, shutMat);
  const mBrow = mk(brow, lineMat);
  const open = [mWhite, mIris, mPupil, mHl, mLid].filter((m): m is THREE.Mesh => !!m);

  // 鼻・口・頬
  let mMouth: THREE.Mesh | null = null;
  let mOpen: THREE.Mesh | null = null;
  const DM = () => new Decal(f.ms ?? s);
  if (f.nose) {
    const n = f.nose;
    const d = DM();
    const pts: V2[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const k = n.tri ? 0.72 + 0.28 * Math.sin(a) : 1;
      pts.push([n.w * Math.cos(a) * k, n.h * Math.sin(a)]);
    }
    d.fill({ yaw: 0, pitch: n.pitch, lift: n.lift ?? 0.3 }, pts, [0, 0], 2);
    kit.deco(d.build(), kit.toon(n.col), parent);
  }
  if (f.mouth) {
    const m = f.mouth;
    const at: At = { yaw: 0, pitch: m.pitch, lift: 0.3 };
    const th = m.thick ?? 0.9;
    if (m.kind !== 'none') {
      const d = DM();
      const w = m.w;
      if (m.kind === 'w' || m.kind === 'cat') {
        const pts = [...arcPts(-w / 2, 0, w / 2, w * 0.42, Math.PI * 1.02, Math.PI * 1.98, 8), ...arcPts(w / 2, 0, w / 2, w * 0.42, Math.PI * 1.02, Math.PI * 1.98, 8).slice(1)];
        d.line(at, pts, taper(th, 0.5));
        if (m.kind === 'cat')
          d.line(
            at,
            [
              [0, -w * 0.05],
              [0, m.gap ?? w * 0.55],
            ],
            th * 0.9,
          );
      } else d.line(at, arcPts(0, w * 0.35, w, w * 0.62, Math.PI * 1.15, Math.PI * 1.85, 12), taper(th, 0.4));
      mMouth = kit.deco(d.build(), lineMat, parent);
    }
    const [ow, oh] = m.open;
    const pts: V2[] = [...arcPts(0, 0, ow, oh, Math.PI, TAU, 12), ...arcPts(0, 0, ow, oh * 0.18, 0, Math.PI, 8).slice(1, -1)];
    const d = DM().fill({ ...at, pitch: m.pitch - 0.02, lift: 0.26 }, pts, [0, -oh * 0.4], 2);
    mOpen = kit.deco(d.build(), kit.flat('#5e1830'), parent);
    const tg = DM().ellipse({ ...at, pitch: m.pitch - 0.02, lift: 0.34 }, 0, -oh * 0.62, ow * 0.52, oh * 0.3, 12, 1);
    kit.deco(tg.build(), kit.flat('#ff8aa2'), mOpen);
  }
  if (f.blush) {
    const b = f.blush;
    const d = D();
    for (const side of [1, -1]) d.ellipse({ yaw: b.yaw * side, pitch: b.pitch, lift: 0.22, mirror: side < 0 }, 0, 0, b.w, b.h, 16, 1);
    kit.deco(d.build(), kit.toon(b.col), parent);
  }
  const show = (m: THREE.Object3D | null, v: boolean) => {
    if (m) m.visible = v;
  };
  return {
    open,
    set(x) {
      const o = x === 'normal' || x === 'attack';
      for (const m of open) m.visible = o;
      show(mClosed, x === 'blink');
      show(mHurt, x === 'hurt');
      show(mBrow, x === 'attack');
      const oo = x === 'attack' || x === 'hurt';
      show(mOpen, oo);
      show(mMouth, !oo || !mOpen);
    },
  };
}

/** 点を輪郭 ring（原点中心の星形）の内側へ収める */
function clipTo(ring: V2[], u: number, v: number): V2 {
  const a = Math.atan2(v, u);
  const n = ring.length;
  const k = Math.round(((a < 0 ? a + TAU : a) / TAU) * n) % n;
  const lim = Math.hypot(ring[k][0], ring[k][1]) * 0.9;
  const d = Math.hypot(u, v);
  if (d <= lim || d < 1e-6) return [u, v];
  return [(u / d) * lim, (v / d) * lim];
}

// ---------------------------------------------------------------- 手足

export interface LimbSpec {
  /** 半径 [付け根, 関節, 先] */
  r: [number, number, number];
  col: Col;
  /** 手先・足先の楕円体 [x, y, z] */
  end: [number, number, number];
  endCol?: Col;
  /** 足先の前へのずれ */
  endX?: number;
  ol?: number;
}

/** 腕のメッシュ（伸縮アニメ用）。配列は [前, 奥] */
export interface ArmParts {
  upper: THREE.Mesh[];
  fore: THREE.Mesh[];
  hands: THREE.Mesh[];
}

/** 腕（上腕・前腕・手）を両側に付ける */
export function addArms(kit: Kit, rig: Rig, s: LimbSpec): ArmParts {
  armOrder(rig);
  const sp = rig.spec;
  const ws = kit.n(14, 8);
  const ol = s.ol ?? 0.75;
  const up = kit.lod('arm-up', (k) => limbGeo(s.r[0], s.r[1], sp.upperArm, Math.round(ws * k), 3));
  const fore = kit.lod('arm-fore', (k) => limbGeo(s.r[1], s.r[2], sp.foreArm, Math.round(ws * k), 3));
  const hand = kit.lod('arm-hand', (k) => ellGeo(s.end[0], s.end[1], s.end[2], kit.n(16 * k, 7), kit.n(12 * k, 5)));
  const mat = kit.toon(s.col);
  const hmat = kit.toon(s.endCol ?? s.col);
  const out: ArmParts = { upper: [], fore: [], hands: [] };
  for (const [sh, el, hd] of [
    [rig.fsh, rig.fel, rig.fhand],
    [rig.bsh, rig.bel, rig.bhand],
  ] as const) {
    out.upper.push(kit.solid(up, mat, sh, 0, 0, 0, ol));
    out.fore.push(kit.solid(fore, mat, el, 0, 0, 0, ol));
    out.hands.push(kit.solid(hand, hmat, hd, s.endX ?? 0, 0, 0, ol));
  }
  return out;
}

/**
 * 攻撃中にまっすぐ伸ばした腕を伸ばす（ちびキャラの短い腕でもパンチが見えるように）。
 * 伸びるのは上腕・前腕の長さだけで、手（拳）は丸いまま少し大きくなる。
 */
export function stretchArms(rig: Rig, a: ArmParts, p: ModelPose, k = 0.55): void {
  const sp = rig.spec;
  const atk = p.expression === 'attack' ? 1 : 0;
  for (let i = 0; i < 2; i++) {
    const el = i === 0 ? p.fel : p.bel;
    const e = atk * clamp01((1.05 - el) / 0.85);
    const s = 1 + k * e;
    a.upper[i].scale.y = s;
    a.fore[i].scale.y = s;
    (i === 0 ? rig.fel : rig.bel).position.y = -sp.upperArm * s;
    (i === 0 ? rig.fhand : rig.bhand).position.y = -sp.foreArm * s;
    a.hands[i].scale.setScalar(1 + 0.18 * e);
  }
}

/** 脚（太もも・すね＋足）を両側に付ける。足の裏が足首の関節（地面）に来る */
export function addLegs(kit: Kit, rig: Rig, s: LimbSpec): THREE.Mesh[] {
  const sp = rig.spec;
  const ws = kit.n(14, 8);
  const ol = s.ol ?? 0.8;
  const fh = s.end[1];
  const thigh = kit.lod('leg-up', (k) => limbGeo(s.r[0], s.r[1], sp.thigh, Math.round(ws * k), 3));
  const same = !s.endCol || new THREE.Color(s.endCol).equals(new THREE.Color(s.col));
  const footG = (k: number) => {
    const f = ellGeo(s.end[0], s.end[1], s.end[2], kit.n(16 * k, 7), kit.n(12 * k, 5));
    f.translate(s.endX ?? 0, fh, 0);
    return f;
  };
  const shin = kit.lod('leg-shin', (k) => {
    const g = limbGeo(s.r[1], s.r[2], Math.max(0.5, sp.shin - fh), Math.round(ws * k), 3);
    if (!same) return g;
    return merge([g, footG(k).translate(0, -sp.shin, 0)]);
  });
  const foot = same ? null : kit.lod('leg-foot', footG);
  const mat = kit.toon(s.col);
  const out: THREE.Mesh[] = [];
  for (const [hip, knee, ft] of [
    [rig.fhip, rig.fknee, rig.ffoot],
    [rig.bhip, rig.bknee, rig.bfoot],
  ] as const) {
    kit.solid(thigh, mat, hip, 0, 0, 0, ol);
    const m = kit.solid(shin, mat, knee, 0, 0, 0, ol);
    out.push(foot ? kit.solid(foot, kit.toon(s.endCol as Col), ft, 0, 0, 0, ol) : m);
  }
  return out;
}

// ---------------------------------------------------------------- 小物

/** 結び目（中央の玉＋上下の輪）。+x が前、結び目は -x（後ろ）へ張り出す */
export function knotGeo(s: number, seg: number): THREE.BufferGeometry {
  const c = ellGeo(s * 0.62, s * 0.62, s * 0.7, seg, Math.round(seg * 0.7));
  const a = xf(ellGeo(s * 0.85, s * 0.42, s * 0.5, seg, Math.round(seg * 0.7)), -s * 0.55, s * 0.45, 0, 0, 0, 0.55);
  const b = xf(ellGeo(s * 0.85, s * 0.42, s * 0.5, seg, Math.round(seg * 0.7)), -s * 0.55, -s * 0.45, 0, 0, 0, -0.55);
  return merge([c, a, b]);
}

/** 鈴（金の玉＋切れ込み） */
export function addBell(kit: Kit, parent: THREE.Object3D, r: number, x: number, y: number, z: number): THREE.Mesh {
  const seg = kit.n(16, 10);
  const m = kit.solid(
    kit.lod('bell', (k) => ellGeo(r, r, r, Math.round(seg * k), Math.round(seg * 0.75 * k))),
    kit.toon('#f5c542', { emissive: '#4a3000' }),
    parent,
    x,
    y,
    z,
    0.45,
  );
  // 鈴の切れ込み
  const slit = kit.geo('bell-slit', () => xf(limbGeo(r * 0.14, r * 0.14, r * 0.6, 6, 2), 0, r * 0.3, 0));
  kit.deco(slit, kit.flat('#6a4200'), m, r * 0.93, -r * 0.1, 0);
  return m;
}

/** たなびく布の付け根 */
export function anchor(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'scarf-anchor';
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** 首巻き（輪＋後ろの結び目）。返り値の anchor が布の付け根 */
export function neckScarf(
  kit: Kit,
  parent: THREE.Object3D,
  col: Col,
  o: { y: number; x?: number; R: number; a: number; b: number; sx?: number; sz?: number; knot?: number; tilt?: number },
): { ring: THREE.Mesh; anchor: THREE.Group } {
  const g = kit.group(parent, o.x ?? 0, o.y, 0);
  g.rotation.z = o.tilt ?? 0;
  const mat = kit.toon(col);
  const ring = kit.solid(
    kit.lod('scarf-ring', (k) => ringGeo(o.R, o.a, o.b, kit.n(28 * k, 10), kit.n(10 * k, 6), o.sx ?? 1, o.sz ?? 1)),
    mat,
    g,
    0,
    0,
    0,
    0.7,
  );
  const ks = o.knot ?? o.b * 1.25;
  const kx = -(o.R + o.a * 0.6) * (o.sx ?? 1);
  kit.solid(
    kit.lod('scarf-knot', (k) => knotGeo(ks, kit.n(12 * k, 6))),
    mat,
    g,
    kx,
    -o.b * 0.2,
    0,
    0.6,
  );
  return { ring, anchor: anchor(g, kx - ks * 0.5, -o.b * 0.3, 0) };
}

/** 楕円体の頭に沿った鉢巻（後ろに結び目）。返り値の anchor が布の付け根 */
export function headBand(kit: Kit, parent: THREE.Object3D, s: Surf, col: Col, o: { lat0: number; lat1: number; t: number; tilt: number; knot: number }): { band: THREE.Mesh; anchor: THREE.Group } {
  const g = kit.group(parent, s.cx, s.cy, s.cz);
  g.rotation.z = o.tilt;
  const mat = kit.toon(col);
  const band = kit.solid(
    kit.lod('headband', (k) => bandGeo(s.rx, s.ry, s.rz, o.lat0, o.lat1, o.t, kit.n(32 * k, 12), 3)),
    mat,
    g,
    0,
    0,
    0,
    0.6,
  );
  const mid = (o.lat0 + o.lat1) / 2;
  const kx = -Math.cos(mid) * (s.rx + o.t) - o.knot * 0.25;
  const ky = Math.sin(mid) * s.ry;
  kit.solid(
    kit.lod('band-knot', (k) => knotGeo(o.knot, kit.n(12 * k, 6))),
    mat,
    g,
    kx,
    ky,
    0,
    0.6,
  );
  return { band, anchor: anchor(g, kx - o.knot * 0.6, ky - o.knot * 0.2, 0) };
}

/** 炎（下が丸く上が尖る）。+y 向き */
export function flameGeo(r: number, h: number, ws: number): THREE.BufferGeometry {
  const pts: V2[] = [];
  const n = 6;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * (Math.PI / 2);
    pts.push([r * Math.sin(a), -r * Math.cos(a)]);
  }
  const m = 7;
  for (let k = 1; k <= m; k++) {
    const t = k / m;
    pts.push([r * Math.pow(Math.cos((t * Math.PI) / 2), 1.3), h * t]);
  }
  return lathe(pts, ws);
}

/** 多角形の辺を細かく割る（デカールが面に沿うように） */
export function polyPts(pts: V2[], sub = 6): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    for (let k = 0; k < sub; k++) out.push([a[0] + ((b[0] - a[0]) * k) / sub, a[1] + ((b[1] - a[1]) * k) / sub]);
  }
  return out;
}

/** 頭（カメラ側へ LOOK だけ向けた入れ物＋楕円体の頭）。返り値の look に顔や耳を付ける */
export function addHead(kit: Kit, rig: Rig, s: Surf, mat: THREE.Material, t = 1.05, look = LOOK): THREE.Group {
  const g = kit.group(rig.head);
  g.rotation.y = -look;
  const m = kit.solid(
    kit.lod('head', (k) => ellGeo(s.rx, s.ry, s.rz, kit.n(32 * k, 12), kit.n(24 * k, 9))),
    mat,
    g,
    s.cx,
    s.cy,
    s.cz,
    t,
  );
  m.name = 'head';
  return g;
}

/** 胴（楕円体） */
export function addBody(kit: Kit, parent: THREE.Object3D, s: Surf, mat: THREE.Material | THREE.Material[], t = 1): THREE.Mesh {
  return kit.solid(
    kit.lod('body', (k) => ellGeo(s.rx, s.ry, s.rz, kit.n(28 * k, 10), kit.n(20 * k, 8))),
    mat,
    parent,
    s.cx,
    s.cy,
    s.cz,
    t,
  );
}

/** 鬼火・人魂（外側は加算の青い炎、内側は白い芯）。+y が炎の先 */
export function addFlame(kit: Kit, parent: THREE.Object3D, r: number, h: number, col: Col, core = '#f2fdff'): THREE.Group {
  const g = kit.group(parent);
  const ws = kit.n(14, 8);
  const outer = kit.deco(
    kit.geo(`flame-o${r}`, () => flameGeo(r, h, ws)),
    kit.flat(col, { add: true, opacity: 0.95 }),
    g,
  );
  outer.renderOrder = 2;
  kit.deco(
    kit.geo(`flame-i${r}`, () => flameGeo(r * 0.55, h * 0.55, ws)),
    kit.flat(core),
    g,
    0,
    -r * 0.2,
    0,
  );
  const halo = kit.deco(
    kit.geo(`flame-h${r}`, () => ellGeo(r * 1.6, r * 1.9, r * 1.6, ws, Math.round(ws * 0.7))),
    kit.flat(col, { add: true, opacity: 0.13 }),
    g,
    0,
    r * 0.5,
    0,
  );
  halo.renderOrder = 1;
  return g;
}

/** 炎のゆらめき（毎フレーム） */
export function flicker(g: THREE.Object3D, time: number, seed: number): void {
  const a = Math.sin(time * 0.45 + seed * 1.7);
  const b = Math.sin(time * 0.71 + seed * 2.3);
  g.scale.set(1 + b * 0.06, 1 + a * 0.14, 1 + b * 0.06);
}

/** 耳の内側（耳の前面 ±phi の範囲に沿わせた薄い面）。profile は耳と同じ輪郭、y0..y1 で切る */
export function earInnerGeo(profile: V2[], y0: number, y1: number, seg: number, sx: number, sz: number, phi = 0.62): THREE.BufferGeometry {
  const pts: V2[] = [];
  const at = (y: number): number => {
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1];
      const b = profile[i];
      if ((a[1] <= y && y <= b[1]) || (b[1] <= y && y <= a[1])) {
        const t = b[1] === a[1] ? 0 : (y - a[1]) / (b[1] - a[1]);
        return a[0] + (b[0] - a[0]) * t;
      }
    }
    return 0;
  };
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    pts.push([at(y) * 1.035 + 0.12, y]);
  }
  return lathe(pts, seg, sx, sz, undefined, -phi, phi * 2);
}

/** 爪（3 本、+y の先へ向く）。手首の座標で (x, y) の位置に */
export function clawsGeo(x: number, y: number, spread: number, r: number, h: number): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  for (const z of [-spread, 0, spread]) list.push(xf(coneGeo(r, h, 6, 2, 0.15), x, y, z, 0, 0, Math.PI + 0.35));
  return merge(list);
}

/**
 * 腕を高く上げたとき大きな頭にめり込まないよう、外（前の腕は +z、奥の腕は -z）へ開く量。
 * a = 体の座標での腕の向き（torso.rotation.z + sh.rotation.z）。rotation.x に入れる（前の腕は負）
 */
export function armOut(a: number, k = 0.6): number {
  return k * clamp01((Math.abs(a) - 1.8) / 1.1);
}

/** 肩の回転順を Z→X にする（rotation.x が腕の向きに関係なく「外へ開く」になる） */
export function armOrder(rig: Rig): void {
  rig.fsh.rotation.order = 'ZXY';
  rig.bsh.rotation.order = 'ZXY';
}

/** 両腕に armOut をかける（rotation.x を毎フレーム上書き） */
export function clearHead(r: Rig, k = 0.6): void {
  r.fsh.rotation.x = -armOut(r.torso.rotation.z + r.fsh.rotation.z, k);
  r.bsh.rotation.x = armOut(r.torso.rotation.z + r.bsh.rotation.z, k);
}

/**
 * 形を +y の軸に沿って曲げる（高さ h で curl ラジアン、+x 側へ巻く）。炎の房・冠羽など。
 * 法線は計算し直す
 */
export function bendGeo(g: THREE.BufferGeometry, curl: number, h: number): THREE.BufferGeometry {
  const R = h / curl;
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    if (y <= 0) continue;
    const th = y / R;
    p.setXY(i, R - (R - x) * Math.cos(th), (R - x) * Math.sin(th));
  }
  g.computeVertexNormals();
  return g;
}

/** ぎざぎざの毛の房（根元が原点、+x へ spikes 本の先が伸びる平たい形） */
export function tuftGeo(len: number, wid: number, spikes: number, depth: number): THREE.BufferGeometry {
  const pts: V2[] = [[0, -wid / 2]];
  for (let i = 0; i < spikes; i++) {
    const t0 = i / spikes;
    const t1 = (i + 0.5) / spikes;
    const lean = (t1 - 0.5) * 0.5;
    pts.push([len * (0.55 + 0.1 * Math.sin(t0 * Math.PI)), -wid / 2 + wid * t0]);
    pts.push([len * (1 - 0.15 * Math.abs(t1 - 0.5)), -wid / 2 + wid * t1 + lean * wid]);
  }
  pts.push([len * 0.55, wid / 2]);
  pts.push([0, wid / 2]);
  return flatGeo(pts, depth, 0.25, 1);
}

/** 頭の横に左右一対の毛の房（頬の毛）を付ける。yaw・pitch は楕円体 s の上の位置、tilt は先の上がり具合 */
export function addTufts(kit: Kit, parent: THREE.Object3D, s: Surf, col: Col, o: { yaw: number; pitch: number; len: number; wid: number; spikes?: number; tilt?: number; ol?: number }): THREE.Mesh[] {
  const g = kit.geo(`tuft|${o.len}|${o.wid}|${o.spikes ?? 3}`, () => tuftGeo(o.len, o.wid, o.spikes ?? 3, 1.4));
  const out: THREE.Mesh[] = [];
  for (const side of [1, -1]) {
    const yaw = side * o.yaw;
    const m = kit.solid(g, kit.toon(col), parent, 0, 0, 0, o.ol ?? 0.6);
    m.position.copy(onSurf(s, yaw, o.pitch, 0.9));
    m.rotation.set(0, -yaw, o.tilt ?? 0, 'YXZ');
    out.push(m);
  }
  return out;
}
