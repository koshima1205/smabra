import * as THREE from 'three';

const MAX = 10;
const LIFE = 7;

/**
 * 攻撃の軌跡（攻撃部位の先端の残像）。加算合成の帯。
 */
export class Trail3D {
  readonly mesh: THREE.Mesh;
  private readonly pts: { x: number; y: number; z: number; age: number }[] = [];
  private readonly pos: THREE.BufferAttribute;
  private readonly col: THREE.BufferAttribute;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.MeshBasicMaterial;

  constructor(color: THREE.ColorRepresentation, private width = 16) {
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(MAX * 2 * 3), 3);
    this.col = new THREE.BufferAttribute(new Float32Array(MAX * 2 * 4), 4);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.col.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('color', this.col);
    const idx: number[] = [];
    for (let i = 0; i < MAX - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.mat = new THREE.MeshBasicMaterial({
      color,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** 1F 進める。active のあいだ先端の位置を足していく */
  step(tip: THREE.Vector3 | null): void {
    for (const p of this.pts) p.age++;
    while (this.pts.length && this.pts[0].age >= LIFE) this.pts.shift();
    if (tip) {
      this.pts.push({ x: tip.x, y: tip.y, z: tip.z + 4, age: 0 });
      if (this.pts.length > MAX) this.pts.shift();
    }
    this.build();
  }

  clear(): void {
    this.pts.length = 0;
    this.geo.setDrawRange(0, 0);
  }

  private build(): void {
    const n = this.pts.length;
    if (n < 2) {
      this.geo.setDrawRange(0, 0);
      return;
    }
    const p = this.pos.array as Float32Array;
    const c = this.col.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const a = this.pts[Math.max(0, i - 1)];
      const b = this.pts[Math.min(n - 1, i + 1)];
      let nx = -(b.y - a.y);
      let ny = b.x - a.x;
      const d = Math.hypot(nx, ny) || 1;
      nx /= d;
      ny /= d;
      const q = this.pts[i];
      const life = 1 - q.age / LIFE;
      const k = i / (n - 1);
      const w = this.width * 0.5 * (0.25 + 0.75 * k) * life;
      const o = i * 6;
      p[o] = q.x + nx * w;
      p[o + 1] = q.y + ny * w;
      p[o + 2] = q.z;
      p[o + 3] = q.x - nx * w;
      p[o + 4] = q.y - ny * w;
      p[o + 5] = q.z;
      const al = life * k * 0.85;
      const oc = i * 8;
      for (let j = 0; j < 2; j++) {
        c[oc + j * 4] = 1;
        c[oc + j * 4 + 1] = 1;
        c[oc + j * 4 + 2] = 1;
        c[oc + j * 4 + 3] = al;
      }
    }
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
