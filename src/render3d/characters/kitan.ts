import * as THREE from 'three';
import emmaUrl from '../../assets/kitan/emma.glb?url';
import orochiUrl from '../../assets/kitan/orochi.glb?url';
import otoUrl from '../../assets/kitan/oto.glb?url';
import xiaolanUrl from '../../assets/kitan/xiaolan.glb?url';
import { finishModel } from '../model';
import { createRig, type Rig, type RigSpec } from '../rig';
import { outlineMat, toonMat } from '../toon';
import type { CharacterModel, CharacterOpts, KitanId } from '../types';
import { armOrder, clearHead, INK } from './parts';

/**
 * 月蝕綺譚の御霊（公式の 3D モデル・ゲーム版 GLB を使う）。
 *
 * 公式のモデルは骨が 6 本（root / legs / hips / head / arm.L / arm.R）で脚が 1 本の骨にまとまっているので、
 * 元の割り当て（どの骨にいちばん強く付いているか）と頂点の位置から、共通骨格（rig.ts）の
 * 胴・頭・肩・肘・股・膝へ割り当て直す。これで CNP と同じ姿勢データ（ModelPose）で手足が動く。
 * モデルの出典と利用条件は src/assets/kitan/README.md。
 */

const URLS: Record<KitanId, string> = { k_oto: otoUrl, k_xiaolan: xiaolanUrl, k_orochi: orochiUrl, k_emma: emmaUrl };

/** 月蝕綺譚のモデル一覧（選択画面の並び順） */
export const KITAN_IDS: KitanId[] = ['k_oto', 'k_xiaolan', 'k_orochi', 'k_emma'];

/** 身長（当たり判定と同じ値。src/game/roster.ts の height と合わせる） */
export const KITAN_HEIGHT: Record<KitanId, number> = { k_oto: 96, k_xiaolan: 100, k_orochi: 100, k_emma: 100 };

/** 下半身の作り。split = 左右の脚に分ける、none = 分けない（オロチはとぐろの蛇の体） */
const LOWER: Record<KitanId, 'split' | 'none'> = { k_oto: 'split', k_xiaolan: 'split', k_orochi: 'none', k_emma: 'split' };

/** 色違い（同じキャラが複数いるとき）に掛ける色 */
const TINTS = ['#ffffff', '#ffc4c4', '#c4dcff', '#fff0b0'];

/** 割り当て直した先の骨（共通骨格のグループ名） */
const BONES = ['torso', 'head', 'fsh', 'fel', 'bsh', 'bel', 'fhip', 'fknee', 'bhip', 'bknee'] as const;
type BoneName = (typeof BONES)[number];
const B = Object.fromEntries(BONES.map((n, i) => [n, i])) as Record<BoneName, number>;

interface Source {
  geo: THREE.BufferGeometry;
  /** 元の骨の名前（skinIndex の番号順） */
  names: string[];
  map: THREE.Texture | null;
}

interface Fitted {
  spec: RigSpec;
  geo: THREE.BufferGeometry;
  hull: THREE.BufferGeometry;
  map: THREE.Texture | null;
}

const sources = new Map<KitanId, Source>();
const fitted = new Map<KitanId, Fitted>();
let loading: Promise<void> | null = null;

export const isKitanId = (id: string): id is KitanId => id in URLS;

/** 公式モデルを読み込む（起動時に一度。失敗したキャラは仮の形で表示される） */
export function preloadKitan(): Promise<void> {
  if (!loading) {
    loading = Promise.all(
      KITAN_IDS.map(async (id) => {
        try {
          sources.set(id, await parseGlb(await bytesOf(URLS[id])));
        } catch (e) {
          console.warn(`月蝕綺譚のモデルを読み込めませんでした: ${id}`, e);
        }
      }),
    ).then(() => undefined);
  }
  return loading;
}

/**
 * 1 ファイル版ではモデルが data: URL で埋め込まれるので、fetch を使わずにその場でバイト列へ戻す
 * （配信先のページが data: / blob: の読み込みを許していなくても動くように）
 */
async function bytesOf(url: string): Promise<ArrayBuffer> {
  if (url.startsWith('data:')) {
    const bin = atob(url.slice(url.indexOf(',') + 1));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.arrayBuffer();
}

interface GltfAccessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  normalized?: boolean;
}
interface GltfJson {
  nodes: { name?: string }[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number; material?: number }[] }[];
  skins: { joints: number[] }[];
  accessors: GltfAccessor[];
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
  materials?: { pbrMetallicRoughness?: { baseColorTexture?: { index: number } } }[];
  textures?: { source: number }[];
  images?: { bufferView: number; mimeType: string }[];
}

const COMP: Record<number, [number, (dv: DataView, o: number) => number]> = {
  5120: [1, (d, o) => d.getInt8(o)],
  5121: [1, (d, o) => d.getUint8(o)],
  5122: [2, (d, o) => d.getInt16(o, true)],
  5123: [2, (d, o) => d.getUint16(o, true)],
  5125: [4, (d, o) => d.getUint32(o, true)],
  5126: [4, (d, o) => d.getFloat32(o, true)],
};
const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const NORM: Record<number, number> = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

/** 公式モデル（スキン付きのメッシュ 1 つ＋テクスチャ 1 枚の GLB）から必要なところだけ読む */
async function parseGlb(buf: ArrayBuffer): Promise<Source> {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen))) as GltfJson;
  const bin = 20 + jsonLen + 8;
  const read = (i: number): Float32Array => {
    const a = json.accessors[i];
    const bv = json.bufferViews[a.bufferView];
    const [size, get] = COMP[a.componentType];
    const w = WIDTH[a.type];
    const stride = bv.byteStride ?? size * w;
    const base = bin + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const out = new Float32Array(a.count * w);
    const k = a.normalized ? 1 / NORM[a.componentType] : 1;
    for (let n = 0; n < a.count; n++) for (let c = 0; c < w; c++) out[n * w + c] = get(dv, base + n * stride + c * size) * k;
    return out;
  };
  const prim = json.meshes[0].primitives[0];
  const at = prim.attributes;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(read(at.POSITION), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(read(at.NORMAL), 3));
  if (at.TEXCOORD_0 !== undefined) geo.setAttribute('uv', new THREE.BufferAttribute(read(at.TEXCOORD_0), 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(read(at.JOINTS_0), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(read(at.WEIGHTS_0), 4));
  if (prim.indices !== undefined) geo.setIndex(Array.from(read(prim.indices)));
  const names = json.skins[0].joints.map((j) => json.nodes[j].name ?? '');
  // テクスチャ（URL を使わずに画像へ）
  let map: THREE.Texture | null = null;
  const ti = prim.material !== undefined ? json.materials?.[prim.material]?.pbrMetallicRoughness?.baseColorTexture?.index : undefined;
  const img = ti !== undefined ? json.images?.[json.textures?.[ti]?.source ?? -1] : undefined;
  if (img && typeof createImageBitmap === 'function') {
    const bv = json.bufferViews[img.bufferView];
    const blob = new Blob([new Uint8Array(buf, bin + (bv.byteOffset ?? 0), bv.byteLength)], { type: img.mimeType });
    const bmp = await createImageBitmap(blob);
    map = new THREE.Texture(bmp);
    map.flipY = false;
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.needsUpdate = true;
    map.userData.shared = true;
  }
  return { geo, names, map };
}

export function kitanLoaded(id: KitanId): boolean {
  return sources.has(id);
}

const ss = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 元の割り当てと位置から、共通骨格の寸法と頂点ごとの割り当てを作る */
function fit(id: KitanId, src: Source): Fitted {
  const g = src.geo;
  const pos = g.getAttribute('position');
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  const n = pos.count;
  // three.js は読み込み時にノード名の「.」を取り除く（arm.L → armL）ので、区切りを落として比べる
  const name = (k: number) => (src.names[k] ?? '').replace(/[^a-zA-Z]/g, '').replace(/^arm([LR])$/, 'arm.$1');
  // いちばん強く付いている元の骨
  const dom: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0;
    let bw = -1;
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(i, c);
      if (w > bw) {
        bw = w;
        best = si.getComponent(i, c);
      }
    }
    dom[i] = name(best);
  }
  let y0 = Infinity;
  let y1 = -Infinity;
  let legTop = -Infinity;
  let neck = Infinity;
  let armTop = -Infinity;
  let armBot = Infinity;
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
    const d = dom[i];
    if (d === 'legs' || d === 'root') legTop = Math.max(legTop, y);
    else if (d === 'head') neck = Math.min(neck, y);
    else if (d === 'arm.L' || d === 'arm.R') {
      armTop = Math.max(armTop, y);
      armBot = Math.min(armBot, y);
    }
  }
  // 肩（腕の上の方の頂点の平均）と股（脚の頂点の左右の広がり）
  let sx = 0;
  let sz = 0;
  let sn = 0;
  let hx = 0;
  let hz = 0;
  let hn = 0;
  for (let i = 0; i < n; i++) {
    const d = dom[i];
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if ((d === 'arm.L' || d === 'arm.R') && y > armTop - (armTop - armBot) * 0.25) {
      sx += Math.abs(x);
      sz += z;
      sn++;
    } else if ((d === 'legs' || d === 'root') && Math.abs(x) > 0.03) {
      hx += Math.abs(x);
      hz += z;
      hn++;
    }
  }
  // 脚の柱（膝より下の頂点の前後の中心と左右の幅）。これより後ろ・外の頂点（垂れた髪・広がった裾）は胴に付ける
  let lz = 0;
  let lx = 0;
  let ln = 0;
  const kneeM = legTop - (legTop - y0) * 0.5;
  for (let i = 0; i < n; i++) {
    const d = dom[i];
    if ((d === 'legs' || d === 'root') && pos.getY(i) < kneeM) {
      lz += pos.getZ(i);
      lx = Math.max(lx, Math.abs(pos.getX(i)));
      ln++;
    }
  }
  const legZ = ln ? lz / ln : 0;
  const legX = ln ? lx : 1;
  const lower = LOWER[id];
  const H = KITAN_HEIGHT[id];
  const s = H / (y1 - y0);
  const hipY = (legTop - y0) * s;
  const torso = (neck - legTop) * s;
  const armLen = (armTop - armBot) * s;
  const kneeY = legTop - (legTop - y0) * 0.5;
  const spec: RigSpec = {
    height: H,
    hipY,
    torso,
    shoulderAt: (armTop - legTop) / (neck - legTop),
    shoulderX: sn ? (sz / sn) * s : 0,
    shoulderZ: sn ? (sx / sn) * s : torso * 0.6,
    hipX: hn ? (hz / hn) * s : 0,
    hipZ: hn ? (hx / hn) * s * 0.8 : hipY * 0.25,
    upperArm: armLen * 0.5,
    foreArm: armLen * 0.5,
    thigh: hipY * 0.5,
    shin: hipY * 0.5,
    // 手足が短いので振りを少し控えめに。頭は長い髪が胴に付いているので、あまり回さない
    legGain: 0.85,
    headGain: 0.4,
    plant: lower === 'split',
  };

  // 頂点ごとの割り当て
  const idx = new Uint8Array(n * 4);
  const wts = new Float32Array(n * 4);
  const w = new Float32Array(BONES.length);
  const order = BONES.map((_, i) => i);
  for (let i = 0; i < n; i++) {
    w.fill(0);
    const x = pos.getX(i);
    const y = pos.getY(i);
    const d = dom[i];
    if (d === 'head') {
      const h = ss(neck - 0.02, neck + 0.06, y);
      w[B.head] = h;
      w[B.torso] = 1 - h;
    } else if (d === 'arm.L' || d === 'arm.R') {
      // arm.L は -x 側 = 右を向いたときの手前（+z）
      const front = d === 'arm.L';
      const t = (armTop - y) / Math.max(1e-4, armTop - armBot);
      const el = ss(0.38, 0.62, t);
      const k = (1 - ss(0, 0.22, t)) * 0.5;
      w[B.torso] = k;
      w[front ? B.fsh : B.bsh] = (1 - el) * (1 - k);
      w[front ? B.fel : B.bel] = el * (1 - k);
    } else if ((d === 'legs' || d === 'root') && lower === 'split' && pos.getZ(i) > legZ - 0.16 && Math.abs(x) < legX + 0.04) {
      const f = ss(0.05, -0.05, x);
      const kn = ss(kneeY + 0.04, kneeY - 0.04, y);
      const top = ss(legTop - 0.08, legTop, y) * 0.6;
      w[B.torso] = top;
      const L = 1 - top;
      w[B.fhip] = L * f * (1 - kn);
      w[B.fknee] = L * f * kn;
      w[B.bhip] = L * (1 - f) * (1 - kn);
      w[B.bknee] = L * (1 - f) * kn;
    } else {
      w[B.torso] = 1;
    }
    order.sort((a, b) => w[b] - w[a]);
    let sum = 0;
    for (let c = 0; c < 4; c++) sum += w[order[c]];
    for (let c = 0; c < 4; c++) {
      idx[i * 4 + c] = order[c];
      wts[i * 4 + c] = sum > 0 ? w[order[c]] / sum : c === 0 ? 1 : 0;
    }
  }

  // ゲームの座標へ: 足元が原点、前（公式モデルの +z）が +x、大きさは身長 H
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', pos.clone());
  geo.setAttribute('normal', (g.getAttribute('normal') as THREE.BufferAttribute).clone());
  const uv = g.getAttribute('uv');
  if (uv) geo.setAttribute('uv', (uv as THREE.BufferAttribute).clone());
  if (g.index) geo.setIndex(g.index.clone());
  const M = new THREE.Matrix4().makeRotationY(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(0, -y0, 0));
  geo.applyMatrix4(M);
  geo.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  return { spec, geo, hull: hullOf(geo, 0.7), map: src.map };
}

/** 輪郭用: 同じ位置の頂点の法線を平均して t だけ外へ（骨の割り当てはそのまま） */
function hullOf(src: THREE.BufferGeometry, t: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const p = src.getAttribute('position');
  const nr = src.getAttribute('normal');
  const out = new Float32Array(p.count * 3);
  const acc = new Map<string, [number, number, number]>();
  const key = (i: number) => `${Math.round(p.getX(i) * 100)},${Math.round(p.getY(i) * 100)},${Math.round(p.getZ(i) * 100)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    const a = acc.get(k) ?? [0, 0, 0];
    a[0] += nr.getX(i);
    a[1] += nr.getY(i);
    a[2] += nr.getZ(i);
    acc.set(k, a);
  }
  for (let i = 0; i < p.count; i++) {
    const a = acc.get(key(i))!;
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = p.getX(i) + (a[0] / l) * t;
    out[i * 3 + 1] = p.getY(i) + (a[1] / l) * t;
    out[i * 3 + 2] = p.getZ(i) + (a[2] / l) * t;
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.setAttribute('skinIndex', src.getAttribute('skinIndex'));
  g.setAttribute('skinWeight', src.getAttribute('skinWeight'));
  if (src.index) g.setIndex(src.index);
  return g;
}

/** 読み込み済みなら月蝕綺譚のモデルを作る（まだなら null） */
export function buildKitan(id: KitanId, opts: CharacterOpts = {}): CharacterModel | null {
  const src = sources.get(id);
  if (!src) return null;
  let f = fitted.get(id);
  if (!f) {
    f = fit(id, src);
    fitted.set(id, f);
  }
  const rig: Rig = createRig(f.spec);
  armOrder(rig);
  const bones = BONES.map((nm) => {
    const b = new THREE.Bone();
    b.name = nm;
    rig[nm].add(b);
    return b;
  });
  rig.root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const tint = TINTS[(opts.variant ?? 0) % TINTS.length];
  const mat = toonMat(tint, { map: f.map, side: THREE.DoubleSide });
  const mesh = new THREE.SkinnedMesh(f.geo.clone(), mat);
  mesh.name = id;
  mesh.frustumCulled = false;
  rig.root.add(mesh);
  mesh.updateMatrixWorld(true);
  mesh.bind(skeleton, mesh.matrixWorld);
  if (opts.quality !== 'low') {
    const o = new THREE.SkinnedMesh(f.hull.clone(), outlineMat(INK));
    o.name = 'outline';
    o.userData.outline = true;
    o.userData.noShadow = true;
    o.frustumCulled = false;
    rig.root.add(o);
    o.updateMatrixWorld(true);
    o.bind(skeleton, o.matrixWorld);
  }
  return finishModel({
    rig,
    animate: (_p, r) => clearHead(r, 0.7),
  });
}
