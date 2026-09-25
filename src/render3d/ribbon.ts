import * as THREE from 'three';
import { toonMat } from './toon';

/**
 * たなびくマフラー・鉢巻（ベルレ積分の鎖を帯状のメッシュにする）。
 * 座標は three のワールド座標（y 上向き）。
 */
export class Ribbon3D {
  readonly mesh: THREE.Mesh;
  private readonly n: number;
  private readonly seg: number;
  private readonly width: number;
  private readonly x: Float32Array;
  private readonly px: Float32Array;
  private readonly pos: THREE.BufferAttribute;
  private readonly geo: THREE.BufferGeometry;
  private primed = false;

  constructor(color: THREE.ColorRepresentation, width: number, length: number, segs = 9) {
    this.n = segs + 1;
    this.seg = length / segs;
    this.width = width;
    this.x = new Float32Array(this.n * 3);
    this.px = new Float32Array(this.n * 3);
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(this.n * 2 * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    const idx: number[] = [];
    for (let i = 0; i < this.n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, toonMat(color, { side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }

  /** 付け根の位置へ一気に移す（出現・復活時） */
  reset(ax: number, ay: number, az: number): void {
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      this.x[k] = this.px[k] = ax - i * 0.5;
      this.x[k + 1] = this.px[k + 1] = ay - i * this.seg;
      this.x[k + 2] = this.px[k + 2] = az;
    }
    this.primed = true;
  }

  /** 1F 進める。facing: 向き（風は後ろへ流れる）、speed: 横移動の速さ */
  step(ax: number, ay: number, az: number, facing: number, time: number): void {
    if (!this.primed) this.reset(ax, ay, az);
    const x = this.x;
    const px = this.px;
    x[0] = px[0] = ax;
    x[1] = px[1] = ay;
    x[2] = px[2] = az;
    for (let i = 1; i < this.n; i++) {
      const k = i * 3;
      const vx = (x[k] - px[k]) * 0.88;
      const vy = (x[k + 1] - px[k + 1]) * 0.88;
      const vz = (x[k + 2] - px[k + 2]) * 0.8;
      px[k] = x[k];
      px[k + 1] = x[k + 1];
      px[k + 2] = x[k + 2];
      x[k] += vx - facing * 0.28 + Math.sin(time * 0.13 + i) * 0.22;
      x[k + 1] += vy - 0.3;
      // 体の少し奥へ流す
      x[k + 2] += vz + (az - 7 - x[k + 2]) * 0.08;
    }
    for (let it = 0; it < 2; it++) {
      for (let i = 1; i < this.n; i++) {
        const a = (i - 1) * 3;
        const b = i * 3;
        const dx = x[b] - x[a];
        const dy = x[b + 1] - x[a + 1];
        const dz = x[b + 2] - x[a + 2];
        const d = Math.hypot(dx, dy, dz) || 1;
        const diff = (d - this.seg) / d;
        x[b] -= dx * diff;
        x[b + 1] -= dy * diff;
        x[b + 2] -= dz * diff;
      }
    }
    this.build();
  }

  private build(): void {
    const x = this.x;
    const p = this.pos.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const a = Math.max(0, i - 1) * 3;
      const b = Math.min(this.n - 1, i + 1) * 3;
      // 鎖の向きに垂直（画面内）＋少し奥行き方向へひねる
      let nx = -(x[b + 1] - x[a + 1]);
      let ny = x[b] - x[a];
      const d = Math.hypot(nx, ny) || 1;
      nx /= d;
      ny /= d;
      const w = this.width * (1 - (i / this.n) * 0.7) * 0.5;
      const k = i * 3;
      const o = i * 6;
      p[o] = x[k] + nx * w * 0.85;
      p[o + 1] = x[k + 1] + ny * w * 0.85;
      p[o + 2] = x[k + 2] + w * 0.5;
      p[o + 3] = x[k] - nx * w * 0.85;
      p[o + 4] = x[k + 1] - ny * w * 0.85;
      p[o + 5] = x[k + 2] - w * 0.5;
    }
    this.pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
