import type { Platform, StageDef } from './types';

/**
 * ステージ。座標系: x 右が正、y 下が正。メイン足場の上面が y=0。
 * ステージ名は MCP の世界観（クラン・天界・根の国）から。
 */
export const STAGES: StageDef[] = [
  {
    id: 'iga',
    name: '伊賀の里・天守閣',
    sub: '月夜の瓦屋根。3枚のすり抜け床',
    bgm: 'iga',
    main: { x1: -560, x2: 560, y: 0, depth: 260 },
    platforms: [
      { x1: -410, x2: -170, y: -190, soft: true },
      { x1: 170, x2: 410, y: -190, soft: true },
      { x1: -120, x2: 120, y: -370, soft: true },
    ],
    blast: { l: -1650, r: 1650, t: -1350, b: 900 },
    spawns: [
      { x: -380, y: 0 },
      { x: 380, y: 0 },
      { x: -140, y: 0 },
      { x: 140, y: 0 },
    ],
    respawn: { x: 0, y: -560 },
  },
  {
    id: 'tenkai',
    name: '天界・雲上の舞台',
    sub: '床のない真っ向勝負の神域',
    bgm: 'tenkai',
    main: { x1: -680, x2: 680, y: 0, depth: 200 },
    platforms: [],
    blast: { l: -1750, r: 1750, t: -1350, b: 900 },
    spawns: [
      { x: -440, y: 0 },
      { x: 440, y: 0 },
      { x: -180, y: 0 },
      { x: 180, y: 0 },
    ],
    respawn: { x: 0, y: -560 },
  },
  {
    id: 'nenokuni',
    name: '根の国・封印の祠',
    sub: '上下する足場と狭い祠。封印が揺らぐ',
    bgm: 'nenokuni',
    main: { x1: -470, x2: 470, y: 0, depth: 300 },
    platforms: [
      { x1: -440, x2: -220, y: -170, soft: true, move: { ax: 0, ay: 70, period: 420, phase: 0 } },
      { x1: 220, x2: 440, y: -170, soft: true, move: { ax: 0, ay: 70, period: 420, phase: Math.PI } },
    ],
    blast: { l: -1500, r: 1500, t: -1250, b: 850 },
    spawns: [
      { x: -300, y: 0 },
      { x: 300, y: 0 },
      { x: -100, y: 0 },
      { x: 100, y: 0 },
    ],
    respawn: { x: 0, y: -520 },
  },
  {
    id: 'saika',
    name: '雑賀の港・船上決戦',
    sub: '往復する小舟の足場',
    bgm: 'saika',
    main: { x1: -600, x2: 600, y: 0, depth: 240 },
    platforms: [{ x1: -150, x2: 150, y: -230, soft: true, move: { ax: 330, ay: 0, period: 600, phase: 0 } }],
    blast: { l: -1700, r: 1700, t: -1350, b: 900 },
    spawns: [
      { x: -400, y: 0 },
      { x: 400, y: 0 },
      { x: -160, y: 0 },
      { x: 160, y: 0 },
    ],
    respawn: { x: 0, y: -560 },
  },
];

export function stageById(id: string): StageDef {
  return STAGES.find((s) => s.id === id) ?? STAGES[0];
}

export interface Ledge {
  x: number;
  y: number;
  /** ステージのどちら側の崖か（-1 = 左端、1 = 右端） */
  side: -1 | 1;
}

export function ledgesOf(stage: StageDef): Ledge[] {
  return [
    { x: stage.main.x1, y: stage.main.y, side: -1 },
    { x: stage.main.x2, y: stage.main.y, side: 1 },
  ];
}

export interface PlatformState {
  x1: number;
  x2: number;
  y: number;
  soft: boolean;
  /** 前Fからの移動量（乗っているファイターを運ぶ） */
  dx: number;
  dy: number;
}

function offsetAt(p: Platform, frame: number): { ox: number; oy: number } {
  if (!p.move) return { ox: 0, oy: 0 };
  const a = (frame / p.move.period) * Math.PI * 2 + p.move.phase;
  return { ox: Math.sin(a) * p.move.ax, oy: Math.sin(a) * p.move.ay };
}

export function platformAt(p: Platform, frame: number): PlatformState {
  const now = offsetAt(p, frame);
  const before = offsetAt(p, frame - 1);
  return {
    x1: p.x1 + now.ox,
    x2: p.x2 + now.ox,
    y: p.y + now.oy,
    soft: p.soft,
    dx: now.ox - before.ox,
    dy: now.oy - before.oy,
  };
}
