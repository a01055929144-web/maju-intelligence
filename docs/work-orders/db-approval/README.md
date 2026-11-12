# 운영 DB 적용 기록 규칙

1. 적용 전: SQL 초안 + down + PG17 통과, 대표의 **명시 승인 문구**(`<프로젝트ID> <ID> <내용> SQL 승인`). "승인"·"다음 진행" 같은 말은 승인이 아니다.
2. 적용: 초안 SQL **한 트랜잭션 안에서** `admin_audit_logs`에 기록을 함께 남긴다. 따로 나중에 넣지 않는다(11/12 CC-24·CC-29a·CX-12가 사후 기록이 된 이유).

```sql
insert into public.admin_audit_logs(actor_user_id, company_id, action, target_type, target_id, metadata)
values (null, null, 'db_migration_applied', 'migration', null, jsonb_build_object(
  'by', 'claude-code', 'id', '<작업 ID>', 'migration_name', '<이름>',
  'approval', '<승인 문구 원문 그대로>', 'approval_time', '<승인 메시지 수신 시각 KST>',
  'applied_at', '<적용 시각 KST>', 'draft_commit', '<초안 최종 커밋>'));
```

   (actor·company는 구조 변경이라 비워 두는 것이 기존 기록의 형식. 특정 회사 데이터를 바꾸는 적용이면 `company_id`를 채운다.)
3. 적용 후: 읽기 검증 + 이 폴더의 해당 승인표에 승인 문구 원문·audit 기록 id 기록 → PR.
