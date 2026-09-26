import * as THREE from 'three';
import { createRig } from '../rig';
import type { CharacterModel, CharacterOpts } from '../types';
import { accent, addHead, BLUE, buildFace, clamp01, Decal, finish, flatGeo, groundSpin, Kit, LINE, mix, neckScarf, onSurf, posIn, PURPLE, RED, Surf, taper, Tube, YELLOW, type Probe, type V2 } from './parts';

const WHITE = '#f8f7fb';
const BELLY = '#f1f0f6';
const SCALE = '#c4c4cc';
const RED_EYE = '#d8201a';
/** 胴の灰色のひし形のウロコ（背中側の頂点をまばらに塗る） */
const scales =
  (every: number) =>
  (i: number, k: number): string | null =>
    k >= 0 && i % 2 === 0 && (k + i * 2) % every === 0 ? SCALE : null;

/** 尾のムチ: 各節の長さ・太さ・休みの角度（2D と同じ「真下 = 0、前へ +」） */
const WHIP_L = [6, 6, 6, 6, 5.5, 5.5, 5, 4.5, 4];
const WHIP_R = [4.8, 4.5, 4.1, 3.7, 3.2, 2.7, 2.2, 1.7, 1.3, 0.9];
const WHIP_REST = [-3.1, -3.0, -2.75, -2.35, -1.8, -1.15, -0.5, 0.2, 0.8];
/** 何節目まで「持ち上げ」に使うか（その節が攻撃の向きへ寄る割合） */
const RISE = 3;
const RISE_MIX = [0.15, 0.45, 0.8];

/** 脚の蹴りの強さ（膝が伸びて、脚が大きく振れている） */
const kick = (hip: number, kn: number): number => clamp01((0.9 - kn) / 0.7) * clamp01((Math.abs(hip) - 0.9) / 0.5);

const TONGUE: V2[] = [
  [0, -0.45],
  [5, -0.45],
  [7.4, -1.9],
  [7.9, -1.3],
  [6, 0],
  [7.9, 1.3],
  [7.4, 1.9],
  [5, 0.45],
  [0, 0.45],
];

/**
 * オロチ（白蛇）: とぐろの上に S 字の体と大きな頭。赤い丸い目と額の赤い隈取り、胴に灰色のひし形のウロコ。
 * 前の腕の動きが尾のムチ、奥の腕の突きが噛みつき
 */
export function buildOrochi(opts: CharacterOpts = {}): CharacterModel {
  const kit = new Kit(opts.quality);
  const scarf = accent(opts.variant, PURPLE, [RED, BLUE, YELLOW]);
  const TORSO = 37;
  const rig = createRig({
    height: 80,
    hipY: 12,
    torso: TORSO,
    shoulderAt: 0.5,
    shoulderX: -6,
    shoulderZ: 8,
    hipZ: 4,
    upperArm: 10,
    foreArm: 10,
    thigh: 4,
    shin: 4,
    squatGain: 0.35,
    plant: false,
  });
  const cy = 12 + TORSO / 2;
  const white = kit.toon(WHITE);
  const scaled = kit.toon('#ffffff', { vc: true });

  // とぐろ（体の座標で固定。地面は y = -cy）
  const coilN = kit.hi ? 26 : 16;
  const coilR: number[] = [];
  for (let i = 0; i < coilN; i++) coilR.push(mix(5.2, 8.2, i / (coilN - 1)));
  const coil = new Tube(kit, rig.body, scaled, coilR, kit.n(14, 8), 0.85, { col: BELLY, back: WHITE, half: 0.9, paint: scales(5) });
  coil.ref.set(0, -1, 0);
  for (let i = 0; i < coilN; i++) {
    const s = i / (coilN - 1);
    const th = Math.PI + s * Math.PI * 2.7;
    const R = mix(14.5, 7.5, s);
    coil.pts[i].set(-2 + R * Math.cos(th), -cy + coilR[i] + s * s * 5, R * Math.sin(th));
  }
  coil.update();
  const root0 = coil.pts[0].clone();

  // S 字の胴（毎フレーム、とぐろの中心から首まで）
  const BODY_R = [9.2, 9.8, 9.9, 9.6, 9.2, 8.8, 8.4, 8, 7.6, 7.2];
  const spine = new Tube(kit, rig.body, scaled, BODY_R, kit.n(16, 10), 0.95, { col: BELLY, back: WHITE, half: 0.95, paint: (i, k) => (i < 6 ? scales(5)(i, k) : null) }, [0.7, 0.6]);
  // 尾のムチ
  const whip = new Tube(kit, rig.body, white, WHIP_R, kit.n(12, 8), 0.75, undefined, [0.5, 1.2]);
  const tip = kit.group(rig.body);

  // 頭
  const HS = new Surf(3, 14.5, 0, 18.5, 17, 17.5);
  const look = addHead(kit, rig, HS, white);
  const face = buildFace(kit, look, {
    s: HS,
    // 赤い丸い目（瞳なし、白いハイライトだけ）と目尻の小さなまつげ
    eye: { yaw: 0.42, pitch: 0.0, w: 3.6, h: 4.2, top: RED_EYE, bot: '#e8321f', lash: 1.0, lid: 0.5, hl: 1.25, shut: '#b01a14' },
    mouth: { pitch: -0.3, w: 2.4, kind: 'w', thick: 0.75, open: [3.6, 3.4] },
    brow: [0.45, 1.3],
  });
  // 鼻の穴（2 つの点）と額の赤い隈取り（斜めの一筆）
  const marks = new Decal(HS);
  for (const side of [1, -1]) marks.ellipse({ yaw: side * 0.07, pitch: -0.13, lift: 0.3, mirror: side < 0 }, 0, 0, 0.45, 0.45, 8, 1);
  kit.deco(marks.build(), kit.flat(LINE), look);
  const kuma = new Decal(HS).line(
    { yaw: 0.02, pitch: 0.4, lift: 0.3 },
    [
      [-3.2, -4.4],
      [-0.5, -0.5],
      [2.8, 4.4],
    ],
    taper(2.8, 0.35),
  );
  kit.deco(kuma.build(), kit.flat(RED_EYE), look);
  // 鼻の穴（2 つ）はデカールの鼻で代用。舌（攻撃時・ときどきチロリ）
  const tongue = kit.deco(
    kit.geo('tongue', () => flatGeo(TONGUE, 0.5, 0.15)),
    kit.toon('#e2405a'),
    look,
  );
  tongue.position.copy(onSurf(HS, 0, -0.36, 0.96));
  tongue.rotation.z = -0.25;

  // 首巻き
  const sc = neckScarf(kit, rig.neck, scarf, { y: -0.5, x: 0.3, R: 7.4, a: 2.4, b: 2.9 });

  const probes: Probe[] = [
    [rig.head, 3, 14.5, 0, 17],
    [rig.body, -2, -cy + 8, 0, 15],
  ];
  const P = spine.pts;
  const W = whip.pts;
  const n = new THREE.Vector3();
  const d = new THREE.Vector3();
  let tongueOut = false;
  return finish({
    rig,
    tip,
    scarves: [{ anchor: sc.anchor, color: scarf, width: 5.5, length: 26 }],
    setExpression: (e) => {
      face.set(e);
      tongueOut = e === 'attack';
    },
    animate(p, r) {
      const t = p.time;
      // 噛みつき（奥の腕を前へ突き出したとき）
      const extB = clamp01((1.15 - p.bel) / 0.95) * clamp01((p.bsh + p.torso - 0.4) / 0.8);
      r.neck.position.set(extB * 13, TORSO - extB * 3, 0);
      r.head.rotation.z -= extB * 0.25;
      // 胴: とぐろの中心 → 腰 → 首の S 字（ベジェ）
      posIn(r.neck, r.body, 0, 0, 0, n);
      posIn(r.neck, r.body, 0, 1, 0, d).sub(n).normalize();
      const hy = r.hips.position.y;
      const sway = p.run * 2.2;
      for (let i = 0; i < P.length; i++) {
        const s = i / (P.length - 1);
        const u = 1 - s;
        // 制御点: とぐろの中 / 腰の前 / 首の下の後ろ / 首
        const x0 = -1;
        const y0 = -cy + 8;
        const x1 = 13;
        const y1 = hy + 5;
        const x2 = n.x - d.x * 16 - 11;
        const y2 = n.y - d.y * 16;
        const x3 = n.x - d.x;
        const y3 = n.y - d.y;
        const w0 = u * u * u;
        const w1 = 3 * u * u * s;
        const w2 = 3 * u * s * s;
        const w3 = s * s * s;
        P[i].set(w0 * x0 + w1 * x1 + w2 * x2 + w3 * x3, w0 * y0 + w1 * y1 + w2 * y2 + w3 * y3, Math.sin(t * 0.3 - i * 0.7) * sway * Math.sin(Math.PI * s));
      }
      spine.update();
      // 尾のムチ: 攻撃中はまっすぐな腕（または蹴り足）の向きへ伸びる。それ以外は腕がほぼ伸びきったとき（崖つかまり・つかみ）だけ
      const atk = p.expression === 'attack';
      let ext = atk ? clamp01((1.15 - p.fel) / 0.95) : clamp01((0.35 - p.fel) / 0.3);
      let A = (p.torso + p.fsh) * r.spec.armGain;
      const kf = atk ? kick(p.fhip, p.fkn) : 0;
      const kb = atk ? kick(p.bhip, p.bkn) : 0;
      if (kf > ext) {
        ext = kf;
        A = p.fhip;
      }
      if (kb > ext) {
        ext = kb;
        A = p.bhip;
      }
      if (atk) ext = Math.max(ext, 0.5);
      // 真下で切って、前半分は上を回る向きにする（-2π..0）
      A = Math.atan2(Math.sin(A), Math.cos(A));
      const Wd = A > 0 ? A - Math.PI * 2 : A;
      const droop = Wd < -Math.PI ? -0.06 : 0.06;
      W[0].copy(root0);
      for (let i = 0; i < WHIP_L.length; i++) {
        const rest = WHIP_REST[i] + Math.sin(t * 0.07 - i * 0.6) * (0.1 + i * 0.025) * (1 + p.run);
        const atk = i < RISE ? mix(-3.0, Wd, RISE_MIX[i]) : Wd + droop * (i - RISE + 1);
        const ang = mix(rest, atk, ext);
        const L = WHIP_L[i] * (1 + ext * (i < RISE ? 0.5 : 1.5));
        W[i + 1].set(W[i].x + Math.sin(ang) * L, W[i].y - Math.cos(ang) * L, mix(0, 20, ext) * Math.min(1, (i + 1) / RISE));
      }
      whip.update();
      tip.position.copy(W[W.length - 1]);
      // 舌
      tongue.visible = tongueOut || t % 200 < 12;
      tongue.scale.x = tongueOut ? 1 : 0.7 + 0.3 * Math.sin(t * 1.3);
      groundSpin(r, probes, p);
    },
  });
}
