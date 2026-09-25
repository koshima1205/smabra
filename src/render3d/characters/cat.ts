import * as THREE from 'three';
import { createRig } from '../rig';
import type { CharacterModel, CharacterOpts } from '../types';
import {
  accent,
  addArms,
  addBell,
  addBody,
  addFlame,
  addHead,
  addLegs,
  buildFace,
  clamp01,
  clawsGeo,
  clearHead,
  Decal,
  earInnerGeo,
  finish,
  flicker,
  groundSpin,
  Kit,
  lathe,
  neckScarf,
  onSurf,
  stretchArms,
  Surf,
  taper,
  Tube,
  type Col,
  type EyeSpec,
  type Probe,
  type V2,
} from './parts';

/** 双子の猫（トワ・セツナ）の違い */
export interface CatSpec {
  fur: Col;
  earIn: Col;
  /** 目（位置・大きさは共通、色と形だけ） */
  eye: Pick<EyeSpec, 'top' | 'bot' | 'pupil' | 'cut' | 'lid' | 'lash' | 'hl' | 'shut'>;
  nose: Col;
  blush: Col;
  whisker: Col;
  ribbon: string;
  alts: [string, string, string];
  /** 爪を見せる */
  claws?: Col;
  /** 鬼火（前の手のそば） */
  flame?: Col;
  /** 尻尾の先の巻き具合 */
  curl: number;
}

/** 三角の耳（+y 向き） */
const EAR: V2[] = [
  [0, -1.5],
  [5, -1.2],
  [6.5, 0.2],
  [6.1, 2.5],
  [5, 5],
  [3.4, 7.6],
  [1.6, 9.6],
  [0.5, 10.4],
  [0, 10.6],
];

/** 尻尾の節の長さ・太さ */
const TAIL_L = 3.7;
const TAIL_R = [2.8, 2.7, 2.6, 2.55, 2.5, 2.45, 2.4, 2.35, 2.3, 2.2, 1.9];

/** 猫（共通の体）。H 82・頭の大きなちび猫 */
export function buildCat(opts: CharacterOpts, c: CatSpec): CharacterModel {
  const kit = new Kit(opts.quality);
  const ribbon = accent(opts.variant, c.ribbon, c.alts);
  const rig = createRig({
    height: 82,
    hipY: 14.4,
    torso: 31.6,
    shoulderAt: 0.72,
    shoulderX: 0.5,
    shoulderZ: 11,
    hipZ: 6,
    upperArm: 7,
    foreArm: 6.5,
    thigh: 6.5,
    shin: 8,
  });
  const fur = kit.toon(c.fur);

  const BS = new Surf(0.5, 13.5, 0, 14, 16, 13);
  addBody(kit, rig.torso, BS, fur);
  const arms = addArms(kit, rig, { r: [3.8, 3.5, 3.3], col: c.fur, end: [4.3, 4.4, 4.1], ol: 0.7 });
  addLegs(kit, rig, { r: [5.2, 4.6, 4.2], col: c.fur, end: [6.6, 4.1, 5.3], endX: 1.8, ol: 0.8 });
  if (c.claws) {
    const claws = kit.geo('claws', () => clawsGeo(1.3, -3.5, 1.7, 0.7, 2));
    for (const h of arms.hands) kit.deco(claws, kit.toon(c.claws), h);
  }

  // 長い尻尾（先が巻く）
  const tail = new Tube(kit, rig.torso, fur, TAIL_R, kit.n(12, 8), 0.75, undefined, [0.6, 1]);
  tail.ref.set(0, 0, 1);

  // 頭
  const HS = new Surf(0.5, 17.5, 0, 20.5, 18.5, 19.5);
  const look = addHead(kit, rig, HS, fur);
  const face = buildFace(kit, look, {
    s: HS,
    eye: { yaw: 0.41, pitch: -0.07, w: 3.9, h: 4.7, ...c.eye },
    nose: { pitch: -0.25, w: 1.6, h: 1.15, col: c.nose, tri: true },
    mouth: { pitch: -0.34, w: 1.9, kind: 'cat', thick: 0.75, open: [2.8, 3.1], gap: 1.0 },
    blush: { yaw: 0.73, pitch: -0.28, w: 3.3, h: 1.9, col: c.blush },
    brow: [0.4, 1.3],
  });
  // ひげ
  const wh = new Decal(HS);
  for (const side of [1, -1])
    for (const k of [-1, 0, 1])
      wh.line(
        { yaw: side * 0.66, pitch: -0.22, lift: 0.26, mirror: side < 0 },
        [
          [0.5, k * 1.1],
          [-3, k * 1.7 + 0.2],
          [-6.5, k * 2.5 + 0.5],
        ],
        taper(0.55, 0.3),
      );
  kit.deco(wh.build(), kit.flat(c.whisker), look);
  // 耳
  const earG = kit.lod('ear', (k) => lathe(EAR, kit.n(12 * k, 6), 0.5, 1));
  const earIn = kit.geo('ear-in', () => earInnerGeo(EAR, 0.8, 8.4, kit.n(10, 6), 0.5, 1, 0.62));
  const ears: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const pv = kit.group(look);
    pv.position.copy(onSurf(HS, side * 0.56, 0.86, 0.9));
    pv.rotation.x = side * 0.34;
    const e = kit.group(pv);
    kit.solid(earG, fur, e, 0, 0, 0, 0.7);
    kit.deco(earIn, kit.toon(c.earIn), e);
    ears.push(e);
  }

  // 首のリボンと鈴
  const sc = neckScarf(kit, rig.torso, ribbon, { y: 30.2, x: 0.5, R: 8.6, a: 1.4, b: 2.0, knot: 3.2 });
  addBell(kit, sc.ring.parent as THREE.Object3D, 2.3, 10.6, -2.6, 0);

  // 鬼火（トワ）: 前の手のそば。いつも上向き
  const flame = c.flame ? addFlame(kit, rig.fhand, 3.3, 8, c.flame) : null;
  const tip = flame ?? undefined;

  const probes: Probe[] = [
    [rig.head, 0.5, 17.5, 0, 18.5],
    [rig.torso, 0.5, 13.5, 0, 13],
    [rig.ffoot, 1.8, 4.1, 0, 4.1],
    [rig.bfoot, 1.8, 4.1, 0, 4.1],
    [rig.fhand, 0, 0, 0, 4.3],
    [rig.bhand, 0, 0, 0, 4.3],
  ];
  const P = tail.pts;
  return finish({
    rig,
    tip,
    scarves: [{ anchor: sc.anchor, color: ribbon, width: 4.5, length: 20 }],
    setExpression: (e) => face.set(e),
    animate(p, r) {
      const t = p.time;
      const run = clamp01(p.run);
      // 尻尾: 後ろから上へ、先はくるり。走ると後ろへ流れる
      P[0].set(-12, 3.5, 0);
      let a = -1.75 - run * 0.2;
      for (let i = 1; i < P.length; i++) {
        const s = i / (P.length - 1);
        a += -0.12 - (s > 0.6 ? c.curl * (s - 0.6) * 2.2 : 0);
        const w = Math.sin(t * (0.06 + run * 0.1) - i * 0.45) * (0.07 + s * 0.12);
        const ang = a + w + run * s * 0.5;
        P[i].set(P[i - 1].x + Math.sin(ang) * TAIL_L, P[i - 1].y - Math.cos(ang) * TAIL_L, Math.sin(t * 0.05 - i * 0.4) * s * 2.2);
      }
      tail.update();
      // 耳のぴくぴく・走ると後ろへ
      for (let i = 0; i < ears.length; i++) {
        const twitch = Math.max(0, Math.sin(t * 0.045 + i * 2.1)) ** 12 * 0.35;
        ears[i].rotation.z = run * 0.35 + (p.air ? 0.15 : 0) + twitch;
      }
      if (flame) {
        // 手の回転を打ち消して上向きに。手の少し前・上に浮かべる
        const rot = r.body.rotation.z + r.torso.rotation.z + r.fsh.rotation.z + r.fel.rotation.z;
        flame.rotation.z = -rot;
        const ox = 6.5;
        const oy = 2.5 + Math.sin(t * 0.08) * 1.2;
        const cs = Math.cos(-rot);
        const sn = Math.sin(-rot);
        flame.position.set(ox * cs - oy * sn, ox * sn + oy * cs, 3.5);
        flicker(flame, t, 0);
      }
      stretchArms(r, arms, p);
      clearHead(r);
      groundSpin(r, probes, p);
    },
  });
}
