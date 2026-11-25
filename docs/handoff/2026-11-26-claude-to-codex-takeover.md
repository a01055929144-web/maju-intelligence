# Claude 한도 시 Codex 인계 (2026-11-26 대표 지시)

Claude(관제탑 또는 Claude Code)가 토큰 한도로 멈추면 **Codex 총괄방이 이 문서대로 이어 받는다.** 대표는 Codex 총괄방에 "R19 인계 진행"이라고만 보내면 된다.

## 1. 누가 멈췄는지 구분

| 멈춘 쪽 | 확인 방법 | Codex가 이어 받는 것 |
|---|---|---|
| Claude Code (대표 PC) | 현황판 R19의 Claude Code 줄이 1시간 이상 그대로 + 대표가 "클로드코드 한도" 알림 | 아래 2절 대기열 |
| 관제탑 (claude.ai) | 대표가 "관제탑 한도" 알림 | 아래 3절 역할 |

## 2. Claude Code 대기열 인계 (순서 고정)

1. **열린 `claude/*` PR 먼저**: `gh pr list --search "head:claude/"`. CI 빨강이면 원인 수정(테스트 약화 금지), 초록이면 Ponytail 점검 후 병합. 브랜치를 새로 만들지 말고 그 브랜치에 커밋.
2. **푸시 안 된 작업**: Claude Code 로컬에만 있는 커밋은 볼 수 없다. 현황판에 "구현 중"인데 원격 브랜치가 없으면 대표에게 "Claude Code 창에서 `git push` 한 번만" 요청. 응답 없으면 지시서대로 새로 시작.
3. 남은 순서: CX-145 P1-5(하단 장바구니) → 09방, P1-6(마감 문구) → 09방, CX-151(초안) → 03방. 지시서 [R19 3절](../dispatch/2026-11-26-R19-codex.md).
4. P1-5 주의: 옆 패널 장바구니를 전제한 e2e 20+건을 새 흐름에 맞게 고치는 중이었다. store-shell·store-price-visibility의 1440 "요소 안 보임" 실패는 장바구니와 무관할 수 있으니 따로 원인 확인.

## 3. 관제탑 역할 인계

- **현황판 갱신·완료 판정**: `docs/dispatch/board/2026-11-26-R19.md`.
- **병합**: CI 전체 초록 + 본문 `Ponytail: 사용함` + Files 범위 확인 후 squash.
- **배포**: 11/23 규칙대로 Codex 총괄방 담당. 단 대표가 "배포해"라고 한 뒤에만, 병합분을 묶어 한 번. 순서: 현황판 잠금 → main CI·Stage A 초록 → Vercel Production READY → 스모크(`/login` `/dashboard` `/leads` `/revenue/pricing` `/revenue/pricing/documents` `/revenue/products` `/store` + 공개 단가표 PC·390) → 서버 오류 확인 → 회귀면 직전 READY로 되돌림 → 기록.
- **운영 DB**: 대표 승인 문구를 받은 쪽이 적용 → 읽기 검증 → `docs/work-orders/db-approval/` 기록. 래퍼 함수가 security invoker이면 내부 함수 `service_role` grant 확인(11/25 장애).
- **첫 실주문 사전 확인** (대표가 상세 주소 입력했다고 하면, 읽기 전용):

```sql
select c.customer_name,
       coalesce(c.delivery_base_address,'') <> '' as has_base,
       coalesce(c.delivery_address_detail,'') <> '' as has_detail,
       t.name as territory, r.delivery_weekdays
from normalized_customers c
left join delivery_territories t on t.id = c.delivery_territory_id
left join store_order_territory_rules r on r.territory_id = t.id and r.company_id = c.company_id
where c.id = '979b9c11-263a-4fcc-8293-4763b078dd49';
-- 11/26 02:05 결과: has_base=true, has_detail=false, 기본 배송 권역(영업 지역), {1..6}
```

  셋 다 참 + 권역 연결 + 요일 {1..6}이면 대표에게 시험 주문 요청. 주문 후 주문 건·품목 금액이 받은 단가표 표시가와 같은지 읽기 확인. 전화번호는 끝 4자리만 보고.

## 4. 지금 상태 요약 (11/26 02:00)

- 운영 READY `aaea4cc`. 미배포 병합: #1433.
- 켜진 플래그(대표 회사): STORE_PRICE_VISIBILITY, FIELD_RECORDS, STORE_CATALOG_LINK, COMPANY_LINK_UNIFY, STORE_RELATION_HOME, STORE_SIGNUP_LINK, ADMIN_STORE_CONNECTION, STORE_CONNECTION_MANAGEMENT_ENABLED, STORE_PHONE_LINK, STORE_RECEIVED_ORDER_HOME, STORE_ORDER_ADDRESS_VERIFICATION.
- 11/24~26 운영 SQL 적용: CX-142, CX-144 U0·U0b·grant fix, CX-146, CX-148, CX-148b, CX-149, 기본 배송권역 데이터. 기록은 모두 `docs/work-orders/db-approval/`.
- 전체 개발 목록: `docs/inventory/2026-11-25-development-inventory.md`(159건, 삭제 없음).
- 하지 말 것: 대표 회사 외 고객사 플래그 ON, 돈 기능 ON, 매입가 매장 노출, 휴대폰 원문 출력, 문서·항목 삭제.
