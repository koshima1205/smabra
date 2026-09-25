/**
 * CNP モデルの確認ページ（npx vite → /dev/models.html）。
 * ?pose=idle|walk|run|jump|fall|spin|jab|ftilt|kick|fsmash|usmash|dsmash|utilt|fair|bair|dair|hurt|tumble|down|crouch|shield|roll|ledge|all|cycle
 * ?id=<id> で 1 体のアップ（pose=all なら全ポーズ）、?ids=a,b で数体だけ、?variant=1〜3 で色違い、?q=low、?t=<F> で時間を止める、
 * ?face=left で左向き、?yaw=0.36 で振り向き、?light=night で暗いステージ、?expr=blink などで表情を固定、
 * ?tips=1 で攻撃の先端（tip）に赤い点、?noscarf=1 でマフラーを描かない、?flash=0.85・?alpha=0.5 で被弾・無敵の見た目、
 * ?thumbs=1 で描画側のアイコン（顔・上半身・全身）をこのモデルで作って並べる。
 */
import * as THREE from 'three';
import { buildCharacter, CNP_MODEL_IDS } from '../src/render3d/characters';
import { Ribbon3D } from '../src/render3d/ribbon';
import { characterThumb, initSnapshots, type ThumbMode } from '../src/render3d/snapshots';
import type { CharacterModel, CnpId, ModelPose } from '../src/render3d/types';
import { createRenderer, syncCamera } from '../src/render3d/view';

type Expr = ModelPose['expression'];
interface Raw {
  y?: number;
  torso?: number;
  head?: number;
  fsh?: number;
  fel?: number;
  bsh?: number;
  bel?: number;
  fhip?: number;
  fkn?: number;
  bhip?: number;
  bkn?: number;
  spin?: number;
  squash?: number;
}
interface Sample {
  raw: Raw;
  air?: boolean;
  run?: number;
  expr?: Expr;
}

// 2D 版（src/render/rig.ts）の数値をそのまま写したもの
const BASE: Required<Raw> = { y: 0, torso: 0.05, head: 0, fsh: 0.5, fel: 1.3, bsh: 0.15, bel: 1.0, fhip: 0.14, fkn: 0.2, bhip: -0.12, bkn: 0.15, spin: 0, squash: 1 };
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

const RUN = (ph: number): Raw => ({
  torso: 0.38,
  fhip: Math.sin(ph) * 0.95 + 0.15,
  fkn: 0.5 + Math.max(0, -Math.cos(ph)) * 1.4,
  bhip: -Math.sin(ph) * 0.95 + 0.15,
  bkn: 0.5 + Math.max(0, Math.cos(ph)) * 1.4,
  fsh: -Math.sin(ph) * 1.0,
  fel: 1.5,
  bsh: Math.sin(ph) * 1.0,
  bel: 1.5,
  y: -Math.abs(Math.cos(ph)) * 4 + 2,
  head: -0.2,
});
const WALK = (ph: number): Raw => ({
  torso: 0.08,
  fhip: Math.sin(ph) * 0.55,
  fkn: 0.15 + Math.max(0, -Math.cos(ph)) * 0.7,
  bhip: -Math.sin(ph) * 0.55,
  bkn: 0.15 + Math.max(0, Math.cos(ph)) * 0.7,
  fsh: -Math.sin(ph) * 0.5,
  fel: 0.6,
  bsh: Math.sin(ph) * 0.5,
  bel: 0.6,
  y: -Math.abs(Math.cos(ph)) * 2,
});

const POSES: Record<string, (t: number) => Sample> = {
  idle: (t) => {
    const b = Math.sin(t * 0.07) * 0.03;
    return { raw: { torso: 0.08 + b, y: b * 30, fsh: 0.65, fel: 1.5, bsh: 0.25, bel: 1.2 } };
  },
  walk: (t) => ({ raw: WALK(t * 0.16), run: 0.4 }),
  run: (t) => ({ raw: RUN(t * 0.24), run: 1 }),
  jump: () => ({ raw: { fhip: 0.9, fkn: 1.5, bhip: -0.2, bkn: 0.7, fsh: 1.0, fel: 1.0, bsh: -0.5, torso: 0.05 }, air: true }),
  fall: () => ({ raw: { fhip: 0.35, fkn: 0.35, bhip: -0.3, bkn: 0.7, fsh: 1.2, fel: 0.6, bsh: -0.7, bel: 0.6, torso: 0.05 }, air: true }),
  spin: (t) => ({ raw: { spin: -Math.PI * 2 * ease((t % 40) / 16), fhip: 1.3, fkn: 1.9, bhip: 1.1, bkn: 1.9, fsh: 1.2, bsh: 1.1, fel: 1.8, bel: 1.8 }, air: true }),
  jab: () => ({ raw: { fsh: 1.55, fel: 0.08, torso: 0.18, bsh: -0.3 }, expr: 'attack' }),
  ftilt: () => ({ raw: { fsh: 1.55, fel: 0.1, torso: 0.3, fhip: 0.6, bhip: -0.5 }, expr: 'attack' }),
  kick: () => ({ raw: { fhip: 1.45, fkn: 0.05, torso: -0.25, fsh: -0.4, bsh: 0.8 }, expr: 'attack' }),
  fsmash: () => ({ raw: { torso: 0.55, fsh: 1.75, fel: 0.02, bsh: -0.8, fhip: 0.85, fkn: 0.25, bhip: -0.8, bkn: 0.3, y: 6 }, expr: 'attack' }),
  usmash: () => ({ raw: { y: -12, torso: -0.1, fsh: 3.05, fel: 0.05, bsh: 2.7, bel: 0.1, fhip: 0.1, bhip: -0.2 }, expr: 'attack' }),
  dsmash: () => ({ raw: { y: 20, torso: 0, fhip: 1.45, fkn: 0, bhip: -1.45, bkn: 0, fsh: 1.6, fel: 0.1, bsh: -1.6, bel: 0.1 }, expr: 'attack' }),
  utilt: () => ({ raw: { fsh: 2.9, fel: 0.15, torso: -0.12, bsh: 0.6 }, expr: 'attack' }),
  fair: () => ({ raw: { fsh: 0.9, fel: 0.05, torso: 0.35, fhip: 0.9, fkn: 0.9 }, air: true, expr: 'attack' }),
  bair: () => ({ raw: { torso: 0.55, bhip: -1.65, bkn: 0.05, fhip: 0.6, fkn: 1.2, head: -0.3 }, air: true, expr: 'attack' }),
  dair: () => ({ raw: { fhip: 0.05, fkn: 0, bhip: -0.05, bkn: 0, fsh: 2.8, bsh: 2.6, torso: 0.05, y: 6 }, air: true, expr: 'attack' }),
  hurt: (t) => ({ raw: { torso: -0.55, head: -0.4, fsh: -0.9 + Math.sin(t * 0.5) * 0.3, fel: 0.5, bsh: 1.6, bel: 0.4, fhip: 0.9, fkn: 0.8, bhip: -0.5, bkn: 1.1 }, expr: 'hurt' }),
  tumble: (t) => ({ raw: { torso: -0.3, fsh: 2.2, bsh: 1.6, fhip: 0.6, fkn: 1.2, bhip: -0.4, bkn: 1.0, spin: -t * 0.2 }, air: true, expr: 'hurt' }),
  down: () => ({ raw: { y: 30, spin: -Math.PI / 2, torso: 0, fhip: 0.1, fkn: 0.2, bhip: -0.1, bkn: 0.4, fsh: 2.4, bsh: 2.8 } }),
  crouch: () => ({ raw: { y: 22, torso: 0.45, fhip: 1.2, fkn: 2.1, bhip: 0.7, bkn: 2.0, fsh: 0.9, fel: 1.4, bsh: 0.6 } }),
  shield: () => ({ raw: { y: 10, torso: 0.25, fsh: 1.2, fel: 2.0, bsh: 0.9, bel: 1.9, fhip: 0.5, fkn: 0.8, bhip: -0.2, bkn: 0.7 } }),
  roll: (t) => ({ raw: { y: 20, spin: ((t % 52) / 26) * Math.PI * 2, fhip: 1.4, fkn: 2.2, bhip: 1.3, bkn: 2.2, fsh: 1.4, fel: 2.2, bsh: 1.2, bel: 2.2, torso: 0.6 } }),
  ledge: () => ({ raw: { y: -26, torso: 0.1, fsh: 3.05, fel: 0.1, bsh: 2.9, bel: 0.2, fhip: 0.3, fkn: 0.4, bhip: 0.1, bkn: 0.6 }, air: true }),
};
const BRIEF = ['idle', 'run', 'jump', 'jab', 'fsmash', 'usmash', 'dair', 'hurt', 'down', 'crouch', 'shield', 'spin'];

const qs = new URLSearchParams(location.search);
const poseName = qs.get('pose') ?? 'cycle';
const one = qs.get('id') as CnpId | null;
const variant = Number(qs.get('variant') ?? 0);
const quality = qs.get('q') === 'low' ? 'low' : 'high';
const fixedT = qs.has('t') ? Number(qs.get('t')) : null;
const faceDir = qs.get('face') === 'left' ? -1 : 1;
const YAW = Number(qs.get('yaw') ?? 0.36);
const night = qs.get('light') === 'night';
const forceExpr = qs.get('expr') as Expr | null;
const showTips = qs.has('tips');
const flash = Number(qs.get('flash') ?? 0);
const alpha = Number(qs.get('alpha') ?? 1);
const noScarf = qs.has('noscarf');

function toModelPose(s: Sample, t: number, out: ModelPose): ModelPose {
  const r = { ...BASE, ...s.raw };
  out.torso = r.torso;
  out.head = r.head;
  out.fsh = r.fsh;
  out.fel = r.fel;
  out.bsh = r.bsh;
  out.bel = r.bel;
  out.fhip = r.fhip;
  out.fkn = r.fkn;
  out.bhip = r.bhip;
  out.bkn = r.bkn;
  out.spin = r.spin;
  out.squash = r.squash;
  out.y = r.y;
  out.time = t;
  out.air = !!s.air;
  out.run = s.run ?? 0;
  const blink = Math.floor(t / 6) % 30 === 0;
  out.expression = forceExpr ?? s.expr ?? (blink ? 'blink' : 'normal');
  return out;
}

// ---- ?thumbs=1: 描画側のアイコン（src/render3d/snapshots.ts）をこのモデルで作って並べる
if (qs.has('thumbs')) {
  initSnapshots({
    buildCharacter,
    buildStage: () => {
      throw new Error('no stage');
    },
  });
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;background:#2a2640;display:grid;grid-template-columns:repeat(9,1fr);gap:4px;padding:8px;align-content:start;z-index:5';
  for (const mode of ['face', 'bust', 'full'] as ThumbMode[])
    for (const id of CNP_MODEL_IDS) {
      const c = characterThumb(id, { size: 136, mode, variant });
      if (c) {
        c.style.width = '100%';
        c.style.background = '#403a5c';
        box.appendChild(c);
      }
    }
  document.body.appendChild(box);
}

// ---- シーン
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = createRenderer({ canvas });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
scene.background = new THREE.Color(night ? '#1d1b36' : '#a8cdea');
const hemi = night ? new THREE.HemisphereLight('#8f9ad8', '#2a2440', 1.1) : new THREE.HemisphereLight('#dfeaff', '#8a7f78', 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(night ? '#c9d6ff' : '#fff6e8', night ? 1.3 : 2.1);
const sunDir = new THREE.Vector3(0.4, 1, 0.6).normalize();
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 1.5;
const sc = sun.shadow.camera;
sc.left = -800;
sc.right = 800;
sc.top = 800;
sc.bottom = -800;
sc.near = 100;
sc.far = 6000;
scene.add(sun, sun.target);

const toonGrad = (() => {
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
function platform(cx: number, top: number, w: number, h: number) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 180), new THREE.MeshToonMaterial({ color: night ? '#4a4260' : '#8b7355', gradientMap: toonGrad }));
  body.position.set(cx, top - h / 2 - 3, 0);
  body.receiveShadow = true;
  const grass = new THREE.Mesh(new THREE.BoxGeometry(w + 4, 6, 184), new THREE.MeshToonMaterial({ color: night ? '#5d6a8a' : '#8cbf5f', gradientMap: toonGrad }));
  grass.position.set(cx, top - 3, 0);
  grass.receiveShadow = true;
  g.add(body, grass);
  scene.add(g);
}

interface Slot {
  id: CnpId;
  pose: string;
  x: number;
  y: number;
  model: CharacterModel;
  mp: ModelPose;
  label: HTMLDivElement;
  ribbons: Ribbon3D[];
  tip: THREE.Mesh | null;
}
const tipGeo = new THREE.SphereGeometry(2.2, 10, 8);
const tipMat = new THREE.MeshBasicMaterial({ color: '#ff2050', depthTest: false });
const slots: Slot[] = [];
const pick = qs
  .get('ids')
  ?.split(',')
  .filter((x): x is CnpId => (CNP_MODEL_IDS as string[]).includes(x));
const ids = one ? [one] : pick?.length ? pick : CNP_MODEL_IDS;
let view = { x: 0, y: -50, zoom: 1 };
const W = () => window.innerWidth;
const H = () => window.innerHeight;

function addSlot(id: CnpId, pose: string, x: number, y: number) {
  const model = buildCharacter(id, { variant, quality });
  model.root.position.set(x, y, 0);
  model.root.scale.set(faceDir, 1, 1);
  model.root.rotation.y = -faceDir * (pose === 'down' ? YAW * 0.5 : YAW);
  scene.add(model.root);
  const label = document.createElement('div');
  label.className = 'label';
  document.body.appendChild(label);
  // 描画側と同じマフラー（src/render3d/ribbon.ts）
  const ribbons = noScarf ? [] : model.scarves.map((sc) => new Ribbon3D(sc.color, sc.width, sc.length));
  for (const r of ribbons) scene.add(r.mesh);
  let tip: THREE.Mesh | null = null;
  if (showTips) {
    tip = new THREE.Mesh(tipGeo, tipMat);
    tip.renderOrder = 10;
    scene.add(tip);
  }
  slots.push({ id, pose, x, y, model, mp: {} as ModelPose, label, ribbons, tip });
}

if (one && poseName === 'all') {
  BRIEF.forEach((p, i) => {
    const row = Math.floor(i / 6);
    const col = i % 6;
    addSlot(one, p, (col - 2.5) * 125, row === 0 ? 170 : 0);
  });
  platform(0, 0, 900, 40);
  platform(0, 170, 900, 14);
  view = { x: 0, y: -125, zoom: Math.min(W() / 820, H() / 330) };
} else if (one) {
  addSlot(one, poseName, 0, 0);
  platform(0, 0, 400, 40);
  view = { x: 0, y: -52, zoom: Math.min(W() / 170, H() / 150) };
} else {
  ids.forEach((id, i) => addSlot(id, poseName, (i - (ids.length - 1) / 2) * 118, 0));
  platform(0, 0, 1300, 40);
  view = { x: 0, y: -52, zoom: Math.min(W() / (ids.length * 118 + 90), H() / 190) };
}
if (qs.has('zoom')) view.zoom = Number(qs.get('zoom'));
if (qs.has('cy')) view.y = -Number(qs.get('cy'));

const cam = new THREE.PerspectiveCamera();
function resize() {
  renderer.setSize(W(), H(), false);
  canvas.style.width = `${W()}px`;
  canvas.style.height = `${H()}px`;
}
resize();
window.addEventListener('resize', resize);

// ---- 統計（メッシュ数・三角形数・頭の高さ）
function stats(m: CharacterModel) {
  let meshes = 0;
  let tris = 0;
  let head = -Infinity;
  m.root.updateMatrixWorld(true);
  m.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const g = mesh.geometry;
    tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    if (mesh.name === 'head') {
      const pa = g.getAttribute('position');
      for (let i = 0; i < pa.count; i++) head = Math.max(head, v3.fromBufferAttribute(pa, i).applyMatrix4(mesh.matrixWorld).y - m.root.position.y);
    }
  });
  const all = new THREE.Box3().setFromObject(m.root);
  return { meshes, tris: Math.round(tris), head: +head.toFixed(1), top: +(all.max.y - m.root.position.y).toFixed(1), height: m.height };
}

const hud = document.getElementById('hud') as HTMLDivElement;
const cycle = ['idle', 'run', 'jump', 'jab', 'fsmash', 'usmash', 'dair', 'hurt', 'down', 'crouch', 'shield', 'spin'];
let frame = 0;
const v3 = new THREE.Vector3();
function tick() {
  const t = fixedT ?? frame;
  for (const s of slots) {
    const name = s.pose === 'cycle' ? cycle[Math.floor(frame / 120) % cycle.length] : s.pose;
    const fn = POSES[name] ?? POSES.idle;
    s.model.pose(toModelPose(fn(t), t, s.mp));
    s.model.setFlash(flash);
    s.model.setOpacity(alpha);
    s.model.root.updateMatrixWorld(true);
    s.model.scarves.forEach((sc, i) => {
      const a = sc.anchor.getWorldPosition(v3);
      s.ribbons[i]?.step(a.x, a.y, a.z, faceDir, frame);
    });
    if (s.tip) s.model.tip(s.tip.position);
    s.label.textContent = one ? (slots.length > 1 ? name : `${s.id} / ${name}`) : `${s.id}`;
  }
  syncCamera(cam, view, W(), H());
  sun.target.position.set(view.x, -view.y, 0);
  sun.position.copy(sunDir).multiplyScalar(2600).add(sun.target.position);
  renderer.render(scene, cam);
  for (const s of slots) {
    v3.set(s.x, s.y - 8, 0).project(cam);
    s.label.style.left = `${((v3.x + 1) / 2) * W()}px`;
    s.label.style.top = `${((1 - v3.y) / 2) * H()}px`;
  }
  if (frame === 0) {
    const st: Record<string, ReturnType<typeof stats>> = {};
    for (const s of slots) if (!st[s.id]) st[s.id] = stats(s.model);
    (window as unknown as { __stats: unknown }).__stats = st;
    hud.textContent = Object.entries(st)
      .map(([k, v]) => `${k.padEnd(9)} meshes ${v.meshes}  tris ${v.tris}  head ${v.head}/${v.height}  top ${v.top}`)
      .join('\n');
    (window as unknown as { __ready: boolean }).__ready = true;
  }
  frame++;
  requestAnimationFrame(tick);
}
tick();
