# A1 개업일 신뢰 — 원인과 작업지시 (11/3)

## 원인 (코드·운영 DB 확인)
- `lib/gov-restaurant.ts`·`lib/seoul-restaurant.ts`가 `openDate: permitDate`로 인허가일을 그대로 개업일로 씀.
- 대표자 변경(영업자 지위승계)·재허가 시 인허가일이 새 날짜로 바뀌어 신규 개업처럼 보임.
- 사례: 그로타 지간테 강남일원 — permit_date 2026-10-26, source gov_restaurant_api, 같은 주소의 이전 인허가 행 없음(첫 적재가 '영업 중'만 받아서 과거 폐업 이력이 DB에 없음), review_count 비어 있음.

## 이번 PR(Claude)에서 한 것
- 화면 표기 "개업일" → "인허가일", 필터 툴팁에 "대표자 변경·재허가 날짜일 수 있음" 안내.

## Codex 작업지시 (Owner Domain: lead / Related: analytics)
1. 수집 시 `updateKind`·`lastModified`·`salesStatusCode`를 lead에 보존하고, 같은 주소(도로명 정규화)+같은 업종의 과거 폐업 레코드를 공공 API에서 조회(폐업 포함 요청).
2. `open_date_confidence`: `confirmed`(같은 주소 이전 이력 없음 + 리뷰 0~소수) / `reopen_suspected`(같은 주소 과거 폐업 이력 또는 인허가일 이전 리뷰·블로그 존재 또는 리뷰 수가 인허가 경과일 대비 과다) / `unknown`.
3. `reopen_suspected`는 신규 리드 기본 목록에서 제외, "재개업 의심 포함" 토글로 보기. 상세에 판정 근거 1줄.
4. DB: `business_permit_leads.open_date_confidence text`, `open_date_evidence jsonb` — 승인 문구 필요.
5. 테스트: 그로타 지간테 케이스 fixture로 `reopen_suspected`.
