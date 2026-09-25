import * as THREE from 'three';

/**
 * ゲームの 2D カメラ（注視点・ズーム）と three.js のカメラを一致させる。
 *
 * カメラは回転させず -z 方向を向け、注視点より少し上（LIFT）に置いて、レンズを下へずらす（オフアクシス投影）。
 * こうすると遊ぶ平面 z = 0 は 2D の camera.apply() と完全に同じ位置・大きさで映り、
 * 奥行きのある物（足場の上面・背景）は少し見下ろした立体として見える。
 */
export const FOV = 30;
export const LIFT = 0.17;
const TAN = Math.tan((FOV * Math.PI) / 360);

export interface View2D {
  x: number;
  y: number;
  zoom: number;
}

/** カメラを合わせ、カメラまでの距離を返す */
export function syncCamera(cam: THREE.PerspectiveCamera, v: View2D, w: number, h: number): number {
  const d = h / (2 * v.zoom * TAN);
  const lift = d * LIFT;
  cam.position.set(v.x, -v.y + lift, d);
  cam.rotation.set(0, 0, 0);
  cam.updateMatrixWorld(true);
  const near = Math.max(5, d * 0.2);
  const far = d + 16000;
  const top = near * TAN;
  const shift = (-near * lift) / d;
  const aspect = w / Math.max(1, h);
  cam.near = near;
  cam.far = far;
  cam.aspect = aspect;
  cam.fov = FOV;
  cam.projectionMatrix.makePerspective(-top * aspect, top * aspect, top + shift, -top + shift, near, far);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  return d;
}

export interface RendererOpts {
  canvas?: HTMLCanvasElement;
  antialias?: boolean;
  alpha?: boolean;
}

/** 共通のレンダラー設定（ゲーム本体・プレビューで同じ見た目にする） */
export function createRenderer(o: RendererOpts = {}): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({
    canvas: o.canvas,
    antialias: o.antialias ?? true,
    alpha: o.alpha ?? false,
    powerPreference: 'high-performance',
  });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NoToneMapping;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  return r;
}
