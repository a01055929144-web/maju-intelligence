import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

type AuthKind = "admin" | "customer";

const viewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 }
] as const;

const routes: Array<{ auth: AuthKind; path: string; slug: string }> = [
  { auth: "admin", path: "/admin", slug: "admin" },
  { auth: "admin", path: "/admin/companies", slug: "admin-companies" },
  { auth: "admin", path: "/admin/billing", slug: "admin-billing" },
  { auth: "customer", path: "/leads", slug: "leads" },
  { auth: "customer", path: "/map", slug: "map" },
  { auth: "customer", path: "/dashboard", slug: "dashboard" },
  { auth: "customer", path: "/settings/billing", slug: "settings-billing" },
  { auth: "customer", path: "/dashboard/settings/company", slug: "settings-company" },
  { auth: "customer", path: "/dashboard/settings/staff", slug: "settings-staff" },
  { auth: "customer", path: "/dashboard/settings/routes", slug: "settings-routes" },
  { auth: "customer", path: "/dashboard/settings/advanced", slug: "settings-advanced" },
  { auth: "customer", path: "/mobile/sales", slug: "mobile-sales" },
  { auth: "customer", path: "/mobile/today", slug: "mobile-today" }
];

// Existing responsive debt is kept visible in CI output without preventing the
// first automated guard from landing. Any new route/viewport/problem still
// fails the build. Remove entries as the owning UI project fixes each screen.
const knownLayoutDebt: Record<string, string[]> = {
  "/admin/billing@768": ["clipped-control:최근 결제:"],
  "/dashboard/settings/company@390": ["horizontal-overflow:", "clipped-control:"],
  "/dashboard/settings/advanced@390": ["clipped-control:"]
};

function splitKnownLayoutDebt(path: string, width: number, problems: string[]) {
  const allowedPrefixes = knownLayoutDebt[`${path}@${width}`] ?? [];
  return {
    known: problems.filter((problem) => allowedPrefixes.some((prefix) => problem.startsWith(prefix))),
    unexpected: problems.filter((problem) => !allowedPrefixes.some((prefix) => problem.startsWith(prefix)))
  };
}

async function authenticatedContext(browser: Browser, auth: AuthKind, width: number, height: number) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    viewport: { width, height }
  });
  const response = await context.request.post(auth === "admin" ? "/api/admin/login" : "/api/customer/login", {
    data:
      auth === "admin"
        ? { email: "ci-admin@example.test", password: "ci-admin-layout-password-2026" }
        : { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" }
  });
  expect(response.ok(), `${auth} test login failed: ${response.status()}`).toBeTruthy();
  return context;
}

async function collectLayoutProblems(page: Page) {
  return page.evaluate(() => {
    const tolerance = 3;
    const problems: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth + tolerance) {
      problems.push(`horizontal-overflow:${root.scrollWidth}>${root.clientWidth}`);
    }

    const interactive = Array.from(
      document.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[role="button"]')
    ).filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 4 && rect.height > 4;
    });

    for (const element of interactive) {
      const rect = element.getBoundingClientRect();
      if (rect.left < -tolerance || rect.right > innerWidth + tolerance) {
        const label = (element.getAttribute("aria-label") || element.textContent || element.tagName).trim().slice(0, 40);
        problems.push(`clipped-control:${label}:${Math.round(rect.left)}..${Math.round(rect.right)}`);
      }
    }

    const suspiciousText = Array.from(document.querySelectorAll<HTMLElement>("button,a,label,th,[role=tab]"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const hit = document.elementFromPoint(
          Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2)),
          Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2))
        );
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          !element.closest('[aria-hidden="true"],[hidden]') &&
          rect.right > 0 &&
          rect.left < innerWidth &&
          rect.bottom > 0 &&
          rect.top < innerHeight &&
          Boolean(hit && (element.contains(hit) || hit.contains(element)))
        );
      })
      .filter((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const characters = (node.textContent || "").trim().replace(/\s/g, "").length;
          if (characters >= 4) {
            const range = document.createRange();
            range.selectNodeContents(node);
            const lineTops = new Set(
              Array.from(range.getClientRects())
                .filter((rect) => rect.width > 1 && rect.height > 1)
                .map((rect) => Math.round(rect.top))
            );
            if (lineTops.size >= 3 && characters / lineTops.size <= 2) return true;
          }
          node = walker.nextNode();
        }
        return false;
      });
    for (const element of suspiciousText.slice(0, 10)) {
      problems.push(`narrow-text:${(element.textContent || "").trim().slice(0, 30)}`);
    }

    return Array.from(new Set(problems));
  });
}

for (const viewport of viewports) {
  test(`major routes stay responsive at ${viewport.width}px`, async ({ browser }, testInfo) => {
    const failures: string[] = [];
    for (const route of routes) {
      const context: BrowserContext = await authenticatedContext(browser, route.auth, viewport.width, viewport.height);
      try {
        const page = await context.newPage();
        const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
        if (!response || response.status() >= 400) {
          failures.push(`${route.path} @ ${viewport.width}px: HTTP ${response?.status() ?? "no response"}`);
          continue;
        }
        await page.waitForTimeout(500);

        const screenshotPath = testInfo.outputPath(`${route.slug}-${viewport.width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        const problems = await collectLayoutProblems(page);
        const { known, unexpected } = splitKnownLayoutDebt(route.path, viewport.width, problems);
        if (known.length > 0) {
          console.warn(`[known-layout-debt] ${route.path} @ ${viewport.width}px: ${known.join(", ")}`);
        }
        if (unexpected.length > 0) {
          failures.push(`${route.path} @ ${viewport.width}px: ${unexpected.join(", ")}`);
        }
      } finally {
        await context.close();
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
}
