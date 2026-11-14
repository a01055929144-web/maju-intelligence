# 운영 적용 기록 — CC-46 보강 대상 함수 `list_leads_due_for_enrichment` (2026-11-14 14:20 KST, Claude Code)

- 승인 문구(대표, 원문): `fcmdvveqmcgtioelzqun에 CC-46 보강 대상 함수 초안 적용 승인` (수신 14:19 KST 이전, 적용 직전 메시지)
- 초안: `docs/sql-drafts/20261114-CC-46-enrichment-targets.sql` @ `ab8133b4` (#730 대상 넓히기 + #741 폐업 제외·재시도 주기 + #742 error 제외를 한 파일로, down·PG17 CI 초록). 컨트롤타워 승인: 11/14 13:0x(7일 간격·linked 같은 주기 포함).
- 방식: 단일 트랜잭션 · `lock_timeout 3s` · 같은 트랜잭션에 `admin_audit_logs`(action `db_migration_applied`, metadata.id `CC-46-enrichment-targets`). audit 행 id `85a9176b-7c93-48f9-a7f4-15d678ab290d`, applied_at `2026-11-14 14:20:13 KST`.
- 사전 읽기: 운영 함수 = task-p 정의(전화·주소 없음만, 14→28→60일) 그대로(md5 `7168aa72…`) · CC-46 audit 0건 · 사용 컬럼 10개 모두 존재(`permit_status` 포함).
- 사후 읽기: 정의에 `result_code`·`^폐업` 규칙 있음 · 권한 anon ✕ · authenticated ✕ · service_role ○(초안과 같음) · audit 1건 · 두 회사 모두 `list_leads_due_for_enrichment(회사, 500)` 호출 성공(대상 500 이상 = 한도까지 — 대상이 넓어짐, 폐업 제외 규칙 적용 상태).
- 같은 SQL을 `supabase/migrations/20261114142013_cc46_enrichment_targets.sql`로 둠 — **운영에 다시 적용하지 말 것**(이미 적용됨).

## 영향·되돌리기

- 크론 보강 대상이 늘어난다(카카오 링크·업종 비어 있는 리드 포함, 재시도 주기 변경). 처리량은 크론의 `p_limit`(기본 30)과 일일 호출 한도가 그대로 막는다. 호출량 변화는 다음 크론 뒤 `lead_enrichment_events`로 확인.
- 되돌리기: `docs/sql-drafts/20261114-CC-46-enrichment-targets.down.sql`(task-p 정의로 복원).
