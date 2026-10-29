# 알바(임시) 권한·만료 및 공용 로그인 감지 설계

> 상태: 설계 검토용. 구현 및 운영 DB 적용 금지.
> Owner Domain: `organization`
> Related Domain: `notification`(관리자 알림 전달만), `billing`(접근 금지 경계만)

## 1. 결정 사항

- `temporary`는 직원 초대/권한 변경 시 만료일 입력란을 오늘부터 30일 뒤로 기본 제안한다.
- 30일은 편의 기본값이지 무제한 연장 권한이 아니다. 저장 시 서버가 명시적인 `membership_expires_at`을 받아야 하며, 과거 시각·지나치게 먼 시각은 거절한다.
- 임시 계정은 회사 설정, 직원 관리, 구독·결제, 보고서, 회사 운영 현황에 접근할 수 없다.
- 권한 제한은 메뉴 숨김만으로 끝내지 않는다. 페이지 서버 컴포넌트, Route Handler, application use case, DB 접근 경계에서 같은 capability를 재검증한다.
- 같은 계정의 서로 다른 활성 세션이 2개 이상 관측되면 대표/관리자에게 알림을 만든다. 1차 릴리스는 자동 차단·강제 로그아웃을 하지 않는다.
- IP 주소만으로 같은 기기를 판별하지 않는다. NAT, 이동통신망, VPN 때문에 오탐이 크다.

## 2. 현재 상태와 보완점

현재 코드에는 다음 기반이 이미 있다.

- `getDefaultTemporaryExpiry()`가 임시 권한의 30일 기본 날짜를 만든다.
- `membership_expires_at`과 `temporary` 만료 필수 제약이 있다.
- `getCustomerSession()`이 `getStaffAccessState()`를 통해 현재 멤버십을 다시 읽어 만료된 계정을 거절한다.
- `lib/workspace.ts`에서 `temporary`는 `manage_company`, `manage_members`, `manage_billing`, `view_reports`, `view_company_operations`를 갖지 않는다.
- `staff_account_sessions`, `staff_security_alerts` 테이블이 있으나 세션 관측은 `device_hash` 중심이다.

보완이 필요한 부분은 다음과 같다.

1. `device_hash`는 브라우저 저장소 삭제, 앱 재설치, 여러 브라우저 사용에 따라 바뀔 수 있어 인증 세션과 동일하지 않다.
2. 이 저장소의 고객 로그인은 자체 서명 쿠키도 사용한다. Supabase Auth 로그인만 가정해 `auth.sessions`를 조회하면 레거시/자체 로그인 경로가 누락된다.
3. capability가 없는 메뉴를 숨기는 것과 API가 실제로 거절하는 것은 별개다. 설정·결제·직원 관리 API 전체를 capability 기준으로 목록화해 회귀 테스트해야 한다.
4. 현재 알림 테이블에는 동일 사건의 반복 삽입을 막는 명시적 dedupe key가 없다.

## 3. 인증·세션 경계

### 3.1 세션 식별자

서버는 로그인 성공 시 아래 둘 중 하나를 `session_id`로 채택한다.

- Supabase Auth 경로: 검증된 access token의 `session_id` claim. 민감 작업에서는 필요 시 `auth.sessions`에 현재 행이 존재하는지도 서버에서 확인한다.
- 자체 서명 쿠키 경로: 서버가 예측 불가능한 UUID를 발급하고 DB에 저장한 `app_session_id`. 서명 쿠키에는 이 ID만 넣고, 매 요청에서 DB의 활성·철회·만료 상태를 확인한다.

브라우저가 임의로 제출한 session ID, `user_metadata`, IP, User-Agent 문자열은 권한 판단의 근거로 사용하지 않는다. `device_hash`는 알림 설명과 기기 묶음의 보조 신호일 뿐이다.

### 3.2 활성 세션

활성 세션은 다음을 모두 만족한다.

- `revoked_at is null`
- `expires_at > now()`
- `last_seen_at >= now() - interval '15 minutes'`
- 현재 `company_members`가 `active`
- 임시 계정이면 `membership_expires_at > now()`

heartbeat는 인증이 완료된 서버 요청에서만 최대 5분에 한 번 갱신한다. 정적 자산, 로그인 페이지, 인증 실패 요청은 heartbeat를 만들지 않는다.

### 3.3 동시 2기기 감지

한 회사·한 사용자에서 서로 다른 활성 `session_id`가 2개 이상이고, 서로 다른 `device_hash`도 2개 이상이면 `concurrent_devices` 알림 후보로 본다. 같은 기기의 토큰 갱신으로 세션 행이 바뀌는 경우를 줄이기 위해 device 기준을 함께 쓴다.

- 알림 대상: `owner`, `manager` 중 알림 수신 설정이 켜진 사용자.
- 알림 내용: 사용자 표시명, 관측 기기 수, 최초/최근 관측 시각. 원문 IP, 전체 User-Agent, 토큰은 저장하거나 노출하지 않는다.
- dedupe: `(company_id, user_id, alert_type, window_start)`를 고유하게 해 30분 동안 한 번만 생성한다.
- 해제: 활성 기기가 1개 이하가 되면 새 알림을 만들지 않는다. 기존 알림은 감사 이력으로 남기고 확인 처리만 한다.
- 1차 정책: 관리자 알림만. 계정 자동 잠금은 현장 업무 중 오탐 위험 때문에 별도 승인 전 금지한다.

## 4. 권한 경계

| 기능 | owner | manager | staff | temporary |
|---|---:|---:|---:|---:|
| 거래처·영업·배송(배정 범위) | 허용 | 허용 | 업무별 허용 | 업무별 허용 |
| 회사 설정 | 허용 | 허용 | 금지 | 금지 |
| 직원 초대·권한 변경·비활성화 | 허용 | 허용 | 금지 | 금지 |
| 구독·결제·결제 이력 | 허용 | 허용 | 금지 | 금지 |
| 보고서·회사 전체 운영 현황 | 허용 | 허용 | 정책별 | 금지 |

임시 계정의 허용 범위는 `duties`와 담당 거래처/오늘 코스의 교집합이다. `temporary`라는 역할만으로 회사 전체 거래처를 허용하지 않는다.

서버 경계 적용 순서는 다음과 같다.

1. 서명/토큰 검증
2. 서버 저장 세션의 활성 상태 확인
3. 현재 회사 멤버십, 상태, 만료일 재조회
4. capability 확인
5. 업무(`duties`)와 담당 범위 확인
6. 데이터 접근 및 감사 이벤트 기록

## 5. SQL 초안이 필요한 이유

애플리케이션 메모리나 쿠키만으로는 여러 Vercel 인스턴스에서 활성 세션을 합산하거나 중복 알림을 막을 수 없다. DB에는 최소한 다음 불변조건이 필요하다.

- 인증 세션 ID와 회사·사용자 연결
- 철회/만료/최근 관측 시각
- 동일 세션의 중복 행 금지
- 알림 dedupe key
- `anon`, `authenticated`의 직접 접근 차단 및 RLS

검토용 SQL은 `docs/sql-drafts/20261029-07-temporary-access-concurrent-session.sql`에 둔다. 기존 운영 마이그레이션을 수정하지 않으며, SQL Editor 실행 대상으로 간주하지 않는다.

## 6. 단계별 구현안

1. **세션 계약**: 자체 쿠키 payload에 `appSessionId` 추가, 로그인/로그아웃에서 서버 세션 생성·철회.
2. **중앙 검증**: `getCustomerSession()`에서 서버 세션, 현재 멤버십, 임시 만료를 fail-closed로 확인.
3. **capability 감사**: 설정·결제·직원 관리 페이지/API에 `manage_company`, `manage_billing`, `manage_members` 검사 고정.
4. **관측/알림**: 인증 요청 heartbeat와 2기기 감지 use case를 구현하고 dedupe insert.
5. **UI**: 관리자 보안 화면에 알림 목록과 확인 버튼 제공. 세션 원문·IP는 표시하지 않음.
6. **점진 배포**: 기록 전용 플래그 → 관리자 화면 → 알림 발송 순서. 자동 차단은 별도 작업.

## 7. 검증 기준

- 임시 초대 기본값이 KST 달력 기준 30일 후이며 저장 payload에 명시적으로 포함된다.
- 만료 직전/정확히 만료/만료 직후 경계 테스트가 있다.
- 임시 계정이 설정·결제·직원 관리 페이지와 API 모두에서 403 또는 안전한 리다이렉트를 받는다.
- owner/manager의 기존 접근은 유지된다.
- 같은 세션의 여러 탭은 알림을 만들지 않는다.
- 같은 계정의 서로 다른 두 기기는 30분당 알림 하나만 만든다.
- 로그아웃·철회·임시 만료 후 heartbeat가 활성 상태를 되살리지 못한다.
- RLS allow/deny pgTAP과 API auth-boundary 검사를 통과한다.

## 8. 운영 전 확인 사항

- 고객 로그인 경로별로 Supabase Auth 세션과 자체 쿠키 세션의 비율을 먼저 계측한다.
- 알림 전달은 앱 내 알림을 1차 채널로 사용한다. 이메일 추가 여부와 수신 역할은 기록 전용 기간의 운영 결과를 본 뒤 제품에서 확정한다.
- 활성 창 15분과 dedupe 30분이 현장 사용 패턴에 맞는지 기록 전용 기간의 수치로 조정한다.
- Supabase Auth의 single-session 옵션은 기존 세션을 즉시 제거하지 않고 refresh 시점에 반영되므로, 이번 “알림” 요구의 대체재로 사용하지 않는다.
- service role/secret key는 서버 전용으로 유지하고 세션 ID·토큰·원문 IP를 로그에 남기지 않는다.

## 9. 참고 문서

- Supabase Auth User sessions: <https://supabase.com/docs/guides/auth/sessions>
- Supabase Row Level Security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase breaking changes: <https://supabase.com/changelog?types=breaking-change>

