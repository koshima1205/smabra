import * as THREE from 'three';
import { createRig } from '../rig';
import type { CharacterModel, CharacterOpts } from '../types';
import {
  accent,
  addArms,
  addBody,
  addHead,
  addLegs,
  aimY,
  bandGeo,
  BLUE,
  buildFace,
  clearHead,
  coneGeo,
  Decal,
  finish,
  flatGeo,
  GREEN,
  groundSpin,
  Kit,
  lathe,
  limbGeo,
  merge,
  neckScarf,
  onSurf,
  PURPLE,
  ringGeo,
  stretchArms,
  Surf,
  surfNormal,
  taper,
  xf,
  YELLOW,
  type Probe,
  type V2,
} from './parts';

const SKIN = '#f36b3b';
const BELLY = '#ffb27d';
const HORN = '#fff0b8';
const HAT = '#28232f';
const GOLD = '#f5c542';
const TIGER = '#ffc53a';
const STRIPE = '#2a2230';
const IRON = '#4a5061';

/** 閻魔の冠（黒い帽子。+y 向き） */
const HAT_P: V2[] = [
  [0, -0.4],
  [11.4, -0.4],
  [12.1, 0.4],
  [12.1, 8.9],
  [13.3, 10],
  [13.5, 11],
  [12.9, 11.7],
  [0, 11.9],
];
/** 金棒（手首から -y へ） */
const CLUB: V2[] = [
  [0, -26],
  [2.7, -25.6],
  [3.9, -24.3],
  [3.8, -13],
  [2.5, -4],
  [1.7, -3],
  [0, -2.8],
];

/** ヤーマ（小鬼・閻魔）: 赤い肌に角、閻魔の冠（王の字）、虎柄のパンツと金棒、呪符 */
export function buildYama(opts: CharacterOpts = {}): CharacterModel {
  const kit = new Kit(opts.quality);
  const scarf = accent(opts.variant, PURPLE, [BLUE, YELLOW, GREEN]);
  const rig = createRig({
    height: 86,
    hipY: 15.9,
    torso: 32,
    shoulderAt: 0.72,
    shoulderX: 0.5,
    shoulderZ: 12,
    hipZ: 6.5,
    upperArm: 7.5,
    foreArm: 7,
    thigh: 7.5,
    shin: 8.5,
  });
  const skin = kit.toon(SKIN);

  // 胴（おなか・虎柄のパンツ）
  const BS = new Surf(0.5, 14, 0, 15.5, 17, 14.5);
  addBody(kit, rig.torso, BS, skin);
  const belly = new Decal(BS).ellipse({ yaw: 0, pitch: 0.02, lift: 0.12 }, 0, 0, 9, 10.5, 24, 3);
  kit.deco(belly.build(), kit.toon(BELLY), rig.torso);
  const pants = kit.group(rig.torso, BS.cx, BS.cy, 0);
  kit.solid(
    kit.lod('pants', (k) => bandGeo(BS.rx, BS.ry, BS.rz, -1.25, -0.42, 0.9, kit.n(28 * k, 12), 3)),
    kit.toon(TIGER),
    pants,
    0,
    0,
    0,
    0.7,
  );
  const PS = new Surf(BS.cx, BS.cy, 0, BS.rx + 0.9, BS.ry + 0.9, BS.rz + 0.9);
  const stripes = new Decal(PS);
  for (let i = 0; i < 9; i++) {
    const yaw = (i / 9) * Math.PI * 2 + 0.2;
    stripes.line(
      { yaw, pitch: -0.72, lift: 0.12, rot: 0.25 },
      [
        [0, 3.2],
        [0.3, 0],
        [-0.2, -3],
      ],
      taper(2.2, 0.1),
    );
  }
  kit.deco(stripes.build(), kit.toon(STRIPE), rig.torso);

  const arms = addArms(kit, rig, { r: [4.3, 3.9, 3.7], col: SKIN, end: [4.7, 4.9, 4.5], ol: 0.75 });
  addLegs(kit, rig, { r: [5.9, 5.2, 4.6], col: SKIN, end: [7.2, 4.4, 5.8], endX: 2, ol: 0.8 });
  // 太ももは虎柄のパンツの裾（黄色い筒）
  const cuff = kit.lod('cuff', (k) => limbGeo(6.6, 6.1, 3.6, kit.n(14 * k, 7), 2));
  for (const hip of [rig.fhip, rig.bhip]) kit.solid(cuff, kit.toon(TIGER), hip, 0, 0.5, 0, 0.6);

  // 金棒（前の手）
  const club = kit.group(rig.fhand);
  club.rotation.z = 0.15;
  kit.solid(
    kit.lod('grip', (k) => xf(limbGeo(1.35, 1.35, 5.5, kit.n(8 * k, 5), 2), 0, 2.2, 0)),
    kit.toon('#5a3a22'),
    club,
    0,
    0,
    0,
    0.5,
  );
  kit.solid(
    kit.lod('club', (k) => lathe(CLUB, kit.n(14 * k, 7))),
    kit.toon(IRON),
    club,
    0,
    0,
    0,
    0.7,
  );
  kit.deco(
    kit.geo('studs', () => {
      const list: THREE.BufferGeometry[] = [];
      const ys = [-8, -12.8, -17.6, -22.2];
      ys.forEach((y, j) => {
        const r = 2.5 + ((3.85 - 2.5) * (y + 4)) / -20;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + j * 0.63;
          const g = coneGeo(0.95, 2.1, 6, 2, 0.2);
          const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          g.applyQuaternion(q);
          g.translate(dir.x * (r - 0.3), y, dir.z * (r - 0.3));
          list.push(g);
        }
      });
      return merge(list);
    }),
    kit.toon('#c3c8d4'),
    club,
  );
  const tip = kit.group(club, 0, -24, 0);

  // 頭
  const HS = new Surf(0.5, 18.5, 0, 20.5, 19.5, 20);
  const look = addHead(kit, rig, HS, skin);
  const face = buildFace(kit, look, {
    s: HS,
    eye: { yaw: 0.41, pitch: -0.07, w: 3.9, h: 4.8, top: '#3a1206', bot: '#ffb22e', lid: 1.0, lash: 0.9, cut: [0.8, 0.16], hl: 1.05 },
    nose: { pitch: -0.24, w: 1.1, h: 0.8, col: '#c9442a' },
    mouth: { pitch: -0.34, w: 3.3, kind: 'smile', thick: 0.85, open: [3.4, 3.6] },
    blush: { yaw: 0.72, pitch: -0.28, w: 3.4, h: 2, col: '#ffb6a6' },
    brow: [0.4, 1.45],
  });
  // 小さな牙（下あごから上向き）
  const fang = new Decal(HS);
  for (const side of [1, -1])
    fang.fill(
      { yaw: 0, pitch: -0.34, lift: 0.36, mirror: side < 0 },
      [
        [1.4, -1.1],
        [2.6, -1.0],
        [2.1, 0.5],
      ],
      [2.0, -0.6],
      2,
    );
  kit.deco(fang.build(), kit.flat('#ffffff'), look);
  // 角
  const hornG = kit.lod('horn', (k) => coneGeo(2.6, 7.5, kit.n(12 * k, 6), 5, 0.2));
  for (const side of [1, -1]) {
    const h = kit.solid(hornG, kit.toon(HORN), look, 0, 0, 0, 0.6);
    h.position.copy(onSurf(HS, side * 0.62, 0.68, 0.94));
    aimY(h, surfNormal(HS, side * 0.62, 0.68).add(new THREE.Vector3(0, 0.9, 0)));
  }
  // 閻魔の冠（王の字・金の縁）と呪符
  const hat = kit.group(look, -0.8, HS.cy + HS.ry * 0.7, 0);
  hat.rotation.z = 0.16;
  kit.solid(
    kit.lod('hat', (k) => lathe(HAT_P, kit.n(26 * k, 12), 1, 0.96)),
    kit.toon(HAT),
    hat,
    0,
    0,
    0,
    0.8,
  );
  kit.deco(
    kit.geo('hat-trim', () => ringGeo(12.15, 0.55, 1.1, kit.n(26, 12), 6, 1, 0.96)),
    kit.toon(GOLD, { emissive: '#3a2800' }),
    hat,
    0,
    1.3,
    0,
  );
  const oh = new Decal(new Surf(0, 0, 0, 12.1, 1, 11.62, true));
  const wang: V2[][] = [
    [
      [-2.8, 2.9],
      [2.8, 2.9],
    ],
    [
      [-2.2, 0.1],
      [2.2, 0.1],
    ],
    [
      [-3.3, -2.8],
      [3.3, -2.8],
    ],
    [
      [0, 2.9],
      [0, -2.8],
    ],
  ];
  for (const l of wang) oh.line({ yaw: 0.35, pitch: 5.2, lift: 0.15 }, l, 1.3);
  kit.deco(oh.build(), kit.toon(GOLD, { emissive: '#3a2800' }), hat);
  const fu = kit.group(hat, -3.5, 5, 11.3);
  fu.rotation.set(0.08, 0.25, -0.12);
  kit.solid(
    kit.lod('fu', () =>
      flatGeo(
        [
          [-2.6, 0],
          [2.6, 0],
          [2.6, -9.5],
          [-2.6, -9.5],
        ],
        0.35,
        0.12,
      ),
    ),
    kit.toon('#fff4d8'),
    fu,
    0,
    0,
    0,
    0.35,
  );
  kit.deco(
    kit.geo('fu-mark', () =>
      merge([
        flatGeo(
          [
            [-0.45, -1.4],
            [0.45, -1.4],
            [0.45, -8.3],
            [-0.45, -8.3],
          ],
          0.2,
          0,
        ),
        xf(ringGeo(1.3, 0.35, 0.18, 12, 6), 0, -3.4, 0, Math.PI / 2, 0, 0),
        flatGeo(
          [
            [-1.8, -5.4],
            [1.8, -5.4],
            [1.8, -6.1],
            [-1.8, -6.1],
          ],
          0.2,
          0,
        ),
      ]).translate(0, 0, 0.3),
    ),
    kit.flat('#d23636'),
    fu,
  );

  // 首巻き
  const sc = neckScarf(kit, rig.torso, scarf, { y: 31, x: 0.5, R: 8.8, a: 2.6, b: 3.1 });

  const probes: Probe[] = [
    [rig.head, 0.5, 18.5, 0, 19.5],
    [hat, 0, 11, 0, 1],
    [rig.torso, 0.5, 14, 0, 14.5],
    [rig.ffoot, 2, 4.4, 0, 4.4],
    [rig.bfoot, 2, 4.4, 0, 4.4],
  ];
  return finish({
    rig,
    tip,
    scarves: [{ anchor: sc.anchor, color: scarf, width: 6, length: 28 }],
    setExpression: (e) => face.set(e),
    animate(p, r) {
      const t = p.time;
      // 呪符がひらひら
      fu.rotation.x = 0.08 + Math.sin(t * 0.09) * 0.12 + p.run * 0.35 + (p.air ? 0.3 : 0);
      stretchArms(r, arms, p, 0.4);
      clearHead(r, 0.75);
      groundSpin(r, probes, p);
    },
  });
}
