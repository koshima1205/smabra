import { audio } from '../../core/audio';
import { CPU_COLOR, PORT_COLORS } from '../../render/fighterRenderer';
import { renderBattle } from '../../render/battleRenderer';
import { sfx, type App, type Scene } from '../app';
import { h } from '../dom';
import { portraitEl } from '../portraitEl';
import type { BattleScene } from './battle';
import { BattleScene as Battle } from './battle';
import { SelectScene } from './select';

export class ResultsScene implements Scene {
  private btns: HTMLButtonElement[] = [];
  private focus = 0;
  private t = 0;

  constructor(
    private app: App,
    private battle: BattleScene,
  ) {}

  enter(): void {
    audio.bgm('results');
    const m = this.battle.match;
    const ranking = m.ranking();
    const win = ranking[0];
    const wi = m.fighters.indexOf(win);
    const color = this.battle.view.cpu[wi] ? CPU_COLOR : PORT_COLORS[win.port % 4];
    this.btns = [
      h('button', { class: 'btn primary', onclick: () => this.rematch() }, 'もう一戦'),
      h('button', { class: 'btn', onclick: () => this.toSelect() }, 'キャラ選択へ'),
    ];
    this.app.ui.append(
      h(
        'div',
        { class: 'screen results' },
        h(
          'div',
          { class: 'winner' },
          h('div', { class: 'big', style: `border-color:${color}` }, portraitEl(win.spec, 280)),
          h(
            'div',
            { class: 'wtxt' },
            h('div', { class: 'lbl' }, 'WINNER'),
            h('div', { class: 'wn' }, win.spec.name),
            h('div', { class: 'we' }, `${this.battle.view.labels[wi]} ・ ${win.spec.nameEn} ・ ${win.spec.clan}`),
            h('div', { class: 'we', style: 'margin-top:6px;font-weight:700' }, win.spec.blurb),
          ),
        ),
        h(
          'div',
          { class: 'ranking' },
          ...ranking.map((f, r) => {
            const i = m.fighters.indexOf(f);
            const c = this.battle.view.cpu[i] ? CPU_COLOR : PORT_COLORS[f.port % 4];
            return h(
              'div',
              { class: 'rank', style: `border-color:${c}` },
              h('span', { class: 'n', style: `color:${c}` }, `${r + 1}`),
              h('b', {}, f.spec.name),
              h('div', { class: 's' }, `撃墜 ${f.kos} ・ 落下 ${f.falls} ・ 与ダメ ${Math.round(f.dealt)}%`),
            );
          }),
        ),
        h('div', { class: 'row' }, ...this.btns),
      ),
    );
    this.refresh();
  }

  exit(): void {}

  private refresh(): void {
    this.btns.forEach((b, i) => b.classList.toggle('focus', i === this.focus));
  }

  private rematch(): void {
    sfx('uiSelect');
    this.app.go(new Battle(this.app));
  }

  private toSelect(): void {
    sfx('uiBack');
    this.app.go(new SelectScene(this.app));
  }

  update(): void {
    this.t++;
    if (this.t < 30) return;
    const m = this.app.menuAny();
    if (m.left || m.right || m.up || m.down) {
      this.focus = 1 - this.focus;
      this.refresh();
      sfx('uiMove');
    }
    if (m.confirm || m.start) this.btns[this.focus]?.click();
    else if (m.back) this.toSelect();
  }

  render(ctx: CanvasRenderingContext2D, w: number, hh: number, dpr: number, time: number): void {
    const b = this.battle;
    renderBattle(ctx, b.match, { ...b.view, hud: false }, w, hh, dpr, time);
  }
}
