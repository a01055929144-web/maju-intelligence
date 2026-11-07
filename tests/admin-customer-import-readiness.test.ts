import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const storeSource = readFileSync("lib/store.ts", "utf8");
const pageSource = readFileSync("app/admin/system/page.tsx", "utf8");

describe("admin customer import atomic readiness", () => {
  it("keeps diagnostics read-only and hides database errors", () => {
    expect(storeSource).toContain('fetch(`${config.url}/rest/v1/`,');
    expect(storeSource).toContain("customer_imports?status=eq.processing");
    expect(storeSource).toContain("CUSTOMER_IMPORT_ATOMIC_RPC_ENABLED가 기본 OFF 상태입니다.");
    expect(storeSource).not.toContain(
      "description: `원자 저장 RPC 적용 여부를 읽기 전용으로 확인하지 못했습니다. ${getErrorMessage(error)}`"
    );
  });

  it("documents every approval and rollback checkpoint without an action button", () => {
    for (const checkpoint of [
      "PR #317 CI(42358248519)",
      "service_role 전용",
      "25MB · 5,000행 · 매핑 200개",
      "processing 0건",
      "import ID만으로 추적",
      "CUSTOMER_IMPORT_ATOMIC_RPC_ENABLED=false"
    ]) {
      expect(pageSource).toContain(checkpoint);
    }
    expect(pageSource).not.toContain("원자 저장 플래그 변경");
    expect(pageSource).not.toContain("운영 쓰기 시험");
  });
});
