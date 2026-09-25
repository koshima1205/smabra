import type { Match } from '../game/match';
import { platformAt } from '../game/stage';
import { getWorld } from '../render3d/world';
import { drawParticles, drawProjectile } from './fx';
import { drawHud, type HudPlayer } from './hud';
import { CPU_COLOR, drawFighterOverlay, PORT_COLORS } from './overlay';

export interface BattleView {
  labels: string[];
  cpu: boolean[];
  /** HUD（ダメージ表示など）を描くか */
  hud?: boolean;
}

/**
 * 対戦画面をまるごと描く。
 * ステージとキャラは 3D（WebGL のキャンバス）、エフェクト・飛び道具・HUD はその上の透明な 2D キャンバス（ctx）に描く。
 * 3D のカメラは 2D の camera.apply() と同じ写し方に合わせてあるので、両者の位置はぴったり重なる。
 */
export function renderBattle(ctx: CanvasRenderingContext2D, m: Match, view: BattleView, w: number, h: number, dpr: number, time: number): void {
  const cam = m.camera;
  cam.resize(w, h);
  const world = getWorld();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (world) world.render(m, time);
  else drawFallback(ctx, m, w, h, dpr);

  cam.apply(ctx, dpr);
  drawParticles(ctx, m, false);
  for (const p of m.projectiles) if (p.def.follow) drawProjectile(ctx, p, time);
  const zoom = cam.view().zoom;
  const star = m.cinematic?.f ?? null;
  for (const f of m.fighters) {
    // 奥義の演出中は発動者以外の表示を控える
    if (star && f !== star) continue;
    const i = m.fighters.indexOf(f);
    drawFighterOverlay(ctx, f, {
      time,
      zoom,
      tag: view.labels[i],
      tagColor: view.cpu[i] ? CPU_COLOR : PORT_COLORS[f.port % 4],
    });
  }
  for (const p of m.projectiles) if (!p.def.follow) drawProjectile(ctx, p, time);
  drawParticles(ctx, m, true);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const players: HudPlayer[] = m.fighters.map((f, i) => ({
    f,
    color: view.cpu[i] ? CPU_COLOR : PORT_COLORS[f.port % 4],
    label: view.labels[i],
  }));
  if (view.hud !== false) drawHud(ctx, m, players, w, h, time);
}

/** WebGL が使えない環境向けの最低限の表示 */
function drawFallback(ctx: CanvasRenderingContext2D, m: Match, w: number, h: number, dpr: number): void {
  ctx.fillStyle = '#1a1830';
  ctx.fillRect(0, 0, w, h);
  m.camera.apply(ctx, dpr);
  const st = m.stage;
  ctx.fillStyle = '#4a4466';
  ctx.fillRect(st.main.x1, st.main.y, st.main.x2 - st.main.x1, 400);
  ctx.fillStyle = '#8a82b0';
  for (const p of st.platforms) {
    const ps = platformAt(p, m.frame);
    ctx.fillRect(ps.x1, ps.y, ps.x2 - ps.x1, 12);
  }
  for (const f of m.fighters) {
    if (!f.alive) continue;
    ctx.fillStyle = f.spec.look.color;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y - f.stats.height / 2, f.w / 2, f.stats.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
