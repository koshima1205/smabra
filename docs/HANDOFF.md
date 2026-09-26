# 引き継ぎメモ（CNP乱舞）

新しいセッションで作業を続けるためのメモです。最初にこのファイルと `README.md` を読んでから始めてください。返答・報告は日本語で。

- リポジトリ: `koshima1205/smabra`（**公開リポジトリ**）
- 作業ブランチ: セッションで指定されたブランチで作業して push（既定のブランチは `claude/tsukusettan-cnp-mcp-smash-yapw36`。2026-09-26 のセッションは `claude/brave-lamport-5dko2v` で作業）
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
- **CNP / CryptoNinja**（確認結果は [GUIDELINES.md](GUIDELINES.md)）: 非公式・非営利のファンメイドであることをタイトル画面（ロゴ下の「非公式ファンゲーム」）・クレジット・README に明記。「コラボ」「パートナーシップ」など公式と誤認される言葉は使わない。販売・収益化（広告・投げ銭を含む）はしない（非ホルダーの商用利用は審査・契約が必要）。CNP のモデルの見た目は素材屋CNP のイラスト由来なので「本作オリジナル」と書かない。公式サイトのメインビジュアルは AI にも素材にも使わない
- **任天堂（スマブラ）**: 仕組み（％ダメージ・ストック・崖つかまり）は使っているが、固有の名前・決め台詞・見た目は避ける。「READY TO FIGHT」→「いざ、勝負」、「GAME SET」→「勝負あり」、「大乱闘」「スマブラ風」は削除済み
- コミットメッセージや成果物にモデル名（AI のモデル名）は書かない

## 未解決（次にやること）

CNP の利用ガイドラインの確認は 2026-09-26 に済んだ（結果は [GUIDELINES.md](GUIDELINES.md)）。非営利のファンゲームとしての 3D 化・公開は OK。残りはユーザーの判断待ち:

1. **タイトル「CNP乱舞」**: 公式の「CNP○○」（公式の対戦ゲーム「CNPバーニンウォーズ」など）と誤認されるおそれがある。改名するか、CNP 運営（Discord の NinjaDAO「cnp問い合わせ」）に確認するか。ロゴ下の「CRYPTONINJA PARTNERS RANBU」は「非公式ファンゲーム」に変更済み。改名するときは `index.html` の `<title>`、タイトル画面のロゴ（`src/ui/scenes/title.ts`）、`e2e/smoke.spec.ts` のロゴの確認、`package.json`、README・このメモ、Artifact を合わせて変える
2. **個人か法人か**: 会社の業務・PR・デモとして出すなら法人の利用にあたり、CNP とのライセンス契約が前提になる。ユーザーに確認する
3. **公開リポジトリの履歴に月蝕綺譚の公式モデル（4体分の GLB）が残っている**（`git log --all --diff-filter=A --name-only -- '*.glb'` で分かる）。「モデルそのままの再配布 NG」に当たるおそれ。消すには履歴の書き換えと強制 push が必要（リモートのブランチすべて）。**ユーザーの了承がまだ無い**ので、やる前に必ず確認する（一時的にリポジトリを非公開にする選択肢もある）
4. リポジトリ名 `smabra` とブランチ名が「スマブラ」を連想させる（CryptoNinja の禁止事項「他者の権利を侵害するおそれのある内容」にも関わる）。変えるかはユーザー判断（リポジトリ名は GitHub の設定で変える）
5. Artifact は非公開のまま、2026-09-26 の修正（ロゴ下・クレジット）はまだ反映していない。1 が決まってから更新・公開する

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
