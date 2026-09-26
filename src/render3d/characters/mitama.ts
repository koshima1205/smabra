import { createRig } from '../rig';
import type { CharacterModel, CharacterOpts } from '../types';
import {
  accent,
  addArms,
  addBody,
  addFlame,
  addHead,
  BLUE,
  bendGeo,
  coneGeo,
  buildFace,
  clearHead,
  finish,
  flicker,
  GREEN,
  groundSpin,
  Kit,
  lathe,
  limbGeo,
  merge,
  neckScarf,
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

/**
 * ミタマ（おばけ・幽霊）: 水色の丸い体に、頭のてっぺんの炎のような巻いた房と、波打つしっぽ。
 * 半分閉じた眠たげな目（緑の瞳）。木槌と人魂はゲーム用の持ち物
 */
export function buildMitama(opts: CharacterOpts = {}): CharacterModel {
  const kit = new Kit(opts.quality);
  const scarf = accent(opts.variant, GREEN, [BLUE, YELLOW, PURPLE]);
  const BODY = '#bfe8fb';
  const SHADE = '#78d2ec';
  const NAVY = '#1d1f86';
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
  // しっぽの先ほど濃い水色
  const tail = new Tube(kit, rig.torso, kit.toon('#ffffff', { vc: true }), TAIL_R, kit.n(16, 10), 0.9, { col: BODY, back: BODY, half: 0, paint: (i) => (i >= 5 ? SHADE : null) }, [0.6, 1]);

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
    // 上が平らに切れた半目。白目の中に緑の瞳と大きな紺の瞳孔
    eye: { yaw: 0.4, pitch: -0.1, w: 3.6, h: 4.2, top: '#1f9a5c', bot: '#3fd08a', pupil: [2.3, 2.6, -0.5, NAVY], white: [1.1, '#ffffff'], cut: [0.3, 0.04], lid: 1.2, hl: 0.8 },
    mouth: { pitch: -0.33, w: 2.0, kind: 'smile', open: [3.0, 3.4] },
    blush: { yaw: 0.72, pitch: -0.3, w: 3.2, h: 2.6, col: '#ffa8d2' },
    brow: [0.5, 1.3],
  });
  // 頭のてっぺんの炎のような房（大きな房が後ろへ巻き、奥にもう一つ）
  const wisp = kit.lod('wisp', (k) => bendGeo(coneGeo(6.5, 16, kit.n(12 * k, 7), 9, 0.1, 1, 0.8, 1.2), 1.5, 16));
  const wisp2 = kit.lod('wisp2', (k) => bendGeo(coneGeo(4.5, 12, kit.n(10 * k, 6), 7, 0.1, 1, 0.75, 1.2), 1.6, 12));
  // 曲げると +x（前）へ巻くので、y 軸で半回転させて後ろへ巻かせる
  const w1 = kit.solid(wisp, body, look, HS.cx + 1, HS.cy + HS.ry - 2.5, 0, 0.8);
  w1.rotation.set(0, Math.PI, 0.1);
  const w2 = kit.solid(wisp2, kit.toon(SHADE), look, HS.cx - 7, HS.cy + HS.ry - 4.5, 2, 0.7);
  w2.rotation.set(0.35, Math.PI, 0.45);
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
