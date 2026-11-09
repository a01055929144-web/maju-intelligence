# 09 거래처 없는 공개 문서 진입 — DB 승인 대기

상태: 검토용 SQL 초안 / 기본 OFF / 운영 미적용. 이 문서는 적용 승인이 아니다.

## 변경 범위

- 기존 09 공개 공유 테이블 `pricing_document_share_links.lead_id`만 nullable로 완화한다.
- 일반 공개 링크는 lead_id/send_id 모두 NULL. 기존 회사·문서·게시 버전 복합 FK, 소유자·만료·불변·회수 검증 및 service-only RLS/권한을 유지한다.
- 링크 생성·열람은 거래처·점주 계정·주문·문서 전달·접촉 기록을 생성하지 않는다.
- 기존 리드별 공유/실제 전달 API는 그대로 유지하고 일반 링크의 전달 기록 연결은 거부한다.
- 원본 기존 공유 SQL은 수정하지 않는다. 선행 P1/P2/S2 및 기존 공유 스키마가 별도 승인·적용되어야 한다.

## 파일과 검증

- up: `docs/sql-drafts/20261109-09-public-document-entry.sql`
- down: `docs/sql-drafts/20261109-09-public-document-entry.down.sql`
- 격리 검증: `tests/sql/public-document-entry-09.pg17.test.sql`, PostgreSQL 17 및 정확한 테스트 DB명 강제. 실제 P0/P1/P2/S2와 기존 공유 초안으로 구성한다.
- down은 일반 링크가 하나라도 남아 있으면 거부한다. 승인 없이 삭제·회수 또는 NOT NULL 강제 변환하지 않는다.
- 적용 검토 시 테이블 크기, 장기 트랜잭션/대기 잠금, nullable 및 기존 함수/ACL/회수 상태를 전후 확인한다. ALTER TABLE 잠금이 있으므로 별도 승인된 작업 시간과 짧은 lock_timeout이 필요하다.

## 활성화와 남은 연결

`PUBLIC_DOCUMENT_ORDER_ENTRY_ENABLED`와 기존 문서 공유/회사 허용목록이 모두 필요하다. 운영 설정은 변경하지 않았다.
09 서버의 `getPublicDocumentOrderContext(token,requester)`가 토큰·발행 회사·문서·게시 버전·회수·만료를 검증한다. 07은 이 결과를 짧게 서명하고 카카오 가입/매장 정보/계정 연결을 소유한다. 07 #433의 signer와 단일 active 매장 권한 helper를 재사용한다. 가입·회원·주문 조건이 모두 준비되어야 주문 진입을 표시하며, OFF 시 버튼은 비활성 준비 중이다. 가입 완료 뒤 원 문서에서 다시 시작하면 07 서버 회원 범위로 기존 issue_storefront_links를 호출해 해당 게시 버전의 매장 주문 화면으로 연결한다. 이 단계는 링크 메타데이터만 발급하고 주문을 생성하지 않는다. 공개 company/customer/store ID나 복귀 주소를 신뢰하지 않는다.

주문 품목 전체 보기는 현재 주문 링크에 게시된 품목의 필터를 해제한다. 문서 밖 회사 카탈로그 주문은 기존 주문 RPC가 거부하므로 별도 가격·주문 계약 및 SQL 승인 전까지 포함하지 않는다. 결제·운영 주문 쓰기·플래그 ON·배포는 범위 밖이다.

07 최소 계약의 실제 순서는 매장 정보·약관 → 카카오 인증 → 국세청 확인 → 회사·매장·owner 원자 연결 → 원 문서 복귀이다. 카카오 인증을 매장 정보보다 먼저 받는 2단계 흐름은 별도 07 후속 범위로 명시한다.
