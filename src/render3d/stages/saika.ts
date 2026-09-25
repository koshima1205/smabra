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
  placePlatform,
  pointField,
  ridgeLine,
  Rng,
  roofGeo,
  sheet,
  skyPlane,
  smooth,
  sparkTex,
  swayLanterns,
  TAU,
  terrain,
  tube,
} from './common';

/**
 * 雑賀の港・船上決戦: 夕焼けの港に浮かぶ大きな安宅船の甲板で戦う。
 * 足場 = 甲板（手前の縁は明るい船べり）。下は鉄砲狭間の楯板と八咫烏の紋の船腹が海へ。
 * 帆柱と帆は奥（z < -150）。帆柱の間の梁（レール）から吊られた小舟が左右に往復する。
 * 遠景は沈む夕日と照り返しの道、港町・灯明台・停泊する船・カモメ。
 */

const SEA_Y = -200;
const SUN_X = -2900;
const SUN_Y = -1850;
const SUN_Z = -9450;
const WOOD = '#8a5a36';
const WOOD_D = '#4a2c1a';
const WOOD_L = '#c89262';
const GOLD = '#e0b04a';
const RED = '#b8261c';

export function buildSaika(stage: StageDef, quality: Quality): StageInstance {
  const kit = new Kit(quality, stage);
  const rng = new Rng(0x5a1);

  sky(kit);
  sea(kit);
  coast(kit, rng);
  harbor(kit, rng);
  ships(kit, rng);
  gulls(kit);
  flagship(kit, stage);
  skiff(kit, stage);

  const sun = addLights(kit, { sky: '#9a7ad0', ground: '#e08a62', hemi: 1.7, sun: '#ffc9a0', sunI: 2.45, dir: [-0.7, 0.62, 0.62] });
  return kit.finish({
    sun,
    background: new THREE.Color('#2a2052'),
    fog: new THREE.Fog('#d98a7c', 5200, 19000),
  });
}

// ─────────────────────────────────────────────────────────────
// 空・夕日・雲
// ─────────────────────────────────────────────────────────────

function sky(kit: Kit): void {
  skyPlane(kit, [
    [-4500, '#ffcf8a'],
    [-2200, '#ffcf8a'],
    [-1500, '#ffa864'],
    [-700, '#e9785e'],
    [300, '#a84e76'],
    [1500, '#5a3576'],
    [2800, '#2c2156'],
    [4200, '#181238'],
  ]);
  // 夕日
  glowQuad(kit, '#fff6d8', 900, SUN_X, SUN_Y, SUN_Z, 1);
  glowQuad(kit, '#ffe0a0', 380, SUN_X, SUN_Y, SUN_Z + 5, 1);
  glowQuad(kit, '#ffb070', 5200, SUN_X, SUN_Y, SUN_Z - 30, 0.55);
  if (kit.high) glowQuad(kit, '#ff8a60', 22000, SUN_X + 2500, SUN_Y + 300, SUN_Z - 60, 0.3, kit.group, 7000);
  // 夕焼けの筋雲
  const tex = canvasTex(kit, 512, 256, (g) => {
    const r = new Rng(9);
    g.filter = 'blur(4px)';
    for (let k = 0; k < 4; k++) {
      const cy = 32 + k * 64;
      for (let i = 0; i < 10; i++) {
        const t = i / 9 - 0.5;
        const rx = r.range(50, 100);
        const ry = r.range(6, 14) * (1 - Math.abs(t));
        const ex = 256 + t * 360 + r.range(-20, 20);
        const ey = cy + r.range(-4, 4);
        const gr = g.createLinearGradient(0, ey - ry, 0, ey + ry);
        gr.addColorStop(0, 'rgba(120,70,130,0.75)');
        gr.addColorStop(0.6, 'rgba(255,150,120,0.85)');
        gr.addColorStop(1, 'rgba(255,200,140,0.9)');
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(ex, ey, rx, Math.max(3, ry), 0, 0, TAU);
        g.fill();
      }
    }
  });
  const b = new Batch(kit, true);
  const r = new Rng(31);
  const T = 26000;
  for (let i = 0; i < (kit.high ? 11 : 6); i++) {
    const w = r.range(2600, 5600);
    const h = w * r.range(0.07, 0.11);
    const x = (i / 11) * T + r.range(-600, 600);
    const y = r.range(-1300, 2200);
    const row = r.int(0, 3);
    for (const dx of [-T, 0]) {
      const gg = new THREE.PlaneGeometry(w, h);
      const uv = gg.getAttribute('uv');
      for (let k = 0; k < uv.count; k++) uv.setY(k, (row + uv.getY(k)) / 4);
      gg.translate(x + dx, y, -8800 + r.range(-300, 300));
      b.add(gg, y < 0 ? '#ffffff' : '#e8d0e8');
    }
  }
  const mesh = b.build(kit.basic({ map: tex, vertexColors: true, transparent: true, opacity: 0.85, fog: false, depthWrite: false }), { renderOrder: -4 });
  if (mesh) {
    kit.onUpdate((frame, camX) => {
      mesh.position.x = ((frame * 0.25) % T) + camX * 0.3 - T * 0.5;
    });
  }
  pointField(kit, {
    count: kit.high ? 120 : 50,
    box: [-12000, 900, -9700, 12000, 4200, -9600],
    map: dotTex(kit, 0.35),
    colors: ['#ffffff', '#ffe6f2'],
    size: [1.2, 2.6],
    accept: (_x, y, _z, rr) => rr.next() < smooth(900, 3200, y),
    additive: true,
    twinkle: 0.6,
    edge: 0.001,
    seed: 4,
    renderOrder: -8,
  });
}

// ─────────────────────────────────────────────────────────────
// 海（頂点で波打ち、夕日の照り返しがきらめく）
// ─────────────────────────────────────────────────────────────

const SEA_VS = /* glsl */ `
uniform float uTime;
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float d = length(p.xz - vec2(0.0, -80.0));
  float amp = 7.0 * (1.0 - smoothstep(900.0, 4200.0, d)) * smoothstep(150.0, 420.0, abs(p.z + 110.0) + max(0.0, abs(p.x) - 620.0));
  p.y += amp * (sin(p.x * 0.011 + uTime * 0.032) * 0.6 + sin(p.x * 0.019 - p.z * 0.015 + uTime * 0.047) * 0.5 + sin(p.z * 0.027 + p.x * 0.004 + uTime * 0.055) * 0.4);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const SEA_FS = /* glsl */ `
uniform float uTime;
uniform float uCamX;
uniform vec3 uNear;
uniform vec3 uMid;
uniform vec3 uFar;
uniform vec3 uSun;
uniform float uSunX;
uniform float uSunZ;
varying vec3 vW;
#include <fog_pars_fragment>
void main() {
  float dist = clamp((700.0 - vW.z) / 10200.0, 0.0, 1.0);
  vec3 col = mix(uNear, uMid, smoothstep(0.05, 0.5, dist));
  col = mix(col, uFar, smoothstep(0.45, 1.0, dist));
  // 照り返しの道: 画面上では夕日から手前へ一定の幅の柱（カメラと夕日を結ぶ線の真下）
  float dz = max(1.0, cameraPosition.z - vW.z);
  float px = cameraPosition.x + (uSunX - cameraPosition.x) * dz / (cameraPosition.z - uSunZ);
  float w = 0.055 * dz + 30.0;
  float path = exp(-pow((vW.x - px) / w, 2.0));
  float wide = exp(-pow((vW.x - px) / (w * 3.0), 2.0));
  float n1 = sin(vW.x * 0.018 + vW.z * 0.041 + uTime * 0.07);
  float n2 = sin(vW.x * 0.029 - vW.z * 0.063 - uTime * 0.09);
  float n3 = sin(vW.x * 0.006 + vW.z * 0.011 + uTime * 0.03);
  float glint = smoothstep(0.45, 1.0, n1 * n2 + 0.35 * n3);
  col += uSun * (path * (0.25 + 1.35 * glint) + wide * 0.1 * glint);
  // アニメ調の波の筋（道の外は控えめ）
  float band = sin(vW.z * 0.028 + 2.0 * sin(vW.x * 0.0025 + uTime * 0.01) - uTime * 0.035);
  float band2 = sin(vW.z * 0.012 - vW.x * 0.0017 + uTime * 0.02);
  col += vec3(0.05, 0.035, 0.06) * smoothstep(0.9, 1.0, band) * (1.0 - dist);
  col -= vec3(0.025, 0.02, 0.01) * smoothstep(0.6, 1.0, band2) * (1.0 - dist);
  float a = mix(0.64, 1.0, smoothstep(260.0, 2600.0, length(vW.xz - vec2(0.0, -110.0))));
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function seaGeo(nx: number, nz: number): THREE.BufferGeometry {
  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i <= nx; i++) {
    const u = (i / nx) * 2 - 1;
    xs.push(Math.sign(u) * Math.pow(Math.abs(u), 1.8) * 17500);
  }
  for (let j = 0; j <= nz; j++) zs.push(1700 - 11400 * Math.pow(j / nz, 1.6));
  const pos: number[] = [];
  for (const z of zs) for (const x of xs) pos.push(x, SEA_Y - 2.35e-5 * Math.pow(Math.max(0, -z - 700), 2), z);
  const idx: number[] = [];
  const cols = nx + 1;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * cols + i;
      idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function sea(kit: Kit): void {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uCamX: { value: 0 },
      uNear: { value: new THREE.Color('#2a2052') },
      uMid: { value: new THREE.Color('#6a3a78') },
      uFar: { value: new THREE.Color('#f0a070') },
      uSun: { value: new THREE.Color('#ffc98a') },
      uSunX: { value: SUN_X },
      uSunZ: { value: SUN_Z },
    },
  ]);
  const mat = kit.mat(new THREE.ShaderMaterial({ uniforms, vertexShader: SEA_VS, fragmentShader: SEA_FS, fog: true, transparent: true }));
  const m = kit.mesh(seaGeo(kit.high ? 170 : 90, kit.high ? 120 : 64), mat);
  m.name = 'sea';
  m.renderOrder = -1;
  kit.onUpdate((frame, camX) => {
    uniforms.uTime.value = frame;
    uniforms.uCamX.value = camX;
  });
  // 水の奥（透けた海の下）
  const deep = new THREE.PlaneGeometry(9000, 5200);
  deep.rotateX(-Math.PI / 2);
  deep.translate(0, -950, -900);
  kit.mesh(deep, kit.basic({ color: '#1e1238' }));
  // 照り返しのきらめき
  pointField(kit, {
    count: kit.high ? 140 : 60,
    box: [-6000, SEA_Y - 2000, -9200, 3000, SEA_Y + 10, -700],
    map: sparkTex(kit),
    colors: ['#fff2c8', '#ffd8a0'],
    size: [3, 7],
    accept: (x, _y, z, r) => Math.abs(x - lerp(0, SUN_X, Math.pow((700 - z) / 10200, 0.6))) < lerp(700, 180, (700 - z) / 10200) * r.range(0.3, 1.2),
    additive: true,
    twinkle: 1,
    twSpeed: 0.12,
    edge: 0.001,
    seed: 77,
    renderOrder: 1,
  });
}

/** 点の y を海面の高さに合わせる（遠いほど下がる） */
function seaY(z: number): number {
  return SEA_Y - 2.35e-5 * Math.pow(Math.max(0, -z - 700), 2);
}

// ─────────────────────────────────────────────────────────────
// 遠景: 岬の山・港町・灯明台・船・カモメ
// ─────────────────────────────────────────────────────────────

function coast(kit: Kit, rng: Rng): void {
  const b = new Batch(kit);
  const left = ridgeLine(rng, -15000, -3200, 9, 500, 1500, 900, 2400, 70);
  const right = ridgeLine(rng, 1200, 15000, 10, 500, 1700, 900, 2600, 80);
  const nx = kit.high ? 160 : 70;
  const zF = -8900;
  const yF = seaY(zF) - 40;
  b.add(terrain(-15000, -2400, zF - 500, zF + 500, nx, 4, yF, (x, z) => left(x) * smooth(zF + 500, zF, z) * smooth(-2400, -3600, x)), '#5b3766');
  b.add(terrain(900, 15000, zF - 500, zF + 500, nx, 4, yF, (x, z) => right(x) * smooth(zF + 500, zF, z) * smooth(900, 2200, x)), '#56345f');
  // 港の丘（右手前）
  const hill = ridgeLine(rng, 1500, 15000, 8, 300, 900, 700, 1800, 50);
  const zH = -4200;
  b.add(terrain(1400, 15000, zH - 900, zH + 500, kit.high ? 120 : 60, 6, seaY(zH) - 60, (x, z) => hill(x) * smooth(zH + 300, zH - 600, z) * smooth(1400, 2600, x)), '#3e2a4c');
  const rim = new THREE.Color('#ffb08a');
  b.build(kit.vtoon(), {
    shade: (p, n, c) => {
      c.lerp(rim, smooth(0.3, 0.8, -n.x * 0.7 + n.y * 0.3) * 0.35);
      c.lerp(new THREE.Color('#b0607a'), 0.15 + 0.35 * smooth(-4000, -9000, p.z));
    },
  });
}

function kura(b: Batch, win: Batch | null, x: number, y: number, z: number, w: number, h: number, d: number): void {
  b.box(w, h, d, '#e4d4c4', x, y + h / 2, z);
  b.box(w + 2, h * 0.28, d + 2, '#3a2a36', x, y + h * 0.14, z);
  b.add(roofGeo(w * 1.2, d * 1.35, h * 0.45, { th: 5, up: 4, nx: 6, nz: 4, ridge: 3 }), '#2a2034', mat4(x, y + h - 4, z));
  if (win) win.box(w * 0.18, h * 0.22, 2, '#ffb060', x, y + h * 0.62, z + d / 2 + 1);
}

function harbor(kit: Kit, rng: Rng): void {
  const b = new Batch(kit);
  const win = new Batch(kit);
  const zS = -3800;
  const yS = seaY(zS);
  // 岸壁（石垣）と町
  b.box(9000, 70, 700, '#4a3a4e', 6300, yS - 10, zS - 150);
  const n = kit.high ? 34 : 16;
  const lamps: [number, number, number, number?, string?][] = [];
  for (let i = 0; i < n; i++) {
    const x = 2000 + i * rng.range(150, 260);
    const z = zS - rng.range(0, 420);
    const w = rng.range(90, 170);
    const h = rng.range(70, 120);
    kura(b, rng.next() < 0.6 ? win : null, x, yS + 25, z, w, h, rng.range(80, 120));
    if (rng.next() < 0.5) lamps.push([x + rng.range(-40, 40), yS + 60, z + 70, rng.range(50, 80), '#ff9a4a']);
  }
  // 桟橋と杭
  for (let k = 0; k < 3; k++) {
    const px = 2300 + k * 900;
    b.box(60, 10, 800, WOOD_D, px, yS + 22, zS + 600);
    for (let j = 0; j < 6; j++) b.cyl(7, 7, 90, '#2a1a20', px + (j % 2 ? 26 : -26), yS - 20, zS + 250 + j * 140, { seg: 6 });
    lamps.push([px, yS + 70, zS + 980, 70, '#ffb060']);
  }
  // 物見櫓
  const tx = 2250;
  const tz = zS + 120;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(7, 9, 380, '#2a1a20', tx + sx * 50, yS + 215, tz + sz * 50, { seg: 6 });
  b.box(140, 60, 140, '#3a2830', tx, yS + 420, tz);
  b.add(roofGeo(200, 200, 60, { th: 8, up: 10, nx: 6, nz: 6, ridge: 0.3 }), '#2a2034', mat4(tx, yS + 446, tz));
  lamps.push([tx, yS + 420, tz + 75, 110, '#ffb060']);

  // 灯明台（左の岬）
  const lx = -3600;
  const lz = -5200;
  const ly = seaY(lz);
  const rock = new THREE.DodecahedronGeometry(520, 1);
  rock.scale(1.4, 0.7, 1);
  b.add(rock, '#3a2a40', mat4(lx, ly - 60, lz));
  b.add(new THREE.CylinderGeometry(70, 110, 420, 8), '#6a5a6a', mat4(lx, ly + 360, lz));
  b.box(150, 110, 150, '#3a2830', lx, ly + 625, lz);
  win.box(90, 60, 2, '#ffe6a0', lx, ly + 625, lz + 76);
  b.add(roofGeo(230, 230, 80, { th: 8, up: 14, nx: 6, nz: 6, ridge: 0.2 }), '#2a2034', mat4(lx, ly + 672, lz));
  // 岬の松
  for (let k = 0; k < 4; k++) {
    const px = lx + rng.range(-500, 500);
    const py = ly + 120;
    b.cyl(12, 18, 260, '#2a1a22', px, py + 130, lz + rng.range(-150, 150), { seg: 5 });
    b.ball(rng.range(110, 160), '#2a3040', px + rng.range(-40, 40), py + 280, lz, { sy: 0.45 });
  }

  b.build(kit.vtoon(), { shade: haze('#b86a7a', 2500, 7000, 0.55) });
  win.build(kit.vbasic({ fog: false }));
  pointField(kit, {
    count: lamps.length,
    at: lamps,
    box: [-16000, -6000, -12000, 16000, 6000, 4000],
    map: dotTex(kit, 0.6),
    colors: ['#ff9a4a'],
    size: [1, 1],
    world: true,
    additive: true,
    twinkle: 0.3,
    twSpeed: 0.08,
    edge: 0.0001,
    seed: 2,
  });
  // 灯明台の大きな光輪
  glowQuad(kit, '#ffd08a', 1400, lx, ly + 625, lz + 90, 0.55);
}

/** 停泊・航行する船（和船: 船体・屋形・帆柱・四角い帆） */
function junk(b: Batch, s: number, sail: string): void {
  b.add(
    sheet(12, 4, (u, v, o) => {
      const x = (u - 0.5) * 360 * s;
      const end = Math.pow(Math.abs(u - 0.5) * 2, 3);
      const zz = (v - 0.5) * 2;
      return o.set(x, -70 * s * (1 - zz * zz) * (1 - end * 0.6) + 40 * s * end, zz * 60 * s * (1 - end * 0.85));
    }, 8 * s),
    WOOD_D,
  );
  b.box(300 * s, 14 * s, 110 * s, WOOD, 0, 4 * s, 0);
  b.box(110 * s, 50 * s, 80 * s, '#3a2830', -60 * s, 34 * s, 0);
  b.cyl(5 * s, 6 * s, 380 * s, '#2a1a20', 30 * s, 190 * s, 0, { seg: 6 });
  b.add(
    sheet(6, 6, (u, v, o) => o.set(30 * s + (u - 0.5) * 210 * s, 120 * s + v * 230 * s, 12 * s + Math.sin(u * Math.PI) * 18 * s), 3 * s, new THREE.Vector3(0, 0, -1)),
    sail,
  );
  b.box(60 * s, 22 * s, 2 * s, RED, 30 * s, 395 * s, 0);
}

function ships(kit: Kit, rng: Rng): void {
  const list: [number, number, number, string][] = [
    [-1700, -2800, 1.35, '#f0c49a'],
    [2400, -6400, 1.6, '#f4d2b0'],
    [-4600, -7200, 1.5, '#e8b8a0'],
    [900, -8200, 1.7, '#f0c8a8'],
  ];
  const use = list.slice(0, kit.high ? list.length : 2);
  const groups: { g: THREE.Group; y: number; ph: number }[] = [];
  use.forEach(([x, z, s, sail], i) => {
    const g = new THREE.Group();
    const y = seaY(z) + 30 * s;
    g.position.set(x, y, z);
    g.rotation.y = rng.range(-0.35, 0.35);
    const b = new Batch(kit);
    junk(b, s, sail);
    b.build(kit.vtoon(), { parent: g, shade: haze('#c07878', 2000, 8500, 0.55) });
    kit.group.add(g);
    groups.push({ g, y, ph: i * 1.9 });
  });
  kit.onUpdate((frame) => {
    for (const s of groups) {
      s.g.position.y = s.y + Math.sin(frame * 0.03 + s.ph) * 6;
      s.g.rotation.z = Math.sin(frame * 0.024 + s.ph) * 0.02;
    }
  });
}

function gulls(kit: Kit): void {
  const g = new THREE.BufferGeometry();
  // 翼（くの字）
  const v = [-22, 4, 0, -9, 0, 3, 0, -2, 0, 0, -2, 0, 9, 0, 3, 22, 4, 0, -9, 0, 3, 0, 2, 0, 9, 0, 3];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 1, 2, 3, 4, 5, 1, 6, 2, 7, 3, 8, 6, 7, 2, 7, 8, 3]);
  g.computeVertexNormals();
  const n = kit.high ? 7 : 3;
  const mat = kit.basic({ color: '#3a2240', side: THREE.DoubleSide });
  const birds = instanced(kit, g, mat, n, (_i, o) => o.position.set(0, -9999, 0));
  birds.frustumCulled = false;
  const o = new THREE.Object3D();
  kit.onUpdate((frame) => {
    for (let i = 0; i < n; i++) {
      const a = frame * (0.0035 + i * 0.0004) + i * 1.9;
      const rx = 900 + i * 260;
      o.position.set(Math.cos(a) * rx + (i % 2 ? 500 : -300), 650 + i * 70 + Math.sin(frame * 0.02 + i) * 40, -900 - i * 260 + Math.sin(a) * 300);
      o.rotation.set(0, 0, Math.sin(a) * 0.2);
      const flap = Math.sin(frame * 0.16 + i * 1.7);
      o.scale.set(3.2, 3.2 * (0.4 + 0.6 * flap), 3.2);
      o.updateMatrix();
      birds.setMatrixAt(i, o.matrix);
    }
    birds.instanceMatrix.needsUpdate = true;
  });
}

// ─────────────────────────────────────────────────────────────
// 旗艦（メイン足場）
// ─────────────────────────────────────────────────────────────

/** 甲板の板目（長手方向） */
function paintDeck(g: CanvasRenderingContext2D, w: number, h: number): void {
  const r = new Rng(12);
  g.fillStyle = '#9c6a42';
  g.fillRect(0, 0, w, h);
  const rows = 18;
  const rh = h / rows;
  for (let j = 0; j < rows; j++) {
    let x = -r.range(0, 200);
    while (x < w) {
      const len = r.range(240, 420);
      const v = r.range(-14, 12);
      g.fillStyle = `rgb(${196 + v},${146 + v},${98 + v})`;
      g.fillRect(x + 1, j * rh + 1.5, len - 2, rh - 3);
      g.fillStyle = 'rgba(120,70,40,0.25)';
      for (let k = 0; k < 3; k++) g.fillRect(x + r.range(10, len - 30), j * rh + r.range(4, rh - 6), r.range(20, 60), 1.2);
      g.fillStyle = 'rgba(40,22,12,0.7)';
      g.fillRect(x + 6, j * rh + rh / 2 - 1.5, 3, 3);
      g.fillRect(x + len - 9, j * rh + rh / 2 - 1.5, 3, 3);
      x += len;
    }
    g.fillStyle = 'rgba(40,22,12,0.75)';
    g.fillRect(0, j * rh, w, 1.5);
  }
}

/** 八咫烏の紋 */
function crow(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.fillStyle = '#1a120c';
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.strokeStyle = '#e0b04a';
  g.lineWidth = r * 0.12;
  g.stroke();
  g.fillStyle = '#e0b04a';
  g.beginPath();
  g.ellipse(x, y + r * 0.05, r * 0.2, r * 0.32, 0, 0, TAU);
  g.moveTo(x, y - r * 0.08);
  g.lineTo(x - r * 0.74, y - r * 0.36);
  g.lineTo(x - r * 0.46, y + r * 0.06);
  g.closePath();
  g.moveTo(x, y - r * 0.08);
  g.lineTo(x + r * 0.74, y - r * 0.36);
  g.lineTo(x + r * 0.46, y + r * 0.06);
  g.closePath();
  g.moveTo(x + r * 0.15, y - r * 0.42);
  g.arc(x, y - r * 0.42, r * 0.15, 0, TAU);
  g.fill();
  g.lineWidth = r * 0.07;
  g.beginPath();
  for (const dx of [-0.12, 0, 0.12]) {
    g.moveTo(x + dx * r, y + r * 0.3);
    g.lineTo(x + dx * r * 1.8, y + r * 0.62);
  }
  g.stroke();
}

/** 船腹: 上に鉄砲狭間の楯板、下は板張り・喫水線 */
function paintHull(g: CanvasRenderingContext2D, w: number, h: number): void {
  const r = new Rng(21);
  const shieldB = h * 0.17;
  // 板張り
  g.fillStyle = '#6a4028';
  g.fillRect(0, 0, w, h);
  const strake = h / 22;
  for (let j = 0; j < 22; j++) {
    const y = j * strake;
    const v = r.range(-10, 8);
    g.fillStyle = `rgb(${118 + v},${74 + v},${46 + v})`;
    g.fillRect(0, y + 1, w, strake - 2);
    g.fillStyle = 'rgba(30,16,10,0.6)';
    g.fillRect(0, y, w, 1.5);
  }
  // 鉄の帯と鋲
  for (let x = 60; x < w; x += 180) {
    g.fillStyle = 'rgba(40,30,34,0.85)';
    g.fillRect(x, shieldB, 10, h * 0.6);
    g.fillStyle = 'rgba(255,210,160,0.5)';
    for (let y = shieldB + 12; y < shieldB + h * 0.6; y += 22) g.fillRect(x + 3, y, 3, 3);
  }
  // 喫水線より下（濡れて暗い）
  const wl = h * 0.8;
  let gr = g.createLinearGradient(0, wl, 0, h);
  gr.addColorStop(0, 'rgba(20,30,40,0.55)');
  gr.addColorStop(1, 'rgba(10,20,30,0.85)');
  g.fillStyle = gr;
  g.fillRect(0, wl, w, h - wl);
  g.fillStyle = '#b8261c';
  g.fillRect(0, wl - 6, w, 7);
  // 楯板（黒漆）と鉄砲狭間
  gr = g.createLinearGradient(0, 0, 0, shieldB);
  gr.addColorStop(0, '#3a2018');
  gr.addColorStop(1, '#22120e');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, shieldB);
  const pw = 64;
  for (let x = 0; x < w; x += pw) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(x, 0, 2, shieldB);
    g.fillStyle = '#0a0606';
    g.fillRect(x + pw / 2 - 7, shieldB * 0.36, 14, shieldB * 0.34);
    g.fillStyle = 'rgba(255,180,120,0.25)';
    g.fillRect(x + pw / 2 - 7, shieldB * 0.36, 14, 2);
  }
  g.fillStyle = GOLD;
  g.fillRect(0, 0, w, 4);
  g.fillRect(0, shieldB - 4, w, 4);
  // 中央の紋
  g.fillStyle = '#22120e';
  g.fillRect(w / 2 - shieldB * 0.7, 2, shieldB * 1.4, shieldB - 4);
  crow(g, w / 2, shieldB / 2, shieldB * 0.42);
}

function flagship(kit: Kit, st: StageDef): void {
  const { x1: X1, x2: X2, depth: D } = st.main;
  const W = X2 - X1;
  const CX = (X1 + X2) / 2;
  const HZ = D / 2;
  const ZB = -340;
  const hi = kit.high;
  const b = new Batch(kit);

  // 甲板（テクスチャ）: 手前の半分が戦う場所、奥へも続く
  const deckTex = canvasTex(kit, 2048, 768, paintDeck);
  deckTex.anisotropy = 8;
  const dz0 = ZB + 14;
  const dz1 = HZ - 8;
  const dg = new THREE.PlaneGeometry(W, dz1 - dz0);
  dg.rotateX(-Math.PI / 2);
  dg.translate(CX, 0, (dz0 + dz1) / 2);
  const deck = kit.mesh(dg, kit.toon('#ffffff', { map: deckTex }));
  deck.receiveShadow = true;
  deck.name = 'deck';
  b.slab(X1, X2, -0.6, 20, ZB, HZ - 8, WOOD, 2.4);
  // 手前の船べり（床と同じ高さ・明るい縁）
  b.slab(X1, X2, 0, 9, HZ - 8, HZ + 6, WOOD_L, 2.2);
  b.slab(X1, X2, -1.2, 2.4, HZ + 6, HZ + 7.4, '#ffdcaa');

  // 船腹（テクスチャ付きの板）
  // 平底の和船: 船腹は衝突箱の底（-depth）までで、その下は平らな船底（床下のファイターを隠さない）
  const BOT = -D - 8;
  const prof = new THREE.SplineCurve([
    new THREE.Vector2(HZ + 6, -9),
    new THREE.Vector2(HZ + 16, -60),
    new THREE.Vector2(HZ + 19, -120),
    new THREE.Vector2(HZ + 13, -175),
    new THREE.Vector2(HZ + 2, -216),
    new THREE.Vector2(HZ - 14, BOT + 2),
  ]);
  const hullTex = canvasTex(kit, 2048, 512, paintHull);
  hullTex.anisotropy = 8;
  const pv = new THREE.Vector2();
  const hullG = sheet(hi ? 48 : 24, 16, (u, v, o) => {
    prof.getPoint(v, pv);
    return o.set(X1 + u * W, pv.y, pv.x);
  }, 14, new THREE.Vector3(0, 0, -1));
  kit.mesh(hullG, kit.toon('#ffffff', { map: hullTex })).name = 'hull';
  // 船首・船尾の板（断面を押し出す）: 崖の角
  const end = new THREE.Shape();
  end.moveTo(ZB, 0);
  end.lineTo(HZ + 6, 0);
  for (let k = 0; k <= 16; k++) {
    prof.getPoint(k / 16, pv);
    end.lineTo(pv.x + 1, pv.y);
  }
  end.lineTo(ZB + 30, BOT);
  end.lineTo(ZB, BOT + 30);
  end.closePath();
  // 船底（平ら）
  b.slab(X1 + 4, X2 - 4, BOT + 4, 6, ZB + 20, HZ - 12, '#20181c');
  for (const ex of [X1, X2 - 16]) {
    b.add(extrude(end, 16), (q, _n, c) => c.set(q.y < SEA_Y - 4 ? '#2a2024' : '#5a3622'), mat4(ex + 8, 0, 0, 0, -Math.PI / 2, 0), 2.2);
    // 鉄の角金物
    b.box(18, 10, HZ - ZB + 16, '#2a2024', ex + 8, -5, (HZ + ZB) / 2 + 6);
    for (const t of [0.22, 0.52, 0.8]) {
      prof.getPoint(t, pv);
      b.box(18, 12, 30, GOLD, ex + 8, pv.y, pv.x - 12);
    }
  }
  // 奥の舷墻（z < -150）と積み荷
  b.slab(X1, X2, 44, 44, ZB - 14, ZB, WOOD_D, 2);
  b.slab(X1, X2, 50, 6, ZB - 18, ZB + 4, WOOD_L);
  const cr = new Rng(8);
  const cargo = (x: number, z: number): void => {
    if (cr.next() < 0.5) {
      b.box(56, 48, 56, '#7a5030', x, 24, z, { ry: cr.range(-0.3, 0.3), ol: 1.6 });
      b.box(58, 6, 58, WOOD_D, x, 36, z, { ry: 0 });
    } else {
      b.cyl(22, 24, 52, '#8a5a36', x, 26, z, { seg: 12, ol: 1.6 });
      b.cyl(23, 23, 5, '#3a2a24', x, 40, z, { seg: 12 });
      b.cyl(25, 25, 5, '#3a2a24', x, 12, z, { seg: 12 });
    }
  };
  for (const [x, z] of [
    [-470, -250],
    [-420, -280],
    [-180, -270],
    [60, -290],
    [410, -260],
    [470, -300],
  ] as [number, number][]) cargo(x, z);
  // 大筒（奥）
  b.cyl(14, 18, 110, '#2a2226', -300, 34, -300, { rx: Math.PI / 2 - 0.25, seg: 10, ol: 1.6 });
  b.box(50, 26, 70, WOOD_D, -300, 13, -300);

  // 帆柱・帆・梁（小舟のレール）: すべて奥
  const MZ = -236;
  const railY = 620;
  const masts: [number, number, number, number][] = [
    [300, 1450, 0.8, 16],
    [-400, 1200, 0.62, 13],
  ];
  const sails = new Batch(kit);
  for (const [mx, top, s, r] of masts) {
    b.cyl(r, r * 1.2, top, '#5a3a26', mx, top / 2, MZ, { seg: 10, ol: 1.8 });
    b.cyl(r * 2.2, r * 2.4, 40, WOOD_D, mx, 20, MZ, { seg: 10 });
    const sw = 720 * s;
    const sy1 = top - 90;
    const sy0 = Math.max(railY + 60, sy1 - 560 * s);
    b.cyl(8, 8, sw + 60, WOOD_D, mx, sy1 + 8, MZ + 18, { rz: Math.PI / 2, seg: 6, ol: 1.4 });
    sails.add(
      sheet(10, 8, (u, v, o) => {
        const x = mx + (u - 0.5) * sw;
        const y = lerp(sy1, sy0, v);
        return o.set(x, y, MZ + 26 + Math.sin(u * Math.PI) * (30 + 40 * Math.sin(v * Math.PI)));
      }, 4, new THREE.Vector3(0, 0, -1)),
      '#ecd2b6',
    );
    // 帆の横木
    for (let k = 1; k <= 4; k++) {
      const v = k / 5;
      b.cyl(3.5, 3.5, sw * 0.98, '#6a4a3a', mx, lerp(sy1, sy0, v), MZ + 26 + 30 + 40 * Math.sin(v * Math.PI) + 3, { rz: Math.PI / 2, seg: 5 });
    }
    b.cyl(9, 9, sw + 40, WOOD_D, mx, sy0 - 4, MZ + 30, { rz: Math.PI / 2, seg: 6 });
  }
  // レール（梁）
  b.box(1260, 20, 26, WOOD_D, 0, railY, MZ + 40, { ol: 1.8 });
  b.box(1260, 5, 28, '#8a6a4a', 0, railY + 12, MZ + 40);
  for (const ex of [-625, 625]) b.box(24, 60, 30, WOOD_D, ex, railY - 20, MZ + 40, { ol: 1.4 });
  // 帆柱と梁の索具
  for (const [mx, top] of masts) {
    for (const sx of [-1, 1]) {
      const p0 = new THREE.Vector3(mx, top - 60, MZ);
      const p1 = new THREE.Vector3(mx + sx * 560, 50, ZB - 6);
      b.add(tube([p0, p0.clone().lerp(p1, 0.5).add(new THREE.Vector3(0, -20, 0)), p1], () => 1.3, 4, 8, false), '#3a2a24');
    }
  }
  b.build(kit.vtoon(), { receive: true, name: 'ship' });
  sails.build(kit.vtoon({ side: THREE.DoubleSide }), { name: 'sails' });

  // 幟（奥の角でたなびく）
  flags(kit, [
    [X1 + 40, ZB - 8, 400],
    [X2 - 40, ZB - 8, 440],
  ]);

  // 船腹の提灯
  swayLanterns(kit, [-440, -170, 170, 440].map((x) => new THREE.Vector3(x, -10, HZ + 26)), { drop: 16 });
  // 喫水線の白波
  const foamTex = canvasTex(
    kit,
    256,
    64,
    (g, w, h) => {
      const r = new Rng(5);
      for (let i = 0; i < 60; i++) {
        g.fillStyle = `rgba(255,240,230,${r.range(0.3, 0.8)})`;
        const x = r.range(0, w);
        const y = r.range(0, h);
        g.fillRect(x, y, r.range(10, 50), r.range(1.5, 3.5));
        g.fillRect(x - w, y, 50, 3);
      }
    },
    { repeat: true },
  );
  foamTex.repeat.set(8, 1);
  const fg = new THREE.PlaneGeometry(W + 80, 110);
  fg.rotateX(-Math.PI / 2);
  fg.translate(CX, SEA_Y + 3, HZ + 20);
  const foam = kit.mesh(fg, kit.basic({ map: foamTex, transparent: true, opacity: 0.8, depthWrite: false }));
  foam.renderOrder = 1;
  kit.onUpdate((frame) => {
    foamTex.offset.x = (frame * 0.0012) % 1;
    foamTex.offset.y = Math.sin(frame * 0.02) * 0.04;
  });
}


/** たなびく幟（頂点を毎フレーム動かす） */
function flags(kit: Kit, list: [number, number, number][]): void {
  const tex = canvasTex(kit, 128, 512, (g, w, h) => {
    g.fillStyle = '#b8261c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4e8d8';
    g.fillRect(0, 0, w, 40);
    crow(g, w / 2, 150, 44);
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.fillRect(0, h - 30, w, 30);
  });
  const mat = kit.toon('#ffffff', { map: tex, side: THREE.DoubleSide });
  const poles = new Batch(kit);
  const cloths: { geo: THREE.BufferGeometry; base: Float32Array; ph: number }[] = [];
  list.forEach(([x, z, h], i) => {
    poles.cyl(4, 5, h, '#3a2a24', x, h / 2, z, { seg: 6 });
    poles.cyl(2.5, 2.5, 70, '#3a2a24', x + 35, h - 8, z, { rz: Math.PI / 2, seg: 5 });
    const g = new THREE.PlaneGeometry(70, 230, 6, 10);
    g.translate(x + 35, h - 8 - 115, z);
    const m = kit.mesh(g, mat);
    m.castShadow = false;
    const base = Float32Array.from(g.getAttribute('position').array as Float32Array);
    cloths.push({ geo: g, base, ph: i * 2.3 });
  });
  poles.build(kit.vtoon());
  kit.onUpdate((frame) => {
    for (const c of cloths) {
      const p = c.geo.getAttribute('position') as THREE.BufferAttribute;
      const a = p.array as Float32Array;
      for (let k = 0; k < p.count; k++) {
        const bx = c.base[k * 3];
        const by = c.base[k * 3 + 1];
        const x0 = c.base[0];
        const u = Math.max(0, bx - x0) / 70;
        a[k * 3 + 2] = c.base[k * 3 + 2] + Math.sin(frame * 0.09 + by * 0.02 + u * 3 + c.ph) * 10 * u;
        a[k * 3] = bx - u * u * 6 * (1 + Math.sin(frame * 0.05 + c.ph));
      }
      p.needsUpdate = true;
      c.geo.computeVertexNormals();
    }
  });
}

// ─────────────────────────────────────────────────────────────
// 小舟（往復するすり抜け床）と吊り綱・滑車
// ─────────────────────────────────────────────────────────────

function skiff(kit: Kit, st: StageDef): void {
  const p = st.platforms[0];
  if (!p) return;
  const w = p.x2 - p.x1;
  const hw = w / 2;
  const L = hw + 36;
  const g = new THREE.Group();
  const b = new Batch(kit);
  const hi = kit.high;
  // 船体: 上は床と同じ高さの甲板、下は浅い船底。舳先と艫は外で反り上がる
  const halfW = (x: number): number => 54 * Math.sqrt(Math.max(0.0025, 1 - Math.pow(Math.abs(x) / L, 3)));
  const rise = (x: number): number => 18 * smooth(hw - 6, L, Math.abs(x));
  const depthAt = (x: number): number => 20 * (1 - Math.pow(Math.abs(x) / L, 2)) + 2;
  const hull = sheet(hi ? 24 : 14, 10, (u, v, o) => {
    const x = (u - 0.5) * 2 * L;
    const th = v * Math.PI;
    return o.set(x, rise(x) - Math.sin(th) * depthAt(x), Math.cos(th) * halfW(x));
  }, 3, new THREE.Vector3(0, 1, 0));
  b.add(hull, (q, _n, c) => c.set(q.y < -10 ? '#5a3a24' : '#8a5a36'), null, 2);
  // 甲板（上面）: 床の範囲は平ら
  b.slab(-hw, hw, 0, 7, -50, 50, (_q, n, c) => c.set(n.y > 0.5 ? '#c99a6a' : '#7a4e2e'), 1.6);
  b.slab(-hw, hw, -0.6, 2.4, 50, 53, '#ffdcaa');
  for (let k = -2; k <= 2; k++) b.box(8, 2, 100, '#9a6a44', k * 55, -1.4, 0);
  // 紋
  const monTex = canvasTex(kit, 128, 128, (gg) => crow(gg, 64, 64, 56));
  const mg = new THREE.CircleGeometry(15, 20);
  mg.translate(0, -12, halfW(0) + 1.5);
  kit.mesh(mg, kit.toon('#ffffff', { map: monTex }), g);
  // 艫の旗（奥の角）
  b.cyl(2.5, 3, 110, '#3a2a24', -hw + 6, 55, -46, { seg: 5 });
  const flagG = new THREE.PlaneGeometry(44, 34, 4, 2);
  flagG.translate(-hw + 6 - 22, 92, -46);
  const flagMat = kit.toon(RED, { side: THREE.DoubleSide });
  const flag = kit.mesh(flagG, flagMat, g);
  const flagBase = Float32Array.from(flagG.getAttribute('position').array as Float32Array);
  // 吊り綱と滑車（奥のレールへ）
  const railY = 620 - -p.y;
  const RZ = -236 + 40 - 20;
  const trolleyY = railY - 30;
  b.box(90, 26, 34, WOOD_D, 0, trolleyY, RZ, { ol: 1.6 });
  for (const sx of [-1, 1]) {
    b.add(new THREE.TorusGeometry(10, 3, 5, 12), '#3a2a24', mat4(sx * 30, trolleyY - 16, RZ + 18));
    const a = new THREE.Vector3(sx * (hw - 10), 6, -46);
    const c = new THREE.Vector3(sx * 30, trolleyY - 24, RZ + 18);
    b.add(tube([a, a.clone().lerp(c, 0.5), c], () => 2.2, 5, 4, false), '#c8a870');
    b.ball(5, '#3a2a24', a.x, a.y, a.z);
  }
  b.build(kit.vtoon(), { parent: g, receive: true, cast: true, name: 'skiff' });
  placePlatform(kit, p, g, (_x, _y, frame) => {
    const pa = flagG.getAttribute('position') as THREE.BufferAttribute;
    const arr = pa.array as Float32Array;
    const x0 = -hw + 6;
    for (let k = 0; k < pa.count; k++) {
      const bx = flagBase[k * 3];
      const u = (x0 - bx) / 44;
      arr[k * 3 + 2] = flagBase[k * 3 + 2] + Math.sin(frame * 0.14 + u * 4) * 5 * u;
      arr[k * 3 + 1] = flagBase[k * 3 + 1] + Math.sin(frame * 0.1 + u * 3) * 2 * u;
    }
    pa.needsUpdate = true;
  });
  flag.frustumCulled = false;
}
