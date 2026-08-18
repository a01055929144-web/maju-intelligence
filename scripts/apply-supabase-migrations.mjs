import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const root = process.cwd();
const env = readEnvFile(path.join(root, ".env.production.local"));
const connectionString = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;

if (!connectionString) {
  console.error("POSTGRES_URL_NON_POOLING 또는 POSTGRES_URL이 필요합니다.");
  process.exit(1);
}

const files = [
  path.join(root, "supabase", "schema.sql"),
  ...fs
    .readdirSync(path.join(root, "supabase", "migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => path.join(root, "supabase", "migrations", file))
];

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

try {
  for (const file of files) {
    const sql = fs.readFileSync(file, "utf8");
    console.log(`Applying ${path.relative(root, file)}...`);
    await client.query(sql);
  }
  console.log("Supabase migration complete.");
} finally {
  await client.end();
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [key, ...rest] = line.split("=");
        return [key, rest.join("=").replace(/^"|"$/g, "")];
      })
  );
}
