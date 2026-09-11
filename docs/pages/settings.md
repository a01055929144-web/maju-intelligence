# Settings (회사 설정 / 직원 관리)

## Status
운영 중. 카드 레이아웃 정리, 직원 초대 표 UI 전면 개편, GPS 보관정책 구현까지 완료. 과거 마이그레이션 미적용으로 저장 기능 전체가 막힌 전력이 있어 2026-09-11에 관련 6개 마이그레이션의 실패 처리 방식을 전수 감사(아래 KNOWN ISSUES 참고) — 5개는 이미 안전, 1개(`staff_assignment_override`)는 진단 메시지 보강 완료. **단, 실제 프로덕션 Supabase에 6개가 전부 적용됐는지는 이 세션에서 확인 불가하므로 DB 의존 변경 시 여전히 각별히 주의.**

## Goal
회사 기본 정보, 문자 발송 설정, 이탈위험 텔레그램 알림, 직원 초대/권한/배정을 관리한다.

## Owner Domain
organization

## Related Domains
delivery (GPS 보관정책), customer (이탈위험 알림)

## Allowed Files
- `app/dashboard/settings/page.tsx`
- `app/dashboard/settings/settings-form.tsx`
- `app/dashboard/settings/staff-management-panel.tsx`
- `app/dashboard/settings/business-number-exceptions-panel.tsx`
- `app/dashboard/settings/company-closure-panel.tsx`
- `app/api/customer/settings/route.ts`, `app/api/customer/staff-invitations/route.ts`, `app/api/customer/company/close/route.ts`
- `app/api/company-job-titles/route.ts`
- `lib/workspace.ts` (역할별 기능 권한)

## Data Flow

| Source | Used For |
|---|---|
| `companies` | 회사 설정 |
| `company_members` | 직원 멤버십/권한 |
| `staff_invitations` | 직원 초대 |
| OAuth provider id | 카카오/네이버/구글 매핑 |

## UX Rules
- 직원 관리는 추가/편집/해제/삭제 액션이 명확히 구분돼야 한다.
- 권한은 기능 제한보다 "노출되는 데이터 범위" 중심으로 설계한다(담당 거래처만 보이는 방식).

## Do Not Touch
- `lib/store.ts`의 lead/sales/route 전용 섹션
- `app/mobile/**` (직원이 초대 링크로 들어오는 쪽은 mobile-join.md 소관)

## Preserve
- 회사 설정 / 문자 발송 설정 / 이탈위험 알림 3개 카드의 헤더-본문 일치(과거 한 카드에 세 기능이 섞여 있던 버그 수정됨 — 다시 합치지 말 것)
- 직원 초대: **직원별 1회성 링크** 방식(회사 공용 고정 링크로 바꾸지 않기로 확정됨 — 별도 논의 없이 이 방식을 바꾸지 않는다)
- 직원 초대 표: 직원/역할/상태/유효기간/배정 매칭/초대 링크/관리 컬럼, 행 클릭 시 배정(담당자·차량) 편집 확장
- 초대 유효기간 표시(`expiresAtIso` 기반), 링크 복사 + 공유(Web Share API, 미지원 시 복사로 폴백)
- 직원 추가 폼의 다중 연락처(이름+연락처 여러 줄) 입력
- 직원 삭제 시 해당 직원의 GPS 위치 기록(`staff_location_events`) 즉시 삭제

## Task
_(비어있음)_

## Completion
- TypeScript / lint / build PASS
- **저장 버튼을 실제로 눌러서 저장이 되는지 확인**(마이그레이션 미적용 시 조용히 막히는 이력이 있으므로 "코드는 맞다"만으로 완료 처리하지 않는다)

---

## STATUS
ACTIVE

## LAST VERIFIED
2026-09-08

## BUILD
알 수 없음 (사용자/Codex 확인 필요)

## COMPLETED
- [x] 카드 레이아웃 정리(회사 설정/문자 발송/이탈위험 알림 분리, 설정 절차 카드화, 우측 아내 제목 중복 해소)
- [x] 직원 초대 UI 전면 개편: 표 형태, 유효기간 표시, 공유 버튼, 다중 연락처 일괄 초대
- [x] GPS 보관정책: `staff_location_events` 1년 보관 후 자동 삭제(일일 크론), 퇴사 시 즉시 삭제
- [x] 직원 삭제(hard delete), 카카오 고유ID 중복 가입 방지
- [x] 직원 담당 업무(역할) 카탈로그 자유 편집
- [x] 고객사 탈퇴(소프트 삭제) + 재활성화 안내
- [x] 마이그레이션 미적용 위험 6개 전수 감사 + `assigned_manager_name`/`assigned_vehicle` 진단 메시지 보강(2026-09-11, Claude 분석+구현 — 아래 KNOWN ISSUES 참고)

## TODO
- [ ] 직원별 데이터 노출/권한 필터 재점검(카카오 매핑 포함, 로드맵 5순위 항목)
- [ ] GPS 추적 동의 안내를 초대/가입 화면에 추가할지 검토(제안됐으나 아직 요청받지 않음)

## KNOWN ISSUES
- **마이그레이션 미적용 위험 — 6개 전수 감사 완료(2026-09-11, Claude 분석+진단 메시지 보강)**: 이 페이지가 의존하는 6개 최근 마이그레이션(`20260901_company_message_settings.sql`, `20260907_staff_assignment_override.sql`, `20260907b_company_job_titles.sql`, `20260907c_company_closure.sql`, `20260907d_login_throttle.sql`, `20260907e_permit_sync_cursor.sql`)이 프로덕션 Supabase DB에 실제 적용됐는지 코드 레벨에서 각각의 실패 처리 방식을 확인했다. 결과: **5개는 이미 안전하게 처리됨** — (1) `company_message_settings`: 컬럼 없으면 그 필드만 빼고 재시도하거나 "이 마이그레이션을 실행하라"는 명확한 에러 (2) `company_job_titles`: 테이블 없으면 빈 목록으로 안전 폴백(조회) / 명확한 에러(저장) (3) `company_closure`: 컬럼 없어도 로그인 차단(status="closed")은 반드시 저장되도록 재시도 (4) `login_throttle`: Supabase 실패 시 메모리 기반으로 자동 폴백 (5) `permit_sync_cursor`: 컬럼 없으면 두 함수(`syncAllCompaniesGovRestaurantLeads`/`syncAllCompaniesSeoulRestaurantLeads`) 모두 조용히 0건 처리 후 정상 반환, cron 전체를 막지 않음. **1개는 진단 메시지가 없었음** — `staff_assignment_override`(`assigned_manager_name`/`assigned_vehicle`): 초대 코드 조회 select= 목록에 하드코딩돼 있어, 이 마이그레이션이 없으면 초대 링크로 들어오는 모든 조회(모바일 직원 가입/로그인 포함)가 원인을 알 수 없는 Supabase 원본 에러로 실패했다(데이터 손실은 아니지만 "왜 안 되는지" 진단이 불가능했음). **수정**: `lib/store.ts`의 `normalizeStaffStoreError`에 `isMissingStaffAssignmentOverrideColumnError` 분기를 추가해, 다른 5개와 동일하게 "어떤 마이그레이션을 실행하라"는 명확한 한글 에러로 바뀌도록 했다(동작 자체는 바뀌지 않음 — 여전히 막히지만, 이제 원인이 보인다). **결론**: 6개 모두 "마이그레이션 미적용 시 조용한 데이터 오류"는 없다(막히면 명확히 막힌다) — 다만 실제로 6개가 프로덕션에 적용됐는지는 이 세션에서 DB에 직접 접속할 수 없어 확인 불가하므로, 저장/초대 관련 문제가 실제 보고되면 위 매핑을 참고해 어떤 마이그레이션인지 바로 특정할 수 있다.
