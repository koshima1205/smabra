import * as THREE from 'three';
import type { StageDef } from '../../game/types';
import type { Quality, StageInstance } from '../types';
import {
  addLights,
  Batch,
  canvasTex,
  clamp,
  dotTex,
  glowQuad,
  haze,
  Kit,
  mat4,
  petalTex,
  pointField,
  rampTex,
  Rng,
  roofGeo,
  sheet,
  skyPlane,
  smooth,
  TAU,
  tube,
} from './common';

/**
 * 天界・雲上の舞台: 金色の空に浮かぶ白い大理石の神楽舞台。
 * 足場 = 白石の上面（手前は金の縁と紺地に金の青海波の帯）。朱の高欄は奥（z < -70）だけ。
 * 下は浮き岩が一点へすぼまり、雲海が広がる。遠景は太陽と光の筋・巨大な鳥居・浮島・舞う光の粒。
 */

const GOLD = '#e8bd52';
const GOLD_D = '#a8781e';
const VERM = '#e0442c';
const MARBLE = '#f7f1e6';
const NAVY = '#243276';
const SUN = new THREE.Vector3(2700, 1050, -9400);

export function buildTenkai(stage: StageDef, quality: Quality): StageInstance {
  const kit = new Kit(quality, stage);
  const rng = new Rng(0x7e4);

  sky(kit);
  cloudSea(kit);
  torii(kit);
  islands(kit, rng);
  mainStage(kit, stage);
  pointField(kit, {
    count: kit.high ? 90 : 36,
    box: [-2600, -900, -1400, 2600, 1400, 60],
    map: dotTex(kit, 0.8),
    colors: ['#fff1c4', '#ffe7a8', '#fffbe8'],
    size: [7, 15],
    world: true,
    vel: (r, v) => v.set(r.range(-0.05, 0.05), r.range(0.18, 0.5), 0),
    additive: true,
    twinkle: 0.6,
    twSpeed: 0.07,
    sway: 14,
    opacity: 0.85,
    seed: 17,
  });
  if (kit.high) {
    pointField(kit, {
      count: 40,
      box: [-2600, -900, -900, 2600, 1400, 100],
      map: petalTex(kit),
      colors: ['#ffffff', '#ffe4ee', '#fff4d8'],
      size: [5, 8],
      world: true,
      vel: (r, v) => v.set(r.range(0.25, 0.55), r.range(-0.25, -0.55), 0),
      tumble: true,
      spin: 0.03,
      sway: 18,
      opacity: 0.9,
      seed: 23,
    });
  }

  const sun = addLights(kit, { sky: '#e4ecff', ground: '#e6c2cf', hemi: 1.85, sun: '#fff0d8', sunI: 2.3, dir: [0.42, 1, 0.58] });
  return kit.finish({
    sun,
    background: new THREE.Color('#e9cfd6'),
    fog: kit.fog('#f5dcc8', 2400, 16800),
  });
}

// ─────────────────────────────────────────────────────────────
// 空・太陽
// ─────────────────────────────────────────────────────────────

function sky(kit: Kit): void {
  skyPlane(kit, [
    [-5200, '#f2d2c4'],
    [-2900, '#f6d0b8'],
    [-2200, '#ffd49a'],
    [-1300, '#ffc9a2'],
    [-300, '#f0b8c4'],
    [800, '#c4b4e4'],
    [2000, '#8fa6e6'],
    [3600, '#5a82d4'],
  ]);
  // 太陽: 光輪 + 回る光の筋
  glowQuad(kit, '#fff8e8', 1100, SUN.x, SUN.y, SUN.z, 0.95);
  glowQuad(kit, '#fff2c8', 480, SUN.x, SUN.y, SUN.z + 10, 1);
  glowQuad(kit, '#ffdca0', 5200, SUN.x, SUN.y, SUN.z - 50, 0.3);
  if (kit.high) glowQuad(kit, '#ffc890', 20000, SUN.x - 1500, SUN.y - 1400, SUN.z - 100, 0.16, kit.group, 11000);
  const rays = canvasTex(kit, 512, 512, (g) => {
    const r = new Rng(4242);
    g.translate(256, 256);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + r.range(-0.12, 0.12);
      const wd = r.range(0.02, 0.06);
      for (let k = 0; k < 3; k++) {
        const kw = wd * (1 + k * 0.9);
        const ka = 0.4 * (1 - k * 0.3);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, 256);
        gr.addColorStop(0, `rgba(255,246,215,${ka})`);
        gr.addColorStop(0.45, `rgba(255,236,190,${ka * 0.3})`);
        gr.addColorStop(1, 'rgba(255,230,180,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, 256, a - kw, a + kw);
        g.closePath();
        g.fill();
      }
    }
  });
  const rm = kit.basic({ map: rays, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const ray = kit.mesh(new THREE.PlaneGeometry(13000, 13000), rm);
  ray.position.copy(SUN).setZ(SUN.z - 20);
  ray.renderOrder = -6;
  kit.onUpdate((frame) => {
    ray.rotation.z = frame * 0.0004;
    rm.opacity = 0.13 + 0.04 * Math.sin(frame * 0.012);
  });
}

// ─────────────────────────────────────────────────────────────
// 雲海（トゥーンの球を重ねたもくもく雲）
// ─────────────────────────────────────────────────────────────

interface Puff {
  x: number;
  y: number;
  z: number;
  r: number;
  sy: number;
}

/** 横長のもくもく雲を球の並びで作る */
function cloudBank(out: Puff[], rng: Rng, cx: number, cy: number, cz: number, w: number, h: number, depth: number): void {
  const n = Math.max(3, Math.round(w / (h * 0.7)));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const bump = Math.sin(t * Math.PI);
    const r = h * (0.35 + 0.55 * bump) * rng.range(0.8, 1.15);
    out.push({ x: cx - w / 2 + w * t + rng.range(-0.2, 0.2) * r, y: cy + r * rng.range(-0.1, 0.25) + bump * h * 0.15, z: cz + rng.range(-0.5, 0.5) * depth, r, sy: rng.range(0.78, 0.95) });
  }
  // 下の段（少し小さい球で底を埋める）
  const m = Math.max(2, n - 1);
  for (let i = 0; i < m; i++) {
    const t = (i + 0.5) / m;
    const r = h * rng.range(0.4, 0.55);
    out.push({ x: cx - w * 0.42 + w * 0.84 * t, y: cy - h * 0.28, z: cz + depth * 0.25, r, sy: 0.7 });
  }
}

/** 雲の共有資源（ステージごと。くっきり 2 段の陰: 日向は白、陰は薄紫） */
const cloudRes = new WeakMap<Kit, { geo: THREE.BufferGeometry; mat: THREE.MeshToonMaterial }>();
function cloudsOf(kit: Kit): { geo: THREE.BufferGeometry; mat: THREE.MeshToonMaterial } {
  let r = cloudRes.get(kit);
  if (!r) {
    r = {
      geo: kit.geo(new THREE.SphereGeometry(1, kit.high ? 14 : 9, kit.high ? 10 : 6)),
      mat: kit.mat(new THREE.MeshToonMaterial({ color: '#fff3ea', gradientMap: rampTex(kit, [0.06, 0.06, 0.06, 0.06, 0.06, 0.4, 1, 1]), emissive: '#6a4a7a', emissiveIntensity: 0.32 })),
    };
    cloudRes.set(kit, r);
  }
  return r;
}

function cloudLayer(kit: Kit, puffs: Puff[], shade: (y: number, z: number, c: THREE.Color) => void, drift = 0, period = 0): void {
  if (puffs.length === 0) return;
  const { geo, mat } = cloudsOf(kit);
  const list = period > 0 ? puffs.flatMap((p) => [p, { ...p, x: p.x - period }]) : puffs;
  const o = new THREE.Object3D();
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const c = new THREE.Color();
  list.forEach((p, i) => {
    o.position.set(p.x, p.y, p.z);
    o.scale.set(p.r, p.r * p.sy, p.r * 0.9);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
    c.set(i % 5 === 0 ? '#ffeef0' : i % 7 === 0 ? '#fff4e0' : '#fffaf4');
    shade(p.y, p.z, c);
    im.setColorAt(i, c);
  });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  if (im.boundingSphere) im.boundingSphere.radius += Math.abs(period);
  kit.group.add(im);
  if (drift !== 0 && period > 0) {
    kit.onUpdate((frame) => {
      im.position.x = ((frame * drift) % period) + (drift > 0 ? 0 : period);
    });
  }
}

/** 横に継ぎ目なく続く雲海の絵（上端がもくもく、下は塗りつぶし）。日向は右上 */
function paintCloudStrip(g: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const r = new Rng(seed);
  const rows: [number, number, number][][] = [];
  for (let k = 0; k < 3; k++) {
    const row: [number, number, number][] = [];
    const base = h * (0.26 + k * 0.17);
    const rMin = 44 - k * 10;
    const rMax = 118 - k * 26;
    for (let x = r.range(0, 40); x < w; ) {
      const rad = r.range(rMin, rMax);
      row.push([x, base + r.range(-0.05, 0.05) * h + (rMax - rad) * 0.35, rad]);
      x += rad * r.range(0.75, 1.15);
    }
    rows.push(row);
  }
  const shape = (row: [number, number, number][], bottom: number): void => {
    g.beginPath();
    for (const [x, y, rad] of row) {
      for (const dx of [-w, 0, w]) {
        g.moveTo(x + dx + rad, y);
        g.arc(x + dx, y, rad, 0, TAU);
      }
    }
    const top = Math.min(...row.map((q) => q[1]));
    g.rect(-w, top + 20, w * 3, bottom - top);
  };
  rows.forEach((row, k) => {
    shape(row, h);
    const gr = g.createLinearGradient(0, h * (0.2 + k * 0.17), 0, h);
    gr.addColorStop(0, '#f2cfd8');
    gr.addColorStop(0.35, '#dcc0dc');
    gr.addColorStop(1, '#c4b2d8');
    g.fillStyle = gr;
    g.fill();
    g.save();
    shape(row, h);
    g.clip();
    for (const [x, y, rad] of row) {
      for (const dx of [-w, 0, w]) {
        const hx = x + dx + rad * 0.22;
        const hy = y - rad * 0.3;
        const hg = g.createRadialGradient(hx, hy, 0, hx, hy, rad * 1.02);
        hg.addColorStop(0, 'rgba(255,251,244,1)');
        hg.addColorStop(0.6, 'rgba(255,248,238,1)');
        hg.addColorStop(0.7, 'rgba(255,236,232,0.55)');
        hg.addColorStop(0.8, 'rgba(255,230,230,0)');
        g.fillStyle = hg;
        g.fillRect(hx - rad * 1.1, hy - rad * 1.1, rad * 2.2, rad * 2.2);
      }
    }
    g.restore();
  });
}

function cloudSea(kit: Kit): void {
  const texA = canvasTex(kit, 1024, 512, (g, w, h) => paintCloudStrip(g, w, h, 11), { repeat: true });
  const texB = canvasTex(kit, 1024, 512, (g, w, h) => paintCloudStrip(g, w, h, 29), { repeat: true });
  texA.wrapT = THREE.ClampToEdgeWrapping;
  texB.wrapT = THREE.ClampToEdgeWrapping;
  // [z, 雲頂の y, 絵の帯の高さ, 色, 流れる速さ]。帯の下は絵の最下段の色で塗りつぶし
  const layers: [number, number, number, string, number][] = [
    [-9000, -2650, 3000, '#f4dcd8', 0.00002],
    [-7000, -2300, 2400, '#f8e2de', 0.00003],
    [-5000, -1930, 1900, '#fcece6', 0.00005],
    [-3200, -1520, 1500, '#fff3ee', 0.00008],
    [-1900, -1160, 1200, '#ffffff', 0.00012],
  ];
  const n = kit.high ? layers.length : 3;
  const W = 40000;
  const bottom = -7000;
  layers.slice(layers.length - n).forEach(([z, tops, Hb, color, speed], i) => {
    const tex = (i % 2 === 0 ? texA : texB).clone();
    kit.tex(tex);
    tex.repeat.set(W / (2 * Hb), 1);
    const topY = tops + Hb * 0.26;
    const H = topY - bottom;
    const g = new THREE.PlaneGeometry(W, H);
    const uv = g.getAttribute('uv');
    for (let k = 0; k < uv.count; k++) if (uv.getY(k) < 0.5) uv.setY(k, 1 - H / Hb);
    const m = kit.mesh(g, kit.basic({ map: tex, color, transparent: true, depthWrite: false }));
    m.position.set(0, (topY + bottom) / 2, z);
    m.renderOrder = -3;
    const off = i * 0.37;
    kit.onUpdate((frame) => {
      tex.offset.x = (off + frame * speed * tex.repeat.x) % 1;
    });
  });
}

// ─────────────────────────────────────────────────────────────
// 巨大な鳥居と浮島
// ─────────────────────────────────────────────────────────────

function torii(kit: Kit): void {
  const b = new Batch(kit);
  const x = -1750;
  const z = -3300;
  const base = -1500;
  const H = 1500;
  const span = 820;
  const pr = 42;
  for (const sd of [-1, 1]) {
    b.cyl(pr, pr * 1.12, H, VERM, x + sd * span / 2, base + H / 2, z, { seg: 14 });
    b.cyl(pr * 1.35, pr * 1.4, 80, '#2a1a1a', x + sd * span / 2, base + 160, z, { seg: 14 });
  }
  // 貫
  b.box(span * 1.25, 52, 46, VERM, x, base + H * 0.72, z);
  // 額束
  b.box(56, H * 0.14, 30, VERM, x, base + H * 0.83, z);
  // 島木（朱）と笠木（黒、反り上がる）
  const kasagi = (y: number, w: number, h: number, d: number, col: string, up: number): void => {
    b.add(
      sheet(24, 1, (u, v, o) => {
        const s = (u - 0.5) * 2;
        return o.set(x + s * w / 2, y + up * Math.pow(Math.abs(s), 2.2) + v * h, z);
      }, d, new THREE.Vector3(0, 0, -1)).translate(0, 0, d / 2),
      col,
    );
  };
  kasagi(base + H * 0.9, span * 1.45, 50, 56, VERM, 40);
  kasagi(base + H * 0.9 + 50, span * 1.62, 46, 70, '#2a1a1a', 90);
  const mesh = b.build(kit.vtoon({ emissive: '#401010', emissiveIntensity: 0.25 }), { shade: haze('#f3d6c4', 2500, 6000, 0.45) });
  if (mesh) mesh.name = 'torii';
  // 足元の雲
  const puffs: Puff[] = [];
  const r = new Rng(9);
  cloudBank(puffs, r, x, base + 60, z + 150, span * 2.2, 260, 300);
  cloudLayer(kit, puffs, (_y, _z, c) => c.lerp(new THREE.Color('#f7dfd2'), 0.3));
  glowQuad(kit, '#ffdca0', 3400, x, base + H * 0.7, z - 200, 0.35);
}

/** 浮島（下がすぼまった岩 + 草地 + 社と木） */
function island(b: Batch, water: Batch, x: number, y: number, z: number, r: number, rng: Rng, shrine: boolean): void {
  const prof: THREE.Vector2[] = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    prof.push(new THREE.Vector2(r * Math.pow(1 - t, 0.75) * (1 + rng.range(-0.06, 0.06)) + 0.01, -t * r * 1.9));
  }
  prof.reverse();
  const rock = new THREE.LatheGeometry(prof, 11);
  const p = rock.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const k = 1 + 0.12 * Math.sin(p.getX(i) * 0.02 + p.getY(i) * 0.03) * Math.cos(p.getZ(i) * 0.025);
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  const flat = rock.toNonIndexed();
  rock.dispose();
  flat.computeVertexNormals();
  b.add(flat, (q, _n, c) => c.set('#efe2cf').lerp(new THREE.Color('#9f8fb8'), smooth(y, y - r * 1.7, q.y)), mat4(x, y, z));
  b.cyl(r * 1.02, r * 0.98, r * 0.12, '#bfd98f', x, y + r * 0.02, z, { seg: 18 });
  // 木（桜・金）
  for (let k = 0; k < 4; k++) {
    const a = rng.range(0, TAU);
    const d = rng.range(0.3, 0.75) * r;
    const tx = x + Math.cos(a) * d;
    const tz = z + Math.sin(a) * d * 0.6;
    const th = r * rng.range(0.28, 0.4);
    b.cyl(r * 0.025, r * 0.035, th, '#8a5a4a', tx, y + r * 0.08 + th / 2, tz, { seg: 5 });
    b.ball(r * rng.range(0.16, 0.22), rng.next() < 0.6 ? '#ffc4d6' : '#ffe08a', tx, y + r * 0.08 + th, tz, { sy: 0.8 });
  }
  if (shrine) {
    const s = r / 520;
    b.box(170 * s, 70 * s, 110 * s, '#f5ecdc', x, y + r * 0.08 + 35 * s, z - r * 0.1);
    for (const sd of [-1, 1]) b.cyl(6 * s, 6 * s, 70 * s, VERM, x + sd * 80 * s, y + r * 0.08 + 35 * s, z - r * 0.1 + 56 * s, { seg: 6 });
    b.add(roofGeo(250 * s, 170 * s, 70 * s, { th: 10 * s, up: 18 * s, nx: 8, nz: 6 }), '#4a6a9a', mat4(x, y + r * 0.08 + 66 * s, z - r * 0.1));
    b.box(8 * s, 40 * s, 8 * s, GOLD, x, y + r * 0.08 + 150 * s, z - r * 0.1);
  }
  // 滝（島の縁から落ちる水）
  if (rng.next() < 0.7) {
    const a = rng.range(0.3, 1.2);
    const wx = x + Math.cos(a) * r * 0.55;
    const wz = z + Math.sin(a) * r * 0.9 + 10;
    water.add(new THREE.PlaneGeometry(r * 0.1, r * 2.4, 1, 1), '#ffffff', mat4(wx, y - r * 1.15, wz));
  }
}

function islands(kit: Kit, rng: Rng): void {
  const b = new Batch(kit);
  const water = new Batch(kit, true);
  island(b, water, -3400, 900, -7200, 560, rng, true);
  island(b, water, 2500, 150, -5400, 330, rng, false);
  if (kit.high) {
    island(b, water, 5200, 1500, -8800, 640, rng, true);
    island(b, water, -6200, 400, -8600, 520, rng, false);
    island(b, water, 400, 1900, -9000, 300, rng, false);
  }
  b.build(kit.vtoon(), { shade: haze('#f4d8c6', 2500, 8500, 0.6) });
  // 滝: 流れるテクスチャ
  const tex = canvasTex(
    kit,
    64,
    256,
    (g, w, h) => {
      const r = new Rng(3);
      g.fillStyle = 'rgba(255,255,255,0.0)';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        const x = r.range(4, w - 4);
        const y = r.range(0, h);
        const gr = g.createLinearGradient(0, y, 0, y + 90);
        gr.addColorStop(0, 'rgba(255,255,255,0)');
        gr.addColorStop(0.5, 'rgba(235,248,255,0.85)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(x - 3, y - 45, r.range(3, 8), 180);
        g.fillRect(x - 3, y - 45 - h, r.range(3, 8), 180);
      }
    },
    { repeat: true },
  );
  const wm = water.build(kit.basic({ map: tex, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, color: '#dff2ff' }));
  if (wm) {
    kit.onUpdate((frame) => {
      tex.offset.y = (frame * 0.012) % 1;
    });
  }
}

// ─────────────────────────────────────────────────────────────
// 舞台（メイン足場）
// ─────────────────────────────────────────────────────────────

/** 上面の白い大理石（金の目地） */
function paintMarble(g: CanvasRenderingContext2D, w: number, h: number): void {
  const r = new Rng(8);
  g.fillStyle = '#f6f0e4';
  g.fillRect(0, 0, w, h);
  const cols = 12;
  const tw = w / cols;
  const rows = 2;
  const th = h / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v = r.range(-6, 6);
      g.fillStyle = `rgb(${246 + v},${240 + v},${229 + v})`;
      g.fillRect(i * tw + 2, j * th + 2, tw - 4, th - 4);
      // 大理石の筋
      g.strokeStyle = 'rgba(190,175,200,0.35)';
      g.lineWidth = 1.2;
      g.beginPath();
      let x = i * tw + r.range(0, tw);
      let y = j * th;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += r.range(-12, 12);
        y += th / 6;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  g.fillStyle = 'rgba(214,168,70,0.9)';
  for (let i = 0; i <= cols; i++) g.fillRect(i * tw - 1.5, 0, 3, h);
  for (let j = 0; j <= rows; j++) g.fillRect(0, j * th - 1.5, w, 3);
  // 中央の円紋
  g.strokeStyle = 'rgba(214,168,70,0.7)';
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(w / 2, h / 2, h * 0.9, h * 0.38, 0, 0, TAU);
  g.stroke();
}

/** 紺地に金の青海波 */
function paintSeigaiha(g: CanvasRenderingContext2D, w: number, h: number): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#2f3f8e');
  gr.addColorStop(1, '#1b255e');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#e8bd52';
  g.lineWidth = 2;
  const R = h * 0.62;
  for (let row = 0; row < 3; row++) {
    const y = h * 0.35 + row * R * 0.5;
    const off = (row % 2) * R;
    for (let x = -R * 2 + off; x < w + R * 2; x += R * 2) {
      for (const k of [1, 0.66, 0.33]) {
        g.beginPath();
        g.arc(x, y, R * k, Math.PI, 0);
        g.stroke();
      }
    }
  }
}

/** 胴の前面: 金の枠の中に瑞雲（渦巻く雲）の彫り */
function paintPanels(g: CanvasRenderingContext2D, w: number, h: number): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#f6efe6');
  gr.addColorStop(1, '#d9c9dc');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const n = 8;
  const pw = w / n;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x0 = i * pw;
    // 彫りの影と金の枠
    g.strokeStyle = 'rgba(120,90,130,0.35)';
    g.lineWidth = 5;
    g.strokeRect(x0 + 16, 18, pw - 32, h - 36);
    g.strokeStyle = '#d9a640';
    g.lineWidth = 4;
    g.strokeRect(x0 + 14, 15, pw - 32, h - 36);
    // 瑞雲
    const cx = x0 + pw / 2;
    const cy = h / 2 + 4;
    const spiral = (sx: number, sy: number, r: number, dir: number): void => {
      g.beginPath();
      for (let k = 0; k <= 40; k++) {
        const t = k / 40;
        const a = dir * t * Math.PI * 3.2 + Math.PI;
        const rr = r * (1 - t * 0.85);
        const px = sx + Math.cos(a) * rr;
        const py = sy + Math.sin(a) * rr;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
    };
    for (const [lw, col, dy] of [
      [9, 'rgba(120,90,130,0.3)', 3],
      [6, '#e2b24c', 0],
    ] as [number, string, number][]) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      spiral(cx - 58, cy + dy, 30, 1);
      spiral(cx + 12, cy - 16 + dy, 36, -1);
      spiral(cx + 70, cy + 10 + dy, 24, 1);
      g.beginPath();
      g.moveTo(cx - 88, cy + 30 + dy);
      g.bezierCurveTo(cx - 40, cy + 52 + dy, cx + 40, cy + 40 + dy, cx + 96, cy + 34 + dy);
      g.stroke();
    }
  }
}

function mainStage(kit: Kit, st: StageDef): void {
  const { x1: X1, x2: X2 } = st.main;
  const W = X2 - X1;
  const CX = (X1 + X2) / 2;
  const HZ = st.main.depth / 2;
  const D = st.main.depth;
  const b = new Batch(kit);
  const hi = kit.high;

  // 上面（大理石テクスチャ）
  const topTex = canvasTex(kit, 1024, 160, paintMarble);
  topTex.anisotropy = 8;
  const tg = new THREE.PlaneGeometry(W, D);
  tg.rotateX(-Math.PI / 2);
  tg.translate(CX, 0, 0);
  const top = kit.mesh(tg, kit.toon('#ffffff', { map: topTex }));
  top.receiveShadow = true;
  top.name = 'stageTop';
  // 上の厚板（白石）
  b.slab(X1, X2, -0.6, 26, -HZ, HZ, MARBLE, 2.4);
  b.slab(X1, X2, -3, 3, HZ, HZ + 1.2, GOLD);
  // 紺の帯（テクスチャ面は別メッシュ）
  b.slab(X1 + 6, X2 - 6, -26, 24, -HZ + 6, HZ - 3, NAVY);
  b.slab(X1 - 2, X2 + 2, -24, 3, -HZ + 4, HZ + 1, GOLD);
  b.slab(X1 - 2, X2 + 2, -48, 3, -HZ + 4, HZ + 1, GOLD);
  const bandTex = canvasTex(kit, 1024, 32, paintSeigaiha, { repeat: true });
  const bandGeo = new THREE.PlaneGeometry(W - 12, 20);
  bandGeo.translate(CX, -37, HZ - 2.8);
  kit.mesh(bandGeo, kit.toon('#ffffff', { map: bandTex, emissive: '#101840', emissiveIntensity: 0.4 }));
  // 下の段（白石の蛇腹）
  b.slab(X1 - 4, X2 + 4, -51, 22, -HZ + 2, HZ + 4, MARBLE, 2.2);
  b.slab(X1 - 4, X2 + 4, -72, 3, -HZ + 2, HZ + 4.6, GOLD);
  // 胴（白石の台。前面は奥へ傾き、瑞雲の金の彫り）
  const zt = HZ - 4;
  const zb = HZ - 30;
  const bodyG = new THREE.BoxGeometry(W, 1, 1);
  const bp = bodyG.getAttribute('position');
  for (let i = 0; i < bp.count; i++) {
    const topV = bp.getY(i) > 0;
    const zf = bp.getZ(i) > 0;
    bp.setY(i, topV ? -75 : -D);
    bp.setZ(i, zf ? (topV ? zt : zb) : -HZ + 4);
  }
  bodyG.computeVertexNormals();
  b.add(bodyG, (q, _n, c) => c.set('#efe6d6').lerp(new THREE.Color('#c9b6c8'), smooth(-80, -D, q.y)), mat4(CX, 0, 0), 2.2);
  const panelTex = canvasTex(kit, 2048, 192, paintPanels);
  panelTex.anisotropy = 8;
  const faceLen = Math.hypot(D - 75, zt - zb);
  const pg = new THREE.PlaneGeometry(W - 8, faceLen - 6);
  pg.rotateX(-Math.atan2(zt - zb, D - 75));
  pg.translate(CX, (-75 - D) / 2, (zt + zb) / 2 + 0.6);
  kit.mesh(pg, kit.toon('#ffffff', { map: panelTex }));
  // 浮き岩（下へすぼまる。手前へ出さない）
  const rockProf: THREE.Vector2[] = [];
  const nR = 8;
  const rr = new Rng(21);
  for (let i = 0; i <= nR; i++) {
    const t = i / nR;
    rockProf.push(new THREE.Vector2(Math.max(0.02, (1 - Math.pow(t, 1.25)) * (1 + rr.range(-0.05, 0.05))), -t));
  }
  rockProf.reverse();
  const rock = new THREE.LatheGeometry(rockProf, hi ? 18 : 10);
  const rp = rock.getAttribute('position');
  for (let i = 0; i < rp.count; i++) {
    const k = 1 + 0.08 * Math.sin(rp.getX(i) * 9 + rp.getY(i) * 7) * Math.cos(rp.getZ(i) * 11);
    rp.setXYZ(i, rp.getX(i) * k * (W / 2 - 30), rp.getY(i) * 380, rp.getZ(i) * k * 68);
  }
  const rockF = rock.toNonIndexed();
  rock.dispose();
  rockF.computeVertexNormals();
  b.add(rockF, (q, _n, c) => c.set('#e9dccb').lerp(new THREE.Color('#8f80ae'), smooth(-D, -D - 330, q.y)), mat4(CX, -D + 2, -34), 2.4);
  // 岩の金の筋（金継ぎ）: 岩の前面に沿わせる
  const vr = new Rng(5);
  const rockZ = (x: number, y: number): number => {
    const t = clamp((-D + 2 - y) / 380, 0, 1);
    const f = 1 - Math.pow(t, 1.25);
    const a = Math.max(1, (W / 2 - 30) * f);
    const u = clamp((x - CX) / a, -0.98, 0.98);
    return -34 + 68 * f * Math.sqrt(1 - u * u);
  };
  for (let k = 0; k < (hi ? 7 : 4); k++) {
    let px = CX + vr.range(-0.36, 0.36) * W;
    let py = -D - 6;
    const pts: THREE.Vector3[] = [];
    for (let s2 = 0; s2 < 5; s2++) {
      const t = clamp((-D + 2 - py) / 380, 0, 1);
      const half = (W / 2 - 30) * (1 - Math.pow(t, 1.25)) * 0.85;
      px = Math.max(CX - half, Math.min(CX + half, px));
      pts.push(new THREE.Vector3(px, py, rockZ(px, py) + 1.5));
      px += vr.range(-40, 40);
      py -= vr.range(35, 60);
    }
    b.add(tube(pts, () => 2.2, 4, 12, true), GOLD);
  }
  // 両端の金具と房（崖の角）
  const tassels: THREE.Group[] = [];
  for (const [ex, d] of [
    [X1, 1],
    [X2, -1],
  ] as [number, number][]) {
    b.box(22, 74, 10, GOLD, ex + d * 9, -37, HZ + 3, { ol: 1.8 });
    b.box(10, 74, 30, GOLD, ex + d * 3, -37, HZ - 12, { ol: 1.8 });
    b.box(8, 6, 16, GOLD_D, ex + d * 9, -8, HZ + 8);
    const tg2 = new THREE.Group();
    tg2.position.set(ex + d * 12, -74, HZ + 6);
    const tb = new Batch(kit);
    tb.cyl(1.6, 1.6, 22, '#c0392b', 0, -11, 0, { seg: 5 });
    tb.ball(5, GOLD, 0, -24, 0);
    tb.cyl(3, 7, 30, '#c0392b', 0, -44, 0, { seg: 8, ol: 1.2 });
    tb.build(kit.vtoon(), { parent: tg2 });
    kit.group.add(tg2);
    tassels.push(tg2);
  }
  kit.onUpdate((frame) => {
    for (let i = 0; i < tassels.length; i++) {
      tassels[i].rotation.z = Math.sin(frame * 0.04 + i * 1.3) * 0.08;
      tassels[i].rotation.x = Math.sin(frame * 0.027 + i) * 0.05;
    }
  });

  // 奥の朱の高欄（z < -70。手前には置かない）
  const rz = -HZ + 12;
  const posts = Math.round(W / 115);
  for (let i = 0; i <= posts; i++) {
    const x = X1 + 14 + ((W - 28) * i) / posts;
    b.box(11, 50, 11, VERM, x, 25, rz, { ol: 1.6 });
    if (i === 0 || i === posts) b.ball(9, GOLD, x, 56, rz, { sy: 1.1, ol: 1.4 });
    else b.box(14, 5, 14, GOLD, x, 51, rz);
  }
  b.add(new THREE.CylinderGeometry(5, 5, W - 28, 10), VERM, mat4(CX, 45, rz, 0, 0, Math.PI / 2), 1.6);
  b.box(W - 28, 6, 5, VERM, CX, 22, rz, { ol: 1.4 });
  for (let i = 0; i < posts; i++) {
    const x = X1 + 14 + ((W - 28) * (i + 0.5)) / posts;
    b.box(4, 22, 4, VERM, x - 20, 33, rz);
    b.box(4, 22, 4, VERM, x + 20, 33, rz);
  }

  b.build(kit.vtoon(), { receive: true, name: 'stage' });
  // 岩の下の光
  glowQuad(kit, '#ffd48c', W * 1.6, CX, -D - 120, -150, 0.5, kit.group, 700);

  // 岩を包む雲（奥だけ）
  const puffs: Puff[] = [];
  const r = new Rng(77);
  cloudBank(puffs, r, CX - W * 0.36, -D - 120, -200, W * 0.55, 150, 120);
  cloudBank(puffs, r, CX + W * 0.38, -D - 150, -190, W * 0.5, 140, 120);
  cloudBank(puffs, r, CX, -D - 330, -160, W * 0.7, 170, 120);
  cloudLayer(kit, puffs, (_y, _z, c) => c.lerp(new THREE.Color('#f9e6e6'), 0.2));
}
