# 문서 작성 오류 조사 · 순차 수정

기준: main c7ab679, 2026-11-18. 운영 쓰기·민감 로그 출력·실데이터 자동 보정 없음. #1109 연장 Draft는 서버 계약 대기이며 수정·배포 선행 조건이 아니다. 품목 마감 작업은 별도 작업 트리에 보존하고 문서 오류를 먼저 처리한다.

## 1. 초안 저장 실패

확정된 결함: API가 PricingInputError/DocumentSendError 외의 모든 쓰기 실패를 409 + 동시 수정 가능성 안내로 반환했다. 원본 Error 로그에는 PostgREST details/hint의 데이터가 포함될 수 있었다.

저장 19는 정상 revision일 수 있다. UI는 저장된 draft.revision을 expected로 보내고 성공 응답 후에만 수정 번호를 바꾼다. SQL은 save에서 pricing_p1_clean을 먼저 호출하므로 행사 참조/단가표 허용 검증 실패가 revision 비교보다 먼저 발생한다. ‘행사 3개’ 자체도 오류 조건이 아니다. 신고 화면의 원본 서버 오류를 확보하지 않은 상태에서 실제 신고 건을 특정 오류로 확정하지 않는다.

이번 수정: 확인된 stale만 409, 삭제 행사·단가표 미허용·비활성 상품은 고칠 행동을 담은 400, 알 수 없는 저장 오류는 503. DB 오류를 서버 저장 오류로 알리고 안전한 SQLSTATE만 제공한다. raw message/details/hint·문서/회사/품목 식별자는 로그나 응답에 내보내지 않는다. 실패 시 기존 편집 내용/수정 번호 유지. 기존 동일 저장 재시도와 발행 불변 규칙 유지. SQL/가격/공통 UI 변경 없음.

검증 근거: tests/pricing-p1-route.test.ts(실제 API POST·expected19·오류 분류·민감 정보 비노출), tests/sql/pricing-document-save-errors.pg17.test.sql(실제 P1 RPC·19 정상/충돌/행사 삭제·미허용·세금 우선순위), tests/e2e/pricing-document-actions.spec.ts(1440/390·행사3·입력 보존·동일 요청 재시도). 새 테스트는 CI 실행 전까지 통과로 간주하지 않는다.

## 2. 세금 구분 갱신 — 다음 별도 PR

코드상 확정 경로:
- 일반 행: lineFromCatalog로 담을 때 taxType 복사, 이후 상품 변경은 자동 반영하지 않음.
- 신규 행사: pricing-promotions-workspace에서 promo?.taxType || taxable. 원상품 면세를 상속하지 않음.
- 행사 담기: 문서에서 p.taxType 사용. pricing_p1_clean도 promo.tax_type을 우선하므로 문서 행의 선택을 다시 덮어씀.
- 기존 발행본: 별도 content 스냅샷. 상품/행사 변경으로 자동 갱신하면 안 됨.

추천 경계: 새 행사는 서버에서 현재 원상품 taxType을 읽어 상속(unknown은 사용자 확인), 기존 행사는 원상품과 불일치를 표시하고 명시적으로 수정, 행사 문서행의 저장 불가능한 세금 선택은 잠그고 행사 수정 경로 안내. 일반 초안은 명시적 ‘현재 상품 세금 구분 확인/반영’으로 변경 요약 후 revision 저장. 읽기만으로 저장값을 바꾸거나 기존 발행본을 보정하지 않는다. 운영 상품/행사 원본의 실제 불일치 건수는 이번 합성 재현과 구분하며 아직 조회하지 않았다.

RPC가 원상품과의 일치 강제를 담당해야 하면 SQL 초안+down+PG17+승인표로 분리한다. 현행 행사 taxType 저장 경로로 가능한 수정과 새 SQL이 필요한 경계를 먼저 확인한다.

## 3. 부가세 — 세금 갱신과 다른 PR

DEFAULT_DISPLAY.priceIncludesTax=false는 기존 문서 호환 해석에도 쓰인다. 전역 기본값을 true로 바꾸면 저장 설정 없는 기존 발행본까지 바뀔 수 있으므로 새 문서 생성 지점에만 true를 지정한다. documentDisplayPrice는 과세+포함 표시 시 1.1을 곱하고 편집 MoneyInput은 표시값을 1.1로 나눠 저장한다. 행사 가격을 포함 고정가로 해석하려면 표시뿐 아니라 편집·온라인·공개 storefront·주문 RPC의 price_includes_tax 전달까지 같이 검증해야 한다. 표시만 고쳐 금액 불일치를 만들지 않는다. 기존 발행본에는 새 해석을 소급하지 않는다. 05의 document.ts/preview 병합 뒤 최신 main에서 작업한다.

## 4. 비고 서식 — 별도 PR

기존 content.footer는 문자열이다. 글자 크기/굵게는 JSON display 필드로 저장 가능한지 서버 clean whitelist를 먼저 확인한다. 줄바꿈은 문자열 그대로 저장·출력되는지 확인한다. 새 DB 칸 필요 여부와 SQL 필요 여부를 구분하고, 필요하면 초안/down/PG17까지만 진행한다. 05 인쇄 파일 직접 수정 금지.

## 문서 작성 여정 점검표

| 행동 | 현재 근거 | 재현된 결함 / 수정 | 잔여 확인 |
|---|---|---|---|
| 작성 | workspace create/blankContent, pricing-p1-document 시험 | 새 문서 VAT 기본 제외 | 별도 VAT PR, 기존 발행본 보존 |
| 상품 담기·규격 | lineFromCatalog, pricing-spec-flow / document-actions 시험 | 세금은 담은 시점 스냅샷 | 현재 값 반영의 명시적 동작 |
| 가격·세금 | documentDisplayPrice, document-display / p2-published-price 시험 | 행사 원본 우선, 포함가 중복 가산 위험 | 과세/면세·일반/행사/임박 금액 대조 |
| 행사·임박 | promotions workspace, p1_clean, promotion-save-cc34 시험 | 신규 과세 고정, 문서 세금 편집 서버 덮어쓰기 | 신규 상속·기존 수정·불일치 안내 PR |
| 저장·재열기 | p1-route, P1 RPC, document-actions 시험 | 모든 쓰기 409 → 이번 오류 분류 PR | CI·1440/390 결과, 실제 신고 오류 코드 |
| 발행 버전 | immutable trigger, p1 SQL 시험 | 이번 변경은 발행본 불변 유지 | 세금/VAT 후속에서도 과거 금액 대조 |
| 공개 링크·QR | document-actions / lead-sharing 시험 | 이번 변경 없음 | 최종 통합 시험 |
| 온라인·인쇄·PNG | documentOutput/printPages, paper-columns / actions 시험 | 05에서 A4 후속 진행 | 05 병합 뒤 통합 1440/390 |
| 권한·빈 화면·오류 | p1-route role/company/OFF 시험, 공유 경계 시험 | raw DB 로그·일괄 stale 안내 제거 | 인증/회사 격리 회귀 CI |

운영 배포는 컨트롤타워에서 준비 완료 후 수행. 운영 SQL 프로젝트 명시 승인은 별도이며 이 문서는 적용 승인이 아니다.
