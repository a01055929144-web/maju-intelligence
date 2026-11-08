# 09 열람 전용 링크 발급 — SQL/API opt-in 승인 표

Ponytail: 사용함

상태: **SQL 미승인·미적용 / 새 기능 기본 OFF / 운영 고객·링크 테스트 중단**.

## 선택한 최소 경로

#365의 1회성 SQL은 PG17에서 원자성 검증을 통과했지만 안전한 운영 SSL/비밀값 바인딩 runner가 없다. 이번 안은 기존 서버 서명 helper·권한 검사·REST RPC 호출을 그대로 쓰고, 기존 6인자 함수의 p_links 객체에 선택적 canOrder:false를 해석하는 작은 분기를 추가한다. 별도 DB 접속 runner·새 영구 함수·새 권한은 추가하지 않는다.

## 승인 표

| 항목 | 내용 | 상태 |
|---|---|---|
| up | docs/sql-drafts/20261108-09-readonly-storefront-links.sql | 초안·실행 금지 |
| down | docs/sql-drafts/20261108-09-readonly-storefront-links.down.sql | 원문 복원 초안 |
| 함수 영향 | issue_storefront_links(uuid,uuid,jsonb,timestamptz,uuid,text) 본문만 교체 | 6인자/반환/OID/소유/ACL/SECURITY INVOKER 보존 검증 대상 |
| 새 설정 | READ_ONLY_STORE_LINKS_ENABLED=false + 빈 READ_ONLY_STORE_LINKS_COMPANY_IDS | 기본 OFF·운영 설정 변경 없음 |
| 운영 적용 | 별도 DB 승인 → 원문/권한 백업 → SQL 적용 → 읽기 검증 | 미승인·미실행 |
| 기능 사용 | SQL 적용·읽기 검증 후 별도 허용이 있어야 설정 ON | 현재 금지 |
| 운영 고객·링크 시험 | 자동 배송 후보/감사 흔적 위험으로 중단 | 생성 금지 |

## 동작 계약

- canOrder 생략/true는 일반 발급의 기존 기본 true 유지. 기존 활성 링크 재사용 계약도 유지한다. 기존 false 링크는 false 요청에만 재사용한다. 일반 true/생략 요청은 orderable_link_existing_readonly_conflict로 거부하고 회수 후 재발급을 안내한다. false를 조용히 승격하거나 일반 발급 성공으로 돌려주지 않는다.
- false는 신규 INSERT의 can_order 칸에 같은 트랜잭션으로 저장한다. 발급 뒤 PATCH로 끄지 않는다.
- false 요청에 기존 활성 true 링크가 있으면 readonly_link_existing_orderable_conflict로 전체 요청을 거부한다. 기존 주문 가능 링크를 임의 변경하지 않는다.
- null/문자열/숫자 canOrder는 거부한다. 회사·고객·문서 권한 검사와 회사 행 잠금/기존 멱등 재사용은 유지한다.
- API는 단일 create만 false opt-in을 허용하며 서버 설정 OFF 또는 인증된 companyId가 서버 allowlist에 없으면 DB 읽기/발급 전에 거부한다. 요청 body의 회사값으로 허용 여부를 결정하지 않는다. bulk는 false를 거부한다. 일반 요청은 새 JSON 값을 보내지 않는다.
- 기존 인증 화면은 서버 허용 시에만 한 매장용 열람 전용 선택을 보여 준다. 테스트 fixture는 기존 CI 전용 조건에서만 사용하며 실제 API/운영 설정을 켜지 않는다.
- 03 수락 경로는 새 값을 보내지 않아 기본 true이며 기존 false와 충돌하면 전체 수락을 롤백한다. 실제 03 RPC를 재사용해 수락 요청/가격 링크/협의 단가/리드 변경의 전체 롤백과 회수 후 정상 수락·재시도를 검증한다. 03/07 파일은 수정하지 않는다. 03 API의 새 충돌 코드 안내 문구는 03 소유자의 계약 검토 대상이다.

## 대안 승인 경계

- #365: 기존 함수 호출+UPDATE를 같은 트랜잭션으로 묶는 one-off 검증 초안. PG17/CI 통과했으나 안전한 운영 runner가 없어 실행 불가. 선택 경로가 아니며 두 SQL을 함께 적용하지 않는다.
- #368: 이 문서의 영구 함수 최소 패치+기존 API opt-in 대안. 권장 후보이며 SQL 미승인·미적용, 설정 OFF·allowlist 비어 있음. 최종 검토 전 Draft 유지.

## 적용/복구 순서

운영 적용 및 테스트는 이번 작업 범위가 아니다. 미래 승인 시 먼저 SQL을 적용하고 원문/ACL·6인자·false 생성/회사 경계 읽기 검증을 마친 후에만 새 설정을 허용한다. **설정을 먼저 켜면 미적용 함수는 false를 무시하므로 금지**한다.

복구는 READ_ONLY_STORE_LINKS_ENABLED를 먼저 OFF로 하고 발급 요청을 멈추고 활성 false 링크를 승인된 회수 절차로 닫은 뒤 원문을 복원한다. down은 활성 false 링크가 남아 있으면 readonly_issuer_down_refused_active_readonly_links로 거부하며, 기존 링크 행을 변경하지 않고 false 링크를 true로 전환하거나 삭제하지 않는다. 같은 버전 true 링크와 충돌 시 사용자에게 회수 확인 후 재발급을 안내한다. 회수/고객 정리도 별도 운영 승인 범위다.

## 검증

- API: 기본 OFF, 기본 생략/true, 명시 false 단일 RPC, 잘못된 타입, 권한 없음, bulk false 거부, 기존 true 충돌 후 추가 쓰기 없음.
- PG17 loopback readonly_link_patch_test: up/down/up, OID/ACL 보존, 기본 true·명시 false, 커밋 전 외부 비노출, 다른 회사 batch 전체 롤백, 2연결 false 발급 재시도 1건, 토큰 복원, 회수, 활성 false 링크가 있으면 down 거부, 회수 후 down·false 행 보존.
- PC1440/390: 기존 발급 화면 OFF 선택 숨김, CI 전용 opt-in 선택·일괄 차단, 합성 18품목 /store 열람·주문 불가·회수 404. 제품 API에는 합성 응답만 사용한다.
- 별도 격리 PG17 실데이터→/store UI 검증은 후속으로 분리한다. 운영 첫 주문/실제 인증/발송/수락/주문 성공이라고 보고하지 않는다.

운영 읽기 기준은 2026-11-08 15:48:20 KST 링크·고객·주문 0건이었다. 이후 운영 쓰기는 하지 않았다. 검증 결과는 PR의 최신 커밋 CI를 기준으로 확인한다.
