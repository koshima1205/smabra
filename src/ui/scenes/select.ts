import { audio } from '../../core/audio';
import { CLAN_COLOR, FIGHTERS, fighterById } from '../../game/roster';
import type { FighterSpec } from '../../game/types';
import { CPU_COLOR, PORT_COLORS } from '../../render/fighterRenderer';
import { sfx, type App, type Scene } from '../app';
import { h } from '../dom';
import { portraitEl } from '../portraitEl';
import { demoMatch, TitleScene } from './title';
import { StageScene } from './stage';
import { renderBattle } from '../../render/battleRenderer';
import type { Match } from '../../game/match';

const CLANS = ['全部', '伊賀', '甲賀', '風魔', '雑賀', '天界', '根の国'];
const TIMES = [0, 120, 180, 300, 420];
const RANDOM = -1;

export class SelectScene implements Scene {
  private grid!: HTMLElement;
  private cards: HTMLElement[] = [];
  private visible: number[] = [];
  private slotEls: HTMLElement[] = [];
  private readyEl: HTMLElement | null = null;
  private clan = '全部';
  private editing = 0;
  private stocksEl!: HTMLElement;
  private timeEl!: HTMLElement;
  private bg: Match;

  constructor(private app: App) {
    this.bg = demoMatch(1234);
  }

  enter(): void {
    audio.bgm('select');
    const app = this.app;
    for (const s of app.slots) {
      if (s.kind === 'human') s.locked = false;
      if (s.cursor >= FIGHTERS.length) s.cursor = 0;
    }
    this.stocksEl = h('b', {}, String(app.rules.stocks));
    this.timeEl = h('b', {}, this.timeLabel());
    const clanBar = h(
      'div',
      { class: 'clans' },
      ...CLANS.map((c) =>
        h(
          'button',
          {
            class: c === this.clan ? 'on' : '',
            onclick: (e) => {
              this.clan = c;
              clanBar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
              this.buildGrid();
              sfx('uiMove');
            },
            style: c !== '全部' ? `box-shadow: inset 0 -3px 0 ${CLAN_COLOR[c]}` : undefined,
          },
          c,
        ),
      ),
    );
    this.grid = h('div', { class: 'grid' });
    const slots = h('div', { class: 'slots' });
    this.slotEls = app.slots.map((_, i) => {
      const el = h('div', { class: 'slot', onclick: () => this.setEditing(i) });
      slots.append(el);
      return el;
    });
    const root = h(
      'div',
      { class: 'screen select' },
      h(
        'div',
        { class: 'topbar' },
        h('button', { class: 'btn small', onclick: () => this.back() }, '◀ タイトル'),
        h('h1', {}, 'キャラクター選択'),
        clanBar,
        h('div', { class: 'spacer' }),
        h(
          'div',
          { class: 'rules' },
          h('span', { class: 'pill' }, 'ストック', h('button', { onclick: () => this.stocks(-1), 'aria-label': 'ストックを減らす' }, '−'), this.stocksEl, h('button', { onclick: () => this.stocks(1), 'aria-label': 'ストックを増やす' }, '＋')),
          h('span', { class: 'pill' }, '時間', h('button', { onclick: () => this.time(-1), 'aria-label': '時間を減らす' }, '−'), this.timeEl, h('button', { onclick: () => this.time(1), 'aria-label': '時間を増やす' }, '＋')),
        ),
      ),
      h('div', { class: 'grid-wrap' }, this.grid),
      slots,
      h('div', { class: 'hint' }, '決定: J / Space / A ｜ 戻る: K / Esc / B ｜ 開始: Enter / START ｜ 2P はキーボードの , . / キーかパッドのボタンで参加 ｜ スロットをクリックして CPU のキャラも選べます'),
    );
    app.ui.append(root);
    app.onUnclaimed = (id) => this.join(id);
    this.buildGrid();
    this.refreshSlots();
  }

  exit(): void {
    this.app.onUnclaimed = null;
  }

  private timeLabel(): string {
    const t = this.app.rules.time;
    return t === 0 ? '∞' : `${t / 60}分`;
  }

  private stocks(d: number): void {
    const r = this.app.rules;
    r.stocks = Math.max(1, Math.min(5, r.stocks + d));
    this.stocksEl.textContent = String(r.stocks);
    sfx('uiMove');
  }

  private time(d: number): void {
    const r = this.app.rules;
    const i = Math.max(0, Math.min(TIMES.length - 1, TIMES.indexOf(r.time) + d));
    r.time = TIMES[i];
    this.timeEl.textContent = this.timeLabel();
    sfx('uiMove');
  }

  private back(): void {
    sfx('uiBack');
    this.app.go(new TitleScene(this.app));
  }

  private join(id: string): void {
    const slots = this.app.slots;
    const idx = slots.findIndex((s, i) => i > 0 && s.kind !== 'human');
    if (idx < 0) return;
    const s = slots[idx];
    s.kind = 'human';
    s.devices = new Set([id]);
    s.locked = false;
    s.cursor = Math.min(idx, FIGHTERS.length - 1);
    sfx('join');
    this.refreshSlots();
  }

  private setEditing(i: number): void {
    this.editing = i;
    this.refreshSlots();
  }

  private buildGrid(): void {
    this.grid.replaceChildren();
    this.cards = [];
    this.visible = [];
    FIGHTERS.forEach((spec, idx) => {
      if (this.clan !== '全部' && spec.clan !== this.clan) return;
      const card = h(
        'div',
        {
          class: 'card',
          title: `${spec.name}（${spec.nameEn}）`,
          onclick: () => this.pick(idx),
          onmouseenter: () => this.hover(idx),
        },
        portraitEl(spec, 120),
        h('span', { class: 'clan-dot', style: `background:${CLAN_COLOR[spec.clan] ?? '#888'}` }),
        h('div', { class: 'nm' }, spec.name),
        h('div', { class: 'cursors' }),
      );
      this.grid.append(card);
      this.cards.push(card);
      this.visible.push(idx);
    });
    const rnd = h('div', { class: 'card random', title: 'おまかせ', onclick: () => this.pick(RANDOM) }, '？', h('div', { class: 'nm' }, 'おまかせ'), h('div', { class: 'cursors' }));
    this.grid.append(rnd);
    this.cards.push(rnd);
    this.visible.push(RANDOM);
    this.refreshCursors();
  }

  private columns(): number {
    const cols = getComputedStyle(this.grid).gridTemplateColumns.split(' ').filter(Boolean).length;
    return Math.max(1, cols);
  }

  /** マウスで選ぶ: 編集中のスロットに割り当てる */
  private pick(idx: number): void {
    audio.unlock();
    const s = this.app.slots[this.editing];
    if (s.kind === 'off') s.kind = 'cpu';
    s.fighterId = idx === RANDOM ? null : FIGHTERS[idx].id;
    s.cursor = Math.max(0, this.visible.indexOf(idx));
    if (s.kind === 'human') s.locked = true;
    sfx('uiSelect');
    this.refreshSlots();
    this.refreshCursors();
    // 1P が決めたら次は CPU の編集へ
    if (this.editing === 0) {
      const next = this.app.slots.findIndex((x, i) => i > 0 && x.kind === 'cpu' && x.fighterId === null);
      if (next > 0 && this.app.touchCapable) this.editing = next;
    }
  }

  private hover(idx: number): void {
    const s = this.app.slots[0];
    if (this.editing === 0 && s.kind === 'human' && !s.locked) {
      s.cursor = Math.max(0, this.visible.indexOf(idx));
      this.refreshCursors();
      this.refreshSlot(0);
    }
  }

  private cursorSpec(i: number): FighterSpec | null {
    const s = this.app.slots[i];
    if (s.kind === 'human' && !s.locked) {
      const idx = this.visible[Math.min(s.cursor, this.visible.length - 1)];
      return idx === RANDOM || idx === undefined ? null : FIGHTERS[idx];
    }
    return s.fighterId ? fighterById(s.fighterId) : null;
  }

  private refreshCursors(): void {
    this.cards.forEach((c) => c.querySelector('.cursors')?.replaceChildren());
    this.app.slots.forEach((s, i) => {
      if (s.kind !== 'human' || s.locked) return;
      const c = this.cards[Math.min(s.cursor, this.cards.length - 1)];
      c?.querySelector('.cursors')?.append(h('span', { class: 'cur', style: `background:${PORT_COLORS[i]}` }, `${i + 1}P`));
      if (i === 0) c?.scrollIntoView({ block: 'nearest' });
    });
    this.cards.forEach((c, k) => {
      const idx = this.visible[k];
      const taken = this.app.slots.find((s) => s.kind !== 'off' && s.locked && s.fighterId && idx !== RANDOM && FIGHTERS[idx]?.id === s.fighterId);
      c.style.borderColor = taken ? '#f2c14e' : '';
    });
  }

  private refreshSlots(): void {
    this.app.slots.forEach((_, i) => this.refreshSlot(i));
    this.refreshReady();
  }

  private refreshSlot(i: number): void {
    const app = this.app;
    const s = app.slots[i];
    const el = this.slotEls[i];
    const color = s.kind === 'cpu' ? CPU_COLOR : PORT_COLORS[i];
    el.className = `slot${s.kind === 'off' ? ' off' : ''}${this.editing === i ? ' editing' : ''}`;
    el.style.borderColor = s.kind === 'off' ? '' : color;
    const kinds: [string, 'human' | 'cpu' | 'off'][] = [
      ['人', 'human'],
      ['CPU', 'cpu'],
      ['なし', 'off'],
    ];
    const kindBtns = h(
      'div',
      { class: 'kind' },
      ...kinds
        .filter(([, k]) => !(i === 0 && k === 'off'))
        .map(([label, k]) =>
          h(
            'button',
            {
              class: s.kind === k ? 'on' : '',
              onclick: (e: Event) => {
                e.stopPropagation();
                s.kind = k;
                if (k === 'human') {
                  s.locked = false;
                  if (i === 0) s.devices = new Set(['kb1', 'touch', ...[...s.devices].filter((d) => d.startsWith('pad'))]);
                  else if (s.devices.size === 0) s.devices = new Set(['kb2']);
                } else {
                  s.locked = true;
                  if (i !== 0) s.devices = new Set();
                }
                sfx('uiMove');
                this.refreshSlots();
                this.refreshCursors();
              },
            },
            label,
          ),
        ),
    );
    const head = h('div', { class: 'head' }, h('span', { class: 'port', style: `background:${color}` }, s.kind === 'cpu' ? `CP${i + 1}` : `${i + 1}P`), kindBtns);
    if (s.kind === 'off') {
      el.replaceChildren(h('div', { class: 'info' }, head, h('div', { class: 'empty' }, 'クリックかボタンで参加')));
      return;
    }
    const spec = this.cursorSpec(i);
    const por = h('div', { class: 'por' });
    if (spec) por.append(portraitEl(spec, 160));
    else por.append(h('div', { class: 'card random', style: 'position:absolute;inset:0;border:none' }, '？'));
    const info = h('div', { class: 'info' }, head);
    if (spec) {
      info.append(
        h('div', { class: 'cname' }, spec.name, h('small', {}, spec.nameEn)),
        h('div', { class: 'meta' }, h('span', { style: `color:${CLAN_COLOR[spec.clan]}` }, '●'), ` ${spec.blurb}`),
        h('div', { class: 'tags' }, ...spec.tags.map((t) => h('span', { class: 'tag' }, t))),
        h(
          'div',
          { class: 'bars' },
          ...(
            [
              ['パワー', spec.ratings.power],
              ['スピード', spec.ratings.speed],
              ['重さ', spec.ratings.weight],
              ['リーチ', spec.ratings.range],
              ['復帰力', spec.ratings.recovery],
            ] as [string, number][]
          ).flatMap(([l, v]) => [h('span', {}, l), h('div', { class: 'bar' }, h('i', { style: `width:${v * 20}%` }))]),
        ),
        h(
          'div',
          { class: 'specials' },
          h('b', {}, 'B '),
          spec.moves.nspec.name,
          ' / ',
          h('b', {}, '横B '),
          spec.moves.sspec.name,
          h('br'),
          h('b', {}, '上B '),
          spec.moves.uspec.name,
          ' / ',
          h('b', {}, '下B '),
          spec.moves.dspec.name,
        ),
      );
    } else {
      info.append(h('div', { class: 'cname' }, 'おまかせ'), h('div', { class: 'meta' }, '開始時にランダムで決まります'));
    }
    if (s.kind === 'cpu') {
      info.append(
        h(
          'div',
          { class: 'lv' },
          'つよさ',
          h('button', { onclick: (e: Event) => (e.stopPropagation(), this.level(i, -1)), 'aria-label': 'CPUを弱く' }, '−'),
          `Lv${s.cpuLevel}`,
          h('button', { onclick: (e: Event) => (e.stopPropagation(), this.level(i, 1)), 'aria-label': 'CPUを強く' }, '＋'),
        ),
      );
    }
    el.replaceChildren(por, info);
    if (s.kind === 'human' && s.locked) el.append(h('span', { class: 'locked' }, 'OK!'));
  }

  private level(i: number, d: number): void {
    const s = this.app.slots[i];
    s.cpuLevel = Math.max(1, Math.min(9, s.cpuLevel + d));
    sfx('uiMove');
    this.refreshSlot(i);
  }

  private isReady(): boolean {
    const active = this.app.slots.filter((s) => s.kind !== 'off');
    return active.length >= 2 && active.every((s) => s.kind === 'cpu' || s.locked);
  }

  private refreshReady(): void {
    const ready = this.isReady();
    if (ready && !this.readyEl) {
      this.readyEl = h('div', { class: 'ready', onclick: () => this.proceed() }, 'READY TO FIGHT', h('small', {}, 'クリック / Enter / START でステージ選択へ'));
      this.app.ui.firstElementChild?.append(this.readyEl);
    } else if (!ready && this.readyEl) {
      this.readyEl.remove();
      this.readyEl = null;
    }
  }

  private proceed(): void {
    if (!this.isReady()) return;
    sfx('uiSelect');
    this.app.go(new StageScene(this.app));
  }

  update(): void {
    this.bg.step();
    const app = this.app;
    let changed = false;
    app.slots.forEach((s, i) => {
      if (s.kind !== 'human') return;
      const m = app.menuFor(i);
      if (m.start && this.isReady()) {
        this.proceed();
        return;
      }
      if (s.locked) {
        if (m.back) {
          s.locked = false;
          sfx('uiBack');
          changed = true;
        }
        return;
      }
      const n = this.cards.length;
      const cols = this.columns();
      let c = Math.min(s.cursor, n - 1);
      if (m.left) c = (c - 1 + n) % n;
      if (m.right) c = (c + 1) % n;
      if (m.up) c = c - cols >= 0 ? c - cols : c;
      if (m.down) c = c + cols < n ? c + cols : n - 1;
      if (c !== s.cursor) {
        s.cursor = c;
        sfx('uiMove');
        changed = true;
      }
      if (m.confirm) {
        const idx = this.visible[c];
        s.fighterId = idx === RANDOM ? null : FIGHTERS[idx].id;
        s.locked = true;
        audio.unlock();
        sfx('uiSelect');
        changed = true;
      } else if (m.back) {
        if (i === 0) this.back();
        else {
          s.kind = 'off';
          s.devices = new Set();
          sfx('uiBack');
          changed = true;
        }
      }
    });
    if (this.app.scene !== this) return;
    if (changed) {
      this.refreshSlots();
      this.refreshCursors();
    }
  }

  render(ctx: CanvasRenderingContext2D, w: number, hh: number, dpr: number, time: number): void {
    renderBattle(ctx, this.bg, { labels: this.bg.fighters.map(() => ''), cpu: this.bg.fighters.map(() => true), hud: false }, w, hh, dpr, time);
  }
}
