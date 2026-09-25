/**
 * MCP roster sync
 *
 * NINJAMCP（CryptoNinja のキャラクター設定を提供する MCP サーバー）に stdio で接続し、
 * CNP（CryptoNinja Partners）の各キャラの「パートナーの忍者」の情報を取得して
 * `src/data/roster.generated.json` を生成する。
 *
 *   npm run sync:roster
 *   npm run sync:roster -- --server /path/to/ninjamcp/dist/index.js
 *
 * - get_character: パートナーの忍者の ID・クラン・忍術・得物・誕生日（ワザと性能の元になる）
 * - search_lore:   CNP キャラの名前で全文検索し、忍者のプロフィールにパートナーとして載っているか照合
 * - get_worldview: クラン構成とデータ出典
 * 公開リポジトリに載せるのは「事実情報」だけ。プロフィール本文などの文章は出典元の著作物なので取り込まない。
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CNP } from "../src/data/cnp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "data", "roster.generated.json");
const REQUIRED_TOOLS = ["get_character", "search_lore", "get_worldview"];

interface Detail {
  id: string;
  name: string;
  name_en: string;
  clan: string;
  ninjutsu: string | null;
  weapon: string | null;
  birthday: string | null;
}

interface LoreHit {
  id: string;
  name: string;
  matched_fields: Record<string, string>;
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
  const client = new Client({ name: "cnp-ranbu-roster-sync", version: "2.0.0" });
  await client.connect(transport);

  const server = client.getServerVersion();
  const { tools } = await client.listTools();
  const toolNames = tools.map((t) => t.name);
  for (const t of REQUIRED_TOOLS) {
    if (!toolNames.includes(t)) throw new Error(`MCP サーバーにツール ${t} がありません（あるもの: ${toolNames.join(", ")}）`);
  }
  console.log(`connected: ${server?.name} ${server?.version} — tools: ${toolNames.join(", ")}`);

  const partners = [];
  for (const c of CNP) {
    const found = parseJson<{ count: number; characters: Detail[] }>(
      await client.callTool({ name: "get_character", arguments: { query: c.partner } }),
    ).characters;
    const d = found.find((x) => x.name === c.partner) ?? found[0];
    if (!d) throw new Error(`MCP にパートナーの忍者「${c.partner}」が見つかりません`);
    const lore = parseJson<{ character_hits: LoreHit[] }>(
      await client.callTool({ name: "search_lore", arguments: { query: c.loreKey } }),
    ).character_hits;
    const hit = lore.find((x) => x.name === d.name);
    const ninjutsu = splitLabel(d.ninjutsu);
    const weapon = splitLabel(d.weapon);
    partners.push({
      cnp: c.id,
      // 忍者のプロフィールに CNP キャラの名前が出てくるか（出てくる欄の名前だけを記録し、本文は保存しない）
      loreMention: hit ? Object.keys(hit.matched_fields) : [],
      ninja: {
        id: d.id,
        name: d.name,
        nameEn: d.name_en,
        clan: d.clan,
        ninjutsu: ninjutsu?.ja ?? null,
        ninjutsuEn: ninjutsu?.en ?? null,
        weapon: weapon?.ja ?? null,
        weaponEn: weapon?.en ?? null,
        birthday: d.birthday ?? null,
      },
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
    partners,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

  console.log(`wrote ${partners.length} partners, ${clans.length} clans → ${OUT}`);
  for (const p of partners) {
    const c = CNP.find((x) => x.id === p.cnp)!;
    const n = p.ninja;
    console.log(
      `  ${c.name.padEnd(5, "　")} ← ${n.id} ${n.name.padEnd(5, "　")} ${n.clan.padEnd(3, "　")} 忍術:${n.ninjutsu ?? "-"} / 得物:${n.weapon ?? "-"}` +
        (p.loreMention.length ? `  [MCP に記載: ${p.loreMention.join(",")}]` : "  [MCP 未記載]"),
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
