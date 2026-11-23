# CX-121 회사 공용 단가표 기간 연장 — DB 승인 대기

- 대상 프로젝트: `fcmdvveqmcgtioelzqun`
- 적용 SQL: `docs/sql-drafts/2026-11-23-CX-121-company-common-extension.sql`
- 안전 down: `docs/sql-drafts/2026-11-23-CX-121-company-common-extension.down.sql`
- 승인 상태: **미승인 · 미적용**
- 기능 상태: 기본 OFF, 회사 allowlist 미승인

## 원인과 계약

- 기존 CX-121은 연장 방식과 무관하게 고객 연결을 요구해 회사 공용 `이번 달 단가표`를 `extension_customer_required`로 차단했다.
- 회사 공용 문서는 `keep`만 허용한다. 최신 게시본의 일반·행사 가격과 품목을 그대로 두고 유효기간만 연장한다.
- `latest`, 새 품목, 가격 수정은 고객별 가격 기준 없이는 차단한다. 회사 공용 기본가를 임의로 대신 사용하지 않는다.
- 매출처 연결 문서의 기존 `keep`·`latest` 계약은 변경하지 않는다.
- `extension-policy` 응답이 공용 문서에는 `allowedModes=[keep]`, `canAddProducts=false`, 매출처 연결 문서에는 `allowedModes=[keep,latest]`, `canAddProducts=true`를 명시한다. 화면은 제목·받는 사람 문구로 자격을 추측하지 않는다.

## 불변 조건

- 기존 게시본, 공유 링크의 고정 `document_version_id`, 과거 주문 `document_version_id`는 수정하지 않는다.
- 새 게시본만 문서 링크 머리로 연결하며 기존 멱등·검토 토큰·회사 격리 경계를 재사용한다.
- 공개 함수는 `service_role`만 실행 가능하고 기능은 적용 뒤에도 OFF다.

## 검증

- PG17: 현재 행사가가 바뀌어도 공용 `keep`은 기존 게시 가격을 보존한다.
- PG17: 공용 `latest`, 새 품목 가격 조회, 가격 수정은 차단한다.
- 실제 API: start→save→review→publish, 기존 게시본·공유 링크·주문 버전 불변을 확인한다.
- down: 진행 중인 공용 연장 상태가 있으면 거부한다.

이 문서는 운영 적용 권한을 부여하지 않는다. CX-121 운영 적용 완료 뒤 별도 대표 승인을 받아 한 번만 적용한다.
