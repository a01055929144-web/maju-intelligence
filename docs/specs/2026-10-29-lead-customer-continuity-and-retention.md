# 리드→거래처 정보 연속성·수정 기록 보존 정책 초안

> 검토 전용. 운영 DB 적용, 기능 플래그 활성화, API/UI 연결을 하지 않는다.

## 소유권과 경계

- Owner Domain: `customer`
- Related Domain: `lead`
- UI는 Claude #78의 `requestPermitLeadAction`과 `requestPermitLeadConversion`을 그대로 사용한다.
- 서버는 기존 인증·회사 범위·권한 검사를 유지한다. 브라우저가 SQL 함수나 service role을 직접 호출하지 않는다.
- `LEAD_CUSTOMER_CONTINUITY_ENABLED=false`가 기본값이다. SQL 적용·데이터 검증·대표 승인 뒤 서버에서만 켠다.

## 식별자 비교

| 안 | 구조 | 장점 | 위험·비용 | 결론 |
|---|---|---|---|---|
| A. `matched_customer_id` 유지 | `business_permit_leads.matched_customer_id`로 거래처를 연결 | 현재 전환·중복 검사와 호환, `lead_actions`·DNC·출처를 복사하지 않고 조회 가능, 최소 변경 | 한 거래처에 여러 리드가 연결될 수 있으므로 조회 정렬·중복 표시 규칙 필요 | **이번 기준안** |
| B. 공통 매장 ID | lead/customer 위에 별도 `business_place_id` 도입 | 여러 수집원과 거래처를 장기적으로 하나의 장소로 묶기 쉬움 | 기존 FK·중복 병합·첨부·영업·배송 참조의 단계적 재키잉, 병행 ID와 롤백 설계 필요 | 3개 이상 원천 엔터티가 같은 매장을 공유할 때 재검토 |

A안에서는 `(company_id, matched_customer_id)`를 모든 상세 조회의 경계로 사용한다. 다른 회사의 리드·거래처 연결은 SQL 함수가 거부한다.

## 전환 시 정보 이어받기

거래처의 기존 값이 우선이다. 비어 있는 칸만 리드 값으로 채우며 덮어쓰지 않는다.

- 기본: 대표자, 주소, 전화, 이메일, 업종, 개업일, 장소 링크
- 연락 채널: `domains/lead/contact-channels.ts` 규칙을 재사용한다. 팩스는 숫자 중심 표준화, 이메일은 소문자, 인스타는 유효 핸들만 `https://www.instagram.com/{handle}/`, 톡톡은 `talk.naver.com` 또는 계정 ID만 `https://talk.naver.com/ct/{id}`로 정규화한다. 네이버 지도·플레이스와 임의 외부 URL은 거부한다.
- 영업시간: 담당자 입력(`manual`) 구간만 거래처 `business_hours` 요약으로 채운다. 거래처에 값이 있으면 유지한다.
- `lead_actions`, DNC, 칸별 출처는 거래처 테이블로 복사하지 않는다.
- 전환 함수는 `matched_customer_id`와 전환 상태만 연결하고, 연락 채널의 빈 거래처 칸만 채운다.
- `contact_channels_updated_at`은 유효한 정규화 값이 실제로 빈 거래처 칸에 들어간 경우에만 갱신한다.

프런트 요청 함수는 바꾸지 않는다. 플래그가 켜진 서버 경로에서 기존 전환 API가 원장 생성/선택 후 `apply_lead_customer_continuity_draft`를 호출하는 구조를 검토한다. 플래그 OFF면 현재 `convertPermitLeadToCustomer` 동작을 그대로 유지한다.

## 거래처 상세 영업 기록 탭

- 영업 기록: `lead_actions`를 `business_permit_leads.matched_customer_id = customer.id`로 실시간 조회한다.
- 출처: 연결 리드의 `source`, `matched_customer_method`, `matched_customer_confidence`를 함께 표시한다.
- DNC: `company_do_not_contact`의 활성 행을 같은 연결로 읽기만 한다. 거래처 상세에서 등록·해제·수정하지 않는다.
- 복사 금지: 전환 시 `lead_actions`나 DNC 행을 customer 테이블에 복제하지 않는다. 원본 수정·삭제 정책이 한 곳에서만 작동해야 한다.
- 한 거래처에 여러 리드가 연결되면 `created_at desc, id desc`로 합쳐 보여 주고 원본 `lead_id`를 보존한다.

## 이전 전화·주소 보존과 삭제 요청

- `common_revision_history`의 `field_key in ('phone', 'address')` 원문 이전/이후 값은 생성 후 **90일** 보존한다.
- 90일 자동 익명화는 주소와 유선 전화에만 적용한다. `contact-channels.ts`의 `isMobilePhoneNumber`가 인정하는 010 휴대폰(앞자리 0이 빠진 10자리 포함)은 자동 작업에서 건너뛴다.
- 전화 변경 행의 `old_value` 또는 `new_value` 중 하나라도 010 휴대폰이면 행 전체를 자동 익명화에서 건너뛴다. 값별 부분 익명화로 변경 전후 의미가 왜곡되는 것을 피하고 010 보존 요구를 우선한다.
- 90일이 지나면 행은 유지하되 `old_value`와 `new_value`를 `{ "redacted": true }`로 바꾸고 `redacted_at`, `redaction_reason='retention_expired'`만 남긴다. 이때 변경값 제약은 `redacted_at is not null or old_value is distinct from new_value`로 유지한다.
- 정보주체의 유효한 삭제 요청은 90일을 기다리지 않고 해당 회사·거래처의 주소와 유선 전화 수정 기록을 같은 방식으로 즉시 익명화한다.
- 매장 본인이 삭제를 요청하고 승인 사유가 `store_self_request`인 경우에만 010 휴대폰 수정 기록도 함께 익명화할 수 있다.
- 삭제·익명화 요청은 해당 회사의 활성 `owner` 또는 `manager`만 승인한다. 일반 `member` 요청은 SQLSTATE `42501`로 거부해 API에서 403으로 처리한다.
- 감사 로그에는 승인자 ID·당시 역할·제한된 사유 코드·승인 시각·휴대폰 포함 여부·처리 행 수만 저장한다. 전화번호·주소·자유 입력 메모·키·토큰은 기록하지 않는다.
- 애플리케이션의 append-only 경계는 유지한다. `service_role`에는 UPDATE/DELETE를 주지 않고, 익명화는 공개되지 않은 내부 스키마의 소유자 전용 함수만 수행한다.
- 회사 완전 삭제의 기존 `ON DELETE CASCADE`는 그대로 유지한다. 소프트 폐쇄는 보존 정책을 계속 적용한다.
- 익명화 함수는 처리 건수와 실행 시각을 운영 감사 로그에 별도 남기는 후속 승인이 필요하다. 실패 시 성공으로 숨기지 않는다.

90일은 운영 초안이다. 법적 보존 의무, 개인정보 처리방침, 고객 계약을 확인한 뒤 단축·연장할 수 있다.

## 승인 순서

1. 이 설계와 SQL 초안 리뷰
2. 로컬 PostgreSQL에서 동일 회사/타 회사 연결, 빈 칸 채움, 기존 값 보호, DNC 무변경 검증
3. 보존 기간과 삭제 요청 권한 승인
4. migration 승격 및 운영자가 직접 적용
5. 읽기 API 연결 후 DNC 읽기 전용 회귀 검사
6. 테스트 회사 하나에서 서버 플래그 활성화
7. 전체 활성화 여부 별도 결정

## 미결정 사항

- 익명화 감사 로그의 보존 기간과 열람 역할
- 기존 거래처 값과 리드 값이 충돌할 때 비교 UI 제공 여부
- B안 승격 기준(외부 장소 원장 포함 최소 3개 엔터티인지 여부)
- 영업시간을 최종적으로 구조화된 `customer_business_hour_intervals`로 승격할 시점
