# 引き継ぎメモ（月下乱舞）

新しいセッションで作業を続けるためのメモです。最初にこのファイルと `README.md` を読んでから始めてください。返答・報告は日本語で。

- リポジトリ: `koshima1205/gekka-ranbu`（**公開リポジトリ**。2026-09-26 に「スマブラ」を連想させる `smabra` から名前を変えた。古い URL は新しい名前へ転送される）
- 作業ブランチ: セッションで指定されたブランチで作業して push。既定のブランチは `main`（2026-09-26 に `claude/tsukusettan-cnp-mcp-smash-yapw36` から名前を変えた）
- ユーザーは一人で開発している。作業が終わったら PR を作り、ユーザーの了承を得てマージする
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
- タイトル画面はロゴ・「非公式ファンゲーム」・PRESS START・メニューだけにする（ユーザーの希望で、説明文・操作のヒント・下の注記は 2026-09-26 に外した。権利表記はクレジットにある）

## 守っている規約・方針

- **素材屋CNP**（https://sozaiya.cryptoninja-partners.xyz/）: AI に読み込ませるのは**合計10点まで**。すでに 9点使用済み（残り1点）。イラストをリポジトリ・ゲームに入れない。トレースしない
- **月蝕綺譚の二次創作ガイドライン**（https://vibe.co.jp/luna-occulta/fanworks）: ゲーム制作 OK・公式を名乗らない・**モデルそのままの再配布 NG**（だから GLB はリポジトリに入れない）・正典シートの転載 NG
- **CNP / CryptoNinja**（確認結果は [GUIDELINES.md](GUIDELINES.md)。ユーザーの回答では個人の趣味の非営利作品）: タイトルに「CNP」を入れない（公式の「CNP○○」と紛らわしいので、2026-09-26 に「CNP乱舞」→「月下乱舞」に改名した）。非公式・非営利のファンメイドであることをタイトル画面（ロゴ下の「非公式ファンゲーム」）・クレジット・README に明記。「コラボ」「パートナーシップ」など公式と誤認される言葉は使わない。販売・収益化（広告・投げ銭を含む）はしない（非ホルダーの商用利用は審査・契約が必要）。CNP のモデルの見た目は素材屋CNP のイラスト由来なので「本作オリジナル」と書かない。公式サイトのメインビジュアルは AI にも素材にも使わない
- **任天堂（スマブラ）**: 仕組み（％ダメージ・ストック・崖つかまり）は使っているが、固有の名前・決め台詞・見た目は避ける。「READY TO FIGHT」→「いざ、勝負」、「GAME SET」→「勝負あり」、「大乱闘」「スマブラ風」は削除済み。リポジトリ名・既定のブランチ名も「スマブラ」「smash」を連想させない名前に変えた
- コミットメッセージや成果物にモデル名（AI のモデル名）は書かない

## 未解決（次にやること）

2026-09-26 に済んだこと: CNP の利用ガイドラインの確認（[GUIDELINES.md](GUIDELINES.md)）、「月下乱舞」への改名、月蝕綺譚の公式モデル（4体分の GLB）を git の履歴から消して全ブランチに強制 push（ユーザーの了承済み。コミットの ID はそれ以前と変わっている）、リポジトリ名（`smabra` → `gekka-ranbu`）と既定のブランチ名（→ `main`）の変更（新しいリポジトリへ移す案は、URL が切れる・PR のページが消えるなどの理由でやめた）。

1. **GitHub 上の古いコミット**: 履歴からは消えたが、GLB を含む古いコミットは GitHub 上に残っていて、ハッシュを指定すると今も見られる。2026-09-26 にユーザーが GitHub サポートに削除を依頼した（返事待ち。消えたかを確かめるリンクはユーザーが持っている）。**古いコミットのハッシュは、このメモにもコミットメッセージにも PR にも書かない**（書くとそこからたどれてしまう）
2. Artifact は非公開のまま（2026-09-26 に月下乱舞の版へ更新）。広く公開するかはユーザー判断

## 環境メモ

- 許可ドメイン（2026-09-26 時点）: `www.ninja-dao.com`、`www.cryptoninja-partners.xyz`、`sozaiya.cryptoninja-partners.xyz`（`www.` 付きは拒否）、`static.wixstatic.com`（素材屋CNP のイラスト置き場）、`vibe.co.jp`、`kura.vibe.co.jp`、`cn-lore-mcp.nubonba.workers.dev`
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
