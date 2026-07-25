# 직원 초대 저장소 적용 가이드

직원 추가 중 아래와 비슷한 오류가 나오면, 앱 코드는 준비되어 있지만 Supabase 실제 DB에 직원 초대용 테이블이 아직 적용되지 않은 상태입니다.

```txt
PGRST205 Could not find the table 'public.staff_invitations' in the schema cache
```

## 적용 순서

1. Supabase Studio 접속
2. 좌측 `SQL Editor` 클릭
3. `supabase/migrations/20260724_staff_kakao_mobile.sql` 파일 내용을 전체 복사
4. SQL Editor에 붙여넣기
5. `Run` 실행
6. 실행 결과가 `Success. No rows returned.`로 나오면 직원 추가 화면에서 다시 `직원 추가` 클릭

## 생성되는 테이블

- `public.staff_invitations`: 직원명, 연락처, 업무 구분, 초대 코드, 가입 상태 저장
- `public.staff_mobile_devices`: 카카오 가입 후 모바일 기기 접속 기록 저장

## 확인 SQL

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('staff_invitations', 'staff_mobile_devices');
```

두 테이블이 모두 보이면 DB 적용은 완료된 것입니다. 그래도 직원 추가가 되지 않으면 Vercel 환경변수의 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 지금 보고 있는 Supabase 프로젝트 값과 같은지 확인한 뒤 다시 배포하세요.
