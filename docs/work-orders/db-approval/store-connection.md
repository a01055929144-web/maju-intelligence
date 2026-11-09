# 매장 연결 해제·삭제(이용 종료) — 적용 승인 전

사용자 요청: 실제 사업자로 가입한 뒤 연결을 해제하거나 삭제할 수 있도록 구현. Owner Domain은 organization, related는 order/customer다. Domain 정책 → application 사용 사례 → 기존 supabaseRequest adapter → API·공통 UI 순서로 구현한다. 이번 허용 범위는 새 store-connection 도메인·application·adapter·API·페이지·패널 및 기존 매장 구성원/원가 화면의 연결 관리 진입 링크, 해당 테스트·SQL 초안이다.

## 동작

- 직원·관리자: 현재 매장과 **본인** 연결만 해제한다. 다른 회원/매장/카카오 계정은 유지한다. 점주는 본인 연결만 해제할 수 없고 전체 이용 종료를 선택한다.
- 점주: 매장 삭제는 **소프트 삭제(이용 종료)** 다. store_accounts.status를 closed로 전환하고 모든 active/invited 구성원을 removed로 바꾸며 초대 해시를 제거하고 현재 거래처의 기존 storefront 링크를 취소한다. 회원 이벤트에 remove 및 고정 reason을 기록한다.
- 사업자번호·거래처·주문·정산·원가·감사 기록의 물리 삭제나 익명화는 하지 않는다. 화면·확인창에서 보존을 명시한다. 개인정보 영구 삭제는 보관 의무와 다른 업무 참조를 조사한 별도 범위다. 같은 사업자번호로 즉시 재가입하는 기능도 포함하지 않는다.
- 다른 회사/매장 연결과 app_users를 변경하지 않는다. 카카오 제공자 계정 연결 전체를 끊거나 탈퇴시키지 않는다.

## SQL 및 적용 경계

- up: `docs/sql-drafts/20261109-store-connection.sql`
- down: `docs/sql-drafts/20261109-store-connection.down.sql`
- 신규 함수: `change_store_connection_v1(uuid,uuid,uuid,uuid,text)` 하나. 기존 표/열/정책/함수 정의 변경 없음. SECURITY INVOKER, EXECUTE는 service_role만.
- 선행: 기존 S2 accounts/members/events, Kakao membership FK, app_users, P2 storefront_links. 기존 service_role의 SELECT/UPDATE/INSERT 권한을 재사용하며 새 표 권한은 추가하지 않는다.
- lock_timeout 3초, statement_timeout 10초. 기존 주문의 link→account 잠금 순서를 따르며 마지막 상태·역할·사용자 상태를 DB에서 재확인한다. 회사/매장/회원/사용자 범위는 검증된 서버 세션에서 전달한다. CSRF origin 확인, no-store 응답, 원문 오류 숨김.
- 각 요청은 트랜잭션으로 전부 성공하거나 취소된다. 응답 유실 또는 동시 변경 후에는 연결 상태를 재조회한다. 중복 호출은 추가 이벤트 없이 거부된다.
- 이용 종료는 이미 처리된 주문 취소가 아니다. 종료 뒤 업무 담당자가 새 주문 링크를 발행하는 정책은 별도이며, 기존 공개 문서 열람 링크 전체를 삭제하지 않는다. 기존 공유 링크의 주문 진입도 최신 membership 검사에 따른다.
- down은 해당 reason의 이벤트가 있으면 중단한다. 실제 사용 이력이 없는 경우에만 함수 제거 가능하며, 상태/초대/링크 복구를 자동으로 하지 않는다.

## 활성화와 검증

`STORE_CONNECTION_MANAGEMENT_ENABLED=true`와 기존 매장 회원 회사 허용목록이 모두 필요하다. 기본 OFF에서 API는 membership/DB 접근 전에 404다. 운영 DB 적용·플래그 ON·배포는 이 PR에 포함하지 않는다. 분리 시험 DB 준비는 사용자 요청에 따라 중단했으며 그 환경 설정은 변경하지 않는다.

CI에서 unit 권한/위조 actor/다른 origin/OFF/오류·PC/390px 확인창 취소/실패/완료·실제 PG17 native journey를 검증한다. SQL은 폐기용 CI DB에서만 실행한다. 기존 주문 수 보존, 초대와 기존 링크 취소, 타 회사/위조 사용자/점주 본인 탈퇴/직원의 전체 종료 차단, 역할별 연결 해제를 검사한다. Superpowers/Security Audit 전용 도구 미설치: 직접 권한·회사 경계 검토 및 CI로 확인한다.
