import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// store_account_members ↔ store_accounts 사이에는 FK가 두 개(store_account_members_company_id_store_account_id_fkey,
// store_accounts_terms_member_fk)라서 힌트 없는 `store_accounts!inner(...)`는 PostgREST PGRST201(300)로 실패한다.
// 2026-11-10 운영에서 매장 카카오 로그인(/api/auth/kakao/callback)이 이 오류로 실패했다.
const files = [
  "lib/store/07-store-portal.ts",
  "lib/store/07-store-member-management.ts",
  "lib/store/08-store-cost-access.ts",
];

describe("store_account_members → store_accounts 임베드는 FK 힌트를 쓴다", () => {
  for (const file of files) {
    it(file, () => {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/store_accounts!inner\(/);
      expect(source).toContain("store_accounts!store_account_members_company_id_store_account_id_fkey!inner(");
    });
  }
});
