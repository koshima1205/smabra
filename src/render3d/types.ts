/**
 * 3D 描画の共通契約。
 *
 * 座標: three.js のワールドは x 右 / y 上 / z 手前（カメラ側）。ゲームの y は下向きなので three の y = -ゲームy。
 * 1 単位 = ゲームの 1 単位（キャラの身長 ≒ 85〜95）。遊ぶ平面は z = 0。
 * メイン足場の上面は y = 0、すり抜け床の上面は y = -platform.y。
 * カメラは -z 方向を向いた透視投影（fov 30°）で、少し上から見下ろすよう射影をずらしている（z=0 平面は歪まない）。
 * カメラ距離はズームで約 900〜3800。背景は z = -1500〜-8000 あたりに置く。
 */
import type * as THREE from 'three';
import type { StageDef } from '../game/types';

export type Quality = 'high' | 'low';

export interface StageInstance {
  /** シーンに追加するルート（ライトも含める） */
  group: THREE.Group;
  /** 背景（色かテクスチャ） */
  background: THREE.Color | THREE.Texture;
  fog: THREE.Fog | THREE.FogExp2 | null;
  /** ファイターの影を落とすメインライト（group の中に入れておく）。castShadow の設定は呼び出し側が行う */
  sun: THREE.DirectionalLight;
  /** 毎フレーム。frame = match.frame（動く足場は platformAt(p, frame) と同じ位置へ）。cam はカメラの注視点（three 座標） */
  update(frame: number, camX: number, camY: number): void;
  dispose(): void;
}

export type BuildStage = (stage: StageDef, opts: { quality: Quality }) => StageInstance;

/** 月蝕綺譚のキャラの ID（CNP と名前がかぶるオロチ・エマもあるので k_ を付ける） */
export type KitanId = 'k_oto' | 'k_xiaolan' | 'k_orochi' | 'k_emma';

/** キャラの ID（CNP 9体＋月蝕綺譚） */
export type CnpId = 'leelee' | 'mitama' | 'narukami' | 'orochi' | 'luna' | 'yama' | 'makami' | 'towa' | 'setsuna' | KitanId;

/**
 * モデルの姿勢。2D 版の Pose（src/render/rig.ts）と同じ意味の角度（ラジアン）を受け取る。
 * 手足の角度は「真下 = 0、前（+x）へ回すと +」。front = カメラ側（+z）の手足。
 */
export interface ModelPose {
  torso: number;
  head: number;
  fsh: number;
  fel: number;
  bsh: number;
  bel: number;
  fhip: number;
  fkn: number;
  bhip: number;
  bkn: number;
  /** 体全体の回転（宙返り。+ で前回り） */
  spin: number;
  /** 縦の伸縮（1 = そのまま） */
  squash: number;
  /** 腰の上下（身長100基準、+ で下がる＝しゃがむ） */
  y: number;
  /** 経過F（待機の揺れ・まばたき用） */
  time: number;
  air: boolean;
  /** 横移動の速さ（0〜1） */
  run: number;
  expression: 'normal' | 'hurt' | 'blink' | 'attack';
}

/** たなびくマフラー・鉢巻。描画側が anchor の位置から布を描く */
export interface ScarfSpec {
  /** 付け根（首の後ろ・頭の後ろなど） */
  anchor: THREE.Object3D;
  color: THREE.ColorRepresentation;
  /** 幅と長さ（ゲーム単位） */
  width: number;
  length: number;
}

export interface CharacterModel {
  /** 足元が原点・+x が前・+y が上で作る。位置と向き（左右反転・カメラへの振り向き）は呼び出し側が root に設定する */
  root: THREE.Group;
  /** おおよその身長 */
  height: number;
  pose(p: ModelPose): void;
  /** 被弾時の白いフラッシュ 0..1 */
  setFlash(k: number): void;
  /** 半透明（無敵の点滅など）0..1 */
  setOpacity(a: number): void;
  /** 攻撃の軌跡用: 前の手（または口・尾の先など攻撃部位）のワールド座標を out に書く */
  tip(out: THREE.Vector3): THREE.Vector3;
  /** たなびく布（無ければ空配列） */
  scarves: ScarfSpec[];
  dispose(): void;
}

export interface CharacterOpts {
  /** 同じキャラが複数いるときの色違い（0 = 基本色、1〜3 = マフラーなどの色違い） */
  variant?: number;
  quality?: Quality;
}

export type BuildCharacter = (id: CnpId, opts?: CharacterOpts) => CharacterModel;
