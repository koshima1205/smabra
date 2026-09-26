/**
 * 月蝕綺譚 -Luna Occulta-（CryptoNinja 外伝）の御霊。
 *
 * - 里・五行・忍術の名前は月蝕綺譚の公式サイト（二次創作の正典シート）の公開情報から。説明文は本作の言葉で書いている。
 * - 3D モデルは公式の「3Dの間」のゲーム版 GLB を組み込んで使う（src/assets/kitan/README.md）。
 * - 性能は本作オリジナル。本作は非公式のファンメイドで、月蝕綺譚の公式とは関係ない。
 */
import type { CnpDef } from './cnp';

export const KITAN: CnpDef[] = [
  {
    id: 'k_oto',
    name: '於兎',
    nameEn: 'Oto',
    species: '月蝕綺譚・兎',
    partner: '',
    loreKey: '於兎',
    color: '#c98a3a',
    blurb: '甲賀の兎の娘。垂れた耳と明るい笑顔のまま、地面ごと揺らすような拳を振り下ろす。',
    series: 'kitan',
    clan: '甲賀',
    element: '土',
    ninjutsu: 'うさぎどーん！',
  },
  {
    id: 'k_xiaolan',
    name: 'シャオラン',
    nameEn: 'Xiaolan',
    species: '月蝕綺譚・太極拳',
    partner: '',
    loreKey: 'シャオラン',
    color: '#3fa7a0',
    blurb: '甲賀の太極拳の使い手で、点心の屋台の主。相棒のリーリーを口寄せして、肩を並べて打ち込む。',
    series: 'kitan',
    clan: '甲賀',
    element: '土',
    ninjutsu: '口寄せ・リーリー',
  },
  {
    id: 'k_orochi',
    name: 'オロチ',
    nameEn: 'Orochi (Luna Occulta)',
    species: '月蝕綺譚・白蛇',
    partner: '',
    loreKey: 'オロチ',
    color: '#8fb0d8',
    blurb: '風魔の御霊。蛇ノ目の傘に宿る白蛇が人の姿になったもの。いざとなれば口から黒鉄の剣「叢雲」を抜く。',
    series: 'kitan',
    clan: '風魔',
    element: '水',
    ninjutsu: '鎌首',
  },
  {
    id: 'k_emma',
    name: 'エマ',
    nameEn: 'Emma',
    species: '月蝕綺譚・ユニコーン',
    partner: '',
    loreKey: 'エマ',
    color: '#e070b0',
    blurb: '甲賀の御霊で、夢から抜け出してきたユニコーンの娘。赤い月の光を帯びた一角の槍で、悪い夢を突き払う。',
    series: 'kitan',
    clan: '甲賀',
    element: '金',
    ninjutsu: '夢路・星こぼし',
  },
];
