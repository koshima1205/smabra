import * as THREE from 'three';
import { applyPose, type Rig } from './rig';
import { toonGradient } from './toon';
import type { CharacterModel, ModelPose, ScarfSpec } from './types';

export interface ModelParts {
  rig: Rig;
  /** 尻尾・耳・翼・ゆらゆらなどの追加アニメーション。applyPose の後に毎フレーム呼ばれる */
  animate?: (p: ModelPose, rig: Rig) => void;
  /** 表情の切り替え（変わったときだけ呼ばれる） */
  setExpression?: (e: ModelPose['expression']) => void;
  /** 攻撃の軌跡の先端（既定は前の手 rig.fhand） */
  tip?: THREE.Object3D;
  /** たなびくマフラー・鉢巻（任意、複数可） */
  scarves?: ScarfSpec[];
}

export interface FinishedModel extends CharacterModel {
  rig: Rig;
}

const WHITE = new THREE.Color(1, 1, 1);

/**
 * 骨格とメッシュから CharacterModel を仕上げる。
 * - 輪郭線（userData.outline のメッシュ）のマテリアルをモデル専用に複製する（半透明にできるように）
 * - 被弾フラッシュ・半透明・破棄をまとめて実装する
 * - 影を落とす設定をする
 */
export function finishModel(parts: ModelParts): FinishedModel {
  const { rig } = parts;
  const root = rig.root;
  const mats: THREE.Material[] = [];
  const toon: { m: THREE.MeshToonMaterial; base: THREE.Color }[] = [];
  const own = new Map<string, THREE.Material>();
  const baseOpacity = new Map<THREE.Material, number>();
  const baseDepthWrite = new Map<THREE.Material, boolean>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = list.map((m) => {
      let mm = own.get(m.uuid);
      if (!mm) {
        // 共有マテリアルはモデルごとに複製（フラッシュや半透明が他のキャラに移らないように）
        mm = m.clone();
        own.set(m.uuid, mm);
        mats.push(mm);
        baseOpacity.set(mm, mm.opacity);
        baseDepthWrite.set(mm, mm.depthWrite);
        if ((mm as THREE.MeshToonMaterial).isMeshToonMaterial) {
          const t = mm as THREE.MeshToonMaterial;
          toon.push({ m: t, base: t.emissive.clone() });
        }
      }
      return mm;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
    if (!mesh.userData.outline && !mesh.userData.noShadow) mesh.castShadow = true;
  });

  let flash = -1;
  let opacity = -1;
  let expr: ModelPose['expression'] | null = null;
  const tipObj = parts.tip ?? rig.fhand;
  return {
    rig,
    root,
    height: rig.spec.height,
    scarves: parts.scarves ?? [],
    pose(p) {
      applyPose(rig, p, !p.air);
      parts.animate?.(p, rig);
      if (p.expression !== expr) {
        expr = p.expression;
        parts.setExpression?.(expr);
      }
    },
    setFlash(k) {
      const q = Math.round(k * 20) / 20;
      if (q === flash) return;
      flash = q;
      for (const t of toon) t.m.emissive.copy(t.base).lerp(WHITE, q * 0.85);
    },
    setOpacity(a) {
      const q = Math.round(a * 20) / 20;
      if (q === opacity) return;
      const wasT = opacity >= 0 && opacity < 1;
      opacity = q;
      const isT = q < 1;
      for (const m of mats) {
        const base = baseOpacity.get(m) ?? 1;
        m.opacity = base * q;
        m.transparent = base < 1 || isT;
        const dw = baseDepthWrite.get(m) ?? true;
        m.depthWrite = isT ? dw && q > 0.6 : dw;
        if (wasT !== isT) m.needsUpdate = true;
      }
    },
    tip(out) {
      return tipObj.getWorldPosition(out);
    },
    dispose() {
      const geos = new Set<THREE.BufferGeometry>();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) geos.add(mesh.geometry);
      });
      for (const geo of geos) geo.dispose();
      const grad = toonGradient();
      for (const m of mats) {
        for (const v of Object.values(m)) {
          if (v instanceof THREE.Texture && v !== grad && !v.userData.shared) v.dispose();
        }
        m.dispose();
      }
    },
  };
}
