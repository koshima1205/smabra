import * as THREE from 'three';
import type { StageDef } from '../game/types';
import type { CnpId, ModelPose } from './types';
import { createRenderer, syncCamera } from './view';
import type { WorldDeps } from './world';

/**
 * キャラの顔アイコン・ステージのサムネイルを 3D モデルから描いて 2D キャンバスにする。
 * 専用の小さなレンダラーを使い、しばらく使わなければ解放する。
 */
let deps: WorldDeps | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
const chars = new Map<string, HTMLCanvasElement>();
const stages = new Map<string, HTMLCanvasElement>();

export function initSnapshots(d: WorldDeps): void {
  deps = d;
}

function release(): void {
  if (!renderer) return;
  renderer.dispose();
  renderer.forceContextLoss();
  renderer = null;
}

function getRenderer(w: number, h: number): THREE.WebGLRenderer | null {
  try {
    if (!renderer) {
      renderer = createRenderer({ canvas: document.createElement('canvas'), alpha: true, antialias: true });
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = false;
    }
  } catch {
    return null;
  }
  renderer.setSize(w, h, false);
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(release, 5000);
  return renderer;
}

function copy(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')?.drawImage(src, 0, 0, w, h);
  return c;
}

const STAND: ModelPose = {
  torso: 0.05,
  head: -0.05,
  fsh: 0.5,
  fel: 1.3,
  bsh: 0.15,
  bel: 1.0,
  fhip: 0.14,
  fkn: 0.2,
  bhip: -0.12,
  bkn: 0.15,
  spin: 0,
  squash: 1,
  y: 0,
  time: 30,
  air: false,
  run: 0,
  expression: 'normal',
};

export type ThumbMode = 'face' | 'bust' | 'full';

/** キャラのアイコン（透明背景）。作れない環境では null */
export function characterThumb(id: string, o: { variant?: number; size?: number; mode?: ThumbMode } = {}): HTMLCanvasElement | null {
  const variant = o.variant ?? 0;
  const size = o.size ?? 160;
  const mode = o.mode ?? 'face';
  const key = `${id}:${variant}:${size}:${mode}`;
  const hit = chars.get(key);
  if (hit) return hit;
  if (!deps || typeof document === 'undefined') return null;
  const r = getRenderer(size, size);
  if (!r) return null;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e8, 0x5b4a78, 1.6));
  const key1 = new THREE.DirectionalLight(0xffffff, 2.2);
  key1.position.set(-0.6, 1.2, 1.4);
  scene.add(key1);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 1.4);
  rim.position.set(1, 0.6, -1);
  scene.add(rim);
  let model;
  try {
    model = deps.buildCharacter(id as CnpId, { variant, quality: 'high' });
  } catch {
    return null;
  }
  model.pose(STAND);
  model.root.rotation.y = -0.5;
  scene.add(model.root);
  model.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model.root);
  const top = box.max.y;
  const bottom = Math.max(0, box.min.y);
  const hgt = top - bottom;
  // 顔アップ: 頭の中心あたり / 上半身 / 全身
  const span = mode === 'face' ? model.height * 0.62 : mode === 'bust' ? hgt * 0.78 : hgt * 1.08;
  const cy = mode === 'full' ? bottom + hgt / 2 : top - span * 0.52;
  const cam = new THREE.PerspectiveCamera(22, 1, 10, 5000);
  const dist = span / 2 / Math.tan((11 * Math.PI) / 180);
  cam.position.set(0, cy + span * 0.08, dist);
  cam.lookAt(0, cy, 0);
  r.setClearColor(0x000000, 0);
  r.render(scene, cam);
  const out = copy(r.domElement, size, size);
  model.dispose();
  chars.set(key, out);
  return out;
}

/** ステージのサムネイル */
export function stageThumb(stage: StageDef, w = 480, h = 270): HTMLCanvasElement | null {
  const key = `${stage.id}:${w}x${h}`;
  const hit = stages.get(key);
  if (hit) return hit;
  if (!deps || typeof document === 'undefined') return null;
  const r = getRenderer(w, h);
  if (!r) return null;
  let inst;
  try {
    inst = deps.buildStage(stage, { quality: 'high' });
  } catch {
    return null;
  }
  const scene = new THREE.Scene();
  scene.add(inst.group);
  scene.background = inst.background;
  scene.fog = inst.fog;
  const cam = new THREE.PerspectiveCamera();
  const width = stage.main.x2 - stage.main.x1 + 760;
  const v = { x: (stage.main.x1 + stage.main.x2) / 2, y: -170, zoom: Math.min(w / width, h / 620) };
  syncCamera(cam, v, w, h);
  inst.update(0, v.x, -v.y);
  r.setClearColor(0x000000, 1);
  r.render(scene, cam);
  const out = copy(r.domElement, w, h);
  inst.dispose();
  stages.set(key, out);
  return out;
}

const queue: { id: string; variant: number; size: number; mode: ThumbMode }[] = [];

/** 先に作っておくアイコンを予約する（タイトル画面などで 1F に1枚ずつ描く） */
export function queueThumbs(ids: string[], sizes: { size: number; mode: ThumbMode }[]): void {
  for (const id of ids) for (const s of sizes) queue.push({ id, variant: 0, ...s });
}

/** 予約したアイコンを1枚だけ作る。残りがあれば true */
export function pumpThumbs(): boolean {
  const job = queue.shift();
  if (!job) return false;
  characterThumb(job.id, job);
  return queue.length > 0;
}
