# CX-58 운영 적용 선행 조건

2026-11-17 운영 DB를 읽기 전용으로 확인한 결과입니다. 이 PR은 SQL 초안과 일회용 PostgreSQL 17 시험만 추가하며 운영 DB에는 적용하지 않습니다.

| 확인 항목 | 운영 읽기 결과 | 초안 판단 |
| --- | ---: | --- |
| `normalized_customers` 새 4칸 | 0/4 존재 | 새 nullable 칸으로 추가 |
| `store_profiles` CX-60 새 3칸 | 0/3 존재 | 같은 초안에 새 nullable 칸으로 추가 |
| `company_profiles.sub_business_number` 값 | non-null 0건 | 기존 칸 유지 |
| 기존 종사업장번호 4자리 위반 | 0건 | 검증된 CHECK 즉시 추가 (`NOT VALID` 불필요) |
| 회사 안에서 겹치는 사업자번호 그룹 | 0그룹 / 해당 매출처 0건 | unique 없이 일반 인덱스만 추가 |
| `business_number_exceptions` | 0건 | 테이블과 기존 unique 규칙을 그대로 재사용 |
| 새 제약·인덱스 이름 충돌 | 0건 | 초안 이름 그대로 사용 가능 |

## 적용 범위

- 기존 행은 백필하지 않습니다.
- `normalized_customers`는 사업자 상호·종사업장번호·개인/법인·법인등록번호를 nullable로 받습니다.
- `store_profiles`는 CX-60 충돌 방지를 위해 사업자 상호·종사업장번호·개인/법인 3칸만 미리 포함합니다.
- 같은 사업자번호의 여러 매장을 허용하기 위해 사업자번호 unique 제약은 만들지 않습니다.
- CX-59 애플리케이션 연결은 대표 승인과 운영 적용 뒤 별도 PR로 진행합니다.
