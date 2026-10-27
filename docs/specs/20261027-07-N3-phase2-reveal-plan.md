# 07 N3 2차 — 민감정보 서버 reveal/API 전환 계획

> 상태: 설계 문서만. SQL 적용, 기능 플래그 변경, 민감값 노출 변경 없음.
> 선행: PR #39의 N3 SQL 초안·대표 전용 조회 화면 승인/병합 후 별도 진행.

## 1. 목표와 불변 조건

민감값은 목록·페이지 초기 데이터·공용 API 응답에 포함하지 않는다. 사용자가 명시적으로 보기 또는 내보내기를 요청할 때 서버가 현재 멤버십과 대상 범위를 다시 확인하고, 감사 로그 저장이 성공한 경우에만 값을 반환한다.

- `STAFF_ACCESS_V2_ENABLED=false`, `SENSITIVE_ACCESS_LOGS_ENABLED=false`를 대표 실제 계정 검증 전까지 유지한다.
- MAJU 관리자에게 N3 조회 권한을 암묵적으로 주지 않는다.
- 로그에는 원문·마스킹값·토큰·서명 URL을 저장하지 않는다.
- 기록 실패 시 값을 반환하지 않는 fail-closed 정책을 쓴다.
- 캐시 금지(`Cache-Control: no-store`)와 응답 최소화를 적용한다.
- 카카오 공유, 공개 링크, 엑셀 데이터에 출입 비밀번호를 넣지 않는다.

## 2. 현재 경로와 2차 연결 설계

| 항목 | 현재 원문 경로 | 현재 공백 | 목표 서버 경계 |
|---|---|---|---|
| 출입 비밀번호 | `lib/store.ts`의 `CUSTOMER_MASTER_SELECT_WITH_ACCESS_METHOD`가 `access_password`를 목록과 상세 모델에 포함하고, `components/sales-route-map-workspace.tsx`가 이미 받은 값을 버튼으로 표시 | 버튼을 누르기 전부터 브라우저 메모리에 원문이 있어 클릭 로그를 우회할 수 있음 | 일반 고객 응답에서 `accessPassword` 제거. `POST /api/customers/[id]/sensitive/access-password/reveal`이 최신 멤버십·업무·담당 거래처를 확인하고 N3 기록 성공 후 값만 반환 |
| 사장님 휴대폰 | `normalized_customers.phone`, 리드 `phone`, 연락처 `customer_contacts.phone`가 화면 초기 데이터에 평문 포함 | 매장 유선전화와 대표 휴대폰의 의미가 섞여 있어 무엇을 민감 열람으로 기록할지 불명확 | 먼저 `owner mobile` 판정 기준을 확정한다. 권장 기준은 대표/주 연락처로 지정된 010 번호. 목록에는 마스킹값/존재 여부만, `POST /api/customers/[id]/sensitive/owner-phone/reveal`에서 권한·기록 후 원문 반환 |
| 사업자등록증 | `business_license_file_url` 직접 링크와 `/api/customer-attachments/file?path=...` 서명 URL 경로가 공존 | 직접 URL은 파일 API와 감사 지점을 우회하며, 파일 API는 첨부 유형을 조회하지 않음 | 목록에는 `hasBusinessLicense`와 첨부 ID만 반환. `GET /api/customer-attachments/[id]/reveal`이 회사·담당 범위와 `attachment_type=business_license`를 확인하고 N3 기록 후 짧은 signed URL로 redirect. 레거시 직접 URL 제거 |
| 엑셀 내보내기 | `app/page.tsx`, `app/crm/summary/page.tsx`, `components/permit-leads-view.tsx` 등에서 이미 받은 데이터로 브라우저가 파일 생성 | 서버 재검증·감사 지점이 없고 다운로드 데이터 범위를 서버가 확정하지 못함 | 내보내기별 서버 endpoint/use case가 필터·권한·담당 범위를 다시 계산하고 N3 기록 후 파일을 생성/스트리밍. 출입 비밀번호는 항상 제외 |

## 3. 공통 Application Use Case

페이지나 React 컴포넌트가 Supabase와 감사 테이블을 직접 호출하지 않는다. Organization 도메인 아래 공통 use case를 두고 각 리소스 adapter가 실제 값을 읽는다.

```text
RevealSensitiveResource(command)
  1. 활성 고객 세션 확인                    -> 없으면 401
  2. company_members 최신 상태/만료 확인     -> 비활성·만료면 401
  3. item별 역할·duties·대상 범위 확인       -> 불허면 403
  4. warning 계산                           -> 값은 계산 입력에 포함하지 않음
  5. 민감 원문 조회                         -> 응답 전 서버 메모리에만 보유
  6. sensitive_access_logs INSERT           -> 실패하면 503, 원문 폐기
  7. 최소 응답 또는 짧은 signed URL 반환     -> no-store
```

가능하면 5~6을 승인된 Postgres RPC 한 트랜잭션으로 묶는다. RPC가 승인되지 않은 1차 구현은 반드시 `INSERT 성공 후 반환` 순서를 지키며, 로그 실패를 삼키지 않는다.

공통 command에는 `companyId`, `actorUserId`, `itemType`, `customerId/attachmentId`, `pagePath`, 서버가 정규화한 기기 식별 정보만 허용한다. 클라이언트가 보낸 사용자명·역할·회사·경고 코드는 신뢰하지 않고 서버에서 채운다.

## 4. 항목별 권한 설계

### 4.1 출입 비밀번호

- 허용: 활성 owner/manager 또는 배송 duty가 있고 해당 거래처가 오늘 코스·담당 범위에 속한 직원.
- 금지: 영업-only, 임시 권한 만료, 비활성 멤버, 다른 회사, 담당 밖 거래처.
- 경고: 담당 아님은 원칙적으로 403이지만 대표/관리자의 업무상 override 열람에는 `unassigned`를 기록한다. 근무 세션 밖이면 `outside_work_session`을 추가한다.
- UI는 닫기·거래처 변경·일정 시간 경과 시 원문 상태를 비운다. 토글 재열람은 새 요청/새 로그로 본다.

### 4.2 사장님 휴대폰

- 일반 매장 대표번호와 owner mobile을 구분하기 전에는 기존 `phone` 전체를 일괄 숨기지 않는다. 배송·영업 매칭과 연락 기능 회귀 위험이 크다.
- 대표/주 연락처로 지정된 010 번호를 우선 후보로 정의하고, 데이터 모델 결정 전까지 reveal 구현을 보류한다.
- 허용 역할과 담당 범위는 영업 use case 기준으로 별도 확정한다. 단순 `company member`만으로 허용하지 않는다.

### 4.3 사업자등록증

- `getCustomerAttachmentOwnerByStoragePath`는 customer ID뿐 아니라 attachment ID/type을 반환하도록 확장한다.
- 파일 endpoint가 회사 경로와 담당 고객을 확인한 뒤 `business_license`에만 N3 로그를 남긴다.
- DB의 `file_url`이 공개/장기 URL이면 즉시 reveal 경계가 성립하지 않으므로 비공개 storage path 기반으로 이관한 뒤 활성화한다.

### 4.4 내보내기

- 범용 클라이언트 `write-excel-file` 호출을 민감 export의 최종 경계로 사용하지 않는다.
- 거래처 전체 현황, 거래처 마스터, 매출 거래, 신규 리드를 서로 다른 export kind로 기록한다.
- 로그의 `store_id`는 단일 매장 export일 때만 채우고, 다건 export는 비워 둔다. 행 수·필터 종류는 비민감 정형 컬럼이 승인되기 전에는 로그에 넣지 않는다.
- 같은 사용자의 당일 N3 로그를 기준으로 20회 이상이면 `daily_20_plus`, 모든 export에는 `export` 경고를 기록한다.

## 5. 차단 순서

1. PR #39 병합 후에도 두 플래그는 OFF로 유지한다.
2. 응답 계약 회귀 테스트를 먼저 추가한다. 현재 원문 포함을 명시해 이후 제거를 검증할 기준을 만든다.
3. reveal use case/API를 플래그 OFF 상태로 구현한다. 원문 반환·signed URL·export stream은 OFF에서 404/503이어야 한다.
4. 일반 목록/상세 응답에서 출입 비밀번호와 문서 직접 URL을 제거하고, 프런트 타입도 존재 여부/ID만 남긴다.
5. UI를 명시적 reveal 호출로 전환한다. 서버 로그 성공 전에는 원문을 렌더링하지 않는다.
6. 사장님 휴대폰 의미/필드를 확정한 뒤 같은 순서로 전환한다.
7. 클라이언트 export를 서버 export로 전환하고 기존 버튼이 새 endpoint만 호출하도록 바꾼다.
8. 경고 계산과 1년 보관 작업을 구현·승인한다.
9. 비운영 환경에서 대표·manager·직원·알바·퇴사자·타회사 계정으로 검증한다.
10. SQL 적용 확인 후 N3 플래그만 단계적으로 켠다. C6 플래그는 별도의 대표 실제 계정 검증 전에는 켜지 않는다.
11. N3 기록 누락 0건이 확인된 뒤에만 02의 출입 비밀번호 비마스킹 표시를 활성화한다.

목록 응답에서 원문 제거와 UI 전환은 같은 배포 묶음에 둔다. 둘 중 하나만 먼저 배포하면 화면 장애 또는 원문 우회가 발생한다.

## 6. 회귀 테스트 계획

### 6.1 응답·캐시

- 고객 목록/상세 JSON과 RSC 직렬화 결과에 `access_password` 원문이 없다.
- 사업자등록증 직접 URL이 목록/상세 JSON에 없다.
- reveal 성공 응답은 `Cache-Control: no-store`; 서버 로그·에러에 값이 없다.
- 카카오 공유, 공개 견적, CSV/XLSX, 이미지/PDF 출력에 출입 비밀번호가 없다.

### 6.2 권한 행렬

| 주체 | 담당 거래처 비밀번호 | 비담당 비밀번호 | N3 로그 조회 | 기대 |
|---|---:|---:|---:|---|
| 활성 owner | 허용 | 허용+`unassigned` | 허용 | 200 |
| manager | 허용 | 정책상 override+경고 | 거부 | reveal 200, 로그 조회 403 |
| 배송 duty 직원 | 허용 | 거부 | 거부 | 200 / 403 / 403 |
| 영업-only 직원 | 거부 | 거부 | 거부 | 403 |
| 유효 알바(배송) | 담당만 허용 | 거부 | 거부 | 200 / 403 / 403 |
| 만료 알바·퇴사자 | 거부 | 거부 | 거부 | 다음 요청 401 |
| MAJU admin 단독 | 별도 명시 승인 없이는 거부 | 거부 | 거부 | 401 또는 명시적 403 |
| 타회사 사용자 | 거부 | 거부 | 거부 | 403/404, 존재 여부 비노출 |

### 6.3 감사 원자성·경고

- N3 INSERT 실패 시 원문·signed URL·파일이 반환되지 않는다.
- 성공 1회당 로그 1건이며 재열람은 새 로그다.
- 로그 row/서버 로그/분석 이벤트에 원문·마스킹값·토큰·signed URL이 없다.
- 오늘 19회 이후 다음 열람부터 `daily_20_plus` 판정 기준을 명시적으로 검증한다.
- export는 항상 `export`, 근무 세션 밖은 `outside_work_session`, 대표/관리자 비담당 override는 `unassigned`를 기록한다.
- 숨김 0건은 404, 숨김 성공은 원본 수정과 `log_hidden` 기록이 함께 남는다.

### 6.4 파일·내보내기

- 사업자등록증이 아닌 첨부는 N3의 `business_registration`으로 잘못 기록되지 않는다.
- 다른 회사 storage path, dot-segment, 비담당 customer는 기존 403을 유지한다.
- 서버 export는 현재 화면 필터와 담당 범위를 동일하게 적용하고, 출입 비밀번호 열을 만들지 않는다.
- export 로그 실패 시 빈 파일을 포함해 어떤 다운로드도 시작하지 않는다.

## 7. 1년 보관과 운영 확인

PR #39 SQL 주석만으로는 1년 보관이 구현되지 않는다. 별도 승인된 유지관리 함수/스케줄이 `accessed_at < now() - interval '1 year'`만 삭제할 수 있게 하고, 일반 API와 service role에는 DELETE 권한을 주지 않는다. 보관 작업의 실행 건수·실패만 운영 로그에 남기고 민감 event 내용을 복제하지 않는다.

운영 활성화 전 확인표:

- [ ] N3 SQL 승인·적용 및 스키마 검증
- [ ] 원문 없는 목록/상세 응답 확인
- [ ] 네 종류 실제 열람/내보내기 로그 확인
- [ ] 대표 외 N3 조회 403, 퇴사·만료 다음 요청 401
- [ ] warning 네 종류 계산 확인
- [ ] 1년 보관 작업 dry-run과 승인
- [ ] 02 출입 비밀번호 표시 플래그는 마지막에 별도 승인

## 8. 충돌 방지와 PR 분리

이 문서는 `codex/07-N3-phase2-plan` 문서 전용 브랜치에서 작성한다. PR #39 코드와 12:00 병합 묶음의 파일을 수정하지 않는다. 실제 구현은 SQL 승인 후 항목별 소규모 PR로 나눈다.

1. `07-N3-reveal-access-password`
2. `07-N3-reveal-owner-phone`
3. `07-N3-reveal-business-registration`
4. `07-N3-server-exports`
5. `07-N3-warning-retention`

