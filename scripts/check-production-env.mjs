import fs from "node:fs";
import path from "node:path";

const envFiles = [".env.production.local", ".env.local", ".env"].map((file) => path.join(process.cwd(), file));
const required = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "CUSTOMER_EMAIL",
  "CUSTOMER_PASSWORD",
  "CUSTOMER_COMPANY_ID",
  "COMPANY_ORIGIN_ADDRESS",
  "TMAP_API_KEY",
  "KAKAO_REST_KEY",
  "NEXT_PUBLIC_KAKAO_MAP_APP_KEY"
];
const optional = [
  "OPINET_API_KEY",
  "NTS_BUSINESS_API_KEY",
  "NAVER_SEARCH_CLIENT_ID",
  "NAVER_SEARCH_CLIENT_SECRET",
  "NCP_DATALAB_CLIENT_ID",
  "NCP_DATALAB_CLIENT_SECRET",
  "GOV_RESTAURANT_API_KEY",
  "SEOUL_OPENDATA_API_KEY"
];

const env = {
  ...envFiles.reduce((values, filePath) => ({ ...values, ...readEnvFile(filePath) }), {}),
  ...process.env
};
const rows = required.map((key) => {
  const value = envValue(key);
  return {
    key,
    required: true,
    present: Boolean(value),
    length: value.length
  };
});
const optionalRows = optional.map((key) => {
  const value = envValue(key);
  return {
    key,
    required: false,
    present: Boolean(value),
    length: value.length
  };
});

console.table([...rows, ...optionalRows]);

if (!rows.some((row) => row.key.startsWith("POSTGRES_URL") && row.present)) {
  process.exitCode = 1;
  console.error("POSTGRES_URL_NON_POOLING 또는 POSTGRES_URL이 필요합니다.");
}

if (!env.SUPABASE_SERVICE_ROLE_KEY && !env.SUPABASE_SECRET_KEY) {
  process.exitCode = 1;
  console.error("SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_SECRET_KEY가 필요합니다.");
}

if (!envValue("NEXT_PUBLIC_APP_URL")) {
  process.exitCode = 1;
  console.error("NEXT_PUBLIC_APP_URL이 필요합니다. Vercel Production URL을 등록하세요.");
}

if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
  process.exitCode = 1;
  console.error("ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_SESSION_SECRET이 모두 필요합니다.");
}

if (!env.CUSTOMER_EMAIL || !env.CUSTOMER_PASSWORD || !env.CUSTOMER_COMPANY_ID) {
  process.exitCode = 1;
  console.error("CUSTOMER_EMAIL, CUSTOMER_PASSWORD, CUSTOMER_COMPANY_ID가 모두 필요합니다.");
}

if (!env.COMPANY_ORIGIN_ADDRESS || !env.TMAP_API_KEY) {
  process.exitCode = 1;
  console.error("COMPANY_ORIGIN_ADDRESS와 TMAP_API_KEY가 필요합니다.");
}

if (!env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY) {
  process.exitCode = 1;
  console.error("NEXT_PUBLIC_KAKAO_MAP_APP_KEY가 필요합니다.");
}

if (!env.NTS_BUSINESS_API_KEY) {
  console.warn("NTS_BUSINESS_API_KEY가 없으면 국세청 사업자 휴폐업 상태조회가 제한됩니다.");
}

function envValue(key) {
  if (key === "NEXT_PUBLIC_APP_URL") {
    const vercelUrl = env.VERCEL_URL ? `https://${String(env.VERCEL_URL).replace(/^https?:\/\//, "")}` : "";
    return env.NEXT_PUBLIC_APP_URL || vercelUrl;
  }
  return env[key] || "";
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8").replace(/\u0000/g, "").replace(/^\uFEFF/, "");
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [key, ...rest] = line.split("=");
        return [key, rest.join("=").replace(/^"|"$/g, "")];
      })
  );
}
