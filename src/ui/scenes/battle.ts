import { audio } from '../../core/audio';
import { Controller } from '../../core/input';
import { CpuBrain } from '../../game/ai';
import { Fighter } from '../../game/fighter';
import { Match } from '../../game/match';
import { FIGHTERS, fighterById } from '../../game/roster';
import { stageById } from '../../game/stage';
import { renderBattle, type BattleView } from '../../render/battleRenderer';
import { matchAudio, sfx, type App, type Scene } from '../app';
import { h } from '../dom';
import { hideTouch, showTouch } from '../touch';
import { ResultsScene } from './results';
import { SelectScene } from './select';
import { TitleScene } from './title';

export class BattleScene implements Scene {
  match: Match;
  view: BattleView;
  private paused = false;
  private pauseEl: HTMLElement | null = null;
  private pauseFocus = 0;
  private pauseBtns: HTMLButtonElement[] = [];
  private humanSlots: number[] = [];
  private slowTick = 0;

  constructor(private app: App) {
    const fighters: Fighter[] = [];
    const brains: [Fighter, CpuBrain][] = [];
    const labels: string[] = [];
    const cpu: boolean[] = [];
    const used = new Set<string>();
    app.slots.forEach((s, i) => {
      if (s.kind === 'off') return;
      let spec = s.fighterId ? fighterById(s.fighterId) : null;
      if (!spec) {
        const pool = FIGHTERS.filter((f) => !used.has(f.id));
        spec = pool[Math.floor(Math.random() * pool.length)] ?? FIGHTERS[0];
      }
      used.add(spec.id);
      if (s.kind === 'cpu') {
        const b = new CpuBrain(s.cpuLevel, i + 1 + Math.floor(Math.random() * 1000));
        const ctrl = new Controller(() => b.pad, { id: 'cpu', label: 'CPU', digital: false, flickSmash: false, tapJump: false });
        const f = new Fighter(spec, i, i, ctrl, true);
        fighters.push(f);
        brains.push([f, b]);
        labels.push(`CP${i + 1}`);
        cpu.push(true);
      } else {
        const f = new Fighter(spec, i, i, app.controllerFor(i), false);
        fighters.push(f);
        labels.push(`${i + 1}P`);
        cpu.push(false);
        this.humanSlots.push(i);
      }
    });
    const stage = stageById(app.rules.stageId);
    this.match = new Match(stage, { ...app.rules }, fighters, matchAudio());
    for (const [f, b] of brains) this.match.brains.set(f, b);
    this.view = { labels, cpu, hud: true };
  }

  enter(): void {
    audio.bgm(this.match.stage.bgm);
    if (this.app.touchCapable) showTouch(this.app.touchEl, () => this.togglePause());
  }

  exit(): void {
    hideTouch(this.app.touchEl);
  }

  private togglePause(): void {
    if (this.match.phase === 'end' || this.match.phase === 'done') return;
    this.paused = !this.paused;
    sfx('pause');
    if (this.paused) {
      const items: [string, () => void][] = [
        ['つづける', () => this.togglePause()],
        ['キャラ選択へ', () => this.app.go(new SelectScene(this.app))],
        ['タイトルへ', () => this.app.go(new TitleScene(this.app))],
      ];
      this.pauseFocus = 0;
      this.pauseBtns = items.map(([label, fn]) => h('button', { onclick: fn }, label));
      this.pauseEl = h('div', { class: 'screen pause' }, h('h2', {}, 'ポーズ'), h('div', { class: 'menu' }, ...this.pauseBtns));
      this.app.ui.append(this.pauseEl);
      this.refreshPause();
    } else {
      this.pauseEl?.remove();
      this.pauseEl = null;
    }
  }

  private refreshPause(): void {
    this.pauseBtns.forEach((b, i) => b.classList.toggle('focus', i === this.pauseFocus));
  }

  update(): void {
    const app = this.app;
    const startPressed = this.humanSlots.some((i) => app.menuFor(i).start) || app.input.keyPressed('Escape');
    if (this.paused) {
      const m = app.menuAny();
      if (m.up || m.down) {
        this.pauseFocus = (this.pauseFocus + (m.down ? 1 : this.pauseBtns.length - 1)) % this.pauseBtns.length;
        this.refreshPause();
        sfx('uiMove');
      }
      if (m.confirm) this.pauseBtns[this.pauseFocus]?.click();
      else if (startPressed || m.back) this.togglePause();
      return;
    }
    if (startPressed && this.match.phase !== 'intro') {
      this.togglePause();
      return;
    }
    const m = this.match;
    if (m.slowmo > 0) {
      m.slowmo--;
      if (++this.slowTick % 3 !== 0) return;
    }
    m.step();
    if (m.phase === 'done') app.go(new ResultsScene(app, this));
  }

  render(ctx: CanvasRenderingContext2D, w: number, hh: number, dpr: number, time: number): void {
    renderBattle(ctx, this.match, this.view, w, hh, dpr, time);
  }
}
