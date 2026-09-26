# 月蝕綺譚 -Luna Occulta- の 3D モデル（ゲーム版 GLB）

このゲームで使っている、月蝕綺譚の公式 3D モデルの台帳です。本作は非公式のファンメイド作品で、月蝕綺譚の公式とは関係ありません。

- 出典: 月蝕綺譚 二次創作「3Dの間」 https://vibe.co.jp/luna-occulta/fanworks/models （素材蔵 https://kura.vibe.co.jp/ の台帳 `index.json`）
- 利用条件: 月蝕綺譚 二次創作ガイドライン https://vibe.co.jp/luna-occulta/fanworks
  - 二次創作のゲームに組み込んで公開するのは OK（改変・リグ替えも OK）
  - **モデルそのままの再配布（モデル集としての転載）・モデル単体の販売は NG**
  - 公式を名乗る使い方・公式と誤認させる使い方は NG

再配布にならないよう、**GLB ファイルはこのリポジトリに入れていません。** `manifest.json` に素材蔵の URL と sha256 だけを書いておき、`npm run sync:kitan`（`dev` / `build` / `build:single` / `e2e` の前にも自動で実行）で `models/`（git 管理外）へ取得します。sha256 が台帳と違うファイルは使いません。

ゲームでは、元の骨（6本）の割り当てをもとに、頂点をこのゲームの共通骨格（肩・肘・股・膝）へ割り当て直して動かしています（`src/render3d/characters/kitan.ts`）。
