# Supabase 직원 초대 테이블 적용 가이드

직원 추가 중 아래 오류가 나오면 Supabase 실제 DB에 직원 초대 테이블이 아직 생성되지 않은 상태입니다.

```txt
PGRST205 Could not find the table 'public.staff_invitations' in the schema cache
```

## 적용 순서

1. Supabase Studio 접속
2. 좌측 `SQL Editor` 클릭
3. `supabase/migrations/20260724_staff_kakao_mobile.sql` 파일 내용을 전체 복사
4. SQL Editor에 붙여넣기
5. `Run` 실행
6. 실행 후 직원 추가 화면에서 다시 `직원 추가` 클릭

## 생성되는 테이블

- `public.staff_invitations`: 직원 초대 코드, 역할, 상태, 가입 완료 여부 저장
- `public.staff_mobile_devices`: 카카오 가입 후 모바일 기기 접속 기록 저장

## 확인 SQL

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('staff_invitations', 'staff_mobile_devices');
```

두 테이블이 모두 보이면 직원 초대 기능을 사용할 수 있습니다.
