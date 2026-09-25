import * as THREE from 'three';
import type { ModelPose } from './types';

/**
 * ちびキャラ用の共通骨格。2D 版と同じ姿勢データ（ModelPose）で動く。
 *
 * 階層（すべて THREE.Group。メッシュは好きな関節の子に付ける）:
 *   root（足元・原点）
 *   └ body（回転と伸縮の中心 = 腰と首の中間）
 *      └ hips（腰。pose.y でしゃがむ）
 *         ├ torso（胴。+y 方向へ torso の長さだけ伸びる）
 *         │  ├ neck（首。torso の先端）
 *         │  │  └ head（頭。頭のメッシュは head の +y 側に置く）
 *         │  ├ fsh → fel → fhand（手前の腕: 肩→肘→手首。-y 方向に伸びる）
 *         │  └ bsh → bel → bhand（奥の腕）
 *         ├ fhip → fknee → ffoot（手前の脚: 股→膝→足首。-y 方向に伸びる）
 *         └ bhip → bknee → bfoot（奥の脚）
 * キャラは +x を向き、手前（カメラ側）が +z。
 */
export interface RigSpec {
  /** おおよその身長（頭のてっぺんまで） */
  height: number;
  /** 股関節の高さ（直立時・地面から） */
  hipY: number;
  /** 腰→首の長さ */
  torso: number;
  /** 肩の高さ（腰から胴に沿った割合）既定 0.8 */
  shoulderAt?: number;
  /** 肩の前後位置 */
  shoulderX?: number;
  /** 肩の左右（z）の間隔の半分 */
  shoulderZ: number;
  /** 股の左右（z）の間隔の半分 */
  hipZ: number;
  hipX?: number;
  upperArm: number;
  foreArm: number;
  thigh: number;
  shin: number;
  /** 手足の角度の効き具合（短い手足なら小さめに）既定 1 */
  armGain?: number;
  legGain?: number;
  torsoGain?: number;
  headGain?: number;
  /** pose.y（しゃがみ）の効き具合。既定 hipY / 44 */
  squatGain?: number;
  /** 接地中は低い方の足を地面に合わせる（脚のないキャラは false）既定 true */
  plant?: boolean;
}

export interface Rig {
  spec: Required<RigSpec>;
  root: THREE.Group;
  body: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  fsh: THREE.Group;
  fel: THREE.Group;
  fhand: THREE.Group;
  bsh: THREE.Group;
  bel: THREE.Group;
  bhand: THREE.Group;
  fhip: THREE.Group;
  fknee: THREE.Group;
  ffoot: THREE.Group;
  bhip: THREE.Group;
  bknee: THREE.Group;
  bfoot: THREE.Group;
}

function g(name: string, parent?: THREE.Object3D): THREE.Group {
  const o = new THREE.Group();
  o.name = name;
  parent?.add(o);
  return o;
}

export function createRig(spec: RigSpec): Rig {
  const s: Required<RigSpec> = {
    shoulderAt: 0.8,
    shoulderX: 0,
    hipX: 0,
    armGain: 1,
    legGain: 1,
    torsoGain: 1,
    headGain: 1,
    squatGain: spec.hipY / 44,
    plant: true,
    ...spec,
  };
  const root = g('root');
  const body = g('body', root);
  const cy = s.hipY + s.torso * 0.5;
  body.position.y = cy;
  const hips = g('hips', body);
  hips.position.y = s.hipY - cy;
  const torso = g('torso', hips);
  const neck = g('neck', torso);
  neck.position.y = s.torso;
  const head = g('head', neck);
  const arm = (side: 'f' | 'b') => {
    const sh = g(`${side}sh`, torso);
    sh.position.set(s.shoulderX, s.torso * s.shoulderAt, side === 'f' ? s.shoulderZ : -s.shoulderZ);
    const el = g(`${side}el`, sh);
    el.position.y = -s.upperArm;
    const hand = g(`${side}hand`, el);
    hand.position.y = -s.foreArm;
    return [sh, el, hand] as const;
  };
  const leg = (side: 'f' | 'b') => {
    const hip = g(`${side}hip`, hips);
    hip.position.set(s.hipX, 0, side === 'f' ? s.hipZ : -s.hipZ);
    const knee = g(`${side}knee`, hip);
    knee.position.y = -s.thigh;
    const foot = g(`${side}foot`, knee);
    foot.position.y = -s.shin;
    return [hip, knee, foot] as const;
  };
  const [fsh, fel, fhand] = arm('f');
  const [bsh, bel, bhand] = arm('b');
  const [fhip, fknee, ffoot] = leg('f');
  const [bhip, bknee, bfoot] = leg('b');
  return { spec: s, root, body, hips, torso, neck, head, fsh, fel, fhand, bsh, bel, bhand, fhip, fknee, ffoot, bhip, bknee, bfoot };
}

/**
 * 姿勢を当てる。角度の意味は 2D 版（src/render/rig.ts）と同じ:
 * 手足は「真下 = 0、前へ回すと +」、胴と頭は「+ で前傾」、腕の角度は胴の角度に足される。
 */
export function applyPose(r: Rig, p: ModelPose, grounded: boolean): void {
  const s = r.spec;
  const t = p.torso * s.torsoGain;
  r.torso.rotation.z = -t;
  r.head.rotation.z = -p.head * s.headGain;
  // 2D は「腕の向き = 胴 + 肩」なので、胴の回転を打ち消してから足す
  r.fsh.rotation.z = (p.torso + p.fsh) * s.armGain + t;
  r.fel.rotation.z = p.fel * s.armGain;
  r.bsh.rotation.z = (p.torso + p.bsh) * s.armGain + t;
  r.bel.rotation.z = p.bel * s.armGain;
  const fh = p.fhip * s.legGain;
  const fk = p.fkn * s.legGain;
  const bh = p.bhip * s.legGain;
  const bk = p.bkn * s.legGain;
  r.fhip.rotation.z = fh;
  r.fknee.rotation.z = -fk;
  r.bhip.rotation.z = bh;
  r.bknee.rotation.z = -bk;
  const cy = s.hipY + s.torso * 0.5;
  const hipLocal = s.hipY - cy - p.y * s.squatGain;
  r.hips.position.y = hipLocal;
  r.body.rotation.z = -p.spin;
  r.body.scale.set(1 / Math.sqrt(Math.max(0.5, p.squash)), p.squash, 1);
  let by = cy;
  if (s.plant && grounded && Math.abs(p.spin) < 0.01) {
    // 低い方の足を地面へ（2D 版の plant と同じ）
    const foot = (a: number, k: number) => -(s.thigh * Math.cos(a) + s.shin * Math.cos(a - k));
    const low = Math.min(foot(fh, fk), foot(bh, bk));
    by = -(hipLocal + low) * p.squash;
  }
  r.body.position.y = by;
}
