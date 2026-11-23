# CX-121 회사 공용 단가표 기간 연장 — DB 승인 대기

- 대상 프로젝트: `fcmdvveqmcgtioelzqun`
- 적용 SQL: `docs/sql-drafts/2026-11-23-CX-121-company-common-extension.sql`
- 안전 down: `docs/sql-drafts/2026-11-23-CX-121-company-common-extension.down.sql`
- 승인 상태: **미승인 · 미적용**
- 기능 상태: CX-121 기존 기능은 대표 회사 allowlist에서 ON. 이 후속 SQL 적용 시 대표 회사에 즉시 노출될 수 있음

## 원인과 계약

- 기존 CX-121은 연장 방식과 무관하게 고객 연결을 요구해 회사 공용 `이번 달 단가표`를 `extension_customer_required`로 차단했다.
- 회사 공용 문서는 `keep`만 허용한다. 최신 게시본의 일반·행사 가격과 품목을 그대로 두고 유효기간만 연장한다.
- `latest`, 새 품목, 가격 수정은 고객별 가격 기준 없이는 차단한다. 회사 공용 기본가를 임의로 대신 사용하지 않는다.
- 매출처 연결 문서의 기존 `keep`·`latest` 계약은 변경하지 않는다.
- `extension-policy` 응답이 공용 문서에는 `allowedModes=[keep]`, `canAddProducts=false`, 매출처 연결 문서에는 `allowedModes=[keep,latest]`, `canAddProducts=true`를 명시한다. 화면은 제목·받는 사람 문구로 자격을 추측하지 않는다.

## 불변 조건

- 기존 게시본, 공유 링크의 고정 `document_version_id`, 과거 주문 `document_version_id`는 수정하지 않는다.
- 새 게시본만 문서 링크 머리로 연결하며 기존 멱등·검토 토큰·회사 격리 경계를 재사용한다.
- 공개 함수는 `service_role`만 실행 가능하다. 브라우저 역할과 내부 고객 전용 함수에는 직접 실행 권한이 없다.

## 적용 전 안전 점검

- 대상 프로젝트 `fcmdvveqmcgtioelzqun`과 이 후속 SQL을 명시한 별도 대표 승인을 확인한다.
- 대표 회사 외 회사 목록이 추가되지 않았는지 확인한다. 이번 SQL은 회사 목록·환경변수를 바꾸지 않는다.
- 기존 CX-121 SQL·CX-120 가격 함수와 API가 운영에 적용돼 있고, 진행 중인 연장 상태가 없는지 읽기 확인한다.
- 공용 문서에서는 정책 응답이 `keep`만 허용하고 `latest`·새 품목·가격 수정을 차단하는지 가짜 데이터로 먼저 확인한다.

## 적용 후 즉시 검증

- 대표 회사의 공용 문서에서 정책 응답이 `allowedModes=[keep]`, `canAddProducts=false`인지 확인한다.
- 매출처 연결 문서는 `allowedModes=[keep,latest]`, `canAddProducts=true`를 유지하는지 확인한다.
- 공용 `keep`이 기존 일반·행사 가격을 보존하고, 공용 `latest`·새 품목·가격 수정은 실패하는지 확인한다.
- 기존 게시본·공유 링크·과거 주문 버전 불변과 anon/authenticated/internal helper ACL을 확인한다.
- 이상 시 대표 회사의 `PRICING_DOCUMENT_EXTENSION_ENABLED`/회사 목록을 OFF로 되돌리고 신규 연장을 중단한다. down은 진행 중인 공용 상태가 없을 때만 별도 승인으로 검토한다.

## 검증

- PG17: 현재 행사가가 바뀌어도 공용 `keep`은 기존 게시 가격을 보존한다.
- PG17: 공용 `latest`, 새 품목 가격 조회, 가격 수정은 차단한다.
- 실제 API: start→save→review→publish, 기존 게시본·공유 링크·주문 버전 불변을 확인한다.
- down: 진행 중인 공용 연장 상태가 있으면 거부한다.

이 문서는 운영 적용 권한을 부여하지 않는다. 대상 프로젝트와 이 후속 SQL을 명시한 별도 대표 승인을 받아 한 번만 적용한다.
