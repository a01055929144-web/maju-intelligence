import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const roots = [["supabase/migrations", "적용 기록"], ["docs/sql-drafts", "승인 전 초안"]];
const tables = new Map();

function table(name) {
  const key = name.replace(/^public\./i, "").toLowerCase();
  if (!tables.has(key)) tables.set(key, { columns: new Set(), fks: new Set(), sources: new Set(), rls: new Set() });
  return tables.get(key);
}

function bodyAt(sql, start) {
  let depth = 1;
  let quote = false;
  for (let i = start; i < sql.length; i++) {
    if (sql[i] === "'" && sql[i - 1] !== "\\") quote = !quote;
    if (quote) continue;
    if (sql[i] === "(") depth++;
    if (sql[i] === ")" && --depth === 0) return sql.slice(start, i);
  }
  return "";
}

function topLevelParts(body) {
  const parts = [];
  let start = 0, depth = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(") depth++;
    if (body[i] === ")") depth--;
    if (body[i] === "," && depth === 0) { parts.push(body.slice(start, i)); start = i + 1; }
  }
  parts.push(body.slice(start));
  return parts;
}

for (const [root, status] of roots) {
  for (const file of (await readdir(root)).filter((name) => name.endsWith(".sql") && !/\.(down|test)\.sql$/.test(name)).sort()) {
    const path = join(root, file).replaceAll("\\", "/");
    const sql = (await readFile(path, "utf8")).replace(/--[^\n]*/g, "");
    const creates = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?((?:public\.)?[a-z_][\w]*)\s*\(/gi;
    for (const match of sql.matchAll(creates)) {
      const item = table(match[1]);
      item.sources.add(`${status}: ${path}`);
      for (const part of topLevelParts(bodyAt(sql, match.index + match[0].length))) {
        const column = /^\s*([a-z_][\w]*)\s+/i.exec(part)?.[1];
        if (column && !/^(constraint|primary|foreign|unique|check)$/.test(column.toLowerCase())) item.columns.add(column);
        for (const fk of part.matchAll(/\breferences\s+((?:public\.)?[a-z_][\w]*)/gi)) item.fks.add(fk[1]);
      }
    }
    for (const match of sql.matchAll(/\balter\s+table\s+(?:if\s+exists\s+)?((?:public\.)?[a-z_][\w]*)\s+([^;]+);/gi)) {
      const item = table(match[1]);
      for (const part of topLevelParts(match[2])) {
        const column = /\badd\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][\w]*)/i.exec(part)?.[1];
        if (column) { item.sources.add(`${status}: ${path}`); item.columns.add(column); }
        for (const fk of part.matchAll(/\breferences\s+((?:public\.)?[a-z_][\w]*)/gi)) {
          item.sources.add(`${status}: ${path}`);
          item.fks.add(fk[1]);
        }
      }
    }
    for (const match of sql.matchAll(/\balter\s+table\s+((?:public\.)?[a-z_][\w]*)\s+enable\s+row\s+level\s+security/gi)) table(match[1]).rls.add(status);
  }
}

const lines = [
  "# 스키마 목록 (자동 생성)", "", "`node scripts/gen-schema-doc.mjs`로 생성합니다. **적용 기록은 저장소 기록이며 운영 DB 적용 여부를 증명하지 않습니다.** 초안은 실행 금지입니다.", "",
  "| 테이블 | 칸 | FK 대상 | RLS 선언 | 출처 |", "|---|---|---|---|---|"
];
for (const [name, item] of [...tables].sort(([a], [b]) => a.localeCompare(b))) {
  const sources = [...item.sources].sort().map((entry) => `\`${entry}\``).join("<br>");
  lines.push(`| \`${name}\` | ${[...item.columns].sort().map((v) => `\`${v}\``).join(", ") || "—"} | ${[...item.fks].sort().map((v) => `\`${v}\``).join(", ") || "—"} | ${[...item.rls].sort().join(" / ") || "확인 필요"} | ${sources} |`);
}
const output = `${lines.join("\n")}\n`;
const target = "docs/backend/01_SCHEMA.md";
if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8")).replaceAll("\r\n", "\n") !== output) throw new Error(`${target} is stale; run node scripts/gen-schema-doc.mjs`);
} else await writeFile(target, output);
