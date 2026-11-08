import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sources = [
  ["migration", join(root, "supabase/migrations")],
  ["draft", join(root, "docs/sql-drafts")],
];
const tables = new Map();
const ignored = /(?:test|fixture|rollback|down|backup|review)\.sql$/i;

function part(table, kind) {
  if (!tables.has(table)) tables.set(table, { migration: { columns: new Set(), fks: new Set(), rls: false, files: new Set(), confirmed: false }, draft: { columns: new Set(), fks: new Set(), rls: false, files: new Set() } });
  return tables.get(table)[kind];
}

function parenthesized(sql, opening) {
  let depth = 0;
  let quote = "";
  for (let i = opening; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      if (ch === quote && sql[i + 1] === quote) { i++; continue; }
      if (ch === quote) quote = "";
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return sql.slice(opening + 1, i);
  }
  return "";
}

function splitColumns(body) {
  const chunks = [];
  let start = 0, depth = 0, quote = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      if (ch === quote && body[i + 1] === quote) { i++; continue; }
      if (ch === quote) quote = "";
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) { chunks.push(body.slice(start, i)); start = i + 1; }
  }
  chunks.push(body.slice(start));
  return chunks;
}

function scan(sql, kind, filename) {
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z][\w]*)"?\s*\(/gi)) {
    const table = m[1].toLowerCase(), entry = part(table, kind);
    entry.files.add(filename);
    if (kind === "migration" && /운영 적용 완료/.test(sql.slice(0, 250))) entry.confirmed = true;
    for (const raw of splitColumns(parenthesized(sql, m.index + m[0].length - 1))) {
      const line = raw.trim();
      const col = line.match(/^"?([a-z][\w]*)"?\s+/i);
      if (col && !/^(?:constraint|primary|foreign|unique|check|exclude)$/.test(col[1].toLowerCase())) entry.columns.add(col[1].toLowerCase());
      for (const fk of line.matchAll(/references\s+(?:public\.)?"?([a-z][\w]*)"?/gi)) entry.fks.add(fk[1].toLowerCase());
    }
  }
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z][\w]*)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z][\w]*)"?/gi)) {
    const entry = part(m[1].toLowerCase(), kind);
    entry.columns.add(m[2].toLowerCase());
    entry.files.add(filename);
  }
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z][\w]*)"?\s+enable\s+row\s+level\s+security/gi)) {
    const entry = part(m[1].toLowerCase(), kind);
    entry.rls = true;
    entry.files.add(filename);
  }
}

for (const [kind, dir] of sources) {
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql") && !ignored.test(name)).sort()) {
    scan(readFileSync(join(dir, file), "utf8"), kind, file);
  }
}

for (const name of ["pricing_items", "store_orders"]) {
  const applied = tables.get(name)?.migration;
  if (!applied?.columns.has("company_id") || !applied.rls)
    throw new Error("Schema parser missed a known company-scoped table: " + name);
}

const rows = [...tables].sort(([a], [b]) => a.localeCompare(b)).map(([table, { migration, draft }]) => {
  const migrated = migration.files.size > 0;
  const columns = migrated ? migration.columns : draft.columns;
  const future = migrated ? [...draft.columns].filter((c) => !migration.columns.has(c)) : [];
  const fks = migrated ? migration.fks : draft.fks;
  const status = !migrated ? "초안" : migration.confirmed ? "운영 적용 완료 주석" : "migration 파일 (운영 확인 별도)";
  const source = [...(migrated ? migration.files : draft.files)].sort().map((f) => "`" + f + "`").join(", ");
  return ["| `" + table + "`", status, [...columns].sort().map((c) => "`" + c + "`").join(", ") + (future.length ? "<br>초안 추가: " + future.sort().join(", ") : ""), [...fks].sort().join(", ") || "—", (migrated ? migration : draft).rls ? "활성화 SQL 있음" : "확인 필요", source || "—"].join(" | ") + " |";
});
const output = [
  "# 스키마 파일 목록 (자동 생성)",
  "",
  "이 파일은 `node scripts/gen-schema-doc.mjs`로 생성합니다. migration 파일은 **운영 적용 증거가 아닙니다**. '운영 적용 완료 주석'은 파일 주석만 뜻합니다. SQL의 정적 CREATE TABLE / ALTER TABLE ADD COLUMN / RLS 구문을 읽으므로 동적 SQL과 모든 후속 제약은 운영 DB에서 별도 확인해야 합니다.",
  "",
  "| 테이블 | 파일 상태 | 칸 | 참조 테이블 | RLS | 근거 파일 |",
  "|---|---|---|---|---|---|",
  ...rows,
  "",
].join("\n");
const target = join(root, "docs/backend/01_SCHEMA.md");
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8").replace(/\r\n/g, "\n") !== output) {
    console.error("01_SCHEMA.md is stale. Run node scripts/gen-schema-doc.mjs.");
    process.exitCode = 1;
  }
} else writeFileSync(target, output);
