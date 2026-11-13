# CC-41 금액 입력칸 천 단위 쉼표 (표 공통) + 분류 칸 잘림 (2026-11-13 20:17 대표) — 작은 개선

> 컨트롤타워 확인 · 담당 Claude Code. 공용 부품. DB 없음. P3(보기·입력 실수 위험).

## 증상

가격 관리 › 카탈로그 판매가 칸이 `6980` `56760`처럼 쉼표 없이 보임. 옆 매입가·이익(글자)은 `6,345원`처럼 쉼표 있음 → 한 줄 안에서 형식이 다르고, 큰 금액(31045980) 읽기 어려움.

## 원인

금액 **입력칸**은 화면마다 `<input inputMode="numeric" defaultValue={price}>` 또는 `type="number"`를 직접 씀 — 공용 금액 입력 부품이 없음. 글자로 보여 주는 곳만 `toLocaleString()`.

금액 입력칸이 있는 파일(25): pricing-sales-price-table · pricing-store-prices · pricing-promotion-basket · pricing-promotions-workspace · pricing-doc-paper · pricing-documents-workspace · pricing-info-panel · pricing-margin-groups · pricing-margin-templates · price-sheets-workspace · product-catalog-admin · product-catalog-workspace · product-supplier-workspace · purchase-cost-workspace · purchase-history-panel · business-document-workspace · inventory-workspace · mobile-quote-builder · mobile-delivery-proof-panel · store-order-settings-workspace · company-profile-form · admin-billing-workspace · admin/billing/plan-settings · permit-leads-view · sales-route-map-workspace (금액이 아닌 숫자칸은 제외 — 마진 %, 수량, 순서 등).

## 고칠 것

1. **공용 `MoneyInput`**(`components/money-input.tsx`) + 해석 함수 `parseMoney`(`domains/shared` 또는 기존 숫자 도우미 옆):
   - 보일 때·입력 중 모두 `56,760` (입력하면서 쉼표 자동, 커서 위치 유지). 끝에 회색 `원`(선택).
   - `type="text" inputMode="numeric"` — `type="number"`는 쉼표를 못 넣고 휠로 값이 바뀌므로 금액칸엔 쓰지 않음.
   - 붙여넣기 `56,760원`·`56760`·` 56 760 ` → 56760. 음수는 prop `allowNegative`일 때만(매출 조정 등). 소수 없음(원 단위).
   - 값 전달은 숫자(`onCommit(number)`), Enter=확정·Esc=원래 값 — 판매가 표 지금 동작 그대로.
2. 위 25개 파일의 **금액칸만** `MoneyInput`으로 교체(동작 변화 없음, 형식만). 마진 %·수량·개수 칸은 그대로.
3. 금액 **글자**도 한 곳: `formatWon(n)`(이미 있으면 재사용) — 표에서 `toLocaleString()+"원"` 흩어진 것 중 공용 표 열은 `format: "won"` 옵션으로.
4. **분류 칸 잘림**(같은 화면): `공산품 > 양념·조미료 > 향신료`가 두 줄로 넘어가다 반쯤 잘림. 공용 표에서 긴 경로는 **한 줄 + 말줄임**, 앞쪽(대분류)을 줄이고 마지막 분류는 남김(`… > 조미료 > 향신료`), 마우스 올리면 전체(title).

## Done

- 단위: parseMoney(쉼표·원·공백·빈값·음수 허용/거부) · 입력 중 쉼표 위치 · Enter/Esc.
- e2e(1440·390): 판매가 칸 `56,760` 표시 → `57000` 입력 → `57,000` 저장 · 모바일 숫자 키패드.
- `grep -rn 'type="number"' components | grep -iE "price|cost|amount|단가|금액"` 결과 0.
- 캡처 1440: 판매가·매장 가격·행사 담기·견적서 종이. CI · Ponytail. 현황판은 묶음 갱신 때.
