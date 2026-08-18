import fs from "node:fs";
import path from "node:path";

const env = readEnvFile(path.join(process.cwd(), ".env.production.local"));
const appUrl = (env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://maju-intelligence.vercel.app").replace(/\/$/, "");
const email = env.CUSTOMER_EMAIL || process.env.CUSTOMER_EMAIL || "owner@maju.local";
const password = env.CUSTOMER_PASSWORD || process.env.CUSTOMER_PASSWORD || "maju-owner-2026";

const cookieJar = new Map();

const loginResponse = await request(`${appUrl}/api/customer/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password })
});

if (!loginResponse.ok) {
  throw new Error(`로그인 실패: ${loginResponse.status} ${await loginResponse.text()}`);
}

const payload = {
  address: "서울 성동구 왕십리로 63",
  businessNumber: "123-10-10000",
  businessStatus: "정상",
  customerName: "성동 마루한식 01",
  deliveryKm: 18.3,
  deliveryManager: "김배송 매니저",
  deliveryZone: "성동·광진권",
  email: "ops-verify@example.com",
  industry: "한식",
  lastOrderDays: 0,
  loadingPosition: "후문 냉장창고 앞",
  monthlyRevenue: 234,
  phone: "010-3100-1000",
  region: "성수동",
  representativeName: "김민준",
  visitCount: 0
};

const saveResponse = await request(`${appUrl}/api/customers`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});

const saveText = await saveResponse.text();
if (!saveResponse.ok) {
  throw new Error(`거래처 저장 실패: ${saveResponse.status} ${saveText}`);
}

const result = JSON.parse(saveText);
console.log(
  JSON.stringify(
    {
      appUrl,
      persisted: Boolean(result.persisted),
      customerId: result.customer?.id || null,
      source: result.persisted ? "supabase" : "fallback"
    },
    null,
    2
  )
);

if (!result.persisted) {
  process.exitCode = 1;
  console.error("persisted:false 입니다. Supabase env 값과 SQL 마이그레이션 적용 상태를 확인하세요.");
}

async function request(url, init = {}) {
  const headers = new Headers(init.headers || {});
  const cookie = [...cookieJar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  if (cookie) headers.set("Cookie", cookie);

  const response = await fetch(url, {
    ...init,
    headers,
    redirect: "manual"
  });

  const setCookie = response.headers.getSetCookie?.() || splitSetCookie(response.headers.get("set-cookie"));
  for (const item of setCookie) {
    const [pair] = item.split(";");
    const [key, value] = pair.split("=");
    if (key && value) cookieJar.set(key.trim(), value.trim());
  }

  return response;
}

function splitSetCookie(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;=]+=[^;]+)/g);
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
