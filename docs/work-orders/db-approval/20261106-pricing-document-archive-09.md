# 견적서·단가표 보관/복원 SQL 승인 초안

Ponytail: 사용함. 운영 대상 `fcmdvveqmcgtioelzqun` 명시 승인 전 실행 금지. 운영 미적용, 기능 `PRICING_DOCUMENT_ARCHIVE_ENABLED` 기본 OFF.

기존 pricing_documents 삭제는 versions의 CASCADE, storefront_links/store_orders의 버전 NO ACTION FK와 충돌한다. 발행본과 실제 주문을 지우지 않는 보관/복원을 사용한다. 보관은 기존 링크를 폐기하거나 주문을 취소하지 않으며 UI 확인창에 이를 안내한다.

- up: `docs/sql-drafts/20261106-pricing-document-archive.sql`; down: 같은 이름 `.down.sql`.
- 컬럼 archived_at 1개, 보관 RPC 1개, 보관 중 편집·신규 발행을 막는 trigger 함수 1개/trigger 2개. 기존 권한/RLS는 그대로이며 새 함수는 service_role 전용이다.
- 기존 pricing_p1과 같은 company→document 잠금 순서, 회사·작성자·관리 권한·revision 확인 후 metadata/revision만 변경한다. 견적은 작성자, 단가표는 기존 manager 권한. 변경 전후 발행 JSON·버전 ID·링크·주문을 보존한다.
- 기존 클라이언트의 보관 문서 save/publish도 DB에서 거부한다. 복원 후 기존 편집·발행 경로를 사용한다. 새 버전 발행은 별도 명시 동작이다.
- OFF 상태에서는 archived_at을 select/filter하지 않고 새 RPC도 호출하지 않는다. 활성화는 SQL 적용/검증 뒤 별도 진행한다. 운영 데이터·env·배포 변경 없음.
- down은 flag OFF 후 별도 승인하에 수행한다. 보관 metadata를 제거해 모든 문서가 다시 보이며 문서·발행본·링크·주문을 삭제하지 않는다. 백업/활성 보관 건수와 경쟁 요청을 확인하고 실행한다.
- 검증 범위: 타 회사/타 작성자/일반 직원 단가표 거부, stale revision, 보관 중 edit/publish 거부, 복원, up/down/up, 기존 발행·링크·주문 보존. 새 폐기용 PG17에서만 테스트한다.

승인: 대기. 운영 실행: 없음. 기능 플래그: OFF.
