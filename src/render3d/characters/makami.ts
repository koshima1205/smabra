import * as THREE from 'three';
import { createRig } from '../rig';
import type { CharacterModel, CharacterOpts } from '../types';
import {
  accent,
  addArms,
  addBody,
  addHead,
  addTufts,
  addLegs,
  BLUE,
  buildFace,
  clamp01,
  clawsGeo,
  clearHead,
  Decal,
  earInnerGeo,
  ellGeo,
  finish,
  groundSpin,
  Kit,
  lathe,
  neckScarf,
  onSurf,
  RED,
  stretchArms,
  Surf,
  YELLOW,
  type Col,
  type Probe,
  type V2,
} from './parts';

const FUR = '#7e7e8a';
const DARK = '#72727e';
const WHITE = '#f5f7fb';
const EAR_IN = '#f5f7fb';
const NAVY = '#1d1f86';
const ASTER = '#7b52c9';

/** 尖った耳（+y 向き） */
const EAR: V2[] = [
  [0, -1.5],
  [5, -1.2],
  [6.3, 0.3],
  [5.9, 3],
  [4.8, 6.5],
  [3.3, 10],
  [1.8, 13],
  [0.6, 14.8],
  [0, 15.2],
];

/** ふさふさの尻尾（+y 向き）。先は白 */
const TAIL: [number, number, Col][] = [
  [0, 0, FUR],
  [3.4, 0.8, FUR],
  [5.4, 3.6, FUR],
  [6.8, 7.6, FUR],
  [7.1, 11.4, FUR],
  [6.5, 14.8, FUR],
  [6.1, 15.8, FUR],
  [6.1, 15.8, WHITE],
  [5.0, 18.6, WHITE],
  [3.2, 21, WHITE],
  [0, 22.6, WHITE],
];

/**
 * マカミ（オオカミ）: 灰色の毛に白いマズル・頬・胸・手足の先、白い点の眉、内側が白い尖った耳、
 * 黄色い目と紺の鼻、ふさふさの尻尾。紫苑色のマフラー
 */
export function buildMakami(opts: CharacterOpts = {}): CharacterModel {
  const kit = new Kit(opts.quality);
  const scarf = accent(opts.variant, ASTER, [RED, BLUE, YELLOW]);
  const rig = createRig({
    height: 90,
    hipY: 16.4,
    torso: 32.2,
    shoulderAt: 0.72,
    shoulderX: 0.5,
    shoulderZ: 12.5,
    hipZ: 6.8,
    upperArm: 8,
    foreArm: 7.5,
    thigh: 7.5,
    shin: 9,
  });
  const fur = kit.toon(FUR);
  const white = kit.toon(WHITE);

  const BS = new Surf(0.5, 14.5, 0, 15.5, 17.5, 14.5);
  addBody(kit, rig.torso, BS, fur);
  const chest = new Decal(BS).ellipse({ yaw: 0, pitch: 0.1, lift: 0.12 }, 0, 0, 10, 14, 24, 3);
  kit.deco(chest.build(), white, rig.torso);
  const arms = addArms(kit, rig, { r: [4.4, 4.0, 3.8], col: FUR, end: [4.9, 5.1, 4.7], endCol: WHITE, ol: 0.75 });
  addLegs(kit, rig, { r: [6.0, 5.3, 4.7], col: FUR, end: [7.6, 4.6, 6.2], endCol: WHITE, endX: 2.2, ol: 0.8 });
  // 爪（前足）
  const claws = kit.geo('claws', () => clawsGeo(1.6, -4.4, 2.1, 0.85, 2.4));
  for (const h of arms.hands) kit.deco(claws, kit.toon('#5b6072'), h);

  // 尻尾
  const tailPivot = kit.group(rig.torso, -13.5, 4, 0);
  kit.solid(
    kit.lod('tail', (k) =>
      lathe(
        TAIL.map(([r, y]): V2 => [r, y]),
        kit.n(14 * k, 7),
        1,
        0.85,
        TAIL.map((q) => q[2]),
      ),
    ),
    kit.toon('#ffffff', { vc: true }),
    tailPivot,
    0,
    0,
    0,
    0.8,
  );

  // 頭（白いほほ・鼻先）
  const HS = new Surf(1, 20, 0, 22, 21.5, 21.5);
  const look = addHead(kit, rig, HS, fur);
  const cheek = new Decal(HS).ellipse({ yaw: 0, pitch: -0.5, lift: 0.1 }, 0, 0, 15.5, 9.5, 28, 3);
  kit.deco(cheek.build(), white, look);
  const snoutP = onSurf(HS, 0, -0.3, 0.74);
  const SN = new Surf(snoutP.x, snoutP.y, 0, 8.2, 6, 7.6);
  kit.solid(
    kit.lod('snout', (k) => ellGeo(SN.rx, SN.ry, SN.rz, kit.n(18 * k, 8), kit.n(14 * k, 6))),
    white,
    look,
    SN.cx,
    SN.cy,
    SN.cz,
    0.7,
  );
  const nose = kit.solid(
    kit.lod('nose', (k) => ellGeo(2.4, 1.8, 2.9, kit.n(12 * k, 6), kit.n(9 * k, 5))),
    kit.toon(NAVY),
    look,
    0,
    0,
    0,
    0.35,
  );
  nose.position.copy(onSurf(SN, 0, 0.42, 0.97));
  kit.deco(
    kit.geo('nose-hl', () => ellGeo(0.9, 0.5, 0.8, 8, 6)),
    kit.flat('#ffffff'),
    nose,
    1.2,
    1.1,
    0.5,
  );
  const face = buildFace(kit, look, {
    s: HS,
    ms: SN,
    eye: { yaw: 0.43, pitch: 0.07, w: 3.8, h: 4.4, top: '#f2c400', bot: '#ffe45a', pupil: [1.9, 2.6, 0.1, NAVY], cut: [0.5, 0.25], lid: 1.2, hl: 0.8 },
    mouth: { pitch: -0.28, w: 2.2, kind: 'w', thick: 0.75, open: [3.2, 2.8] },
    brow: [0.3, 1.45],
  });
  // 白い点の眉（麻呂眉）と頬の白い毛
  const dots = new Decal(HS);
  for (const side of [1, -1]) dots.ellipse({ yaw: side * 0.36, pitch: 0.4, rot: 0.35, lift: 0.2, mirror: side < 0 }, 0, 0, 1.9, 1.1, 12, 1);
  kit.deco(dots.build(), kit.toon(WHITE), look);
  addTufts(kit, look, HS, WHITE, { yaw: 1.25, pitch: -0.4, len: 6, wid: 8, spikes: 3, tilt: -0.3 });
  // 耳
  const earG = kit.lod('ear', (k) => lathe(EAR, kit.n(12 * k, 6), 0.55, 1));
  const earIn = kit.geo('ear-in', () => earInnerGeo(EAR, 1, 12.5, kit.n(10, 6), 0.55, 1, 0.6));
  const ears: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const pv = kit.group(look);
    pv.position.copy(onSurf(HS, side * 0.5, 0.95, 0.86));
    pv.rotation.x = side * 0.26;
    const e = kit.group(pv);
    kit.solid(earG, kit.toon(DARK), e, 0, 0, 0, 0.7);
    kit.deco(earIn, kit.toon(EAR_IN), e);
    ears.push(e);
  }

  // マフラー
  const sc = neckScarf(kit, rig.torso, scarf, { y: 31.4, x: 0.5, R: 9.2, a: 2.7, b: 3.2 });

  const probes: Probe[] = [
    [rig.head, 1, 20, 0, 21],
    [rig.torso, 0.5, 14.5, 0, 14.5],
    [rig.ffoot, 2.2, 4.6, 0, 4.6],
    [rig.bfoot, 2.2, 4.6, 0, 4.6],
    [rig.fhand, 0, 0, 0, 4.8],
    [rig.bhand, 0, 0, 0, 4.8],
  ];
  return finish({
    rig,
    scarves: [{ anchor: sc.anchor, color: scarf, width: 6.5, length: 32 }],
    setExpression: (e) => face.set(e),
    animate(p, r) {
      const t = p.time;
      const run = clamp01(p.run);
      // 走るときはさらに前傾（俊足）
      if (!p.air) r.torso.rotation.z -= run * 0.2;
      // 尻尾をふる
      tailPivot.rotation.z = 0.95 + Math.sin(t * (0.08 + run * 0.12)) * (0.12 + run * 0.08) + run * 0.35;
      tailPivot.rotation.x = Math.sin(t * 0.06) * 0.1;
      // 耳: 走ると後ろへ寝る
      for (let i = 0; i < ears.length; i++) ears[i].rotation.z = run * 0.45 + (p.air ? 0.2 : 0) + Math.sin(t * 0.04 + i) * 0.03;
      stretchArms(r, arms, p);
      clearHead(r);
      groundSpin(r, probes, p);
    },
  });
}
