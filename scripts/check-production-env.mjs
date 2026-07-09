import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.production.local");
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL",
  "TMAP_API_KEY",
  "KAKAO_REST_KEY",
  "NEXT_PUBLIC_KAKAO_MAP_APP_KEY"
];

const env = readEnvFile(envPath);
const rows = required.map((key) => {
  const value = env[key] || "";
  return {
    key,
    present: Boolean(value),
    length: value.length
  };
});

console.table(rows);

if (!rows.some((row) => row.key.startsWith("POSTGRES_URL") && row.present)) {
  process.exitCode = 1;
  console.error("POSTGRES_URL_NON_POOLING 또는 POSTGRES_URL이 필요합니다.");
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
