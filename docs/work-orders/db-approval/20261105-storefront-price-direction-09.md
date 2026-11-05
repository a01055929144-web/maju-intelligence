# 주문 링크 게시 판매가 등락 — 승인 초안

Ponytail: 사용함. #257 매입가 설계를 대체하는 독립 브랜치다. 운영 DB/플래그/배포 변경 없음.

| 항목 | 내용 |
|---|---|
| 대상 | 운영 `fcmdvveqmcgtioelzqun`, 새 명시 승인 전 실행 금지 |
| 변경 | 기존 회사 주문 설정에 공개 동의 boolean 기본 OFF, service_role 전용 동의 저장 함수 1개 |
| up/down | `docs/sql-drafts/20261105-storefront-price-direction{,.down}.sql` |
| 유지 | 게시 버전·주문 링크·판매가·원가·마진 규칙·매입 이력은 수정하지 않음 |
| 원복 | 서버 기능 OFF 후 down. 다른 주문 설정 값은 유지 |

판매가의 원본은 기존 마진 그룹·품목 규칙·직접 단가가 반영되어 확정된 `pricing_document_versions.content.lines[].price`다. 새 가격 계산식·이력 테이블을 만들지 않는다. 같은 문서의 현재 링크 고정 버전 N과 직전 게시 버전 N-1만 읽는다. 이후 N+1 발행이나 P0 재계산이 과거 링크의 가격/비교 기준을 바꾸지 않는다.

동일 상품 ID·판매 단위·규격·과세·행사 식별자·수신처를 비교한다. 이전 값 없음·표시 비활성·중복 품목·조건 불일치는 숨긴다. 협의단가/싯가로 실제 표시 가격이 게시가와 달라지는 품목도 숨긴다. 비교 가능할 때만 상승/하락/보합 enum을 전달한다. 원가·매입처·마진율·변동률·과거 금액은 공개 DTO에 넣지 않는다.

`STOREFRONT_PRICE_DIRECTION_ENABLED`와 회사 공개 동의가 모두 켜져야 이력을 조회한다. 기본 OFF다. 새 SQL 승인/적용 전 활성화하지 않는다. #257의 매입가 SQL은 운영에 실행하지 않았고 이 브랜치에는 포함하지 않는다. 매입 확인 테이블·원본 갱신 트리거·04 가격 이력·03 문서 목록 API를 수정하지 않는다.


## 운영 적용 기록 — 2026-11-05

- 대표가 컨트롤타워에서 운영 `fcmdvveqmcgtioelzqun` 대상 SQL 적용을 명시 승인했다(2026-11-05 23:11 KST). 컨트롤타워가 `apply_migration`으로 1회 적용했다. 이 기록 PR에서는 운영 재실행·데이터 쓰기를 하지 않는다.
- 운영 마이그레이션: `20261105141341`, 이름 `storefront_price_direction_20261105`. 저장소 기록: `supabase/migrations/20261105141341_storefront_price_direction.sql`. SQL 초안 본문은 그대로이며 적용 완료·재실행 금지 주석만 앞에 추가했다.
- 컨트롤타워 적용 후 검증: `column_ok=1`, `function_acl_ok=1`, `settings_rows=0`; 기존 `store_order_settings` RLS ON, anon/authenticated SELECT 권한 없음. 09는 마이그레이션 목록에서 해당 버전을 읽기 전용으로 재확인했다.
- `STOREFRONT_PRICE_DIRECTION_ENABLED`와 회사 공개 동의는 OFF 유지. 이번 기록은 기능 활성화·운영 재배포 승인이 아니다.
- 위의 승인 전 경계는 당시 초안 상태 기록이며, SQL 적용 승인은 이 절로 갱신한다. 향후 재실행과 down은 별도 검토 없이 수행하지 않는다.
