import * as THREE from 'three';
import { platformAt } from '../game/stage';
import type { StageDef } from '../game/types';
import { finishModel } from './model';
import { createRig } from './rig';
import { addOutline, toonMat } from './toon';
import type { BuildCharacter, BuildStage, StageInstance } from './types';

/**
 * 仮のステージ・キャラ（本番のモデルが無いときや描画テスト用）。
 * 床と足場の箱、カプセルの体と球の頭だけの簡単な形。
 */
export const placeholderStage: BuildStage = (st: StageDef): StageInstance => {
  const group = new THREE.Group();
  const w = st.main.x2 - st.main.x1;
  const main = new THREE.Mesh(new THREE.BoxGeometry(w, 300, st.main.depth), toonMat(0x6a5f8a));
  main.position.set((st.main.x1 + st.main.x2) / 2, -150, 0);
  main.receiveShadow = true;
  group.add(main);
  const plats = st.platforms.map((p) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.x2 - p.x1, 14, 110), toonMat(0xb09a6a));
    m.receiveShadow = true;
    group.add(m);
    return { p, m };
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(9000, 5000), toonMat(0x2a2450));
  back.position.set(0, 400, -2500);
  group.add(back);
  group.add(new THREE.HemisphereLight(0xdde6ff, 0x3a3050, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0dd, 2.4);
  sun.position.set(400, 1000, 600);
  group.add(sun, sun.target);
  return {
    group,
    background: new THREE.Color(0x151230),
    fog: null,
    sun,
    update(frame) {
      for (const { p, m } of plats) {
        const s = platformAt(p, frame);
        m.position.set((s.x1 + s.x2) / 2, -s.y - 7, 0);
      }
    },
    dispose() {},
  };
};

const COLORS: Record<string, number> = { leelee: 0xffffff, mitama: 0xe8e4ff, narukami: 0x3050b0, orochi: 0xf4f4f4, luna: 0xfff3e6, yama: 0xe0502a, makami: 0x9aa0aa, towa: 0x222228, setsuna: 0xfafafa };

export const placeholderCharacter: BuildCharacter = (id) => {
  const H = 86;
  const rig = createRig({ height: H, hipY: 24, torso: 22, shoulderZ: 14, hipZ: 8, upperArm: 11, foreArm: 10, thigh: 12, shin: 12 });
  const col = COLORS[id] ?? 0xcccccc;
  const mat = toonMat(col);
  const dark = toonMat(0x333344);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(14, 14, 6, 16), mat);
  body.position.y = 11;
  addOutline(body);
  rig.torso.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(22, 24, 16), mat);
  head.position.y = 20;
  addOutline(head);
  rig.head.add(head);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 8), dark);
  eye.position.set(18, 22, 7);
  rig.head.add(eye);
  const limb = (j: THREE.Object3D, len: number, r: number) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
    m.position.y = -len / 2;
    addOutline(m);
    j.add(m);
  };
  limb(rig.fsh, 11, 4.5);
  limb(rig.fel, 10, 4.5);
  limb(rig.bsh, 11, 4.5);
  limb(rig.bel, 10, 4.5);
  limb(rig.fhip, 12, 5.5);
  limb(rig.fknee, 12, 5.5);
  limb(rig.bhip, 12, 5.5);
  limb(rig.bknee, 12, 5.5);
  const knot = new THREE.Group();
  knot.position.set(-12, 30, 0);
  rig.head.add(knot);
  return finishModel({ rig, scarves: [{ anchor: knot, color: 0xe0443a, width: 9, length: 46 }] });
};

