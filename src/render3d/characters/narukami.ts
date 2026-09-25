import { createRig } from '../rig';
import type { CharacterModel, CharacterOpts } from '../types';
import {
  accent,
  addBody,
  addHead,
  armOrder,
  armOut,
  buildFace,
  coneGeo,
  Decal,
  finish,
  flatGeo,
  GREEN,
  groundSpin,
  Kit,
  limbGeo,
  merge,
  mix,
  neckScarf,
  onSurf,
  RED,
  Surf,
  xf,
  YELLOW,
  type Probe,
  type V2,
} from './parts';

const FEATHER = '#3447b4';
const WING = '#283891';
const TIPS = '#7392f2';
const CREAM = '#fff0cf';
const BEAK = '#ffc23a';
const CREST = '#ffd84a';

/** 羽の形（前腕の関節から -y へ。+x が前縁） */
const WING_MAIN: V2[] = [
  [3.2, 2.6],
  [4.3, -2],
  [3.7, -9],
  [2.3, -15],
  [0.4, -18.4],
  [-1.3, -15.8],
  [-2.7, -17.4],
  [-3.8, -13.8],
  [-5.5, -14.6],
  [-6.1, -10.4],
  [-7.3, -10.4],
  [-6.8, -5.8],
  [-6.2, -1.2],
  [-3.9, 2.9],
  [-0.4, 4],
];
const WING_TIPS: V2[] = [
  [3.9, -8],
  [2.8, -16],
  [0.4, -20.6],
  [-1.6, -18.2],
  [-3.2, -19.6],
  [-4.4, -15.6],
  [-6.3, -16.6],
  [-6.9, -12],
  [-8.6, -12],
  [-7.6, -6.5],
  [-6.4, -4.5],
  [-2, -6],
];
/** 稲妻の冠羽 */
const BOLT: V2[] = [
  [-1.6, 0],
  [1.6, 0],
  [0.9, 4.6],
  [3.7, 4.6],
  [-0.4, 13.5],
  [0.9, 7.6],
  [-2.3, 7.6],
];
const TAIL_F: V2[] = [
  [0, 0.5],
  [2.3, -1.8],
  [2.8, -8],
  [1.7, -13],
  [0, -14.8],
  [-1.7, -13],
  [-2.8, -8],
  [-2.3, -1.8],
];

/** ナルカミ（鷹）: 藍色の羽に稲妻の冠羽。腕がそのまま翼、足は鉤爪 */
export function buildNarukami(opts: CharacterOpts = {}): CharacterModel {
  const kit = new Kit(opts.quality);
  const scarf = accent(opts.variant, '#1d2658', [RED, YELLOW, GREEN]);
  const rig = createRig({
    height: 88,
    hipY: 14.9,
    torso: 31.6,
    shoulderAt: 0.74,
    shoulderX: -0.5,
    shoulderZ: 12.5,
    hipZ: 6,
    upperArm: 6,
    foreArm: 9,
    thigh: 7,
    shin: 8,
  });
  armOrder(rig);
  const feather = kit.toon(FEATHER);
  const cream = kit.toon(CREAM);

  // 胴（胸はクリーム色）
  const BS = new Surf(0.5, 14, 0, 15.5, 17, 14.5);
  addBody(kit, rig.torso, BS, feather);
  const chest = new Decal(BS).ellipse({ yaw: 0, pitch: 0.05, lift: 0.12 }, 0, 0, 10.5, 13, 24, 3);
  kit.deco(chest.build(), cream, rig.torso);
  // 胸の羽模様（小さな v）
  const vs = new Decal(BS);
  for (const [u, v] of [
    [-3, 2],
    [3, 2],
    [0, -3],
    [-3.5, -8],
    [3.5, -8],
  ] as V2[])
    vs.line(
      { yaw: 0, pitch: 0.05, lift: 0.2 },
      [
        [u - 1.4, v + 0.9],
        [u, v],
        [u + 1.4, v + 0.9],
      ],
      0.55,
    );
  kit.deco(vs.build(), kit.flat('#d9b98a'), rig.torso);

  // 翼（腕）
  const wingMat = kit.toon(WING);
  const tipMat = kit.toon(TIPS);
  const up = kit.lod('w-up', (k) => limbGeo(4.2, 3.7, 6, kit.n(12 * k, 6), 3));
  const main = kit.geo('w-main', () => flatGeo(WING_MAIN, 1.4, 0.45));
  const tipsG = kit.geo('w-tips', () => flatGeo(WING_TIPS, 1.0, 0.4));
  for (const [sh, el] of [
    [rig.fsh, rig.fel],
    [rig.bsh, rig.bel],
  ] as const) {
    kit.solid(up, feather, sh, 0, 0, 0, 0.75);
    kit.solid(main, wingMat, el, 0, 0, 0, 0.7);
    kit.solid(tipsG, tipMat, el, 0, 0, -0.9, 0.7);
  }
  const tip = kit.group(rig.fel, 0.4, -19, 0);

  // 尾羽
  const tailPivot = kit.group(rig.torso, -12, 5, 0);
  tailPivot.rotation.z = -0.95;
  kit.solid(
    kit.geo('tail', () => merge([xf(flatGeo(TAIL_F, 1.2, 0.35), 0, 0, 0.8, 0, 0, -0.42), xf(flatGeo(TAIL_F, 1.2, 0.35), 0, 0, 0, 0, 0, 0), xf(flatGeo(TAIL_F, 1.2, 0.35), 0, 0, -0.8, 0, 0, 0.42)])),
    wingMat,
    tailPivot,
    0,
    0,
    0,
    0.7,
  );

  // 脚（ふわふわの腿＋黄色いすねと鉤爪）
  const thigh = kit.lod('thigh', (k) => limbGeo(4.9, 4.3, 7, kit.n(14 * k, 7), 3));
  const shinG = kit.lod('shin', (k) => {
    const ws = kit.n(10 * k, 6);
    const toe = (ry: number, len: number, back = false) => xf(limbGeo(1.35, 0.95, len, ws, 2), 0, -8 + 1.35, 0, 0, ry, back ? -Math.PI / 2 - 0.2 : Math.PI / 2 - 0.25);
    return merge([limbGeo(2.1, 1.8, 8 - 1.35, ws, 2), toe(0, 4.6), toe(0.5, 3.8), toe(-0.5, 3.8), toe(0, 2.6, true)]);
  });
  const beakMat = kit.toon(BEAK);
  for (const [hip, knee] of [
    [rig.fhip, rig.fknee],
    [rig.bhip, rig.bknee],
  ] as const) {
    kit.solid(thigh, cream, hip, 0, 0, 0, 0.8);
    kit.solid(shinG, beakMat, knee, 0, 0, 0, 0.6);
  }

  // 頭
  const HS = new Surf(1, 20, 0, 22, 21.5, 21.5);
  const look = addHead(kit, rig, HS, feather);
  // 顔の下半分はクリーム色
  const mask = new Decal(HS).ellipse({ yaw: 0, pitch: -0.52, lift: 0.1 }, 0, 0, 16.5, 10.5, 28, 3);
  kit.deco(mask.build(), cream, look);
  const face = buildFace(kit, look, {
    s: HS,
    eye: { yaw: 0.42, pitch: 0.03, w: 3.7, h: 4.4, top: '#8a4a00', bot: '#ffd84a', pupil: [1.7, 2.4, 0.3, '#150b1c'], cut: [0.52, 0.42], lid: 1.25, hl: 0.9, shut: '#fff0cf' },
    blush: { yaw: 0.74, pitch: -0.3, w: 3.2, h: 1.8, col: '#ffa8b8' },
    brow: [0.25, 1.5],
  });
  // くちばし（上は鉤型、下は口を開けると下がる）
  const beak = kit.group(look);
  beak.position.copy(onSurf(HS, 0, -0.2, 0.93));
  const upperBeak = kit.lod('beak-up', (k) => {
    const g = coneGeo(3.9, 8, kit.n(12 * k, 6), 6, 0.2, 1, 0.9);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + 0.055 * p.getY(i) * p.getY(i));
    g.computeVertexNormals();
    return xf(g, 0, 0, 0, 0, 0, -(Math.PI / 2 + 0.22));
  });
  kit.solid(upperBeak, beakMat, beak, 0, 0.4, 0, 0.6);
  const jaw = kit.group(beak, -0.5, -1.2, 0);
  kit.solid(
    kit.lod('beak-lo', (k) => xf(coneGeo(2.7, 4.8, kit.n(10 * k, 6), 4, 0.2, 1, 0.85), 0, 0, 0, 0, 0, -(Math.PI / 2 + 0.75))),
    beakMat,
    jaw,
    0,
    0,
    0,
    0.5,
  );
  // 稲妻の冠羽
  const boltG = kit.lod('bolt', () => flatGeo(BOLT, 1.4, 0.35));
  const boltMat = kit.toon(CREST, { emissive: '#5a3c00' });
  for (const side of [1, -1]) {
    const b = kit.solid(boltG, boltMat, look, 0, 0, 0, 0.6);
    b.position.copy(onSurf(HS, side * 0.62, 0.8, 0.9));
    b.rotation.set(-side * 0.45, 0, 0.42, 'YXZ');
  }

  // 首巻き（紺）
  const sc = neckScarf(kit, rig.torso, scarf, { y: 30.6, x: 0.5, R: 9.4, a: 2.6, b: 3.2 });

  const probes: Probe[] = [
    [rig.head, 1, 20, 0, 21.5],
    [rig.torso, 0.5, 14, 0, 15],
    [rig.ffoot, 0, 1.5, 0, 1.5],
    [rig.bfoot, 0, 1.5, 0, 1.5],
    [rig.fel, 0, -12, 0, 3],
    [rig.bel, 0, -12, 0, 3],
  ];
  let spread = 0.1;
  let fly = 0;
  return finish({
    rig,
    tip,
    scarves: [{ anchor: sc.anchor, color: scarf, width: 6.5, length: 30 }],
    setExpression: (e) => {
      face.set(e);
      jaw.rotation.z = e === 'attack' || e === 'hurt' ? -0.5 : 0;
    },
    animate(p, r) {
      const t = p.time;
      // 翼: 空中（攻撃中以外）は上下に羽ばたく。少し外へ広げる
      const free = p.air && (p.expression === 'normal' || p.expression === 'blink') && Math.abs(p.spin) < 0.01;
      fly += ((free ? 1 : 0) - fly) * 0.2;
      spread += ((p.air ? 0.55 : 0.12 + p.run * 0.2) - spread) * 0.2;
      r.fsh.rotation.x = -spread - armOut(r.torso.rotation.z + r.fsh.rotation.z);
      r.bsh.rotation.x = spread + armOut(r.torso.rotation.z + r.bsh.rotation.z);
      if (fly > 0.01) {
        const ph = Math.sin(t * 0.36);
        const tz = r.torso.rotation.z;
        r.fsh.rotation.z = mix(r.fsh.rotation.z, -2.45 + ph * 0.85 - tz, fly);
        r.bsh.rotation.z = mix(r.bsh.rotation.z, -2.35 + Math.sin(t * 0.36 - 0.4) * 0.85 - tz, fly);
        r.fel.rotation.z = mix(r.fel.rotation.z, 0.35 - ph * 0.25, fly);
        r.bel.rotation.z = mix(r.bel.rotation.z, 0.35 - ph * 0.25, fly);
      }
      // 尾羽
      tailPivot.rotation.z = -0.95 + Math.sin(t * 0.08) * 0.08 - p.run * 0.3 + (p.air ? 0.2 : 0);
      groundSpin(r, probes, p);
    },
  });
}
