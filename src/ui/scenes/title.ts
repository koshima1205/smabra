import { audio } from '../../core/audio';
import { Controller, emptyPad } from '../../core/input';
import { Rng } from '../../core/math';
import { CpuBrain } from '../../game/ai';
import { Fighter } from '../../game/fighter';
import { Match } from '../../game/match';
import { FIGHTERS, ROSTER_META } from '../../game/roster';
import { STAGES } from '../../game/stage';
import { renderBattle } from '../../render/battleRenderer';
import { pumpThumbs, queueThumbs } from '../../render3d/snapshots';
import { sfx, type App, type Scene } from '../app';
import { h } from '../dom';
import { KEY_LAYOUTS } from '../../core/input';
import { SelectScene } from './select';

/** モーダルの見出しつきの区切り */
function section(title: string, ...body: (Node | string | null)[]): HTMLElement {
  return h('section', { class: 'sheet' }, h('h3', {}, title), ...body);
}

/** 見出し行つきの表（各行の1列目は行の見出し）。狭い画面では横にスクロール */
function table(head: string[], rows: (Node | string)[][]): HTMLElement {
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'sheet-table' },
      h('thead', {}, h('tr', {}, ...head.map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c, i) => (i === 0 ? h('th', { scope: 'row' }, c) : h('td', {}, c)))))),
    ),
  );
}

/** 用語と説明の並び */
function terms(items: [string, string][]): HTMLElement {
  return h('dl', { class: 'terms' }, ...items.flatMap(([t, d]) => [h('dt', {}, t), h('dd', {}, d)]));
}

const KEY_NAMES: Record<string, string> = {
  Space: 'スペース',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowLeft: '←',
  ArrowDown: '↓',
  ArrowRight: '→',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
};

/** キーのコード（KeyW・ArrowUp など）をキートップの形で並べる */
function keys(...codes: string[]): HTMLElement {
  return h('span', { class: 'keycaps' }, ...codes.map((c) => h('kbd', {}, KEY_NAMES[c] ?? c.replace(/^Key|^Digit/, ''))));
}

function link(href: string, text: string): HTMLElement {
  return h('a', { href, target: '_blank', rel: 'noopener' }, text);
}

/** 背景で CPU 同士が戦うデモ */
export function demoMatch(seed: number): Match {
  const rng = new Rng(seed);
  const stage = STAGES[rng.int(0, STAGES.length - 1)];
  const n = rng.int(2, 4);
  const fighters: Fighter[] = [];
  const brains: CpuBrain[] = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    let k = rng.int(0, FIGHTERS.length - 1);
    while (used.has(k)) k = (k + 1) % FIGHTERS.length;
    used.add(k);
    const b = new CpuBrain(rng.int(5, 9), seed + i);
    const f = new Fighter(FIGHTERS[k], i, i, new Controller(() => b.pad, { id: 'cpu', label: 'CPU', digital: false, flickSmash: false, tapJump: false }), true);
    fighters.push(f);
    brains.push(b);
  }
  const m = new Match(stage, { stocks: 99, time: 0, stageId: stage.id }, fighters, {});
  fighters.forEach((f, i) => m.brains.set(f, brains[i]));
  m.introT = 1;
  return m;
}

export class TitleScene implements Scene {
  private demo: Match;
  private focus = 0;
  private buttons: HTMLButtonElement[] = [];
  private modal: HTMLElement | null = null;
  /** あそびかたの操作タブを左右で切り替える（ほかのモーダルでは null） */
  private switchTab: ((d: number) => void) | null = null;

  constructor(private app: App) {
    this.demo = demoMatch(Date.now() & 0xffff);
  }

  enter(): void {
    audio.bgm('title');
    // キャラ選択・HUD で使うアイコンを先に作っておく
    queueThumbs(
      FIGHTERS.map((f) => f.id),
      [
        { size: 180, mode: 'bust' },
        { size: 240, mode: 'bust' },
        { size: 128, mode: 'face' },
      ],
    );
    const items: [string, () => void][] = [
      ['たいせん', () => this.start()],
      ['あそびかた', () => this.openHelp()],
      ['クレジット', () => this.openCredits()],
    ];
    this.buttons = items.map(([label, fn], i) =>
      h('button', {
        onclick: () => {
          audio.unlock();
          this.focus = i;
          fn();
        },
      }, label),
    );
    const root = h(
      'div',
      { class: 'screen title' },
      h('h1', { class: 'logo' }, '月下乱舞'),
      // 公式作品と誤認されないよう、ロゴのすぐ下で非公式と示す（CNP 二次創作ガイドライン「誤認防止」）
      h('div', { class: 'logo-sub' }, '非公式ファンゲーム'),
      h('div', { class: 'press-start blink' }, 'PRESS START'),
      h('div', { class: 'menu' }, ...this.buttons),
    );
    this.app.ui.append(root);
    this.updateFocus();
  }

  exit(): void {
    this.modal = null;
  }

  private updateFocus(): void {
    this.buttons.forEach((b, i) => b.classList.toggle('focus', i === this.focus));
  }

  private start(): void {
    sfx('uiSelect');
    this.app.go(new SelectScene(this.app));
  }

  private closeModal(): void {
    this.modal?.remove();
    this.modal = null;
    this.switchTab = null;
    sfx('uiBack');
  }

  /** 見出し・右上の × ・下の「とじる」つきのモーダルを開く */
  private showModal(title: string, ...body: (Node | string | null)[]): void {
    sfx('uiSelect');
    const panel = h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'modal-close', 'aria-label': 'とじる', onclick: () => this.closeModal() }, '×')),
      ...body,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => this.closeModal() }, 'とじる')),
    );
    this.modal = h('div', { class: 'modal-back', onclick: (e) => e.target === this.modal && this.closeModal() }, panel);
    this.app.ui.append(this.modal);
  }

  private openHelp(): void {
    const k1 = KEY_LAYOUTS.kb1.buttons;
    const k2 = KEY_LAYOUTS.kb2.buttons;
    // キーは代表の1つだけ見せる（F・G などの予備のキーは README に）
    const keyboard = table(
      ['操作', '1P', '2P'],
      [
        ['移動', keys('KeyW', 'KeyA', 'KeyS', 'KeyD'), keys('ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight')],
        ['ジャンプ', keys(k1.jump[0]), keys(k2.jump[0])],
        ['攻撃', keys(k1.attack[0]), keys(k2.attack[0])],
        ['スマッシュ攻撃', keys(k1.smash[0]), keys(k2.smash[0])],
        ['必殺ワザ', keys(k1.special[0]), keys(k2.special[0])],
        ['ガード・回避', keys(k1.shield[0]), keys(k2.shield[0])],
        ['つかみ', keys(k1.grab[0]), keys(k2.grab[0])],
        ['ポーズ', keys(k1.start[0]), '—'],
      ],
    );
    const pad = table(
      ['操作', 'ボタン'],
      [
        ['移動', '左スティック・十字キー'],
        ['ジャンプ', 'X・Y（スティックを上にはじいても）'],
        ['攻撃', 'A'],
        ['スマッシュ攻撃', '右スティック（スティックをはじいて A でも）'],
        ['必殺ワザ', 'B'],
        ['ガード・回避', 'R・ZL・ZR'],
        ['つかみ', 'L'],
        ['ポーズ', 'START'],
      ],
    );
    const touch = table(
      ['操作', 'やりかた'],
      [
        ['移動', '左下のスティック'],
        ['ジャンプ', '「ジャンプ」（スティックを上にはじいても）'],
        ['攻撃・必殺ワザ', '右下の「攻撃」「必殺」'],
        ['ガード・つかみ', '右下の「ガード」「つかみ」'],
        ['スマッシュ攻撃', 'スティックをはじくと同時に「攻撃」'],
        ['ポーズ', '右上の「Ⅱ」'],
      ],
    );
    const tabs: [string, HTMLElement][] = [
      ['キーボード', h('div', {}, keyboard, h('p', { class: 'note' }, '2P は、キャラクター選択の画面で 2P のキー（「,」など）を押すと参加できます。'))],
      ['ゲームパッド', h('div', {}, pad, h('p', { class: 'note' }, 'パッドをつないで、キャラクター選択の画面でボタンを押すと参加できます。'))],
      ['スマホ・タブレット', h('div', {}, touch, h('p', { class: 'note' }, '横向きにすると遊びやすくなります。'))],
    ];
    const pane = h('div', { class: 'tab-pane' });
    const tabButtons = tabs.map(([label], i) =>
      h('button', { role: 'tab', onclick: () => { show(i); sfx('uiMove'); } }, label),
    );
    let cur = 0;
    const show = (i: number) => {
      cur = (i + tabs.length) % tabs.length;
      tabButtons.forEach((b, j) => {
        b.classList.toggle('on', j === cur);
        b.setAttribute('aria-selected', String(j === cur));
      });
      pane.replaceChildren(tabs[cur][1]);
    };
    show(this.app.touchCapable ? 2 : 0);
    this.showModal(
      'あそびかた',
      section(
        'ルール',
        terms([
          ['勝ち方', '相手を画面の外までふっとばすと撃墜。ダメージ（％）がたまるほど、遠くまでふっとびやすくなります。'],
          ['ストック', '残りの命の数。撃墜されるたびに1つ減り、0になったら負け。最後まで残った人の勝ちです。'],
          ['時間', '時間を決めた試合は、時間切れで終わり。「撃墜した数 − 撃墜された数」が多い人の勝ちです。'],
        ]),
      ),
      section('操作', h('div', { class: 'tabs', role: 'tablist' }, ...tabButtons), pane),
      section(
        'テクニック',
        terms([
          ['スマッシュ攻撃', 'ボタンを長押しすると力をためて、もっと遠くへふっとばせます。'],
          ['奥義', 'ゲージがたまって「奥義 OK」と出たら、方向を入れずに必殺ワザ。'],
          ['回避', 'ガード中に左右で回避、下でその場回避。空中でガードすると空中回避。'],
          ['つかみ・投げ', 'つかんだら方向で投げ、攻撃でつかんだまま攻撃。'],
          ['崖からの復帰', '落ちたら空中ジャンプと「上＋必殺ワザ」で戻ります。崖につかまった直後は、少しのあいだ無敵。'],
          ['ずらし・受け身', 'ふっとばされている間に方向を入れると、飛ぶ向きを少し変えられます。着地の瞬間にガードで受け身。'],
        ]),
      ),
    );
    this.switchTab = (d) => {
      show(cur + d);
      sfx('uiMove');
    };
  }

  private openCredits(): void {
    const meta = ROSTER_META;
    const cnp = FIGHTERS.filter((f) => f.series === 'cnp');
    const kitan = FIGHTERS.filter((f) => f.series === 'kitan');
    this.showModal(
      'クレジット',
      h('p', { class: 'lead' }, '「月下乱舞」は、CNP と月蝕綺譚のキャラクターが戦う、非公式・非営利のファンゲームです。CNP・CryptoNinja・月蝕綺譚の公式とは関係ありません。'),
      section(
        `CNP のキャラクター（${cnp.length}体）`,
        h('p', {}, 'CNP のキャラは、CryptoNinja の忍者の相棒（パートナー）です。ワザは、相棒の忍者の忍術と武器をもとに作りました。忍者の設定は、プログラムから CryptoNinja の設定を読める「NINJAMCP」から読み込んでいます。'),
        table(
          ['キャラ', '相棒の忍者', 'ワザのもと'],
          cnp.map((f) => [
            h('span', {}, f.name, h('small', {}, f.species)),
            f.partner ? h('span', {}, f.partner.name, h('small', {}, f.partner.clan)) : '—',
            [f.partner?.ninjutsu, f.partner?.weapon].filter(Boolean).join('・') || '—',
          ]),
        ),
      ),
      section(
        `月蝕綺譚のキャラクター（${kitan.length}体）`,
        h('p', {}, 'CryptoNinja 外伝「月蝕綺譚 -Luna Occulta-」（Studio VIBE）の御霊たちです。3D モデルは、公式が二次創作のために配っているものを使っています。'),
        h(
          'ul',
          { class: 'chips' },
          // 里・五行の無い御霊（道しるべの栞）は名前だけ
          ...kitan.map((f) => h('li', {}, f.name, f.clan || f.element ? h('small', {}, [f.clan, f.element].filter(Boolean).join('・')) : null)),
        ),
      ),
      section(
        '権利について',
        h(
          'ul',
          {},
          h('li', {}, 'キャラクターの権利は、それぞれの権利者にあります（CNP: © CryptoNinja Partners ／ CryptoNinja: © Ninja DAO）。'),
          h('li', {}, 'CNP の 3D モデルは、素材屋CNP のイラストを AI に見せて、このゲームのために作ったものです（イラストそのものは使っていません）。デザインの権利は、元のイラストの作者と CNP にあります。'),
          h('li', {}, '月蝕綺譚の 3D モデルは公式の配布モデルです。モデルだけを取り出して配ることはできません。', h('span', { class: 'nowrap' }, '#月蝕綺譚')),
        ),
        h(
          'div',
          { class: 'links' },
          h('span', {}, '二次創作のルール'),
          link('https://www.cryptoninja-partners.xyz/fanart-guideline.html', 'CNP'),
          link('https://www.ninja-dao.com/guidelines', 'CryptoNinja'),
          link('https://sozaiya.cryptoninja-partners.xyz/guidelines', '素材屋CNP（AI）'),
          link('https://vibe.co.jp/luna-occulta/fanworks', '月蝕綺譚'),
        ),
      ),
      section(
        '使わせてもらったもの',
        h(
          'ul',
          {},
          h('li', {}, 'キャラクターの設定：', link(meta.credit.url, meta.credit.title), `（${meta.credit.author}）、CNP 公式サイト`),
          h('li', {}, 'NINJAMCP（MIT License）・three.js（MIT License）'),
          h('li', {}, 'プログラム・ステージ・効果音・BGM は、このゲームのために作ったものです。'),
        ),
      ),
    );
  }

  update(): void {
    this.demo.step();
    if (this.app.tick > 20) pumpThumbs();
    const m = this.app.menuAny();
    if (this.modal) {
      // キーやパッドでも読めるように: 左右でタブ、上下でスクロール
      if (m.left || m.right) this.switchTab?.(m.right ? 1 : -1);
      if (m.up || m.down) {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.modal.querySelector('.modal')?.scrollBy({ top: m.down ? 120 : -120, behavior: smooth ? 'smooth' : 'auto' });
      }
      if (m.back || m.confirm || m.start) this.closeModal();
      return;
    }
    if (m.up || m.down) {
      this.focus = (this.focus + (m.down ? 1 : this.buttons.length - 1)) % this.buttons.length;
      this.updateFocus();
      sfx('uiMove');
    }
    if (m.confirm || m.start) {
      audio.unlock();
      this.buttons[this.focus]?.click();
    }
    // デモが長くなったら入れ替え
    if (this.demo.frame > 60 * 50) this.demo = demoMatch(this.demo.frame + Date.now());
  }

  render(ctx: CanvasRenderingContext2D, w: number, hgt: number, dpr: number, time: number): void {
    renderBattle(ctx, this.demo, { labels: this.demo.fighters.map(() => 'CP'), cpu: this.demo.fighters.map(() => true), hud: false }, w, hgt, dpr, time);
    void emptyPad;
  }
}
