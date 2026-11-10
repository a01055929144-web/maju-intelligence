# 회사 담당자 미정 주문 조회·배송일 확정·취소 — 승인 전

선행 #458은 main `a9fe484`에 병합됐다. 이 후속은 별도 브랜치에서 주문 domain·회사 주문 API/화면과 관련 검증만 추가한다. 07 개통/카카오·03 매칭·지도/배송·ERP·중앙 체크리스트는 변경하지 않는다. 운영 DB 적용·플래그 ON·실제 주문·발송·결제는 하지 않는다.

## 회사 처리 입구와 완료 범위

기존 회사 정보의 주문 설정 부품에 `배송일 확인 대기` 링크와 현재 조회된 대기 건수를 표시한다. 25건 초과는 `25건 이상`이며 전체 건수로 오인하지 않는다. 페이지를 열 때 확인하는 화면 알림으로, 외부 메시지나 백그라운드 알림 발송은 없다. `/revenue/pricing/pending-orders`는 오래된 접수부터 25건씩 회사 내 pending/submitted·received 주문과 품목·확인된 금액을 보여 준다. 빈 상태·조회 오류·재조회·조회 전용 권한을 구분한다.

대표·관리자가 고객과 협의한 날짜를 **직접 입력하고 확인창을 승인**해야 확정된다. 날짜 초기값/자동 확정은 없다. 회사 기본 행이 없어도 거래처→권역→회사 순으로 적용 가능한 배송 요일을 지키며, 등록된 회사/권역 휴일도 확인한다. 마감 일수와 시간이 모두 정해졌으면 마감도 적용한다. 없는 값을 가짜 설정으로 채우지 않는다. 적용할 날짜 규칙이 전혀 없으면 오늘부터 366일 내의 명시적 선택 날짜로 확정할 수 있다. 날짜를 확정해도 가격·결제·배차·배송 완료·ERP를 실행하지 않는다. 기존 snapshot/배차 등 나머지 배송 준비는 해당 도메인의 기존 검증을 통과해야 한다.

받지 않을 미정 주문은 별도 확인창으로 취소한다. 주문·품목·감사 기록은 보존하고 cancelled/revision 증가만 적용한다. pending 주문 자동 만료는 없다. 오래된 순서·접수 시각·안내로 장기 대기를 확인한다. native 행사 예약 합계는 submitted 주문을 포함하므로 **명시적 취소하면 해당 예약 합계에서 제외**된다. 실제 재고 수량·원장·결제는 변경하지 않는다. 자동 만료/예약 최대 보관기간은 별도 정책 전에는 적용하지 않으며 업무 담당자가 정기 조회·확정·취소해야 한다.

## 인증·회사 경계

API 회사는 서버 세션에서 결정한다. body의 회사/회원/사용자는 사용하지 않는다. GET은 회사 대표·관리자 또는 관리자 미리보기만 허용한다. 관리자 미리보기는 조회 전용이다. 변경은 실제 회사 세션의 companyMemberId와 userId가 모두 있어야 하며 SQL에서 같은 회사의 최신 대표·관리자 역할, active 회원·사용자, 만료 시각을 다시 검사하고 잠근다. 다른 Origin, 다른 회사/사용자, 오래된 revision, 다른 payload로 재사용된 요청키는 거부한다. 응답 유실은 같은 날짜/동작·같은 요청키로 안전하게 재시도한다. 결과 확인 후 재조회 오류는 저장 실패로 표시하지 않는다.

## 새 SQL과 활성화 대기

- up: `docs/sql-drafts/20261110-09-confirm-pending-delivery.sql`
- down: 동일 이름 `.down.sql`
- 신규 `store_order_delivery_resolutions_09`: 회사/주문/담당자 FK와 요청키, confirm/cancel, 선택 날짜, 전후 revision, 처리 시각만 보관한다. 이름/사업자번호/전화·토큰 원문을 저장하지 않는다. RLS ON, PUBLIC/anon/authenticated 차단, service_role SELECT/INSERT만 허용한다.
- 대기 목록 조회용 부분 인덱스 `store_orders_pending_inbox_09_idx(company_id,submitted_at,id)`를 pending/submitted·received 행에만 추가한다. 운영 적용 전 기존 행 수·인덱스 생성 잠금 시간을 확인한다.
- 신규 `resolve_pending_order_delivery_09(uuid,uuid,uuid,uuid,uuid,integer,date,text)`: SECURITY INVOKER, service_role EXECUTE만. 회원/사용자 공유 잠금→주문 행 잠금→revision 확인→변경·감사 한 트랜잭션. 새 함수 하나 외에 기존 RPC를 덮어쓰지 않는다. 새 표 외의 권한 추가 없음. lock_timeout 3초, statement_timeout 10초.
- confirm은 delivery_date 설정 + delivery_confirmation=scheduled + revision 증가, 취소는 status=cancelled + revision 증가. pending 상태의 in_delivery/delivered 금지 제약을 제거하거나 완화하지 않는다.
- down은 처리 이력이 한 건이라도 있으면 중단한다. 날짜나 취소를 자동 되돌리거나 주문/감사 기록을 지우지 않는다.

기본 OFF `STORE_ORDER_DELIVERY_CONFIRMATION_ENABLED` + 기존 #458 pending 허용목록·가격·주문 설정이 모두 필요하다. SQL 미적용 상태에서 켜지 않는다. 코드/CI 완료만으로 운영 ON하지 않는다. 03 needs_review 차단 후속과 실제 회사 계정으로 조회→명시적 처리→매장 이력 확인, 외부 카카오 첫 주문·기존 배송 소비자 경계를 운영 적용 전 검토한다.

## 검증

unit: OFF 선차단·회사 scope·조회/변경 역할·Origin·날짜·위조 actor 무시. PG17: 같은 키 재시도, 다른 키/날짜 충돌, actor/회사/만료/비활성 사용자 차단, 최신 revision, 기존 설정 우선, 감사 실패 전체 rollback, 날짜 확정·가격 보존·취소 예약 제외, ACL·RLS·down 이력 거부. PC/390px: 날짜 공란에서 확정 불가, 확인 취소, 응답 오류·같은 키 재시도·성공, 취소·빈 상태·가로 넘침. 외부 인증·운영 데이터는 사용하지 않는다. 로컬 의존 설치/개발 서버 대신 CI를 사용한다. Ponytail 사용, Superpowers/Security Audit 전용 도구 미설치.
