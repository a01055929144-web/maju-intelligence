# CC-22a 회사 구분(company_kind) — 운영 승인 대기

Ponytail: 사용함 (Claude Code ponytail-review). 지시서 `docs/dispatch/2026-11-11-vibe-distributor-sales.md` 4절.
**운영 SQL 미실행.** 화면(CC-22b)·기능 스위치·배포 변경 없음. 적용은 대표 명시 승인 문구 후.
요청 문구(안): `fcmdvveqmcgtioelzqun CC-22a 회사 구분 SQL 승인` (다른 SQL 승인과 같이 받아도 됨)

## 무엇이 바뀌나 (`docs/sql-drafts/20261111-CC-22a-company-kind.sql`)
| 대상 | 내용 |
|---|---|
| `companies.company_kind` | `text not null default 'customer'`, check `customer`·`pilot`·`internal`. 기존 모든 회사는 `customer` |
| 비브 `898d85fc-c475-47e0-9943-91709e13a4bb` | → `internal` (본사) |
| 제이에스리테일 `04ebb7bb-8da0-4723-8211-f2a947939344` | → `pilot` |

- 새 테이블·함수 없음. 회사 가입(셀프·관리자 대행)으로 생기는 회사는 기본값 `customer`.
- 구분 변경은 **MAJU 관리자 API만**(CC-22b), 변경마다 `admin_audit_logs`. 고객사 화면·API에서는 변경 불가.
- 두 회사 id는 운영 읽기로 확인함(이름 비브·제이에스리테일, status active, workspace_type company).

## 적용 순서 (승인 후)
1. 사전 읽기: `company_kind` 열 없음, 두 회사 id 존재, `companies` 건수 기록.
2. up 1회(3초 잠금 대기·30초 제한, 이미 적용이면 `cc22a_already_applied`로 중단).
3. 사후 읽기: 열 존재·기본값, 비브 `internal`·제이에스리테일 `pilot`·나머지 전부 `customer`, `companies` 건수 불변.
4. down: 열 삭제(CC-22b 화면을 먼저 되돌려야 함).

## 격리 검증 (CI PG17, `tests/sql/company-kind-cc22a.pg17.test.sql`)
두 회사 값 설정 · 나머지·신규 회사 기본값 · 잘못된 값/NULL 거부 · 재적용 거부 · down 후 재up.

## 운영 적용 기록 (2026-11-11 16:2x KST · 컨트롤타워)
- 승인 문구(대표 16:18): `fcmdvveqmcgtioelzqun CC-22a 회사 구분 SQL 승인`
- 적용: 초안 그대로(이미 적용 여부 확인 → 열 추가 + check → 비브 internal · 제이에스리테일 pilot) + `admin_audit_logs` `db_migration_applied`(CC-22a).
- 읽기 검증: 비브 = `internal`, 제이에스리테일 = `pilot`, 그 외 회사 없음. 화면(CC-22b)은 아직 이 열을 쓰지 않는다.
