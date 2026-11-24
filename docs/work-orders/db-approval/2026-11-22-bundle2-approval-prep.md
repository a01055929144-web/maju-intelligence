# 운영 DB 승인 묶음 2 — 승인 준비 기록 (첫 주문 전)

2026-11-22 Claude Code · 운영 `fcmdvveqmcgtioelzqun` **읽기 전용** · 기준 main `a07285a`. **이 문서는 적용 권한을 주지 않는다.** 대표가 아래 문구를 그대로 답한 건만, 순서대로 1회 적용한다(재실행 금지, audit 기록은 같은 트랜잭션). CX-66은 11/19 적용 완료([대조 기록](2026-11-22-CX-66-applied-verification.md))라 이 묶음에서 제외.

| 순서 | 대상 | SQL sha256(앞 16) up · down | PG17 | 현재 운영 상태(읽기) | 승인 문구 |
|---|---|---|---|---|---|
| 1 | S-3d 개업 준비 가입 게이트 | `fbb5e96a527c885d` · `497d9c158f400ad3` | ✅ 전용 PG17 CI 연결. 기존 11/10 공개 흐름 → S-3d 교체 후 셀프 가입 차단·준비 토큰 허용 → down 후 기존 흐름 복구·준비 토큰 차단과 ACL을 검증 | `activate_preopening_store_owner_v1` 있음 = 11/10 `20261110-store-preopening.sql` 본문과 일치. S-3d가 이 함수를 교체하며 down은 기존 본문을 복구. **시험 미연결 보류 사유 해소** | `fcmdvveqmcgtioelzqun S-3d 개업 준비 가입 게이트 SQL 승인` |
| 2 | S-3a 매장 정보 입력(CX-71) | `5964b90881cb7531` · `b947f979ecc1848e` | CI 연결됨(`store-profile-delivery-cx71.pg17.test.sql`) | 새 테이블 2·새 함수 1·새 열 4 **전부 없음**(충돌 0). `store_profiles` 1행 | `fcmdvveqmcgtioelzqun S-3a 매장 정보 입력 CX-71 SQL 승인` |
| 3 | S-3e 출입 비밀번호 읽기(CX-73) | `017def9b1c4b1313` · `45ef45d07e4da084` | CI 연결됨(`…CX-73…pg17.test.sql`, `68b87c1fcd56d253`) | `read_store_access_password_v1` 없음. **선행: S-3a(`access_password` 열)** | `fcmdvveqmcgtioelzqun S-3e 출입 비밀번호 읽기 CX-73 SQL 승인` |
| 4 | CX-62 주문 접수 · 작성중 매출 전표 | `625bbd4b21efc534` · `edeb0b6c44aa18b0` | CI 연결됨(`…CX-62…pg17.test.sql`, `5c983a8a7c23d89d`) | 새 함수 3·트리거 2 **없음**. 선행 CX-38 함수 5개 있음, `store_orders_review_guard` 트리거 있음, 주문 0건. 기존 승인표 [CX-62](2026-11-17-CX-62-order-receipt.md) | `fcmdvveqmcgtioelzqun CX-62 주문 접수 작성중 매출 전표 SQL 승인` |
| 5 | CX-117 상품별 주문 마감 차단(#1266 병합) | `78ea23d21e4fc1c7` · `38088c429edec339` | 합성 PG17 `tests/sql/store-order-core-cx75.pg17.test.sql`에 추가돼 CI 연결됨 | 운영 `place_store_order_core_v2`가 SQL이 바꾸는 문장을 **정확히 1번씩** 포함(게이트 1·오류문 1), security definer, 실행 권한 service_role만, 소유자 postgres, 주문 0건. 선행 D4(품목 마감 열) 11/22 적용 완료 | `fcmdvveqmcgtioelzqun CX-117 상품별 주문 마감 차단 SQL 승인` |

## 주의
- **돈 경로:** CX-62·CX-117은 주문 접수·마감에 닿는다. 기능 스위치는 모두 OFF 상태로 두고, ON은 별도 승인.
- S-3d 전용 PG17 CI는 독립 PostgreSQL 17 DB에서 실행한다. 기존 운영 본문과 교체 초안의 차이, down 복구, ACL 회귀를 모두 통과해야 승인 준비 완료다.
- CX-117 SQL은 운영 함수 정의를 문자열 치환한다. 적용 직전 위 "정확히 1번씩" 조건을 다시 읽는다(함수가 바뀌었으면 SQL이 스스로 중단).
- 순서: S-3d → S-3a → S-3e → CX-62 → CX-117. 각 건이 읽기 검증을 통과한 뒤 다음으로.
