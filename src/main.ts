import './style.css';
import { audio } from './core/audio';
import { InputManager } from './core/input';
import { buildCharacter } from './render3d/characters';
import { placeholderStage as buildStage } from './render3d/placeholder';
import { initSnapshots } from './render3d/snapshots';
import { setWorld, World3D } from './render3d/world';
import { App } from './ui/app';
import { TitleScene } from './ui/scenes/title';

const canvas3d = document.getElementById('world') as HTMLCanvasElement;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const ui = document.getElementById('ui') as HTMLElement;
const touchEl = document.getElementById('touch') as HTMLElement;

// 3D（WebGL）。使えない環境では 2D の簡易表示で遊べる
const deps = { buildStage, buildCharacter };
initSnapshots(deps);
const lowEnd = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 500;
let world: World3D | null = null;
try {
  world = new World3D(canvas3d, deps, lowEnd ? 'low' : 'high');
  setWorld(world);
} catch (e) {
  console.warn('WebGL を使えないため簡易表示にします', e);
  canvas3d.style.display = 'none';
}

let W = 0;
let H = 0;
let DPR = 1;
/** 描画が重い端末では段階的に軽くする（1 = 端末の解像度のまま） */
let quality = 1;
function resize(): void {
  const dev = window.devicePixelRatio || 1;
  DPR = Math.max(0.6, Math.min(2, dev) * quality);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  // 3D は少し控えめの解像度
  world?.setSize(W, H, Math.max(0.5, Math.min(1.5, dev) * quality));
}
window.addEventListener('resize', resize);
resize();

const unlock = () => audio.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

const input = new InputManager();
const app = new App(input, ui, touchEl);
app.go(new TitleScene(app));

// 固定 60Hz でロジック、描画は毎フレーム
const STEP = 1000 / 60;
let acc = 0;
let last = performance.now();
let slowSum = 0;
let slowN = 0;
function frame(now: number): void {
  const dt = now - last;
  acc += Math.min(250, dt);
  last = now;
  // 平均 40fps を下回り続けたら、まず影を切り、次に解像度を下げる
  if (dt < 250 && !document.hidden) {
    slowSum += dt;
    if (++slowN >= 120) {
      if (slowSum / slowN > 25) {
        if (world?.shadows) world.shadows = false;
        else if (quality > 0.5) {
          quality = Math.max(0.5, quality - 0.25);
          resize();
        }
      }
      slowSum = 0;
      slowN = 0;
    }
  }
  let n = 0;
  while (acc >= STEP && n < 5) {
    input.poll();
    app.update();
    acc -= STEP;
    n++;
  }
  if (n === 5) acc = 0;
  app.render(ctx, W, H, DPR);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// デバッグ・自動テスト用
(window as unknown as { __ninja: App; __world: World3D | null }).__ninja = app;
(window as unknown as { __world: World3D | null }).__world = world;
