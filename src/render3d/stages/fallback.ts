import * as THREE from 'three';
import type { StageDef } from '../../game/types';
import type { Quality, StageInstance } from '../types';
import { addLights, Batch, Kit, placePlatform, ridgeLine, Rng, skyPlane, smooth, terrain } from './common';

/**
 * 未知のステージ ID 用の簡素なステージ（落ちないことが目的）。
 * 青空・遠くの丘・石の床とすり抜け床だけ。
 */
export function buildFallback(stage: StageDef, quality: Quality): StageInstance {
  const kit = new Kit(quality, stage);
  const { x1, x2, depth } = stage.main;
  const hz = depth / 2;

  skyPlane(kit, [
    [-2600, '#f4e6c8'],
    [-800, '#bcd7ef'],
    [1500, '#6f9fd8'],
    [3500, '#3f6fb8'],
  ]);

  // 遠くの丘
  const rng = new Rng(7);
  const hills = new Batch(kit);
  const line = ridgeLine(rng, -12000, 12000, 18, 300, 1100, 900, 2600, 60);
  hills.add(terrain(-12000, 12000, -8800, -5200, kit.high ? 160 : 60, 6, -2600, (x, z) => line(x) * smooth(-5200, -7000, z)), '#7f9fbc');
  hills.build(kit.vtoon(), { shade: (p, _n, c) => c.lerp(new THREE.Color('#dbe6f2'), 0.35 + 0.25 * smooth(-2600, -1400, p.y)) });

  // 床
  const floor = new Batch(kit);
  floor.slab(x1, x2, 0, depth, -hz, hz, (p, _n, c) => c.set(p.y > -2 ? '#e9e2d2' : '#a79a88').multiplyScalar(1 - 0.45 * smooth(0, -depth, p.y)), 3);
  floor.slab(x1, x2, 0.5, 4, hz - 6, hz + 1, '#fff7e6');
  floor.build(kit.vtoon(), { receive: true });

  for (const p of stage.platforms) {
    const b = new Batch(kit);
    const w = p.x2 - p.x1;
    b.slab(-w / 2, w / 2, 0, 14, -55, 55, (q, _n, c) => c.set(q.y > -2 ? '#f3ecdc' : '#8f8578'), 2.5);
    const g = new THREE.Group();
    b.build(kit.vtoon(), { parent: g, receive: true, cast: true });
    placePlatform(kit, p, g);
  }

  const sun = addLights(kit, { sky: '#dfeaff', ground: '#8a7f78', hemi: 1.5, sun: '#fff6e8', sunI: 2.1, dir: [0.4, 1, 0.6] });
  return kit.finish({
    sun,
    background: new THREE.Color('#9ec2e8'),
    fog: kit.fog('#cfe0f0', 3000, 16800),
  });
}
