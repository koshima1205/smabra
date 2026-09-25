import type { Match } from '../game/match';
import { drawFighter, PORT_COLORS, CPU_COLOR } from './fighterRenderer';
import { drawParticles, drawProjectile } from './fx';
import { drawHud, type HudPlayer } from './hud';
import { drawStageBackground, drawStageForeground, drawStageGeometry } from './stageArt';

export interface BattleView {
  labels: string[];
  cpu: boolean[];
  /** HUD（ダメージ表示など）を描くか */
  hud?: boolean;
}

/** 対戦画面をまるごと描く */
export function renderBattle(ctx: CanvasRenderingContext2D, m: Match, view: BattleView, w: number, h: number, dpr: number, time: number): void {
  const cam = m.camera;
  cam.resize(w, h);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawStageBackground(ctx, m.stage, cam, w, h, m.frame);

  cam.apply(ctx, dpr);
  drawStageGeometry(ctx, m.stage, m.frame);
  drawParticles(ctx, m, false);
  for (const p of m.projectiles) if (p.def.follow) drawProjectile(ctx, p, time);
  const zoom = cam.view().zoom;
  const star = m.cinematic?.f ?? null;
  const draw = (f: (typeof m.fighters)[number]) => {
    const i = m.fighters.indexOf(f);
    drawFighter(ctx, f, {
      time,
      zoom,
      tag: view.labels[i],
      tagColor: view.cpu[i] ? CPU_COLOR : PORT_COLORS[f.port % 4],
    });
  };
  // 攻撃中のファイターを手前に
  const order = [...m.fighters].sort((a, b) => Number(a.state === 'attack') - Number(b.state === 'attack'));
  for (const f of order) if (f !== star) draw(f);
  if (star && m.cinematic) {
    // 奥義: 周りを暗くして発動者だけを照らす
    const c = m.cinematic;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = Math.min(0.72, (c.max - c.t) / 12);
    ctx.fillStyle = '#05030c';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    cam.apply(ctx, dpr);
    draw(star);
  }
  for (const p of m.projectiles) if (!p.def.follow) drawProjectile(ctx, p, time);
  drawParticles(ctx, m, true);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawStageForeground(ctx, m.stage, cam, w, h, m.frame);
  const players: HudPlayer[] = m.fighters.map((f, i) => ({
    f,
    color: view.cpu[i] ? CPU_COLOR : PORT_COLORS[f.port % 4],
    label: view.labels[i],
  }));
  if (view.hud !== false) drawHud(ctx, m, players, w, h, time);
}
