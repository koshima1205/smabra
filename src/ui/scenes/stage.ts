import { audio } from '../../core/audio';
import { STAGES } from '../../game/stage';
import { drawStagePreview } from '../../render/stageArt';
import { sfx, type App, type Scene } from '../app';
import { h } from '../dom';
import { BattleScene } from './battle';
import { SelectScene } from './select';

export class StageScene implements Scene {
  private cards: HTMLElement[] = [];
  private focus = 0;

  constructor(private app: App) {
    this.focus = Math.max(0, STAGES.findIndex((s) => s.id === app.lastStage));
  }

  enter(): void {
    audio.bgm('select');
    const list = [...STAGES.map((s) => ({ id: s.id, name: s.name, sub: s.sub })), { id: 'random', name: 'おまかせ', sub: 'ランダムにステージを選ぶ' }];
    this.cards = list.map((s, i) => {
      const cv = h('canvas', { width: 480, height: 270 });
      const ctx = cv.getContext('2d');
      if (ctx) {
        if (s.id === 'random') {
          ctx.fillStyle = '#221a3d';
          ctx.fillRect(0, 0, 480, 270);
          ctx.fillStyle = '#fff';
          ctx.font = '900 120px "Dela Gothic One", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('？', 240, 140);
        } else drawStagePreview(ctx, STAGES[i], 480, 270);
      }
      return h(
        'div',
        {
          class: 'stage-card',
          onclick: () => {
            this.focus = i;
            this.pick();
          },
          onmouseenter: () => {
            this.focus = i;
            this.refresh();
          },
        },
        cv,
        h('div', { class: 'txt' }, h('b', {}, s.name), h('div', {}, s.sub)),
      );
    });
    this.app.ui.append(
      h(
        'div',
        { class: 'screen select' },
        h('div', { class: 'topbar' }, h('button', { class: 'btn small', onclick: () => this.back() }, '◀ キャラ選択'), h('h1', {}, 'ステージ選択')),
        h('div', { class: 'stages' }, ...this.cards),
        h('div', { class: 'hint' }, '左右で選択・決定で開戦'),
      ),
    );
    this.refresh();
  }

  exit(): void {}

  private refresh(): void {
    this.cards.forEach((c, i) => c.classList.toggle('focus', i === this.focus));
  }

  private back(): void {
    sfx('uiBack');
    this.app.go(new SelectScene(this.app));
  }

  private pick(): void {
    audio.unlock();
    const id = this.focus >= STAGES.length ? STAGES[Math.floor(Math.random() * STAGES.length)].id : STAGES[this.focus].id;
    this.app.rules.stageId = id;
    this.app.lastStage = id;
    this.app.save();
    sfx('uiSelect');
    this.app.go(new BattleScene(this.app));
  }

  update(): void {
    const m = this.app.menuAny();
    const n = this.cards.length;
    if (m.left || m.up) this.focus = (this.focus - 1 + n) % n;
    if (m.right || m.down) this.focus = (this.focus + 1) % n;
    if (m.left || m.right || m.up || m.down) {
      this.refresh();
      sfx('uiMove');
    }
    if (m.confirm || m.start) this.pick();
    else if (m.back) this.back();
  }

  render(ctx: CanvasRenderingContext2D, w: number, hh: number, dpr: number): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, hh);
    g.addColorStop(0, '#1b1438');
    g.addColorStop(1, '#0d0b1a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hh);
  }
}
