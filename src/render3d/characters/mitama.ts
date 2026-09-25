import { createRig } from '../rig';
import type { CharacterModel, CharacterOpts } from '../types';
import {
  accent,
  addArms,
  addBody,
  addFlame,
  addHead,
  bandGeo,
  BLUE,
  buildFace,
  clearHead,
  Decal,
  finish,
  flicker,
  GREEN,
  groundSpin,
  INK,
  Kit,
  lathe,
  limbGeo,
  merge,
  neckScarf,
  polyPts,
  PURPLE,
  ringGeo,
  stretchArms,
  Surf,
  Tube,
  xf,
  YELLOW,
  type Probe,
  type V2,
} from './parts';

/** ミタマ（おばけ）: しずく形の白い体に渦巻くしっぽ、額に三角の天冠、木槌と人魂 */
export function buildMitama(opts: CharacterOpts = {}): CharacterModel {
  const kit = new Kit(opts.quality);
  const scarf = accent(opts.variant, GREEN, [BLUE, YELLOW, PURPLE]);
  const BODY = '#f3f0ff';
  const rig = createRig({
    height: 84,
    hipY: 21.7,
    torso: 23,
    shoulderAt: 0.6,
    shoulderX: 1.5,
    shoulderZ: 11.5,
    hipZ: 4,
    upperArm: 4.6,
    foreArm: 4.4,
    thigh: 4,
    shin: 4,
    squatGain: 0.18,
    plant: false,
  });
  const body = kit.toon(BODY);

  // 胴としっぽ（しっぽは毎フレーム曲げるチューブ）
  const BS = new Surf(0.5, 9.5, 0, 14.5, 15, 14);
  addBody(kit, rig.torso, BS, body);
  const TAIL_R = [10.5, 9.2, 7.6, 6, 4.6, 3.4, 2.4, 1.5, 0.8];
  const TAIL_L = [5.5, 5, 4.6, 4.2, 3.8, 3.4, 3, 2.6];
  const TAIL_A = [-0.35, -0.75, -1.15, -1.55, -1.95, -2.4, -2.85, -3.3];
  const tail = new Tube(kit, rig.torso, body, TAIL_R, kit.n(16, 10), 0.9, undefined, [0.6, 1]);

  const arms = addArms(kit, rig, { r: [3.3, 3.0, 2.8], col: BODY, end: [3.6, 3.8, 3.4], ol: 0.7 });

  // 木槌（前の手。柄は前腕の延長）
  const mallet = kit.group(rig.fhand);
  mallet.rotation.z = 0.25;
  kit.solid(
    kit.lod('mallet-grip', (k) => xf(limbGeo(1.2, 1.2, 15, Math.round(8 * k), 2), 0, 1.5, 0)),
    kit.toon('#9a6436'),
    mallet,
    0,
    0,
    0,
    0.5,
  );
  const headY = -15;
  const barrel: V2[] = [
    [0, -6],
    [4.1, -6],
    [4.9, -5.4],
    [5.3, -3],
    [5.4, 0],
    [5.3, 3],
    [4.9, 5.4],
    [4.1, 6],
    [0, 6],
  ];
  kit.solid(
    kit.lod('mallet-head', (k) => xf(lathe(barrel, kit.n(16 * k, 8)), 0, 0, 0, 0, 0, Math.PI / 2)),
    kit.toon('#d9a466'),
    mallet,
    0,
    headY,
    0,
    0.6,
  );
  kit.deco(
    kit.geo('mallet-bands', () => merge([xf(ringGeo(5.35, 0.4, 0.8, kit.n(16, 8), 6), 3.9, 0, 0, 0, 0, Math.PI / 2), xf(ringGeo(5.35, 0.4, 0.8, kit.n(16, 8), 6), -3.9, 0, 0, 0, 0, Math.PI / 2)])),
    kit.toon('#7a4a24'),
    mallet,
    0,
    headY,
    0,
  );
  const tip = kit.group(mallet, 0, headY, 0);

  // 頭
  const HS = new Surf(0.5, 19, 0, 21.5, 20.5, 21);
  const look = addHead(kit, rig, HS, body);
  const face = buildFace(kit, look, {
    s: HS,
    eye: { yaw: 0.4, pitch: -0.08, w: 3.9, h: 5.0, top: '#221a3e', bot: '#8a8cf0', lid: 0.9, lash: 1.0, hl: 1.15 },
    mouth: { pitch: -0.33, w: 2.2, kind: 'w', open: [3.2, 3.8] },
    blush: { yaw: 0.72, pitch: -0.28, w: 3.6, h: 2.2, col: '#ffc2dc' },
    brow: [0.5, 1.3],
  });
  // 天冠（額の三角の布）: 縁取り＋白
  const tri: V2[] = [
    [-7, -4.2],
    [7, -4.2],
    [0, 6.6],
  ];
  const big: V2[] = [
    [-8.5, -5],
    [8.5, -5],
    [0, 8.3],
  ];
  const cloth = new Decal(HS).fill({ yaw: 0.12, pitch: 0.44, lift: 0.14 }, polyPts(big, 8), [0, -0.8], 3);
  kit.deco(cloth.build(), kit.flat(INK), look);
  const clothIn = new Decal(HS).fill({ yaw: 0.12, pitch: 0.44, lift: 0.28 }, polyPts(tri, 8), [0, -0.8], 3);
  kit.deco(clothIn.build(), kit.toon('#ffffff'), look);
  const tie = kit.group(look, HS.cx, HS.cy, HS.cz);
  kit.solid(
    kit.lod('tie', (k) => bandGeo(HS.rx, HS.ry, HS.rz, 0.2, 0.26, 0.45, kit.n(32 * k, 12), 2)),
    kit.toon('#ffffff'),
    tie,
    0,
    0,
    0,
    0.45,
  );

  // 首巻き
  const sc = neckScarf(kit, rig.torso, scarf, { y: 22.3, x: 0.5, R: 8.8, a: 2.6, b: 3.0 });

  // 人魂（体のまわりを回る）
  const orbit = kit.group(rig.root);
  const flames = [addFlame(kit, orbit, 3.6, 11, '#3fa4ff'), addFlame(kit, orbit, 3.0, 9, '#58b4ff')];

  const probes: Probe[] = [
    [rig.head, 0.5, 19, 0, 20.5],
    [rig.torso, 0.5, 9.5, 0, 14],
  ];
  const P = tail.pts;
  return finish({
    rig,
    tip,
    scarves: [{ anchor: sc.anchor, color: scarf, width: 6, length: 28 }],
    setExpression: (e) => face.set(e),
    animate(p, r) {
      const t = p.time;
      // ふわふわ上下
      r.body.position.y += Math.sin(t * 0.06) * 1.8;
      // しっぽ: 走ると後ろへ流れる
      const run = p.run;
      const amp = p.air ? 0.2 : 0.13;
      P[0].set(0.5, -1, 0);
      for (let i = 0; i < TAIL_L.length; i++) {
        const a = TAIL_A[i] + (-1.5 - i * 0.06 - TAIL_A[i]) * run * 0.55 + Math.sin(t * (0.09 + run * 0.08) - i * 0.55) * (amp + i * 0.03);
        const L = TAIL_L[i];
        P[i + 1].set(P[i].x + Math.sin(a) * L, P[i].y - Math.cos(a) * L, Math.sin(t * 0.07 - i * 0.5) * i * 0.35);
      }
      tail.update();
      // 人魂
      for (let i = 0; i < flames.length; i++) {
        const a = t * 0.032 + 1.3 + i * Math.PI;
        const f = flames[i];
        f.position.set(Math.cos(a) * 26, 44 + Math.sin(t * 0.05 + i * 2) * 6, Math.sin(a) * 17);
        f.rotation.z = Math.sin(a) * 0.35;
        flicker(f, t, i);
      }
      stretchArms(r, arms, p, 0.7);
      clearHead(r, 0.7);
      groundSpin(r, probes, p);
    },
  });
}
