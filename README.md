# 忍乱舞 NINJA RANBU

CryptoNinja のキャラクターたちが大乱闘する、**スマブラ風 2D プラットフォーム対戦ゲーム**（非公式ファンメイド）。
キャラクター情報は **MCP（Model Context Protocol）サーバー「NINJAMCP」に接続して取得**し、名前・クラン・忍術・得物からワザ・性能・見た目を自動生成しています。

- 全 **42 キャラ**（伊賀・甲賀・風魔・雑賀・天界・根の国）が使用可能
- 蓄積ダメージ％とふっとばし、ストック制／時間制、最大 4 人（人間・CPU 混在）
- 弱・強・スマッシュ（タメ）・空中攻撃・必殺ワザ4種・つかみ／投げ・ガード／回避／空中回避・崖つかまり・受け身・ずらし
- CPU は Lv1〜9（復帰・崖待ち・ガード・投げの判断あり）
- ステージ 4 種（伊賀の里・天守閣／天界・雲上の舞台／根の国・封印の祠／雑賀の港・船上決戦）
- 効果音・BGM はすべて Web Audio で手続き生成（音声ファイルなし）
- キーボード 2 人・ゲームパッド・スマホのタッチ操作に対応

## 遊び方

```bash
npm install
npm run dev        # http://localhost:5173
```

| 操作 | キーボード1（1P） | キーボード2（2P） | ゲームパッド |
| --- | --- | --- | --- |
| 移動 | W A S D | 矢印キー | Lスティック / 十字 |
| ジャンプ | Space | `/` | X / Y（上はじき） |
| 攻撃（方向で強攻撃） | J（F） | `,` | A |
| スマッシュ攻撃（長押しでタメ） | I（R）+方向 | `;` | Rスティック / はじき+A |
| 必殺ワザ（方向で4種） | K（G） | `.` | B |
| ガード・回避（空中で空中回避） | L / 左Shift | `'` / 右Shift | R / ZL / ZR |
| つかみ | U（T） | P | L |
| ポーズ | Enter / Esc | — | START |

- ガード中に横で回避、下でその場回避、攻撃でつかみ。つかんだら方向で投げ、攻撃でつかみ打撃。
- 崖から落ちたら空中ジャンプ＋上必殺ワザで復帰。崖つかまり直後は少しの間無敵。
- ふっとび中の方向入力で「ずらし」、着地の瞬間にガードで「受け身」。
- 2P はキャラ選択画面でキーボード2のボタンかパッドのボタンを押すと参加。CPU のキャラはスロットをクリックしてから選択。

## MCP 連携のしくみ

```
NINJAMCP (MCP サーバー, stdio)                scripts/sync-roster.ts (MCP クライアント)
  list_characters  ─────────────────────────▶  全キャラの ID・名前・クラン・忍術・得物・画像URL
  get_character    ─────────────────────────▶  誕生日などの詳細
  get_worldview    ─────────────────────────▶  クラン構成・データ出典
                                                   │
                                                   ▼
                                     src/data/roster.generated.json（事実情報のみ）
                                                   │
                                                   ▼
                           src/game/roster.ts: 得物 → 通常ワザ／忍術 → 必殺ワザ4種／クラン → 性能・配色
```

```bash
npm run sync:roster                        # NINJAMCP に接続して名簿を再生成
npm run sync:roster -- --server /path/to/ninjamcp/dist/index.js
```

- NINJAMCP（[omikirin/mcp](https://github.com/omikirin/mcp), MIT）は `optionalDependencies` として導入され、`.mcp.json` にも登録済みです。このリポジトリを Claude Code で開くと `ninjamcp` サーバーとして使えます（キャラ設定を参照しながらワザを考える、など）。
- 生成ファイルには**事実情報（名前・クラン・忍術・得物・誕生日・画像URL）だけ**を保存します。プロフィール本文などの文章は取り込みません。
- 公式イラストはリポジトリに含めず、MCP が返す画像 URL から**実行時に**ブラウザで読み込みます。読み込めない環境ではクラン色の紋章で表示します。
- MCP 側にキャラが増えても、未知の忍術・得物は既存の型に割り当てて自動で参戦します。

### 月蝕綺譚について

関連 IP の「月蝕綺譚」にも公式の MCP（`kitan-lore`、会員向け）がありますが、開発に使ったクラウド環境からはホスト（vibe.co.jp）への通信が許可されていなかったため、今回は CryptoNinja（NINJAMCP）で実装しています。`scripts/sync-roster.ts` の取得部分を差し替えれば、同じ仕組みで別の MCP からキャラクターを取り込めます。

## 開発

```bash
npm test            # 単体テスト＋全キャラの CPU 対戦シミュレーション（vitest）
npm run e2e         # ブラウザでタイトル→選択→対戦を通しで確認（Playwright）
npm run typecheck
npm run build       # dist/
npm run build:single  # dist-single/index.html（JS・CSS を埋め込んだ1ファイル版）
```

| ディレクトリ | 内容 |
| --- | --- |
| `src/game/` | 物理・状態遷移（fighter）、当たり判定・ふっとばし（match / combat）、ステージ、CPU（ai）、ワザ生成（moves/） |
| `src/render/` | 手続き生成のキャラ描画（rig / fighterRenderer）、エフェクト、HUD、ステージ背景 |
| `src/ui/` | タイトル・キャラ選択・ステージ選択・対戦・リザルトの各画面、タッチ操作 |
| `src/core/` | 入力（キーボード / パッド / タッチ）、手続き生成サウンド、数学ユーティリティ |
| `scripts/sync-roster.ts` | MCP クライアント（NINJAMCP → 名簿 JSON） |

## クレジット・ガイドライン

- **CryptoNinja** は Ninja DAO / イケハヤ氏による IP です。本作は**非公式・非営利のファンメイド作品**で、公式とは関係ありません。二次創作の範囲は公式の[利用ガイドライン](https://www.ninja-dao.com/guidelines)で定められているので、公開・配布・商用利用の前に必ず確認してください（法人での利用などは別途ライセンス契約が必要な場合があります）。
- キャラクター設定データ: NINJAMCP 経由（出典: [【保存版】CryptoNinja 世界観とキャラクター設定まとめ](https://note.com/danku_mj/n/n8be2e96f1fbe)（だんく氏））
- NINJAMCP: MIT License（omikirin）
- ゲームのプログラム・キャラクターの描画・エフェクト・効果音・BGM はすべて本作オリジナル（手続き生成）です。
