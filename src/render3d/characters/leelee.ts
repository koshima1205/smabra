import * as THREE from 'three';
import { createRig } from '../rig';
import type { CharacterModel, CharacterOpts } from '../types';
import {
  accent,
  addArms,
  addHead,
  addLegs,
  aimZ,
  BLUE,
  buildFace,
  clearHead,
  Decal,
  ellGeo,
  finish,
  GREEN,
  groundSpin,
  headBand,
  Kit,
  onSurf,
  RED,
  stretchArms,
  Surf,
  surfNormal,
  YELLOW,
  type Probe,
} from './parts';

/**
 * リーリー（パンダ）: 大きな白い頭に濃紺の耳・手足。目のまわりは灰色の大きなぶちで、その中に濃紺の丸い目。
 * 鉢巻はゲームの色分け用（素材屋CNP の公式イラストには無い）
 */
export function buildLeeLee(opts: CharacterOpts = {}): CharacterModel {
  const kit = new Kit(opts.quality);
  const band = accent(opts.variant, RED, [BLUE, YELLOW, GREEN]);
  const WHITE = '#f7f4f0';
  // 公式イラストの「黒」は濃紺
  const BLACK = '#1f2184';
  const PATCH = '#a9a9b3';
  const rig = createRig({
    height: 100,
    hipY: 18.9,
    torso: 36.9,
    shoulderAt: 0.72,
    shoulderX: 1,
    shoulderZ: 13,
    hipZ: 8.5,
    upperArm: 9,
    foreArm: 8.5,
    thigh: 8.5,
    shin: 10.5,
  });
  const white = kit.toon(WHITE);
  const black = kit.toon(BLACK);

  // 体
  const BS = new Surf(1, 15, 0, 17.5, 19, 16.5);
  kit.solid(
    kit.lod('body', (k) => ellGeo(BS.rx, BS.ry, BS.rz, kit.n(28 * k, 10), kit.n(20 * k, 8))),
    white,
    rig.torso,
    BS.cx,
    BS.cy,
    BS.cz,
    1,
  );
  // しっぽ
  kit.solid(
    kit.lod('tail', (k) => ellGeo(4.6, 4.4, 4.6, kit.n(14 * k, 7), kit.n(10 * k, 5))),
    white,
    rig.torso,
    -16.5,
    3,
    0,
    0.7,
  );

  const arms = addArms(kit, rig, { r: [5.4, 5, 4.7], col: BLACK, end: [6.4, 6.6, 6.3], ol: 0.8 });
  addLegs(kit, rig, { r: [7, 6.5, 6.2], col: BLACK, end: [8.2, 5.2, 7], endX: 2.2, ol: 0.85 });

  // 頭（カメラ側へ少し向ける）
  const HS = new Surf(1, 21.5, 0, 25.5, 23, 24.5);
  const look = addHead(kit, rig, HS, white);
  // 耳
  const earG = kit.lod('ear', (k) => ellGeo(8.4, 8.4, 5.2, kit.n(16 * k, 7), kit.n(12 * k, 5)));
  const ears: THREE.Mesh[] = [];
  for (const side of [1, -1]) {
    const yaw = side * 1.3;
    const ear = kit.solid(earG, black, look, 0, 0, 0, 0.8);
    ear.position.copy(onSurf(HS, yaw, 0.8, 0.93));
    aimZ(ear, surfNormal(HS, yaw, 0.8));
    ears.push(ear);
  }
  // 目のまわりの灰色のぶち（大きな楕円、上が内側へ傾く）
  const patch = new Decal(HS);
  for (const side of [1, -1]) patch.ellipse({ yaw: side * 0.44, pitch: -0.08, rot: -0.35, mirror: side < 0, lift: 0.12 }, 0, 0, 7.2, 9.4, kit.n(24, 14), 2);
  kit.deco(patch.build(), kit.toon(PATCH), look);
  const face = buildFace(kit, look, {
    s: HS,
    eye: { yaw: 0.42, pitch: -0.05, w: 2.9, h: 4.0, top: BLACK, bot: '#2c2f9c', hl: 0.9, shut: BLACK },
    nose: { pitch: -0.3, w: 2.2, h: 1.4, col: BLACK },
    mouth: { pitch: -0.42, w: 2.6, kind: 'smile', thick: 0.85, open: [3.6, 3.6] },
    brow: [0.55, 1.4],
  });
  const hb = headBand(kit, look, HS, band, { lat0: 0.34, lat1: 0.55, t: 1.3, tilt: 0.1, knot: 4.6 });

  const probes: Probe[] = [
    [rig.head, 1, 21.5, 0, 23.5],
    [rig.torso, 1, 15, 0, 17],
    [rig.ffoot, 2, 4, 0, 4.5],
    [rig.bfoot, 2, 4, 0, 4.5],
    [rig.fhand, 0, 0, 0, 6],
    [rig.bhand, 0, 0, 0, 6],
  ];
  const earRot = ears.map((e) => e.quaternion.clone());
  const q = new THREE.Quaternion();
  const ax = new THREE.Vector3(1, 0, 0);
  return finish({
    rig,
    scarves: [{ anchor: hb.anchor, color: band, width: 7, length: 34 }],
    setExpression: (e) => face.set(e),
    animate(p, r) {
      // 耳を少しぴくぴく
      const w = Math.sin(p.time * 0.05) * 0.06 + (p.air ? 0.12 : 0);
      for (let i = 0; i < ears.length; i++) ears[i].quaternion.copy(earRot[i]).multiply(q.setFromAxisAngle(ax, w * (i ? -1 : 1)));
      stretchArms(r, arms, p);
      clearHead(r);
      groundSpin(r, probes, p);
    },
  });
}
