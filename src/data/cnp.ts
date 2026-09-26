/**
 * CNP（CryptoNinja Partners）のキャラクター定義。
 *
 * - 「誰のパートナーか」は NINJAMCP（忍者側の設定）から同期時に照合する（scripts/sync-roster.ts）。
 *   MCP に載っていない組み合わせ（ルナ・マカミ・トワ・セツナ）は CNP 公式サイトや解説記事で公開されている情報に基づく。
 * - 性能・説明文は本作オリジナル。3D モデルは手続き生成（公式イラストは使わず、同梱もしない）で、
 *   見た目は素材屋CNP のイラスト 9 点を AI に読み込ませて寄せた（素材屋CNP の AI 生成ガイドラインの上限 10 点以内）。
 *   キャラクターのデザインの権利は元のイラストの制作者と CNP にある（docs/GUIDELINES.md）。
 */
import type { CnpId } from '../render3d/types';

export interface CnpDef {
  id: CnpId;
  name: string;
  nameEn: string;
  /** 種族 */
  species: string;
  /** パートナーの忍者（NINJAMCP の名前） */
  partner: string;
  /** MCP のプロフィールにパートナーとして名前が出てくるか確認するキーワード */
  loreKey: string;
  /** テーマ色（UI・マフラー） */
  color: string;
  blurb: string;
  /** 出てくる作品（省略時は CNP） */
  series?: 'cnp' | 'kitan';
  /** 月蝕綺譚の御霊の里と五行（CNP はパートナーの忍者から決まるので省略） */
  clan?: string;
  element?: string;
  /** 月蝕綺譚の忍術の名前（公式設定の名前をそのまま使う） */
  ninjutsu?: string;
  /** 勝利画面の一言（公式の口調に合わせて本作で書いたもの） */
  quotes?: string[];
}

export const CNP: CnpDef[] = [
  {
    id: 'leelee',
    name: 'リーリー',
    nameEn: 'LeeLee',
    species: 'パンダ',
    partner: 'シャオラン',
    loreKey: 'リーリー',
    color: '#e0443a',
    blurb: 'シャオランが口寄せで呼ぶパンダ。巨大化する力を秘めた重量級。',
  },
  {
    id: 'mitama',
    name: 'ミタマ',
    nameEn: 'Mitama',
    species: 'おばけ',
    partner: '瀬織',
    loreKey: 'ミタマ',
    color: '#34a864',
    blurb: '瀬織のパートナーのおばけ。ふわふわ浮いて、木槌と呪いで戦う。',
  },
  {
    id: 'narukami',
    name: 'ナルカミ',
    nameEn: 'Narukami',
    species: '鷹',
    partner: 'ハヤテ',
    loreKey: 'ナルカミ',
    color: '#2b3f8f',
    blurb: 'ハヤテの相棒の鷹。空中戦と雷の急降下が得意なクールな一羽。',
  },
  {
    id: 'orochi',
    name: 'オロチ',
    nameEn: 'Orochi',
    species: '白蛇',
    partner: '蛇ノ目',
    loreKey: 'オロチ',
    color: '#8a4fd6',
    blurb: '蛇ノ目が口寄せする白蛇。長い尾のムチと毒で間合いを支配する。',
  },
  {
    id: 'luna',
    name: 'ルナ',
    nameEn: 'Luna',
    species: 'うさぎ',
    partner: '於兎',
    loreKey: 'ルナ',
    color: '#3b7be0',
    blurb: '於兎のパートナーのうさぎ。高いジャンプと蹴り技で跳ね回る。',
  },
  {
    id: 'yama',
    name: 'ヤーマ',
    nameEn: 'Yama',
    species: '小鬼',
    partner: 'イブキ',
    loreKey: 'ヤーマ',
    color: '#d94a2b',
    blurb: 'イブキのパートナーの小鬼。頭が切れて土壇場に強い。金棒と呪符を操る。',
  },
  {
    id: 'makami',
    name: 'マカミ',
    nameEn: 'Makami',
    species: 'オオカミ',
    partner: '紫苑',
    loreKey: 'マカミ',
    color: '#7b52c9',
    blurb: '紫苑のパートナーのオオカミ。鉤爪と俊足で一気に攻め込む。',
  },
  {
    id: 'towa',
    name: 'トワ',
    nameEn: 'Towa',
    species: '黒猫',
    partner: '久遠',
    loreKey: 'トワ',
    color: '#c23a4a',
    blurb: '久遠のパートナー、双子の黒猫。鬼火と「猫の目の選択」で運命を操る。',
  },
  {
    id: 'setsuna',
    name: 'セツナ',
    nameEn: 'Setsuna',
    species: '白猫',
    partner: '久遠',
    loreKey: 'セツナ',
    color: '#3aa6d9',
    blurb: '久遠のパートナー、双子の白猫。一瞬で間合いを詰める速攻型。',
  },
];
