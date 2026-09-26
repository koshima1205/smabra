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
  clearHead,
  Decal,
  earInnerGeo,
  ellGeo,
  finish,
  groundSpin,
  Kit,
  lathe,
  merge,
  neckScarf,
  onSurf,
  PURPLE,
  RED,
  stretchArms,
  Surf,
  YELLOW,
  type Probe,
  type V2,
} from './parts';

const FUR = '#fcaad8';
const NAVY = '#1d1f86';

/** 長い耳（+y 向き、根元が原点） */
const EAR: V2[] = [
  [0, -1.5],
  [2.6, -1.2],
  [3.9, 1],
  [4.6, 5],
  [4.8, 10],
  [4.5, 15],
  [3.8, 19.5],
  [2.6, 22.6],
  [0, 24],
];
/**
 * ルナ（うさぎ）: 全身ピンクの毛、長い耳（内側に白い差し色）、頬のふわふわの毛と胸の白い毛。
 * 紺の丸い目にサーモンピンクの頬
 */
export function buildLuna(opts: CharacterOpts = {}): CharacterModel {
  const kit = new Kit(opts.quality);
  const scarf = accent(opts.variant, BLUE, [RED, YELLOW, PURPLE]);
  const rig = createRig({
    height: 84,
    hipY: 15.4,
    torso: 30.6,
    shoulderAt: 0.72,
    shoulderX: 0.5,
    shoulderZ: 11.5,
    hipZ: 6.5,
    upperArm: 7,
    foreArm: 6.5,
    thigh: 7,
    shin: 8.5,
  });
  const fur = kit.toon(FUR);

  const BS = new Surf(0.5, 13.5, 0, 14.5, 16.5, 13.5);
  addBody(kit, rig.torso, BS, fur);
  const arms = addArms(kit, rig, { r: [3.8, 3.5, 3.3], col: FUR, end: [4.2, 4.4, 4.0], ol: 0.7 });
  addLegs(kit, rig, { r: [5.8, 5.2, 4.4], col: FUR, end: [9.6, 4.3, 5.5], endX: 3.4, ol: 0.8 });

  // ふわふわのしっぽ
  kit.solid(
    kit.lod('tail', (k) => {
      const e = (r: number, x: number, y: number, z: number) => ellGeo(r, r, r, kit.n(12 * k, 6), kit.n(9 * k, 5)).translate(x, y, z);
      return merge([e(4.4, 0, 0, 0), e(3.2, -1.6, 2, 1.4), e(3.2, -1.3, 1.6, -1.8), e(3.3, -2.2, -1.3, 0.2)]);
    }),
    kit.toon('#ffffff'),
    rig.torso,
    -14,
    4.5,
    0,
    0.7,
  );
  // 胸の白い毛
  const chest = new Decal(BS).fill(
    { yaw: 0, pitch: 0.55, lift: 0.14 },
    [
      [-4.2, 1.5],
      [-2.4, -2.2],
      [-0.8, -0.8],
      [0.4, -3],
      [1.8, -0.9],
      [3.4, -2.4],
      [4.4, 1.5],
    ],
    [0, 0],
    2,
  );
  kit.deco(chest.build(), kit.toon('#ffffff'), rig.torso);

  // 頭
  const HS = new Surf(0.5, 18.5, 0, 20.5, 19.5, 20);
  const look = addHead(kit, rig, HS, fur);
  const face = buildFace(kit, look, {
    s: HS,
    eye: { yaw: 0.38, pitch: -0.07, w: 2.9, h: 3.9, top: NAVY, bot: '#2c2f9c', hl: 0.9 },
    nose: { pitch: -0.25, w: 1.1, h: 0.6, col: NAVY },
    mouth: { pitch: -0.36, w: 1.9, kind: 'w', thick: 0.7, open: [2.8, 3.2] },
    blush: { yaw: 0.66, pitch: -0.3, w: 3.6, h: 3.0, col: '#ff9294' },
    brow: [0.45, 1.25],
  });
  // 頬のふわふわの毛
  addTufts(kit, look, HS, FUR, { yaw: 1.2, pitch: -0.22, len: 7, wid: 9, spikes: 3, tilt: -0.1 });
  // 耳（付け根で曲がる）
  const earG = kit.lod('ear', (k) => lathe(EAR, kit.n(14 * k, 7), 0.5, 1));
  const earIn = kit.geo('ear-in', () => earInnerGeo(EAR, 9, 17, kit.n(10, 6), 0.5, 1, 0.45));
  const ears: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const pv = kit.group(look);
    pv.position.copy(onSurf(HS, side * 0.36, 1.05, 0.9));
    const e = kit.group(pv);
    kit.solid(earG, fur, e, 0, 0, 0, 0.7);
    kit.deco(earIn, kit.toon('#ffffff'), e);
    ears.push(e);
    pv.rotation.x = side * 0.3;
  }

  // 首巻き
  const sc = neckScarf(kit, rig.torso, scarf, { y: 29.6, x: 0.5, R: 8.6, a: 2.5, b: 3.0 });

  const probes: Probe[] = [
    [rig.head, 0.5, 18.5, 0, 19.5],
    [rig.torso, 0.5, 13.5, 0, 13.5],
    [rig.ffoot, 3.4, 4.3, 0, 4.3],
    [rig.bfoot, 3.4, 4.3, 0, 4.3],
    [rig.fhand, 0, 0, 0, 4.2],
    [rig.bhand, 0, 0, 0, 4.2],
  ];
  let flop = 0.2;
  let vel = 0;
  return finish({
    rig,
    scarves: [{ anchor: sc.anchor, color: scarf, width: 6, length: 28 }],
    setExpression: (e) => face.set(e),
    animate(p, r) {
      const t = p.time;
      // 耳: 走る・空中で後ろへなびく（ばねで追いかける）
      const target = 0.15 + clamp01(p.run) * 0.75 + (p.air ? 0.55 : 0) + Math.sin(t * 0.05) * 0.04;
      vel = vel * 0.8 + (target - flop) * 0.12;
      flop += vel;
      ears[0].rotation.z = flop + Math.sin(t * 0.21) * 0.05 * p.run;
      ears[1].rotation.z = flop * 1.12 + Math.sin(t * 0.21 + 1) * 0.05 * p.run;
      stretchArms(r, arms, p);
      clearHead(r);
      groundSpin(r, probes, p);
    },
  });
}
