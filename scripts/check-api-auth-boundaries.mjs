import fs from "node:fs";
import path from "node:path";

const apiRoot = path.join(process.cwd(), "app", "api");

// These endpoints must be reachable before a user session exists, are authenticated by
// a provider/webhook secret, or intentionally expose only non-sensitive readiness data.
// Adding an entry here is an explicit security decision and should include a short reason.
const publicRoutes = new Map([
  ["pricing-documents/order-intent/route.ts", "default-OFF bounded same-origin token-only POST; DB-verified issuer/document/version/revocation/expiry, tenant allowlist and S2 guard; 07 short-lived signed intent or 07-verified single-store same-version link; no browser customer/store IDs or order writes"],
  ["pricing-document-acceptance/route.ts", "default-OFF purpose-signed delivered-document token, tenant allowlist, verified send/version/lead and S2 request guard; optional staff or 07 store-member session"],
  ["pricing-documents/public/route.ts", "default-OFF purpose-signed lead document link, same-origin bounded POST, tenant allowlist and S2 request guard; sales whitelist only"],
  ["admin/logout/route.ts", "clears the admin session cookie only (CC-39: other sites stay signed in)"],
  ["auth/logout-all/route.ts", "clears the admin, customer and store session cookies of this browser only; no session needed"],
  ["auth/forgot-password/route.ts", "starts the rate-limited password reset flow"],
  ["auth/google/callback/route.ts", "OAuth provider callback"],
  ["auth/google/start/route.ts", "OAuth authorization entry point"],
  ["auth/kakao/callback/route.ts", "OAuth provider callback"],
  ["auth/kakao/start/route.ts", "OAuth authorization entry point"],
  ["auth/invite-phone/route.ts", "rate-limited invite phone last-four check before Kakao sign-in; sets a signed 15-minute cookie bound to the invite code"],
  ["auth/naver/callback/route.ts", "OAuth provider callback"],
  ["auth/naver/start/route.ts", "OAuth authorization entry point"],
  ["auth/reset-password/route.ts", "completes the token-protected password reset flow"],
  ["billing/callback/route.ts", "payment-provider callback authenticated by billing data"],
  ["company-signup/route.ts", "creates a new company before a session exists"],
  ["customer/logout/route.ts", "clears the customer session cookie only (CC-39: other sites stay signed in)"],
  ["health/route.ts", "returns aggregate readiness counts without tenant data"],
  ["leads/permits/sync/route.ts", "retired endpoint that always returns HTTP 410"],
  ["public/quotes/[token]/route.ts", "token-based public quote lookup validates UUID and expiry while excluding cost and margin fields"],
  ["staff/invite-preview/route.ts", "rate-limited invite preview required before sign-in"],
  ["store/accounts/activate/route.ts", "default-OFF one-time owner token plus explicit terms acceptance; stores proof only in a signed HttpOnly cookie before Kakao OAuth"],
  ["store/members/accept/route.ts", "default-OFF same-origin one-time member invite token; stores proof only in a signed HttpOnly cookie before Kakao OAuth"],
  ["store/profile/route.ts", "default-OFF STORE_DIRECT_SIGNUP_ENABLED; signed Kakao store session cookie; same-origin POST creates only the caller's own profile; GET lists only the caller's own profiles"],
  ["store/connect/route.ts", "default-OFF STORE_DIRECT_SIGNUP_ENABLED; signed Kakao store session cookie; same-origin POST; DB-backed failure throttle; connects only the caller's own owner profile and reveals nothing about which distributor a code belongs to"],
  ["storefront/route.ts", "feature-gated store link; signed bearer token maps to exactly one customer and published version"]
]);

const sessionGuardPatterns = [
  /\bgetRequestAuthScope\s*\(/,
  /\bmarginTemplateGate\s*\(/,
  /\bpromotionAudienceGate\s*\(/, // lib/pricing/promotion-audience-gate.ts: getRequestAuthScope + PROMOTION_AUDIENCE switch + manage_sales + owner/manager
  /\bdistributorGate\s*\(/, // lib/distributor-gate.ts: getRequestAuthScope + manage_customers + DISTRIBUTOR_SALES // lib/pricing/margin-template-gate.ts wraps getRequestAuthScope + feature switch + manage_sales
  /\bgetCustomerSession\s*\(/,
  /\bgetStoreMemberContext\s*\(/,
  /\bgetAdminSession\s*\(/,
  /\brequireAdminSession\s*\(/,
  /\bvalidateAdminCredentials\s*\(/,
  /\bvalidateCustomerCredentials\s*\(/
];

function listRouteFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listRouteFiles(target);
    return entry.isFile() && entry.name === "route.ts" ? [target] : [];
  });
}

function relativeRoute(filePath) {
  return path.relative(apiRoot, filePath).split(path.sep).join("/");
}

function hasCronSecretGuard(source) {
  return /process\.env\.CRON_SECRET/.test(source) && /headers\.get\(["']authorization["']\)/.test(source);
}

function hasDeviceTokenGuard(source) {
  return /headers\.get\(["']authorization["']\)/.test(source)
    && /startsWith\(["']Device ["']\)/.test(source)
    && /saveStaffLocationBatch\s*\(/.test(source);
}

function hasStoreCostApplicationGuard(source) {
  return /from ["']@\/application\/organization\/store-cost(?:s|-import)["']/.test(source)
    && /\b(readStoreCosts|changeStoreCost|previewStoreCostImport|applyStoreCostImport)\s*\(/.test(source);
}

const routeFiles = listRouteFiles(apiRoot);
const failures = [];

for (const filePath of routeFiles) {
  const route = relativeRoute(filePath);
  const source = fs.readFileSync(filePath, "utf8");
  if (publicRoutes.has(route)) continue;
  if (sessionGuardPatterns.some((pattern) => pattern.test(source)) || hasCronSecretGuard(source)
    || hasDeviceTokenGuard(source) || hasStoreCostApplicationGuard(source)) continue;
  failures.push(route);
}

const staleAllowlistEntries = Array.from(publicRoutes.keys()).filter(
  (route) => !routeFiles.some((filePath) => relativeRoute(filePath) === route)
);

if (failures.length || staleAllowlistEntries.length) {
  if (failures.length) {
    console.error("API authentication boundary missing:");
    failures.forEach((route) => console.error(`- app/api/${route}`));
  }
  if (staleAllowlistEntries.length) {
    console.error("Stale public-route allowlist entries:");
    staleAllowlistEntries.forEach((route) => console.error(`- app/api/${route}`));
  }
  process.exit(1);
}

console.log(`API auth boundary check passed: ${routeFiles.length} routes, ${publicRoutes.size} explicit public routes.`);
