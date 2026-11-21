# CX-93 관리자 유통사 업종 계약 — 운영 적용 전 승인본

Ponytail: 사용함

## 범위

- 변경하지 않는 UUID와 수정 가능한 표시명을 분리하고 한 유통사에 여러 분류를 배정합니다.
- `companies.business_type`은 기존 리드 기본값으로 유지하며 읽기·분해·자동 이관하지 않습니다.
- 감사는 기존 `admin_audit_logs`를 재사용하고 영향은 저장하지 않고 읽기 함수로 계산합니다.
- 기존 연결 자동 해제, 주문 판정, 운영 적용은 하지 않습니다.

## 최소 객체

| 객체 | 용도 |
|---|---|
| `distributor_industry_categories` | 안정 ID, 표시명, active/retired |
| `company_distributor_industries` | 회사별 다중 배정 |
| `preview_company_distributor_industries` | 배정 전후 ID와 영향 연결·매장 수 |
| `preview_distributor_industry_category_impact` | 분류 수정 전 영향 회사·연결·매장 수 |

테이블 직접 접근은 `service_role`에도 열지 않고, 관리자 원자 함수만 `service_role`에 허용합니다. 실제 변경은 요청 키와 전후 값을 `admin_audit_logs`에 기록합니다.

## 기능 게이트와 후속 읽기

현재 저장소에는 이 계약 전용 feature flag/회사 allowlist가 없습니다. 의미가 다른 CX-95 allowlist는 재사용하지 않습니다. 후속 관리자 API가 기존 환경변수 패턴으로 기본 OFF+회사 allowlist와 관리자 세션을 검증한 뒤 원자 함수를 호출해야 합니다.

09의 첫 주문 판정 함수와 런타임 상태값은 이번 SQL에 넣지 않습니다. 09 후속은 활성 ID 집합을 서버에서 읽고 연결 직전·주문 접수 직전에 재확인해야 합니다.

## 운영 전 확인

1. up/down/PG17 승인
2. 관리자 API 세션·기능 OFF·회사 allowlist·요청 키 검증
3. 06 설정은 새 분류 배정을 쓰지 않도록 유지
4. 09 주문 판정 경합·경쟁사 정보 비노출 시험

운영 DB 적용, 기능 ON, 회사 허용, 배포는 이 PR 범위가 아닙니다.
