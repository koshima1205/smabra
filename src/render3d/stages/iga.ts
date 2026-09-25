import * as THREE from 'three';
import type { StageDef } from '../../game/types';
import type { Quality, StageInstance } from '../types';
import {
  addLights,
  Batch,
  canvasTex,
  dotTex,
  extrude,
  glowQuad,
  haze,
  instanced,
  Kit,
  lerp,
  mat4,
  petalTex,
  pointField,
  ridgeLine,
  Rng,
  roofGeo,
  sheet,
  skyPlane,
  smooth,
  swayLanterns,
  TAU,
  terrain,
  tube,
} from './common';

/**
 * 伊賀の里・天守閣: 月蝕の夜、天守の最上層の瓦屋根で戦う。
 * 足場 = 屋根の平らな上面（手前は反った瓦の斜面と金縁の軒先、奥に棟と金の鯱）。
 * 下は白壁の最上階 → 奥へ引っ込んだ下層の壁が霧へ消える。遠景は城の櫓・五重塔・城下町の灯り・山並み・月蝕の月。
 */

const GOLD = '#dcae4e';
const GOLD_D = '#9a6d1e';
const TILE = '#3a416e';
const TILE_L = '#5d679c';
const WOOD_D = '#241c26';
const PLASTER = '#aab1d6';
const HAZE = '#2c2c5c';
const WARM = '#ffb45c';

export function buildIga(stage: StageDef, quality: Quality): StageInstance {
  const kit = new Kit(quality, stage);
  const rng = new Rng(0x16a);

  sky(kit);
  moon(kit);
  stars(kit);
  clouds(kit);
  mountains(kit, rng);
  valley(kit, rng);
  castle(kit, rng);
  pines(kit, rng);
  keep(kit, stage);
  lanternsAndPlatforms(kit, stage);
  if (kit.high) {
    pointField(kit, {
      count: 120,
      box: [-2200, -800, -700, 2200, 1300, 120],
      map: petalTex(kit),
      colors: ['#ffd6e4', '#ffc4d8', '#fff0f5'],
      size: [7, 11],
      world: true,
      vel: (r, v) => v.set(r.range(0.3, 0.7), r.range(-0.35, -0.8), 0),
      tumble: true,
      spin: 0.03,
      sway: 16,
      opacity: 0.9,
      seed: 91,
    });
  }

  const sun = addLights(kit, { sky: '#9aa0e6', ground: '#4c3446', hemi: 1.75, sun: '#e2e6ff', sunI: 2.35, dir: [0.5, 0.95, 0.62] });
  return kit.finish({
    sun,
    background: new THREE.Color('#1a1a3e'),
    fog: new THREE.Fog(HAZE, 4200, 17000),
  });
}

// ─────────────────────────────────────────────────────────────
// 空・月・星・雲
// ─────────────────────────────────────────────────────────────

function sky(kit: Kit): void {
  skyPlane(kit, [
    [-4200, '#120f26'],
    [-2600, '#3a2c55'],
    [-1700, '#46355f'],
    [-900, '#302c5e'],
    [0, '#1d2152'],
    [1200, '#0f1438'],
    [2600, '#070a22'],
    [4200, '#03040f'],
  ]);
}

/** 部分月蝕の月（左下から地球の影が差し込み、縁が赤く光る） */
function paintMoon(g: CanvasRenderingContext2D, S: number): void {
  const c = S / 2;
  const r = S * 0.33;
  // 近い光輪
  let gr = g.createRadialGradient(c, c, r * 0.9, c, c, S / 2);
  gr.addColorStop(0, 'rgba(255,236,215,0.32)');
  gr.addColorStop(0.3, 'rgba(255,190,165,0.1)');
  gr.addColorStop(1, 'rgba(150,120,190,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  // 本体
  gr = g.createRadialGradient(c - r * 0.3, c - r * 0.3, 0, c, c, r * 1.35);
  gr.addColorStop(0, '#f8f0de');
  gr.addColorStop(0.55, '#e9dcc0');
  gr.addColorStop(1, '#b9a584');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(c, c, r, 0, TAU);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(c, c, r, 0, TAU);
  g.clip();
  const rng = new Rng(771);
  g.fillStyle = 'rgba(140,122,108,0.2)';
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    g.ellipse(c + rng.range(-0.7, 0.65) * r, c + rng.range(-0.65, 0.65) * r, rng.range(0.08, 0.3) * r, rng.range(0.06, 0.2) * r, rng.range(0, 3), 0, TAU);
    g.fill();
  }
  // 本影
  const R = r * 2.6;
  const cover = 0.42;
  const d = R + r - cover * 2 * r;
  const ux = c + Math.cos(Math.PI * 0.78) * d;
  const uy = c + Math.sin(Math.PI * 0.78) * d;
  const tot = R + r * 0.22;
  gr = g.createRadialGradient(ux, uy, 0, ux, uy, tot);
  gr.addColorStop(0, 'rgba(30,8,20,0.97)');
  gr.addColorStop((R - r * 0.6) / tot, 'rgba(46,10,22,0.95)');
  gr.addColorStop((R - r * 0.1) / tot, 'rgba(110,30,34,0.88)');
  gr.addColorStop((R + r * 0.04) / tot, 'rgba(170,70,50,0.5)');
  gr.addColorStop(1, 'rgba(170,70,50,0)');
  g.fillStyle = gr;
  g.fillRect(c - r, c - r, r * 2, r * 2);
  g.restore();
  // 影側の赤い縁
  g.save();
  g.beginPath();
  g.arc(ux, uy, R + r * 0.35, 0, TAU);
  g.clip();
  g.globalCompositeOperation = 'lighter';
  gr = g.createRadialGradient(c, c, r * 0.92, c, c, r * 1.45);
  gr.addColorStop(0, 'rgba(255,70,40,0)');
  gr.addColorStop(0.18, 'rgba(255,90,60,0.26)');
  gr.addColorStop(1, 'rgba(255,60,40,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(c, c, r * 1.45, 0, TAU);
  g.fill();
  g.restore();
}

function moon(kit: Kit): void {
  const S = 512;
  const tex = canvasTex(kit, S, S, (g) => paintMoon(g, S));
  const R = 720;
  const size = R / 0.33;
  const m = kit.mesh(new THREE.PlaneGeometry(size, size), kit.basic({ map: tex, color: '#e4e0ee', transparent: true, fog: false, depthWrite: false }));
  m.position.set(2500, 420, -9300);
  m.renderOrder = -5;
  glowQuad(kit, '#ffd9c0', R * 7, 2500, 420, -9500, 0.2);
  if (kit.high) glowQuad(kit, '#8f7fd8', R * 16, 2300, 0, -9600, 0.16, kit.group, R * 11);
}

function stars(kit: Kit): void {
  pointField(kit, {
    count: kit.high ? 1100 : 380,
    box: [-13000, -1600, -9760, 13000, 4200, -9620],
    map: dotTex(kit, 0.35),
    colors: ['#ffffff', '#dfe6ff', '#fff1d6', '#c9d4ff', '#ffe0f0'],
    size: [1.3, 3.4],
    accept: (x, y, _z, r) => r.next() < 0.06 + 0.94 * smooth(-1400, 2600, y) && Math.hypot(x - 2500, y - 420) > 800,
    additive: true,
    twinkle: 0.65,
    twSpeed: 0.06,
    edge: 0.001,
    seed: 5,
    renderOrder: -8,
  });
}

/** 夜空を流れる薄雲 */
function clouds(kit: Kit): void {
  const tex = canvasTex(kit, 512, 256, (g) => {
    const rng = new Rng(44);
    g.filter = 'blur(6px)';
    for (let k = 0; k < 4; k++) {
      const cy = 32 + k * 64;
      for (let i = 0; i < 9; i++) {
        const t = i / 8 - 0.5;
        const rx = rng.range(40, 90);
        const ry = rng.range(9, 20) * (1 - Math.abs(t));
        const ex = 256 + t * 330 + rng.range(-20, 20);
        const ey = cy + rng.range(-5, 5);
        const gr = g.createLinearGradient(0, ey - ry, 0, ey + ry);
        gr.addColorStop(0, 'rgba(190,196,255,0.55)');
        gr.addColorStop(1, 'rgba(60,56,120,0.5)');
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(ex, ey, rx, Math.max(3, ry), 0, 0, TAU);
        g.fill();
      }
    }
  });
  const T = 26000;
  const layers = kit.high ? 2 : 1;
  for (let L = 0; L < layers; L++) {
    const r = new Rng(300 + L);
    const n = 9;
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const w = r.range(2600, 5200);
      const h = w * r.range(0.11, 0.17);
      const x = (i / n) * T + r.range(-800, 800);
      const y = r.range(-300, 2400);
      const z = -8600 - L * 500 + r.range(-200, 200);
      const row = r.int(0, 3);
      for (const dx of [-T, 0]) {
        const g = new THREE.PlaneGeometry(w, h);
        const uv = g.getAttribute('uv');
        for (let k = 0; k < uv.count; k++) uv.setY(k, (row + uv.getY(k)) / 4);
        g.translate(x + dx, y, z);
        geos.push(g);
      }
    }
    const b = new Batch(kit, true);
    for (const g of geos) b.add(g, '#ffffff');
    const mesh = b.build(kit.basic({ map: tex, vertexColors: true, transparent: true, opacity: 0.8 - L * 0.2, fog: false, depthWrite: false }), { renderOrder: -4 });
    if (!mesh) continue;
    const speed = 0.35 + L * 0.2;
    kit.onUpdate((frame, camX) => {
      mesh.position.x = ((frame * speed) % T) + camX * 0.3 - T * 0.5;
    });
  }
}

// ─────────────────────────────────────────────────────────────
// 遠景: 山・城下町・城の櫓・松
// ─────────────────────────────────────────────────────────────

function mountains(kit: Kit, rng: Rng): void {
  const far = ridgeLine(rng, -15000, 15000, 22, 500, 1900, 1200, 3600, 110);
  const near = ridgeLine(rng, -15000, 15000, 16, 500, 1700, 1100, 3000, 80);
  const b = new Batch(kit);
  const nx = kit.high ? 240 : 110;
  b.add(terrain(-15000, 15000, -9300, -7700, nx, 6, -2700, (x, z) => far(x) * smooth(-7700, -8500, z)), '#2a2d63');
  b.add(terrain(-15000, 15000, -7300, -5900, nx, 6, -2300, (x, z) => near(x) * smooth(-5900, -6600, z)), '#1f2150');
  const hz = new THREE.Color('#3b3262');
  const top = new THREE.Color('#5a5aa0');
  b.build(kit.vtoon(), {
    shade: (p, n, c) => {
      // 稜線の月明かり（光の来る右上を向いた斜面）と麓の霞
      const rim = smooth(0.25, 0.7, n.x * 0.8 + n.y * 0.4) * smooth(-2400, -1200, p.y) * 0.35;
      c.lerp(top, rim);
      c.lerp(hz, 0.25 + 0.55 * smooth(-1500, -2600, p.y) + 0.2 * smooth(-6000, -9000, p.z));
    },
  });
}

/** 谷の城下町（家並みと窓の灯り、霧） */
function valley(kit: Kit, rng: Rng): void {
  const floorY = -1750;
  const g = terrain(-15000, 15000, -7800, -1600, kit.high ? 80 : 40, 16, floorY, (x, z) => 60 * Math.sin(x * 0.0011 + z * 0.0007) + 40 * Math.sin(x * 0.0023));
  const b = new Batch(kit);
  b.add(g, '#191a3a');
  b.build(kit.vtoon(), { shade: haze('#2e2c5a', 2000, 7500, 0.8) });

  // 家（壁と屋根を instanced）
  const n = kit.high ? 260 : 110;
  const houses: { x: number; z: number; w: number; d: number; h: number; ry: number }[] = [];
  for (let i = 0; i < n; i++) {
    const z = rng.range(-7200, -2300);
    const x = rng.range(-7500, 7500) * (0.5 + 0.5 * smooth(-2300, -7000, z));
    if (Math.abs(x) < 900 && z > -3600) continue;
    houses.push({ x, z, w: rng.range(80, 150), d: rng.range(70, 110), h: rng.range(45, 70), ry: rng.range(-0.25, 0.25) });
  }
  const yAt = (x: number, z: number): number => floorY + 60 * Math.sin(x * 0.0011 + z * 0.0007) + 40 * Math.sin(x * 0.0023);
  const wallC = new THREE.Color('#44467a');
  const roofC = new THREE.Color('#15162e');
  const hzC = new THREE.Color('#2e2c5a');
  instanced(kit, new THREE.BoxGeometry(1, 1, 1), kit.toon('#ffffff'), houses.length, (i, o, c) => {
    const h = houses[i];
    o.position.set(h.x, yAt(h.x, h.z) + h.h / 2 - 10, h.z);
    o.scale.set(h.w, h.h + 20, h.d);
    o.rotation.y = h.ry;
    c.copy(wallC).lerp(hzC, smooth(-2500, -7000, h.z) * 0.7);
  });
  instanced(kit, roofGeo(1, 1, 0.5, { th: 0.08, up: 0.08, nx: 4, nz: 2 }), kit.toon('#ffffff'), houses.length, (i, o, c) => {
    const h = houses[i];
    o.position.set(h.x, yAt(h.x, h.z) + h.h, h.z);
    o.scale.set(h.w * 1.25, h.d * 0.9, h.d * 1.3);
    o.rotation.y = h.ry;
    c.copy(roofC).lerp(hzC, smooth(-2500, -7000, h.z) * 0.6);
  });
  // 窓・提灯の灯り
  const lights: [number, number, number][] = [];
  for (const h of houses) {
    if (rng.next() < 0.6) lights.push([h.x + rng.range(-0.3, 0.3) * h.w, yAt(h.x, h.z) + h.h * 0.45, h.z + h.d / 2 + 4]);
  }
  pointField(kit, {
    count: lights.length,
    at: lights,
    box: [-16000, -6000, -12000, 16000, 6000, 4000],
    map: dotTex(kit, 0.6),
    colors: ['#ffb45c', '#ff9a4a', '#ffd08a'],
    size: [26, 44],
    world: true,
    additive: true,
    twinkle: 0.3,
    twSpeed: 0.08,
    edge: 0.0001,
    seed: 12,
  });

  // 谷の霧
  const mistTex = canvasTex(kit, 8, 128, (g2, w, h) => {
    const gr = g2.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,1)');
    g2.fillStyle = gr;
    g2.fillRect(0, 0, w, h);
  });
  const mist = (y0: number, y1: number, z: number, color: string, op: number): void => {
    const m = kit.mesh(new THREE.PlaneGeometry(30000, y1 - y0), kit.basic({ map: mistTex, color, transparent: true, opacity: op, depthWrite: false }));
    m.position.set(0, (y0 + y1) / 2, z);
  };
  mist(-2300, -1200, -2600, '#3c3a78', 0.55);
  mist(-2600, -1500, -5200, '#433b74', 0.5);
  if (kit.high) mist(-2200, -800, -1500, '#34336a', 0.45);
}

/** ずんぐりした四角錐台（石垣） */
function frustum(wb: number, db: number, wt: number, dt: number, h: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, h, 1);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setX(i, p.getX(i) * (top ? wt : wb));
    p.setZ(i, p.getZ(i) * (top ? dt : db));
  }
  g.computeVertexNormals();
  return g;
}

/** 櫓・小天守（石垣 + 白壁 + 反り屋根の層） */
function tower(b: Batch, win: Batch, x: number, z: number, baseY: number, s: number, tiers: number, rng: Rng): number {
  const bh = 190 * s;
  b.add(frustum(360 * s, 290 * s, 270 * s, 215 * s, bh), '#3a3a5c', mat4(x, baseY + bh / 2, z), 0);
  let y = baseY + bh;
  let w = 250 * s;
  let d = 190 * s;
  for (let k = 0; k < tiers; k++) {
    const hw = (k === 0 ? 105 : 80) * s;
    b.box(w, hw, d, '#8a8fbc', x, y + hw / 2, z);
    b.box(w + 2, 10 * s, d + 2, WOOD_D, x, y + hw - 5 * s, z);
    // 窓の灯り
    const nWin = Math.max(2, Math.round(w / (48 * s)));
    for (let i = 0; i < nWin; i++) {
      if (rng.next() < 0.3) continue;
      const wx = x - w / 2 + ((i + 0.5) * w) / nWin;
      win.box(18 * s, 24 * s, 2, rng.next() < 0.8 ? WARM : '#ffd89a', wx, y + hw * 0.5, z + d / 2 + 1);
    }
    const rh = (k === tiers - 1 ? 70 : 52) * s;
    b.add(roofGeo(w * 1.5, d * 1.62, rh, { th: 9 * s, up: 16 * s, nx: 10, nz: 6 }), TILE, mat4(x, y + hw - 8 * s, z));
    y += hw + rh * 0.62;
    w *= 0.72;
    d *= 0.74;
  }
  // 屋根の上の小さな鯱
  for (const sd of [-1, 1]) b.box(8 * s, 22 * s, 6 * s, GOLD, x + sd * w * 0.55, y + 6 * s, z);
  return y;
}

function pagoda(b: Batch, x: number, z: number, baseY: number, s: number): void {
  let y = baseY;
  b.add(frustum(170 * s, 170 * s, 150 * s, 150 * s, 30 * s), '#3a3a5c', mat4(x, y + 15 * s, z));
  y += 30 * s;
  for (let i = 0; i < 5; i++) {
    const bw = (92 - i * 11) * s;
    const bh = 46 * s;
    b.box(bw, bh, bw, '#7a5a4a', x, y + bh / 2, z);
    b.add(roofGeo((178 - i * 20) * s, (178 - i * 20) * s, 26 * s, { th: 7 * s, up: 12 * s, nx: 6, nz: 6, ridge: 0.2 }), TILE, mat4(x, y + bh - 6 * s, z));
    y += bh + 12 * s;
  }
  b.cyl(3 * s, 5 * s, 130 * s, GOLD_D, x, y + 65 * s, z, { seg: 6 });
  for (let k = 0; k < 7; k++) b.cyl(11 * s, 11 * s, 3 * s, GOLD_D, x, y + 18 * s + k * 13 * s, z, { seg: 8 });
}

/** 城の他の建物（櫓・小天守・五重塔）。天守の周りの中景 */
function castle(kit: Kit, rng: Rng): void {
  const b = new Batch(kit);
  const win = new Batch(kit);
  tower(b, win, -1350, -1900, -1050, 1.25, 3, rng);
  tower(b, win, 1300, -1450, -980, 1.0, 2, rng);
  if (kit.high) {
    tower(b, win, 2900, -3300, -1450, 1.3, 3, rng);
    tower(b, win, -3100, -3000, -1500, 1.0, 2, rng);
  }
  pagoda(b, -4300, -4300, -1750, 1.9);
  b.build(kit.vtoon(), { shade: haze('#2f2d5c', 900, 4800, 0.78) });
  win.build(kit.vbasic({ fog: false }));
}

/** 松（くねった幹 + 枝先の葉の塊） */
function pine(b: Batch, x: number, base: number, z: number, H: number, lean: number, rng: Rng): void {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    pts.push(new THREE.Vector3(x + lean * H * (0.3 * t * t - 0.07 * Math.sin(t * 3.2)), base + H * 0.8 * t, z + Math.sin(t * 2.4) * H * 0.05));
  }
  b.add(tube(pts, (t) => H * 0.032 * (1 - t * 0.65), 7, 12, true), '#231a22');
  const curve = new THREE.CatmullRomCurve3(pts);
  const clump = (cx: number, cy: number, cz: number, w: number): void => {
    const n = 5;
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1) - 0.5;
      const r = w * rng.range(0.13, 0.2) * (1.1 - Math.abs(u) * 0.8);
      b.ball(r, '#14262a', cx + u * w * 0.9 + rng.range(-0.05, 0.05) * w, cy + (0.5 - Math.abs(u)) * w * 0.12 + rng.range(-0.03, 0.03) * w, cz + rng.range(-0.25, 0.25) * w, {
        sx: 1.3,
        sy: 0.5,
        sz: 1.0,
        detail: 1,
      });
    }
  };
  const tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const t = 0.38 + (i / (tiers - 1)) * 0.6;
    const p = curve.getPoint(t);
    const side = i % 2 === 0 ? lean : -lean * 0.7;
    const len = H * rng.range(0.2, 0.3) * (1.2 - t * 0.55);
    const ex = p.x + side * len;
    const ey = p.y + H * rng.range(-0.01, 0.04);
    b.add(tube([p, new THREE.Vector3((p.x + ex) / 2, p.y - H * 0.025, p.z), new THREE.Vector3(ex, ey, p.z)], (u) => H * 0.011 * (1 - u * 0.6), 5, 6, false), '#231a22');
    clump(ex - side * len * 0.2, ey + H * 0.01, p.z, len * 1.3);
  }
  const top = curve.getPoint(1);
  clump(top.x, top.y + H * 0.03, top.z, H * 0.3);
}

function pines(kit: Kit, rng: Rng): void {
  const b = new Batch(kit);
  pine(b, -1560, -1000, -1150, 1150, 1, rng);
  pine(b, 1640, -1050, -1350, 1050, -1, rng);
  if (kit.high) {
    pine(b, -2600, -1600, -2700, 950, 1, rng);
    pine(b, 2700, -1550, -2500, 880, -1, rng);
    pine(b, -3900, -1750, -3800, 900, -1, rng);
    pine(b, 4100, -1750, -4000, 860, 1, rng);
  }
  const lit = new THREE.Color('#2c4c4c');
  const far = new THREE.Color('#29295a');
  b.build(kit.vtoon(), {
    shade: (p, n, c) => {
      c.lerp(lit, smooth(0.45, 0.95, n.y * 0.8 + n.x * 0.35) * 0.55);
      c.lerp(far, smooth(-1100, -4200, p.z) * 0.65);
    },
  });
}

// ─────────────────────────────────────────────────────────────
// 天守（メイン足場）
// ─────────────────────────────────────────────────────────────

/** 屋根の上面（平瓦を重ねた段） */
function paintRoofTop(g: CanvasRenderingContext2D, w: number, h: number): void {
  const rng = new Rng(31);
  g.fillStyle = '#6f78ab';
  g.fillRect(0, 0, w, h);
  const rows = 10;
  const rh = h / rows;
  const tw = 48;
  for (let j = 0; j < rows; j++) {
    const y0 = j * rh;
    let x = -((j % 2) * tw) / 2;
    while (x < w) {
      const v = rng.range(-10, 10);
      g.fillStyle = `rgb(${108 + v},${118 + v},${170 + v})`;
      g.fillRect(x + 1, y0 + 2, tw - 2, rh - 3);
      g.fillStyle = 'rgba(210,220,255,0.22)';
      g.fillRect(x + 1, y0 + rh - 5, tw - 2, 2);
      x += tw;
    }
    g.fillStyle = 'rgba(22,24,52,0.6)';
    g.fillRect(0, y0, w, 2);
  }
  // 月（右上）の照り返し
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(10,12,40,0.22)');
  gr.addColorStop(0.55, 'rgba(10,12,40,0)');
  gr.addColorStop(1, 'rgba(210,220,255,0.14)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}

function keep(kit: Kit, st: StageDef): void {
  const { x1: X1, x2: X2, depth } = st.main;
  const W = X2 - X1;
  const HZ = depth / 2;
  const CX = (X1 + X2) / 2;
  const body = new Batch(kit);
  const glow = new Batch(kit);
  const hi = kit.high;

  // 上面（歩ける面）: テクスチャ付きの板
  const Zf = HZ - 3;
  const topTex = canvasTex(kit, 1024, 256, paintRoofTop);
  topTex.anisotropy = 8;
  const topGeo = new THREE.PlaneGeometry(W, Zf + HZ);
  topGeo.rotateX(-Math.PI / 2);
  topGeo.translate(CX, 0, (Zf - HZ) / 2);
  const top = kit.mesh(topGeo, kit.toon('#ffffff', { map: topTex }));
  top.receiveShadow = true;
  top.name = 'keepTop';
  body.slab(X1, X2, -0.6, 18, -HZ, Zf, TILE, 2.5);
  // 手前の縁の棟瓦と金の帯
  body.add(new THREE.CylinderGeometry(11, 11, W, 14), TILE_L, mat4(CX, -11, Zf, 0, 0, Math.PI / 2), 2.2);
  body.box(W, 3.2, 3, GOLD, CX, -17, Zf + 10.5);

  // 手前の反った斜面（瓦）
  const Z0 = Zf + 2;
  const Z1 = Zf + 100;
  const Y0 = -14;
  const Y1 = -94;
  const lift = (x: number): number => 20 * (smooth(X1 + 220, X1, x) + smooth(X2 - 220, X2, x));
  const deck = (x: number, t: number, out: THREE.Vector3): THREE.Vector3 =>
    out.set(x, Y0 + (Y1 - Y0) * (0.3 * t + 0.7 * (1 - (1 - t) * (1 - t))) + lift(x) * t * t, Z0 + (Z1 - Z0) * t);
  body.add(sheet(hi ? 64 : 32, 8, (u, v, o) => deck(X1 + u * W, v, o), 10), TILE, null, 2.5);
  // 丸瓦の列と軒先の巴瓦
  const cols = Math.round(W / 24);
  const pitch = W / cols;
  const P = new THREE.Vector3();
  for (let i = 0; i < cols; i++) {
    const x = X1 + (i + 0.5) * pitch;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 6; k++) pts.push(deck(x, k / 6, new THREE.Vector3()).add(new THREE.Vector3(0, 3.5, 0)));
    body.add(tube(pts, () => 5.2, hi ? 7 : 5, hi ? 10 : 6, false), TILE_L);
    deck(x, 1, P);
    body.cyl(8.8, 8.8, 3, GOLD, x, P.y + 1.5, P.z + 1.5, { rx: Math.PI / 2 - 0.25, seg: 10 });
    body.cyl(7.2, 7.2, 4, '#2c3155', x, P.y + 1.8, P.z + 3.4, { rx: Math.PI / 2 - 0.25, seg: 10 });
  }
  // 瓦の段（横の筋）
  for (const t of [0.22, 0.45, 0.68, 0.88]) {
    body.add(
      sheet(hi ? 48 : 24, 1, (u, v, o) => deck(X1 + u * W, t + v * 0.015, o).add(new THREE.Vector3(0, 1.2, 0)), 1.2),
      '#262b4c',
    );
  }
  // 鼻隠し（黒い板）と金の線
  body.add(sheet(hi ? 48 : 24, 1, (u, v, o) => deck(X1 + u * W, 1, o).add(new THREE.Vector3(0, -3 - v * 16, 3)), 8, new THREE.Vector3(0, 0, -1)), WOOD_D, null, 2);
  body.add(sheet(hi ? 48 : 24, 1, (u, v, o) => deck(X1 + u * W, 1, o).add(new THREE.Vector3(0, -17 - v * 3.5, 4.2)), 2, new THREE.Vector3(0, 0, -1)), GOLD);
  // 垂木（軒裏）
  if (hi) {
    for (let i = 0; i <= cols; i += 2) {
      const x = X1 + 8 + ((W - 16) * i) / cols;
      deck(x, 1, P);
      body.box(5, 6, P.z - 84, '#3a2a22', x, P.y - 16, (P.z + 84) / 2 - 2);
    }
  }

  // 奥の斜面と棟
  const B0 = -HZ - 36;
  const back = (x: number, t: number, out: THREE.Vector3): THREE.Vector3 => out.set(x, -12 + (-92 + 12) * (0.3 * t + 0.7 * (1 - (1 - t) * (1 - t))) + lift(x) * t * t, B0 - 96 * t);
  body.add(sheet(24, 6, (u, v, o) => back(X1 + u * W, v, o), 10, new THREE.Vector3(0, -1, 0)), TILE, null, 2.5);
  body.box(W - 16, 44, 34, '#262b4c', CX, 4, -HZ - 18, { ol: 2.5 });
  body.add(new THREE.CylinderGeometry(15, 15, W - 16, 14), TILE_L, mat4(CX, 26, -HZ - 18, 0, 0, Math.PI / 2), 2.5);
  body.box(W - 16, 3, 2, GOLD, CX, 10, -HZ - 0.6);
  // 鬼瓦と鯱
  for (const [ex, d] of [
    [X1 + 30, 1],
    [X2 - 30, -1],
  ] as [number, 1 | -1][]) {
    body.box(46, 58, 44, GOLD_D, ex, 16, -HZ - 18, { ol: 2 });
    body.box(38, 50, 46, '#23263f', ex, 16, -HZ - 18);
    shachi(body, ex + d * 2, 44, -HZ - 18, d);
  }

  // 破風（両端の板）: 断面の形を押し出す
  const prof = new THREE.Shape();
  prof.moveTo(-HZ - 34, 0);
  prof.lineTo(Zf, 0);
  prof.lineTo(Zf + 11, -11);
  for (let k = 1; k <= 8; k++) {
    deck(X1, k / 8, P);
    prof.lineTo(P.z + 4, P.y + 2);
  }
  deck(X1, 1, P);
  prof.lineTo(P.z + 7, P.y - 20);
  prof.lineTo(84, -110);
  prof.lineTo(-HZ, -110);
  back(X1, 1, P);
  prof.lineTo(P.z - 4, P.y - 16);
  for (let k = 8; k >= 1; k--) {
    back(X1, k / 8, P);
    prof.lineTo(P.z - 3, P.y + 2);
  }
  prof.closePath();
  for (const ex of [X1, X2 - 9]) {
    body.add(extrude(prof, 9), WOOD_D, mat4(ex + 4.5, 0, 0, 0, -Math.PI / 2, 0), 2.2);
    // 端の金の縁（崖の角をはっきり見せる）
    body.box(9.4, 3.4, Zf + HZ + 12, GOLD, ex + 4.5, -1.7, (Zf - HZ) / 2 - 1);
  }

  // 最上階の白壁（軒の下に引っ込む）
  const wy0 = -98;
  const wy1 = -st.main.depth + 2;
  const wh = wy0 - wy1;
  const WZ = 80;
  body.slab(X1 + 10, X2 - 10, wy0, wh, -HZ + 16, WZ, PLASTER, 2);
  const bays = 8;
  const bw = (W - 20) / bays;
  for (let i = 0; i <= bays; i++) {
    const x = X1 + 10 + i * bw;
    body.box(14, wh, 7, '#2b2130', Math.min(X2 - 17, Math.max(X1 + 17, x)), (wy0 + wy1) / 2, WZ + 3.5);
  }
  body.box(W - 18, 11, 9, '#2b2130', CX, wy0 - 14, WZ + 4.5);
  body.box(W - 18, 12, 9, '#2b2130', CX, wy1 + 8, WZ + 4.5);
  body.box(W - 18, 6, 9, '#2b2130', CX, -216, WZ + 4.5);
  for (let i = 0; i < bays; i++) {
    if (i === 0 || i === bays - 1 || i === 3) continue;
    const cx = X1 + 10 + (i + 0.5) * bw;
    const ww = 82;
    const wt = -138;
    const wb = -204;
    glow.box(ww, wt - wb, 2, (p, _n, c) => c.set(p.y > -160 ? '#ffd58c' : '#f08a3c'), cx, (wt + wb) / 2, WZ + 1.2);
    for (let k = 0; k <= 6; k++) body.box(3, wt - wb, 4, '#2a1a12', cx - ww / 2 + (k * ww) / 6, (wt + wb) / 2, WZ + 2.5);
    body.box(ww + 8, 5, 6, '#2a1a12', cx, wt + 2, WZ + 3);
    body.box(ww + 8, 5, 6, '#2a1a12', cx, wb - 2, WZ + 3);
  }

  // 下層（黒い下見板張りの壁。奥へ引っ込み、霧へ消える）
  const low = new Batch(kit);
  const LZ = -104;
  const lw = 440;
  low.slab(-lw, lw, wy1 - 1, 1500, -520, LZ, '#2a2433');
  const lrng = new Rng(77);
  for (let k = 0; k < 4; k++) {
    const fy = wy1 - 60 - k * 220;
    low.add(
      sheet(16, 2, (u, v, o) => o.set(-lw - 34 + u * (lw * 2 + 68), fy - v * 34, LZ + 2 + v * 22), 6),
      TILE,
      null,
      0,
    );
    low.box(lw * 2 + 60, 3, 3, GOLD_D, 0, fy - 36, LZ + 25);
    // 軒下の白壁の帯と窓
    low.box(lw * 2 - 4, 46, 3, '#8c90b8', 0, fy - 62, LZ + 1.5);
    low.box(lw * 2 - 4, 5, 5, '#2b2130', 0, fy - 87, LZ + 2.5);
    for (let i = 0; i < 5; i++) {
      if (lrng.next() < 0.45) continue;
      const wx = -lw + ((i + 0.5) * lw * 2) / 5;
      glow.box(44, 30, 2, (q, _n, c) => c.set(q.y > fy - 62 ? '#f0b06a' : '#c0602e'), wx, fy - 62, LZ + 3.2);
      for (let b2 = 0; b2 <= 4; b2++) low.box(2.5, 30, 3, '#1a1418', wx - 22 + b2 * 11, fy - 62, LZ + 4.2);
    }
    // 下見板の筋
    for (let i = 1; i < 12; i++) low.box(2, 120, 3, '#1b1620', -lw + (i * lw * 2) / 12, fy - 150, LZ + 1.5);
  }
  // 石垣
  low.add(
    sheet(12, 10, (u, v, o) => {
      const y = lerp(-1050, -1900, v);
      const bulge = Math.pow(v, 1.8) * 280;
      return o.set(lerp(-lw - 70 - bulge, lw + 70 + bulge, u), y, LZ - 30 + bulge * 0.5);
    }, 30, new THREE.Vector3(0, 0, -1)),
    (p, _n, c) => {
      const k = Math.floor(p.x / 60) * 7 + Math.floor(p.y / 40) * 13;
      c.set('#4a4868').multiplyScalar(0.8 + (0.3 * (((k * 2654435761) >>> 0) % 100)) / 100);
    },
  );
  const mistC = new THREE.Color('#2b2b5e');
  low.build(kit.vtoon(), {
    shade: (p, _n, c) => {
      c.multiplyScalar(lerp(0.85, 0.42, smooth(-280, -800, p.y)));
      c.lerp(mistC, smooth(-420, -1150, p.y) * 0.92);
    },
  });

  body.build(kit.vtoon(), { receive: true, name: 'keep' });
  glow.build(kit.vbasic(), { name: 'keepWindows' });

  // 窓の滲み
  for (let i = 0; i < bays; i++) {
    if (i === 0 || i === bays - 1 || i === 3) continue;
    const cx = X1 + 10 + (i + 0.5) * bw;
    glowQuad(kit, '#ff9a4a', 230, cx, -171, WZ + 8, 0.32);
  }
  // 霧（下層を覆う。手前のファイターより奥）
  const mistTex = canvasTex(kit, 8, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const mist = kit.mesh(new THREE.PlaneGeometry(9000, 1200), kit.basic({ map: mistTex, color: '#33336a', transparent: true, opacity: 0.9, depthWrite: false }));
  mist.position.set(0, -1000, -90);
}

/** 金の鯱（dir = 頭の向き。+1 で右＝ステージ内側） */
function shachi(b: Batch, x: number, y: number, z: number, dir: 1 | -1): void {
  const P = (px: number, py: number, pz = 0): THREE.Vector3 => new THREE.Vector3(x + px * dir, y + py, z + pz);
  const hi = new THREE.Color('#fff0b8');
  const gold = (_p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color): void => {
    c.set(GOLD).lerp(hi, smooth(0.55, 0.95, n.y * 0.6 + n.x * dir * 0.2 + n.z * 0.4) * 0.6);
  };
  b.add(tube([P(12, 13), P(6, 30), P(-5, 48), P(-13, 64), P(-11, 78)], (t) => lerp(16, 5, Math.pow(t, 0.8)), 10, 18, true), gold, null, 1.3);
  b.ball(14, gold, x + 15 * dir, y + 13, z, { sx: 1.3, sy: 0.95, sz: 1.0, ol: 1.3 });
  // 尾びれ
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.lineTo(-18, 26);
  fin.lineTo(-4, 17);
  fin.lineTo(8, 32);
  fin.lineTo(5, 3);
  fin.closePath();
  b.add(extrude(fin, 4, 0.8, 2), gold, mat4(x - 10 * dir, y + 72, z, 0, dir > 0 ? 0 : Math.PI, 0), 1.2);
  // 背びれ・胸びれ
  for (let k = 0; k < 4; k++) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(-9, 7);
    s.lineTo(1, 5);
    s.closePath();
    b.add(extrude(s, 2.5, 0.5, 1), gold, mat4(x + (-4 - k * 3) * dir, y + 38 + k * 9, z, 0, dir > 0 ? 0 : Math.PI, 0.3));
  }
  for (const sz of [-1, 1]) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(-12, -4);
    s.lineTo(-4, 6);
    s.closePath();
    b.add(extrude(s, 2.5, 0.5, 1), gold, mat4(x + 6 * dir, y + 20, z + sz * 11, sz * 0.5, dir > 0 ? 0 : Math.PI, 0));
  }
  b.ball(2.6, '#2a1a06', x + 23 * dir, y + 15, z + 8);
  b.ball(2.6, '#2a1a06', x + 23 * dir, y + 15, z - 8);
}

// ─────────────────────────────────────────────────────────────
// すり抜け床（木の梁）と揺れる提灯
// ─────────────────────────────────────────────────────────────

function lanternsAndPlatforms(kit: Kit, st: StageDef): void {
  const b = new Batch(kit);
  const pivots: THREE.Vector3[] = [];
  for (const p of st.platforms) {
    const top = -p.y;
    const { x1, x2 } = p;
    const w = x2 - x1;
    const wood = (q: THREE.Vector3, n: THREE.Vector3, c: THREE.Color): void => {
      c.set(n.y > 0.5 ? '#c49466' : q.y > top - 6 ? '#8a5d3c' : '#6a4630');
    };
    b.slab(x1, x2, top, 14, -56, 52, wood, 2.4);
    b.slab(x1, x2, top, 3.2, 52, 57.5, '#f4e0b6');
    b.slab(x1 + 16, x2 - 16, top - 14, 12, -40, 40, '#4a2f1f', 1.8);
    const nb = Math.max(2, Math.round(w / 60));
    for (let k = 0; k <= nb; k++) b.slab(x1 + 22 + ((w - 44) * k) / nb - 5, x1 + 22 + ((w - 44) * k) / nb + 5, top - 26, 9, -28, 28, '#3a2418');
    for (const ex of [x1 - 3, x2 - 5]) b.slab(ex, ex + 8, top - 0.4, 16, -58.5, 58.5, GOLD, 1.5);
    // 提灯を吊る腕（奥へ）
    for (const t of [0.22, 0.78]) {
      const lx = x1 + w * t;
      b.slab(lx - 3, lx + 3, top - 5, 6, -86, -54, '#3a2418');
      pivots.push(new THREE.Vector3(lx, top - 11, -83));
    }
  }
  // 軒先の提灯
  const { x1: X1, x2: X2 } = st.main;
  for (const t of [0.2, 0.4, 0.6, 0.8]) pivots.push(new THREE.Vector3(X1 + (X2 - X1) * t, -104, st.main.depth / 2 + 72));
  b.build(kit.vtoon(), { receive: true, cast: true, name: 'platforms' });

  swayLanterns(kit, pivots);
}
