import fs from "node:fs";
import path from "node:path";

const apiRoot = path.join(process.cwd(), "app", "api");

// These endpoints must be reachable before a user session exists, are authenticated by
// a provider/webhook secret, or intentionally expose only non-sensitive readiness data.
// Adding an entry here is an explicit security decision and should include a short reason.
const publicRoutes = new Map([
  ["admin/logout/route.ts", "clears the admin session cookie only"],
  ["auth/forgot-password/route.ts", "starts the rate-limited password reset flow"],
  ["auth/google/callback/route.ts", "OAuth provider callback"],
  ["auth/google/start/route.ts", "OAuth authorization entry point"],
  ["auth/kakao/callback/route.ts", "OAuth provider callback"],
  ["auth/kakao/start/route.ts", "OAuth authorization entry point"],
  ["auth/naver/callback/route.ts", "OAuth provider callback"],
  ["auth/naver/start/route.ts", "OAuth authorization entry point"],
  ["auth/reset-password/route.ts", "completes the token-protected password reset flow"],
  ["billing/callback/route.ts", "payment-provider callback authenticated by billing data"],
  ["company-signup/route.ts", "creates a new company before a session exists"],
  ["customer/logout/route.ts", "clears the customer session cookie only"],
  ["health/route.ts", "returns aggregate readiness counts without tenant data"],
  ["leads/permits/sync/route.ts", "retired endpoint that always returns HTTP 410"],
  ["staff/invite-preview/route.ts", "rate-limited invite preview required before sign-in"]
]);

const sessionGuardPatterns = [
  /\bgetRequestAuthScope\s*\(/,
  /\bgetCustomerSession\s*\(/,
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

const routeFiles = listRouteFiles(apiRoot);
const failures = [];

for (const filePath of routeFiles) {
  const route = relativeRoute(filePath);
  const source = fs.readFileSync(filePath, "utf8");
  if (publicRoutes.has(route)) continue;
  if (sessionGuardPatterns.some((pattern) => pattern.test(source)) || hasCronSecretGuard(source)) continue;
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
