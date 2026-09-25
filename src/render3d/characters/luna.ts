import * as THREE from 'three';
import { createRig } from '../rig';
import type { CharacterModel, CharacterOpts } from '../types';
import {
  accent,
  addArms,
  addBody,
  addHead,
  addLegs,
  arcPts,
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
  taper,
  xf,
  YELLOW,
  type Probe,
  type V2,
} from './parts';

const FUR = '#fff7ea';
const PINK = '#ffb3c6';

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
const SCROLL: V2[] = [
  [0, -8.6],
  [2.7, -8.6],
  [3.1, -8.2],
  [3.1, 8.2],
  [2.7, 8.6],
  [0, 8.6],
];

/** ルナ（うさぎ）: クリーム色の毛、長い耳、額に三日月、大きな足。背中に小さな巻物 */
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
  // 背中の巻物
  const scroll = kit.group(rig.torso, -12.5, 19, 3);
  scroll.rotation.set(0.25, 0, 0.75);
  kit.solid(
    kit.lod('scroll', (k) => lathe(SCROLL, kit.n(14 * k, 7))),
    kit.toon('#f3e2bb'),
    scroll,
    0,
    0,
    0,
    0.6,
  );
  kit.solid(
    kit.lod('scroll-knob', (k) => merge([ellGeo(2, 1.5, 2, kit.n(10 * k, 6), kit.n(8 * k, 4)).translate(0, 9.4, 0), ellGeo(2, 1.5, 2, kit.n(10 * k, 6), kit.n(8 * k, 4)).translate(0, -9.4, 0)])),
    kit.toon('#a3342f'),
    scroll,
    0,
    0,
    0,
    0.5,
  );
  kit.deco(
    kit.lod('scroll-tie', (k) =>
      xf(
        lathe(
          [
            [3.22, -1],
            [3.22, 1],
          ],
          kit.n(14 * k, 7),
        ),
        0,
        0,
        0,
      ),
    ),
    kit.toon(scarf),
    scroll,
  );

  // 頭
  const HS = new Surf(0.5, 18.5, 0, 20.5, 19.5, 20);
  const look = addHead(kit, rig, HS, fur);
  const face = buildFace(kit, look, {
    s: HS,
    eye: { yaw: 0.4, pitch: -0.05, w: 3.8, h: 4.8, top: '#6e0c24', bot: '#ff5c76', lid: 0.85, lash: 1.2, hl: 1.1 },
    nose: { pitch: -0.27, w: 1.8, h: 1.25, col: '#ff8fab', tri: true },
    mouth: { pitch: -0.37, w: 1.9, kind: 'cat', thick: 0.75, open: [2.8, 3.2], gap: 1.1 },
    blush: { yaw: 0.72, pitch: -0.3, w: 3.4, h: 2, col: '#ffb0c4' },
    brow: [0.45, 1.25],
  });
  // 額の三日月
  const moon = new Decal(HS).line({ yaw: 0, pitch: 0.5, lift: 0.3 }, arcPts(1.1, 0, 3, 3.2, Math.PI * 0.55, Math.PI * 1.45, 14), taper(2.2, 0.08));
  kit.deco(moon.build(), kit.toon('#ffd23f', { emissive: '#4a3500' }), look);
  // 耳（付け根で曲がる）
  const earG = kit.lod('ear', (k) => lathe(EAR, kit.n(14 * k, 7), 0.5, 1));
  const earIn = kit.geo('ear-in', () => earInnerGeo(EAR, 1.5, 21.5, kit.n(10, 6), 0.5, 1, 0.6));
  const ears: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const pv = kit.group(look);
    pv.position.copy(onSurf(HS, side * 0.36, 1.05, 0.9));
    const e = kit.group(pv);
    kit.solid(earG, fur, e, 0, 0, 0, 0.7);
    kit.deco(earIn, kit.toon(PINK), e);
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
