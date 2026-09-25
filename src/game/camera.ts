import { clamp, lerp } from '../core/math';
import type { StageDef } from './types';

/** 全員が収まるようにズーム・追従するカメラ（ワールド座標 → 画面） */
export class Camera {
  /** 注視点（ワールド） */
  x = 0;
  y = -220;
  /** 画面px / ワールド単位 */
  zoom = 0.7;
  /** 画面サイズ（CSS px） */
  viewW = 1280;
  viewH = 720;
  private shakeT = 0;
  private shakeMag = 0;
  shakeX = 0;
  shakeY = 0;
  /** 決定打の演出ズーム */
  punch = 0;
  punchX = 0;
  punchY = 0;

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  /** 画面の大きさ基準のスケール（1280x720 で 1） */
  get base(): number {
    return Math.min(this.viewW / 1280, this.viewH / 720);
  }

  shake(mag: number, frames = 12): void {
    if (mag > this.shakeMag * (this.shakeT / 12)) {
      this.shakeMag = mag;
      this.shakeT = frames;
    }
  }

  snap(stage: StageDef): void {
    this.x = (stage.main.x1 + stage.main.x2) / 2;
    this.y = -200;
    this.zoom = this.fitZoom(stage.main.x2 - stage.main.x1 + 500, 700);
  }

  private fitZoom(w: number, h: number): number {
    return Math.min(this.viewW / w, this.viewH / h);
  }

  follow(targets: { x: number; y: number; h: number }[], stage: StageDef, rate = 0.08): void {
    if (targets.length > 0) {
      let l = Infinity;
      let r = -Infinity;
      let t = Infinity;
      let b = -Infinity;
      for (const p of targets) {
        l = Math.min(l, p.x);
        r = Math.max(r, p.x);
        t = Math.min(t, p.y - p.h);
        b = Math.max(b, p.y);
      }
      // ステージも常にある程度映す
      const mid = (stage.main.x1 + stage.main.x2) / 2;
      const half = (stage.main.x2 - stage.main.x1) / 2;
      l = Math.min(l, mid - half * 0.45);
      r = Math.max(r, mid + half * 0.45);
      b = Math.max(b, stage.main.y + 40);
      t = Math.min(t, stage.main.y - 240);
      const padX = 230;
      const padY = 170;
      const w = Math.max(r - l + padX * 2, 860);
      const h = Math.max(b - t + padY * 2, 500);
      const maxW = (stage.blast.r - stage.blast.l) * 0.92;
      const maxH = (stage.blast.b - stage.blast.t) * 0.92;
      const z = clamp(this.fitZoom(Math.min(w, maxW), Math.min(h, maxH)), this.fitZoom(maxW, maxH), this.fitZoom(860, 484));
      let cx = (l + r) / 2;
      let cy = (t + b) / 2 + 20;
      // ブラストゾーンの外は映しすぎない
      const halfW = this.viewW / z / 2;
      const halfH = this.viewH / z / 2;
      cx = clamp(cx, stage.blast.l + halfW, stage.blast.r - halfW);
      cy = clamp(cy, stage.blast.t + halfH, stage.blast.b - halfH);
      this.x = lerp(this.x, cx, rate);
      this.y = lerp(this.y, cy, rate);
      this.zoom = lerp(this.zoom, z, rate * 0.8);
    }
    if (this.shakeT > 0) {
      this.shakeT--;
      const m = this.shakeMag * (this.shakeT / 12);
      this.shakeX = (Math.random() * 2 - 1) * m;
      this.shakeY = (Math.random() * 2 - 1) * m;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeMag = 0;
    }
    if (this.punch > 0) this.punch = Math.max(0, this.punch - 0.04);
  }

  /** 演出込みの実効ズーム・中心 */
  view(): { x: number; y: number; zoom: number } {
    const p = this.punch;
    const k = p > 0 ? 1 + 0.6 * Math.sin(Math.min(1, p) * Math.PI * 0.5) : 1;
    return {
      x: lerp(this.x, this.punchX, p * 0.7) + this.shakeX / this.zoom,
      y: lerp(this.y, this.punchY, p * 0.7) + this.shakeY / this.zoom,
      zoom: this.zoom * k,
    };
  }

  /** ctx にワールド→画面の変換を設定する（dpr は呼び出し側で乗せる） */
  apply(ctx: CanvasRenderingContext2D, dpr: number): void {
    const v = this.view();
    const s = v.zoom * dpr;
    ctx.setTransform(s, 0, 0, s, (this.viewW / 2 - v.x * v.zoom) * dpr, (this.viewH / 2 - v.y * v.zoom) * dpr);
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    const v = this.view();
    return { x: (x - v.x) * v.zoom + this.viewW / 2, y: (y - v.y) * v.zoom + this.viewH / 2 };
  }
}
