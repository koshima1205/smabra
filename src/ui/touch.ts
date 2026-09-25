import { touchPad } from '../core/input';
import { h } from './dom';

/** スマホ用のバーチャルパッド（スティック + ボタン） */
export function showTouch(root: HTMLElement, onPause: () => void): void {
  root.hidden = false;
  root.replaceChildren();
  touchPad.active = true;
  const knob = h('div', { class: 'knob' });
  const stick = h('div', { class: 'stick' }, knob);
  let sid: number | null = null;
  const moveStick = (e: PointerEvent) => {
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    touchPad.x = Math.abs(dx) < 0.18 ? 0 : dx;
    touchPad.y = Math.abs(dy) < 0.18 ? 0 : dy;
    knob.style.transform = `translate(${dx * 44}px, ${dy * 44}px)`;
  };
  stick.addEventListener('pointerdown', (e) => {
    sid = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    moveStick(e);
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId === sid) moveStick(e);
  });
  const endStick = (e: PointerEvent) => {
    if (e.pointerId !== sid) return;
    sid = null;
    touchPad.x = 0;
    touchPad.y = 0;
    knob.style.transform = '';
  };
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);

  const btn = (label: string, key: 'attack' | 'special' | 'jump' | 'shield' | 'grab', x: number, y: number) => {
    const b = h('div', { class: 'tb', style: `right:${x}px;bottom:${y}px` }, label);
    const set = (on: boolean) => {
      touchPad[key] = on;
      b.classList.toggle('on', on);
    };
    b.addEventListener('pointerdown', (e) => {
      b.setPointerCapture(e.pointerId);
      set(true);
    });
    b.addEventListener('pointerup', () => set(false));
    b.addEventListener('pointercancel', () => set(false));
    return b;
  };
  const btns = h(
    'div',
    { class: 'btns' },
    btn('攻撃', 'attack', 70, 0),
    btn('必殺', 'special', 0, 60),
    btn('ジャンプ', 'jump', 140, 60),
    btn('ガード', 'shield', 70, 120),
    btn('つかみ', 'grab', 0, 150),
  );
  const pause = h('button', { class: 'pause-btn', onclick: onPause }, 'Ⅱ');
  root.append(stick, btns, pause);
}

export function hideTouch(root: HTMLElement): void {
  root.hidden = true;
  root.replaceChildren();
  touchPad.active = false;
  touchPad.x = touchPad.y = 0;
  touchPad.attack = touchPad.special = touchPad.jump = touchPad.shield = touchPad.grab = false;
}
