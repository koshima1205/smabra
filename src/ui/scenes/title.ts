import { audio } from '../../core/audio';
import { Controller, emptyPad } from '../../core/input';
import { Rng } from '../../core/math';
import { CpuBrain } from '../../game/ai';
import { Fighter } from '../../game/fighter';
import { Match } from '../../game/match';
import { FIGHTERS, ROSTER_META } from '../../game/roster';
import { STAGES } from '../../game/stage';
import { renderBattle } from '../../render/battleRenderer';
import { sfx, type App, type Scene } from '../app';
import { h } from '../dom';
import { KEY_LAYOUTS } from '../../core/input';
import { SelectScene } from './select';

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

  constructor(private app: App) {
    this.demo = demoMatch(Date.now() & 0xffff);
  }

  enter(): void {
    audio.bgm('title');
    const items: [string, () => void][] = [
      ['たいせん', () => this.start()],
      ['あそびかた', () => this.openHelp()],
      ['MCP・クレジット', () => this.openCredits()],
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
      h('h1', { class: 'logo' }, '忍乱舞'),
      h('div', { class: 'logo-sub' }, 'NINJA RANBU'),
      h('p', { class: 'tagline' }, `CryptoNinja 全${FIGHTERS.length}キャラが大乱闘 — キャラ情報は MCP サーバー「${ROSTER_META.mcp.server}」から取得`),
      h('div', { class: 'press-start blink' }, 'PRESS START'),
      h('div', { class: 'menu' }, ...this.buttons),
      h('p', { class: 'hint', style: 'margin-top:14px' }, 'クリック・タップ、または W/S・↑↓ で選んで J / Space / A で決定'),
      h('div', { class: 'footer-note' }, '非公式ファンゲームです。CryptoNinja は Ninja DAO / イケハヤ氏の IP です。キャラクター画像は外部から読み込みます。'),
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
    sfx('uiBack');
  }

  private showModal(content: HTMLElement): void {
    sfx('uiSelect');
    this.modal = h('div', { class: 'modal-back', onclick: (e) => e.target === this.modal && this.closeModal() }, content);
    this.app.ui.append(this.modal);
  }

  private openHelp(): void {
    const k1 = KEY_LAYOUTS.kb1.buttons;
    const k2 = KEY_LAYOUTS.kb2.buttons;
    const key = (codes: string[]) => codes.map((c) => h('kbd', {}, c.replace(/^Key|^Digit/, '').replace('Numpad', 'Num').replace('Left', 'L').replace('Right', 'R').replace('Comma', ',').replace('Period', '.').replace('Slash', '/').replace('Semicolon', ';').replace('Quote', "'").replace('Space', 'Space')));
    const row = (label: string, ...v: (Node | string)[]) => h('tr', {}, h('td', {}, label), h('td', {}, ...v));
    this.showModal(
      h(
        'div',
        { class: 'modal' },
        h('h2', {}, 'あそびかた'),
        h('p', {}, '相手をステージの外へふっとばせば撃墜！ ダメージ％が高いほど遠くへ飛びます。ストックが先になくなった方の負け。ガード・回避・つかみ・崖つかまりもあります。'),
        h(
          'div',
          { class: 'keys' },
          h(
            'div',
            {},
            h('h3', {}, 'キーボード1（1P）'),
            h(
              'table',
              {},
              row('移動', ...key(['KeyW', 'KeyA', 'KeyS', 'KeyD'])),
              row('ジャンプ', ...key(k1.jump)),
              row('攻撃', ...key(k1.attack), '（方向+で強攻撃）'),
              row('スマッシュ', ...key(k1.smash), '+方向'),
              row('必殺ワザ', ...key(k1.special), '+方向'),
              row('ガード/回避', ...key(k1.shield)),
              row('つかみ', ...key(k1.grab)),
              row('ポーズ', ...key(['Enter', 'Escape'])),
            ),
          ),
          h(
            'div',
            {},
            h('h3', {}, 'キーボード2（2P）'),
            h(
              'table',
              {},
              row('移動', '矢印キー'),
              row('ジャンプ', ...key(k2.jump)),
              row('攻撃', ...key(k2.attack)),
              row('スマッシュ', ...key(k2.smash)),
              row('必殺ワザ', ...key(k2.special)),
              row('ガード/回避', ...key(k2.shield)),
              row('つかみ', ...key(k2.grab)),
            ),
          ),
          h(
            'div',
            {},
            h('h3', {}, 'ゲームパッド'),
            h(
              'table',
              {},
              row('移動', 'Lスティック / 十字'),
              row('ジャンプ', 'X / Y（上はじきでも）'),
              row('攻撃', 'A（はじき+Aでスマッシュ）'),
              row('スマッシュ', 'Rスティック'),
              row('必殺ワザ', 'B'),
              row('ガード', 'R / ZL / ZR'),
              row('つかみ', 'L'),
            ),
          ),
        ),
        h('h3', {}, 'コツ'),
        h(
          'ul',
          {},
          h('li', {}, 'スマッシュ攻撃はボタン長押しでタメ。ふっとばし力が上がります。'),
          h('li', {}, 'ガード中に横で回避、下でその場回避、攻撃でつかみ。空中でガードすると空中回避。'),
          h('li', {}, '崖から落ちたら空中ジャンプと上必殺ワザで復帰。崖につかまると少しの間無敵です。'),
          h('li', {}, 'ふっとばされている間に方向入力すると飛ぶ向きを少しずらせます（ずらし）。着地の瞬間にガードで受け身。'),
          h('li', {}, 'スマホ・タブレットは画面のバーチャルパッドで遊べます。'),
        ),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => this.closeModal() }, 'とじる')),
      ),
    );
  }

  private openCredits(): void {
    const meta = ROSTER_META;
    this.showModal(
      h(
        'div',
        { class: 'modal' },
        h('h2', {}, 'MCP 連携とクレジット'),
        h(
          'p',
          {},
          `このゲームのキャラクター（${FIGHTERS.length}人）は、Model Context Protocol サーバー `,
          h('b', {}, `${meta.mcp.server} ${meta.mcp.version ?? ''}`),
          ' に MCP クライアントとして接続し、',
          h('code', {}, meta.mcp.tools.filter((t) => t !== 'get_character_image' && t !== 'search_lore').join(' / ')),
          ' ツールで取得した名前・クラン・忍術・得物から、ワザ・性能・見た目を自動生成しています。',
        ),
        h('p', {}, `同期日時: ${new Date(meta.mcp.syncedAt).toLocaleString('ja-JP')}（npm run sync:roster で再取得）`),
        h('h3', {}, 'データ出典'),
        h('p', {}, h('a', { href: meta.credit.url, target: '_blank', rel: 'noopener' }, meta.credit.title), `（${meta.credit.author}）— NINJAMCP 経由`),
        h('h3', {}, 'ライセンス・ガイドライン'),
        h(
          'ul',
          {},
          h('li', {}, 'CryptoNinja は Ninja DAO / イケハヤ氏による IP です。本作は非公式・非営利のファンメイド作品で、公式とは関係ありません。二次創作の範囲は公式の利用ガイドラインをご確認ください。'),
          h('li', {}, 'キャラクター画像はリポジトリに含めず、実行時に MCP が示す URL から読み込みます（読み込めない場合は紋章で表示）。'),
          h('li', {}, 'NINJAMCP（MIT License）: github.com/omikirin/mcp'),
          h('li', {}, 'ゲームのプログラム・演出・効果音はすべて本作オリジナル（手続き生成）です。'),
        ),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => this.closeModal() }, 'とじる')),
      ),
    );
  }

  update(): void {
    this.demo.step();
    const m = this.app.menuAny();
    if (this.modal) {
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
