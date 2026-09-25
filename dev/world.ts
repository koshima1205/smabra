// 3D 描画の確認用（仮のキャラ・ステージで World3D と 2D オーバーレイの重なりを確かめる）
import { Controller } from '../src/core/input';
import { CpuBrain } from '../src/game/ai';
import { Fighter } from '../src/game/fighter';
import { Match } from '../src/game/match';
import { FIGHTERS } from '../src/game/roster';
import { stageById } from '../src/game/stage';
import { renderBattle } from '../src/render/battleRenderer';
import { placeholderCharacter, placeholderStage } from '../src/render3d/placeholder';
import { setWorld, World3D } from '../src/render3d/world';

const q = new URLSearchParams(location.search);

const world = new World3D(document.getElementById('world') as HTMLCanvasElement, { buildStage: placeholderStage, buildCharacter: placeholderCharacter }, 'high');
setWorld(world);
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1);
  W = innerWidth;
  H = innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  world.setSize(W, H, DPR);
}
addEventListener('resize', resize);
resize();

const stage = stageById(q.get('stage') ?? 'iga');
const fighters: Fighter[] = [];
const ids = (q.get('ids') ?? '0,1,2,3').split(',').map(Number);
const m0 = { stocks: 9, time: 0, stageId: stage.id };
ids.forEach((k, i) => {
  const b = new CpuBrain(7, 99 + i);
  const f = new Fighter(FIGHTERS[k], i, i, new Controller(() => b.pad, { id: 'cpu', label: 'CPU', digital: false, flickSmash: false, tapJump: false }), true);
  fighters.push(f);
  (f as unknown as { brain: CpuBrain }).brain = b;
});
const m = new Match(stage, m0, fighters, {});
fighters.forEach((f) => m.brains.set(f, (f as unknown as { brain: CpuBrain }).brain));
if (q.has('final')) for (const f of fighters) f.meter = 100;
const steps = Number(q.get('steps') ?? 0);
for (let i = 0; i < steps; i++) m.step();
let t = steps;
(window as unknown as { __m: Match; __w: World3D }).__m = m;
(window as unknown as { __w: World3D }).__w = world;
const camZoom = Number(q.get('zoom') ?? 0);
const follow = Number(q.get('follow') ?? 0);
function loop() {
  if (!q.has('freeze')) {
    m.step();
    t++;
  }
  if (camZoom) {
    const f = fighters[follow];
    m.camera.zoom = camZoom;
    m.camera.x = f.x;
    m.camera.y = f.y - 60;
  }
  if (q.has('stopAtFinal') && m.cinematic && m.cinematic.t < m.cinematic.max - 14) q.set('freeze', '1');
  renderBattle(ctx, m, { labels: fighters.map((_, i) => `${i + 1}P`), cpu: fighters.map(() => false), hud: true }, W, H, DPR, t);
  requestAnimationFrame(loop);
}
loop();
