// 月蝕綺譚の公式 3D モデル（ゲーム版 GLB）を素材蔵から取ってくる（npm run sync:kitan）。
//
// 二次創作ガイドラインでは「作品に組み込んで公開するのは OK、モデルそのままの再配布は NG」なので、
// モデルはリポジトリに入れず、ビルドの前にここで取得する（src/assets/kitan/models/ は .gitignore 済み）。
// 取れなかったキャラはゲームの中で仮の形になる（ビルドは止めない）。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'src/assets/kitan/manifest.json'), 'utf8'));
const outDir = join(root, 'src/assets/kitan/models');
mkdirSync(outDir, { recursive: true });

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
let ok = 0;
let failed = 0;
for (const m of manifest.models) {
  const file = join(outDir, m.file);
  if (existsSync(file) && sha(readFileSync(file)) === m.sha256) {
    ok++;
    continue;
  }
  try {
    const res = await fetch(m.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha(buf) !== m.sha256) throw new Error('sha256 が台帳と一致しません');
    writeFileSync(file, buf);
    ok++;
    console.log(`取得: ${m.file}`);
  } catch (e) {
    failed++;
    console.warn(`取得できませんでした: ${m.file}（${m.url}）: ${e.message}`);
  }
}
console.log(`月蝕綺譚のモデル: ${ok}/${manifest.models.length}${failed ? `（${failed} 件は仮の形で表示されます）` : ''}`);
