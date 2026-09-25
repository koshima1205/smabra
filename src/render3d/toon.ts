import * as THREE from 'three';

/**
 * トゥーン調（アニメ塗り）の共通部品。ステージとキャラで同じ段階の陰影を使う。
 */

let gradient: THREE.DataTexture | null = null;

/** 3 段階の陰影 */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export interface ToonOpts {
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  map?: THREE.Texture | null;
}

export function toonMat(color: THREE.ColorRepresentation, o: ToonOpts = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    map: o.map ?? null,
  });
}

const outlineMats = new Map<string, THREE.MeshBasicMaterial>();

/** 輪郭線用の裏面マテリアル（色ごとに共有） */
export function outlineMat(color: THREE.ColorRepresentation = 0x1b1726): THREE.MeshBasicMaterial {
  const key = new THREE.Color(color).getHexString();
  let m = outlineMats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    outlineMats.set(key, m);
  }
  return m;
}

/**
 * 反転ハル法の輪郭線を子として足す。thickness は元の大きさに対する倍率（1.04 前後）。
 * 返り値の輪郭メッシュは親と同じ変形に追従する。
 */
export function addOutline(mesh: THREE.Mesh, thickness = 1.045, color: THREE.ColorRepresentation = 0x1b1726): THREE.Mesh {
  const o = new THREE.Mesh(mesh.geometry, outlineMat(color));
  o.scale.setScalar(thickness);
  o.name = 'outline';
  o.castShadow = false;
  o.receiveShadow = false;
  o.userData.outline = true;
  mesh.add(o);
  return o;
}

/** ゲーム座標 (x, y 下向き) → three 座標 */
export function g2t(x: number, y: number, z = 0): THREE.Vector3 {
  return new THREE.Vector3(x, -y, z);
}
