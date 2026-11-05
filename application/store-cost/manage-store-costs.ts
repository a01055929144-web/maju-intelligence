import { createHash } from "node:crypto";
import { collapseStoreCostDuplicates, validateStoreCostInput, type StoreCostInput } from "../../domains/store-cost/store-cost";

export type StoreCostScope = { companyId: string; storeAccountId: string; memberId: string };
export type StoreCostSearch = { from?: string; to?: string; product?: string };

export interface StoreCostRepository {
  list(scope: StoreCostScope, search: StoreCostSearch): Promise<unknown>;
  history(scope: StoreCostScope, itemId: string): Promise<unknown>;
  import(scope: StoreCostScope, input: { fileName: string; sha256: string; rows: readonly StoreCostInput[] }): Promise<unknown>;
  edit(scope: StoreCostScope, itemId: string, expectedRevision: number, row: StoreCostInput): Promise<unknown>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertScope(scope: StoreCostScope) {
  if (![scope.companyId, scope.storeAccountId, scope.memberId].every(value => uuid.test(value))) {
    throw new Error("회사·매장·멤버 범위를 확인해 주세요.");
  }
}

export function manageStoreCosts(repository: StoreCostRepository) {
  return {
    list(scope: StoreCostScope, search: StoreCostSearch = {}) {
      assertScope(scope);
      if (search.product && search.product.length > 100) throw new Error("검색어는 100자 이하로 입력해 주세요.");
      return repository.list(scope, search);
    },
    history(scope: StoreCostScope, itemId: string) {
      assertScope(scope);
      if (!uuid.test(itemId)) throw new Error("원가 항목을 확인해 주세요.");
      return repository.history(scope, itemId);
    },
    import(scope: StoreCostScope, fileName: string, bytes: Uint8Array, rows: readonly StoreCostInput[]) {
      assertScope(scope);
      if (!fileName.trim() || fileName.length > 255 || bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) {
        throw new Error("10MB 이하의 파일을 선택해 주세요.");
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      return repository.import(scope, { fileName: fileName.trim(), sha256, rows: collapseStoreCostDuplicates(rows.map(row => validateStoreCostInput(row))) });
    },
    edit(scope: StoreCostScope, itemId: string, expectedRevision: number, row: StoreCostInput) {
      assertScope(scope);
      if (!uuid.test(itemId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
        throw new Error("원가 항목의 수정 버전을 확인해 주세요.");
      }
      return repository.edit(scope, itemId, expectedRevision, validateStoreCostInput(row));
    },
  };
}
