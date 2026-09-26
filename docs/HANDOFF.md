# 引き継ぎメモ（CNP乱舞）

新しいセッションで作業を続けるためのメモです。最初にこのファイルと `README.md` を読んでから始めてください。返答・報告は日本語で。

- リポジトリ: `koshima1205/smabra`（**公開リポジトリ**）
- 作業ブランチ: `claude/tsukusettan-cnp-mcp-smash-yapw36`（このブランチで作業し、同じブランチに push）
- 遊べるページ（Artifact、非公開）: https://claude.ai/artifact/4NpJkm59K24nQvpw4CEzCu
  - 更新するときは、先に `read` してから `url` を指定して publish（アイコンは変えない）
  - ページ本体は `npm run build:single` の `dist-single/index.html` を、下の「Artifact 用の断片の作り方」で変換したもの

## ゲームの現状

CNP（CryptoNinja Partners）9体と、CryptoNinja 外伝「月蝕綺譚 -Luna Occulta-」の御霊14体が 3D（three.js）で戦う、非公式ファンメイドのプラットフォーム対戦アクション。TypeScript / Vite。

- **CNP 9体**（リーリー・ミタマ・ナルカミ・オロチ・ルナ・ヤーマ・マカミ・トワ・セツナ）
  - モデルは手続き生成（`src/render3d/characters/*.ts`）。色・体型・顔は素材屋CNP の公式イラスト 9点（1体1点）を見て寄せた。イラストはリポジトリにもゲームにも入れていない
  - 性能はパートナー忍者の設定（NINJAMCP → `npm run sync:roster` → `src/data/roster.generated.json`）から
- **月蝕綺譚 14体**（於兎・シャオラン・オロチ・エマ・ネム・餡音・カルマ・柴・アトザ・アウン・トバリ・サスラ・石舟斎・栞）
  - 定義: `src/data/kitan.ts`（里・五行・忍術名・口調は kitan-lore MCP と公式サイトから。説明文・勝利の一言は本作で書いたもの）
  - モデル: 公式「3Dの間」のゲーム版 GLB。**リポジトリには入れず**、`npm run sync:kitan`（dev / build / build:single / e2e の前に自動実行）で素材蔵から取得して sha256 を照合（`src/assets/kitan/manifest.json`、取得先 `src/assets/kitan/models/` は git 管理外）
  - `src/render3d/characters/kitan.ts`: URL を使わない自前の GLB 読み込み（1ファイル版で data:/blob: が禁止されても動く）＋元の6本の骨から共通骨格（肩・肘・股・膝）への割り当て直し。オロチと栞は脚を分けない。体を少しカメラ側へ向けている
  - 選択画面・勝利画面は公式トンマナ「宵闇に金」（宵闇藍 `#131320`・金泥 `#D9A94C`・月白 `#E8E4D8`・Shippori Mincho）。勝利画面に御霊の一言
  - ID は `k_` 付き（CNP と名前がかぶるオロチ・エマのため）
- 選択画面は 8列×3段。CPU 総当たりの勝率は全員おおむね 38〜64%

## 守っている規約・方針

- **素材屋CNP**（https://sozaiya.cryptoninja-partners.xyz/）: AI に読み込ませるのは**合計10点まで**。すでに 9点使用済み（残り1点）。イラストをリポジトリ・ゲームに入れない。トレースしない
- **月蝕綺譚の二次創作ガイドライン**（https://vibe.co.jp/luna-occulta/fanworks）: ゲーム制作 OK・公式を名乗らない・**モデルそのままの再配布 NG**（だから GLB はリポジトリに入れない）・正典シートの転載 NG
- **CryptoNinja / CNP**: 非公式ファンメイドであることをクレジット・README に明記。公式を名乗らない
- **任天堂（スマブラ）**: 仕組み（％ダメージ・ストック・崖つかまり）は使っているが、固有の名前・決め台詞・見た目は避ける。「READY TO FIGHT」→「いざ、勝負」、「GAME SET」→「勝負あり」、「大乱闘」「スマブラ風」は削除済み
- コミットメッセージや成果物にモデル名（AI のモデル名）は書かない

## 未解決（次にやること）

1. **CNP の利用ガイドライン本文の確認**（最優先）
   - https://www.ninja-dao.com/guidelines と CNP 公式サイト（https://www.cryptoninja-partners.xyz/）の利用規約を読み、タイトルに「CNP」を使うこと・キャラの 3D 化・公開方法が問題ないか照らし合わせる
   - 前のセッションでは、この2つのホストがネットワーク設定で拒否されて読めなかった（許可ドメインに追加してもらった上で新しいセッションを開始）
   - 分かっていること: 月蝕綺譚の掟の要約では、原作 CryptoNinja は「CC0 ではないが、ガイドラインの範囲なら許可なしで制作・頒布・販売してよい（年商2,000万円以内が目安）」
2. **公開リポジトリの履歴に月蝕綺譚のモデルが残っている**
   - コミット `fdc4ea7`（Add four Luna Occulta spirits…）に `src/assets/kitan/{oto,xiaolan,orochi,emma}.glb` が含まれ、今も取得できる。「モデルそのままの再配布 NG」に当たるおそれ
   - 消すには履歴の書き換えと強制 push が必要。**ユーザーの了承がまだ無い**ので、やる前に必ず確認する（一時的にリポジトリを非公開にする選択肢もある）
3. リポジトリ名 `smabra` とブランチ名が「スマブラ」を連想させるので、公開前に変えるか検討（ユーザー判断）
4. Artifact は非公開のまま。広く公開するのは 1 の確認後がおすすめ

## 環境メモ

- 許可ドメイン（前のセッション時点）: `sozaiya.cryptoninja-partners.xyz`、`static.wixstatic.com`（素材屋CNP のイラスト置き場）、`vibe.co.jp`、`kura.vibe.co.jp`、`cn-lore-mcp.nubonba.workers.dev`
  - `kitan-lore-mcp.nubonba.workers.dev` は直接は拒否されていたが、**claude.ai のコネクタ（kitan-lore）として接続済み**なので MCP ツールで使える
- NINJAMCP（ninjamcp）はセッションによって接続に失敗することがある
- Chromium は入っていて WebGL も動く（`playwright install` はしない）。スクショ確認は `npm run dev` → `/dev/models.html`（`?ids=` `?pose=` `?t=10` `?yaw=` `?q=low` など）
- 確認コマンド: `npm run typecheck`、`npm test`、`npm run e2e`、`npm run build`、`npm run build:single`（1ファイル版は約 7.9MB、Artifact の上限は 16MB）

### Artifact 用の断片の作り方

```js
// node to-artifact.mjs out.html
import fs from 'node:fs';
const html = fs.readFileSync('dist-single/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]).join('\n');
const title = pick(/<title>[\s\S]*?<\/title>/g);
const links = pick(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/g);
const styles = pick(/<style>[\s\S]*?<\/style>/g);
const scripts = pick(/<script type="module">[\s\S]*?<\/script>/g);
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script type="module">[\s\S]*?<\/script>/g, '');
const extra = '<style>:root{color-scheme:dark}html,body{height:100%;background:#0d0b1a;color:#f5f1ff}</style>';
fs.writeFileSync(process.argv[2], [title, links, extra, styles, body.trim(), scripts].join('\n'));
```
