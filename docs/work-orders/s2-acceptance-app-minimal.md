# S-2 앱 1단계 — 직원 대신 수락

Ponytail: 사용함

기준 main: `1182236` / 적용 RPC: `record_pricing_document_acceptance`. 이 PR은 직원 대리 수락 연결이며 [0] 전체 완료가 아니다. 운영 쓰기·플래그 ON·배포는 컨트롤타워 담당이다.

## 구현

- 기존 링크 관리에 버튼 하나: **직원 대신 수락**. 기존 거래처를 선택하거나 매장 이름·연락처·주소를 입력해 기존 거래처 없이 진행한다.
- `?leadId=<UUID>` 진입은 같은 회사의 활성 대표 리드만 미리 채운다. 병합 리드는 거부한다. 리드 상세의 진입 버튼 연결은 후속이다.
- `/api/pricing-document-acceptance`는 기존 직원 인증, `manage_sales`, 회사 스코프, 같은 Origin을 확인한다. 매장 인증으로 직원 세션을 사용하지 않는다.
- 회사의 다른 직원이 작성한 견적도 대리 수락 가능하다. 수락용 선택 목록은 제목·버전만 반환하며 가격·원가·전체 문서 내용을 반환하지 않는다. 일반 P1 편집 권한은 유지한다.
- 기존 거래처는 회사 범위 서버 정보만 사용한다. 새 매장·리드는 `p_customer_id=null`과 검증한 기본정보를 보내 SQL의 매칭·전환을 사용한다. 가격·회사·수락 주체를 브라우저에서 받지 않는다.
- 같은 선택·입력 재시도는 같은 멱등 키와 지문을 사용한다. 다른 선택은 새 키를 사용한다. `needsReview` 결과는 검토 필요로 표시하며 이 경로는 주문 링크를 발급·활성화하지 않는다.
- `QUOTE_ACCEPTANCE=true` **AND** `FEATURE_QUOTE_ACCEPTANCE_COMPANY_IDS`의 정확한 회사 일치가 모두 필요하다. 전역 `FEATURE_QUOTE_ACCEPTANCE=true`만으로는 켜지지 않는다. PR은 환경 변수를 설정하지 않는다.

## 검증과 한계

서버 API 테스트는 실제 라우트→서버 어댑터→적용 RPC 이름/인수까지 실행하되 DB 호출만 합성 대역으로 바꾼다. sheet/quote, 다른 작성자, 신규 매장·대표 리드, 병합/다른 회사, 권한·Origin·크기, 멱등 지문, 검토 보류를 검증한다. 기존 storefront 계약 단가 우선 테스트를 함께 실행한다.

Playwright는 합성 회사에서 1440px·390px의 수락 버튼·실패 재시도·검토 안내·새 매장 입력을 검증한다. 운영 DB 쓰기나 실제 카카오/NTS 로그인 시험은 아니다. 적용 SQL의 PG17 검증은 #180의 증거와 구분한다.

Superpowers·Security Audit 미설치. 인증/회사 격리 변경이므로 Claude 검토 후 진행한다.

로컬 최종 검증: 타입 검사·린트·배포 빌드·API 인증 경계 통과, 관련 서버/회사 게이트/계약 단가 테스트 22개 통과. 브라우저는 별도 로컬 포트에서 390px·1440px 두 시나리오 모두 통과했다. 운영 환경 변수는 변경하지 않았다.

PG17 별도 새 DB에서 `tests/sql/s2-review-mismatch-repro.sql`로 적용 SQL의 리드 불일치를 재현했다: `needsReview=true`, `agreementCreated=true`, `priceLinkCreated=true`, `orderEnabled=true`(호출에 링크 ID를 전달한 경우). 이 앱 API는 링크 ID를 전달하지 않으며 결과에 `orderEnabled=false`를 명시한다. SQL 자체 보완은 별도 `codex/S2-review-hold-draft`의 승인 초안으로 분리한다. SQL 보완 전 운영 ON/E2E 완료로 보고하지 않는다.

## [0] 후속 필수와 확인한 선행 조건

운영 `pg_proc` 읽기 확인 결과 `record_pricing_document_acceptance`, `place_store_order`는 존재하지만 `create_store_account`, `invite_store_account_member`, `accept_store_account_invite`, `remove_store_account_member`, `transfer_store_account_owner`는 없다(2026-11-02 확인). 승인 문서에는 계정 원자 RPC 계약이 있으나 적용 migration에는 테이블만 있다.

매장 카카오 경로는 직원 카카오와 계정/세션/권한을 분리하고, 카카오 사용자 확인→필수 약관·매장 아이디·NTS 계속 사업자 확인→원자 계정 생성→수락→첫 주문으로 연결해야 한다. REST 여러 번으로 원자 계정 가입·주문자 귀속을 흉내 내지 않는다. 계정 RPC와 활성 구성원 잠금·주문자 기록을 한 트랜잭션으로 처리할 주문 계약은 03·07 선행 사항이다.

현재 일반 링크 발급은 P2 작성자 권한을 유지한다. 관리자 대리 수락 후 다른 작성자의 견적 링크까지 관리자가 발급하는 P2 권한 계약, 수락 결과와 링크의 멱등 연결, 매장 카카오 수락·최초 주문은 후속 필수다. 이를 마칠 때까지 [0] 완료·플래그 ON·배포로 보고하지 않는다.
