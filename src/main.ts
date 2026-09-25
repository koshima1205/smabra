import './style.css';
import { audio } from './core/audio';
import { InputManager } from './core/input';
import { App } from './ui/app';
import { TitleScene } from './ui/scenes/title';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
const ui = document.getElementById('ui') as HTMLElement;
const touchEl = document.getElementById('touch') as HTMLElement;

let W = 0;
let H = 0;
let DPR = 1;
function resize(): void {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
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
function frame(now: number): void {
  acc += Math.min(250, now - last);
  last = now;
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
(window as unknown as { __ninja: App }).__ninja = app;
