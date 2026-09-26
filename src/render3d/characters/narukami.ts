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
  ellGeo,
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

const FEATHER = '#9c6226';
const WING = '#8e5820';
const TIPS = '#553c38';
const CREAM = '#e4d6b8';
const BEAK = '#e4d6b8';
const BEAK_TIP = '#553c38';
const LEG = '#ffe066';

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
/** 後頭部の冠羽（2 本のとがった羽が後ろ -x へ流れる。根元が原点） */
const CREST: V2[] = [
  [4, -3.5],
  [-5, -3],
  [-15, 2],
  [-7.5, 1.8],
  [-18, 8.5],
  [-5, 5.5],
  [4, 3.5],
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

/**
 * ナルカミ（鷹）: 茶色の羽、後頭部に後ろへ流れる冠羽、黄色い目のきりっとした顔、クリーム色の鉤くちばしとお腹。
 * 腕がそのまま翼（先は焦げ茶）、足は黄色
 */
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

  // 胴（お腹の下のほうがクリーム色）
  const BS = new Surf(0.5, 14, 0, 15.5, 17, 14.5);
  addBody(kit, rig.torso, BS, feather);
  const belly = new Decal(BS).ellipse({ yaw: 0, pitch: -0.42, lift: 0.12 }, 0, 0, 10, 8.5, 24, 3);
  kit.deco(belly.build(), cream, rig.torso);

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
  const legMat = kit.toon(LEG);
  for (const [hip, knee] of [
    [rig.fhip, rig.fknee],
    [rig.bhip, rig.bknee],
  ] as const) {
    kit.solid(thigh, feather, hip, 0, 0, 0, 0.8);
    kit.solid(shinG, legMat, knee, 0, 0, 0, 0.6);
  }

  // 頭
  const HS = new Surf(1, 20, 0, 22, 21.5, 21.5);
  const look = addHead(kit, rig, HS, feather);
  // くちばしの付け根のまわりはクリーム色
  const cere = new Decal(HS).ellipse({ yaw: 0, pitch: -0.2, lift: 0.1 }, 0, 0, 4.6, 4.2, 20, 2);
  kit.deco(cere.build(), cream, look);
  const face = buildFace(kit, look, {
    s: HS,
    // 黄色い目に大きな紺の瞳。上が平らに切れたきりっとした目
    eye: { yaw: 0.42, pitch: 0.03, w: 4.0, h: 4.6, top: '#ffe46a', bot: '#fff0a0', pupil: [2.2, 2.9, 0.1, '#1a1c80'], cut: [0.4, 0.12], lid: 1.3, hl: 0.8, shut: '#2a1a12' },
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
  // 鉤の先は焦げ茶
  const hook = kit.deco(kit.geo('beak-tip', () => ellGeo(1.6, 1.3, 1.9, 10, 8)), kit.toon(BEAK_TIP), beak);
  hook.position.set(6.3, -1.9, 0);
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
  // 後頭部の冠羽（後ろへ流れる。少し厚みを持たせて左右どちらからも見える）
  const crest = kit.solid(
    kit.lod('crest', () => flatGeo(CREST, 3.2, 0.8)),
    feather,
    look,
    0,
    0,
    0,
    0.7,
  );
  crest.position.copy(onSurf(HS, Math.PI - 0.35, 0.6, 0.88));
  crest.rotation.set(0, 0.35, -0.15);

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
