/**
 * ステージの 3D 確認ページ（http://localhost:5174/dev/stages.html?stage=iga）。
 * ゲーム本体と同じカメラ（syncCamera）・レンダラー設定・影の当て方で描き、トゥーンの確認用人形を立てる。
 *
 * URL: ?stage=iga|tenkai|nenokuni|saika|(未知の ID = 簡易ステージ)
 *      &zoom=0.8 &x=0 &y=-200（ゲーム座標のカメラ注視点）&quality=high|low &shadow=0
 *      &frame=0 &freeze=1（時間を止める）&hud=0 &probes=0 &under=1（床下の人形）
 * 操作: 矢印 = 移動, Q/E = ズーム, Space = 一時停止
 */
import * as THREE from 'three';
import { platformAt, STAGES } from '../src/game/stage';
import type { StageDef } from '../src/game/types';
import { buildStage } from '../src/render3d/stages';
import { addOutline, toonMat } from '../src/render3d/toon';
import type { Quality } from '../src/render3d/types';
import { createRenderer, syncCamera } from '../src/render3d/view';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number): number => {
  const v = q.get(k);
  return v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v);
};
const id = q.get('stage') ?? 'iga';
const stage: StageDef = STAGES.find((s) => s.id === id) ?? { ...STAGES[0], id };
const quality: Quality = q.get('quality') === 'low' ? 'low' : 'high';
const shadows = q.get('shadow') !== '0';
const freeze = q.get('freeze') === '1';
const showHud = q.get('hud') !== '0';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
hud.style.display = showHud ? '' : 'none';

const renderer = createRenderer({ canvas, antialias: quality === 'high' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 16 / 9, 10, 20000);

let t0 = performance.now();
let inst = buildStage(stage, { quality });
let buildMs = performance.now() - t0;
if (q.get('rebuild') === '1') {
  // 2 回目（JIT が温まった状態）の組み立て時間も測る
  inst.dispose();
  const cold = buildMs;
  t0 = performance.now();
  inst = buildStage(stage, { quality });
  buildMs = performance.now() - t0;
  console.log(`build cold ${cold.toFixed(1)}ms, warm ${buildMs.toFixed(1)}ms`);
}
scene.add(inst.group);
scene.background = inst.background;
scene.fog = inst.fog;

// 影（world.ts の fitShadow と同じ当て方）
const sun = inst.sun;
const dir = new THREE.Vector3().subVectors(sun.position, sun.target.position);
if (dir.lengthSq() < 1e-6) dir.set(0.4, 1, 0.6);
dir.normalize();
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 1.2;
if (!sun.target.parent) inst.group.add(sun.target);
renderer.shadowMap.enabled = shadows;
sun.castShadow = shadows;

// 確認用の人形（カプセルの胴 + 球の頭、約 95）
function probe(color: THREE.ColorRepresentation): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(17, 36, 6, 16), toonMat(color));
  body.position.y = 35;
  addOutline(body, 1.06);
  const head = new THREE.Mesh(new THREE.SphereGeometry(16, 20, 14), toonMat('#ffe2c8'));
  head.position.y = 80;
  addOutline(head, 1.07);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(16.6, 16.6, 5, 20), toonMat(color));
  band.position.y = 86;
  const eye = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 2), toonMat('#1b1726'));
  eye.position.set(8, 80, 13);
  eye.rotation.y = 0.5;
  for (const m of [body, head, band, eye]) {
    m.castShadow = true;
    g.add(m);
  }
  g.rotation.y = -0.36;
  return g;
}

interface Probe {
  g: THREE.Group;
  x: number;
  y: number;
  plat: number;
}
const probes: Probe[] = [];
if (q.get('probes') !== '0') {
  const add = (color: string, x: number, y: number, plat = -1): void => {
    const g = probe(color);
    scene.add(g);
    probes.push({ g, x, y, plat });
  };
  add('#e8453c', stage.spawns[0]?.x ?? -300, 0);
  add('#3c7de8', stage.spawns[3]?.x ?? 150, 0);
  add('#f2c230', stage.main.x2 - 26, 0);
  if (stage.platforms.length > 0) add('#45c46a', 0, 0, 0);
  else add('#45c46a', stage.main.x1 - 24, -92);
  if (q.get('under') === '1') add('#c05ce8', 0, -stage.main.depth - 110);
}

// カメラ（ゲーム座標: y 下向き）
const view = { x: num('x', 0), y: num('y', -200), zoom: 0 };
const zoomParam = q.get('zoom');
let zoomMul = 1;
let w = 1;
let h = 1;
function resize(): void {
  w = window.innerWidth;
  h = window.innerHeight;
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize);
resize();

let paused = freeze;
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  keys.add(e.key);
  if (e.key === ' ') paused = !paused;
});
window.addEventListener('keyup', (e) => keys.delete(e.key));

let frame = num('frame', 0);
let rendered = 0;
let fps = 0;
let fpsT = performance.now();
let fpsN = 0;
const stats = { calls: 0, tris: 0, build: buildMs, update: 0, render: 0, fps: 0, geometries: 0, textures: 0 };
(window as unknown as { __stats: typeof stats }).__stats = stats;

function tick(): void {
  const base = zoomParam !== null ? Number(zoomParam) : Math.min(w / 1600, h / 900);
  if (keys.has('q')) zoomMul *= 0.98;
  if (keys.has('e')) zoomMul *= 1.02;
  const pan = 12 / Math.max(0.1, base * zoomMul);
  if (keys.has('ArrowLeft')) view.x -= pan;
  if (keys.has('ArrowRight')) view.x += pan;
  if (keys.has('ArrowUp')) view.y -= pan;
  if (keys.has('ArrowDown')) view.y += pan;
  view.zoom = base * zoomMul;
  syncCamera(camera, view, w, h);

  const tu = performance.now();
  inst.update(frame, view.x, -view.y);
  stats.update = performance.now() - tu;

  for (const p of probes) {
    if (p.plat >= 0) {
      const s = platformAt(stage.platforms[p.plat], frame);
      p.g.position.set((s.x1 + s.x2) / 2 + p.x, -s.y, 0);
    } else p.g.position.set(p.x, p.y, 0);
  }

  if (shadows) {
    const half = Math.max(w, h) / (2 * view.zoom);
    const ext = Math.min(2600, Math.max(500, half * 1.15));
    sun.target.position.set(view.x, -view.y, 0);
    sun.position.copy(dir).multiplyScalar(4000).add(sun.target.position);
    const sc = sun.shadow.camera;
    sc.left = -ext;
    sc.right = ext;
    sc.top = ext;
    sc.bottom = -ext;
    sc.near = 100;
    sc.far = 9000;
    sc.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
  }

  const tr = performance.now();
  renderer.render(scene, camera);
  stats.render = performance.now() - tr;
  stats.calls = renderer.info.render.calls;
  stats.tris = renderer.info.render.triangles;
  stats.geometries = renderer.info.memory.geometries;
  stats.textures = renderer.info.memory.textures;

  fpsN++;
  const now = performance.now();
  if (now - fpsT > 500) {
    fps = (fpsN * 1000) / (now - fpsT);
    fpsT = now;
    fpsN = 0;
    stats.fps = fps;
  }
  if (showHud) {
    hud.textContent =
      `${stage.id} (${quality})  frame ${frame}${paused ? ' [paused]' : ''}\n` +
      `zoom ${view.zoom.toFixed(2)}  cam (${view.x.toFixed(0)}, ${view.y.toFixed(0)})\n` +
      `calls ${stats.calls}  tris ${(stats.tris / 1000).toFixed(1)}k  geo ${stats.geometries}  tex ${stats.textures}\n` +
      `build ${buildMs.toFixed(0)}ms  update ${stats.update.toFixed(2)}ms  render ${stats.render.toFixed(1)}ms  ${fps.toFixed(0)}fps`;
  }
  if (!paused) frame++;
  rendered++;
  if (rendered === 3) (window as unknown as { __ready: boolean }).__ready = true;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// 破棄の確認用（コンソールから __dispose()）
(window as unknown as { __dispose: () => void }).__dispose = () => {
  inst.dispose();
  renderer.info.reset();
  console.log('disposed; memory', JSON.stringify(renderer.info.memory));
};
