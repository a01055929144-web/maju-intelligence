import pg from "pg";
import { checkP1Concurrency } from "./test-pricing-p1-concurrency.mjs";
import { readFile } from "node:fs/promises";
const url = process.env.PRICING_P1_LOCAL_DATABASE_URL;
if (!url)
  throw new Error(
    "Set PRICING_P1_LOCAL_DATABASE_URL to a NEW disposable PG16 database",
  );
const target = new URL(url);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  !target.pathname.startsWith("/pricing_p1_test")
)
  throw new Error("Only loopback pricing_p1_test databases are allowed");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const v = await client.query("show server_version_num");
  if (Math.floor(Number(v.rows[0].server_version_num) / 10000) !== 16)
    throw new Error("PG16 required");
  for (const path of [
    "tests/sql/pricing-p1-fixture.sql",
    "docs/sql-drafts/20261030-pricing-p0.sql",
    "docs/sql-drafts/20261030-pricing-p1.sql",
    "tests/sql/pricing-p1.sql",
  ]) {
    await client.query(
      (await readFile(new URL("../" + path, import.meta.url), "utf8")).replace(
        /^\uFEFF/,
        "",
      ),
    );
    console.log("PASS " + path);
  }
} finally {
  await client.end();
}

await checkP1Concurrency(url);
