import { publicOwnerTestModeRequested } from "@/lib/store/public-owner-test-mode";

export function PublicStoreTestBanner() {
  return publicOwnerTestModeRequested() ? <p role="status" className="rounded border p-3 font-semibold">시험 전용 — 시험 데이터만 입력하세요. 실제 배송·정산을 진행하지 않습니다.</p> : null;
}
