# CX-71 / S-3a DB 승인 대기

- 대상: `docs/sql-drafts/20261117-CX-71-store-profile-delivery.sql`
- 되돌리기: `docs/sql-drafts/20261117-CX-71-store-profile-delivery.down.sql`
- 격리 검증: PostgreSQL 17 PASS
- 운영 상태: 미적용
- 기능 상태: `STORE_PROFILE_DELIVERY` 기본 OFF

## 변경

- `store_profiles`: `tax_invoice_email`, `receive_method`, `access_password`, `access_password_updated_at`
- `store_profile_attachments`: 냉장·냉동·실온 보관 사진 경로, RLS ON, direct roles revoke
- `store_profile_delivery_requests`: 비밀번호를 저장하지 않는 멱등 요청 기록
- `update_store_profile_delivery_v1`: active owner만 수정, 일반 변경 알림 생성, 비밀번호 원문 비노출

운영 적용은 프로젝트와 실행 시각을 넣은 별도 `DB-APPROVED` 문구가 있어야 한다. 이 문서는 승인 자체가 아니다.
