/**
 * MCP roster sync
 *
 * NINJAMCP（CryptoNinja のキャラクター設定を提供する MCP サーバー）に
 * stdio で接続し、ゲームのキャラクター名簿 `src/data/roster.generated.json` を生成する。
 *
 *   npm run sync:roster
 *   npm run sync:roster -- --server /path/to/ninjamcp/dist/index.js
 *
 * 公開リポジトリに載せるのは「事実情報」だけ（ID・名前・クラン・忍術・武器・誕生日・画像URL）。
 * プロフィール本文などの文章は出典元の著作物なので取り込まない。
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "data", "roster.generated.json");
const REQUIRED_TOOLS = ["list_characters", "get_character", "get_worldview"];

interface Summary {
  id: string;
  name: string;
  name_en: string;
  clan: string;
  ninjutsu: string | null;
  weapon: string | null;
  image_url: string;
  image_url_3d: string;
}

interface Detail extends Summary {
  birthday: string | null;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function serverPath(): string {
  const p = arg("server") ?? process.env.NINJAMCP_PATH ?? join(ROOT, "node_modules", "ninjamcp", "dist", "index.js");
  const abs = resolve(p);
  if (!existsSync(abs)) {
    throw new Error(
      `NINJAMCP が見つかりません: ${abs}\n` +
        "`npm install` で optionalDependencies の ninjamcp を入れるか、--server でパスを指定してください。",
    );
  }
  return abs;
}

/** MCP のツール結果（text content の JSON）を取り出す */
function parseJson<T>(result: Awaited<ReturnType<Client["callTool"]>>): T {
  const content = result.content as { type: string; text?: string }[];
  const text = content.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("MCP ツールがテキスト結果を返しませんでした");
  return JSON.parse(text) as T;
}

/** 「火遁（Katon）」→ ja: 火遁, en: Katon */
function splitLabel(label: string | null): { ja: string; en: string | null } | null {
  if (!label || label === "None") return null;
  // 最後の（…）を英名として扱う。「匕首（ひしゅ）（Dagger）」のような読み仮名入りにも対応
  const m = label.match(/^(.*)（([^（）]+)）$/);
  if (!m) return { ja: label, en: null };
  const ja = m[1].replace(/（[^）]*）$/, "");
  return { ja, en: m[2] };
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath()],
    stderr: "pipe",
  });
  const client = new Client({ name: "ninja-ranbu-roster-sync", version: "1.0.0" });
  await client.connect(transport);

  const server = client.getServerVersion();
  const { tools } = await client.listTools();
  const toolNames = tools.map((t) => t.name);
  for (const t of REQUIRED_TOOLS) {
    if (!toolNames.includes(t)) throw new Error(`MCP サーバーにツール ${t} がありません（あるもの: ${toolNames.join(", ")}）`);
  }
  console.log(`connected: ${server?.name} ${server?.version} — tools: ${toolNames.join(", ")}`);

  const list = parseJson<{ count: number; characters: Summary[] }>(
    await client.callTool({ name: "list_characters", arguments: {} }),
  );

  const characters = [];
  for (const s of list.characters) {
    const detail = parseJson<{ characters: Detail[] }>(
      await client.callTool({ name: "get_character", arguments: { query: s.id } }),
    ).characters[0];
    const ninjutsu = splitLabel(s.ninjutsu);
    const weapon = splitLabel(s.weapon);
    characters.push({
      id: s.id,
      name: s.name,
      nameEn: s.name_en,
      clan: s.clan,
      ninjutsu: ninjutsu?.ja ?? null,
      ninjutsuEn: ninjutsu?.en ?? null,
      weapon: weapon?.ja ?? null,
      weaponEn: weapon?.en ?? null,
      birthday: detail?.birthday ?? null,
      image: s.image_url,
      image3d: s.image_url_3d,
    });
  }

  const clans = parseJson<{ clans: { name: string; members: string[] }[] }>(
    await client.callTool({ name: "get_worldview", arguments: { section: "clans" } }),
  ).clans.map((c) => ({ name: c.name, members: c.members }));

  const source = parseJson<{ source: { title: string; author: string; url: string } }>(
    await client.callTool({ name: "get_worldview", arguments: { section: "overview" } }),
  ).source;

  await client.close();

  const out = {
    $comment: "このファイルは scripts/sync-roster.ts が MCP (NINJAMCP) から自動生成します。手で編集しないでください。",
    mcp: {
      server: server?.name ?? "NINJAMCP",
      version: server?.version ?? null,
      tools: toolNames,
      syncedAt: new Date().toISOString(),
    },
    credit: source,
    clans,
    characters,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

  console.log(`wrote ${characters.length} characters, ${clans.length} clans → ${OUT}`);
  for (const c of characters) {
    console.log(`  ${c.id} ${c.name.padEnd(6, "　")} ${c.clan.padEnd(3, "　")} 忍術:${c.ninjutsu ?? "-"} / 得物:${c.weapon ?? "-"}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
