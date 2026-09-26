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
  ellGeo,
  GREEN,
  groundSpin,
  Kit,
  lathe,
  limbGeo,
  merge,
  neckScarf,
  onSurf,
  PURPLE,
  stretchArms,
  Surf,
  surfNormal,
  taper,
  xf,
  YELLOW,
  type Probe,
  type V2,
} from './parts';

const SKIN = '#94cc62';
const HORN = '#a29696';
const HORN_TIP = '#ffc21e';
const FLUFF = '#f39e10';
const MAGENTA = '#a8187e';
const NAVY = '#1d1f86';
const IRON = '#4a5061';

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

/**
 * ヤーマ（小鬼）: 黄緑の肌、外へ開いた 2 本の角（根元は灰色・先は黄色）、横に尖った耳、
 * 半目の不敵な目（紺の瞳にマゼンタの瞳孔と目尻の影）、オレンジのもこもこの腰布。金棒はゲーム用の持ち物
 */
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

  // 胴
  const BS = new Surf(0.5, 14, 0, 15.5, 17, 14.5);
  addBody(kit, rig.torso, BS, skin);
  // もこもこの腰布（帯＋裾の毛玉）
  const FS = new Surf(BS.cx, BS.cy, 0, BS.rx + 1, BS.ry + 1, BS.rz + 1);
  kit.solid(
    kit.lod('fluff', (k) => {
      const list: THREE.BufferGeometry[] = [bandGeo(BS.rx, BS.ry, BS.rz, -1.25, -0.5, 1.2, kit.n(28 * k, 12), 3)];
      const n = kit.hi ? 10 : 8;
      for (let i = 0; i < n; i++) {
        const yaw = (i / n) * Math.PI * 2;
        const p = onSurf(FS, yaw, -0.62 - (i % 2) * 0.12);
        list.push(ellGeo(3.6, 2.8, 3.4, kit.n(8 * k, 5), kit.n(5 * k, 4)).translate(p.x - BS.cx, p.y - BS.cy, p.z));
      }
      return merge(list);
    }),
    kit.toon(FLUFF),
    rig.torso,
    BS.cx,
    BS.cy,
    0,
    0.7,
  );

  const arms = addArms(kit, rig, { r: [4.3, 3.9, 3.7], col: SKIN, end: [4.7, 4.9, 4.5], ol: 0.75 });
  addLegs(kit, rig, { r: [5.9, 5.2, 4.6], col: SKIN, end: [7.2, 4.4, 5.8], endX: 2, ol: 0.8 });
  // 太ももの付け根も腰布の毛
  const cuff = kit.lod('cuff', (k) => limbGeo(6.6, 6.1, 3.2, kit.n(14 * k, 7), 2));
  for (const hip of [rig.fhip, rig.bhip]) kit.solid(cuff, kit.toon(FLUFF), hip, 0, 0.5, 0, 0.6);

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
    // 白目の中に紺の瞳、マゼンタの瞳孔。上が平らな半目
    eye: { yaw: 0.4, pitch: -0.07, w: 3.2, h: 4.0, top: NAVY, bot: '#3437b0', pupil: [1.5, 1.5, -0.2, MAGENTA], white: [1.3, '#ffffff'], cut: [0.3, 0.06], lid: 1.3, hl: 0.7 },
    nose: { pitch: -0.24, w: 1.0, h: 0.6, col: '#5f9a3a' },
    mouth: { pitch: -0.36, w: 3.0, kind: 'smile', thick: 0.85, open: [3.4, 3.6] },
    brow: [0.4, 1.45],
  });
  // いつも見えている短い眉と目尻の影（マゼンタ）
  const paint = new Decal(HS);
  for (const side of [1, -1]) {
    const at = { yaw: side * 0.4, pitch: 0.2, lift: 0.3, mirror: side < 0 };
    paint.line(
      at,
      [
        [-1.4, 0.4],
        [1.2, -0.2],
      ],
      taper(1.3, 0.5),
    );
    paint.line(
      { yaw: side * 0.4, pitch: -0.07, lift: 0.16, mirror: side < 0 },
      [
        [-4.2, 2.6],
        [-5, 0],
        [-4.6, -2.2],
      ],
      taper(1.6, 0.3),
    );
  }
  kit.deco(paint.build(), kit.flat(MAGENTA), look);
  // 角（外へ開く。根元は灰色、先は黄色）
  const hornG = kit.lod('horn', (k) => {
    const pts: V2[] = [
      [0, -1],
      [4.4, -0.6],
      [4.3, 2.4],
      [4.0, 5.2],
      [3.7, 5.7],
      [3.1, 8.6],
      [1.9, 11.8],
      [0.6, 14],
      [0, 14.5],
    ];
    const cols = [HORN, HORN, HORN, HORN, HORN_TIP, HORN_TIP, HORN_TIP, HORN_TIP, HORN_TIP];
    return lathe(pts, kit.n(12 * k, 6), 1, 1, cols);
  });
  const hornMat = kit.toon('#ffffff', { vc: true });
  for (const side of [1, -1]) {
    const h = kit.solid(hornG, hornMat, look, 0, 0, 0, 0.6);
    h.position.copy(onSurf(HS, side * 0.55, 0.72, 0.93));
    aimY(h, surfNormal(HS, side * 0.55, 0.72).add(new THREE.Vector3(0, 0.2, 0)));
  }
  // 横に尖った耳
  const earG = kit.lod('ear', (k) => coneGeo(4.6, 10, kit.n(10 * k, 6), 5, 0.12, 1, 0.4));
  for (const side of [1, -1]) {
    const e = kit.solid(earG, skin, look, 0, 0, 0, 0.6);
    e.position.copy(onSurf(HS, side * 1.35, 0.02, 0.92));
    aimY(e, surfNormal(HS, side * 1.35, 0.02).add(new THREE.Vector3(0, 0.45, 0)));
  }

  // 首巻き
  const sc = neckScarf(kit, rig.torso, scarf, { y: 31, x: 0.5, R: 8.8, a: 2.6, b: 3.1 });

  const probes: Probe[] = [
    [rig.head, 0.5, 18.5, 0, 19.5],
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
      stretchArms(r, arms, p, 0.4);
      clearHead(r, 0.75);
      groundSpin(r, probes, p);
    },
  });
}
