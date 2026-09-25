import * as THREE from 'three';
import type { StageDef } from '../../game/types';
import type { Quality, StageInstance } from '../types';
import {
  addLights,
  Batch,
  canvasTex,
  dotTex,
  glowQuad,
  haze,
  Kit,
  lerp,
  mat4,
  placePlatform,
  pointField,
  ridgeLine,
  Rng,
  roofGeo,
  sheet,
  skyPlane,
  smooth,
  TAU,
  terrain,
  tube,
} from './common';

/**
 * 根の国・封印の祠: 地の底の闇。天井から巨大な根が垂れ、遥か下を三途の川が紅く流れる。
 * 足場 = 黒い石の祠の上面（封印の円陣が紫に光る）。上下する 2 枚の石板は鎖で吊られ、霊気の光を帯びる。
 * 背景は巨大な黒い鳥居と血の色の皆既月蝕、注連縄と紙垂・御札、赤と紫の鬼火。
 */

const STONE = '#4c3e4a';
const STONE_D = '#241a24';
const STONE_L = '#76646f';
const ROPE = '#d4bd82';
const ROPE_D = '#8a7446';
const SEAL = '#c04cff';

export function buildNenokuni(stage: StageDef, quality: Quality): StageInstance {
  const kit = new Kit(quality, stage);
  const rng = new Rng(0x9e0);

  sky(kit);
  bloodMoon(kit);
  cavern(kit, rng);
  river(kit);
  bigTorii(kit);
  roots(kit, rng);
  shrine(kit, stage);
  slabs(kit, stage);
  onibi(kit);
  pointField(kit, {
    count: kit.high ? 80 : 30,
    box: [-2400, -900, -900, 2400, 1400, 60],
    map: dotTex(kit, 0.7),
    colors: ['#ff6a3a', '#ff9a5a', '#ff4a6a'],
    size: [4, 9],
    world: true,
    vel: (r, v) => v.set(r.range(-0.1, 0.25), r.range(0.35, 0.9), 0),
    additive: true,
    twinkle: 0.5,
    twSpeed: 0.1,
    sway: 16,
    opacity: 0.9,
    seed: 41,
  });
  // 封印の円陣から立ちのぼる霊気（ファイターより奥）
  pointField(kit, {
    count: kit.high ? 36 : 14,
    box: [-460, 0, -150, 460, 520, -40],
    map: dotTex(kit, 0.9),
    colors: ['#c05cff', '#e080ff', '#ff5a9a'],
    size: [10, 22],
    world: true,
    vel: (r, v) => v.set(r.range(-0.05, 0.05), r.range(0.25, 0.6), 0),
    additive: true,
    twinkle: 0.5,
    twSpeed: 0.08,
    sway: 10,
    edge: 0.12,
    opacity: 0.5,
    seed: 47,
  });
  if (kit.high) {
    pointField(kit, {
      count: 40,
      box: [-2400, -900, -900, 2400, 1400, 60],
      map: dotTex(kit, 0.4),
      colors: ['#b8a8b4', '#d6c8d0'],
      size: [2.5, 4.5],
      world: true,
      vel: (r, v) => v.set(r.range(-0.15, 0.15), r.range(-0.2, -0.45), 0),
      sway: 10,
      opacity: 0.5,
      seed: 43,
    });
  }

  const sun = addLights(kit, { sky: '#a86aa0', ground: '#6a1a2a', hemi: 1.9, sun: '#ffd0dc', sunI: 2.2, dir: [-0.35, 1, 0.62] });
  return kit.finish({
    sun,
    background: new THREE.Color('#1c0714'),
    fog: new THREE.Fog('#2a0c1e', 4200, 16500),
  });
}

// ─────────────────────────────────────────────────────────────
// 空（地の底の闇）と血の月
// ─────────────────────────────────────────────────────────────

function sky(kit: Kit): void {
  skyPlane(kit, [
    [-4800, '#1a0510'],
    [-2600, '#4e0f22'],
    [-1500, '#5a1428'],
    [-600, '#3a0c22'],
    [600, '#1e0818'],
    [2000, '#0e040c'],
    [3800, '#040207'],
  ]);
  pointField(kit, {
    count: kit.high ? 260 : 90,
    box: [-13000, -800, -9760, 13000, 4200, -9650],
    map: dotTex(kit, 0.35),
    colors: ['#ffd6d6', '#ffb0b0', '#e2c4ff'],
    size: [1.2, 2.8],
    accept: (x, y, _z, r) => r.next() < 0.1 + 0.9 * smooth(-600, 2600, y) && Math.hypot(x + 300, y - 700) > 900,
    additive: true,
    twinkle: 0.7,
    twSpeed: 0.05,
    edge: 0.001,
    seed: 6,
    renderOrder: -8,
  });
}

function bloodMoon(kit: Kit): void {
  const S = 512;
  const tex = canvasTex(kit, S, S, (g) => {
    const c = S / 2;
    const r = S * 0.33;
    let gr = g.createRadialGradient(c, c, r * 0.8, c, c, S / 2);
    gr.addColorStop(0, 'rgba(255,60,40,0.5)');
    gr.addColorStop(0.3, 'rgba(200,30,40,0.2)');
    gr.addColorStop(1, 'rgba(80,0,30,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    gr = g.createRadialGradient(c - r * 0.3, c - r * 0.3, 0, c, c, r * 1.35);
    gr.addColorStop(0, '#c8412c');
    gr.addColorStop(0.55, '#8a1a14');
    gr.addColorStop(1, '#3c0707');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(c, c, r, 0, TAU);
    g.fill();
    g.save();
    g.beginPath();
    g.arc(c, c, r, 0, TAU);
    g.clip();
    const rng = new Rng(771);
    g.fillStyle = 'rgba(30,0,0,0.25)';
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      g.ellipse(c + rng.range(-0.65, 0.6) * r, c + rng.range(-0.6, 0.6) * r, rng.range(0.1, 0.3) * r, rng.range(0.07, 0.2) * r, rng.range(0, 3), 0, TAU);
      g.fill();
    }
    gr = g.createRadialGradient(c + r * 0.25, c + r * 0.3, 0, c, c, r * 1.1);
    gr.addColorStop(0, 'rgba(20,0,0,0.55)');
    gr.addColorStop(1, 'rgba(20,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(c - r, c - r, r * 2, r * 2);
    g.restore();
    g.globalCompositeOperation = 'lighter';
    gr = g.createRadialGradient(c, c, r * 0.9, c, c, r * 1.4);
    gr.addColorStop(0, 'rgba(255,70,40,0)');
    gr.addColorStop(0.2, 'rgba(255,70,50,0.55)');
    gr.addColorStop(1, 'rgba(255,60,40,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(c, c, r * 1.4, 0, TAU);
    g.fill();
  });
  const R = 760;
  const m = kit.mesh(new THREE.PlaneGeometry(R / 0.33, R / 0.33), kit.basic({ map: tex, transparent: true, fog: false, depthWrite: false }));
  m.position.set(-300, 700, -9300);
  m.renderOrder = -5;
  glowQuad(kit, '#ff3a3a', R * 8, -300, 700, -9500, 0.28);
  if (kit.high) glowQuad(kit, '#8a1a4a', R * 18, -300, 200, -9600, 0.3, kit.group, R * 12);
}

// ─────────────────────────────────────────────────────────────
// 地形: 崖・川・根
// ─────────────────────────────────────────────────────────────

function cavern(kit: Kit, rng: Rng): void {
  const b = new Batch(kit);
  const far = ridgeLine(rng, -15000, 15000, 26, 400, 1800, 700, 2200, 140);
  const mid = ridgeLine(rng, -15000, 15000, 18, 600, 2000, 700, 1900, 120);
  const nx = kit.high ? 220 : 100;
  b.add(terrain(-15000, 15000, -9200, -7600, nx, 6, -2900, (x, z) => far(x) * smooth(-7600, -8400, z)), '#2c0c24');
  // 川の両岸の崖（手前ほど高い）
  b.add(terrain(-15000, 15000, -6400, -2600, nx, 14, -2500, (x, z) => {
    const bank = Math.abs(z + 4300 + 700 * Math.sin(x * 0.00035));
    return mid(x) * 0.6 * smooth(250, 1500, bank) + 60 * Math.sin(x * 0.004 + z * 0.002) * smooth(200, 800, bank);
  }), '#1e0816');
  const rim = new THREE.Color('#7a1a30');
  b.build(kit.vtoon(), {
    shade: (p, n, c) => {
      c.lerp(rim, smooth(0.2, 0.7, n.y * 0.5 - n.x * 0.5) * smooth(-2400, -1200, p.y) * 0.5);
      c.lerp(new THREE.Color('#3a0e22'), 0.2 + 0.4 * smooth(-5000, -9000, p.z));
    },
  });
  // 霧（赤紫）
  const mistTex = canvasTex(kit, 8, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const mist = (y0: number, y1: number, z: number, color: string, op: number): void => {
    const m = kit.mesh(new THREE.PlaneGeometry(32000, y1 - y0), kit.basic({ map: mistTex, color, transparent: true, opacity: op, depthWrite: false }));
    m.position.set(0, (y0 + y1) / 2, z);
  };
  mist(-3000, -1900, -6000, '#5a1428', 0.6);
  mist(-2800, -1500, -3000, '#3a0c22', 0.5);
  if (kit.high) mist(-2300, -900, -1400, '#2a0818', 0.55);
}

/** 遥か下を流れる三途の川（紅く光る流れ） */
function river(kit: Kit): void {
  const tex = canvasTex(
    kit,
    256,
    256,
    (g, w, h) => {
      g.fillStyle = '#5a0a18';
      g.fillRect(0, 0, w, h);
      const r = new Rng(12);
      for (let i = 0; i < 90; i++) {
        const y = r.range(0, h);
        const x = r.range(0, w);
        const len = r.range(20, 90);
        g.fillStyle = r.next() < 0.5 ? 'rgba(255,90,70,0.55)' : 'rgba(255,170,120,0.35)';
        g.fillRect(x, y, len, r.range(1.5, 3.5));
        g.fillRect(x - w, y, len, 3);
      }
    },
    { repeat: true },
  );
  tex.repeat.set(14, 4);
  const g = new THREE.PlaneGeometry(30000, 1500, 60, 4);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setZ(i, p.getZ(i) - 4300 + 700 * Math.sin(x * 0.00035));
    p.setY(i, -2480);
  }
  g.computeVertexNormals();
  const m = kit.mesh(g, kit.basic({ map: tex, color: '#ff8a7a' }));
  m.name = 'sanzu';
  kit.onUpdate((frame) => {
    tex.offset.x = 1 - ((frame * 0.0009) % 1);
  });
  glowQuad(kit, '#ff2a3a', 16000, 0, -2300, -4200, 0.28, kit.group, 1800);
}

/** 天井から垂れる根と、下から這い上がる根 */
function roots(kit: Kit, rng: Rng): void {
  const b = new Batch(kit);
  const root = (p0: THREE.Vector3, p1: THREE.Vector3, w: number, wig: number): void => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push(new THREE.Vector3(lerp(p0.x, p1.x, t) + Math.sin(t * 5 + w) * wig, lerp(p0.y, p1.y, t), lerp(p0.z, p1.z, t) + Math.cos(t * 4) * wig * 0.4));
    }
    b.add(tube(pts, (t) => w * 0.5 * Math.pow(1 - t, 0.8) * (1 + 0.15 * Math.sin(t * 21 + w)) + 2, 8, 20, true), '#1c0a14');
  };
  // 天井から（奥）
  const hang: [number, number, number, number, number][] = [
    [-1700, -900, 160, -1250, 150],
    [-1150, -1400, 110, -500, 90],
    [1500, -1000, 170, -1100, 160],
    [1050, -1500, 100, -300, 80],
    [-350, -1700, 80, 200, 60],
    [420, -1600, 70, 380, 50],
    [-2800, -2300, 220, -1600, 200],
    [2900, -2500, 230, -1800, 200],
  ];
  for (const [x, z, w, yEnd, wig] of hang.slice(0, kit.high ? hang.length : 5)) {
    root(new THREE.Vector3(x + rng.range(-100, 100), 2800, z), new THREE.Vector3(x + rng.range(-250, 250), yEnd, z + rng.range(-80, 80)), w, wig);
    // 枝分かれ
    root(new THREE.Vector3(x, 1600, z + 20), new THREE.Vector3(x + rng.range(-400, 400), yEnd + rng.range(300, 700), z + 40), w * 0.45, wig * 0.6);
  }
  // 下から（奥の崖から這い上がる）
  root(new THREE.Vector3(-1500, -1800, -700), new THREE.Vector3(-900, -500, -500), 180, 120);
  root(new THREE.Vector3(1600, -1800, -800), new THREE.Vector3(950, -450, -560), 190, 130);
  const rim = new THREE.Color('#8a1e34');
  b.build(kit.vtoon(), {
    shade: (p, n, c) => {
      c.lerp(rim, smooth(0.3, 0.8, -n.x * 0.6 + n.z * 0.3 + n.y * 0.2) * 0.45);
      c.lerp(new THREE.Color('#2a0a1c'), smooth(-800, -2600, p.z) * 0.6);
    },
  });
  // 蜘蛛の巣（奥の隅）
  if (kit.high) {
    const web = canvasTex(kit, 256, 256, (g) => {
      g.strokeStyle = 'rgba(230,205,225,0.5)';
      g.lineWidth = 1.2;
      const spokes = 8;
      for (let i = 0; i < spokes; i++) {
        const a = (i / (spokes - 1)) * Math.PI * 0.5;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * 250, Math.sin(a) * 250);
        g.stroke();
      }
      for (let k = 1; k <= 8; k++) {
        const rr = (250 * k) / 8;
        g.beginPath();
        for (let i = 0; i < spokes; i++) {
          const a = (i / (spokes - 1)) * Math.PI * 0.5;
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr;
          if (i === 0) g.moveTo(x, y);
          else {
            const am = ((i - 0.5) / (spokes - 1)) * Math.PI * 0.5;
            g.quadraticCurveTo(Math.cos(am) * rr * 0.86, Math.sin(am) * rr * 0.86, x, y);
          }
        }
        g.stroke();
      }
    });
    const wm = kit.basic({ map: web, transparent: true, depthWrite: false, opacity: 0.32 });
    const w1 = kit.mesh(new THREE.PlaneGeometry(900, 900), wm);
    w1.position.set(-1950, 900, -1300);
    const w2 = kit.mesh(new THREE.PlaneGeometry(800, 800), wm);
    w2.position.set(2000, 1000, -1400);
    w2.scale.x = -1;
  }
}

/** 巨大な黒い鳥居（折れかけ） */
function bigTorii(kit: Kit): void {
  const b = new Batch(kit);
  const x = 150;
  const z = -4600;
  const base = -2100;
  const H = 2500;
  const span = 1500;
  const pr = 70;
  const tilt = -0.035;
  const g = new THREE.Group();
  g.position.set(x, base, z);
  g.rotation.z = tilt;
  for (const sd of [-1, 1]) {
    const h = sd > 0 ? H * 0.92 : H;
    b.cyl(pr, pr * 1.15, h, '#1a0a12', sd * span / 2, h / 2, 0, { seg: 12 });
    b.cyl(pr * 1.35, pr * 1.4, 150, '#0c0408', sd * span / 2, 300, 0, { seg: 12 });
  }
  b.box(span * 1.25, 90, 70, '#1a0a12', 0, H * 0.72, 0);
  b.box(90, H * 0.12, 50, '#1a0a12', 0, H * 0.84, 0);
  b.add(
    sheet(20, 1, (u, v, o) => {
      const s = (u - 0.5) * 2;
      return o.set((s * span * 1.62) / 2, H * 0.9 + 150 * Math.pow(Math.abs(s), 2.2) + v * 110, 0);
    }, 110, new THREE.Vector3(0, 0, -1)).translate(0, 0, 55),
    '#12060c',
  );
  // 注連縄（鳥居の貫に）
  const rope: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    rope.push(new THREE.Vector3((t - 0.5) * span * 0.95, H * 0.66 - Math.sin(t * Math.PI) * 180, 50));
  }
  b.add(tube(rope, (t) => 34 * (0.7 + 0.3 * Math.sin(t * Math.PI)), 8, 24, true), '#7a6440');
  b.build(kit.vtoon(), { parent: g, shade: haze('#3a0c22', 3000, 6000, 0.35) });
  kit.group.add(g);
  // 紙垂
  const sb = new Batch(kit);
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    shide(sb, (t - 0.5) * span * 0.95, H * 0.66 - Math.sin(t * Math.PI) * 180 - 30, 60, 3.2);
  }
  sb.build(kit.vtoon({ emissive: '#402030', emissiveIntensity: 0.4 }), { parent: g, shade: haze('#3a0c22', 3000, 6000, 0.3) });
}

/** 紙垂（ジグザグの白い紙） */
function shide(b: Batch, x: number, y: number, z: number, s = 1): void {
  for (let k = 0; k < 4; k++) {
    b.box(9 * s, 11 * s, 1.2 * s, '#f4efe6', x + (k % 2 ? 4 : -4) * s, y - k * 10 * s, z);
  }
}

// ─────────────────────────────────────────────────────────────
// 祠（メイン足場）
// ─────────────────────────────────────────────────────────────

/** 上面の石畳と封印の円陣（円陣は別の発光テクスチャ） */
function paintFloor(g: CanvasRenderingContext2D, w: number, h: number): void {
  const r = new Rng(5);
  g.fillStyle = '#5a4a56';
  g.fillRect(0, 0, w, h);
  const rows = 3;
  const rh = h / rows;
  for (let j = 0; j < rows; j++) {
    let x = -r.range(0, 60);
    while (x < w) {
      const bw = r.range(70, 130);
      const v = r.range(-12, 10);
      g.fillStyle = `rgb(${96 + v},${80 + v},${92 + v})`;
      g.fillRect(x + 2, j * rh + 2, bw - 4, rh - 4);
      g.fillStyle = 'rgba(255,220,235,0.08)';
      g.fillRect(x + 2, j * rh + rh - 7, bw - 4, 3);
      g.strokeStyle = 'rgba(20,8,14,0.55)';
      g.lineWidth = 1.5;
      if (r.next() < 0.3) {
        g.beginPath();
        let px = x + r.range(10, bw - 10);
        let py = j * rh + 4;
        g.moveTo(px, py);
        for (let k = 0; k < 4; k++) {
          px += r.range(-10, 10);
          py += rh / 5;
          g.lineTo(px, py);
        }
        g.stroke();
      }
      x += bw;
    }
  }
}

function paintSeal(g: CanvasRenderingContext2D, w: number, h: number): void {
  const c = w / 2;
  const glowLine = (lw: number, a: number, draw: () => void): void => {
    g.strokeStyle = `rgba(220,120,255,${a})`;
    g.lineWidth = lw;
    draw();
  };
  const all = (): void => {
    g.beginPath();
    g.arc(c, h / 2, w * 0.46, 0, TAU);
    g.stroke();
    g.beginPath();
    g.arc(c, h / 2, w * 0.4, 0, TAU);
    g.stroke();
    g.beginPath();
    g.arc(c, h / 2, w * 0.2, 0, TAU);
    g.stroke();
    // 五芒星
    g.beginPath();
    for (let k = 0; k <= 5; k++) {
      const a = -Math.PI / 2 + (k * 4 * Math.PI) / 5;
      const x = c + Math.cos(a) * w * 0.4;
      const y = h / 2 + Math.sin(a) * w * 0.4;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    // 文字の代わりの刻み
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * w * 0.415, h / 2 + Math.sin(a) * w * 0.415);
      g.lineTo(c + Math.cos(a) * w * 0.445, h / 2 + Math.sin(a) * w * 0.445);
      g.stroke();
    }
  };
  glowLine(16, 0.12, all);
  glowLine(8, 0.3, all);
  glowLine(3, 1, all);
}

function shrine(kit: Kit, st: StageDef): void {
  const { x1: X1, x2: X2, depth: D } = st.main;
  const W = X2 - X1;
  const CX = (X1 + X2) / 2;
  const HZ = D / 2;
  const b = new Batch(kit);
  const glow = new Batch(kit);
  const hi = kit.high;

  // 上面（石畳テクスチャ）
  const ft = canvasTex(kit, 1024, 256, paintFloor);
  ft.anisotropy = 8;
  const tg = new THREE.PlaneGeometry(W, D);
  tg.rotateX(-Math.PI / 2);
  tg.translate(CX, 0, 0);
  const top = kit.mesh(tg, kit.toon('#ffffff', { map: ft }));
  top.receiveShadow = true;
  top.name = 'shrineTop';
  // 封印の円陣（上面に重ねて光る）
  const sealTex = canvasTex(kit, 512, 512, paintSeal);
  const sealMats: THREE.MeshBasicMaterial[] = [];
  for (const [sx, size] of [
    [CX, 520],
    [X1 + 150, 240],
    [X2 - 150, 240],
  ] as [number, number][]) {
    const m = kit.basic({ map: sealTex, color: SEAL, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 });
    sealMats.push(m);
    const sg = new THREE.PlaneGeometry(size, size * 0.52);
    sg.rotateX(-Math.PI / 2);
    const s = kit.mesh(sg, m);
    s.position.set(sx, 0.8, 0);
    s.renderOrder = 2;
  }
  kit.onUpdate((frame) => {
    for (let i = 0; i < sealMats.length; i++) sealMats[i].opacity = 0.55 + 0.3 * Math.sin(frame * 0.035 + i * 2.1);
  });
  // 笠石（上の厚い石）
  b.slab(X1, X2, -0.6, 24, -HZ, HZ, STONE_L, 2.5);
  b.slab(X1, X2, -1.5, 2.6, HZ, HZ + 1, '#f0e0e8');
  // 石組みの胴（前面は少し奥へ傾く台形）
  const zt = HZ - 6;
  const zb = HZ - 70;
  const body = new THREE.BoxGeometry(W - 8, 1, 1);
  const bp = body.getAttribute('position');
  for (let i = 0; i < bp.count; i++) {
    const topV = bp.getY(i) > 0;
    const zf = bp.getZ(i) > 0;
    bp.setY(i, topV ? -24 : -D);
    bp.setZ(i, zf ? (topV ? zt : zb) : -HZ + 6);
  }
  body.computeVertexNormals();
  b.add(body, (q, _n, c) => c.set(STONE).lerp(new THREE.Color(STONE_D), smooth(-40, -D, q.y)), mat4(CX, 0, 0), 2.4);
  // 石積みの目地（前面に段）
  const rows = 5;
  for (let k = 1; k < rows; k++) {
    const y = -24 - ((D - 24) * k) / rows;
    const zf = lerp(zt, zb, (-24 - y) / (D - 24));
    b.box(W - 10, 4, 4, STONE_D, CX, y, zf + 1);
    const off = (k % 2) * 60;
    for (let x = X1 + 70 + off; x < X2 - 40; x += 120) b.box(4, (D - 24) / rows - 4, 4, STONE_D, x, y + (D - 24) / rows / 2, zf + 1 + ((D - 24) / rows / 2) * ((zt - zb) / (D - 24)));
  }
  // ひび割れの紅い光（発光）
  const cr = new Rng(19);
  for (let k = 0; k < (hi ? 6 : 3); k++) {
    let px = X1 + W * cr.range(0.08, 0.92);
    let py = -cr.range(60, D - 80);
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s < 5; s++) {
      const zf = lerp(zt, zb, (-24 - py) / (D - 24));
      pts.push(new THREE.Vector3(px, py, zf + 1.5));
      px += cr.range(-22, 22);
      py -= cr.range(10, 22);
    }
    glow.add(tube(pts, () => 2, 3, 8, false), '#ff3a4a');
  }
  // 御札（封印）
  const tal: [number, number, number][] = [
    [0.08, -70, -0.1],
    [0.22, -120, 0.08],
    [0.37, -80, -0.05],
    [0.63, -95, 0.1],
    [0.78, -130, -0.08],
    [0.92, -75, 0.06],
  ];
  for (const [t, y, rot] of tal) {
    const x = X1 + W * t;
    const zf = lerp(zt, zb, (-24 - y) / (D - 24)) + 3;
    ofuda(b, glow, x, y, zf, rot, 1.4);
  }
  // 注連縄（前面の上。床より下）
  const anchors = [X1 + 30, CX, X2 - 30];
  for (let k = 0; k < 2; k++) {
    const a = anchors[k];
    const c = anchors[k + 1];
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new THREE.Vector3(lerp(a, c, t), -36 - Math.sin(t * Math.PI) * 40, HZ + 8 - Math.sin(t * Math.PI) * 6));
    }
    b.add(tube(pts, (t) => 9 + 3 * Math.sin(t * Math.PI), 8, 20, true), (_q, n, col) => col.set(ROPE).lerp(new THREE.Color(ROPE_D), smooth(0.2, -0.6, n.y) * 0.7), null, 1.6);
    for (const t of [0.3, 0.7]) {
      const x = lerp(a, c, t);
      const y = -36 - Math.sin(t * Math.PI) * 40 - 12;
      shide(b, x, y, HZ + 12 - Math.sin(t * Math.PI) * 6, 1.3);
    }
  }
  for (const a of anchors) b.ball(12, ROPE, a, -36, HZ + 8, { sy: 1.2, ol: 1.4 });
  // 両端（崖）の石灯籠風の角柱と縁の光
  for (const [ex, d] of [
    [X1, 1],
    [X2, -1],
  ] as [number, number][]) {
    b.box(18, D - 6, 20, STONE_D, ex + d * 9, -D / 2 - 2, HZ - 12, { ol: 1.8 });
    glow.box(3, D - 40, 3, '#ff4a5a', ex + d * 1.5, -D / 2 - 10, HZ - 2);
  }
  // 奥の祠（z < -70）: 小さな社と石灯籠。床は奥へ続く
  b.slab(X1 + 120, X2 - 120, -0.6, D - 20, -HZ - 230, -HZ, STONE, 2);
  shrineHouse(b, glow, CX, -HZ - 120, 0);
  for (const sx of [-1, 1]) lanternStone(b, glow, CX + sx * 330, 0, -HZ + 20);

  // 下へ続く岩の柱（奥へ引っ込む）
  const low = new Batch(kit);
  const pr = new Rng(3);
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    prof.push(new THREE.Vector2(1 - t * 0.55 + pr.range(-0.05, 0.05), -t));
  }
  prof.reverse();
  const pillar = new THREE.LatheGeometry(prof, hi ? 14 : 9);
  const pp = pillar.getAttribute('position');
  for (let i = 0; i < pp.count; i++) {
    const k = 1 + 0.1 * Math.sin(pp.getX(i) * 7 + pp.getY(i) * 13);
    pp.setXYZ(i, pp.getX(i) * k * 380, pp.getY(i) * 1500, pp.getZ(i) * k * 170);
  }
  const pf = pillar.toNonIndexed();
  pillar.dispose();
  pf.computeVertexNormals();
  low.add(pf, STONE_D, mat4(CX, -D + 10, -260));
  low.build(kit.vtoon(), {
    shade: (p, _n, c) => {
      c.lerp(new THREE.Color('#3a0c22'), smooth(-400, -1500, p.y) * 0.8);
    },
  });

  b.build(kit.vtoon(), { receive: true, name: 'shrine' });
  glow.build(kit.vbasic({ fog: false }));
  // 前面の紅い照り返し
  glowQuad(kit, '#ff2a4a', W * 1.3, CX, -D * 0.5, HZ - 20, 0.16, kit.group, D * 1.6);
}

function ofuda(b: Batch, glow: Batch, x: number, y: number, z: number, rot: number, s: number): void {
  const m = mat4(x, y, z, 0, 0, rot);
  const paper = new THREE.BoxGeometry(18 * s, 44 * s, 1.2);
  paper.translate(0, -22 * s, 0);
  b.add(paper, '#efe7d4', m);
  const mark = new THREE.BoxGeometry(3 * s, 24 * s, 1);
  mark.translate(0, -27 * s, 0.9);
  glow.add(mark, '#d0202a', m);
  const dot = new THREE.CircleGeometry(5 * s, 10);
  dot.translate(0, -10 * s, 0.9);
  glow.add(dot, '#e0303a', m);
}

/** 小さな社（奥） */
function shrineHouse(b: Batch, glow: Batch, x: number, z: number, y: number): void {
  b.box(240, 20, 150, STONE_D, x, y + 10, z);
  b.box(200, 110, 110, '#3a1620', x, y + 75, z);
  for (const sd of [-1, 1]) b.cyl(7, 7, 110, '#7a1a22', x + sd * 92, y + 75, z + 58, { seg: 8 });
  b.add(roofGeo(300, 200, 90, { th: 10, up: 20, nx: 10, nz: 6 }), '#1a0c14', mat4(x, y + 128, z));
  glow.box(120, 70, 2, (p, _n, c) => c.set(p.y > y + 80 ? '#e0602e' : '#8a1a2a'), x, y + 70, z + 56);
  // 格子
  for (let i = 0; i <= 6; i++) b.box(3, 70, 3, '#1a0a10', x - 60 + i * 20, y + 70, z + 57.5);
}

/** 石灯籠（奥、床より上だが z < -70） */
function lanternStone(b: Batch, glow: Batch, x: number, y: number, z: number): void {
  const zz = Math.min(z, -95);
  b.box(40, 10, 40, STONE_L, x, y + 5, zz);
  b.cyl(8, 10, 60, STONE_L, x, y + 40, zz, { seg: 8 });
  b.box(44, 10, 44, STONE_L, x, y + 75, zz);
  b.box(30, 28, 30, STONE, x, y + 94, zz);
  glow.box(20, 16, 2, '#ff8a4a', x, y + 94, zz + 15.5);
  b.add(roofGeo(64, 64, 26, { th: 5, up: 6, nx: 4, nz: 4, ridge: 0.2 }), STONE_L, mat4(x, y + 106, zz));
  b.ball(6, STONE_L, x, y + 136, zz);
}

// ─────────────────────────────────────────────────────────────
// 上下する石板（鎖で吊られ、霊気の光を帯びる）
// ─────────────────────────────────────────────────────────────

function slabs(kit: Kit, st: StageDef): void {
  st.platforms.forEach((p, i) => {
    const w = p.x2 - p.x1;
    const g = new THREE.Group();
    const b = new Batch(kit);
    const glow = new Batch(kit);
    const top = (q: THREE.Vector3, n: THREE.Vector3, c: THREE.Color): void => {
      c.set(n.y > 0.5 ? '#8f7a86' : q.y > -8 ? '#6a5460' : '#40303a');
    };
    b.slab(-w / 2, w / 2, 0, 16, -62, 56, top, 2.4);
    b.slab(-w / 2, w / 2, -0.8, 2.6, 56, 57.4, '#f1e2e8');
    // 下へ欠けた石の塊（奥だけ。手前のファイターを隠さない）
    const r = new Rng(31 + i);
    const n = 9;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const u = Math.abs(t - 0.5) * 2;
      const hgt = 14 + (1 - u) * 36 + r.range(-6, 6);
      b.box(w / n + 2, hgt, 44, '#3a2a34', -w / 2 + w * t, -16 - hgt / 2 + 2, -86, { rx: r.range(-0.05, 0.05) });
    }
    // 御札（奥の塊の前面）
    for (const t of [0.2, 0.5, 0.8]) ofuda(b, glow, -w / 2 + w * t, -18, -62, r.range(-0.12, 0.12), 0.9);
    // 鎖（奥の上へ）
    for (const sx of [-1, 1]) {
      const ax = sx * (w / 2 - 22);
      const links = kit.high ? 52 : 30;
      for (let k = 0; k < links; k++) {
        const y = 10 + k * 26;
        const zz = -48 - Math.min(k, 12) * 7;
        b.add(new THREE.TorusGeometry(8, 2.2, 4, 8), '#5a4e58', mat4(ax, y, zz, 0, k % 2 ? Math.PI / 2 : 0, 0));
      }
    }
    b.build(kit.vtoon(), { parent: g, receive: true, cast: true });
    glow.build(kit.vbasic({ fog: false }), { parent: g });
    // 下の霊気
    glowQuad(kit, '#d02a6a', w * 1.25, 0, -30, -40, 0.4, g, 110);
    placePlatform(kit, p, g);
  });
}

// ─────────────────────────────────────────────────────────────
// 鬼火（赤と紫の炎）
// ─────────────────────────────────────────────────────────────

function onibi(kit: Kit): void {
  const tex = canvasTex(kit, 128, 128, (g, w, h) => {
    const flame = (s: number, lean: number): void => {
      g.beginPath();
      g.moveTo(w / 2 + lean, h * (0.5 - 0.45 * s));
      g.bezierCurveTo(w * (0.5 + 0.3 * s), h * (0.5 - 0.05 * s), w * (0.5 + 0.34 * s), h * (0.5 + 0.34 * s), w / 2, h * (0.5 + 0.4 * s));
      g.bezierCurveTo(w * (0.5 - 0.34 * s), h * (0.5 + 0.34 * s), w * (0.5 - 0.3 * s), h * (0.5 - 0.05 * s), w / 2 + lean, h * (0.5 - 0.45 * s));
    };
    g.filter = 'blur(3px)';
    flame(1, 6);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fill();
    g.filter = 'blur(1.5px)';
    flame(0.68, 3);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fill();
    flame(0.36, 1);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.fill();
  });
  const list: [number, number, number, number, string][] = [
    [-760, 360, -260, 30, '#ff4a6a'],
    [-1100, 120, -520, 34, '#c05cff'],
    [820, 420, -300, 30, '#c05cff'],
    [1180, 180, -600, 36, '#ff4a6a'],
    [-420, 700, -700, 26, '#ff6a4a'],
    [460, 760, -760, 26, '#ff4a8a'],
    [-1700, 500, -1300, 44, '#ff4a6a'],
    [1800, 650, -1500, 46, '#c05cff'],
    [0, 1050, -1200, 32, '#ff4a6a'],
    [-2500, -200, -2200, 60, '#c05cff'],
    [2600, -100, -2400, 60, '#ff4a6a'],
  ];
  const use = list.slice(0, kit.high ? list.length : 6);
  const box: [number, number, number, number, number, number] = [-6000, -4000, -6000, 6000, 4000, 2000];
  pointField(kit, {
    count: use.length,
    at: use.map(([x, y, z, s, c]) => [x, y, z, s * 4.2, c]),
    box,
    map: dotTex(kit, 0.9),
    colors: ['#ff4a6a'],
    size: [1, 1],
    world: true,
    additive: true,
    twinkle: 0.35,
    twSpeed: 0.13,
    sway: 20,
    opacity: 0.45,
    edge: 0.0001,
    seed: 81,
  });
  pointField(kit, {
    count: use.length,
    at: use.map(([x, y, z, s, c]) => [x, y, z + 2, s * 2.8, c]),
    box,
    map: tex,
    colors: ['#ff4a6a'],
    size: [1, 1],
    world: true,
    additive: true,
    twinkle: 0.2,
    twSpeed: 0.25,
    sway: 20,
    edge: 0.0001,
    seed: 81,
  });
}
